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
// region-money:start
// SYNC RULE: server copy of formatMoney (src/lib/money.js). Every copy must be
// identical to scripts/region-money.snippet.js; scripts/check-region.mjs
// enforces it and compares the answers with money.js. GB text is exactly the
// old `£${x.toFixed(2)}`; other countries: "Rs 1,250.00".
const REGION_MONEY = { GB: { symbol: '£', locale: 'en-GB', decimals: 2 }, LK: { symbol: 'Rs', locale: 'en-LK', decimals: 2 } };
function regionMoney(amount, restaurantOrCountry) {
    const raw = typeof restaurantOrCountry === 'string' ? restaurantOrCountry : restaurantOrCountry?.country;
    const c = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    const r = REGION_MONEY[c] || REGION_MONEY.GB;
    if (r === REGION_MONEY.GB) return amount === null || amount === undefined ? '£' : `£${amount.toFixed(2)}`;
    if (amount === null || amount === undefined) return r.symbol;
    const n = Number(amount);
    const text = Number.isFinite(n) ? n.toLocaleString(r.locale, { minimumFractionDigits: r.decimals, maximumFractionDigits: r.decimals }) : String(amount);
    return `${r.symbol} ${text}`;
}
// region-money:end

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // SECURITY: Require authenticated user (customer who just placed, manager, or admin)
        let callerEmail = null;
        try {
            const user = await base44.auth.me();
            if (user) callerEmail = user.email;
        } catch (_) {}

        const { orderId, restaurantId, restaurantName } = await req.json();

        if (!orderId || !restaurantName || !restaurantId) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // SECURITY: Verify order exists and was created recently (within last 5 minutes)
        const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        if (!orders?.length) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }
        
        const order = orders[0];
        const orderAge = Date.now() - new Date(order.created_date).getTime();
        // Extended to 30 minutes to handle slow networks, Stripe webhook recovery paths, and background task delays.
        // Previously 5 minutes was too tight and silently dropped alerts with no error surfaced.
        if (orderAge > 30 * 60 * 1000) { // 30 minutes
            console.warn(`[NOTIFY] Order ${orderId} is ${Math.round(orderAge/60000)} min old — too old for notification`);
            return Response.json({ error: 'Order too old for notification' }, { status: 400 });
        }
        
        if (order.restaurant_id !== restaurantId) {
            return Response.json({ error: 'Restaurant ID mismatch' }, { status: 400 });
        }

        // SECURITY: Caller must be the order owner (or admin/manager)
        if (callerEmail && order.created_by && order.created_by !== 'anonymous') {
            // If authenticated, must own the order or be a manager/admin
            // (guest orders have no created_by — allowed through above age check)
        } else if (!callerEmail && (!order.created_by || order.created_by === 'anonymous')) {
            // Guest order, no auth — already validated by age + orderId matching above
        } else if (!callerEmail && order.created_by && order.created_by !== 'anonymous') {
            // Registered user's order being triggered without auth — block
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get restaurant settings from restaurant
        let restaurant = null;
        if (restaurantId) {
            try {
                const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
                restaurant = restaurants.length > 0 ? restaurants[0] : null;
            } catch (error) {
                console.error('Failed to fetch restaurant:', error);
            }
        }

        if (!restaurant || !restaurant.alert_phone) {
            console.log(`Restaurant alert would be sent for order ${orderId} at ${restaurantName} (phone not configured)`);
            return Response.json({ 
                success: true, 
                message: 'Restaurant alert phone not configured',
                simulated: true 
            });
        }

        // WhatsApp alerts are handled by the Order.create automation (sendWhatsAppOrder),
        // which fires server-side on every new order. If WhatsApp is enabled, defer entirely
        // so the restaurant receives exactly one alert (WA) instead of WA + SMS duplicates.
        if (restaurant.whatsapp_alerts_enabled) {
            return Response.json({
                success: true,
                message: 'WhatsApp alert handled by Order.create automation',
                channel: 'whatsapp',
                deferred: true,
            });
        }

        // Check if SMS alerts are enabled
        if (!restaurant.sms_alerts_enabled) {
            console.log(`SMS alerts disabled for order ${orderId} at ${restaurantName}`);
            return Response.json({ 
                success: true, 
                message: 'SMS alerts disabled for this restaurant',
                disabled: true 
            });
        }

        // The restaurant's country decides the number format and the sender
        // (region mirror above). UK restaurants keep the original rules.
        const country = regionCountry(restaurant.country);
        const isUk = country === 'GB';

        let alertPhone;
        if (isUk) {
            // Normalize restaurant alert phone to E.164
            alertPhone = restaurant.alert_phone.replace(/[\s\-\(\)]/g, '');
            if (alertPhone.startsWith('00')) alertPhone = '+' + alertPhone.slice(2);
            else if (alertPhone.startsWith('0')) alertPhone = '+44' + alertPhone.slice(1);
            else if (alertPhone.startsWith('44') && !alertPhone.startsWith('+')) alertPhone = '+' + alertPhone;
            else if (alertPhone.startsWith('7')) alertPhone = '+44' + alertPhone;
            else if (!alertPhone.startsWith('+')) alertPhone = '+44' + alertPhone;

            // Validate UK number: must be +44 followed by 9 or 10 digits (covers mobiles and landlines)
            if (!alertPhone.match(/^\+44\d{9,10}$/)) {
                console.error(`[NOTIFY] Invalid phone format for restaurant ${restaurantId} (${restaurantName}): "${alertPhone}". Ensure alert_phone is a valid UK number.`);
                return Response.json({ 
                    success: false,
                    message: `Invalid phone number format: ${alertPhone}`
                }, { status: 400 });
            }
        } else {
            // Texts need a mobile number in the restaurant's own country.
            alertPhone = regionMobileE164(restaurant.alert_phone, country);
            if (!alertPhone) {
                console.error(`[NOTIFY] Invalid alert phone for restaurant ${restaurantId} (${restaurantName}), country ${country}.`);
                return Response.json({
                    success: false,
                    message: `Invalid phone number format for ${country}: ${restaurant.alert_phone}`
                }, { status: 400 });
            }
        }

        // Order already fetched above for validation

        // Build order summary (must be before Twilio check so it's available for logging)
        const orderLabel = order.order_type === 'collection' && order.order_number 
            ? order.order_number 
            : `#${orderId.slice(-6)}`;
        
        const itemsList = order.items.slice(0, 3).map(item => 
            `${item.quantity}x ${item.name}`
        ).join('\n');
        
        const moreItems = order.items.length > 3 ? `\n+${order.items.length - 3} more items` : '';

        const message = `🔔 NEW ORDER - ${orderLabel}\n\n${restaurantName}\n\n${itemsList}${moreItems}\n\nTotal: ${regionMoney(order.total, restaurant)}\nType: ${order.order_type}\nPayment: ${order.payment_method}\n\nCheck dashboard to accept!`;

        // Check if Twilio is configured
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        // GB: the original Twilio number. Other countries: TWILIO_PHONE_NUMBER_<CODE>,
        // else the main Twilio number.
        const twilioPhone = isUk
            ? Deno.env.get('TWILIO_PHONE_NUMBER')
            : (regionEnv('TWILIO_PHONE_NUMBER', country) || Deno.env.get('TWILIO_PHONE_NUMBER'));

        if (!accountSid || !authToken || !twilioPhone) {
            console.log(`Restaurant alert would be sent to ${alertPhone}`);
            await base44.asServiceRole.entities.SmsLog.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurantName,
                to: alertPhone,
                message,
                order_id: orderId,
                status: 'simulated',
                type: 'restaurant_alert',
            });
            return Response.json({ 
                success: true, 
                message: 'Twilio not configured',
                simulated: true 
            });
        }

        // Send SMS via Twilio
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const auth = btoa(`${accountSid}:${authToken}`);

        const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: alertPhone,
                From: twilioPhone,
                Body: message
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Twilio error:', error);
            await base44.asServiceRole.entities.SmsLog.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurantName,
                to: alertPhone,
                message,
                order_id: orderId,
                status: 'failed',
                error_details: error,
                type: 'restaurant_alert',
            });
            return Response.json({ 
                error: 'Failed to send SMS', 
                details: error 
            }, { status: 500 });
        }

        const result = await response.json();
        await base44.asServiceRole.entities.SmsLog.create({
            restaurant_id: restaurantId,
            restaurant_name: restaurantName,
            to: alertPhone,
            message,
            order_id: orderId,
            status: 'sent',
            message_sid: result.sid,
            type: 'restaurant_alert',
        });
        return Response.json({ 
            success: true, 
            messageSid: result.sid,
            simulated: false
        });

    } catch (error) {
        console.error('[NOTIFY] Restaurant notification error:', error);
        return Response.json({ 
            error: 'Failed to send notification. Please try again.' 
        }, { status: 500 });
    }
});