/**
 * QZ Tray Service — manages the WebSocket connection to QZ Tray running
 * locally on the POS machine (localhost:8181).
 *
 * QZ Tray lets the browser send raw ESC/POS bytes directly to local
 * thermal printers and open cash drawers — bypassing the cloud backend
 * which cannot reach LAN printer IPs.
 *
 * Usage:
 *   import qzTrayService from '@/lib/qzTrayService';
 *   await qzTrayService.connect();
 *   await qzTrayService.print('EPSON_TM_T20III', receiptBytes);
 *   await qzTrayService.openCashDrawer('EPSON_TM_T20III');
 */

import qz from 'qz-tray';
import { buildReceiptBytes, buildTestBytes, buildCashDrawerBytes } from '@/lib/escpos';

class QZTrayService {
    constructor() {
        this._connected = false;
        this._connecting = false;
        this._statusCallback = null;
        this._autoReconnectTimer = null;
        this._setupSecurity();
    }

    /**
     * Configure QZ Tray certificate/signature handling for a trusted local environment.
     * QZ Tray provides its own self-signed cert via its built-in HTTP server.
     */
    _setupSecurity() {
        try {
            // Fetch the certificate from QZ Tray's built-in HTTP server
            qz.security.setCertificatePromise((resolve, reject) => {
                fetch('https://localhost:8181/cert.pem')
                    .then(r => r.text())
                    .then(resolve)
                    .catch(reject);
            });
            // No signing required — local trusted environment
            qz.security.setSignaturePromise((toSign, resolve) => {
                resolve();
            });
        } catch (e) {
            console.warn('[QZTray] Security setup failed:', e.message);
        }
    }

    /**
     * Connect to QZ Tray. Safe to call multiple times — returns immediately
     * if already connected.
     */
    async connect() {
        if (this._connected || this._connecting) return this._connected;
        this._connecting = true;
        this._notifyStatus();
        try {
            await qz.websocket.connect({ retries: 2, delay: 1 });
            this._connected = true;
            this._notifyStatus();
            // Listen for QZ Tray closing/restarting
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
            console.warn('[QZTray] Failed to connect:', e?.message || e);
            this._connected = false;
            this._notifyStatus();
            this._scheduleReconnect();
        } finally {
            this._connecting = false;
        }
        return this._connected;
    }

    /**
     * Called when QZ Tray disconnects — schedule an auto-reconnect.
     */
    _handleDisconnect() {
        this._connected = false;
        this._notifyStatus();
        this._scheduleReconnect();
    }

    _scheduleReconnect() {
        if (this._autoReconnectTimer) return;
        this._autoReconnectTimer = setInterval(async () => {
            if (!this._connected && !this._connecting) {
                const ok = await this.connect();
                if (ok) {
                    clearInterval(this._autoReconnectTimer);
                    this._autoReconnectTimer = null;
                }
            }
        }, 10000);
    }

    disconnect() {
        if (this._autoReconnectTimer) {
            clearInterval(this._autoReconnectTimer);
            this._autoReconnectTimer = null;
        }
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
        };
    }

    setConnectionStatusCallback(callback) {
        this._statusCallback = callback;
    }

    _notifyStatus() {
        if (this._statusCallback) this._statusCallback(this.getStatus());
    }

    /**
     * Find all available printers known to QZ Tray.
     * @returns {Promise<string[]>} Printer names
     */
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

    /**
     * Find a specific printer by name (fuzzy match supported).
     * @param {string} name - Printer name or partial name
     * @returns {Promise<string|null>} Exact printer name if found
     */
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

    /**
     * Send raw ESC/POS bytes to a printer.
     * @param {string} printerName - Target printer name
     * @param {Uint8Array} escposBytes - Raw ESC/POS command bytes
     */
    async print(printerName, escposBytes) {
        if (!this.isConnected()) await this.connect();
        if (!this.isConnected()) throw new Error('QZ Tray is not connected. Make sure QZ Tray is running on this computer.');

        const resolvedName = await this.findPrinter(printerName) || printerName;
        const config = qz.configs.create(resolvedName);
        // QZ Tray accepts base64-flavored raw commands
        let binary = '';
        for (let i = 0; i < escposBytes.length; i++) binary += String.fromCharCode(escposBytes[i]);
        const base64 = btoa(binary);
        await qz.print(config, [
            { type: 'raw', format: 'command', flavor: 'base64', data: base64 }
        ]);
        return true;
    }

    /**
     * Print a receipt using existing ESC/POS byte generation.
     * @param {string} printerName
     * @param {object} order
     * @param {object} restaurant
     * @param {object} config - Receipt config
     * @param {boolean} openCashDrawer - Open drawer after printing
     */
    async printReceipt(printerName, order, restaurant, config, openCashDrawer = false) {
        const bytes = buildReceiptBytes(order, restaurant, config, openCashDrawer);
        return this.print(printerName, bytes);
    }

    /**
     * Print a test receipt.
     * @param {string} printerName
     * @param {string} commandSet
     */
    async printTest(printerName, commandSet = 'esc_pos') {
        const bytes = buildTestBytes(printerName, commandSet);
        return this.print(printerName, bytes);
    }

    /**
     * Open the cash drawer connected to a printer's DK port.
     * Sends the ESC p command via QZ Tray to the specified printer.
     * @param {string} printerName
     */
    async openCashDrawer(printerName) {
        const bytes = buildCashDrawerBytes();
        return this.print(printerName, bytes);
    }
}

const qzTrayService = new QZTrayService();

export default qzTrayService;