/**
 * sendNotificationFromTemplate — Customer-facing order status notification orchestrator
 * =================================================================================================
 * Called by updateOrderStatus / rejectOrderWithRefund after a successful status change.
 *
 * - Reads the restaurant's per-status SMS + WhatsApp toggles.
 * - 'cancelled' always sends when the master channel toggle is on (no per-status toggle needed).
 * - Resolves the customer phone from the order (covers guests AND registered users who entered a phone).
 * - Uses per-restaurant NotificationTemplate text for SMS when available; falls back to a sensible default.
 * - WhatsApp uses approved Twilio Content Templates (via sendWhatsAppCustomer) — the template_text is
 *   passed only as a free-form fallback body.
 * - All dispatches are fire-and-forget; a notification failure never blocks the status update.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const STATUS_MESSAGES = {
  confirmed: 'Your order has been confirmed and is being prepared!',
  preparing: 'The kitchen is preparing your order now.',
  out_for_delivery: 'Your order is out for delivery!',
  delivered: 'Your order has been delivered. Enjoy your meal!',
  ready_for_collection: 'Your order is ready for collection!',
  collected: 'Thank you for collecting your order!',
  cancelled: 'Your order has been cancelled.',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { restaurantId, orderId, newStatus, orderData, rejectionReason } = await req.json();

    if (!restaurantId || !orderId || !newStatus || !orderData) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    let restaurant = null;
    try {
      const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
      restaurant = restaurants?.[0] || null;
    } catch (e) {
      // Invalid id format or query error — treat as not found
      console.warn('[STATUS-NOTIFY] Restaurant lookup failed:', e?.message);
    }
    if (!restaurant) {
      return new Response(JSON.stringify({ error: 'Restaurant not found' }), { status: 404 });
    }

    const smsSettings = restaurant.sms_notification_settings || {};
    const waSettings = restaurant.whatsapp_notification_settings || {};
    const isCancellation = newStatus === 'cancelled';

    const smsEnabled = !!smsSettings.enabled && (isCancellation || !!smsSettings[newStatus]);
    const waEnabled = !!waSettings.enabled && (isCancellation || !!waSettings[newStatus]);

    if (!smsEnabled && !waEnabled) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Status not enabled for notifications' }),
        { status: 200 }
      );
    }

    const customerPhone = orderData.phone || orderData.guest_phone;
    if (!customerPhone) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'No customer phone on order' }),
        { status: 200 }
      );
    }

    // Load per-restaurant templates for this status (best-effort)
    const templates = await base44.asServiceRole.entities.NotificationTemplate.filter({
      restaurant_id: restaurantId,
      status: newStatus,
    }).catch(() => []);

    const variables = {
      order_number: orderData.order_number || orderId,
      restaurant_name: restaurant.name,
      eta: orderData.estimated_delivery || 'Soon',
      delivery_address: orderData.delivery_address || '',
      customer_name: orderData.guest_name || 'Customer',
      items_count: String((orderData.items || []).length),
    };

    const substitute = (text) => {
      let out = text;
      for (const [k, v] of Object.entries(variables)) {
        out = out.replace(new RegExp(`{${k}}`, 'g'), String(v));
      }
      return out;
    };

    const orderLabel = orderData.order_number || `#${String(orderId).slice(-6)}`;
    const orderNumber = orderData.order_number || orderId;
    const fallbackMsg = `${restaurant.name}: ${STATUS_MESSAGES[newStatus] || 'Your order has been updated.'} (Order ${orderLabel})`;

    // ── SMS ───────────────────────────────────────────────────────────────────
    if (smsEnabled) {
      try {
        const smsTemplate = templates.find((t) => t.channel === 'sms');
        const message = smsTemplate?.template_text ? substitute(smsTemplate.template_text) : fallbackMsg;
        base44.functions
          .invoke('sendSMS', {
            to: customerPhone,
            message,
            orderId,
            restaurantId,
            restaurantName: restaurant.name,
            smsType: 'customer_notification',
          })
          .catch((e) => console.warn('[STATUS-NOTIFY] SMS failed:', e?.message));
      } catch (e) {
        console.warn('[STATUS-NOTIFY] SMS dispatch error:', e?.message);
      }
    }

    // ── WhatsApp ──────────────────────────────────────────────────────────────
    if (waEnabled) {
      try {
        const waTemplate = templates.find((t) => t.channel === 'whatsapp');
        const message = waTemplate?.template_text ? substitute(waTemplate.template_text) : fallbackMsg;
        base44.functions
          .invoke('sendWhatsAppCustomer', {
            to: customerPhone,
            message,
            orderId,
            restaurantId,
            restaurantName: restaurant.name,
            status: newStatus,
            orderNumber,
            rejectionReason: isCancellation ? (rejectionReason || 'No reason provided') : undefined,
          })
          .catch((e) => console.warn('[STATUS-NOTIFY] WhatsApp failed:', e?.message));
      } catch (e) {
        console.warn('[STATUS-NOTIFY] WhatsApp dispatch error:', e?.message);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sms: smsEnabled, whatsapp: waEnabled }),
      { status: 200 }
    );
  } catch (error) {
    console.error('[STATUS-NOTIFY] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message, success: false }), { status: 500 });
  }
});