// Bluetooth Thermal Printer Service
// Handles printing receipts to connected Bluetooth printers

const ESC = '\x1B';
const GS = '\x1D';
const FS = '\x1C';

export class PrinterService {
    constructor() {
        this.device = null;
        this.characteristic = null;
        this.commandSet = 'esc_pos';
        this.printerInfo = null;
        this.lastConnectionTime = null;
        this.connectionStatusCallback = null;
        this._onDisconnect = null;
        // Common Bluetooth printer service UUIDs
        this.PRINTER_SERVICES = [
            '000018f0-0000-1000-8000-00805f9b34fb', // Generic printer service
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Common thermal printer
            '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip data service
            '0000fff0-0000-1000-8000-00805f9b34fb', // Common service
            '0000ffe0-0000-1000-8000-00805f9b34fb', // Sunmi/Generic BLE printer
            '00001101-0000-1000-8000-00805f9b34fb'  // SPP Serial Port Profile (Sunmi)
        ];
        this.PRINTER_CHARACTERISTICS = [
            '00002af1-0000-1000-8000-00805f9b34fb',
            '49535343-8841-43f4-a8d4-ecbe34729bb3',
            '0000fff1-0000-1000-8000-00805f9b34fb',
            '0000ffe1-0000-1000-8000-00805f9b34fb'  // Sunmi characteristic
        ];
    }

    setCommandSet(commandSet) {
        this.commandSet = commandSet || 'esc_pos';
    }

    getCommands() {
        const commands = {
            esc_pos: {
                init: `${ESC}@`,
                alignCenter: `${ESC}a${'\x01'}`,
                alignLeft: `${ESC}a${'\x00'}`,
                boldOn: `${ESC}E${'\x01'}`,
                boldOff: `${ESC}E${'\x00'}`,
                cut: `${GS}V${'\x41'}${'\x00'}`,
                doubleHeight: `${ESC}!${'\x10'}`,
                normal: `${ESC}!${'\x00'}`
            },
            esc_pos_star: {
                init: `${ESC}@`,
                alignCenter: `${ESC}a${'\x01'}`,
                alignLeft: `${ESC}a${'\x00'}`,
                boldOn: `${ESC}E`,
                boldOff: `${ESC}F`,
                cut: `${ESC}d${'\x03'}`,
                doubleHeight: `${ESC}!${'\x10'}`,
                normal: `${ESC}!${'\x00'}`
            },
            esc_bixolon: {
                init: `${ESC}@`,
                alignCenter: `${ESC}a${'\x01'}`,
                alignLeft: `${ESC}a${'\x00'}`,
                boldOn: `${ESC}E${'\x01'}`,
                boldOff: `${ESC}E${'\x00'}`,
                cut: `${GS}V${'\x00'}`,
                doubleHeight: `${GS}!${'\x11'}`,
                normal: `${GS}!${'\x00'}`
            },
            epson_tm: {
                init: `${ESC}@`,
                alignCenter: `${ESC}a${'\x01'}`,
                alignLeft: `${ESC}a${'\x00'}`,
                boldOn: `${ESC}E${'\x01'}`,
                boldOff: `${ESC}E${'\x00'}`,
                cut: `${GS}V${'\x41'}${'\x03'}`,
                doubleHeight: `${ESC}!${'\x30'}`,
                normal: `${ESC}!${'\x00'}`
            }
        };
        return commands[this.commandSet] || commands.esc_pos;
    }

    // Connect using a device object that was already selected via requestDevice (requires user gesture)
    async connectDevice(device) {
        if (!device) throw new Error('No device provided');
        this.printerInfo = { id: device.id, name: device.name };
        this.device = device;
        await this._connectGatt();
        try { localStorage.setItem('printerInfo', JSON.stringify(this.printerInfo)); } catch(e) {}
        this.notifyConnectionStatus(true);
        return true;
    }

    // Connect using stored printerInfo — only works if device is still in browser's paired list
    // (i.e. user previously paired it in the same browser session/origin)
    async connect(printerInfo, silent = false) {
        try {
            if (!printerInfo?.id) {
                throw new Error('No printer configured. Please connect a printer in Settings > Printing.');
            }

            if (!navigator.bluetooth) {
                throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera.');
            }

            this.printerInfo = printerInfo;

            let device = null;

            // Try to get from browser's already-paired devices list (no user gesture needed)
            if (navigator.bluetooth.getDevices) {
                try {
                    const devices = await navigator.bluetooth.getDevices();
                    device = devices.find(d => d.id === printerInfo.id);
                    if (device && !silent) console.log('📱 Found printer in paired devices:', device.name);
                } catch (e) {
                    if (!silent) console.log('⚠️ getDevices not available:', e.message);
                }
            }

            if (!device) {
                throw new Error('Printer not found in paired devices. Please use the "Scan for Printers" button to reconnect.');
            }

            this.device = device;
            await this._connectGatt();
            try { localStorage.setItem('printerInfo', JSON.stringify(this.printerInfo)); } catch(e) {}
            this.notifyConnectionStatus(true);
            if (!silent) console.log('🎉 Printer connected successfully!');
            return true;
        } catch (error) {
            if (!silent) console.error('❌ Printer connection failed:', error);
            throw new Error(error.message || 'Printer connection failed');
        }
    }

    async _connectGatt() {
            console.log('🔌 Connecting to GATT server...');
            const server = await this.device.gatt.connect();
            console.log('✅ GATT connected, discovering services...');
            
            // Try to discover ALL services and find ANY writable characteristic
            let characteristicFound = null;

            try {
                // Get all services
                const services = await server.getPrimaryServices();
                console.log(`📡 Found ${services.length} services total`);

                // Try known printer services first
                for (const serviceUUID of this.PRINTER_SERVICES) {
                    try {
                        const service = await server.getPrimaryService(serviceUUID);
                        console.log(`✅ Found known service: ${serviceUUID}`);
                        
                        // Try to get all characteristics in this service
                        const characteristics = await service.getCharacteristics();
                        console.log(`  Found ${characteristics.length} characteristics`);
                        
                        for (const char of characteristics) {
                            console.log(`  Checking characteristic: ${char.uuid}`);
                            console.log(`    Properties:`, char.properties);
                            
                            // Look for writable characteristic
                            if (char.properties.write || char.properties.writeWithoutResponse) {
                                console.log(`  ✅ Found writable characteristic: ${char.uuid}`);
                                characteristicFound = char;
                                break;
                            }
                        }
                        
                        if (characteristicFound) break;
                    } catch (e) {
                        console.log(`⚠️ Service ${serviceUUID} not available:`, e.message);
                    }
                }

                // If still not found, scan all services for ANY writable characteristic
                if (!characteristicFound) {
                    console.log('🔍 Scanning all services for writable characteristics...');
                    for (const service of services) {
                        try {
                            const characteristics = await service.getCharacteristics();
                            for (const char of characteristics) {
                                if (char.properties.write || char.properties.writeWithoutResponse) {
                                    console.log(`✅ Found writable characteristic in service ${service.uuid}: ${char.uuid}`);
                                    characteristicFound = char;
                                    break;
                                }
                            }
                            if (characteristicFound) break;
                        } catch (e) {
                            console.log(`⚠️ Error reading service:`, e.message);
                        }
                    }
                }
            } catch (e) {
                console.error('❌ Error during service discovery:', e);
            }

            if (!characteristicFound) {
                throw new Error('Could not find any writable characteristic. Make sure your printer is in pairing mode and supports Bluetooth printing.');
            }

            this.characteristic = characteristicFound;
            this.lastConnectionTime = new Date();
            
            // Listen for disconnect — notify but don't auto-reconnect 
            // (requestDevice requires a user gesture, auto-reconnect always fails)
            this.device.removeEventListener('gattserverdisconnected', this._onDisconnect);
            this._onDisconnect = () => {
                console.log('⚠️ Printer GATT disconnected');
                this.characteristic = null;
                this.notifyConnectionStatus(false);
            };
            this.device.addEventListener('gattserverdisconnected', this._onDisconnect);
            
            console.log('📝 Using characteristic:', this.characteristic.uuid);
    }

    setConnectionStatusCallback(callback) {
        this.connectionStatusCallback = callback;
    }

    notifyConnectionStatus(isConnected) {
        if (this.connectionStatusCallback) {
            this.connectionStatusCallback(isConnected);
        }
    }

    isConnected() {
        return this.device?.gatt?.connected && !!this.characteristic;
    }

    getConnectionStatus() {
        return {
            connected: this.isConnected(),
            lastConnectionTime: this.lastConnectionTime,
            reconnecting: false,
            reconnectAttempts: 0,
        };
    }

    enableAutoReconnect(enabled) {
        // Auto-reconnect requires a user gesture so it cannot be done silently.
        // This method is a no-op stub kept for API compatibility.
    }

    async tryAutoConnect() {
        const stored = (() => { try { return JSON.parse(localStorage.getItem('printerInfo')); } catch { return null; } })();
        const printerInfo = stored || this.printerInfo;
        if (!printerInfo?.id || this.isConnected()) return false;
        try {
            await this.connect(printerInfo, true);
            return true;
        } catch {
            return false;
        }
    }

    async printReceipt(order, restaurant, config) {
        if (!config.bluetooth_printer) {
            throw new Error('No printer connected. Please connect a printer in Settings > Printing.');
        }

        // Set command set
        this.setCommandSet(config.command_set);
        const cmd = this.getCommands();

        // If not connected, attempt to reconnect via paired devices list (no user gesture needed)
        if (!this.device?.gatt?.connected || !this.characteristic) {
            console.log('🔄 Printer not connected, attempting reconnect via paired devices...');
            await this.connect(config.bluetooth_printer, true);
        }

        try {
            // Initialize printer
            await this.sendCommand(cmd.init);
            
            // Set alignment and font
            await this.sendCommand(cmd.alignCenter);
            
            // Print logo if enabled
            if (config.show_logo && restaurant.logo_url) {
                try {
                    await this.printImage(restaurant.logo_url);
                } catch (error) {
                    console.log('Logo printing failed, skipping:', error);
                }
            }

            // Restaurant name (bold)
            await this.sendCommand(cmd.boldOn);
            if (config.template === 'itemized' || config.template === 'compact') {
                await this.sendCommand(cmd.doubleHeight);
            }
            await this.sendText(`${restaurant.name}\n`);
            await this.sendCommand(cmd.normal);
            await this.sendCommand(cmd.boldOff);
            
            // Address
            if (config.template !== 'compact') {
                await this.sendText(`${restaurant.address}\n`);
            }
            await this.sendCommand(cmd.alignLeft);
            await this.sendText('================================\n');

            // Custom header
            if (config.header_text) {
                await this.sendText(`${config.header_text}\n`);
                await this.sendText('================================\n');
            }

            // Order number
            if (config.show_order_number) {
                await this.sendCommand(cmd.boldOn);
                await this.sendCommand(cmd.alignCenter);
                const orderNum = order.order_number || `#${order.id.slice(-6)}`;
                if (config.template === 'itemized') {
                    await this.sendCommand(cmd.doubleHeight);
                }
                await this.sendText(`ORDER ${orderNum}\n`);
                await this.sendCommand(cmd.normal);
                await this.sendCommand(cmd.boldOff);
                await this.sendCommand(cmd.alignLeft);
            }

            // Barcode (custom template)
            if (config.custom_sections?.show_barcode && config.template === 'custom') {
                const orderNum = order.order_number || order.id.slice(-6);
                await this.sendCommand(cmd.alignCenter);
                await this.sendText(`[BARCODE: ${orderNum}]\n`);
                await this.sendCommand(cmd.alignLeft);
            }

            // Date & time
            if (config.template !== 'compact') {
                await this.sendText(`${new Date(order.created_date).toLocaleString()}\n`);
            }
            await this.sendText(`Type: ${order.order_type || 'Delivery'}\n`);
            await this.sendText('--------------------------------\n');

            // Customer details
            if (config.show_customer_details && config.template !== 'compact') {
                await this.sendCommand(cmd.boldOn);
                await this.sendText('Customer:\n');
                await this.sendCommand(cmd.boldOff);
                await this.sendText(`${order.guest_name || order.created_by}\n`);
                if (order.delivery_address) {
                    await this.sendText(`${order.delivery_address}\n`);
                }
                await this.sendText('--------------------------------\n');
            }

            // Items
            for (const item of order.items) {
                if (config.template === 'itemized') {
                    await this.sendCommand(cmd.boldOn);
                    await this.sendText(`${item.quantity}x ${item.name}\n`);
                    await this.sendCommand(cmd.boldOff);
                    await this.sendText(`    £${((item.price || 0) * item.quantity).toFixed(2)}\n`);
                } else {
                    const itemName = `${item.quantity}x ${item.name}`;
                    const price = `£${((item.price || 0) * item.quantity).toFixed(2)}`;
                    // Adjust padding based on printer width (80mm = 48 chars, 58mm = 32 chars)
                    const lineWidth = config.printer_width === '80mm' ? 48 : 32;
                    const padding = lineWidth - itemName.length - price.length;
                    await this.sendText(`${itemName}${' '.repeat(Math.max(1, padding))}${price}\n`);
                }
                
                // Customizations
                if ((config.template === 'detailed' || config.template === 'itemized') && item.customizations) {
                    for (const [key, value] of Object.entries(item.customizations)) {
                        await this.sendText(`  ${key}: ${value}\n`);
                    }
                }

                // Allergen info
                if (config.custom_sections?.show_allergen_info && item.allergens) {
                    await this.sendText(`  Allergens: ${item.allergens}\n`);
                }
            }

            await this.sendText('================================\n');

            // Totals
            const lineWidth = config.printer_width === '80mm' ? 48 : 32;
            if (config.template !== 'compact') {
                const subtotal = `£${(order.subtotal || 0).toFixed(2)}`;
                const subtotalPad = lineWidth - 9 - subtotal.length;
                await this.sendText(`Subtotal:${' '.repeat(Math.max(1, subtotalPad))}${subtotal}\n`);
                
                if ((order.delivery_fee || 0) > 0) {
                    const delivery = `£${order.delivery_fee.toFixed(2)}`;
                    const deliveryPad = lineWidth - 9 - delivery.length;
                    await this.sendText(`Delivery:${' '.repeat(Math.max(1, deliveryPad))}${delivery}\n`);
                }
                if ((order.discount || 0) > 0) {
                    const discount = `-£${order.discount.toFixed(2)}`;
                    const discountPad = lineWidth - 9 - discount.length;
                    await this.sendText(`Discount:${' '.repeat(Math.max(1, discountPad))}${discount}\n`);
                }
            }
            
            await this.sendCommand(cmd.boldOn);
            if (config.template === 'itemized') {
                await this.sendCommand(cmd.doubleHeight);
            }
            const total = `£${(order.total || 0).toFixed(2)}`;
            const totalPad = lineWidth - 6 - total.length;
            await this.sendText(`TOTAL:${' '.repeat(Math.max(1, totalPad))}${total}\n`);
            await this.sendCommand(cmd.normal);
            await this.sendCommand(cmd.boldOff);

            // Payment method
            if (config.template !== 'minimal') {
                await this.sendText(`Payment: ${order.payment_method}\n`);
            }

            // Notes
            if (order.notes) {
                await this.sendText('--------------------------------\n');
                await this.sendText(`Notes: ${order.notes}\n`);
            }

            // Social media (custom template)
            if (config.custom_sections?.show_social_media && config.template === 'custom' && restaurant.social_media) {
                await this.sendText('================================\n');
                await this.sendCommand(cmd.alignCenter);
                if (restaurant.social_media.instagram) {
                    await this.sendText(`Instagram: ${restaurant.social_media.instagram}\n`);
                }
                if (restaurant.social_media.facebook) {
                    await this.sendText(`Facebook: ${restaurant.social_media.facebook}\n`);
                }
                await this.sendCommand(cmd.alignLeft);
            }

            // QR Code (custom template)
            if (config.custom_sections?.show_qr_code && config.template === 'custom') {
                await this.sendText('================================\n');
                await this.sendCommand(cmd.alignCenter);
                await this.sendText('[QR CODE: Track Order]\n');
                await this.sendCommand(cmd.alignLeft);
            }

            // Custom footer
            if (config.footer_text) {
                await this.sendText('================================\n');
                await this.sendCommand(cmd.alignCenter);
                await this.sendText(`${config.footer_text}\n`);
                await this.sendCommand(cmd.alignLeft);
            }

            // Thank you
            await this.sendText('================================\n');
            await this.sendCommand(cmd.alignCenter);
            await this.sendText('Thank you!\n\n\n');

            // Cut paper
            await this.sendCommand(cmd.cut);

            return true;
        } catch (error) {
            console.error('Print failed:', error);
            throw error;
        }
    }

    async sendCommand(command) {
        if (!this.characteristic) {
            throw new Error('Printer not connected');
        }
        try {
            const encoder = new TextEncoder();
            // If already a Uint8Array (e.g. image data), use it directly
            const data = command instanceof Uint8Array ? command : encoder.encode(command);
            
            console.log(`📤 Sending ${data.length} bytes to printer`);
            
            // Determine chunk size based on printer (Sunmi typically supports larger chunks)
            const chunkSize = 512; // Larger chunks for better performance
            
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
                
                // Use writeWithoutResponse if available (faster)
                if (this.characteristic.properties.writeWithoutResponse) {
                    await this.characteristic.writeValueWithoutResponse(chunk);
                } else {
                    await this.characteristic.writeValue(chunk);
                }
                
                // Small delay between chunks
                if (i + chunkSize < data.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            console.log('✅ Data sent successfully');
        } catch (error) {
            console.error('❌ Failed to send command:', error);
            throw error;
        }
    }

    async sendText(text) {
        await this.sendCommand(text);
    }

    async printImage(imageUrl) {
        try {
            // Load image
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageUrl;
            });

            // Create canvas and draw image
            const canvas = document.createElement('canvas');
            const maxWidth = 384; // 48mm at 8 dots/mm for 80mm printer
            const scale = Math.min(1, maxWidth / img.width);
            canvas.width = Math.floor(img.width * scale);
            canvas.height = Math.floor(img.height * scale);
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Convert to monochrome bitmap
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const bitmap = [];
            
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x += 8) {
                    let byte = 0;
                    for (let bit = 0; bit < 8; bit++) {
                        const px = (y * canvas.width + x + bit) * 4;
                        const brightness = (imageData.data[px] + imageData.data[px + 1] + imageData.data[px + 2]) / 3;
                        if (brightness < 128) {
                            byte |= (1 << (7 - bit));
                        }
                    }
                    bitmap.push(byte);
                }
            }

            // Send raster image command (ESC * m nL nH d1...dk)
            const width = canvas.width;
            const height = canvas.height;
            const widthBytes = Math.ceil(width / 8);
            
            // ESC/POS raster bit image command
            const cmd = new Uint8Array([0x1D, 0x76, 0x30, 0x00, widthBytes & 0xFF, (widthBytes >> 8) & 0xFF, height & 0xFF, (height >> 8) & 0xFF, ...bitmap]);
            
            await this.sendCommand(cmd);
            await this.sendText('\n');
            
        } catch (error) {
            throw new Error(`Failed to print image: ${error.message}`);
        }
    }

    disconnect() {
        if (this.device && this._onDisconnect) {
            this.device.removeEventListener('gattserverdisconnected', this._onDisconnect);
        }
        if (this.device?.gatt?.connected) {
            this.device.gatt.disconnect();
        }
        this.device = null;
        this.characteristic = null;
        this.printerInfo = null;
        this._onDisconnect = null;
        this.notifyConnectionStatus(false);
        try { localStorage.removeItem('printerInfo'); } catch(e) {}
    }
}

// Singleton instance
export const printerService = new PrinterService();