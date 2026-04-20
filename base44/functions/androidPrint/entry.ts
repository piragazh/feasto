import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * androidPrint — backend function that acts as a relay to the Android PrintService app.
 *
 * The Android app runs an HTTP server on the local tablet (default: http://<tablet-ip>:8080).
 * This function:
 *   1. Accepts a print request from the web frontend (with order/config data).
 *   2. Generates ESC/POS bytes via the same helpers used in networkPrint.
 *   3. Base64-encodes them.
 *   4. POSTs to the Android app's /print endpoint on the local network.
 *
 * The Android app then relays the bytes to the physical printer via TCP, Bluetooth, or USB.
 */

const ESC = 0x1B;
const GS = 0x1D;

// ESC/POS cash drawer open command (works on both drawer pin 2 and pin 5)
// ESC p <pin> <on-time> <off-time>
const CASH_DRAWER_CMD = [ESC, 0x70, 0x00, 0x19, 0xFA];

function buildCommands(commandSet = 'esc_pos') {
    const sets = {
        esc_pos:     { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45,0x01], boldOff: [ESC,0x45,0x00], cut: [GS,0x56,0x41,0x00], doubleHeight: [ESC,0x21,0x10], normal: [ESC,0x21,0x00] },
        esc_pos_star: { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45],      boldOff: [ESC,0x46],      cut: [ESC,0x64,0x03], doubleHeight: [ESC,0x21,0x10], normal: [ESC,0x21,0x00] },
        esc_bixolon: { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45,0x01], boldOff: [ESC,0x45,0x00], cut: [GS,0x56,0x00],       doubleHeight: [GS,0x21,0x11],  normal: [GS,0x21,0x00] },
        epson_tm:    { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45,0x01], boldOff: [ESC,0x45,0x00], cut: [GS,0x56,0x41,0x03], doubleHeight: [ESC,0x21,0x30], normal: [ESC,0x21,0x00] },
    };
    return sets[commandSet] || sets.esc_pos;
}

const encoder = new TextEncoder();

function bytes(...args) {
    const arrays = args.map(a => Array.isArray(a) ? new Uint8Array(a) : encoder.encode(a));
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) { out.set(a, offset); offset += a.length; }
    return out;
}

function buildCashDrawerBytes() {
    return new Uint8Array(CASH_DRAWER_CMD);
}

function buildReceiptBytes(order, restaurant, config, openCashDrawer = false) {
    const cmd = buildCommands(config.command_set);
    const lineWidth = (config.printer_width === '58mm') ? 32 : 48;
    const chunks = [];
    const add = (...parts) => chunks.push(bytes(...parts));

    add(cmd.init);
    add(cmd.alignCenter, cmd.boldOn);
    add(`${restaurant?.name || 'ORDER'}\n`);
    add(cmd.boldOff, cmd.normal);

    if (restaurant?.address && config.template !== 'compact') {
        add(`${restaurant.address}\n`);
    }
    add(cmd.alignLeft);
    add('================================\n');

    if (config.header_text) {
        add(`${config.header_text}\n`);
        add('================================\n');
    }

    if (config.show_order_number !== false) {
        add(cmd.boldOn, cmd.alignCenter);
        const orderNum = order.order_number || `#${(order.id || '').slice(-6)}`;
        add(`ORDER ${orderNum}\n`);
        add(cmd.normal, cmd.boldOff, cmd.alignLeft);
    }

    if (config.template !== 'compact') {
        add(`${new Date(order.created_date || Date.now()).toLocaleString()}\n`);
    }
    const orderTypeLabel = order.order_type
        ? order.order_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : (order.order_source === 'pos' ? 'POS' : 'Delivery');
    add(`Type: ${orderTypeLabel}\n`);
    add('--------------------------------\n');

    if (config.show_customer_details !== false && config.template !== 'compact') {
        add(cmd.boldOn, 'Customer:\n', cmd.boldOff);
        const customerName = order.guest_name || order.created_by || 'N/A';
        add(`${customerName}\n`);
        if (order.phone) add(`Tel: ${order.phone}\n`);
        if (order.delivery_address) add(`${order.delivery_address}\n`);
        add('--------------------------------\n');
    }

    for (const item of (order.items || [])) {
        const itemName = `${item.quantity}x ${item.name}`;
        const price = `£${((item.price || 0) * item.quantity).toFixed(2)}`;
        const padding = Math.max(1, lineWidth - itemName.length - price.length);
        add(`${itemName}${' '.repeat(padding)}${price}\n`);
        if (item.customizations && config.template === 'detailed') {
            for (const [k, v] of Object.entries(item.customizations)) {
                if (typeof v !== 'object') add(`  ${k}: ${v}\n`);
            }
        }
    }

    add('================================\n');
    const totalStr = `£${(order.total || 0).toFixed(2)}`;
    add(cmd.boldOn);
    add(`TOTAL:${' '.repeat(Math.max(1, lineWidth - 6 - totalStr.length))}${totalStr}\n`);
    add(cmd.normal, cmd.boldOff);

    if (order.notes) {
        add('--------------------------------\n');
        add(`Notes: ${order.notes}\n`);
    }

    if (config.footer_text) {
        add('================================\n');
        add(cmd.alignCenter, `${config.footer_text}\n`, cmd.alignLeft);
    }

    add('================================\n');
    add(cmd.alignCenter, 'Thank you!\n\n\n');
    add(cmd.cut);
    if (openCashDrawer) chunks.push(new Uint8Array(CASH_DRAWER_CMD));

    const total_len = chunks.reduce((n, c) => n + c.length, 0);
    const buf = new Uint8Array(total_len);
    let offset = 0;
    for (const c of chunks) { buf.set(c, offset); offset += c.length; }
    return buf;
}

function buildTestBytes(commandSet) {
    const cmd = buildCommands(commandSet);
    const now = new Date().toLocaleString();
    const chunks = [];
    const add = (...parts) => chunks.push(bytes(...parts));

    add(cmd.init, cmd.alignCenter, cmd.boldOn, cmd.doubleHeight);
    add('ANDROID PRINT TEST\n');
    add(cmd.normal, cmd.boldOff);
    add('================================\n');
    add(cmd.alignLeft);
    add(`Time:    ${now}\n`);
    add(`Mode:    Android PrintService\n`);
    add('================================\n');
    add(cmd.boldOn, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\n', cmd.boldOff);
    add('1234567890 !@#$%^&*()_+-=[]\n');
    add('================================\n');
    add(cmd.alignCenter, 'Android bridge connected!\n\n\n');
    add(cmd.cut);

    const total_len = chunks.reduce((n, c) => n + c.length, 0);
    const buf = new Uint8Array(total_len);
    let offset = 0;
    for (const c of chunks) { buf.set(c, offset); offset += c.length; }
    return buf;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const {
            action,            // 'test' | 'print_receipt' | 'ping'
            tablet_ip,         // IP address of the Android tablet on the LAN
            tablet_port,       // Port the Android HTTP server is listening on (default: 8080)
            printer_ip,        // Forwarded to Android app — the actual printer IP
            printer_port,      // Forwarded to Android app — the printer port (default: 9100)
            command_set,
            order,
            restaurant,
            config,
            open_cash_drawer,  // boolean — if true, appends ESC/POS cash drawer open command after cut
        } = body;

        if (!tablet_ip) {
            return Response.json({ error: 'tablet_ip is required' }, { status: 400 });
        }

        const androidPort = tablet_port || 8080;
        const androidBaseUrl = `http://${tablet_ip}:${androidPort}`;

        // ── PING: just check if the Android app is reachable ──────────────
        if (action === 'ping') {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            try {
                const res = await fetch(`${androidBaseUrl}/ping`, { signal: controller.signal });
                clearTimeout(timer);
                const text = await res.text().catch(() => '');
                return Response.json({ success: true, message: `Android PrintService is reachable at ${androidBaseUrl}`, response: text });
            } catch (e) {
                clearTimeout(timer);
                return Response.json({ success: false, message: `Cannot reach Android PrintService at ${androidBaseUrl} — ${e.message}` });
            }
        }

        // ── Build ESC/POS bytes ────────────────────────────────────────────
        let rawBytes;
        if (action === 'test') {
            rawBytes = buildTestBytes(command_set || 'esc_pos');
        } else if (action === 'print_receipt') {
            if (!order) return Response.json({ error: 'order is required for print_receipt' }, { status: 400 });
            const mergedConfig = {
                printer_width: '80mm',
                command_set: 'esc_pos',
                template: 'standard',
                show_order_number: true,
                show_customer_details: true,
                header_text: '',
                footer_text: '',
                ...(config || {}),
            };
            rawBytes = buildReceiptBytes(order, restaurant || {}, mergedConfig, !!open_cash_drawer);
        } else {
            return Response.json({ error: 'action must be: test, print_receipt, ping' }, { status: 400 });
        }

        // ── Base64-encode and POST to Android app ─────────────────────────
        const base64Data = btoa(String.fromCharCode(...rawBytes));

        const payload = {
            base64EscPosData: base64Data,
            printerIp: printer_ip || null,
            printerPort: printer_port || '9100',
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        let androidRes;
        try {
            androidRes = await fetch(`${androidBaseUrl}/print`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
        } catch (e) {
            clearTimeout(timer);
            return Response.json({
                error: `Could not reach Android PrintService at ${androidBaseUrl}. Make sure the app is running on the tablet and both devices are on the same Wi-Fi network. Details: ${e.message}`
            }, { status: 502 });
        }
        clearTimeout(timer);

        const responseText = await androidRes.text().catch(() => '');
        let responseData = {};
        try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

        if (!androidRes.ok) {
            return Response.json({ error: `Android PrintService returned ${androidRes.status}`, details: responseData }, { status: 502 });
        }

        return Response.json({
            success: true,
            message: `Print job sent to Android PrintService at ${androidBaseUrl}`,
            android_response: responseData,
            bytes_sent: rawBytes.length,
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});