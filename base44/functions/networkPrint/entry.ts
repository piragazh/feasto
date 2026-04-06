import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ESC/POS command builder helpers
const ESC = 0x1B;
const GS = 0x1D;

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

function buildReceiptBytes(order, restaurant, config) {
    const cmd = buildCommands(config.command_set);
    const lineWidth = (config.printer_width === '58mm') ? 32 : 48;
    const chunks = [];

    const add = (...parts) => chunks.push(bytes(...parts));

    add(cmd.init);
    add(cmd.alignCenter);
    add(cmd.boldOn);
    add(`${restaurant?.name || 'ORDER'}\n`);
    add(cmd.boldOff);
    add(cmd.normal);

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
        if (config.template === 'itemized') add(cmd.doubleHeight);
        const orderNum = order.order_number || `#${(order.id || '').slice(-6)}`;
        add(`ORDER ${orderNum}\n`);
        add(cmd.normal, cmd.boldOff, cmd.alignLeft);
    }

    if (config.template !== 'compact') {
        add(`${new Date(order.created_date || Date.now()).toLocaleString()}\n`);
    }
    const orderTypeLabel = order.order_type
        ? order.order_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : (order.order_source === 'pos' ? 'POS' : order.order_source === 'kiosk' ? 'Kiosk' : 'Delivery');
    add(`Type: ${orderTypeLabel}\n`);
    add('--------------------------------\n');

    if (config.show_customer_details !== false && config.template !== 'compact') {
        add(cmd.boldOn);
        add('Customer:\n');
        add(cmd.boldOff);
        const customerName = order.guest_name || order.created_by || 'N/A';
        add(`${customerName}\n`);
        if (order.phone) add(`Tel: ${order.phone}\n`);
        if (order.delivery_address) add(`${order.delivery_address}\n`);
        add('--------------------------------\n');
    }

    for (const item of (order.items || [])) {
        if (config.template === 'itemized') {
            add(cmd.boldOn);
            add(`${item.quantity}x ${item.name}\n`);
            add(cmd.boldOff);
            add(`    £${((item.price || 0) * item.quantity).toFixed(2)}\n`);
        } else {
            const itemName = `${item.quantity}x ${item.name}`;
            const price = `£${((item.price || 0) * item.quantity).toFixed(2)}`;
            const padding = Math.max(1, lineWidth - itemName.length - price.length);
            add(`${itemName}${' '.repeat(padding)}${price}\n`);
        }
        if ((config.template === 'detailed' || config.template === 'itemized') && item.customizations) {
            for (const [k, v] of Object.entries(item.customizations)) {
                if (typeof v !== 'object') add(`  ${k}: ${v}\n`);
            }
        }
    }

    add('================================\n');

    if (config.template !== 'compact') {
        const sub = `£${(order.subtotal || 0).toFixed(2)}`;
        add(`Subtotal:${' '.repeat(Math.max(1, lineWidth - 9 - sub.length))}${sub}\n`);
        if ((order.delivery_fee || 0) > 0) {
            const fee = `£${order.delivery_fee.toFixed(2)}`;
            add(`Delivery:${' '.repeat(Math.max(1, lineWidth - 9 - fee.length))}${fee}\n`);
        }
        if ((order.discount || 0) > 0) {
            const disc = `-£${order.discount.toFixed(2)}`;
            add(`Discount:${' '.repeat(Math.max(1, lineWidth - 9 - disc.length))}${disc}\n`);
        }
    }

    add(cmd.boldOn);
    if (config.template === 'itemized') add(cmd.doubleHeight);
    const total = `£${(order.total || 0).toFixed(2)}`;
    add(`TOTAL:${' '.repeat(Math.max(1, lineWidth - 6 - total.length))}${total}\n`);
    add(cmd.normal, cmd.boldOff);

    if (config.template !== 'minimal') add(`Payment: ${order.payment_method || 'N/A'}\n`);
    if (order.notes) {
        add('--------------------------------\n');
        add(`Notes: ${order.notes}\n`);
    }

    if (config.footer_text) {
        add('================================\n');
        add(cmd.alignCenter);
        add(`${config.footer_text}\n`);
        add(cmd.alignLeft);
    }

    add('================================\n');
    add(cmd.alignCenter);
    add('Thank you!\n\n\n');
    add(cmd.cut);

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
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { action, printer_ip, printer_port, command_set, order, restaurant, config, printer_name } = body;

        if (!printer_ip) return Response.json({ error: 'printer_ip is required' }, { status: 400 });

        let data;

        if (action === 'test') {
            data = buildTestBytes(printer_name || 'Network Printer', command_set || 'esc_pos');
        } else if (action === 'print_receipt') {
            if (!order) return Response.json({ error: 'order is required for print_receipt' }, { status: 400 });
            const mergedConfig = {
                printer_width: '80mm',
                command_set: 'esc_pos',
                template: 'standard',
                show_logo: true,
                show_order_number: true,
                show_customer_details: true,
                header_text: '',
                footer_text: '',
                ...(config || {}),
            };
            data = buildReceiptBytes(order, restaurant || {}, mergedConfig);
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
        } else {
            return Response.json({ error: 'action must be one of: test, print_receipt, ping' }, { status: 400 });
        }

        await sendToNetworkPrinter(printer_ip, printer_port, data);

        return Response.json({ success: true, message: `Print job sent to ${printer_ip}:${printer_port || 9100}` });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});