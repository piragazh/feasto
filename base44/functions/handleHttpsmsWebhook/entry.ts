/**
 * handleHttpsmsWebhook — HTTPSMS asynchronous webhook processor
 * =================================================================
 * Receives HTTPSMS webhook events (CloudEvents format) and:
 *   1. Verifies the JWT Bearer token (HS256) in the Authorization header.
 *   2. Matches the event to an existing SmsLog via request_id or provider_message_id.
 *   3. Updates the SmsLog status for success events (sent / delivered).
 *   4. For failure events (failed / expired), atomically claims the fallback
 *      and sends via Twilio exactly once — using trusted SmsLog data, never
 *      webhook payload data.
 *
 * Webhook URL: https://mealdrop.base44.app/functions/handleHttpsmsWebhook
 *
 * Security: HTTPSMS signs every webhook with a JWT (HS256) using the signing
 * key configured in the HTTPSMS dashboard. We verify this before any processing.
 * The destination number and message body always come from the trusted SmsLog
 * record, never from the webhook payload.
 *
 * Events handled (official HTTPSMS event names):
 *   - message.phone.sent      → status = sent
 *   - message.phone.delivered → status = delivered (+ delivered_at)
 *   - message.send.failed     → status = failed + atomic Twilio fallback
 *   - message.send.expired    → status = expired + atomic Twilio fallback
 *
 * Atomic fallback protection:
 *   updateMany({ id, status: 'pending' }, { $set: { status: failed, fallback_status: 'pending' } })
 *   Only the request that gets updated=1 may call Twilio. Duplicate/concurrent
 *   webhooks get updated=0 (status already transitioned) → no duplicate SMS.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ── Base64URL decode ───────────────────────────────────────────────────
function base64UrlToBytes(str) {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// ── JWT verification (HS256) per HTTPSMS docs ──────────────────────────
// HTTPSMS sends a JWT Bearer token signed with HS256 using the webhook
// signing key. We verify the HMAC-SHA256 signature using Web Crypto API.
async function verifyHttpsmsJwt(token, signingKey) {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlToBytes(signatureB64);

    try {
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(signingKey),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );
        return await crypto.subtle.verify('HMAC', key, signature, signedData);
    } catch (e) {
        console.error('[HTTPSMS-WEBHOOK] JWT verify error:', e?.message);
        return false;
    }
}

// ── Twilio fallback (inline — same logic as sendSMS sendViaTwilio) ─────
// SECURITY: `to` and `message` come from the trusted SmsLog, NOT the webhook.
async function sendViaTwilioFallback({ to, message }) {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !twilioPhone) {
        return { success: false, error: 'Twilio not configured', notConfigured: true };
    }

    try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const auth = btoa(`${accountSid}:${authToken}`);

        const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: to,
                From: twilioPhone,
                Body: message,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            return { success: false, error: `Twilio HTTP ${response.status}: ${error.slice(0, 500)}` };
        }

        const result = await response.json();
        return { success: true, provider_message_id: result.sid };
    } catch (e) {
        return { success: false, error: `Twilio network error: ${e.message}` };
    }
}

// ── Find SmsLog by request_id or provider_message_id ───────────────────
async function findSmsLog(base44, requestId, providerMessageId) {
    // Try request_id first (our idempotency key — most reliable match)
    if (requestId) {
        const logs = await base44.asServiceRole.entities.SmsLog.filter({
            request_id: requestId,
            provider: 'httpsms',
        });
        if (logs && logs.length > 0) return logs[0];
    }

    // Fallback: match by provider_message_id (data.id or data.message_id)
    if (providerMessageId) {
        const logs = await base44.asServiceRole.entities.SmsLog.filter({
            provider_message_id: providerMessageId,
            provider: 'httpsms',
        });
        if (logs && logs.length > 0) return logs[0];
    }

    return null;
}

// ── Atomic fallback claim ──────────────────────────────────────────────
// Atomically transitions the SmsLog from a non-terminal state to
// failed/expired + fallback_status=pending. Only one concurrent request
// can succeed (updated=1); duplicates get updated=0.
async function claimFallback(base44, smsLogId, failureStatus, failureReason) {
    // Try from 'pending' status (HTTPSMS accepted, awaiting webhook)
    let result = await base44.asServiceRole.entities.SmsLog.updateMany(
        { id: smsLogId, status: 'pending' },
        { $set: { status: failureStatus, fallback_status: 'pending', failure_reason: failureReason } }
    );
    if (result && result.updated > 0) return true;

    // Try from 'uncertain' status (ambiguous HTTPSMS response, now confirmed failed)
    result = await base44.asServiceRole.entities.SmsLog.updateMany(
        { id: smsLogId, status: 'uncertain' },
        { $set: { status: failureStatus, fallback_status: 'pending', failure_reason: failureReason } }
    );
    return result && result.updated > 0;
}

// ── Create a separate SmsLog entry for the Twilio fallback attempt ─────
async function logTwilioFallbackAttempt(base44, original, twilioResult, failureReason) {
    try {
        await base44.asServiceRole.entities.SmsLog.create({
            restaurant_id: original.restaurant_id || null,
            restaurant_name: original.restaurant_name || null,
            to: original.to,
            message: original.message,
            order_id: original.order_id || null,
            status: twilioResult.success ? 'sent' : (twilioResult.notConfigured ? 'simulated' : 'failed'),
            type: original.type || 'customer_notification',
            provider: twilioResult.notConfigured ? 'none' : 'twilio',
            provider_message_id: twilioResult.provider_message_id || null,
            message_sid: twilioResult.provider_message_id || null,
            is_fallback: true,
            error_details: twilioResult.success ? null : twilioResult.error,
            failure_reason: twilioResult.success ? `Fallback after ${failureReason}` : twilioResult.error,
            idempotency_key: original.idempotency_key || null,
            fallback_status: twilioResult.success ? 'sent' : (twilioResult.notConfigured ? 'skipped' : 'failed'),
        });
    } catch (e) {
        console.error('[HTTPSMS-WEBHOOK] Failed to log Twilio fallback attempt:', e?.message);
    }
}

// ── Main handler ───────────────────────────────────────────────────────
Deno.serve(async (req) => {
    try {
        // ── Step 1: Verify webhook signing key is configured ──
        const signingKey = Deno.env.get('HTTPSMS_WEBHOOK_SIGNING_KEY');
        if (!signingKey) {
            console.error('[HTTPSMS-WEBHOOK] FATAL: HTTPSMS_WEBHOOK_SIGNING_KEY not configured');
            return Response.json({ error: 'Webhook not configured' }, { status: 500 });
        }

        // ── Step 2: Verify JWT signature ──
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.warn('[HTTPSMS-WEBHOOK] Missing or invalid Authorization header');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.slice(7);
        const isValid = await verifyHttpsmsJwt(token, signingKey);
        if (!isValid) {
            console.warn('[HTTPSMS-WEBHOOK] Invalid JWT signature — rejecting webhook');
            return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
        }

        // ── Step 3: Parse event ──
        const eventType = req.headers.get('X-Event-Type') || null;
        const body = await req.json();
        const eventTypeFinal = eventType || body?.type;

        if (!eventTypeFinal) {
            return Response.json({ error: 'Missing event type' }, { status: 400 });
        }

        const data = body?.data || {};
        const requestId = data.request_id || null;
        // message.send.expired uses data.message_id; all others use data.id
        const providerMessageId = data.id || data.message_id || null;
        const eventTimestamp = data.timestamp || null;
        const errorMessage = data.error_message || null;

        console.log(`[HTTPSMS-WEBHOOK] Event: ${eventTypeFinal} | request_id: ${requestId} | msg_id: ${providerMessageId}`);

        const base44 = createClientFromRequest(req);

        // ── Step 4: Find related SmsLog ──
        const smsLog = await findSmsLog(base44, requestId, providerMessageId);

        if (!smsLog) {
            // Unknown message — return 200 to stop HTTPSMS retries (can't process)
            console.warn(`[HTTPSMS-WEBHOOK] No SmsLog found — ignoring event ${eventTypeFinal}`);
            return Response.json({ received: true, matched: false });
        }

        // ══ SUCCESS EVENTS ═══════════════════════════════════════════════

        if (eventTypeFinal === 'message.phone.sent') {
            if (['pending', 'uncertain'].includes(smsLog.status)) {
                await base44.asServiceRole.entities.SmsLog.update(smsLog.id, {
                    status: 'sent',
                });
                console.log(`[HTTPSMS-WEBHOOK] SmsLog ${smsLog.id} → sent`);
            }
            return Response.json({ received: true, status: 'sent' });
        }

        if (eventTypeFinal === 'message.phone.delivered') {
            if (['pending', 'uncertain', 'sent'].includes(smsLog.status)) {
                await base44.asServiceRole.entities.SmsLog.update(smsLog.id, {
                    status: 'delivered',
                    delivered_at: eventTimestamp || new Date().toISOString(),
                });
                console.log(`[HTTPSMS-WEBHOOK] SmsLog ${smsLog.id} → delivered`);
            }
            return Response.json({ received: true, status: 'delivered' });
        }

        // ══ FAILURE EVENTS (trigger atomic Twilio fallback) ═══════════════

        if (eventTypeFinal === 'message.send.failed' || eventTypeFinal === 'message.send.expired') {
            const failureStatus = eventTypeFinal === 'message.send.expired' ? 'expired' : 'failed';
            const failureReason = errorMessage || `HTTPSMS event: ${eventTypeFinal}`;

            // ── ATOMIC FALLBACK CLAIM ──
            // Only one request can transition status from pending/uncertain to failed/expired.
            // Duplicate/concurrent webhooks get updated=0 → no duplicate Twilio send.
            const claimed = await claimFallback(base44, smsLog.id, failureStatus, failureReason);

            if (!claimed) {
                // Either already in terminal success (sent/delivered) or
                // fallback already claimed by a previous webhook delivery.
                console.log(`[HTTPSMS-WEBHOOK] SmsLog ${smsLog.id} fallback not claimed (status=${smsLog.status}) — skipping Twilio`);
                return Response.json({ received: true, fallback: false, reason: 'already_processed_or_terminal' });
            }

            console.log(`[HTTPSMS-WEBHOOK] SmsLog ${smsLog.id} fallback claimed — calling Twilio`);

            // ── Send via Twilio using TRUSTED SmsLog data ──
            // SECURITY: to and message come from the stored SmsLog, not the webhook payload.
            const twilioResult = await sendViaTwilioFallback({
                to: smsLog.to,
                message: smsLog.message,
            });

            // ── Update original SmsLog fallback_status ──
            const newFallbackStatus = twilioResult.success ? 'sent' : (twilioResult.notConfigured ? 'skipped' : 'failed');
            await base44.asServiceRole.entities.SmsLog.update(smsLog.id, {
                fallback_status: newFallbackStatus,
            });

            // ── Create separate SmsLog for the Twilio attempt ──
            await logTwilioFallbackAttempt(base44, smsLog, twilioResult, failureReason);

            if (twilioResult.success) {
                console.log(`[HTTPSMS-WEBHOOK] Twilio fallback sent for SmsLog ${smsLog.id}, SID: ${twilioResult.provider_message_id}`);
            } else {
                console.error(`[HTTPSMS-WEBHOOK] Twilio fallback failed for SmsLog ${smsLog.id}: ${twilioResult.error}`);
            }

            return Response.json({ received: true, fallback: true, twilioSuccess: twilioResult.success });
        }

        // ── Unhandled event type — acknowledge to stop retries ──
        console.log(`[HTTPSMS-WEBHOOK] Unhandled event type: ${eventTypeFinal}`);
        return Response.json({ received: true, unhandled: eventTypeFinal });

    } catch (error) {
        console.error('[HTTPSMS-WEBHOOK] Error:', error?.message || error);
        // Return 500 to trigger HTTPSMS retry (4 retries with 1s delay)
        return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
    }
});