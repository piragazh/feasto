import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

/**
 * Sends a WhatsApp message to a customer for order status updates.
 * Uses Twilio Content Templates to ensure delivery for business-initiated messages.
 *
 * Template map:
 *   confirmed          → TWILIO_WA_CONFIRMED_SID          vars: {{1}}=orderNumber
 *   preparing          → TWILIO_WA_PREPARING_SID           vars: {{1}}=orderNumber
 *   out_for_delivery   → TWILIO_WA_OUT_FOR_DELIVERY_SID    vars: {{1}}=orderNumber
 *   delivered          → TWILIO_WA_DELIVERED_SID           vars: {{1}}=orderNumber, {{2}}=restaurantName
 *   ready_for_collection → TWILIO_WA_READY_FOR_COLLECTION_SID vars: {{1}}=orderNumber, {{2}}=restaurantName
 *   cancelled          → TWILIO_WA_CANCELLED_SID           vars: {{1}}=orderNumber, {{2}}=rejectionReason
 */

const TEMPLATE_MAP = {
    confirmed:             { sid: 'TWILIO_WA_CONFIRMED_SID',             vars: (o, r) => ({ "1": o }) },
    preparing:             { sid: 'TWILIO_WA_PREPARING_SID',             vars: (o, r) => ({ "1": o }) },
    out_for_delivery:      { sid: 'TWILIO_WA_OUT_FOR_DELIVERY_SID',      vars: (o, r) => ({ "1": o }) },
    delivered:             { sid: 'TWILIO_WA_DELIVERED_SID',             vars: (o, r) => ({ "1": o, "2": r }) },
    ready_for_collection:  { sid: 'TWILIO_WA_READY_FOR_COLLECTION_SID',  vars: (o, r) => ({ "1": o, "2": r }) },
    cancelled:             { sid: 'TWILIO_WA_CANCELLED_SID',             vars: (o, r, reason) => ({ "1": o, "2": reason || 'No reason provided' }) },
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Auth: either logged-in user OR recent guest order
        let isAuthorized = false;
        try {
            const user = await base44.auth.me();
            if (user) isAuthorized = true;
        } catch (_) {
            // guest path — validate by orderId + phone match
        }

        const { to, message, orderId, restaurantId, restaurantName, status, orderNumber, rejectionReason } = await req.json();

        if (!isAuthorized && orderId && to) {
            try {
                const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
                if (orders.length > 0) {
                    const order = orders[0];
                    const orderAge = Date.now() - new Date(order.created_date).getTime();
                    const normalize = (p) => (p || '').replace(/\D/g, '');
                    if (orderAge < 10 * 60 * 1000 && normalize(to) === normalize(order.phone)) {
                        isAuthorized = true;
                    }
                }
            } catch (_) {}
        }

        if (!isAuthorized) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!to) {
            return Response.json({ error: 'Missing required field: to' }, { status: 400 });
        }

        // The restaurant's country decides the number format (region mirror
        // above). UK restaurants, and any message whose restaurant can't be
        // found, use the original UK rules below unchanged.
        const country = await restaurantCountryFor(base44, restaurantId, orderId);
        const isUk = country === 'GB';

        let cleanPhone;
        if (isUk) {
            // Format UK phone number to E.164
            cleanPhone = to.replace(/[\s\-\(\)]/g, '');
            if (cleanPhone.startsWith('00')) cleanPhone = '+' + cleanPhone.slice(2);
            else if (cleanPhone.startsWith('0')) cleanPhone = '+44' + cleanPhone.slice(1);
            else if (cleanPhone.startsWith('44') && !cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;
            else if (cleanPhone.startsWith('7')) cleanPhone = '+44' + cleanPhone;
            else if (!cleanPhone.startsWith('+')) cleanPhone = '+44' + cleanPhone;

            if (!cleanPhone.match(/^\+447\d{9}$/)) {
                return Response.json({ error: 'Invalid UK mobile number', received: to }, { status: 400 });
            }
        } else {
            cleanPhone = regionMobileE164(to, country);
            if (!cleanPhone) {
                return Response.json({ error: `Invalid mobile number for this restaurant's country (${country})`, received: to }, { status: 400 });
            }
        }

        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        // WhatsApp is sent from the main (UK) WhatsApp number for every country,
        // unless a country has its own: TWILIO_WHATSAPP_NUMBER_<CODE>.
        const twilioPhone = isUk
            ? Deno.env.get('TWILIO_PHONE_NUMBER')
            : (regionEnv('TWILIO_WHATSAPP_NUMBER', country) || Deno.env.get('TWILIO_PHONE_NUMBER'));

        // Resolve template for this status
        const template = status ? TEMPLATE_MAP[status] : null;
        const contentSid = template ? Deno.env.get(template.sid) : null;
        const orderLabel = orderNumber || (orderId ? `#${orderId.slice(-6)}` : 'your order');
        const restaurant = restaurantName || 'the restaurant';
        const contentVariables = template ? JSON.stringify(template.vars(orderLabel, restaurant, rejectionReason)) : null;

        // Fallback message body (used for simulation logs or if no template)
        const messageBody = message || `Order ${orderLabel} status: ${status || 'updated'}`;

        if (!accountSid || !authToken || !twilioPhone) {
            await base44.asServiceRole.entities.SmsLog.create({
                restaurant_id: restaurantId || null,
                restaurant_name: restaurantName || null,
                to: cleanPhone,
                message: messageBody,
                order_id: orderId || null,
                status: 'simulated',
                type: 'customer_notification',
                error_details: `WhatsApp via Twilio (simulated - no credentials) | template: ${contentSid || 'none'}`
            });
            return Response.json({ success: true, simulated: true });
        }

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const auth = btoa(`${accountSid}:${authToken}`);

        const params = {
            To: `whatsapp:${cleanPhone}`,
            From: `whatsapp:${twilioPhone}`,
        };

        if (contentSid && contentVariables) {
            params.ContentSid = contentSid;
            params.ContentVariables = contentVariables;
        } else {
            // Free-form fallback (only works within 24h customer-initiated window)
            params.Body = messageBody;
        }

        const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(params)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('Twilio WhatsApp error:', result);
            await base44.asServiceRole.entities.SmsLog.create({
                restaurant_id: restaurantId || null,
                restaurant_name: restaurantName || null,
                to: cleanPhone,
                message: messageBody,
                order_id: orderId || null,
                status: 'failed',
                error_details: JSON.stringify(result),
                type: 'customer_notification'
            });
            return Response.json({ error: 'Failed to send WhatsApp message', details: result }, { status: 500 });
        }

        const maskedPhone = cleanPhone.replace(/\d(?=\d{3})/g, '*');
        console.log(`✅ WhatsApp sent to ${maskedPhone}, SID: ${result.sid}, template: ${contentSid || 'free-form'}`);

        await base44.asServiceRole.entities.SmsLog.create({
            restaurant_id: restaurantId || null,
            restaurant_name: restaurantName || null,
            to: cleanPhone,
            message: messageBody,
            order_id: orderId || null,
            status: 'sent',
            message_sid: result.sid,
            type: 'customer_notification',
        });

        return Response.json({ success: true, messageSid: result.sid });

    } catch (error) {
        console.error('sendWhatsAppCustomer error:', error);
        return Response.json({ error: error.message || 'Failed to send WhatsApp message' }, { status: 500 });
    }
});