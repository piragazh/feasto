/**
 * aiSessionCleanup — nightly housekeeping for AI ordering sessions
 *
 * Runs from the "AI Session Cleanup" workflow once a night. Takes no arguments: the
 * rules are fixed here, so calling it by hand can only do what the schedule does.
 *
 * 1. RETENTION (owner decision, Nov 2026: 30 days)
 *    Phone sessions older than RETAIN_DAYS lose their transcript, call summary and
 *    recording link, and the call itself (recording included) is deleted at Retell
 *    (DELETE /v2/delete-call/{call_id}). If Retell can't be reached the row is left
 *    alone and tried again the next night, so our copy never outlives theirs unnoticed.
 *    The session row stays (channel, state, basket, order id) for reporting.
 *
 * 2. STALE SESSIONS
 *    - 'active' with no activity for 24 hours        -> 'closed'
 *    - 'awaiting_payment' whose pay link expired 3+ hours ago -> 'closed', link revoked
 *    A closed chat simply starts a fresh session on the customer's next message.
 *
 * ENV  RETELL_API_KEY (to delete calls at Retell; without it only our copy is cleared)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LOG = '[aiSessionCleanup]';
const RETAIN_DAYS = 30;
const STALE_MS = 24 * 60 * 60 * 1000;
const PAY_GRACE_MS = 3 * 60 * 60 * 1000;
const PAGE = 200;
const MAX_ROWS = 5000;      // read per query per run
const MAX_PURGES = 200;     // calls deleted per run (each is a request to Retell)
const MAX_CLOSES = 500;

const ms = (v) => { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : 0; };

/** Every row matching `query`, oldest first. Read fully BEFORE any update, so paging can't skip rows. */
async function listAll(entity, query) {
    const out = [];
    for (let skip = 0; skip < MAX_ROWS; skip += PAGE) {
        const batch = await entity.filter(query, 'created_date', PAGE, skip);
        if (!Array.isArray(batch) || !batch.length) break;
        out.push(...batch);
        if (batch.length < PAGE) break;
    }
    return out;
}

/** true = gone at Retell (deleted now, or already absent); false = could not confirm. */
async function deleteRetellCall(key, callId) {
    try {
        const res = await fetch(`https://api.retellai.com/v2/delete-call/${encodeURIComponent(callId)}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000),
        });
        if (res.ok || res.status === 404) return true;
        console.warn(`${LOG} Retell refused to delete call ${callId}: HTTP ${res.status}`);
        return false;
    } catch (e) {
        console.warn(`${LOG} Retell delete failed for call ${callId}: ${e?.message}`);
        return false;
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole.entities;
        const now = Date.now();
        const result = { purged: 0, purge_waiting: 0, retell_failed: 0, closed_active: 0, closed_unpaid: 0 };

        // ── 1. Retention ──
        const cutoff = now - RETAIN_DAYS * 24 * 60 * 60 * 1000;
        const key = Deno.env.get('RETELL_API_KEY');
        if (!key) console.warn(`${LOG} RETELL_API_KEY is not set - clearing our copy only; recordings stay at Retell`);
        const old = (await listAll(db.AiOrderSession, { channel: 'phone', created_date: { $lt: new Date(cutoff).toISOString() } }))
            // the date is checked again here, so the rule holds even if the filter above is ignored
            .filter((s) => ms(s.created_date) && ms(s.created_date) < cutoff && (s.transcript || s.recording_url || s.call_summary));
        for (const s of old) {
            if (result.purged + result.retell_failed >= MAX_PURGES) { result.purge_waiting++; continue; }
            if (key && s.external_id && !(await deleteRetellCall(key, String(s.external_id)))) { result.retell_failed++; continue; }
            await db.AiOrderSession.update(s.id, { transcript: null, recording_url: null, call_summary: null });
            result.purged++;
        }

        // ── 2. Stale sessions ──
        const at = new Date(now).toISOString();
        const close = (s, note, extra = {}) => db.AiOrderSession.update(s.id, {
            state: 'closed', ended_at: s.ended_at || at, ...extra,
            event_log: [...(s.event_log || []), { at, action: 'cleanup', ok: true, note }].slice(-50),
        });
        // The latest of the three: reading the basket no longer writes last_activity_at, but chat turns still update the row
        const lastSeen = (s) => Math.max(ms(s.last_activity_at), ms(s.updated_date), ms(s.created_date));

        for (const s of await listAll(db.AiOrderSession, { state: 'active' })) {
            if (result.closed_active >= MAX_CLOSES) break;
            if (s.order_id || now - lastSeen(s) < STALE_MS) continue;
            await close(s, 'no activity for 24 hours');
            result.closed_active++;
        }
        for (const s of await listAll(db.AiOrderSession, { state: 'awaiting_payment' })) {
            if (result.closed_unpaid >= MAX_CLOSES) break;
            if (s.order_id) continue;
            const expired = s.checkout_token_expires_at ? ms(s.checkout_token_expires_at) + PAY_GRACE_MS < now : now - lastSeen(s) > STALE_MS;
            if (!expired) continue;
            await close(s, 'pay link expired unpaid', { checkout_token: null, checkout_token_expires_at: null });
            result.closed_unpaid++;
        }

        console.log(LOG, JSON.stringify(result));
        return Response.json({ success: true, ...result });
    } catch (e) {
        console.error(LOG, e?.message, e?.stack);
        return Response.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
    }
});
