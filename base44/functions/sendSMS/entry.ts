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
function buildIdempotencyKey({ orderId, smsType, to, dedupeKey }) {
    const type = smsType || 'customer_notification';
    // A text that is not about an order but must still go out each time it is asked for
    // (a new AI pay link, an AI transfer alert): without this, every such text to the same
    // number shares ONE key and a provider may drop the second as a repeat of the first.
    if (!orderId && dedupeKey) {
        return `sms_${String(dedupeKey).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}_${type}_${to}`;
    }
    if (orderId) {
        return `sms_${orderId}_${type}_${to}`;
    }
    return `sms_notif_${to}_${type}`;
}

// ── HTTPSMS provider (primary) ──────────────────────────────────────────
// apiKey / from are the sending country's httpSMS settings (see the router).
async function sendViaHttpsms({ to, message, idempotencyKey, apiKey, from }) {

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
// from is the sending country's Twilio number (see the router).
async function sendViaTwilio({ to, message, isFallback, from }) {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = from;

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

        const { to, message, orderId, restaurantId, restaurantName, smsType, dedupeKey, aiCoreKey } = await req.json();

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

        // Server-to-server from the AI ordering functions (pay link text, transfer alert): there is
        // no signed-in user on a phone call and no order yet, so they present the shared AI core key.
        if (!isAuthorized) {
            const expected = Deno.env.get('AI_CORE_API_KEY');
            if (expected && typeof aiCoreKey === 'string' && aiCoreKey.length === expected.length) {
                let diff = 0;
                for (let i = 0; i < expected.length; i++) diff |= aiCoreKey.charCodeAt(i) ^ expected.charCodeAt(i);
                if (diff === 0) isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return Response.json({ error: 'Unauthorized - authentication or recent order required' }, { status: 401 });
        }

        if (!to || !message) {
            return Response.json({ error: 'Missing required fields: to, message' }, { status: 400 });
        }

        // ── Which country's rules and senders apply ──
        // The restaurant's country (region mirror above). UK restaurants, and
        // any message whose restaurant can't be found, take the original path
        // unchanged: same validation, same secrets, same senders.
        const country = await restaurantCountryFor(base44, restaurantId, orderId);
        const isUk = country === 'GB';

        // ── Phone normalization & validation ──
        const formattedPhone = isUk ? normalizeUkMobile(to) : regionMobileE164(to, country);
        if (!formattedPhone) {
            return Response.json({
                error: isUk
                    ? 'Invalid UK mobile number. Must be a UK mobile starting with 07'
                    : `Invalid mobile number for this restaurant's country (${country})`,
                received: to,
            }, { status: 400 });
        }

        // ── Senders for that country ──
        // GB: HTTPSMS_API_KEY / HTTPSMS_FROM / TWILIO_PHONE_NUMBER, as before.
        // Other countries: their own httpSMS phone (HTTPSMS_FROM_<CODE>, a local
        // SIM; HTTPSMS_API_KEY_<CODE> optional, else the main key) and Twilio
        // number (TWILIO_PHONE_NUMBER_<CODE>, else the main Twilio number).
        // A non-UK text is never sent from the UK httpSMS SIM.
        const httpsmsApiKey = isUk ? (Deno.env.get('HTTPSMS_API_KEY') || '') : (regionEnv('HTTPSMS_API_KEY', country) || Deno.env.get('HTTPSMS_API_KEY') || '');
        const httpsmsFrom = regionEnv('HTTPSMS_FROM', country);
        const twilioFrom = isUk ? (Deno.env.get('TWILIO_PHONE_NUMBER') || '') : (regionEnv('TWILIO_PHONE_NUMBER', country) || Deno.env.get('TWILIO_PHONE_NUMBER') || '');

        // ── Idempotency key ──
        const idempotencyKey = buildIdempotencyKey({ orderId, smsType, to: formattedPhone, dedupeKey });

        const logParams = {
            restaurantId,
            restaurantName,
            to: formattedPhone,
            message,
            orderId,
            type: smsType || 'customer_notification',
            idempotencyKey,
        };

        const httpsmsConfigured = !!(httpsmsApiKey && httpsmsFrom);
        const twilioConfigured = !!(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN') && twilioFrom);

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
                apiKey: httpsmsApiKey,
                from: httpsmsFrom,
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
            from: twilioFrom,
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