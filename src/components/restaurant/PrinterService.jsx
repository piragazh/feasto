// Bluetooth Thermal Printer Service
// Handles printing receipts to connected Bluetooth printers

const ESC = '\x1B';
const GS = '\x1D';

export class PrinterService {
    constructor() {
        this.device = null;
        this.characteristic = null;
    }

    async connect(printerInfo) {
        try {
            if (!printerInfo?.id) {
                throw new Error('No printer configured. Please connect a printer in Settings > Printing.');
            }

            console.log('Connecting to printer:', printerInfo);
            const devices = await navigator.bluetooth.getDevices();
            console.log('Available devices:', devices);
            
            this.device = devices.find(d => d.id === printerInfo.id);
            
            if (!this.device) {
                throw new Error(`Printer "${printerInfo.name}" not found. Please reconnect in Settings > Printing.`);
            }

            console.log('Found device, connecting GATT...');
            const server = await this.device.gatt.connect();
            const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            this.characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
            
            console.log('Printer connected successfully');
            return true;
        } catch (error) {
            console.error('Printer connection failed:', error);
            throw new Error(`Printer connection failed: ${error.message}`);
        }
    }

    async printReceipt(order, restaurant, config) {
        if (!config.bluetooth_printer) {
            throw new Error('No printer connected. Please connect a printer in Settings > Printing.');
        }

        // Check if we need to reconnect
        if (!this.device || !this.device.gatt?.connected || !this.characteristic) {
            console.log('Connecting to printer with config:', config.bluetooth_printer);
            await this.connect(config.bluetooth_printer);
        }

        try {
            // Initialize printer
            await this.sendCommand(`${ESC}@`); // Reset printer
            
            // Set alignment and font
            await this.sendCommand(`${ESC}a${'\x01'}`); // Center align
            
            // Print logo if enabled (simplified)
            if (config.show_logo && restaurant.logo_url) {
                await this.sendText('[ LOGO ]\n');
            }

            // Restaurant name (bold)
            await this.sendCommand(`${ESC}E${'\x01'}`); // Bold on
            await this.sendText(`${restaurant.name}\n`);
            await this.sendCommand(`${ESC}E${'\x00'}`); // Bold off
            
            // Address
            await this.sendText(`${restaurant.address}\n`);
            await this.sendCommand(`${ESC}a${'\x00'}`); // Left align
            await this.sendText('================================\n');

            // Custom header
            if (config.header_text) {
                await this.sendText(`${config.header_text}\n`);
                await this.sendText('================================\n');
            }

            // Order number
            if (config.show_order_number) {
                await this.sendCommand(`${ESC}E${'\x01'}`); // Bold
                await this.sendCommand(`${ESC}a${'\x01'}`); // Center
                const orderNum = order.order_number || `#${order.id.slice(-6)}`;
                await this.sendText(`ORDER ${orderNum}\n`);
                await this.sendCommand(`${ESC}E${'\x00'}`);
                await this.sendCommand(`${ESC}a${'\x00'}`);
            }

            // Date & time
            await this.sendText(`${new Date(order.created_date).toLocaleString()}\n`);
            await this.sendText(`Type: ${order.order_type || 'Delivery'}\n`);
            await this.sendText('--------------------------------\n');

            // Customer details
            if (config.show_customer_details) {
                await this.sendCommand(`${ESC}E${'\x01'}`);
                await this.sendText('Customer:\n');
                await this.sendCommand(`${ESC}E${'\x00'}`);
                await this.sendText(`${order.guest_name || order.created_by}\n`);
                if (order.delivery_address) {
                    await this.sendText(`${order.delivery_address}\n`);
                }
                await this.sendText('--------------------------------\n');
            }

            // Items
            for (const item of order.items) {
                const itemName = `${item.quantity}x ${item.name}`;
                const price = `£${(item.price * item.quantity).toFixed(2)}`;
                await this.sendText(`${itemName.padEnd(20)}${price.padStart(12)}\n`);
                
                // Customizations
                if (config.template === 'detailed' && item.customizations) {
                    for (const [key, value] of Object.entries(item.customizations)) {
                        await this.sendText(`  ${key}: ${value}\n`);
                    }
                }
            }

            await this.sendText('================================\n');

            // Totals
            await this.sendText(`Subtotal:${`£${order.subtotal.toFixed(2)}`.padStart(24)}\n`);
            if (order.delivery_fee > 0) {
                await this.sendText(`Delivery:${`£${order.delivery_fee.toFixed(2)}`.padStart(24)}\n`);
            }
            if (order.discount > 0) {
                await this.sendText(`Discount:${`-£${order.discount.toFixed(2)}`.padStart(23)}\n`);
            }
            
            await this.sendCommand(`${ESC}E${'\x01'}`); // Bold
            await this.sendText(`TOTAL:${`£${order.total.toFixed(2)}`.padStart(26)}\n`);
            await this.sendCommand(`${ESC}E${'\x00'}`);

            // Payment method
            if (config.template !== 'minimal') {
                await this.sendText(`Payment: ${order.payment_method}\n`);
            }

            // Notes
            if (order.notes) {
                await this.sendText('--------------------------------\n');
                await this.sendText(`Notes: ${order.notes}\n`);
            }

            // Custom footer
            if (config.footer_text) {
                await this.sendText('================================\n');
                await this.sendCommand(`${ESC}a${'\x01'}`); // Center
                await this.sendText(`${config.footer_text}\n`);
                await this.sendCommand(`${ESC}a${'\x00'}`);
            }

            // Thank you
            await this.sendText('================================\n');
            await this.sendCommand(`${ESC}a${'\x01'}`); // Center
            await this.sendText('Thank you!\n\n\n');

            // Cut paper
            await this.sendCommand(`${GS}V${'\x41'}${'\x00'}`);

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