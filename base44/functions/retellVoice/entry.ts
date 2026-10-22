/**
 * retellVoice — the phone agent's bridge between Retell AI and aiOrderingCore
 *
 * ONE URL, three kinds of request from Retell, all signed with X-Retell-Signature
 * (HMAC-SHA256 of raw body + timestamp, keyed with RETELL_API_KEY):
 *
 *   1. Inbound call webhook   { event: "call_inbound", call_inbound: { call_id, from_number, to_number } }
 *      Set as the phone number's "Inbound Webhook URL" in Retell. The DIALLED number is
 *      looked up in AiChannelNumber (channel phone) to find the restaurant; a core
 *      session is started (external_id = Retell call id, so a retry resumes it) and the
 *      restaurant's details go back as dynamic variables for the agent prompt.
 *
 *   2. Tool calls             { name, args, call: { call_id, metadata, ... } }
 *      Every custom function on the Retell agent points here; `name` picks the core
 *      action. Answers are short JSON built for a voice model: what to say, what to
 *      ask next, and the ids it needs - never long menus.
 *
 *   3. Call events            { event: "call_started" | "call_ended" | "call_analyzed", call: {...} }
 *      Set as the agent's webhook URL. Ends the core session and keeps duration,
 *      recording and transcript on AiOrderSession for Super Admin > AI Ordering.
 *
 * All ordering rules (menu, options, prices, hours, delivery zones, minimums, placing
 * the order) live in aiOrderingCore - this file only translates.
 *
 * ENV  RETELL_API_KEY (required), AI_CORE_API_KEY (required)
 * URL  https://<app domain>/functions/retellVoice
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LOG = '[retellVoice]';
const SIG_TOLERANCE_MS = 5 * 60 * 1000;
const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const nowIso = () => new Date().toISOString();

/** Any UK/intl number -> E.164 digits, no + (same rule as the core). */
function phoneDigits(raw) {
    let d = String(raw || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = '44' + d.slice(1);
    return /^\d{8,15}$/.test(d) ? d : '';
}
const e164 = (raw) => { const d = phoneDigits(raw); return d ? `+${d}` : ''; };
/** "447700900123" -> "07700 900123", for reading a number back to the caller. */
const sayPhone = (d) => (d && d.startsWith('44') ? `0${d.slice(2, 6)} ${d.slice(6)}` : d ? `+${d}` : '');

// ── Signature (same scheme as retell-sdk verify) ────────────────────────────
async function validSignature(raw, header) {
    const key = Deno.env.get('RETELL_API_KEY');
    const m = /^v=(\d+),d=([0-9a-f]{64})$/i.exec(String(header || '').trim());
    if (!key || !m) return false;
    const ts = Number(m[1]);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIG_TOLERANCE_MS) return false;
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const digest = new Uint8Array(m[2].match(/../g).map((h) => parseInt(h, 16)));
    return crypto.subtle.verify('HMAC', k, digest, new TextEncoder().encode(raw + m[1]));
}

// ── Core ────────────────────────────────────────────────────────────────────
async function core(base44, action, args = {}) {
    const res = await base44.asServiceRole.functions.invoke('aiOrderingCore', { action, key: Deno.env.get('AI_CORE_API_KEY'), ...args })
        .catch((e) => ({ data: e?.response?.data }));
    const data = res?.data ?? res;
    if (!data || typeof data !== 'object' || !('ok' in data)) throw new Error(`aiOrderingCore ${action}: no usable response`);
    return data;
}

/** The core session for this call: from the call's metadata, else by Retell call id. */
async function sessionFor(db, call) {
    const fromMeta = call?.metadata?.session_id || call?.retell_llm_dynamic_variables?.session_id;
    if (fromMeta) return String(fromMeta);
    if (!call?.call_id) return null;
    const row = (await db.AiOrderSession.filter({ channel: 'phone', external_id: String(call.call_id) }).catch(() => []))[0];
    return row?.id || null;
}

// ── Shaping answers for a voice model ───────────────────────────────────────
function basketLines(basket) {
    return (basket || []).map((l) => `${l.line}. ${l.quantity} x ${l.name}${l.options ? ` (${l.options})` : ''} = ${money(l.line_total)}`);
}
function quoteText(q) {
    if (!q) return '';
    const parts = [`items ${money(q.subtotal)}`];
    if (q.order_type === 'delivery') parts.push(`delivery ${q.delivery_fee ? money(q.delivery_fee) : 'free'}`);
    if (q.small_order_surcharge) parts.push(`service charge ${money(q.small_order_surcharge)}`);
    return `${parts.join(', ')}; total ${money(q.total)}`;
}
function question(q) {
    if (!q) return undefined;
    const extras = (q.options || []).filter((o) => o.extra_price).map((o) => `${o.label} costs ${money(o.extra_price)} more`);
    return {
        item: q.item_name, choosing: q.group,
        options: (q.options || []).map((o) => o.label),
        ...(extras.length ? { prices: extras } : {}),
        ask_caller: q.say,
        then: 'Call choose_option with exactly one of the options, as written. If they want something else on this item, ask this question first.',
    };
}
/** A core refusal in a form the agent can act on. */
function refusal(r) {
    const out = { ok: false, problem: r.code, say: r.say || r.error };
    if (r.question) out.waiting_for = question(r.question);
    if (r.code === 'ALREADY_ORDERED') out.next = 'The order is already placed. Offer to transfer for any change.';
    return out;
}

// ── Tools ───────────────────────────────────────────────────────────────────
const TOOLS = {
    async search_menu(ctx, a) {
        const r = await core(ctx.base44, 'search_menu', { session_id: ctx.sid, query: clip(a.query, 80), limit: 5 });
        if (!r.ok) return { ok: false, problem: r.code, say: r.say, menu_sections: r.categories };
        return {
            ok: true,
            items: r.items.map((i) => ({
                menu_item_id: i.menu_item_id, name: i.name, price: money(i.price),
                ...(i.has_required_options ? { has_choices: true } : {}),
                ...(i.description ? { about: clip(i.description, 90) } : {}),
            })),
            next: 'Pick the item the caller means. If two could match, ask which one. Then call add_item with its menu_item_id.',
        };
    },

    async get_item_details(ctx, a) {
        const r = await core(ctx.base44, 'get_item', { session_id: ctx.sid, menu_item_id: a.menu_item_id });
        if (!r.ok) return refusal(r);
        const i = r.item;
        return {
            ok: true, name: i.name, price: money(i.price), description: i.description || 'No description on the menu.',
            allergens: i.allergens.length ? i.allergens : 'none listed',
            allergy_rule: 'Only repeat the listed allergens. Never say anything is allergen-free. For a serious allergy, offer to transfer to the team.',
            choices: (i.option_groups || []).map((g) => ({
                group: String(g.group || '').replace(/[:\s]+$/, '') || (g.type === 'meal_upgrade' ? 'Meal' : 'Option'), required: g.required,
                options: g.options.map((o) => (o.extra_price ? `${o.label} (+${money(o.extra_price)})` : o.label)),
                ...(g.meal_groups ? { if_meal: g.meal_groups.map((m) => ({ group: String(m.group || '').replace(/[:\s]+$/, '') || 'Meal choice', options: m.options.map((o) => String(o.label).trim()) })) } : {}),
            })),
        };
    },

    async add_item(ctx, a) {
        const options = {};
        for (const c of Array.isArray(a.choices) ? a.choices : []) {
            if (!c?.group || !c?.option) continue;
            options[c.group] = options[c.group] ? [].concat(options[c.group], c.option) : c.option;
        }
        const r = await core(ctx.base44, 'add_item', { session_id: ctx.sid, menu_item_id: a.menu_item_id, quantity: a.quantity || 1, options });
        if (!r.ok) return refusal(r);
        const ignored = r.ignored_options?.length ? { not_understood: r.ignored_options, note: 'Those choices did not match the menu; they will be asked again if needed.' } : {};
        if (!r.added) return { ok: true, added: false, waiting_for: question(r.needs_choice), ...ignored };
        return { ok: true, added: `${r.line.quantity} x ${r.line.name}${r.line.options ? ` (${r.line.options})` : ''}`, running_total: money(r.quote?.subtotal), next: 'Ask if they would like anything else.', ...ignored };
    },

    async choose_option(ctx, a) {
        const r = await core(ctx.base44, 'choose_option', { session_id: ctx.sid, option: clip(String(a.option || '').replace(/\(\s*\+?\s*£?\s*[\d.]+\s*\)/g, ''), 80) });
        if (!r.ok) return refusal(r);
        if (!r.added) return { ok: true, added: false, waiting_for: question(r.needs_choice) };
        return { ok: true, added: `${r.line.quantity} x ${r.line.name}${r.line.options ? ` (${r.line.options})` : ''}`, running_total: money(r.quote?.subtotal), next: 'Ask if they would like anything else.' };
    },

    async skip_item(ctx) {
        const r = await core(ctx.base44, 'cancel_pending', { session_id: ctx.sid });
        return r.ok ? { ok: true, say: 'Left that item out.' } : refusal(r);
    },

    async change_quantity(ctx, a) {
        const q = Math.max(0, Math.round(Number(a.quantity) || 0));
        const r = await core(ctx.base44, q === 0 ? 'remove_item' : 'set_quantity', { session_id: ctx.sid, line: Number(a.line), quantity: q || undefined });
        if (!r.ok) return { ...refusal(r), basket: basketLines(r.basket) };
        return { ok: true, basket: basketLines(r.basket), totals: quoteText(r.quote) };
    },

    async get_order(ctx) {
        const r = await core(ctx.base44, 'get_basket', { session_id: ctx.sid });
        if (!r.ok) return refusal(r);
        return {
            ok: true, basket: basketLines(r.basket), totals: quoteText(r.quote),
            ...(r.removed_unavailable?.length ? { removed_because_unavailable: r.removed_unavailable } : {}),
            ...(r.pending ? { waiting_for: question(r.pending) } : {}),
            ...(r.quote?.below_minimum ? { below_minimum: `Delivery minimum is ${money(r.quote.minimum_order)}; ${money(r.quote.short_by)} short.` } : {}),
        };
    },

    async set_order_type(ctx, a) {
        const r = await core(ctx.base44, 'set_order_type', { session_id: ctx.sid, order_type: a.order_type });
        if (!r.ok) return refusal(r);
        return { ok: true, order_type: r.order_type, ...(r.service_note ? { warning: r.service_note } : {}),
            next: r.order_type === 'delivery' ? 'Ask for the delivery postcode, then call check_delivery.' : 'Carry on with the order.' };
    },

    async check_delivery(ctx, a) {
        const r = await core(ctx.base44, 'check_delivery', { session_id: ctx.sid, postcode: a.postcode, address: a.address ? clip(a.address, 200) : undefined });
        if (!r.ok) {
            const out = refusal(r);
            if (r.code === 'OUT_OF_AREA' && r.collection_enabled) out.next = 'Offer collection instead.';
            if (r.code === 'BAD_POSTCODE' || r.code === 'UNKNOWN_POSTCODE') out.next = 'Ask them to say the postcode again slowly, then read it back letter by letter.';
            return out;
        }
        return { ok: true, postcode: r.delivery.postcode, say: r.say, totals: quoteText(r.quote),
            ...(r.quote?.below_minimum ? { below_minimum: `They need ${money(r.quote.short_by)} more for delivery.` } : {}) };
    },

    async set_customer(ctx, a) {
        const r = await core(ctx.base44, 'set_customer', {
            session_id: ctx.sid, name: a.name ? clip(a.name, 60) : undefined, phone: a.phone || undefined,
            address: a.address ? clip(a.address, 200) : undefined, postcode: a.postcode || undefined,
        });
        if (!r.ok) return refusal(r);
        return { ok: true, saved: r.customer };
    },

    async place_order(ctx, a) {
        const pay = a.payment === 'card' ? 'card' : 'cash';
        if (pay === 'cash') {
            const r = await core(ctx.base44, 'place_cash_order', { session_id: ctx.sid, notes: a.notes ? clip(a.notes, 200) : undefined });
            if (!r.ok) {
                const out = refusal(r);
                if (r.code === 'NO_CASH') out.next = 'Offer to text a card payment link instead (place_order with payment card).';
                return out;
            }
            return { ok: true, placed: true, order_number: r.order_number || undefined, total: money(r.total), ready_in: r.eta,
                say: r.say, next: 'Thank them and end the call.' };
        }
        const r = await core(ctx.base44, 'send_payment_link', { session_id: ctx.sid, send_sms: true });
        if (!r.ok) return refusal(r);
        if (!r.sms_sent) {
            return { ok: false, problem: 'SMS_FAILED', total: money(r.quote?.total),
                say: "I couldn't text a link to that number.",
                next: 'Ask for a UK mobile number (set_customer with phone), then try place_order with card again - or offer to pay cash.' };
        }
        return { ok: true, link_sent: true, total: money(r.quote?.total),
            say: `I've texted you a secure link to pay ${money(r.quote?.total)}. Your order goes through to the kitchen as soon as it's paid.`,
            next: 'Tell them the link works for 2 hours, thank them, and end the call.' };
    },

    async note_transfer(ctx, a) {
        // Called by the agent just before Retell's transfer tool, so Super Admin shows why.
        const r = await core(ctx.base44, 'handoff', { session_id: ctx.sid, reason: clip(a.reason || 'caller asked for a person', 160) });
        return r.ok ? { ok: true } : refusal(r);
    },
};

// ── Inbound call: find the restaurant, start the session ────────────────────
async function inbound(base44, db, ev) {
    const c = ev.call_inbound || {};
    const dialled = phoneDigits(c.to_number);
    const rows = dialled ? await db.AiChannelNumber.filter({ number: dialled }).catch(() => []) : [];
    const link = rows.find((r) => r.channel === 'phone' && r.is_active !== false);
    if (!link) {
        console.warn(`${LOG} call to ${c.to_number} - number not linked to a restaurant`);
        return { call_inbound: { reject: true } };
    }
    const caller = phoneDigits(c.from_number);
    const s = await core(base44, 'start_session', {
        channel: 'phone', restaurant_id: link.restaurant_id, external_id: String(c.call_id || ''),
        customer_phone: caller || undefined,
    });
    if (!s.ok) {
        console.error(`${LOG} start_session failed for ${dialled}: ${s.code}`);
        return { call_inbound: { reject: true } };
    }
    const r = s.restaurant;
    const rest = (await db.Restaurant.filter({ id: link.restaurant_id }).catch(() => []))[0] || {};
    const transfer = e164(link.transfer_number || rest.alert_phone || '');
    const back = s.returning_customer;
    const vars = {
        session_id: s.session_id,
        restaurant_name: r.name,
        restaurant_open: r.open ? 'yes' : 'no',
        closed_reason: r.closed_reason || '',
        delivery_available: r.delivery_open ? 'yes' : 'no',
        collection_available: r.collection_open ? 'yes' : r.collection_enabled ? 'not right now' : 'no',
        cash_accepted: r.accepts_cash ? 'yes' : 'no',
        delivery_time: r.delivery_time || '30 to 45 minutes',
        restaurant_address: r.address || '',
        caller_number: caller ? sayPhone(caller) : 'withheld',
        caller_is_mobile: caller && /^447\d{9}$/.test(caller) ? 'yes' : 'no',
        transfer_available: transfer ? 'yes' : 'no',
        transfer_number: transfer || '',
        returning_customer: back
            ? `Yes. Name on last order: ${back.name || 'unknown'}. Last time: ${back.last_order_type || 'order'}${back.last_delivery_address ? ` to ${back.last_delivery_address}` : ''}, ${back.last_items.slice(0, 4).join(', ')}.`
            : 'no',
    };
    const response = { call_inbound: { dynamic_variables: vars, metadata: { session_id: s.session_id, restaurant_id: link.restaurant_id } } };
    if (!r.open) {
        response.call_inbound.agent_override = { retell_llm: {
            begin_message: `Thanks for calling ${r.name}. I'm the automated ordering assistant. ${r.closed_reason || "We're closed at the moment."} Please call back when we're open. Goodbye!`,
        } };
    }
    return response;
}

// ── Call events: keep the outcome on the session ────────────────────────────
async function callEvent(base44, db, ev) {
    const call = ev.call || {};
    if (!['call_ended', 'call_analyzed'].includes(ev.event)) return;
    const sid = await sessionFor(db, call);
    if (!sid) return;
    const patch = {};
    if (call.duration_ms != null) patch.call_duration_ms = Number(call.duration_ms);
    else if (call.start_timestamp && call.end_timestamp) patch.call_duration_ms = Number(call.end_timestamp) - Number(call.start_timestamp);
    if (call.recording_url) patch.recording_url = call.recording_url;
    if (call.transcript) patch.transcript = clip(call.transcript, 20000);
    if (call.disconnection_reason) patch.disconnection_reason = call.disconnection_reason;
    if (call.call_analysis?.call_summary) patch.call_summary = clip(call.call_analysis.call_summary, 2000);
    if (Object.keys(patch).length) await db.AiOrderSession.update(sid, patch).catch((e) => console.error(`${LOG} save call data: ${e?.message}`));
    if (ev.event === 'call_ended') {
        if (call.disconnection_reason === 'call_transfer') await core(base44, 'handoff', { session_id: sid, reason: 'transferred to the restaurant' }).catch(() => null);
        await core(base44, 'end_session', { session_id: sid, outcome: call.disconnection_reason || 'call ended' }).catch(() => null);
    }
}

// ── Entry point ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
    const raw = await req.text();
    if (!(await validSignature(raw, req.headers.get('x-retell-signature')))) {
        console.warn(`${LOG} bad or missing signature`);
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    try {
        if (body.event === 'call_inbound') return Response.json(await inbound(base44, db, body));
        if (body.event && body.call) { await callEvent(base44, db, body); return Response.json({ ok: true }); }

        const tool = TOOLS[body.name];
        if (!tool) return Response.json({ ok: false, problem: 'UNKNOWN_TOOL', say: 'Sorry, something went wrong on our side.' });
        const sid = await sessionFor(db, body.call);
        if (!sid) return Response.json({ ok: false, problem: 'NO_SESSION', say: 'Sorry, something went wrong on our side.', next: 'Apologise and transfer to the team if possible.' });
        const out = await tool({ base44, db, sid, call: body.call }, body.args || {});
        return Response.json(out);
    } catch (e) {
        console.error(`${LOG} ${body.event || body.name} failed:`, e?.message);
        return Response.json({ ok: false, problem: 'INTERNAL', say: 'Sorry, something went wrong on our side.', next: 'Apologise and offer to transfer to the team.' });
    }
});
