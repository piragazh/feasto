// Customer contact details from an order, for CRM use.
// Never use order.created_by as a customer address: for online orders it is the Base44 service
// account (service+...@no-reply.base44.com), for POS orders it can be the staff member.

export function normaliseEmail(raw) {
    const e = String(raw || '').trim().toLowerCase();
    if (!e.includes('@') || e.endsWith('@no-reply.base44.com')) return null;
    return e;
}

// UK-first E.164: "07767 794496", "7767794496", "447767794496", "00447767794496" -> "+447767794496"
export function normalisePhone(raw) {
    let p = String(raw || '').replace(/[^\d+]/g, '');
    if (p.startsWith('00')) p = '+' + p.slice(2);
    if (!p.startsWith('+')) {
        if (p.startsWith('07') && p.length === 11) p = '+44' + p.slice(1);
        else if (p.startsWith('7') && p.length === 10) p = '+44' + p;
        else if (p.startsWith('44') && p.length === 12) p = '+' + p;
        else return null;
    }
    return /^\+\d{8,15}$/.test(p) ? p : null;
}

export function orderContact(order) {
    const phone = normalisePhone(order?.phone || order?.customer_phone);
    const email = normaliseEmail(order?.customer_email) || normaliseEmail(order?.guest_email);
    return { phone, email, key: phone || email || null };
}

export function isMarketplaceOrder(order) {
    return order?.order_source === 'third_party' || !!order?.third_party_platform;
}
