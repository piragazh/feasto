import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * crmEnrolExisting — ONE-OFF, admin only.
 *
 * On 20 Oct 2026 the MealDrop owner decided that customers who ordered before the checkout consent
 * boxes existed should receive SMS and email offers. This enrols them, and records exactly that in
 * the consent ledger: method 'admin', with wording that says it was an owner decision and NOT
 * consent given by the customer. It never touches a customer who already has any consent record
 * (grant or refusal), is on the Suppression list, or only orders through a marketplace.
 * WhatsApp is not included (Meta requires the customer's own opt-in).
 *
 * Idempotent: a second run finds everyone already has a record and does nothing.
 */

const enc = new TextEncoder();
const SOURCE_REF = 'enrol_existing_2026-10-20';
const WORDING = 'Owner decision 20 Oct 2026: existing customer enrolled for offers without a prior opt-in. Not consent given by the customer.';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withRetry(fn) {
    for (let a = 0; ; a++) {
        try { return await fn(); } catch (e) {
            if (a < 6 && /rate limit|429/i.test(String(e?.message || e))) { await sleep(1000 * 2 ** a); continue; }
            throw e;
        }
    }
}
async function listAll(entity, query = {}) {
    const out = [];
    for (let skip = 0; ; skip += 500) {
        const page = await withRetry(() => entity.filter(query, 'created_date', 500, skip));
        out.push(...page);
        if (page.length < 500) break;
    }
    return out;
}
async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (user?.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const db = base44.asServiceRole.entities;

        const [profiles, ledger, suppressions] = await Promise.all([
            listAll(db.CustomerProfile), listAll(db.ConsentRecord), listAll(db.Suppression),
        ]);
        const hasRecord = new Set(ledger.map(r => r.profile_id));
        const suppressed = new Set(suppressions.map(s => `${s.key_hash}|${s.channel}`));

        const records = [];
        const updates = [];
        const skipped = { already_has_consent_record: 0, marketplace: 0, no_orders: 0, suppressed: 0 };
        const at = new Date().toISOString();

        for (const p of profiles) {
            if (p.merged_into || p.is_anonymised) continue;
            if (!(p.order_count > 0)) { skipped.no_orders++; continue; }
            if (p.marketing_eligible === false) { skipped.marketplace++; continue; }
            if (hasRecord.has(p.id)) { skipped.already_has_consent_record++; continue; }

            const consent = { ...(p.consent || {}) };
            const email = (p.emails || [])[0] || null;
            for (const [channel, address] of [['sms', p.phone_e164], ['email', email]]) {
                if (!address) continue;
                const h = await sha256Hex(address);
                if (suppressed.has(`${h}|${channel}`) || suppressed.has(`${h}|all`)) { skipped.suppressed++; continue; }
                records.push({
                    contact_id: p.contact_id || null, profile_id: p.id, restaurant_id: p.restaurant_id, scope: p.restaurant_id,
                    channel, action: 'grant', method: 'admin', wording_version: WORDING,
                    source_ref: SOURCE_REF, captured_by: `${user.email} (owner decision)`, at,
                });
                consent[channel] = true;
            }
            if (consent.sms !== !!p.consent?.sms || consent.email !== !!p.consent?.email) {
                updates.push([p.id, { consent, consent_updated_at: at }]);
            }
        }

        for (let i = 0; i < records.length; i += 50) {
            await withRetry(() => db.ConsentRecord.bulkCreate(records.slice(i, i + 50)));
            await sleep(300);
        }
        for (const [id, patch] of updates) {
            await withRetry(() => db.CustomerProfile.update(id, patch));
            await sleep(250);
        }

        const result = {
            profiles_enrolled: updates.length,
            records_written: records.length,
            sms: records.filter(r => r.channel === 'sms').length,
            email: records.filter(r => r.channel === 'email').length,
            skipped,
        };
        console.log('[crmEnrolExisting]', JSON.stringify(result));
        return Response.json({ success: true, ...result });
    } catch (error) {
        console.error('[crmEnrolExisting] Error:', error?.message);
        return Response.json({ error: error?.message }, { status: 500 });
    }
});
