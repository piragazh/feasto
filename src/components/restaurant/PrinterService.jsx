// Bluetooth Thermal Printer Service
// Supports dual printers (A/B), heartbeat monitoring, auto-reconnect

const ESC = '\x1B';
const GS = '\x1D';

export class PrinterService {
    constructor(storageKey = 'printerInfo') {
        this.storageKey = storageKey;
        this.device = null;
        this.characteristic = null;
        this.commandSet = 'esc_pos';
        this.printerInfo = null;
        this.lastConnectionTime = null;
        this.connectionStatusCallback = null;
        this._onDisconnect = null;
        this.autoReconnect = true;
        this._reconnecting = false;
        this._heartbeatInterval = null;

        this.PRINTER_SERVICES = [
            '000018f0-0000-1000-8000-00805f9b34fb',
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
            '49535343-fe7d-4ae5-8fa9-9fafd205e455',
            '0000fff0-0000-1000-8000-00805f9b34fb',
            '0000ffe0-0000-1000-8000-00805f9b34fb',
            '00001101-0000-1000-8000-00805f9b34fb'
        ];
    }

    // ── Heartbeat ─────────────────────────────────────────────────────────
    startHeartbeat(intervalMs = 8000) {
        this.stopHeartbeat();
        this._heartbeatInterval = setInterval(() => {
            const connected = !!(this.device?.gatt?.connected && this.characteristic);
            this.notifyConnectionStatus(connected);
            if (!connected && this.autoReconnect && this.printerInfo?.id && !this._reconnecting) {
                this._attemptSilentReconnect();
            }
        }, intervalMs);
    }

    stopHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
    }

    // ── Silent reconnect (no user gesture required) ───────────────────────
    async _attemptSilentReconnect() {
        if (this._reconnecting || this.isConnected() || !this.printerInfo?.id) return;
        this._reconnecting = true;
        try {
            await this.connect(this.printerInfo, true);
            this.notifyConnectionStatus(true);
        } catch {
            // Will retry on next heartbeat
        } finally {
            this._reconnecting = false;
        }
    }

    // ── Command sets ──────────────────────────────────────────────────────
    setCommandSet(commandSet) {
        this.commandSet = commandSet || 'esc_pos';
    }

    getCommands() {
        const sets = {
            esc_pos: {
                init: `${ESC}@`,
                alignCenter: `${ESC}a\x01`,
                alignLeft: `${ESC}a\x00`,
                boldOn: `${ESC}E\x01`,
                boldOff: `${ESC}E\x00`,
                cut: `${GS}V\x41\x00`,
                doubleHeight: `${ESC}!\x10`,
                normal: `${ESC}!\x00`
            },
            esc_pos_star: {
                init: `${ESC}@`,
                alignCenter: `${ESC}a\x01`,
                alignLeft: `${ESC}a\x00`,
                boldOn: `${ESC}E`,
                boldOff: `${ESC}F`,
                cut: `${ESC}d\x03`,
                doubleHeight: `${ESC}!\x10`,
                normal: `${ESC}!\x00`
            },
            esc_bixolon: {
                init: `${ESC}@`,
                alignCenter: `${ESC}a\x01`,
                alignLeft: `${ESC}a\x00`,
                boldOn: `${ESC}E\x01`,
                boldOff: `${ESC}E\x00`,
                cut: `${GS}V\x00`,
                doubleHeight: `${GS}!\x11`,
                normal: `${GS}!\x00`
            },
            epson_tm: {
                init: `${ESC}@`,
                alignCenter: `${ESC}a\x01`,
                alignLeft: `${ESC}a\x00`,
                boldOn: `${ESC}E\x01`,
                boldOff: `${ESC}E\x00`,
                cut: `${GS}V\x41\x03`,
                doubleHeight: `${ESC}!\x30`,
                normal: `${ESC}!\x00`
            }
        };
        return sets[this.commandSet] || sets.esc_pos;
    }

    // ── Connection ────────────────────────────────────────────────────────
    async connectDevice(device) {
        if (!device) throw new Error('No device provided');
        this.printerInfo = { id: device.id, name: device.name };
        this.device = device;
        await this._connectGatt();
        this._saveToStorage();
        this.notifyConnectionStatus(true);
        this.startHeartbeat();
        return true;
    }

    async connect(printerInfo, silent = false) {
        try {
            if (!printerInfo?.id) throw new Error('No printer configured.');
            if (!navigator.bluetooth) throw new Error('Web Bluetooth not supported. Use Chrome, Edge, or Opera.');

            this.printerInfo = printerInfo;

            let device = null;
            if (navigator.bluetooth.getDevices) {
                try {
                    const devices = await navigator.bluetooth.getDevices();
                    device = devices.find(d => d.id === printerInfo.id);
                } catch (e) {
                    if (!silent) console.warn('getDevices not available:', e.message);
                }
            }

            if (!device) throw new Error('Printer not found in paired devices. Use "Scan for Printers" to reconnect.');

            this.device = device;
            await this._connectGatt();
            this._saveToStorage();
            this.notifyConnectionStatus(true);
            this.startHeartbeat();
            return true;
        } catch (error) {
            if (!silent) console.error('Printer connection failed:', error);
            throw new Error(error.message || 'Printer connection failed');
        }
    }

    async _connectGatt() {
        const server = await this.device.gatt.connect();
        let characteristicFound = null;

        try {
            const services = await server.getPrimaryServices();

            for (const serviceUUID of this.PRINTER_SERVICES) {
                try {
                    const service = await server.getPrimaryService(serviceUUID);
                    const characteristics = await service.getCharacteristics();
                    for (const char of characteristics) {
                        if (char.properties.write || char.properties.writeWithoutResponse) {
                            characteristicFound = char;
                            break;
                        }
                    }
                    if (characteristicFound) break;
                } catch {}
            }

            if (!characteristicFound) {
                for (const service of services) {
                    try {
                        const characteristics = await service.getCharacteristics();
                        for (const char of characteristics) {
                            if (char.properties.write || char.properties.writeWithoutResponse) {
                                characteristicFound = char;
                                break;
                            }
                        }
                        if (characteristicFound) break;
                    } catch {}
                }
            }
        } catch (e) {
            console.error('Service discovery error:', e);
        }

        if (!characteristicFound) throw new Error('No writable characteristic found. Make sure printer is in pairing mode.');

        this.characteristic = characteristicFound;
        this.lastConnectionTime = new Date();

        // Auto-reconnect on disconnect
        if (this._onDisconnect) {
            this.device.removeEventListener('gattserverdisconnected', this._onDisconnect);
        }
        this._onDisconnect = () => {
            this.characteristic = null;
            this.notifyConnectionStatus(false);
            if (this.autoReconnect && this.printerInfo?.id) {
                setTimeout(() => this._attemptSilentReconnect(), 3000);
            }
        };
        this.device.addEventListener('gattserverdisconnected', this._onDisconnect);
    }

    // ── Status ────────────────────────────────────────────────────────────
    setConnectionStatusCallback(callback) {
        this.connectionStatusCallback = callback;
    }

    notifyConnectionStatus(isConnected) {
        if (this.connectionStatusCallback) this.connectionStatusCallback(isConnected);
    }

    isConnected() {
        return !!(this.device?.gatt?.connected && this.characteristic);
    }

    getConnectionStatus() {
        return {
            connected: this.isConnected(),
            lastConnectionTime: this.lastConnectionTime,
            reconnecting: this._reconnecting,
            printerName: this.printerInfo?.name || null,
        };
    }

    // ── Storage helpers ───────────────────────────────────────────────────
    _saveToStorage() {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.printerInfo)); } catch {}
    }

    loadFromStorage() {
        try { return JSON.parse(localStorage.getItem(this.storageKey)); } catch { return null; }
    }

    async tryAutoConnect() {
        const stored = this.loadFromStorage() || this.printerInfo;
        if (!stored?.id || this.isConnected()) return false;
        try {
            await this.connect(stored, true);
            return true;
        } catch {
            return false;
        }
    }

    // ── Printing ──────────────────────────────────────────────────────────
    async printReceipt(order, restaurant, config) {
        if (!config.bluetooth_printer) throw new Error('No printer configured.');
        this.setCommandSet(config.command_set);
        const cmd = this.getCommands();
        // Kitchen tickets are item-focused and never show prices/totals/payment.
        const isKitchen = config.role === 'kitchen';

        if (!this.isConnected()) {
            await this.connect(config.bluetooth_printer, true);
        }

        await this.sendCommand(cmd.init);
        await this.sendCommand(cmd.alignCenter);

        if (config.show_logo && restaurant?.logo_url) {
            try { await this.printImage(restaurant.logo_url); } catch {}
        }

        await this.sendCommand(cmd.boldOn);
        await this.sendText(`${restaurant?.name || 'KITCHEN ORDER'}\n`);
        await this.sendCommand(cmd.boldOff);
        await this.sendCommand(cmd.normal);

        if (restaurant?.address && config.template !== 'compact') {
            await this.sendText(`${restaurant.address}\n`);
        }

        await this.sendCommand(cmd.alignLeft);
        await this.sendText('================================\n');

        if (config.header_text) {
            await this.sendText(`${config.header_text}\n`);
            await this.sendText('================================\n');
        }

        if (config.show_order_number) {
            await this.sendCommand(cmd.boldOn);
            await this.sendCommand(cmd.alignCenter);
            if (config.template === 'itemized') await this.sendCommand(cmd.doubleHeight);
            const orderNum = order.order_number || `#${order.id.slice(-6)}`;
            await this.sendText(`ORDER ${orderNum}\n`);
            await this.sendCommand(cmd.normal);
            await this.sendCommand(cmd.boldOff);
            await this.sendCommand(cmd.alignLeft);
        }

        if (config.template !== 'compact') {
            await this.sendText(`${new Date(order.created_date || Date.now()).toLocaleString()}\n`);
        }
        const orderTypeLabel = order.order_type
            ? order.order_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            : (order.order_source === 'pos' ? 'POS' : order.order_source === 'kiosk' ? 'Kiosk' : 'Delivery');
        await this.sendText(`Type: ${orderTypeLabel}\n`);
        await this.sendText('--------------------------------\n');

        if (config.show_customer_details && config.template !== 'compact') {
            await this.sendCommand(cmd.boldOn);
            await this.sendText('Customer:\n');
            await this.sendCommand(cmd.boldOff);
            await this.sendText(`${order.guest_name || order.created_by || 'N/A'}\n`);
            if (order.phone) await this.sendText(`Tel: ${order.phone}\n`);
            if (order.delivery_address) await this.sendText(`${order.delivery_address}\n`);
            await this.sendText('--------------------------------\n');
        }

        const lineWidth = config.printer_width === '80mm' ? 48 : 32;

        for (const item of (order.items || [])) {
            if (config.template === 'itemized') {
                await this.sendCommand(cmd.boldOn);
                await this.sendText(`${item.quantity}x ${item.name}\n`);
                await this.sendCommand(cmd.boldOff);
                await this.sendText(`    £${((item.price || 0) * item.quantity).toFixed(2)}\n`);
            } else {
                const itemName = `${item.quantity}x ${item.name}`;
                const price = `£${((item.price || 0) * item.quantity).toFixed(2)}`;
                const padding = lineWidth - itemName.length - price.length;
                await this.sendText(`${itemName}${' '.repeat(Math.max(1, padding))}${price}\n`);
            }
            if ((config.template === 'detailed' || config.template === 'itemized') && item.customizations) {
                for (const [key, value] of Object.entries(item.customizations)) {
                    if (typeof value !== 'object') await this.sendText(`  ${key}: ${value}\n`);
                }
            }
        }

        await this.sendText('================================\n');

        if (config.template !== 'compact') {
            const subtotal = `£${(order.subtotal || 0).toFixed(2)}`;
            await this.sendText(`Subtotal:${' '.repeat(Math.max(1, lineWidth - 9 - subtotal.length))}${subtotal}\n`);
            if ((order.delivery_fee || 0) > 0) {
                const fee = `£${order.delivery_fee.toFixed(2)}`;
                await this.sendText(`Delivery:${' '.repeat(Math.max(1, lineWidth - 9 - fee.length))}${fee}\n`);
            }
            if ((order.discount || 0) > 0) {
                const disc = `-£${order.discount.toFixed(2)}`;
                await this.sendText(`Discount:${' '.repeat(Math.max(1, lineWidth - 9 - disc.length))}${disc}\n`);
            }
        }

        await this.sendCommand(cmd.boldOn);
        if (config.template === 'itemized') await this.sendCommand(cmd.doubleHeight);
        const total = `£${(order.total || 0).toFixed(2)}`;
        await this.sendText(`TOTAL:${' '.repeat(Math.max(1, lineWidth - 6 - total.length))}${total}\n`);
        await this.sendCommand(cmd.normal);
        await this.sendCommand(cmd.boldOff);

        if (config.template !== 'minimal') await this.sendText(`Payment: ${order.payment_method || 'N/A'}\n`);
        if (order.notes) {
            await this.sendText('--------------------------------\n');
            await this.sendText(`Notes: ${order.notes}\n`);
        }

        if (config.footer_text) {
            await this.sendText('================================\n');
            await this.sendCommand(cmd.alignCenter);
            await this.sendText(`${config.footer_text}\n`);
            await this.sendCommand(cmd.alignLeft);
        }

        await this.sendText('================================\n');
        await this.sendCommand(cmd.alignCenter);
        await this.sendText('Thank you!\n\n\n');
        await this.sendCommand(cmd.cut);
        return true;
    }

    async sendCommand(command) {
        if (!this.characteristic) throw new Error('Printer not connected');
        const encoder = new TextEncoder();
        const data = command instanceof Uint8Array ? command : encoder.encode(command);
        const chunkSize = 512;
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
            if (this.characteristic.properties.writeWithoutResponse) {
                await this.characteristic.writeValueWithoutResponse(chunk);
            } else {
                await this.characteristic.writeValue(chunk);
            }
            if (i + chunkSize < data.length) await new Promise(r => setTimeout(r, 10));
        }
    }

    async sendText(text) { await this.sendCommand(text); }

    async printImage(imageUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
        });
        const canvas = document.createElement('canvas');
        const maxWidth = 384;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const bitmap = [];
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x += 8) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const px = (y * canvas.width + x + bit) * 4;
                    const brightness = (imageData.data[px] + imageData.data[px + 1] + imageData.data[px + 2]) / 3;
                    if (brightness < 128) byte |= (1 << (7 - bit));
                }
                bitmap.push(byte);
            }
        }
        const widthBytes = Math.ceil(canvas.width / 8);
        const cmd = new Uint8Array([0x1D, 0x76, 0x30, 0x00, widthBytes & 0xFF, (widthBytes >> 8) & 0xFF, canvas.height & 0xFF, (canvas.height >> 8) & 0xFF, ...bitmap]);
        await this.sendCommand(cmd);
        await this.sendText('\n');
    }

    // ── Test print ────────────────────────────────────────────────────────
    async printTest(printerName = 'Printer') {
        if (!this.isConnected()) throw new Error('Printer not connected');
        const cmd = this.getCommands();
        const now = new Date().toLocaleString();
        await this.sendCommand(cmd.init);
        await this.sendCommand(cmd.alignCenter);
        await this.sendCommand(cmd.boldOn);
        await this.sendCommand(cmd.doubleHeight);
        await this.sendText('PRINTER TEST\n');
        await this.sendCommand(cmd.normal);
        await this.sendCommand(cmd.boldOff);
        await this.sendText('================================\n');
        await this.sendCommand(cmd.alignLeft);
        await this.sendText(`Printer:  ${printerName}\n`);
        await this.sendText(`Time:     ${now}\n`);
        await this.sendText(`Command:  ${this.commandSet}\n`);
        await this.sendText('================================\n');
        await this.sendCommand(cmd.boldOn);
        await this.sendText('ABCDEFGHIJKLMNOPQRSTUVWXYZabcd\n');
        await this.sendText('1234567890 !@#$%^&*()_+-=[]{}|\n');
        await this.sendCommand(cmd.boldOff);
        await this.sendText('================================\n');
        await this.sendCommand(cmd.alignCenter);
        await this.sendText('Printer is working correctly!\n\n\n');
        await this.sendCommand(cmd.cut);
        return true;
    }

    disconnect() {
        this.stopHeartbeat();
        if (this.device && this._onDisconnect) {
            this.device.removeEventListener('gattserverdisconnected', this._onDisconnect);
        }
        if (this.device?.gatt?.connected) this.device.gatt.disconnect();
        this.device = null;
        this.characteristic = null;
        this.printerInfo = null;
        this._onDisconnect = null;
        this._reconnecting = false;
        this.notifyConnectionStatus(false);
        try { localStorage.removeItem(this.storageKey); } catch {}
    }
}

// ── Dual Printer Manager ───────────────────────────────────────────────────
class PrinterManager {
    constructor() {
        this.printerA = new PrinterService('printerInfo_A');
        this.printerB = new PrinterService('printerInfo_B');
    }
}

export const printerManager = new PrinterManager();

// Backward-compatible singleton (points to Printer A)
export const printerService = printerManager.printerA;