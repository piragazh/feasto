/**
 * Centralized print utility — the SINGLE dispatch point for printing an
 * order receipt / kitchen ticket, regardless of where the order came from
 * (POS, kiosk, online) or which app screen configured the printer.
 *
 * Data model: restaurant.printer_config.centralized_printers[] is the one
 * source of truth for printer configuration. Every printer entry has:
 *   - connection_type: 'qz_tray' | 'bluetooth' | 'network' | 'usb'
 *   - role:            'receipt' | 'kitchen'   (kitchen tickets omit prices)
 *   - assigned_channels: any of 'online_order' | 'pos_order' | 'kiosk_order'
 * See CentralizedPrinterSettings.jsx for the settings UI that manages this
 * array (used both from the Restaurant Dashboard "Printers" tab and from
 * POS Settings — there is only one printer list, not two).
 *
 * Unlike the old "try printers one at a time, stop at first success" logic,
 * printWithCentralizedConfig() BROADCASTS to every enabled printer assigned
 * to the resolved channel — so a receipt printer and a kitchen printer can
 * both be assigned to 'pos_order' and both get a copy automatically.
 */
import { printerManager } from '@/components/restaurant/PrinterService';
import { base44 } from '@/api/base44Client';
import qzTrayService from '@/lib/qzTrayService';
import { buildCashDrawerBytes } from '@/lib/escpos';

// Only two physical Bluetooth radios/services exist in this app (Web Bluetooth
// has no concept of "N devices" beyond what we've wired up). A printer's
// *position among bluetooth-type printers* (not its raw position in the full
// list) determines which slot it gets — this fixes the earlier bug where a
// network printer occupying an earlier array index could push a real
// bluetooth printer past the 2 available hardware slots.
const BT_SLOTS = [printerManager.printerA, printerManager.printerB];

/**
 * Resolve the effective printer channel — kiosk falls back to online_order
 * if no kiosk_order printer is explicitly configured.
 */
function resolveChannel(channel, printers) {
    if (
        channel === 'kiosk_order' &&
        !printers.some(p => (p.assigned_channels || []).includes('kiosk_order'))
    ) {
        return 'online_order';
    }
    return channel;
}

/**
 * Build the per-printer receipt config. Merges defaults → legacy global
 * fields (for restaurants that haven't migrated yet) → per-printer fields.
 * Passes `role` through so byte-builders can render a prices-free kitchen
 * ticket instead of a customer receipt.
 */
function buildPerPrinterConfig(globalCfg, printerConfig) {
    const legacy = {
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
        printer_width: printerConfig.printer_width || legacy.printer_width || '80mm',
        command_set: printerConfig.command_set || legacy.command_set || 'esc_pos',
        template: printerConfig.template || legacy.template || 'standard',
        font_size: printerConfig.font_size || legacy.font_size || 'medium',
        show_logo: printerConfig.show_logo !== undefined ? printerConfig.show_logo : (legacy.show_logo !== false),
        show_order_number: printerConfig.show_order_number !== undefined ? printerConfig.show_order_number : (legacy.show_order_number !== false),
        show_customer_details: printerConfig.show_customer_details !== undefined ? printerConfig.show_customer_details : (legacy.show_customer_details !== false),
        header_text: printerConfig.header_text !== undefined ? printerConfig.header_text : (legacy.header_text || ''),
        footer_text: printerConfig.footer_text !== undefined ? printerConfig.footer_text : (legacy.footer_text || ''),
        bluetooth_printer: printerConfig.bluetooth_printer || null,
        role: printerConfig.role || 'receipt',
    };
}

function restaurantPayload(restaurant) {
    return {
        name: restaurant?.name || '',
        address: restaurant?.address || '',
        phone: restaurant?.phone || '',
        logo_url: restaurant?.logo_url || '',
    };
}

/** Which of the 2 Bluetooth hardware slots (if any) a bluetooth-type printer maps to. */
function resolveBtService(printers, printerConfig) {
    const btPrinters = printers.filter(p => (p.connection_type || 'bluetooth') === 'bluetooth');
    const btIndex = btPrinters.indexOf(printerConfig);
    if (btIndex === -1 || btIndex >= BT_SLOTS.length) return null;
    return BT_SLOTS[btIndex];
}

async function printViaQz(order, restaurant, printerConfig, globalCfg, openCashDrawer = false) {
    if (!printerConfig.qz_printer_name) throw new Error('QZ Tray printer name not set for this printer');
    if (!qzTrayService.isConnected()) {
        await qzTrayService.connect();
    }
    if (!qzTrayService.isConnected()) {
        throw new Error(qzTrayService.getStatus().lastError || 'QZ Tray is not connected');
    }
    const cfg = buildPerPrinterConfig(globalCfg, printerConfig);
    await qzTrayService.printReceipt(printerConfig.qz_printer_name, order, restaurant, cfg, openCashDrawer);
}

async function printViaBluetooth(order, restaurant, printerConfig, globalCfg, printers) {
    const service = resolveBtService(printers, printerConfig);
    if (!service) throw new Error('No Bluetooth hardware slot available (max 2 Bluetooth printers) — switch this printer to Network or QZ Tray');
    if (!printerConfig.bluetooth_printer?.id) throw new Error('No Bluetooth printer paired for this slot');
    if (!service.isConnected()) await service.tryAutoConnect().catch(() => {});
    if (!service.isConnected()) throw new Error('Bluetooth printer not connected on this device');
    const cfg = buildPerPrinterConfig(globalCfg, printerConfig);
    await service.printReceipt(order, restaurant, cfg);
}

/**
 * Network printers are almost never directly reachable from the cloud (they
 * sit behind a router on a private IP) — see NetworkPrinterManager's own UI
 * copy for the full explanation. So the reliable, primary path here is the
 * print-job queue: a Local Print Agent (desktop) or Android Print Agent
 * (tablet) running inside the restaurant polls this queue and delivers the
 * job to the printer over the LAN. We still attempt a quick direct send
 * first in case the printer genuinely is cloud-reachable (rare, e.g. port
 * forwarded), but we never block success on that — we always fall through
 * to the queue rather than surfacing a failure the agent could have handled.
 */
async function printViaNetwork(order, restaurant, printerConfig, globalCfg, { openCashDrawer = false } = {}) {
    if (!printerConfig.network_ip) throw new Error('Printer IP not configured');
    const cfg = buildPerPrinterConfig(globalCfg, printerConfig);

    try {
        const res = await base44.functions.invoke('networkPrint', {
            action: 'print_receipt',
            printer_ip: printerConfig.network_ip,
            printer_port: String(printerConfig.network_port || '9100'),
            open_cash_drawer: openCashDrawer,
            order,
            restaurant: restaurantPayload(restaurant),
            config: cfg,
        });
        if (res.data?.success) return 'network';
    } catch (e) {
        // Expected for LAN-only printers — fall through to the agent queue.
    }

    const queued = await base44.functions.invoke('managePrintQueue', {
        action: 'enqueue',
        restaurant_id: restaurant?.id,
        print_action: 'print_receipt',
        printer_ip: printerConfig.network_ip,
        printer_port: String(printerConfig.network_port || '9100'),
        open_cash_drawer: openCashDrawer,
        command_set: cfg.command_set,
        printer_width: cfg.printer_width,
        template: cfg.template,
        order_data: order,
        restaurant_data: restaurantPayload(restaurant),
        config: cfg,
    });
    if (!queued?.data) throw new Error('Could not reach the printer directly and could not queue the job for an agent either — check your connection');
    return 'agent_queue';
}

/**
 * Print an order to every enabled printer assigned to the given channel —
 * e.g. a receipt printer AND a kitchen printer both assigned to 'pos_order'
 * will both receive a copy of the same order.
 *
 * @param {object}   order
 * @param {object}   restaurant
 * @param {string}   channel          - 'pos_order' | 'kiosk_order' | 'online_order'
 * @param {function} [browserFallback] - called only if NOTHING printed successfully
 * @returns {{printed: Array<{name:string,role:string,method:string}>, failed: Array<{name:string,role:string,error:string}>, usedFallback: boolean}}
 */
export async function printWithCentralizedConfig(order, restaurant, channel, browserFallback) {
    const globalCfg = restaurant?.printer_config || {};
    const printers = globalCfg.centralized_printers || [];
    const printed = [];
    const failed = [];

    if (printers.length > 0) {
        const effectiveChannel = resolveChannel(channel, printers);
        let matched = printers.filter(p => p.enabled !== false && (p.assigned_channels || []).includes(effectiveChannel));
        // Nothing explicitly assigned to this channel — fall back to the first
        // enabled printer only (not all of them), same as before.
        if (matched.length === 0) {
            const anyEnabled = printers.filter(p => p.enabled !== false);
            if (anyEnabled.length > 0) matched = [anyEnabled[0]];
        }

        for (const printerConfig of matched) {
            const type = printerConfig.connection_type || 'bluetooth';
            const role = printerConfig.role || 'receipt';
            const name = printerConfig.name || `Printer (${type})`;
            try {
                if (type === 'qz_tray') {
                    await printViaQz(order, restaurant, printerConfig, globalCfg);
                    printed.push({ name, role, method: 'qz_tray' });
                } else if (type === 'bluetooth') {
                    await printViaBluetooth(order, restaurant, printerConfig, globalCfg, printers);
                    printed.push({ name, role, method: 'bluetooth' });
                } else if (type === 'network') {
                    const method = await printViaNetwork(order, restaurant, printerConfig, globalCfg);
                    printed.push({ name, role, method });
                } else if (type === 'usb') {
                    throw new Error('Direct USB printing is not implemented yet — use Network with a Local Print Agent on the PC the USB printer is plugged into instead.');
                } else {
                    throw new Error(`Unknown connection type: ${type}`);
                }
            } catch (e) {
                console.warn(`[printUtils] ${name} (${type}/${role}) failed:`, e?.message || e);
                failed.push({ name, role, error: e?.message || String(e) });
            }
        }
    } else {
        // Restaurant has never configured a printer via the Printers screen.
        console.warn('[printUtils] No printers configured (printer_config.centralized_printers is empty)');
    }

    if (printed.length === 0) {
        if (browserFallback) browserFallback();
        return { printed, failed, usedFallback: true };
    }
    return { printed, failed, usedFallback: false };
}

/**
 * Open the cash drawer by sending the ESC/POS drawer-open command to the
 * first available printer assigned to 'pos_order' (prefers QZ Tray, then
 * Bluetooth, then Network).
 */
export async function openCashDrawer(restaurant) {
    const globalCfg = restaurant?.printer_config || {};
    const printers = globalCfg.centralized_printers || [];
    const candidates = printers.filter(p => p.enabled !== false && (p.assigned_channels || []).includes('pos_order'));
    const toTry = candidates.length > 0 ? candidates : printers.filter(p => p.enabled !== false);

    // Prefer QZ Tray if any candidate uses it — instant, no LAN round-trip.
    const ordered = [...toTry].sort((a, b) => {
        const rank = t => (t === 'qz_tray' ? 0 : t === 'bluetooth' ? 1 : 2);
        return rank(a.connection_type || 'bluetooth') - rank(b.connection_type || 'bluetooth');
    });

    // A no-sale drawer open must send ONLY the kick-out pulse. Routing it
    // through the receipt builder (as this used to for QZ Tray) prints a blank
    // dummy receipt on every cash sale - wasted paper on every transaction.
    const drawerBytes = buildCashDrawerBytes();
    let lastError = null;

    for (const printerConfig of ordered) {
        const type = printerConfig.connection_type || 'bluetooth';
        try {
            if (type === 'qz_tray') {
                if (!printerConfig.qz_printer_name) continue;
                if (!qzTrayService.isConnected()) await qzTrayService.connect();
                if (!qzTrayService.isConnected()) throw new Error(qzTrayService.getStatus().lastError || 'QZ Tray is not connected');
                await qzTrayService.print(printerConfig.qz_printer_name, drawerBytes);
                return true;
            } else if (type === 'bluetooth') {
                const service = resolveBtService(printers, printerConfig);
                if (!service) continue;
                if (!service.isConnected()) await service.tryAutoConnect().catch(() => {});
                if (!service.isConnected()) continue;
                await service.sendCommand(drawerBytes);
                return true;
            } else if (type === 'network') {
                await printViaNetwork(dummyOrder, restaurant, printerConfig, globalCfg, { openCashDrawer: true });
                return true;
            }
        } catch (e) {
            lastError = e;
        }
    }

    throw new Error(lastError?.message || 'No connected printer found to open cash drawer');
}

/**
 * Returns true if any enabled printer is assigned to the given channel.
 */
export function hasPrinterForChannel(restaurant, channel) {
    const cfg = restaurant?.printer_config || {};
    const printers = cfg.centralized_printers || [];
    return printers.some(p => p.enabled !== false && (p.assigned_channels || []).includes(channel));
}

/**
 * Resolve the printer that should be used for POS-only utility print jobs
 * that aren't a per-order receipt — End of Day reports, shift reports, etc.
 * Prefers a 'receipt'-role printer assigned to pos_order; falls back to any
 * enabled pos_order printer. Used by POSEndOfDay.jsx and POSReports.jsx so
 * they read the SAME printer list as real order receipts do, instead of
 * their own separate (and easily out-of-sync) legacy fields.
 *
 * @returns {object|null} the printer config entry, or null if none configured
 */
export function resolvePosUtilityPrinter(restaurant) {
    const cfg = restaurant?.printer_config || {};
    const printers = cfg.centralized_printers || [];
    const posPrinters = printers.filter(p => p.enabled !== false && (p.assigned_channels || []).includes('pos_order'));
    if (posPrinters.length === 0) return null;
    return posPrinters.find(p => (p.role || 'receipt') === 'receipt') || posPrinters[0];
}

/**
 * Print arbitrary pre-built ESC/POS bytes (used by EOD/shift reports, which
 * build their own report layout) to the resolved POS utility printer.
 * Routes through QZ Tray (preferred) or Bluetooth — reports are a POS-only
 * concern and are not queued to a network agent.
 *
 * @param {object} restaurant
 * @param {Uint8Array} bytes
 * @returns {Promise<string>} the name of the printer used
 */
export async function printRawBytesToPosPrinter(restaurant, bytes) {
    const printer = resolvePosUtilityPrinter(restaurant);
    if (!printer) throw new Error('No POS printer configured. Set one up in Settings > Printing.');

    const type = printer.connection_type || 'bluetooth';
    if (type === 'qz_tray') {
        if (!printer.qz_printer_name) throw new Error('QZ Tray printer name not set');
        if (!qzTrayService.isConnected()) await qzTrayService.connect();
        if (!qzTrayService.isConnected()) throw new Error(qzTrayService.getStatus().lastError || 'QZ Tray is not connected');
        await qzTrayService.print(printer.qz_printer_name, bytes);
        return printer.name || 'QZ Tray printer';
    }
    if (type === 'bluetooth') {
        const list = (restaurant?.printer_config?.centralized_printers) || [];
        const service = resolveBtService(list, printer);
        if (!service) throw new Error('No Bluetooth hardware slot available for this printer');
        if (!printer.bluetooth_printer?.id) throw new Error('No Bluetooth printer paired');
        if (!service.isConnected()) await service.tryAutoConnect().catch(() => {});
        if (!service.isConnected()) throw new Error('Bluetooth printer not connected');
        await service.sendCommand(bytes);
        return printer.name || 'Bluetooth printer';
    }
    throw new Error(`Reports can only print via QZ Tray or Bluetooth — this printer is set to "${type}". Assign a QZ Tray or Bluetooth printer to POS Orders, or use Export CSV instead.`);
}
