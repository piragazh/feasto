import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Scheduled automated win-back campaign worker.
 * Runs daily. For each restaurant with an enabled WinBackAutomation config,
 * finds customers who hit the inactivity threshold and fires a personalised
 * campaign via sendCRMCampaignWithOptOut — generating a unique 1-use coupon per customer.
 *
 * Auth: Must be called by the scheduler (admin) or an admin user.
 */

const SCHEDULED_SECRET = Deno.env.get('SCHEDULED_DIGEST_SECRET') || '';

Deno.serve(async (req) => {
    // Allow scheduler (secret header) or admin user auth
    const schedulerSecret = req.headers.get('x-scheduler-secret');
    const isScheduler = schedulerSecret && schedulerSecret === SCHEDULED_SECRET;

    const base44 = createClientFromRequest(req);

    if (!isScheduler) {
        const user = await base44.auth.me().catch(() => null);
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const { restaurant_id } = await req.json().catch(() => ({}));

    // Load all enabled automation configs (or single restaurant if specified)
    const filterQuery = restaurant_id
        ? { restaurant_id, is_enabled: true }
        : { is_enabled: true };

    const automations = await base44.asServiceRole.entities.WinBackAutomation.filter(filterQuery);

    if (!automations.length) {
        return Response.json({ message: 'No active automations found', processed: 0 });
    }

    const summary = [];

    for (const automation of automations) {
        try {
            const result = await processAutomation(base44, automation);
            summary.push({ restaurant_id: automation.restaurant_id, ...result });
        } catch (err) {
            console.error(`[autoWinBack] Error for restaurant ${automation.restaurant_id}:`, err.message);
            summary.push({ restaurant_id: automation.restaurant_id, error: err.message });
        }
    }

    return Response.json({ processed: automations.length, summary });
});

async function processAutomation(base44, automation) {
    const { restaurant_id, inactivity_days = 60, coupon_type, coupon_value, coupon_validity_days = 14,
            channel = 'whatsapp', message_template, email_subject, contacted_customer_keys = [] } = automation;

    const cutoffDate = new Date(Date.now() - inactivity_days * 24 * 60 * 60 * 1000);

    // Fetch recent orders for this restaurant (last 2 years is enough)
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
    const orders = await base44.asServiceRole.entities.Order.filter(
        { restaurant_id },
        '-created_date',
        2000
    );

    // Build customer map — last order date per customer
    const customerMap = {};
    for (const order of orders) {
        if (['cancelled', 'refunded'].includes(order.status)) continue;
        const key = order.phone || order.customer_email || order.created_by || order.guest_email;
        if (!key) continue;

        if (!customerMap[key]) {
            customerMap[key] = {
                key,
                phone: order.phone || null,
                email: order.customer_email || order.created_by || order.guest_email || null,
                name: order.guest_name || null,
                lastOrderDate: order.created_date,
                orderCount: 0,
                totalSpent: 0
            };
        }
        if (order.created_date > customerMap[key].lastOrderDate) {
            customerMap[key].lastOrderDate = order.created_date;
        }
        customerMap[key].orderCount++;
        customerMap[key].totalSpent += order.total || 0;
    }

    // Filter: inactive >= threshold AND not already contacted this cycle
    const eligibleCustomers = Object.values(customerMap).filter(c => {
        if (!c.phone && !c.email) return false;
        if (contacted_customer_keys.includes(c.key)) return false;
        const daysSinceLast = (Date.now() - new Date(c.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceLast >= inactivity_days;
    });

    if (!eligibleCustomers.length) {
        await base44.asServiceRole.entities.WinBackAutomation.update(automation.id, {
            last_run_at: new Date().toISOString(),
            last_run_sent: 0,
            last_run_skipped: 0
        });
        return { sent: 0, skipped: 0, message: 'No eligible customers' };
    }

    // Fetch restaurant info for personalisation
    const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurant_id });
    const restaurant = restaurants[0] || {};
    const restaurantName = restaurant.name || 'the restaurant';

    // Build offer description
    let offerText = '';
    if (coupon_type === 'percentage') offerText = `${coupon_value}% off`;
    else if (coupon_type === 'fixed') offerText = `£${coupon_value} off`;
    else if (coupon_type === 'free_delivery') offerText = 'free delivery';

    const validUntil = new Date(Date.now() + coupon_validity_days * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

    // Generate unique coupons and build recipients list
    const recipients = [];
    const newContactedKeys = [...contacted_customer_keys];

    for (const customer of eligibleCustomers) {
        const timestamp = Date.now().toString(36).toUpperCase();
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        const couponCode = `WB-${timestamp}-${rand}`;

        // Create 1-use coupon in DB
        await base44.asServiceRole.entities.Coupon.create({
            code: couponCode,
            description: `Win-back offer for ${customer.name || customer.phone || customer.email}`,
            discount_type: coupon_type || 'percentage',
            discount_value: coupon_value || 0,
            restaurant_id,
            is_active: true,
            valid_from: new Date().toISOString().split('T')[0],
            valid_until: validUntil,
            usage_limit: 1,
            usage_count: 0,
            per_customer_limit: 1,
            minimum_order: 0,
            stackable: false
        });

        const daysSinceLast = Math.ceil(
            (Date.now() - new Date(customer.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Personalise message template
        const defaultTemplate = channel === 'email'
            ? `Hi [NAME],\n\nWe miss you at ${restaurantName}! It's been [DAYS] days since your last order.\n\nAs a special thank you, here's a personal offer just for you:\n\n🎁 [DISCOUNT] off your next order\nCode: [COUPON_CODE]\n\nValid for ${coupon_validity_days} days — don't let it expire!\n\nOrder now and enjoy [OFFER]!`
            : `Hi [NAME] 👋\n\nWe miss you at ${restaurantName}! It's been [DAYS] days since your last visit.\n\nHere's a special offer just for you:\n🎁 Use code [COUPON_CODE] for [DISCOUNT] off!\n\nValid for ${coupon_validity_days} days only.`;

        const template = message_template || defaultTemplate;
        const personalised = template
            .replace(/\[NAME\]/g, customer.name || 'there')
            .replace(/\[DAYS\]/g, daysSinceLast)
            .replace(/\[DISCOUNT\]/g, coupon_type === 'percentage' ? `${coupon_value}%` : `£${coupon_value}`)
            .replace(/\[COUPON_CODE\]/g, couponCode)
            .replace(/\[OFFER\]/g, offerText)
            .replace(/\[RESTAURANT_LINK\]/g, restaurantName);

        recipients.push({
            phone: customer.phone,
            email: customer.email,
            name: customer.name,
            coupon_code: couponCode,
            personalised_message: personalised
        });

        newContactedKeys.push(customer.key);
    }

    // Send via sendCRMCampaignWithOptOut using admin service role
    // We call it in batches to avoid timeout issues
    let totalSent = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    // For SMS/WhatsApp: recipients already have coupon in their personalised message
    // We pass personalised_message per-recipient but sendCRMCampaignWithOptOut uses a shared textBody.
    // Solution: send individually so each gets their personal message.
    for (const recipient of recipients) {
        const payload = {
            channel,
            recipients: [recipient],
            subject: email_subject || `We Miss You — Here's a Special Offer 🎁`,
            textBody: recipient.personalised_message,
            restaurant_id
        };

        // For email: build a simple HTML wrapper
        if (channel === 'email') {
            payload.htmlBody = buildSimpleHtmlEmail({
                restaurantName,
                textBody: recipient.personalised_message,
                subject: email_subject || `We Miss You — Here's a Special Offer 🎁`,
                couponCode: recipient.coupon_code,
                offerText,
                validUntil
            });
        }

        const resp = await base44.asServiceRole.functions.invoke('sendCRMCampaignWithOptOut', payload)
            .catch(e => ({ data: { sent: 0, failed: 1, skipped: 0 } }));

        const r = resp?.data || {};
        totalSent += r.sent || 0;
        totalSkipped += r.skipped || 0;
        totalFailed += r.failed || 0;
    }

    // Update automation record
    await base44.asServiceRole.entities.WinBackAutomation.update(automation.id, {
        last_run_at: new Date().toISOString(),
        last_run_sent: totalSent,
        last_run_skipped: totalSkipped,
        total_sent_all_time: (automation.total_sent_all_time || 0) + totalSent,
        contacted_customer_keys: newContactedKeys.slice(-500) // keep last 500 to avoid bloat
    });

    return { sent: totalSent, skipped: totalSkipped, failed: totalFailed, eligible: eligibleCustomers.length };
}

function buildSimpleHtmlEmail({ restaurantName, textBody, subject, couponCode, offerText, validUntil }) {
    const textHtml = textBody
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#f97316,#ef4444);padding:32px 40px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:26px;">We Miss You! 💛</h1>
      <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:15px;">${restaurantName}</p>
    </div>
    <div style="padding:36px 40px;">
      <p style="color:#374151;font-size:15px;line-height:1.7;">${textHtml}</p>
      ${couponCode ? `
      <div style="background:#fff7ed;border:2px dashed #f97316;border-radius:12px;padding:24px;text-align:center;margin:28px 0;">
        <p style="margin:0 0 8px;color:#9a3412;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your Personal Discount Code</p>
        <p style="margin:0;font-size:28px;font-weight:800;color:#f97316;letter-spacing:4px;">${couponCode}</p>
        <p style="margin:8px 0 0;color:#9a3412;font-size:12px;">Valid until ${validUntil} · One use only</p>
      </div>
      ` : ''}
      <div style="text-align:center;margin-top:28px;">
        <a href="UNSUBSCRIBE_URL_PLACEHOLDER" style="color:#9ca3af;font-size:11px;">Unsubscribe</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}