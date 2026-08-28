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
    async connect() {
        if (this._connected || this._connecting) return this._connected;
        if (Date.now() < this._cooldownUntil) return false;

        // Fail fast with an accurate message if Chrome reports LNA as
        // explicitly denied for this origin — no point burning the full
        // connect watchdog on a request the browser will reject outright.
        // Permissions API support for 'local-network-access' is new and not
        // universal, so any unsupported/unknown result falls through to a
        // real connect attempt rather than blocking on it.
        const lnaDenied = await this._isLocalNetworkAccessDenied();
        if (lnaDenied) {
            this._lastError = 'Blocked by Chrome\'s Local Network Access permission for this site. Click the site info icon next to the address bar → Site settings → Permissions → set "Local Network Access" to Allow, then reload this page and Reconnect.';
            this._cooldownUntil = Date.now() + 2000;
            this._notifyStatus();
            return false;
        }

        this._connecting = true;
        this._notifyStatus();
        this._lastError = null;

        return this._attemptConnect(true, 15000);
    }

    /**
     * Checks Chrome's Permissions API for the 'local-network-access'
     * permission, if the browser supports querying it. Returns true only
     * when the browser explicitly reports it as denied for this origin;
     * returns false (i.e. "not known to be denied") if the permission name
     * is unsupported, the query throws, or the state is 'granted'/'prompt'.
     */
    async _isLocalNetworkAccessDenied() {
        try {
            if (!navigator?.permissions?.query) return false;
            const status = await navigator.permissions.query({ name: 'local-network-access' });
            return status.state === 'denied';
        } catch (e) {
            // Permission name not recognized by this browser, or query failed —
            // treat as unknown rather than denied.
            return false;
        }
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
                this._lastError = 'Connection timed out. Make sure QZ Tray is running, then accept its certificate by visiting https://localhost:8181 in a new tab.';
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
                    host: ['localhost', '127.0.0.1'],
                    port: { secure: [8181], insecure: [], portIndex: 0 },
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
                console.log('[QZTray] Connected successfully');
                this._connecting = false;
                this._lastError = null;
                this._notifyStatus();

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
                resolve(true);
            }).catch((e) => {
                if (settled) return;
                settled = true;
                clearTimeout(watchdogTimer);
                const msg = e?.message || String(e);
                console.warn('[QZTray] Connect failed:', msg);
                this._lastError = msg;
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
        return this._connected && qz.websocket.isConnected();
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