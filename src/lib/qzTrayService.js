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
        this._preflightChecking = false;
        this._preflightFailed = false;
        this._listeners = new Set();
        this._autoReconnectTimer = null;
        this._reconnectAttempts = 0;
        this._certFetchTimeoutMs = 8000;  // Cert/signing fetch timeout
        this._cooldownUntil = 0;           // Timestamp; connect() returns false before this
        this._setupSecurity();
        // Backend signs challenges with SHA-256 (see signQzTrayRequest/entry.ts).
        // QZ Tray defaults to SHA1 — must override to match or signature verification fails.
        qz.security.setSignatureAlgorithm('SHA512');
    }

    // ── Security (certificate + signature) ────────────────────────────────────

    _setupSecurity() {
        this._certCache = null;
        this._certCacheTime = 0;
        this._certTTL = 5 * 60 * 1000;

        // Callback-style promises (resolve/reject) — the classic QZ Tray API.
        // More compatible across QZ versions than async-function style.
        qz.security.setCertificatePromise((resolve, reject) => {
            console.log('[QZTray] Handshake: QZ requested certificate');
            this._getCertificate()
                .then((cert) => { console.log('[QZTray] Handshake: certificate resolved', cert?.substring(0, 40)); resolve(cert); })
                .catch((e) => { console.error('[QZTray] Handshake: certificate FAILED', e?.message || e); reject(e); });
        });

        qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
            console.log('[QZTray] Handshake: QZ sent signature challenge', toSign?.substring(0, 30));
            this._signChallenge(toSign)
                .then((sig) => { console.log('[QZTray] Handshake: signature resolved'); resolve(sig); })
                .catch((e) => { console.error('[QZTray] Handshake: signature FAILED', e?.message || e); reject(e); });
        });
    }

    async _getCertificate() {
        if (this._certCache && Date.now() - this._certCacheTime < this._certTTL) return this._certCache;
        try {
            const res = await base44.functions.invoke('signQzTrayRequest', { action: 'getCert' });
            if (!res?.data?.certificate) throw new Error('No certificate in response');
            let cert = res.data.certificate;
            // Safety net: ensure PEM format with clean base64 (no stray spaces)
            if (!cert.includes('-----BEGIN')) {
                const clean = cert.replace(/\s+/g, '');
                cert = `-----BEGIN CERTIFICATE-----\n${clean}\n-----END CERTIFICATE-----`;
            }
            this._certCache = cert;
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

        this._connecting = true;
        this._preflightChecking = false;
        this._preflightFailed = false;
        this._notifyStatus();
        this._lastError = null;

        // Pre-fetch the certificate BEFORE calling qz.websocket.connect().
        // This way: (1) the cert callback resolves instantly during the
        // handshake (no network latency), and (2) if the cert fetch fails
        // we can show a specific error immediately instead of a 20s timeout.
        try {
            console.log('[QZTray] Pre-fetching certificate before connect...');
            await this._getCertificate();
            console.log('[QZTray] Certificate pre-fetched OK, starting WebSocket...');
        } catch (e) {
            console.error('[QZTray] Certificate pre-fetch failed:', e?.message || e);
            this._lastError = `Cannot fetch signing certificate: ${e?.message || e}. Make sure you are logged in and the backend is reachable.`;
            this._connecting = false;
            this._notifyStatus();
            return false;
        }

        // DO NOT ADD A PRE-FLIGHT CHECK HERE.
        //
        // This has now been added and removed three times. Every version - a
        // fetch() to https://localhost:8181, a navigator.permissions query for
        // 'local-network-access' - blocks working setups, because a plain fetch
        // from an HTTPS page to a self-signed loopback endpoint fails for
        // reasons that have nothing to do with whether the WebSocket can open.
        // The failure is indistinguishable from a real outage, so the gate
        // reports a confident, wrong diagnosis and prevents the real attempt.
        //
        // The WebSocket connect below is the ONLY trustworthy signal. Diagnose
        // failures from its result, never before it.

        return this._attemptConnect(true, 20000);
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
                // Explicit host list: localhost first (self-signed cert accepted
                // via pre-flight), localhost.qz.io as fallback (public DNS →
                // 127.0.0.1, CA-signed cert on enterprise QZ Tray setups).
                // retries: 0 — let this service's own capped exponential backoff
                // handle reconnects with better backoff than the library's tight
                // retry loop. keepAlive: 60s keeps the socket warm.
                // DO NOT ADD host OR port OVERRIDES HERE.
                //
                // Passing `host: ['localhost']` silently drops qz-tray's default
                // second host, 'localhost.qz.io' - a public DNS name that
                // resolves to 127.0.0.1 but serves a genuinely CA-signed
                // certificate. On an HTTPS page that is the ONLY host that
                // reliably completes a wss:// TLS handshake, because a cert
                // exception clicked through in a browser tab is NOT honoured for
                // a WebSocket opened from a different origin. Overriding host
                // here produces exactly the observed symptom: TCP connects and
                // is immediately closed (TIME_WAIT sockets, no working link).
                //
                // Restricting `port` is likewise not worth it - failed ports are
                // refused almost instantly, not 5s each.
                //
                // This matches a known-working QZ Tray integration. Keep it minimal.
                // Host order and the single port are BOTH deliberate.
                //
                // 'localhost.qz.io' MUST be first. It is a public DNS name that
                // resolves to 127.0.0.1 but serves a genuinely CA-signed
                // certificate - on an HTTPS page it is the only host that
                // reliably completes the wss:// TLS handshake, because a cert
                // exception clicked through in a browser tab is NOT honoured for
                // a WebSocket opened from a different origin. Connecting to
                // plain 'localhost' completes TCP and is then dropped during TLS
                // (observed as TIME_WAIT sockets with no working link).
                //
                // Only port 8181 is tried. Measured behaviour: each dead port
                // takes ~5s to fail, not milliseconds - so scanning the library
                // default [8181, 8282, 8383, 8484] burned the entire watchdog
                // budget on 'localhost' and 'localhost.qz.io' was cut off
                // mid-handshake before it could ever succeed. QZ Tray binds 8181
                // by default; if a deployment ever needs another port, add it
                // here rather than restoring the full scan.
                // Host and port are pinned to what QZ Tray actually serves.
                //
                // QZ Tray's About page reports `socket domain: localhost` and
                // BOTH of its certificates are issued to CN=localhost. Connecting
                // via 'localhost.qz.io' therefore receives a certificate for the
                // wrong hostname and Chrome rejects the handshake - so that host
                // is deliberately NOT used here despite being a qz-tray default.
                //
                // For the wss:// handshake to succeed, QZ Tray's root CA (alias
                // 'root-ca', downloadable from QZ Tray's About page) must be
                // installed in the machine's Trusted Root Certification
                // Authorities store. A certificate exception clicked through in a
                // browser tab is NOT sufficient - it is not honoured for a
                // WebSocket opened from a different origin. Without the trusted
                // root, TCP connects and is then dropped during TLS (observed as
                // TIME_WAIT sockets with no working connection).
                //
                // Only port 8181 is tried: QZ Tray reports securePort 8181, and
                // each dead port costs ~5s, which previously exhausted the
                // watchdog before the real host was reached.
                connectPromise = qz.websocket.connect({
                    retries: 1,
                    delay: 1,
                    host: ['localhost'],
                    port: { secure: [8181], insecure: [] },
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
        this._preflightChecking = false;
        this._preflightFailed = false;
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
            preflightChecking: this._preflightChecking || false,
            preflightFailed: this._preflightFailed || false,
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
        const config = qz.configs.create(resolvedName, { encoding: 'UTF-8' });
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