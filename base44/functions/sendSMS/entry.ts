/**
 * sendSMS — SMS provider router (HTTPSMS primary, Twilio fallback)
 * =================================================================
 * Caller-facing contract is UNCHANGED: { to, message, orderId, restaurantId,
 * restaurantName, smsType } → { success, messageSid, simulated, provider? }.
 *
 * Internal flow:
 *   1. Auth + phone validation (preserved exactly from original).
 *   2. Try HTTPSMS (primary) if configured.
 *      - Success → log + return.
 *      - Ambiguous failure (network error, 429, 5xx, unexpected 2xx body)
 *        → log as "uncertain", do NOT fall back (prevents duplicate SMS).
 *      - Deterministic failure (4xx except 429) → log, fall through to Twilio.
 *   3. Fallback to Twilio (preserved original implementation).
 *   4. If neither provider configured → simulate (preserved behaviour).
 *
 * Idempotency: each attempt carries a deterministic key
 *   sms_{orderId}_{smsType}_{to}  (or sms_notif_{to}_{smsType} if no orderId)
 * passed to HTTPSMS as request_id so retries are deduplicated provider-side.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ── Phone normalization (preserved from original) ───────────────────────
function normalizeUkMobile(rawPhone) {
    let cleanPhone = rawPhone.replace(/[\s\-\(\)]/g, '');
    if (cleanPhone.startsWith('00')) {
        cleanPhone = '+' + cleanPhone.slice(2);
    } else if (cleanPhone.startsWith('0')) {
        cleanPhone = '+44' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('44')) {
        cleanPhone = '+' + cleanPhone;
    } else if (cleanPhone.startsWith('7')) {
        cleanPhone = '+44' + cleanPhone;
    } else if (!cleanPhone.startsWith('+')) {
        cleanPhone = '+44' + cleanPhone;
    }
    if (!cleanPhone.match(/^\+447\d{9}$/)) {
        return null;
    }
    return cleanPhone;
}

// ── Idempotency key ─────────────────────────────────────────────────────
function buildIdempotencyKey({ orderId, smsType, to }) {
    const type = smsType || 'customer_notification';
    if (orderId) {
        return `sms_${orderId}_${type}_${to}`;
    }
    return `sms_notif_${to}_${type}`;
}

// ── HTTPSMS provider (primary) ──────────────────────────────────────────
async function sendViaHttpsms({ to, message, idempotencyKey }) {
    const apiKey = Deno.env.get('HTTPSMS_API_KEY');
    const from = Deno.env.get('HTTPSMS_FROM');

    if (!apiKey || !from) {
        return { success: false, provider: 'httpsms', error: 'HTTPSMS not configured', notConfigured: true };
    }

    try {
        const response = await fetch('https://api.httpsms.com/v1/messages/send', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                content: message,
                from: from,
                to: to,
                request_id: idempotencyKey,
            }),
        });

        // Ambiguous: rate-limited or server error — request MAY have been accepted
        if (response.status === 429 || response.status >= 500) {
            const text = await response.text().catch(() => '');
            return {
                success: false,
                provider: 'httpsms',
                error: `HTTPSMS HTTP ${response.status}: ${text.slice(0, 500)}`,
                ambiguous: true,
            };
        }

        // Deterministic client error — message was definitely NOT accepted
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return {
                success: false,
                provider: 'httpsms',
                error: `HTTPSMS HTTP ${response.status}: ${text.slice(0, 500)}`,
                ambiguous: false,
            };
        }

        const data = await response.json();

        // HTTPSMS success: { status: "success", data: { id, request_id, status: "pending", ... } }
        if (data?.status === 'success' && data?.data?.id) {
            return {
                success: true,
                provider: 'httpsms',
                provider_message_id: data.data.id,
                request_id: data.data.request_id || idempotencyKey,
                status: 'accepted',
            };
        }

        // 2xx but unexpected body — ambiguous (don't know if accepted)
        return {
            success: false,
            provider: 'httpsms',
            error: `HTTPSMS unexpected response: ${JSON.stringify(data).slice(0, 500)}`,
            ambiguous: true,
        };
    } catch (e) {
        // Network error — ambiguous (request may have reached HTTPSMS)
        return {
            success: false,
            provider: 'httpsms',
            error: `HTTPSMS network error: ${e.message}`,
            ambiguous: true,
        };
    }
}

// ── Twilio provider (fallback — preserved from original) ────────────────
async function sendViaTwilio({ to, message, isFallback }) {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !twilioPhone) {
        return { success: false, provider: 'twilio', error: 'Twilio not configured', notConfigured: true };
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
            return {
                success: false,
                provider: 'twilio',
                error: `Twilio HTTP ${response.status}: ${error.slice(0, 500)}`,
                isFallback,
            };
        }

        const result = await response.json();
        return {
            success: true,
            provider: 'twilio',
            provider_message_id: result.sid,
            status: 'accepted',
            isFallback,
        };
    } catch (e) {
        return {
            success: false,
            provider: 'twilio',
            error: `Twilio network error: ${e.message}`,
            isFallback,
        };
    }
}

// ── SmsLog helper (wraps create so logging failures never block SMS) ────
async function logSmsAttempt(base44, p) {
    try {
        await base44.asServiceRole.entities.SmsLog.create({
            restaurant_id: p.restaurantId || null,
            restaurant_name: p.restaurantName || null,
            to: p.to,
            message: p.message,
            order_id: p.orderId || null,
            status: p.status,
            message_sid: p.messageSid || null,
            error_details: p.errorDetails || null,
            type: p.type || 'customer_notification',
            provider: p.provider || null,
            provider_message_id: p.providerMessageId || null,
            request_id: p.requestId || null,
            is_fallback: p.isFallback || false,
            failure_reason: p.failureReason || null,
            idempotency_key: p.idempotencyKey || null,
            fallback_status: p.fallbackStatus || 'none',
        });
    } catch (e) {
        console.error('[SMS-ROUTER] Failed to log SMS attempt:', e?.message);
    }
}

// ── Main handler / router ───────────────────────────────────────────────
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { to, message, orderId, restaurantId, restaurantName, smsType } = await req.json();

        // SECURITY: Either authenticated user OR valid recent order (for guest checkout)
        // — preserved exactly from original implementation —
        let isAuthorized = false;

        try {
            const user = await base44.auth.me();
            if (user) {
                isAuthorized = true;
            }
        } catch (e) {
            // Not authenticated — STRICT: only allow if orderId matches and `to` matches order.phone
            if (orderId && to) {
                try {
                    const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
                    if (orders.length > 0) {
                        const order = orders[0];
                        const orderAge = Date.now() - new Date(order.created_date).getTime();

                        const normalizePhone = (p) => (p || '').replace(/\D/g, '');
                        const requestPhone = normalizePhone(to);
                        const orderPhone = normalizePhone(order.phone);

                        if (orderAge < 10 * 60 * 1000 && requestPhone && orderPhone && requestPhone === orderPhone) {
                            isAuthorized = true;
                        } else {
                            console.error(`[SECURITY] SMS guest-auth failed: phone mismatch or stale order ${orderId}`);
                        }
                    }
                } catch (orderError) {
                    console.error('Order validation failed:', orderError);
                }
            }
        }

        if (!isAuthorized) {
            return Response.json({ error: 'Unauthorized - authentication or recent order required' }, { status: 401 });
        }

        if (!to || !message) {
            return Response.json({ error: 'Missing required fields: to, message' }, { status: 400 });
        }

        // ── Phone normalization & validation (preserved) ──
        const formattedPhone = normalizeUkMobile(to);
        if (!formattedPhone) {
            return Response.json({
                error: 'Invalid UK mobile number. Must be a UK mobile starting with 07',
                received: to,
            }, { status: 400 });
        }

        // ── Idempotency key ──
        const idempotencyKey = buildIdempotencyKey({ orderId, smsType, to: formattedPhone });

        const logParams = {
            restaurantId,
            restaurantName,
            to: formattedPhone,
            message,
            orderId,
            type: smsType || 'customer_notification',
            idempotencyKey,
        };

        const httpsmsConfigured = !!(Deno.env.get('HTTPSMS_API_KEY') && Deno.env.get('HTTPSMS_FROM'));
        const twilioConfigured = !!(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN') && Deno.env.get('TWILIO_PHONE_NUMBER'));

        // ── Neither provider configured → simulate (preserved behaviour) ──
        if (!httpsmsConfigured && !twilioConfigured) {
            await logSmsAttempt(base44, { ...logParams, status: 'simulated', provider: 'none' });
            return Response.json({
                success: true,
                message: 'SMS simulation (no provider configured)',
                simulated: true,
            });
        }

        // ══ PRIMARY: HTTPSMS ═══════════════════════════════════════════════
        let httpsmsResult = null;
        if (httpsmsConfigured) {
            httpsmsResult = await sendViaHttpsms({
                to: formattedPhone,
                message,
                idempotencyKey,
            });

            if (httpsmsResult.success) {
                // HTTPSMS HTTP 200 = accepted for processing, NOT confirmed sent.
                // Status is "pending" until the webhook confirms sent/delivered/failed/expired.
                await logSmsAttempt(base44, {
                    ...logParams,
                    status: 'pending',
                    provider: 'httpsms',
                    providerMessageId: httpsmsResult.provider_message_id,
                    requestId: httpsmsResult.request_id,
                    fallbackStatus: 'none',
                });
                const maskedPhone = formattedPhone.replace(/\d(?=\d{3})/g, '*');
                console.log(`✅ SMS accepted by HTTPSMS (pending webhook) to ${maskedPhone}, ID: ${httpsmsResult.provider_message_id}`);
                return Response.json({
                    success: true,
                    messageSid: httpsmsResult.provider_message_id,
                    provider: 'httpsms',
                    simulated: false,
                });
            }

            // Log HTTPSMS failure (before any fallback decision)
            await logSmsAttempt(base44, {
                ...logParams,
                status: httpsmsResult.ambiguous ? 'uncertain' : 'failed',
                provider: 'httpsms',
                failureReason: httpsmsResult.error,
                isFallback: false,
            });

            // ── AMBIGUOUS: do NOT fall back — could cause duplicate SMS ──
            if (httpsmsResult.ambiguous) {
                console.warn(`[SMS-ROUTER] HTTPSMS ambiguous failure (no fallback): ${httpsmsResult.error}`);
                return Response.json({
                    success: false,
                    error: 'HTTPSMS returned an ambiguous result — Twilio fallback skipped to prevent duplicate SMS',
                    provider: 'httpsms',
                    ambiguous: true,
                    httpsmsError: httpsmsResult.error,
                    idempotencyKey,
                }, { status: 502 });
            }

            // ── DETERMINISTIC FAILURE: fall through to Twilio ──
            console.warn(`[SMS-ROUTER] HTTPSMS failed (deterministic), falling back to Twilio: ${httpsmsResult.error}`);
        }

        // ══ FALLBACK: Twilio ══════════════════════════════════════════════
        const isFallback = !!httpsmsResult; // true if we tried HTTPSMS first
        const twilioResult = await sendViaTwilio({
            to: formattedPhone,
            message,
            isFallback,
        });

        if (twilioResult.success) {
            await logSmsAttempt(base44, {
                ...logParams,
                status: 'sent',
                provider: 'twilio',
                providerMessageId: twilioResult.provider_message_id,
                messageSid: twilioResult.provider_message_id, // backward-compat with message_sid
                isFallback,
            });
            const maskedPhone = formattedPhone.replace(/\d(?=\d{3})/g, '*');
            console.log(`✅ SMS sent via Twilio${isFallback ? ' (fallback)' : ''} to ${maskedPhone}, SID: ${twilioResult.provider_message_id}`);
            return Response.json({
                success: true,
                messageSid: twilioResult.provider_message_id,
                provider: 'twilio',
                simulated: false,
                isFallback,
            });
        }

        // ── Twilio not configured ──
        if (twilioResult.notConfigured) {
            await logSmsAttempt(base44, {
                ...logParams,
                status: 'simulated',
                provider: 'none',
                failureReason: httpsmsResult?.error || null,
                isFallback,
            });
            return Response.json({
                success: true,
                message: 'SMS simulation (Twilio not configured' + (httpsmsConfigured ? ', HTTPSMS failed' : '') + ')',
                simulated: true,
            });
        }

        // ── Both providers failed ──
        await logSmsAttempt(base44, {
            ...logParams,
            status: 'failed',
            provider: 'twilio',
            failureReason: twilioResult.error,
            isFallback: true,
        });
        console.error(`[SMS-ROUTER] Both providers failed. HTTPSMS: ${httpsmsResult?.error || 'not configured'}. Twilio: ${twilioResult.error}`);
        return Response.json({
            success: false,
            error: 'Both SMS providers failed',
            providers: {
                httpsms: httpsmsResult?.error || 'not configured',
                twilio: twilioResult.error,
            },
            idempotencyKey,
        }, { status: 500 });

    } catch (error) {
        console.error('SMS function error:', error);
        return Response.json({
            error: error.message || 'Failed to send SMS',
        }, { status: 500 });
    }
});