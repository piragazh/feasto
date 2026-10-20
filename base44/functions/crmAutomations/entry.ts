import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * crmAutomations — hourly evaluator for always-on marketing automations.
 *
 * For every enabled Automation it finds customers who newly meet the trigger, enrols each at most
 * once per occurrence/cooldown (AutomationEnrolment), picks the first channel in the automation's
 * channel order that the customer agreed to and can be reached on, holds back a random control
 * group, and queues a MessageJob. The crmSendWorker then sends it with every check (consent,
 * opt-out list, weekly cap, quiet hours, budget) applied again at the moment of sending.
 *
 * SAFE NO MATTER WHO CALLS IT: reads only the database and only queues work that the enabled
 * automations already describe. Run by the "CRM Automations" workflow every hour.
 */

const DAY = 86400000, HOUR = 3600000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withRetry(fn) {
    for (let a = 0; ; a++) {
        try { return await fn(); } catch (e) {
            if (a < 5 && /rate limit|429/i.test(String(e?.message || e))) { await sleep(800 * 2 ** a); continue; }
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
const age = (d, now) => d ? now - new Date(d).getTime() : Infinity;

function londonDate(offsetDays = 0) {
    const d = new Date(Date.now() + offsetDays * DAY);
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (t) => parts.find(p => p.type === t)?.value;
    return { y: get('year'), md: `${get('month')}-${get('day')}` };
}

/** Returns the occurrence key if this profile triggers the automation now, else null. */
function trigger(a, p, now) {
    const s = a.settings || {};
    switch (a.type) {
        case 'welcome': {
            const t = age(p.first_order_at, now);
            return p.order_count === 1 && t >= 20 * HOUR && t <= 72 * HOUR ? 'once' : null;
        }
        case 'second_order': {
            const d = Number(s.delay_days) || 14;
            const t = age(p.first_order_at, now);
            return p.order_count === 1 && t >= d * DAY && t <= (d + 3) * DAY ? 'once' : null;
        }
        case 'win_back':
            return p.lifecycle_stage === 'at_risk' ? `last:${String(p.last_order_at).slice(0, 10)}` : null;
        case 'lapsed':
            return p.lifecycle_stage === 'lapsed' ? `last:${String(p.last_order_at).slice(0, 10)}` : null;
        case 'birthday': {
            const target = londonDate(Number(s.days_before ?? 3));
            return p.birthday && p.birthday === target.md ? `y${target.y}` : null;
        }
        case 'vip_milestone': {
            const milestones = (s.milestones || [10, 25, 50]).map(Number);
            return milestones.includes(p.order_count) && age(p.last_order_at, now) <= 3 * DAY ? `m${p.order_count}` : null;
        }
        case 'review_request': {
            const t = age(p.last_order_at, now);
            return t >= 2 * HOUR && t <= 26 * HOUR ? `order:${p.last_order_at}` : null;
        }
        default: return null;
    }
}

Deno.serve(async (req) => {
    const started = Date.now();
    try {
        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole.entities;
        const now = Date.now();

        const automations = await withRetry(() => db.Automation.filter({ is_enabled: true }));
        const summary = [];
        const waCache = new Map();
        let queuedAny = false;

        const byRestaurant = new Map();
        for (const a of automations) {
            if (!byRestaurant.has(a.restaurant_id)) byRestaurant.set(a.restaurant_id, []);
            byRestaurant.get(a.restaurant_id).push(a);
        }

        for (const [restaurantId, list] of byRestaurant) {
            if (Date.now() - started > 100000) break;
            const profiles = (await listAll(db.CustomerProfile, { restaurant_id: restaurantId }))
                .filter(p => !p.merged_into && !p.is_anonymised && p.order_count > 0 && p.marketing_eligible !== false);

            for (const a of list) {
                const enrolments = await listAll(db.AutomationEnrolment, { automation_id: a.id });
                const keys = new Set(enrolments.map(e => e.cycle_key));
                const lastAt = new Map();
                enrolments.forEach(e => {
                    const t = new Date(e.enrolled_at || e.created_date).getTime();
                    if (!lastAt.has(e.profile_id) || t > lastAt.get(e.profile_id)) lastAt.set(e.profile_id, t);
                });
                const cooldownMs = (Number(a.cooldown_days) || 0) * DAY;

                // WhatsApp is usable only with a connected number and an approved marketing template.
                let waOk = false;
                if ((a.channel_order || []).includes('whatsapp') && a.content?.whatsapp?.template_id) {
                    if (!waCache.has(restaurantId)) {
                        const ch = (await withRetry(() => db.WhatsAppChannel.filter({ restaurant_id: restaurantId, status: 'connected' })))[0] || null;
                        waCache.set(restaurantId, ch);
                    }
                    const ch = waCache.get(restaurantId);
                    if (ch) {
                        const tpl = (await withRetry(() => db.WaTemplate.filter({ id: a.content.whatsapp.template_id })))[0];
                        waOk = !!tpl && (tpl.submissions || []).some(s => s.waba_id === ch.waba_id && s.status === 'APPROVED');
                    }
                }

                let enrolled = 0, queued = 0, held = 0, skipped = 0;
                const jobs = [], rows = [];
                for (const p of profiles) {
                    const occ = trigger(a, p, now);
                    if (!occ) continue;
                    const cycle = `${p.id}|${occ}`;
                    if (keys.has(cycle)) continue;
                    if (cooldownMs && lastAt.has(p.id) && now - lastAt.get(p.id) < cooldownMs) continue;
                    if (['welcome', 'second_order'].includes(a.type) && lastAt.has(p.id)) continue; // once ever

                    const email = (p.emails || [])[0] || null;
                    const channel = (a.channel_order || ['sms', 'email']).find(ch =>
                        p.consent?.[ch] && (ch === 'email' ? !!email : !!p.phone_e164) && (ch !== 'whatsapp' || waOk)
                        && (ch === 'whatsapp' || a.content?.[ch]?.body));
                    const base = {
                        restaurant_id: restaurantId, automation_id: a.id, automation_type: a.type, profile_id: p.id,
                        cycle_key: cycle, enrolled_at: new Date(now).toISOString(),
                    };
                    enrolled++;
                    keys.add(cycle);
                    if (!channel) { rows.push({ ...base, status: 'skipped', skip_reason: 'no_consented_channel' }); skipped++; continue; }
                    if (Math.random() * 100 < (Number(a.holdout_pct) || 0)) { rows.push({ ...base, status: 'holdout', channel }); held++; continue; }
                    const key = `aut_${a.id}_${cycle}`.replace(/[^A-Za-z0-9_|:.-]/g, '');
                    jobs.push({
                        restaurant_id: restaurantId, automation_id: a.id, profile_id: p.id, channel,
                        to: channel === 'email' ? email : p.phone_e164, status: 'queued', idempotency_key: key,
                    });
                    rows.push({ ...base, status: 'queued', channel, _key: key });
                    queued++;
                }

                // Jobs first, then enrolments pointing at them
                const createdJobs = [];
                for (let i = 0; i < jobs.length; i += 50) createdJobs.push(...await withRetry(() => db.MessageJob.bulkCreate(jobs.slice(i, i + 50))));
                const jobByKey = new Map(createdJobs.map(j => [j.idempotency_key, j.id]));
                const toCreate = rows.map(({ _key, ...r }) => ({ ...r, message_job_id: _key ? jobByKey.get(_key) || null : null }));
                for (let i = 0; i < toCreate.length; i += 50) await withRetry(() => db.AutomationEnrolment.bulkCreate(toCreate.slice(i, i + 50)));

                await withRetry(() => db.Automation.update(a.id, { last_run_at: new Date().toISOString(), last_run_enrolled: enrolled }));
                if (queued) queuedAny = true;
                summary.push({ restaurant_id: restaurantId, type: a.type, enrolled, queued, holdout: held, skipped });
            }
        }

        if (queuedAny) {
            await base44.asServiceRole.functions.invoke('crmSendWorker', { mode: 'drain' }).catch(e => console.warn('[crmAutomations] worker kick failed:', e?.message));
        }
        console.log('[crmAutomations]', JSON.stringify(summary));
        return Response.json({ success: true, automations: summary });
    } catch (error) {
        console.error('[crmAutomations] Error:', error?.message);
        return Response.json({ success: false, error: error?.message }); // 200: never get the workflow switched off
    }
});
