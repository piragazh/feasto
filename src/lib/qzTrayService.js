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
     * Connect to QZ Tray.
     *
     * Strategy: try INSECURE (ws://localhost) first. Localhost is exempt from
     * mixed-content blocking on HTTPS pages (W3C "potentially trustworthy
     * origin"), and QZ Tray accepts ws:// connections by default — so this
     * bypasses the self-signed certificate entirely, no "Accept Cert" step
     * needed. Falls back to SECURE (wss://) only if insecure fails.
     */
    async connect() {
        if (this._connected || this._connecting) return this._connected;
        if (Date.now() < this._cooldownUntil) return false;

        this._connecting = true;
        this._notifyStatus();
        this._lastError = null;

        // Attempt 1: insecure (ws://) — fast, no cert needed
        const insecureOk = await this._attemptConnect(false, 6000);
        if (insecureOk) return true;
        if (this._connected) return true;

        // Attempt 2: secure (wss://) — needs cert acceptance on HTTPS
        const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
        if (!isHttps) {
            // Already tried insecure on HTTP — nothing else to try
            this._connecting = false;
            this._notifyStatus();
            return false;
        }
        // Re-set _connecting — the insecure watchdog may have cleared it
        this._connecting = true;
        this._notifyStatus();
        return this._attemptConnect(true, 12000);
    }

    /**
     * Single connection attempt with a hard watchdog.
     * Returns true on success, false on failure/timeout.
     * Does NOT manage _connecting (caller handles that) — but DOES set
     * _connected and _lastError.
     */
    _attemptConnect(usingSecure, timeoutMs) {
        return new Promise((resolve) => {
            let settled = false;

            const watchdogTimer = setTimeout(() => {
                if (settled) return;
                settled = true;
                console.warn(`[QZTray] Watchdog: ${usingSecure ? 'secure' : 'insecure'} connect timed out after ${timeoutMs / 1000}s`);
                if (usingSecure) {
                    this._lastError = 'Connection timed out. Click "Accept Cert" to trust the QZ Tray certificate, then Reconnect.';
                } else {
                    this._lastError = 'Connection timed out. Make sure QZ Tray is running on this computer.';
                }
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
                });
            } catch (syncErr) {
                if (settled) return;
                settled = true;
                clearTimeout(watchdogTimer);
                const msg = syncErr?.message || String(syncErr);
                console.warn(`[QZTray] ${usingSecure ? 'secure' : 'insecure'} connect threw:`, msg);
                // Don't set _lastError here — let the fallback attempt try.
                // Only set it if this is the final attempt.
                if (usingSecure) {
                    this._lastError = msg;
                    this._connecting = false;
                    this._notifyStatus();
                }
                if (usingSecure && !/has not returned yet/i.test(msg)) {
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
                console.log(`[QZTray] Connected (${usingSecure ? 'secure' : 'insecure'})`);
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
                console.warn(`[QZTray] ${usingSecure ? 'secure' : 'insecure'} connect failed:`, msg);
                if (usingSecure) {
                    this._lastError = msg;
                    this._connecting = false;
                    this._notifyStatus();
                    if (!/has not returned yet/i.test(msg)) {
                        this._scheduleReconnect();
                    }
                }
                // For insecure failure, don't set _lastError — the secure
                // fallback will set it if it also fails.
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
        const attempt = async () => {
            this._autoReconnectTimer = null;
            if (this._connected || this._connecting) return;
            // Skip if in cooldown phase
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
        this._cooldownUntil = 0;
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