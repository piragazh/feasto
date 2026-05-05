/**
 * Centralized print utility — routes print jobs through the
 * centralized_printers config based on order channel.
 *
 * Supports: Bluetooth (Web BT), Network (TCP/IP via networkPrint backend)
 * Channels: 'pos_order' | 'kiosk_order' | 'online_order'
 */
import { printerManager } from '@/components/restaurant/PrinterService';
import { base44 } from '@/api/base44Client';

const btServices = () => [printerManager.printerA, printerManager.printerB];

/**
 * Resolve the effective printer channel — kiosk falls back to online_order
 * if no kiosk_order printer is explicitly configured.
 */
function resolveChannel(channel, centralized) {
    if (
        channel === 'kiosk_order' &&
        !centralized.some(p => (p.assigned_channels || []).includes('kiosk_order'))
    ) {
        return 'online_order';
    }
    return channel;
}

/**
 * Build the per-printer config object used for both BT and network printing.
 * Merges defaults → global → per-printer, keeping only relevant receipt keys.
 */
function buildPerPrinterConfig(globalCfg, printerConfig) {
    // Extract only the receipt-relevant keys from globalCfg (avoid polluting with centralized_printers etc.)
    const globalReceipt = {
        printer_width: globalCfg.printer_width,
        command_set: globalCfg.command_set,
        template: globalCfg.template,
        font_size: globalCfg.font_size,
        show_logo: globalCfg.show_logo,
        show_order_number: globalCfg.show_order_number,
        show_customer_details: globalCfg.show_customer_details,
        header_text: globalCfg.header_text,
        footer_text: globalCfg.footer_text,
    };
    return {
        printer_width: printerConfig.printer_width || globalReceipt.printer_width || '80mm',
        command_set: printerConfig.command_set || globalReceipt.command_set || 'esc_pos',
        template: printerConfig.template || globalReceipt.template || 'standard',
        font_size: printerConfig.font_size || globalReceipt.font_size || 'medium',
        show_logo: printerConfig.show_logo !== undefined ? printerConfig.show_logo : (globalReceipt.show_logo !== false),
        show_order_number: printerConfig.show_order_number !== undefined ? printerConfig.show_order_number : (globalReceipt.show_order_number !== false),
        show_customer_details: printerConfig.show_customer_details !== undefined ? printerConfig.show_customer_details : (globalReceipt.show_customer_details !== false),
        header_text: printerConfig.header_text !== undefined ? printerConfig.header_text : (globalReceipt.header_text || ''),
        footer_text: printerConfig.footer_text !== undefined ? printerConfig.footer_text : (globalReceipt.footer_text || ''),
        bluetooth_printer: printerConfig.bluetooth_printer || null,
    };
}

/**
 * Send a receipt to a network printer via the networkPrint backend function.
 */
async function printNetworkReceipt(order, restaurant, printerConfig, globalCfg) {
    const cfg = buildPerPrinterConfig(globalCfg, printerConfig);
    const ip = printerConfig.network_ip;
    const port = String(printerConfig.network_port || '9100');
    if (!ip) throw new Error('Printer IP not configured');
    const res = await base44.functions.invoke('networkPrint', {
        action: 'print_receipt',
        printer_ip: ip,
        printer_port: port,
        order,
        restaurant: {
            name: restaurant?.name || '',
            address: restaurant?.address || '',
            phone: restaurant?.phone || '',
            logo_url: restaurant?.logo_url || '',
        },
        config: cfg,
    });
    if (!res.data?.success) throw new Error(res.data?.error || 'Network print failed');
    return true;
}

/**
 * Print an order using the centralized printer config.
 * Respects per-printer template, paper width, command set, and connection type.
 * Falls back to browser/dialog print via the provided fallback function.
 *
 * @param {object}   order
 * @param {object}   restaurant
 * @param {string}   channel          - 'pos_order' | 'kiosk_order' | 'online_order'
 * @param {function} [browserFallback] - called if no printer is available
 * @returns {string|null} name of printer used, or null if fallback was used
 */
export async function printWithCentralizedConfig(order, restaurant, channel, browserFallback) {
    const globalCfg = restaurant?.printer_config || {};
    const centralized = globalCfg.centralized_printers || [];
    const svcs = btServices();

    if (centralized.length > 0) {
        const effectiveChannel = resolveChannel(channel, centralized);
        const assigned = centralized.filter(p =>
            p.enabled !== false && (p.assigned_channels || []).includes(effectiveChannel)
        );
        // If nothing assigned to this channel, fall back to first enabled printer only (not ALL)
        const fallbackPrinters = centralized.filter(p => p.enabled !== false);
        const toTry = assigned.length > 0 ? assigned : (fallbackPrinters.length > 0 ? [fallbackPrinters[0]] : []);

        for (const printerConfig of toTry) {
            // slotIndex is the position in the full centralized array (0-based),
            // used to pick the correct BT service. Only 2 BT services exist (A and B).
            const slotIndex = centralized.indexOf(printerConfig);
            const type = printerConfig.connection_type || 'bluetooth';

            if (type === 'network' && printerConfig.network_ip) {
                // ── Network print via backend function ──
                try {
                    await printNetworkReceipt(order, restaurant, printerConfig, globalCfg);
                    return printerConfig.name || `Network Printer ${slotIndex + 1}`;
                } catch (e) {
                    console.warn(`[printUtils] Network printer failed (${printerConfig.name}):`, e.message);
                    // Continue to try next printer
                }
            } else if (type === 'bluetooth' && printerConfig.bluetooth_printer?.id) {
                // ── Bluetooth print via PrinterService ──
                // BT services only exist for slots 0 and 1 — slots 2+ are network/USB only
                const service = svcs[slotIndex];
                if (!service) {
                    console.warn(`[printUtils] No BT service for slot ${slotIndex} — only 2 BT slots supported`);
                    continue;
                }
                if (!service.isConnected()) await service.tryAutoConnect().catch(() => {});
                if (service.isConnected()) {
                    try {
                        const cfg = buildPerPrinterConfig(globalCfg, printerConfig);
                        await service.printReceipt(order, restaurant, cfg);
                        return printerConfig.name || `Bluetooth Printer ${slotIndex + 1}`;
                    } catch (e) {
                        console.warn(`[printUtils] Bluetooth printer failed (${printerConfig.name}):`, e.message);
                    }
                }
            }
            // USB: not yet supported for direct send — fall through
        }
    } else {
        // ── Legacy single-printer fallback ──
        const cfg = globalCfg;
        if (cfg.printer_type === 'network' && cfg.network_ip) {
            try {
                await printNetworkReceipt(order, restaurant, cfg, cfg);
                return 'Network Printer';
            } catch (e) {
                console.warn('[printUtils] Legacy network printer failed:', e.message);
            }
        }
        // Try Printer A — fall through to B on failure
        if (cfg.bluetooth_printer?.id) {
            if (!printerManager.printerA.isConnected()) await printerManager.printerA.tryAutoConnect().catch(() => {});
            if (printerManager.printerA.isConnected()) {
                try {
                    await printerManager.printerA.printReceipt(order, restaurant, cfg);
                    return 'Bluetooth Printer';
                } catch (e) {
                    console.warn('[printUtils] Legacy BT printer A failed, trying B:', e.message);
                }
            }
        }
        // Try Printer B (only if explicitly configured as printer_b)
        if (cfg.printer_b_config?.bluetooth_printer?.id) {
            if (!printerManager.printerB.isConnected()) await printerManager.printerB.tryAutoConnect().catch(() => {});
            if (printerManager.printerB.isConnected()) {
                try {
                    const bCfg = buildPerPrinterConfig(cfg, cfg.printer_b_config);
                    await printerManager.printerB.printReceipt(order, restaurant, bCfg);
                    return 'Bluetooth Printer B';
                } catch (e) {
                    console.warn('[printUtils] Legacy BT printer B failed:', e.message);
                }
            }
        }
    }

    // No direct printer succeeded — try Android agent queue as last resort before browser fallback
    try {
        const restaurantId = restaurant?.id;
        if (restaurantId) {
            // Use the channel-matched printer config (or first enabled printer as fallback)
            const effectiveChannel = centralized.length > 0 ? resolveChannel(channel, centralized) : null;
            const channelPrinter = effectiveChannel
                ? (centralized.find(p => p.enabled !== false && (p.assigned_channels || []).includes(effectiveChannel)) || centralized.find(p => p.enabled !== false))
                : null;
            const agentPrinterCfg = channelPrinter || centralized[0] || {};

            // Only enqueue if the agent printer has a network IP — the Android agent
            // communicates over network (TCP/IP). Bluetooth-only printers cannot be
            // reached by the agent, so enqueueing them would create ghost jobs.
            const hasNetworkTarget = !!agentPrinterCfg.network_ip;
            if (!hasNetworkTarget) throw new Error('No network printer target for agent queue');

            // Build a clean receipt config — strip non-receipt fields
            const receiptConfig = buildPerPrinterConfig(globalCfg, agentPrinterCfg);

            await base44.functions.invoke('managePrintQueue', {
                action: 'enqueue',
                restaurant_id: restaurantId,
                print_action: 'print_receipt',
                printer_ip: agentPrinterCfg.network_ip || '',
                printer_port: String(agentPrinterCfg.network_port || '9100'),
                command_set: receiptConfig.command_set,
                printer_width: receiptConfig.printer_width,
                template: receiptConfig.template,
                order_data: order,
                restaurant_data: {
                    name: restaurant?.name || '',
                    address: restaurant?.address || '',
                    phone: restaurant?.phone || '',
                    logo_url: restaurant?.logo_url || '',
                },
                config: {
                    printer_width: receiptConfig.printer_width,
                    command_set: receiptConfig.command_set,
                    template: receiptConfig.template,
                    font_size: receiptConfig.font_size,
                    show_logo: receiptConfig.show_logo,
                    show_order_number: receiptConfig.show_order_number,
                    show_customer_details: receiptConfig.show_customer_details,
                    header_text: receiptConfig.header_text,
                    footer_text: receiptConfig.footer_text,
                },
            });
            return 'Android Agent';
        }
    } catch (e) {
        console.warn('[printUtils] Android agent queue failed:', e.message);
    }

    // All methods failed — use browser/dialog fallback
    if (browserFallback) browserFallback();
    return null;
}

/**
 * Open the cash drawer by sending the ESC/POS drawer-open command
 * to the first available configured POS printer (network or Bluetooth).
 */
export async function openCashDrawer(restaurant) {
    const globalCfg = restaurant?.printer_config || {};
    const centralized = globalCfg.centralized_printers || [];
    const svcs = btServices();

    // Find the first pos_order printer
    const candidates = centralized.length > 0
        ? centralized.filter(p => p.enabled !== false && (p.assigned_channels || []).includes('pos_order'))
        : [];
    const toTry = candidates.length > 0 ? candidates : centralized.filter(p => p.enabled !== false);

    for (const printerConfig of toTry) {
        const slotIndex = centralized.indexOf(printerConfig);
        const type = printerConfig.connection_type || 'bluetooth';

        if (type === 'network' && printerConfig.network_ip) {
            // Send a minimal receipt with open_cash_drawer flag (networkPrint appends the drawer command)
            const res = await base44.functions.invoke('networkPrint', {
                action: 'print_receipt',
                printer_ip: printerConfig.network_ip,
                printer_port: String(printerConfig.network_port || '9100'),
                open_cash_drawer: true,
                order: { items: [], subtotal: 0, total: 0, order_type: 'pos', order_number: '-' },
                restaurant: {},
                config: {
                    template: 'minimal',
                    command_set: printerConfig.command_set || globalCfg.command_set || 'esc_pos',
                    show_order_number: false,
                    show_customer_details: false,
                },
            });
            if (res.data?.success) return true;
        } else if (type === 'bluetooth' && printerConfig.bluetooth_printer?.id) {
            const service = svcs[slotIndex];
            if (!service) continue;
            if (!service.isConnected()) await service.tryAutoConnect().catch(() => {});
            if (service.isConnected()) {
                // Send raw cash drawer ESC/POS bytes directly
                const CASH_DRAWER_CMD = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
                await service.sendCommand(CASH_DRAWER_CMD);
                return true;
            }
        }
    }

    // Legacy fallback
    if (globalCfg.network_ip) {
        const res = await base44.functions.invoke('networkPrint', {
            action: 'print_receipt',
            printer_ip: globalCfg.network_ip,
            printer_port: String(globalCfg.network_port || '9100'),
            open_cash_drawer: true,
            order: { items: [], subtotal: 0, total: 0, order_type: 'pos', order_number: '-' },
            restaurant: {},
            config: {
                template: 'minimal',
                command_set: globalCfg.command_set || 'esc_pos',
                show_order_number: false,
                show_customer_details: false,
            },
        });
        if (res.data?.success) return true;
    }
    if (printerManager.printerA.isConnected()) {
        const CASH_DRAWER_CMD = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
        await printerManager.printerA.sendCommand(CASH_DRAWER_CMD);
        return true;
    }

    throw new Error('No connected printer found to open cash drawer');
}

/**
 * Returns true if any printer is assigned to the given channel.
 */
export function hasPrinterForChannel(restaurant, channel) {
    const cfg = restaurant?.printer_config || {};
    const centralized = cfg.centralized_printers || [];
    if (centralized.length > 0) {
        return centralized.some(p => p.enabled !== false && (p.assigned_channels || []).includes(channel));
    }
    return !!(cfg.bluetooth_printer?.id || cfg.network_ip);
}