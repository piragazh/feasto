/**
 * Centralized print utility — routes print jobs through the new
 * centralized_printers config based on the order channel.
 *
 * Channels: 'pos_order' | 'kiosk_order' | 'online_order'
 */
import { printerManager } from '@/components/restaurant/PrinterService';

const services = () => [printerManager.printerA, printerManager.printerB];

/**
 * Print an order using the centralized printer config.
 * Falls back to browser print via the provided fallback function.
 *
 * @param {object} order
 * @param {object} restaurant
 * @param {string} channel  - 'pos_order' | 'kiosk_order' | 'online_order'
 * @param {function} [browserFallback] - called if no BT printer available
 */
export async function printWithCentralizedConfig(order, restaurant, channel, browserFallback) {
    const cfg = restaurant?.printer_config || {};
    const centralized = cfg.centralized_printers || [];
    const svcs = services();

    if (centralized.length > 0) {
        // Find printers assigned to this channel
        const assigned = centralized.filter(p =>
            (p.assigned_channels || []).includes(channel)
        );
        const toTry = assigned.length > 0 ? assigned : [];

        for (const printerConfig of toTry) {
            const slotIndex = centralized.indexOf(printerConfig);
            const service = svcs[slotIndex] || printerManager.printerA;

            if (printerConfig.connection_type === 'bluetooth' && printerConfig.bluetooth_printer?.id) {
                if (!service.isConnected()) await service.tryAutoConnect().catch(() => {});
                if (service.isConnected()) {
                    await service.printReceipt(order, restaurant, {
                        ...cfg,
                        bluetooth_printer: printerConfig.bluetooth_printer,
                    });
                    return;
                }
            }
        }
    } else {
        // Legacy fallback: use printerA if it has a bluetooth_printer configured
        if (cfg.bluetooth_printer?.id) {
            if (!printerManager.printerA.isConnected()) {
                await printerManager.printerA.tryAutoConnect().catch(() => {});
            }
            if (printerManager.printerA.isConnected()) {
                await printerManager.printerA.printReceipt(order, restaurant, cfg);
                return;
            }
        }
    }

    // No bluetooth printer succeeded — use browser fallback if provided
    if (browserFallback) browserFallback();
}

/**
 * Returns true if any printer is assigned to the given channel
 * (used to show/hide print buttons).
 */
export function hasPrinterForChannel(restaurant, channel) {
    const cfg = restaurant?.printer_config || {};
    const centralized = cfg.centralized_printers || [];
    if (centralized.length > 0) {
        return centralized.some(p => (p.assigned_channels || []).includes(channel));
    }
    // Legacy: printerA is always available for pos
    return !!(cfg.bluetooth_printer?.id);
}