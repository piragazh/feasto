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
        this._connectTimeoutMs = 15000;  // Overall connection timeout
        this._certFetchTimeoutMs = 8000;  // Cert/signing fetch timeout
        this._setupSecurity();
    }

    // ── Security (certificate + signature) ────────────────────────────────────

    _setupSecurity() {
        this._certCache = null;

        qz.security.setCertificatePromise(() => {
            return withTimeout(this._getCertificate(), this._certFetchTimeoutMs, 'QZ Tray certificate fetch');
        });

        qz.security.setSignaturePromise((toSign) => {
            return withTimeout(
                this._signChallenge(toSign),
                this._certFetchTimeoutMs,
                'QZ Tray signature'
            ).catch((e) => {
                // If signing fails, return empty string so QZ falls back to
                // prompt mode cleanly — resolving with undefined can hang QZ.
                console.warn('[QZTray] Signing failed, using prompt mode:', e?.message || e);
                return '';
            });
        });
    }

    async _getCertificate() {
        if (this._certCache) return this._certCache;
        try {
            const res = await base44.functions.invoke('signQzTrayRequest', { action: 'getCert' });
            if (!res?.data?.certificate) throw new Error('No certificate in response');
            this._certCache = res.data.certificate;
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
     * Quick probe — opens a raw WebSocket to QZ Tray and closes immediately.
     * Resolves true if QZ Tray is reachable, false if not. Fails within 5s.
     * This avoids the qz-tray library's connect() hanging forever when the
     * browser blocks the self-signed cert on HTTPS pages.
     */
    _probeQzTray() {
        const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
        const url = isHttps ? 'wss://localhost:8181' : 'ws://localhost:8181';
        return new Promise((resolve) => {
            let settled = false;
            let ws;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                try { ws?.close(); } catch {}
                resolve(false);
            }, 5000);
            try {
                ws = new WebSocket(url);
                ws.onopen = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    try { ws.close(); } catch {}
                    resolve(true);
                };
                ws.onerror = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(false);
                };
            } catch {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    resolve(false);
                }
            }
        });
    }

    /**
     * Connect to QZ Tray. Probes first (raw WebSocket, fails fast), then
     * uses the qz-tray library for the real authenticated connection.
     */
    async connect() {
        if (this._connected || this._connecting) return this._connected;
        this._connecting = true;
        this._notifyStatus();
        this._lastError = null;

        // Step 1: Quick probe — is QZ Tray reachable at all?
        console.log('[QZTray] Probing localhost:8181…');
        const reachable = await this._probeQzTray();

        if (!reachable) {
            const isHttps = window.location?.protocol === 'https:';
            this._lastError = isHttps
                ? 'Cannot reach QZ Tray. Click "Accept Cert" below to trust the certificate, then Reconnect.'
                : 'QZ Tray is not running or unreachable on localhost:8181.';
            console.warn('[QZTray] Probe failed:', this._lastError);
            this._connecting = false;
            this._notifyStatus();
            this._scheduleReconnect();
            return false;
        }

        console.log('[QZTray] Probe succeeded, connecting via library…');

        // Step 2: Connect via the qz-tray library
        try {
            await qz.websocket.connect({
                retries: 0,
                delay: 0,
                usingSecure: typeof window !== 'undefined' && window.location?.protocol === 'https:',
            });
            this._connected = true;
            this._reconnectAttempts = 0;
            console.log('[QZTray] Connected successfully');
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
        } catch (e) {
            const msg = e?.message || String(e);
            console.warn('[QZTray] Library connect failed:', msg);
            this._lastError = msg;
            this._connected = false;
            this._connecting = false;
            this._notifyStatus();
            this._scheduleReconnect();
            return false;
        }

        this._connecting = false;
        return this._connected;
    }

    _handleDisconnect() {
        this._connected = false;
        this._notifyStatus();
        this._scheduleReconnect();
    }

    _scheduleReconnect() {
        if (this._autoReconnectTimer) return;
        const attempt = async () => {
            this._autoReconnectTimer = null;
            if (this._connected || this._connecting) return;
            const ok = await this.connect();
            if (ok) {
                this._reconnectAttempts = 0;
                return;
            }
            this._reconnectAttempts++;
            // Exponential backoff: 10s → 15s → 22s … capped at 60s
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
        await qz.print(config, [
            { type: 'raw', format: 'command', flavor: 'base64', data: base64 }
        ]);
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