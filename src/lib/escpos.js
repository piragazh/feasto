/**
 * Client-side ESC/POS byte builders — ported from the networkPrint backend function.
 * Generates raw ESC/POS command bytes for thermal printers, used by QZ Tray
 * to print receipts and open cash drawers directly (no backend round-trip).
 */

const ESC = 0x1B;
const GS = 0x1D;

// ESC/POS cash drawer open command (works on both drawer pin 2 and pin 5)
// ESC p <pin> <on-time> <off-time>
export const CASH_DRAWER_CMD = [ESC, 0x70, 0x00, 0x19, 0xFA];

const encoder = new TextEncoder();

function buildCommands(commandSet = 'esc_pos') {
    const sets = {
        esc_pos:       { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45,0x01], boldOff: [ESC,0x45,0x00], cut: [GS,0x56,0x41,0x00], doubleHeight: [ESC,0x21,0x10], normal: [ESC,0x21,0x00] },
        esc_pos_star:  { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45],      boldOff: [ESC,0x46],      cut: [ESC,0x64,0x03], doubleHeight: [ESC,0x21,0x10], normal: [ESC,0x21,0x00] },
        esc_bixolon:   { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45,0x01], boldOff: [ESC,0x45,0x00], cut: [GS,0x56,0x00],       doubleHeight: [GS,0x21,0x11],  normal: [GS,0x21,0x00] },
        epson_tm:      { init: [ESC,0x40], alignCenter: [ESC,0x61,0x01], alignLeft: [ESC,0x61,0x00], boldOn: [ESC,0x45,0x01], boldOff: [ESC,0x45,0x00], cut: [GS,0x56,0x41,0x03], doubleHeight: [ESC,0x21,0x30], normal: [ESC,0x21,0x00] },
    };
    return sets[commandSet] || sets.esc_pos;
}

function bytes(...args) {
    const arrays = args.map(a => Array.isArray(a) ? new Uint8Array(a) : encoder.encode(a));
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) { out.set(a, offset); offset += a.length; }
    return out;
}

// Byte-aware length — £ encodes as 2 bytes but counts as 1 JS char
function byteLen(str) {
    return encoder.encode(str).length;
}

function rPad(label, value, lineWidth) {
    const pad = Math.max(1, lineWidth - byteLen(label) - byteLen(value));
    return `${label}${' '.repeat(pad)}${value}`;
}

function wrapText(text, lineWidth) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
        if ((current + (current ? ' ' : '') + word).length <= lineWidth) {
            current += (current ? ' ' : '') + word;
        } else {
            if (current) lines.push(current);
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

function formatCustomizations(item) {
    const lines = [];
    if (!item.customizations || typeof item.customizations !== 'object') return lines;
    for (const [key, val] of Object.entries(item.customizations)) {
        let displayVal = '';
        if (key.includes('meal_customizations') && typeof val === 'object' && !Array.isArray(val)) {
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

/**
 * Build full receipt ESC/POS bytes.
 * @param {object} order      - Order data
 * @param {object} restaurant - Restaurant data
 * @param {object} config     - Receipt config (printer_width, command_set, template, etc.)
 * @param {boolean} openCashDrawer - Append cash drawer open command after cut
 * @returns {Uint8Array} Raw ESC/POS bytes
 */
export function buildReceiptBytes(order, restaurant, config, openCashDrawer = false) {
    const cmd = buildCommands(config.command_set);
    const W = (config.printer_width === '58mm') ? 32 : 48;
    const isCompact = config.template === 'compact';
    const isMinimal = config.template === 'minimal';
    const chunks = [];
    const add = (...parts) => chunks.push(bytes(...parts));
    const line = (char = '-') => add(`${char.repeat(W)}\n`);
    const blank = () => add('\n');

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

    if (config.show_order_number !== false) {
        line('=');
        add(cmd.boldOn, cmd.doubleHeight, cmd.alignCenter);
        const orderNum = order.order_number || `#${(order.id || '').slice(-6)}`;
        add(`ORDER ${orderNum}\n`);
        add(cmd.normal, cmd.boldOff, cmd.alignLeft);
    }

    line('=');

    const orderTypeLabel = order.order_type
        ? order.order_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : (order.order_source === 'pos' ? 'POS' : order.order_source === 'kiosk' ? 'Kiosk' : 'Delivery');

    add(cmd.boldOn);
    add(`>>> ${orderTypeLabel.toUpperCase()} <<<\n`);
    add(cmd.boldOff);

    if (!isCompact) {
        const dt = new Date(order.created_date || Date.now());
        const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        add(`Time: ${timeStr}  Date: ${dateStr}\n`);
    }

    if (order.table_number) {
        add(cmd.boldOn);
        add(`TABLE: ${order.table_number}\n`);
        add(cmd.boldOff);
    }

    if (config.show_customer_details !== false && !isCompact) {
        line('-');
        const customerName = (order.guest_name && order.guest_name !== 'null')
            ? order.guest_name
            : (order.customer_email && !order.customer_email.includes('@base44') && order.customer_email !== 'null')
                ? order.customer_email
                : null;
        if (customerName) {
            add(cmd.boldOn, `${customerName}\n`, cmd.boldOff);
        }
        if (order.phone && order.phone !== 'null') add(`Tel: ${order.phone}\n`);
        if (order.delivery_address && order.delivery_address !== 'null' && order.order_type === 'delivery') {
            const addrLines = wrapText(`Addr: ${order.delivery_address}`, W);
            for (const l of addrLines) add(`${l}\n`);
        }
    }

    if (order.notes) {
        line('*');
        add(cmd.boldOn, `!! NOTES: ${order.notes}\n`, cmd.boldOff);
        line('*');
    }

    line('=');
    add(cmd.boldOn, `ITEMS (${(order.items || []).length})\n`, cmd.boldOff);
    line('-');

    const items = order.items || [];
    items.forEach((item, idx) => {
        const qty = item.quantity || 1;
        const itemPrice = `\xA3${((item.price || 0) * qty).toFixed(2)}`;
        const itemLabel = `${idx + 1}. ${qty}x ${item.name}`;

        add(cmd.boldOn);
        if (byteLen(itemLabel) + byteLen(itemPrice) + 1 <= W) {
            add(`${rPad(itemLabel, itemPrice, W)}\n`);
        } else {
            const nameLines = wrapText(itemLabel, W);
            for (const nl of nameLines) add(`${nl}\n`);
            add(`${' '.repeat(Math.max(0, W - itemPrice.length))}${itemPrice}\n`);
        }
        add(cmd.boldOff);

        const custLines = formatCustomizations(item);
        for (const cl of custLines) add(`${cl}\n`);

        if (idx < items.length - 1) blank();
    });

    line('=');

    if (!isCompact && !isMinimal) {
        const sub = `\xA3${(order.subtotal || 0).toFixed(2)}`;
        add(`${rPad('Subtotal:', sub, W)}\n`);
        if ((order.delivery_fee || 0) > 0) {
            const fee = `\xA3${order.delivery_fee.toFixed(2)}`;
            add(`${rPad('Delivery:', fee, W)}\n`);
        }
        if ((order.discount || 0) > 0) {
            const disc = `-\xA3${order.discount.toFixed(2)}`;
            add(`${rPad('Discount:', disc, W)}\n`);
        }
        line('-');
    }

    add(cmd.boldOn, cmd.doubleHeight, cmd.alignCenter);
    add(`TOTAL: \xA3${(order.total || 0).toFixed(2)}\n`);
    add(cmd.normal, cmd.boldOff, cmd.alignLeft);

    if (!isMinimal) {
        const payLabel = (order.payment_method || 'N/A').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        add(`Payment: ${payLabel}\n`);
    }

    if (config.footer_text) {
        line('=');
        add(cmd.alignCenter, `${config.footer_text}\n`, cmd.alignLeft);
    }

    line('=');
    add(cmd.alignCenter, 'Thank you!\n\n\n', cmd.cut);
    if (openCashDrawer) add(new Uint8Array(CASH_DRAWER_CMD));

    const total_len = chunks.reduce((n, c) => n + c.length, 0);
    const buf = new Uint8Array(total_len);
    let offset = 0;
    for (const c of chunks) { buf.set(c, offset); offset += c.length; }
    return buf;
}

export function buildTestBytes(printerName, commandSet = 'esc_pos') {
    const cmd = buildCommands(commandSet);
    const now = new Date().toLocaleString();
    const chunks = [];
    const add = (...parts) => chunks.push(bytes(...parts));

    add(cmd.init, cmd.alignCenter, cmd.boldOn, cmd.doubleHeight);
    add('PRINTER TEST\n');
    add(cmd.normal, cmd.boldOff);
    add('================================\n');
    add(cmd.alignLeft);
    add(`Printer:  ${printerName || 'Printer'}\n`);
    add(`Time:     ${now}\n`);
    add(`Command:  ${commandSet}\n`);
    add('================================\n');
    add(cmd.boldOn, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcd\n', cmd.boldOff);
    add('1234567890 !@#$%^&*()_+-=[]{}|\n');
    add('================================\n');
    add(cmd.alignCenter, 'QZ Tray printer test OK!\n\n\n', cmd.cut);

    const total_len = chunks.reduce((n, c) => n + c.length, 0);
    const buf = new Uint8Array(total_len);
    let offset = 0;
    for (const c of chunks) { buf.set(c, offset); offset += c.length; }
    return buf;
}

export function buildCashDrawerBytes() {
    return new Uint8Array(CASH_DRAWER_CMD);
}