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

    async connect(printerInfo) {
        try {
            if (!printerInfo?.id) {
                throw new Error('No printer configured. Please connect a printer in Settings > Printing.');
            }

            // Check if Web Bluetooth is supported
            if (!navigator.bluetooth) {
                throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera.');
            }

            console.log('🖨️ Connecting to printer:', printerInfo);
            
            let device = null;

            // Try to get previously paired devices first
            if (navigator.bluetooth.getDevices) {
                try {
                    const devices = await navigator.bluetooth.getDevices();
                    console.log('📱 Available paired devices:', devices);
                    device = devices.find(d => d.id === printerInfo.id);
                } catch (e) {
                    console.log('⚠️ getDevices failed, will try requestDevice:', e);
                }
            }

            // If device not found in paired devices, request user to select it
            if (!device) {
                console.log('🔍 Printer not in paired devices, requesting user selection...');
                device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: this.PRINTER_SERVICES
                });
                console.log('✅ User selected device:', device);
            }

            this.device = device;
            
            console.log('🔌 Connecting to GATT server...');
            const server = await this.device.gatt.connect();
            console.log('✅ GATT connected, discovering services...');
            
            // Try to find a working service/characteristic combination
            let serviceFound = null;
            let characteristicFound = null;

            for (const serviceUUID of this.PRINTER_SERVICES) {
                try {
                    const service = await server.getPrimaryService(serviceUUID);
                    console.log(`✅ Found service: ${serviceUUID}`);
                    
                    for (const charUUID of this.PRINTER_CHARACTERISTICS) {
                        try {
                            const char = await service.getCharacteristic(charUUID);
                            console.log(`✅ Found characteristic: ${charUUID}`);
                            serviceFound = service;
                            characteristicFound = char;
                            break;
                        } catch (e) {
                            console.log(`⚠️ Characteristic ${charUUID} not found in this service`);
                        }
                    }
                    
                    if (characteristicFound) break;
                } catch (e) {
                    console.log(`⚠️ Service ${serviceUUID} not available`);
                }
            }

            if (!characteristicFound) {
                throw new Error('Could not find a compatible printer service/characteristic. Your printer may use a different protocol.');
            }

            this.characteristic = characteristicFound;
            console.log('🎉 Printer connected successfully!');
            return true;
        } catch (error) {
            console.error('❌ Printer connection failed:', error);
            throw new Error(`Printer connection failed: ${error.message}`);
        }
    }

    async printReceipt(order, restaurant, config) {
        if (!config.bluetooth_printer) {
            throw new Error('No printer connected. Please connect a printer in Settings > Printing.');
        }

        // Set command set
        this.setCommandSet(config.command_set);
        const cmd = this.getCommands();

        // Check if we need to reconnect
        if (!this.device || !this.device.gatt?.connected || !this.characteristic) {
            console.log('Connecting to printer with config:', config.bluetooth_printer);
            await this.connect(config.bluetooth_printer);
        }

        try {
            // Initialize printer
            await this.sendCommand(cmd.init);
            
            // Set alignment and font
            await this.sendCommand(cmd.alignCenter);
            
            // Print logo if enabled (simplified)
            if (config.show_logo && restaurant.logo_url) {
                await this.sendText('[ LOGO ]\n');
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
                    await this.sendText(`    £${(item.price * item.quantity).toFixed(2)}\n`);
                } else {
                    const itemName = `${item.quantity}x ${item.name}`;
                    const price = `£${(item.price * item.quantity).toFixed(2)}`;
                    await this.sendText(`${itemName.padEnd(20)}${price.padStart(12)}\n`);
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
            if (config.template !== 'compact') {
                await this.sendText(`Subtotal:${`£${order.subtotal.toFixed(2)}`.padStart(24)}\n`);
                if (order.delivery_fee > 0) {
                    await this.sendText(`Delivery:${`£${order.delivery_fee.toFixed(2)}`.padStart(24)}\n`);
                }
                if (order.discount > 0) {
                    await this.sendText(`Discount:${`-£${order.discount.toFixed(2)}`.padStart(23)}\n`);
                }
            }
            
            await this.sendCommand(cmd.boldOn);
            if (config.template === 'itemized') {
                await this.sendCommand(cmd.doubleHeight);
            }
            await this.sendText(`TOTAL:${`£${order.total.toFixed(2)}`.padStart(26)}\n`);
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
        const encoder = new TextEncoder();
        await this.characteristic.writeValue(encoder.encode(command));
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    async sendText(text) {
        await this.sendCommand(text);
    }

    disconnect() {
        if (this.device?.gatt?.connected) {
            this.device.gatt.disconnect();
        }
        this.device = null;
        this.characteristic = null;
    }
}

// Singleton instance
export const printerService = new PrinterService();