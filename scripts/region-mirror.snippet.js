// region-mirror:start
// SYNC RULE: server copy of the phone rules in src/lib/region.js + src/lib/phone.js
// (functions cannot import src/). Every copy must be identical to
// scripts/region-mirror.snippet.js; scripts/check-region.mjs enforces it and
// runs this code against src/lib/phone.js.
const REGION_PHONE = {
    GB: { dialCode: '44', trunkPrefix: '0', mobileNational: /^7\d{9}$/ },
    LK: { dialCode: '94', trunkPrefix: '0', mobileNational: /^7\d{8}$/ },
};
function regionCountry(code) {
    const c = typeof code === 'string' ? code.trim().toUpperCase() : '';
    return REGION_PHONE[c] ? c : 'GB';
}
function regionMobileE164(raw, country) {
    const r = REGION_PHONE[regionCountry(country)];
    const text = String(raw ?? '').trim();
    let digits = text.replace(/\D/g, '');
    if (!digits) return null;
    let international = text.startsWith('+');
    if (digits.startsWith('00')) { digits = digits.slice(2); international = true; }
    let n;
    if (international) n = digits.startsWith(r.dialCode) ? digits.slice(r.dialCode.length) : '';
    else if (digits.startsWith(r.dialCode) && r.mobileNational.test(digits.slice(r.dialCode.length))) n = digits.slice(r.dialCode.length);
    else if (r.trunkPrefix && digits.startsWith(r.trunkPrefix)) n = digits.slice(r.trunkPrefix.length);
    else n = digits;
    return r.mobileNational.test(n) ? `+${r.dialCode}${n}` : null;
}
// A country's own sender setting. GB keeps the original secret names; other
// countries add _<CODE> (HTTPSMS_FROM_LK, TWILIO_PHONE_NUMBER_LK, ...).
function regionEnv(name, country) {
    const c = regionCountry(country);
    return Deno.env.get(c === 'GB' ? name : `${name}_${c}`) || '';
}
// The country of the restaurant a message is for: from the restaurant, else
// from the order's restaurant, else GB. Any lookup problem means GB, which is
// exactly how every message was handled before region support.
async function restaurantCountryFor(base44, restaurantId, orderId) {
    try {
        let id = restaurantId;
        if (!id && orderId) {
            const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
            id = orders?.[0]?.restaurant_id;
        }
        if (!id) return 'GB';
        const rows = await base44.asServiceRole.entities.Restaurant.filter({ id });
        return regionCountry(rows?.[0]?.country);
    } catch (_) {
        return 'GB';
    }
}
// region-mirror:end
