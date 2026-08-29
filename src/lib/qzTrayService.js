/**
 * QZ Tray Service — manages the WebSocket connection to QZ Tray running
 * locally on the POS machine (localhost:8181).
 *
 * QZ Tray lets the browser send raw ESC/POS bytes directly to local
 * thermal printers and open cash drawers — bypassing the cloud backend
 * which cannot reach LAN printer IPs.
 */

import qz from 'qz-tray';
import { base44 } from '@/api/base44Client';
import { buildReceiptBytes, buildTestBytes, buildCashDrawerBytes } from '@/lib/escpos';

/** Promise wrapper with a timeout — rejects if not resolved within ms. */
function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class QZTrayService {
    constructor() {
        this._connected = false;
        this._connecting = false;
        this._listeners = new Set();
        this._autoReconnectTimer = null;
        this._reconnectAttempts = 0;
        this._certFetchTimeoutMs = 8000;  // Cert/signing fetch timeout
        this._cooldownUntil = 0;           // Timestamp; connect() returns false before this
        this._setupSecurity();
        // Backend signs challenges with SHA-256 (see signQzTrayRequest/entry.ts).
        // QZ Tray defaults to SHA1 — must override to match or signature verification fails.
        qz.security.setSignatureAlgorithm('SHA256');
    }

    // ── Security (certificate + signature) ────────────────────────────────────

    _setupSecurity() {
        this._certCache = null;
        this._certCacheTime = 0;
        this._certTTL = 5 * 60 * 1000; // 5 minutes — handles cert rotation

        // CRITICAL: These MUST be `async` functions, not regular arrow functions
        // that return Promises. QZ Tray 2.2.6 detects AsyncFunction via
        // .constructor.name === "AsyncFunction" and calls the factory directly.
        // Regular functions get wrapped in new Promise(fn) which never resolves,
        // causing the handshake to hang → connection timeout.
        qz.security.setCertificatePromise(async () => {
            // Invalidate stale cache
            if (this._certCache && Date.now() - this._certCacheTime > this._certTTL) {
                this._certCache = null;
            }
            return withTimeout(this._getCertificate(), this._certFetchTimeoutMs, 'QZ Tray certificate fetch');
        });

        qz.security.setSignaturePromise(async (toSign) => {
            try {
                return await withTimeout(
                    this._signChallenge(toSign),
                    this._certFetchTimeoutMs,
                    'QZ Tray signature'
                );
            } catch (e) {
                // If signing fails, return empty string so QZ falls back to
                // prompt mode cleanly — resolving with undefined can hang QZ.
                console.warn('[QZTray] Signing failed, using prompt mode:', e?.message || e);
                return '';
            }
        });
    }

    async _getCertificate() {
        if (this._certCache && Date.now() - this._certCacheTime < this._certTTL) return this._certCache;
        try {
            const res = await base44.functions.invoke('signQzTrayRequest', { action: 'getCert' });
            if (!res?.data?.certificate) throw new Error('No certificate in response');
            this._certCache = res.data.certificate;
            this._certCacheTime = Date.now();
            console.log('[QZTray] Certificate obtained from backend');
            return this._certCache;
        } catch (e) {
            console.warn('[QZTray] Backend cert fetch failed, trying local cert:', e?.message || e);
            // Fallback: QZ Tray's own self-signed cert via direct HTTP fetch.
            // Use AbortController so this doesn't hang if the browser blocks
            // the self-signed cert (common on HTTPS pages).
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            try {
                const r = await fetch('https://localhost:8181/cert.pem', { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const cert = await r.text();
                console.log('[QZTray] Certificate obtained from local QZ Tray');
                return cert;
            } catch (fetchErr) {
                clearTimeout(timeoutId);
                console.error('[QZTray] Local cert fetch also failed:', fetchErr?.message || fetchErr);
                throw new Error('Could not obtain QZ Tray certificate. Ensure QZ Tray is running.');
            }
        }
    }

    async _signChallenge(toSign) {
        const res = await base44.functions.invoke('signQzTrayRequest', { action: 'sign', toSign });
        if (!res?.data?.signature) throw new Error('No signature in response');
        return res.data.signature;
    }

    // ── Connection ────────────────────────────────────────────────────────────

    /**
     * Connect to QZ Tray using SECURE wss://localhost.
     *
     * Two separate browser gates must both be satisfied for this on a
     * non-localhost (public/custom-domain) page:
     *  1. Chrome's Local Network Access (LNA) permission — a real, explicit
     *     per-origin permission prompt ("[site] wants to look for and
     *     connect to any device on your local network"), required since
     *     Chrome 142 (~Oct 2025) whenever a public origin reaches a
     *     loopback/local address. If missed/blocked, every request —
     *     fetch AND WebSocket alike — fails immediately with a CORS-style
     *     "Permission was denied for this request to access the loopback
     *     address space" error, indistinguishable in JS from QZ Tray being
     *     offline. Each distinct origin (including preview subdomains)
     *     needs its own separate grant via the site's Local Network Access
     *     permission (site info icon → Site settings → Permissions).
     *  2. QZ Tray's self-signed TLS certificate, accepted once by visiting
     *     https://localhost:8181 directly.
     * A single connect attempt avoids the qz-tray library's stuck
     * inProgress flag.
     */
    async connect(opts = {}) {
        const manual = !!opts.manual;
        if (this._connected || this._connecting) return this._connected;
        // A manual attempt ignores the post-failure cooldown and resets the
        // auto-reconnect budget - otherwise clicking Reconnect within the
        // cooldown window returns false silently and the button looks dead.
        if (!manual && Date.now() < this._cooldownUntil) return false;
        if (manual) {
            this._cooldownUntil = 0;
            this._reconnectAttempts = 0;
        }

        // NOTE: we deliberately do NOT gate the connection on any pre-check.
        // Two previous attempts to "fail fast" here (a preflight fetch to
        // https://localhost:8181, then a navigator.permissions query for
        // 'local-network-access') both produced false negatives and blocked
        // working setups from ever reaching QZ Tray. Browser probes of local
        // resources are unreliable and their semantics differ between Chrome
        // versions. The real WebSocket connect is the only trustworthy signal,
        // so always attempt it; diagnostics are used only to explain a failure
        // after the fact, never to prevent the attempt.
        this._connecting = true;
        this._notifyStatus();
        this._lastError = null;

        return this._attemptConnect(true, 25000);
    }

    /**
     * Single connection attempt with a hard watchdog.
     * Returns true on success, false on failure/timeout.
     */
    _attemptConnect(usingSecure, timeoutMs) {
        return new Promise((resolve) => {
            let settled = false;

            const watchdogTimer = setTimeout(() => {
                if (settled) return;
                settled = true;
                console.warn(`[QZTray] Watchdog: connect timed out after ${timeoutMs / 1000}s`);
                this._lastError = 'Connection timed out. Make sure QZ Tray is running on this computer, that you\'ve accepted its certificate at https://localhost:8181, and that this site has "Local Network Access" allowed (site info icon → Site settings → Permissions).';
                this._connecting = false;
                this._notifyStatus();

                // Fire disconnect with a 3s timeout — never await directly.
                Promise.race([
                    Promise.resolve().then(() => { try { return qz.websocket.disconnect(); } catch {} }),
                    new Promise((r) => setTimeout(r, 3000)),
                ]).catch(() => {});

                this._cooldownUntil = Date.now() + 2000;
                resolve(false);
            }, timeoutMs);

            let connectPromise;
            try {
                connectPromise = qz.websocket.connect({
                    retries: 0,
                    delay: 0,
                    usingSecure,
                    // Try 'localhost' then the explicit IPv4 loopback. On some
                    // dual-stack systems (notably Windows) the browser resolves
                    // 'localhost' to the IPv6 loopback (::1) first; QZ Tray only
                    // binds to IPv4 127.0.0.1, so that first attempt is refused
                    // immediately even though QZ Tray is running fine. Falling
                    // back to 127.0.0.1 catches that case. usingSurf stays off
                    // to avoid slow multi-port/qz.surf scanning.
                    usingSurf: false,
                    // 'localhost.qz.io' MUST stay first. It is a public DNS name
                    // that resolves to 127.0.0.1 but serves a real, publicly
                    // trusted TLS certificate - which is the only way an HTTPS
                    // page can open a wss:// socket to local QZ Tray without
                    // hitting self-signed certificate rejection. Chrome will
                    // complete the TCP connection to 'localhost' and then drop it
                    // during the TLS handshake (visible as TIME_WAIT sockets with
                    // no working connection), because a certificate exception
                    // accepted for a browser tab is not honoured for a WebSocket
                    // from a different origin. An earlier version of this file
                    // hardcoded only ['localhost'], removing qz-tray's own
                    // default and breaking every HTTPS deployment.
                    host: ['localhost.qz.io', 'localhost', '127.0.0.1'],
                    // Try ALL of QZ Tray's default secure ports, not just 8181.
                    // QZ Tray binds 8181 by default but falls back to 8282/8383/
                    // 8484 when that port is already taken by another app - a
                    // previous version of this file hardcoded [8181] to avoid
                    // slow port scanning, which silently broke every machine
                    // where something else held 8181.
                    // Insecure (ws://) ports are intentionally omitted: this page
                    // is served over HTTPS, so the browser blocks ws:// as mixed
                    // content and trying them only wastes watchdog time.
                    port: { secure: [8181, 8282, 8383, 8484], insecure: [], portIndex: 0 },
                });
            } catch (syncErr) {
                if (settled) return;
                settled = true;
                clearTimeout(watchdogTimer);
                const msg = syncErr?.message || String(syncErr);
                console.warn('[QZTray] Connect threw:', msg);
                this._lastError = msg;
                this._connecting = false;
                this._notifyStatus();
                if (!/has not returned yet/i.test(msg)) {
                    this._scheduleReconnect();
                }
                resolve(false);
                return;
            }

            connectPromise.then(() => {
                if (settled) return;
                settled = true;
                clearTimeout(watchdogTimer);
                this._connected = true;
                this._reconnectAttempts = 0;
                this._connecting = false;
                this._lastError = null;
                console.log('[QZTray] Connected successfully');

                // Resolve BEFORE any callback work. Listener callbacks and the
                // qz error-callback registration are third-party/consumer code;
                // if any of them throws, the exception would otherwise land in
                // the .catch() below, which returns early because `settled` is
                // already true — leaving this promise permanently unresolved
                // even though the connection is live. Resolving first makes a
                // successful connect impossible to lose.
                resolve(true);

                try {
                    qz.websocket.setErrorCallbacks(
                        (err) => {
                            console.warn('[QZTray] Connection error:', err?.message || err);
                            this._handleDisconnect();
                        },
                        () => {
                            console.log('[QZTray] Connection closed');
                            this._handleDisconnect();
                        }
                    );
                } catch (e) {
                    console.warn('[QZTray] Could not register error callbacks:', e?.message || e);
                }

                try {
                    this._notifyStatus();
                } catch (e) {
                    console.warn('[QZTray] Status listener threw:', e?.message || e);
                }
            }).catch((e) => {
                if (settled) return;
                settled = true;
                clearTimeout(watchdogTimer);
                const msg = e?.message || String(e);
                console.warn('[QZTray] Connect failed:', msg);
                // qz-tray's own error text (e.g. "Unable to establish connection
                // with QZ Tray") gives no detail on *why* the socket never
                // opened — it's identical whether QZ Tray is offline, the cert
                // isn't trusted, or Chrome's Local Network Access permission is
                // blocking the request outright. Append the LNA hint so staff
                // aren't stuck guessing (the browser doesn't expose the real
                // reason to JS — see console for the actual network error).
                this._lastError = /unable to establish connection/i.test(msg)
                    ? `${msg}. Check, in order: (1) QZ Tray is running on THIS computer - its icon should be in the system tray; (2) open https://localhost.qz.io:8181 in a new tab and accept any warning; (3) if you use an ad-blocker or security extension, try an Incognito window, as some block connections to local addresses.`
                    : msg;
                this._connecting = false;
                this._notifyStatus();
                if (!/has not returned yet/i.test(msg)) {
                    this._scheduleReconnect();
                }
                resolve(false);
            });
        });
    }

    _handleDisconnect() {
        this._connected = false;
        this._notifyStatus();
        this._scheduleReconnect();
    }

    _scheduleReconnect() {
        if (this._autoReconnectTimer) return;
        // Stop after 5 failed attempts — user can manually Reconnect.
        if (this._reconnectAttempts >= 5) {
            console.log('[QZTray] Max reconnect attempts reached. Use Reconnect button to retry.');
            return;
        }
        const attempt = async () => {
            this._autoReconnectTimer = null;
            if (this._connected || this._connecting) return;
            if (Date.now() < this._cooldownUntil) {
                this._reconnectAttempts++;
                const interval = Math.min(10000 * Math.pow(1.5, this._reconnectAttempts), 60000);
                this._autoReconnectTimer = setTimeout(attempt, interval);
                return;
            }
            const ok = await this.connect();
            if (ok) {
                this._reconnectAttempts = 0;
                return;
            }
            this._reconnectAttempts++;
            const interval = Math.min(10000 * Math.pow(1.5, this._reconnectAttempts), 60000);
            this._autoReconnectTimer = setTimeout(attempt, interval);
        };
        const interval = Math.min(10000 * Math.pow(1.5, this._reconnectAttempts), 60000);
        this._autoReconnectTimer = setTimeout(attempt, interval);
    }

    disconnect() {
        if (this._autoReconnectTimer) {
            clearTimeout(this._autoReconnectTimer);
            this._autoReconnectTimer = null;
        }
        this._reconnectAttempts = 0;
        this._cooldownUntil = 0;
        this._lastError = null;
        try { qz.websocket.disconnect(); } catch {}
        this._connected = false;
        this._notifyStatus();
    }

    isConnected() {
        // NOTE: the qz-tray API method is isActive() — there is no isConnected().
        // Calling the non-existent name threw a TypeError the moment _connected
        // became true (the `this._connected &&` short-circuit hid it while
        // disconnected), which blew up inside _notifyStatus() in the connect
        // success handler and left the connect promise permanently unresolved.
        // Guard defensively so a future API change degrades instead of throwing.
        try {
            return this._connected && qz.websocket.isActive();
        } catch (e) {
            console.warn('[QZTray] isActive() check failed:', e?.message || e);
            return this._connected;
        }
    }

    getStatus() {
        return {
            connected: this.isConnected(),
            connecting: this._connecting,
            lastError: this._lastError || null,
        };
    }

    subscribe(callback) {
        this._listeners.add(callback);
        callback(this.getStatus());
        return () => { this._listeners.delete(callback); };
    }

    /** Legacy shim — prefer subscribe(). */
    setConnectionStatusCallback(callback) {
        if (!callback) return () => {};
        return this.subscribe(callback);
    }

    _notifyStatus() {
        const status = this.getStatus();
        this._listeners.forEach((cb) => cb(status));
    }

    // ── Printing ──────────────────────────────────────────────────────────────

    async findPrinters() {
        if (!this.isConnected()) await this.connect();
        if (!this.isConnected()) return [];
        try {
            const printers = await qz.printers.find();
            return Array.isArray(printers) ? printers : [];
        } catch (e) {
            console.warn('[QZTray] findPrinters failed:', e?.message || e);
            return [];
        }
    }

    async findPrinter(name) {
        if (!name) return null;
        if (!this.isConnected()) await this.connect();
        if (!this.isConnected()) return null;
        try {
            const found = await qz.printers.find(name);
            return found || null;
        } catch (e) {
            console.warn('[QZTray] findPrinter failed:', e?.message || e);
            return null;
        }
    }

    async print(printerName, escposBytes) {
        if (!this.isConnected()) await this.connect();
        if (!this.isConnected()) throw new Error('QZ Tray is not connected. Make sure QZ Tray is running on this computer.');

        const resolvedName = await this.findPrinter(printerName) || printerName;
        const config = qz.configs.create(resolvedName);
        let binary = '';
        for (let i = 0; i < escposBytes.length; i++) binary += String.fromCharCode(escposBytes[i]);
        const base64 = btoa(binary);
        // 20s timeout — prevents POS freeze if printer is offline/out of paper
        await withTimeout(
            qz.print(config, [
                { type: 'raw', format: 'command', flavor: 'base64', data: base64 }
            ]),
            20000,
            'QZ Tray print'
        );
        return true;
    }

    async printReceipt(printerName, order, restaurant, config, openCashDrawer = false) {
        const bytes = buildReceiptBytes(order, restaurant, config, openCashDrawer);
        return this.print(printerName, bytes);
    }

    async printTest(printerName, commandSet = 'esc_pos', printerWidth = '80mm') {
        const bytes = buildTestBytes(printerName, commandSet, printerWidth);
        return this.print(printerName, bytes);
    }

    async openCashDrawer(printerName) {
        const bytes = buildCashDrawerBytes();
        return this.print(printerName, bytes);
    }
}

const qzTrayService = new QZTrayService();

export default qzTrayService;