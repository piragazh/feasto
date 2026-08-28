import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ESC/POS command builder helpers
const ESC = 0x1B;
const GS = 0x1D;

// ESC/POS cash drawer open command (works on both drawer pin 2 and pin 5)
// ESC p <pin> <on-time> <off-time>
const CASH_DRAWER_CMD = [ESC, 0x70, 0x00, 0x19, 0xFA];

function buildCommands(commandSet = 'esc_pos') {
    const sets = {
        esc_pos:      { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45,0x01], boldOff: [ESC,0x45,0x00], cut: [GS,0x56,0x41,0x00], doubleHeight: [ESC,0x21,0x10], normal: [ESC,0x21,0x00] },
        esc_pos_star:  { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45],      boldOff: [ESC,0x46],      cut: [ESC,0x64,0x03], doubleHeight: [ESC,0x21,0x10], normal: [ESC,0x21,0x00] },
        esc_bixolon:  { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45,0x01], boldOff: [ESC,0x45,0x00], cut: [GS,0x56,0x00],       doubleHeight: [GS,0x21,0x11],  normal: [GS,0x21,0x00] },
        epson_tm:     { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45,0x01], boldOff: [ESC,0x45,0x00], cut: [GS,0x56,0x41,0x03], doubleHeight: [ESC,0x21,0x30], normal: [ESC,0x21,0x00] },
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

// Byte-aware length — £ encodes as 2 bytes (0xC2 0xA3) but counts as 1 JS char,
// causing the padding to be 1 byte too short and the last price digit to wrap.
function byteLen(str) {
    return encoder.encode(str).length;
}

// Helper: pad a string to fill lineWidth with value right-aligned
function rPad(label, value, lineWidth) {
    const pad = Math.max(1, lineWidth - byteLen(label) - byteLen(value));
    return `${label}${' '.repeat(pad)}${value}`;
}

// Helper: wrap long text to lineWidth, returning array of lines
function wrapText(text, lineWidth) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
        if ((current + (current ? ' ' : '') + word).length <= lineWidth) {
            current += (current ? ' ' : '') + word;
        } else {
            if (current) lines.push(current);
            // If single word is too long, hard-break it
            if (word.length > lineWidth) {
                for (let i = 0; i < word.length; i += lineWidth) lines.push(word.slice(i, i + lineWidth));
                current = '';
            } else {
                current = word;
            }
        }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
}

// Helper: format customizations into readable strings
function formatCustomizations(item) {
    const lines = [];
    if (!item.customizations || typeof item.customizations !== 'object') return lines;

    for (const [key, val] of Object.entries(item.customizations)) {
        let displayVal = '';

        if (key.includes('meal_customizations') && typeof val === 'object' && !Array.isArray(val)) {
            // Nested meal customizations
            for (const [mKey, mVal] of Object.entries(val)) {
                const v = Array.isArray(mVal) ? mVal.join(', ') : String(mVal);
                if (v) lines.push(`  + ${mKey.replace(/_/g, ' ')}: ${v}`);
            }
            continue;
        }

        if (Array.isArray(val)) {
            displayVal = val.join(', ');
        } else if (typeof val === 'object' && val !== null) {
            displayVal = val.selection ? String(val.selection) : JSON.stringify(val);
        } else {
            displayVal = String(val);
        }

        if (displayVal && displayVal !== 'null') {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            lines.push(`  + ${label}: ${displayVal}`);
        }
    }
    return lines;
}

function buildReceiptBytes(order, restaurant, config, openCashDrawer = false) {
    const cmd = buildCommands(config.command_set);
    const W = (config.printer_width === '58mm') ? 32 : 48;  // line width chars
    const isCompact = config.template === 'compact';
    const isMinimal = config.template === 'minimal';
    // Kitchen tickets are item-focused and never show prices/totals/payment.
    const isKitchen = config.role === 'kitchen';
    const chunks = [];
    const add = (...parts) => chunks.push(bytes(...parts));
    const line  = (char = '-') => add(`${char.repeat(W)}\n`);
    const blank = () => add('\n');

    // ══════════════════════════════════════════
    //  HEADER — Restaurant name + address
    // ══════════════════════════════════════════
    add(cmd.init);
    add(cmd.alignCenter, cmd.boldOn, cmd.doubleHeight);
    add(`${(restaurant?.name || 'ORDER').toUpperCase()}\n`);
    add(cmd.normal, cmd.boldOff);

    if (restaurant?.address && restaurant.address !== 'null' && !isCompact) {
        add(`${restaurant.address}\n`);
    }
    if (config.header_text) {
        blank();
        add(`${config.header_text}\n`);
    }

    // ══════════════════════════════════════════
    //  ORDER NUMBER — Big & bold for rush-hour
    // ══════════════════════════════════════════
    if (config.show_order_number !== false) {
        line('=');
        add(cmd.boldOn, cmd.doubleHeight, cmd.alignCenter);
        const orderNum = order.order_number || `#${(order.id || '').slice(-6)}`;
        add(`ORDER ${orderNum}\n`);
        add(cmd.normal, cmd.boldOff, cmd.alignLeft);
    }

    // ══════════════════════════════════════════
    //  ORDER META — Type, time, source
    // ══════════════════════════════════════════
    line('=');

    const orderTypeLabel = order.order_type
        ? order.order_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : (order.order_source === 'pos' ? 'POS' : order.order_source === 'kiosk' ? 'Kiosk' : 'Delivery');

    // Order type in bold — most important operational field
    add(cmd.boldOn);
    add(`>>> ${orderTypeLabel.toUpperCase()} <<<\n`);
    add(cmd.boldOff);

    if (!isCompact) {
        const dt = new Date(order.created_date || Date.now());
        const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
        const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Europe/London' });
        add(`Time: ${timeStr}  Date: ${dateStr}\n`);
    }

    if (order.table_number) {
        add(cmd.boldOn);
        add(`TABLE: ${order.table_number}\n`);
        add(cmd.boldOff);
    }

    // ══════════════════════════════════════════
    //  CUSTOMER DETAILS
    // ══════════════════════════════════════════
    if (config.show_customer_details !== false && !isCompact) {
        line('-');
        const customerName = (order.guest_name && order.guest_name !== 'null')
            ? order.guest_name
            : (order.customer_email && !order.customer_email.includes('@base44') && order.customer_email !== 'null')
                ? order.customer_email
                : null;

        if (customerName) {
            add(cmd.boldOn);
            add(`${customerName}\n`);
            add(cmd.boldOff);
        }
        if (order.phone && order.phone !== 'null') {
            add(`Tel: ${order.phone}\n`);
        }
        if (order.delivery_address && order.delivery_address !== 'null' && order.order_type === 'delivery') {
            const addrLines = wrapText(`Addr: ${order.delivery_address}`, W);
            for (const l of addrLines) add(`${l}\n`);
        }
    }

    // ══════════════════════════════════════════
    //  SPECIAL NOTES — Highlighted first
    // ══════════════════════════════════════════
    if (order.notes) {
        line('*');
        add(cmd.boldOn);
        add(`!! NOTES: ${order.notes}\n`);
        add(cmd.boldOff);
        line('*');
    }

    // ══════════════════════════════════════════
    //  ITEMS — Clear, numbered, with customizations
    // ══════════════════════════════════════════
    line('=');
    add(cmd.boldOn);
    add(`ITEMS (${(order.items || []).length})\n`);
    add(cmd.boldOff);
    line('-');

    if (isKitchen) {
        add(cmd.alignCenter, cmd.boldOn);
        add('*** KITCHEN TICKET ***\n');
        add(cmd.boldOff, cmd.alignLeft);
    }

    const items = order.items || [];
    items.forEach((item, idx) => {
        const qty = item.quantity || 1;
        const itemLabel = `${idx + 1}. ${qty}x ${item.name}`;

        if (isKitchen) {
            // Kitchen tickets: no price, larger text — what to make, not what it costs.
            add(cmd.boldOn, cmd.doubleHeight);
            const nameLines = wrapText(itemLabel, W);
            for (const nl of nameLines) add(`${nl}\n`);
            add(cmd.normal, cmd.boldOff);
        } else {
            const itemPrice = `\xA3${((item.price || 0) * qty).toFixed(2)}`;
            // Item name — bold, with price right-aligned
            add(cmd.boldOn);
            if (byteLen(itemLabel) + byteLen(itemPrice) + 1 <= W) {
                add(`${rPad(itemLabel, itemPrice, W)}\n`);
            } else {
                // Name too long — wrap it, price on its own line
                const nameLines = wrapText(itemLabel, W);
                for (const nl of nameLines) add(`${nl}\n`);
                add(`${' '.repeat(Math.max(0, W - itemPrice.length))}${itemPrice}\n`);
            }
            add(cmd.boldOff);
        }

        // Customizations — clearly indented
        const custLines = formatCustomizations(item);
        for (const cl of custLines) {
            add(`${cl}\n`);
        }

        // Blank line between items for readability (skip after last)
        if (idx < items.length - 1) blank();
    });

    // ══════════════════════════════════════════
    //  TOTALS
    // ══════════════════════════════════════════
    line('=');

    if (!isKitchen && !isCompact && !isMinimal) {
        const sub = `\xA3${(order.subtotal || 0).toFixed(2)}`;
        add(`${rPad('Subtotal:', sub, W)}\n`);
        if ((order.delivery_fee || 0) > 0) {
            const fee = `\xA3${order.delivery_fee.toFixed(2)}`;
            add(`${rPad('Delivery:', fee, W)}\n`);
        }
        if ((order.small_order_surcharge || 0) > 0) {
            const sur = `\xA3${order.small_order_surcharge.toFixed(2)}`;
            add(`${rPad('Surcharge:', sur, W)}\n`);
        }
        if ((order.discount || 0) > 0) {
            const disc = `-\xA3${order.discount.toFixed(2)}`;
            add(`${rPad('Discount:', disc, W)}\n`);
        }
        line('-');
    }

    if (!isKitchen) {
        // TOTAL — double height for instant visibility
        add(cmd.boldOn, cmd.doubleHeight, cmd.alignCenter);
        add(`TOTAL: \xA3${(order.total || 0).toFixed(2)}\n`);
        add(cmd.normal, cmd.boldOff, cmd.alignLeft);

        if (!isMinimal) {
            const payLabel = (order.payment_method || 'N/A').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            add(`Payment: ${payLabel}\n`);
        }
    }

    // ══════════════════════════════════════════
    //  FOOTER
    // ══════════════════════════════════════════
    if (config.footer_text && !isKitchen) {
        line('=');
        add(cmd.alignCenter);
        add(`${config.footer_text}\n`);
        add(cmd.alignLeft);
    }

    line('=');
    add(cmd.alignCenter);
    add('Thank you!\n\n\n');
    add(cmd.cut);
    if (openCashDrawer) add(new Uint8Array(CASH_DRAWER_CMD));

    // Merge all chunks into one buffer
    const total_len = chunks.reduce((n, c) => n + c.length, 0);
    const buf = new Uint8Array(total_len);
    let offset = 0;
    for (const c of chunks) { buf.set(c, offset); offset += c.length; }
    return buf;
}

function buildTestBytes(printerName, commandSet) {
    const cmd = buildCommands(commandSet);
    const now = new Date().toLocaleString();
    const chunks = [];
    const add = (...parts) => chunks.push(bytes(...parts));

    add(cmd.init, cmd.alignCenter, cmd.boldOn, cmd.doubleHeight);
    add('PRINTER TEST\n');
    add(cmd.normal, cmd.boldOff);
    add('================================\n');
    add(cmd.alignLeft);
    add(`Printer:  ${printerName}\n`);
    add(`Time:     ${now}\n`);
    add(`Command:  ${commandSet}\n`);
    add(`Mode:     Network (TCP/IP)\n`);
    add('================================\n');
    add(cmd.boldOn);
    add('ABCDEFGHIJKLMNOPQRSTUVWXYZabcd\n');
    add('1234567890 !@#$%^&*()_+-=[]{}|\n');
    add(cmd.boldOff);
    add('================================\n');
    add(cmd.alignCenter);
    add('Network printer connected!\n\n\n');
    add(cmd.cut);

    const total_len = chunks.reduce((n, c) => n + c.length, 0);
    const buf = new Uint8Array(total_len);
    let offset = 0;
    for (const c of chunks) { buf.set(c, offset); offset += c.length; }
    return buf;
}

async function sendToNetworkPrinter(ip, port, data, timeoutMs = 8000) {
    const portNum = parseInt(port) || 9100;

    // Connect with a timeout to avoid indefinite hangs
    let conn;
    try {
        const connectPromise = Deno.connect({ hostname: ip, port: portNum, transport: 'tcp' });
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs)
        );
        conn = await Promise.race([connectPromise, timeoutPromise]);
    } catch (e) {
        throw new Error(`Cannot connect to ${ip}:${portNum} — ${e.message}. Make sure the printer is on the same network and the IP/port are correct.`);
    }

    try {
        let written = 0;
        while (written < data.length) {
            const chunk = data.subarray(written, written + 512);
            const n = await conn.write(chunk);
            written += n;
        }
    } finally {
        try { conn.close(); } catch {}
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();

        // Allow Android agents with API key
        const apiKey = req.headers.get('x-api-key') || body.api_key;
        const validApiKey = Deno.env.get('ANDROID_APP_API_KEY');
        const hasValidApiKey = validApiKey && apiKey === validApiKey;

        if (!hasValidApiKey) {
            // Use isAuthenticated check — avoids User entity permission issues
            const isAuth = await base44.auth.isAuthenticated();
            if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { action, printer_ip, printer_port, command_set, order, restaurant, config, printer_name, open_cash_drawer } = body;

        // build_raw only generates ESC/POS bytes — no TCP needed, so printer_ip is optional for it
        if (!printer_ip && action !== 'build_raw') {
            return Response.json({ error: 'printer_ip is required' }, { status: 400 });
        }

        let data;

        if (action === 'test') {
            data = buildTestBytes(printer_name || 'Network Printer', command_set || 'esc_pos');
        } else if (action === 'print_receipt') {
            if (!order) return Response.json({ error: 'order is required for print_receipt' }, { status: 400 });
            const mergedConfig = {
                printer_width: '80mm',
                command_set: 'esc_pos',
                template: 'standard',
                font_size: 'medium',
                show_logo: true,
                show_order_number: true,
                show_customer_details: true,
                header_text: '',
                footer_text: '',
                ...(config || {}),
            };
            data = buildReceiptBytes(order, restaurant || {}, mergedConfig, !!open_cash_drawer);
        } else if (action === 'build_raw') {
            // Return raw ESC/POS bytes as base64 — for local agents that handle TCP themselves
            let rawData;
            if (body.test_mode || !order) {
                rawData = buildTestBytes(printer_name || 'Network Printer', command_set || 'esc_pos');
            } else {
                // Config from the print job takes priority — defaults only fill gaps
                const mergedConfig = {
                    printer_width: '80mm', command_set: 'esc_pos', template: 'standard',
                    show_logo: true, show_order_number: true, show_customer_details: true,
                    header_text: '', footer_text: '', font_size: 'medium',
                    ...(config || {}),
                };
                rawData = buildReceiptBytes(order, restaurant || {}, mergedConfig);
            }
            // Use loop instead of spread to avoid stack overflow on large receipts
            let binary = '';
            for (let i = 0; i < rawData.length; i++) binary += String.fromCharCode(rawData[i]);
            const base64 = btoa(binary);
            return Response.json({ success: true, raw_base64: base64 });

        } else if (action === 'ping') {
            // Attempt a TCP connection with timeout to verify reachability
            const portNum = parseInt(printer_port) || 9100;
            try {
                const connectPromise = Deno.connect({ hostname: printer_ip, port: portNum, transport: 'tcp' });
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Connection timed out after 5000ms')), 5000)
                );
                const conn = await Promise.race([connectPromise, timeoutPromise]);
                try { conn.close(); } catch {}
                return Response.json({ success: true, message: `Printer at ${printer_ip}:${portNum} is reachable` });
            } catch (e) {
                return Response.json({ success: false, message: `Cannot reach ${printer_ip}:${portNum} — ${e.message}` });
            }
        } else if (action === 'print_raw_base64') {
            // Used by the local print agent to relay raw ESC/POS bytes
            const { data_base64 } = body;
            if (!data_base64) return Response.json({ error: 'data_base64 required' }, { status: 400 });
            const binaryStr = atob(data_base64);
            data = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) data[i] = binaryStr.charCodeAt(i);
        } else {
            return Response.json({ error: 'action must be one of: test, print_receipt, build_raw, ping, print_raw_base64' }, { status: 400 });
        }

        // Normalise port — trim whitespace and fallback to 9100
        const resolvedPort = String(printer_port || '9100').trim();
        if (!data || data.length === 0) {
            return Response.json({ error: 'No print data to send' }, { status: 400 });
        }
        await sendToNetworkPrinter(printer_ip.trim(), resolvedPort, data);

        return Response.json({ success: true, message: `Print job sent to ${printer_ip}:${resolvedPort}` });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});