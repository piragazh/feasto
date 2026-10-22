/**
 * aiOrderingCore — the channel-neutral "brain" behind every MealDrop AI ordering agent
 *
 * One endpoint, many ACTIONS. A voice agent (phone), the WhatsApp agent, or a web chat
 * calls these as tools. The AI only ever asks for actions; this server applies them
 * against the real menu, so an agent can never invent an item, an option or a price.
 *
 *   POST /functions/aiOrderingCore   { action, session_id?, ...args }
 *   Auth: header  x-ai-core-key: <AI_CORE_API_KEY>   (or Authorization: Bearer <key>)
 *         or a signed-in admin user (for testing from the app)
 *
 * ACTIONS
 *   start_session      { channel, called_number? | restaurant_id?, external_id?, customer_phone?, customer_name? }
 *   get_context        { session_id, skip_returning? }      restaurant, open/closed, basket, returning customer
 *   browse_menu        { session_id, mode?, category?, page?, per_page? }   categories | one category's items | menu text for an LLM prompt
 *   apply              { session_id, steps: [{ action, ...args }] }   several basket actions in one call (chat messages)
 *   search_menu        { session_id, query, limit? }
 *   get_item           { session_id, menu_item_id }         description, allergens, option groups
 *   add_item           { session_id, menu_item_id, quantity?, options? }   options: { "Group": "Label" | ["Label"] }
 *   choose_option      { session_id, option | option_index } answers the question add_item asked
 *   cancel_pending     { session_id }
 *   remove_item        { session_id, line? | menu_item_id?, quantity? }
 *   set_quantity       { session_id, line, quantity }
 *   clear_basket       { session_id }
 *   import_basket      { session_id, lines }                replace the basket with the website cart (web chat):
 *                      menu lines re-priced from the menu, deals kept exactly as the website built them
 *   get_basket         { session_id, full? }                lines + full price quote; full: also cart_lines in the
 *                      website cart shape (web chat writes them straight into the page's basket)
 *   set_order_type     { session_id, order_type }           delivery | collection
 *   check_delivery     { session_id, postcode, address? }   zone, fee, minimum
 *   set_customer       { session_id, name?, phone?, address?, postcode? }
 *   send_payment_link  { session_id, send_sms?, details_at_checkout? }  card: one-time checkout link (+ SMS);
 *                      details_at_checkout lets the website checkout take the address and run the zone check (chat)
 *   place_cash_order   { session_id, notes?, dry_run? }     cash: creates the order now
 *   handoff            { session_id, reason? }
 *   end_session        { session_id, outcome? }
 *
 * Every response: { ok: true, ...data, say? } or { ok: false, error, code, say? }.
 * `say` is a short plain-English line an agent can read out or send as-is.
 *
 * PARITY: pricing is the SAME function verifyAndCreateOrder validates with
 * (calcItemServerPrice, copied below), and the quote mirrors src/pages/Checkout.jsx
 * (zones, tiered delivery, small order surcharge) - so a basket total here is the
 * total the website checkout and the validator arrive at.
 *
 * Option groups are addressed by POSITION as well as name: many menus leave group names
 * blank (a meal upgrade and the drink inside it can both be ""). See isTop / findGroup.
 *
 * ENV
 *   AI_CORE_API_KEY   shared secret for voice/chat platforms (required for non-admin callers)
 *   BASE44_APP_URL    public origin for pay links (default https://app.mealdrop.co.uk)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LOG = '[aiOrderingCore]';
const APP_URL = (Deno.env.get('BASE44_APP_URL') || 'https://app.mealdrop.co.uk').replace(/\/$/, '');
const CHECKOUT_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_QTY = 50;
const EVENT_LOG_MAX = 50;

// ── Small helpers ───────────────────────────────────────────────────────────
const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nowIso = () => new Date().toISOString();
const clip = (s, n) => {
    const t = String(s ?? '').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ok = (data = {}) => Response.json({ ok: true, ...data });
const fail = (code, error, extra = {}, status = 200) => Response.json({ ok: false, code, error, say: extra.say || error, ...extra }, { status });

function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function randomToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Any UK/intl phone -> E.164 digits, no + ("07700 900123" -> "447700900123"). */
function phoneDigits(raw) {
    let d = String(raw || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = '44' + d.slice(1);
    return /^\d{8,15}$/.test(d) ? d : '';
}
/** E.164 digits -> UK local "07..." where possible (how the website stores phones). */
const localPhone = (digits) => (digits.startsWith('44') ? `0${digits.slice(2)}` : `+${digits}`);

const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;
function normPostcode(raw) {
    const m = UK_POSTCODE.exec(String(raw || '').trim().toUpperCase().replace(/\s+/g, ' '));
    return m ? `${m[1]} ${m[2]}` : null;
}

// ── Opening hours (same rules as whatsappWebhook) ────────────────────────────
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function hoursClosedReason(r, type) {
    const hours = (type === 'delivery' && r.delivery_hours) || (type === 'collection' && r.collection_hours) || r.opening_hours;
    if (!hours || typeof hours !== 'object' || !Object.keys(hours).length) return null;
    const { day, minutes } = ukClock(new Date());
    const slot = (d) => {
        const h = hours[DAY_KEYS[d]];
        if (!h || h.closed) return null;
        const open = hhmmToMinutes(h.open), close = hhmmToMinutes(h.close);
        return open === null || close === null ? null : { open, close, openText: h.open };
    };
    const today = slot(day);
    const yesterday = slot((day + 6) % 7);
    if (today) {
        if (today.open === today.close) return null;
        if (today.close > today.open ? minutes >= today.open && minutes < today.close : minutes >= today.open) return null;
    }
    if (yesterday && yesterday.close < yesterday.open && minutes < yesterday.close) return null;
    const what = type === 'delivery' ? 'Delivery' : type === 'collection' ? 'Collection' : null;
    if (today && minutes < today.open) {
        return what ? `${what} starts at ${today.openText} today.` : `We're closed right now. We open at ${today.openText} today.`;
    }
    return what ? `${what} isn't available right now.` : "We're closed at the moment.";
}

function restaurantClosedReason(r) {
    if (r.temporary_closure?.enabled) return r.temporary_closure.custom_message || 'We are not taking orders right now.';
    if (r.is_open === false) return 'We are closed at the moment.';
    return hoursClosedReason(r, null);
}

// ── Menu ────────────────────────────────────────────────────────────────────
function isOrderable(item, date = new Date()) {
    if (whyNotSellable(item, 'online', date) !== null) return false;
    if (item.track_stock && typeof item.stock_quantity === 'number' && item.stock_quantity <= 0) return false;
    return true;
}

async function loadMenu(db, restaurantId) {
    const all = [];
    const PAGE = 200;
    for (let skip = 0; skip < 5000; skip += PAGE) {
        const batch = await db.MenuItem.filter({ restaurant_id: restaurantId }, 'created_date', PAGE, skip);
        if (!Array.isArray(batch) || !batch.length) break;
        all.push(...batch);
        if (batch.length < PAGE) break;
    }
    const available = all.filter((i) => isOrderable(i));
    return { all, available, byId: new Map(available.map((i) => [i.id, i])) };
}

const SYNONYMS = { fries: 'chips', chip: 'chips', coke: 'cola', pop: 'drink', soda: 'drink', burgers: 'burger', wings: 'wing' };
const tokensOf = (s) => norm(s).split(' ').filter(Boolean).map((t) => SYNONYMS[t] || (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));

/** Edit distance, capped - speech-to-text misspells ("margarita" for "margherita"). */
function closeEnough(a, b) {
    if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 2) return false;
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = tmp;
        }
    }
    return prev[b.length] <= 2;
}

/**
 * How much each query word should count: words in many item names ("chicken", "meal") say
 * little; rare ones ("wrap", "strips") say which item is meant. 1 for a word in every name,
 * up to ~4 for a word in one name.
 */
function wordWeights(items, qTokens) {
    const n = items.length || 1;
    const names = items.map((i) => tokensOf(i.name));
    const w = {};
    for (const t of new Set(qTokens)) {
        const df = names.filter((toks) => toks.includes(t)).length;
        w[t] = 1 + Math.log((n + 1) / (df + 1));
    }
    return w;
}

function scoreItem(item, qTokens, qPhrase, weights = {}) {
    const name = norm(item.name);
    const nameTokens = tokensOf(item.name);
    const cat = norm(item.category);
    const desc = norm(item.description);
    let s = 0;
    if (qPhrase && name === qPhrase) s += 20;
    else if (qPhrase && name.includes(qPhrase)) s += 8;
    for (const t of qTokens) {
        const w = weights[t] ?? 1;
        if (nameTokens.includes(t)) s += 4 * w;
        else if (nameTokens.some((n) => n.startsWith(t) || t.startsWith(n))) s += 2 * w;
        else if (nameTokens.some((n) => closeEnough(n, t))) s += 3 * w;
        if (cat.includes(t)) s += 1;
        if (desc.includes(t)) s += 0.5;
    }
    if (item.is_popular) s += 0.25;
    return s;
}

function itemSummary(item) {
    return {
        menu_item_id: item.id,
        name: String(item.name || '').trim(),
        category: item.category || 'Other',
        price: round2(item.price),
        description: item.description ? clip(item.description, 160) : undefined,
        has_required_options: requiredGroups(item).length > 0,
        popular: !!item.is_popular,
        vegetarian: !!item.is_vegetarian,
        spicy: !!item.is_spicy,
    };
}

function groupForAgent(g) {
    return {
        group: g.name,
        required: !!g.required,
        type: g.type || 'single',
        options: (g.options || []).map((o) => ({ label: o.label, extra_price: round2(o.price || 0) })),
        ...(Array.isArray(g.meal_customizations) && g.meal_customizations.length
            ? { meal_groups: g.meal_customizations.map((m) => ({ group: m.name, required: !!m.required, options: (m.options || []).map((o) => ({ label: o.label, extra_price: round2(o.price || 0) })) })) }
            : {}),
    };
}

// ── Options (same state machine as whatsappWebhook) ─────────────────────────
function requiredGroups(item) {
    return (item.customization_options || []).filter((g) => g.required && (g.options || []).length);
}

/**
 * A step is { group_name, parent, index?, parent_index? }. parent === null means a top-level
 * group; a STRING parent (even "") means a group inside that meal upgrade. Many menus leave
 * group names blank - the meal upgrade AND the drink inside it can both be "" - so a blank
 * parent must never be read as "no parent", and positions (index) win over names.
 */
const isTop = (step) => step.parent === null || step.parent === undefined;

function findGroup(item, step) {
    const top = item.customization_options || [];
    if (isTop(step)) return (Number.isInteger(step.index) && top[step.index]) || top.find((g) => g.name === step.group_name);
    const parent = (Number.isInteger(step.parent_index) && top[step.parent_index]) || top.find((g) => g.name === step.parent);
    const inner = parent?.meal_customizations || [];
    return (Number.isInteger(step.index) && inner[step.index]) || inner.find((g) => g.name === step.group_name);
}

/** "Normal or Spicy:" -> "Normal or Spicy"; a blank name -> a sensible word for the question. */
function groupLabel(group, nested) {
    const n = String(group?.name || '')
        .replace(/\(\s*max\.?\s*\d+\s*\)/ig, '').replace(/[:\s]+$/, '')
        .replace(/^(please\s+)?(choose|select|pick)\s+(a|an|your|one|\d+)?\s*/i, '').trim();
    if (n) return /^[A-Z][a-z]/.test(n) && !/ or /i.test(n) ? n.toLowerCase() : n;
    if (group?.type === 'meal_upgrade') return 'on its own or as a meal';
    const labels = (group?.options || []).map((o) => norm(o.label)).join(' ');
    if (/(pepsi|coke|cola|tango|fanta|7up|sprite|water|drink|can|bottle|juice|shake)/.test(labels)) return 'drink';
    if (/(chips|fries|coleslaw|beans|rice|salad|side)/.test(labels)) return 'side';
    return nested ? 'meal choice' : 'option';
}

/** Match a spoken/typed label to one option: exact first, then a single unambiguous partial match. */
function matchOption(group, raw) {
    const want = norm(String(raw ?? '').replace(/\(\s*\+?\s*£?\s*[\d.]+\s*\)/g, ''));
    if (!want) return null;
    const opts = group?.options || [];
    const exact = opts.find((o) => norm(o.label) === want);
    if (exact) return exact;
    const partial = opts.filter((o) => norm(o.label).includes(want) || want.includes(norm(o.label)));
    return partial.length === 1 ? partial[0] : null;
}

function recordChoice(pending, item, step, option) {
    const group = findGroup(item, step);
    const value = group?.type === 'multiple' ? [option.label] : option.label;
    if (!isTop(step)) {
        const key = `${step.parent}_meal_customizations`;
        const prev = pending.customizations[key]?.[step.group_name];
        const merged = group?.type === 'multiple' && Array.isArray(prev) ? [...prev, option.label] : value;
        pending.customizations[key] = { ...(pending.customizations[key] || {}), [step.group_name]: merged };
    } else {
        const prev = pending.customizations[step.group_name];
        pending.customizations[step.group_name] = group?.type === 'multiple' && Array.isArray(prev) ? [...prev, option.label] : value;
    }
    pending.summary.push(String(option.label).trim());
    // A meal upgrade brings its own required meal choices (side, drink...)
    if (isTop(step) && group?.type === 'meal_upgrade' && (option.price || 0) > 0) {
        const pIdx = (item.customization_options || []).indexOf(group);
        const nested = (group.meal_customizations || [])
            .map((g, index) => ({ g, index })).filter(({ g }) => g.required && (g.options || []).length);
        pending.queue.unshift(...nested.map(({ g, index }) => ({ group_name: g.name, parent: group.name, index, parent_index: pIdx })));
    }
}

/** Apply any options the customer already gave that answer the step at the head of the queue. */
function drainGiven(pending, item, given, ignored) {
    let guard = 0;
    while (pending.queue.length && guard++ < 20) {
        const step = pending.queue[0];
        const group = findGroup(item, step);
        // By group name first; else any choice the caller gave whose VALUE fits this group
        // ("drink: Pepsi" for a drink group the menu left unnamed)
        let key = step.group_name ? Object.keys(given).find((k) => norm(k) === norm(step.group_name)) : undefined;
        if (!key) key = Object.keys(given).find((k) => matchOption(group, Array.isArray(given[k]) ? given[k][0] : given[k]));
        if (!key) return;
        const raw = Array.isArray(given[key]) ? given[key][0] : given[key];
        const option = matchOption(group, raw);
        delete given[key];
        if (!option) { ignored.push(`${step.group_name || groupLabel(group, true)}: ${raw}`); return; }
        pending.queue.shift();
        recordChoice(pending, item, step, option);
    }
}

function startPending(item, quantity, chosen = {}) {
    const pending = {
        menu_item_id: item.id,
        quantity: Math.max(1, Math.min(MAX_QTY, Math.round(Number(quantity) || 1))),
        queue: [], customizations: {}, summary: [],
    };
    const given = { ...(chosen && typeof chosen === 'object' ? chosen : {}) };
    const ignored = [];
    const top = item.customization_options || [];
    const answered = new Set();
    const take = (g, index, key) => {
        const labels = Array.isArray(given[key]) ? given[key] : [given[key]];
        delete given[key];
        for (const raw of labels.slice(0, g.type === 'multiple' ? 10 : 1)) {
            const option = matchOption(g, raw);
            if (!option) { ignored.push(`${g.name || groupLabel(g)}: ${raw}`); continue; }
            recordChoice(pending, item, { group_name: g.name, parent: null, index }, option);
            answered.add(index);
        }
    };
    // Top-level groups first, by name, in any order the customer said them
    top.forEach((g, index) => {
        if (!g.name) return;
        const key = Object.keys(given).find((k) => norm(k) === norm(g.name) || norm(k) === norm(groupLabel(g)));
        if (key) take(g, index, key);
    });
    // Then choices whose group the caller named differently ("Upgrade: Meal", "Flavour: hot" for
    // "Normal or Spicy:"), matched by the option itself when exactly one unanswered group has it
    for (const key of Object.keys(given)) {
        const raw = Array.isArray(given[key]) ? given[key][0] : given[key];
        const hits = top.map((g, index) => ({ g, index })).filter(({ g, index }) => !answered.has(index) && matchOption(g, raw));
        if (hits.length === 1) take(hits[0].g, hits[0].index, key);
    }
    top.forEach((g, index) => {
        // A paid meal upgrade is always asked, required or not: "on its own or as a meal?" is
        // what any takeaway asks, and an optional one would otherwise never come up on the phone.
        const offerMeal = g.type === 'meal_upgrade' && (g.options || []).some((o) => (o.price || 0) > 0);
        if ((g.required || offerMeal) && (g.options || []).length && !answered.has(index) && !(g.name in pending.customizations)) {
            pending.queue.push({ group_name: g.name, parent: null, index });
        }
    });
    // Nested meal groups the upgrade queued, if the customer already named them
    drainGiven(pending, item, given, ignored);
    for (const k of Object.keys(given)) ignored.push(`${k}: ${given[k]}`);
    return { pending, ignored };
}

function nextQuestion(item, pending) {
    const step = pending.queue[0];
    const group = findGroup(item, step);
    if (!group) return null;
    const label = groupLabel(group, !isTop(step));
    const name = String(item.name || '').trim();
    const opts = (group.options || []).map((o) => ({ label: String(o.label).trim(), extra_price: round2(o.price || 0) }));
    const list = opts.slice(0, 6).map((o) => o.label + (o.extra_price ? ` (plus ${money(o.extra_price)})` : '')).join(', ');
    return {
        menu_item_id: item.id,
        item_name: name,
        group: label,
        options: opts,
        say: group.type === 'meal_upgrade' && !String(group.name || '').trim()
            ? `Would you like the ${name} on its own, or as a meal? ${list}.`
            : opts.length <= 3 && group.type !== 'multiple'
                ? `Would you like the ${name} ${opts.map((o) => o.label + (o.extra_price ? ` (plus ${money(o.extra_price)})` : '')).join(', ').replace(/, ([^,]*)$/, ' or $1')}?`
                : `Which ${label} would you like for the ${name}? ${list}.`,
    };
}

function addLine(session, line) {
    const cart = [...(session.cart || [])];
    const key = JSON.stringify({ c: line.customizations || {}, q: line.itemQuantities || {} });
    const existing = cart.find((l) => l.menu_item_id === line.menu_item_id
        && JSON.stringify({ c: l.customizations || {}, q: l.itemQuantities || {} }) === key);
    if (existing) existing.quantity = Math.min(MAX_QTY, existing.quantity + line.quantity);
    else cart.push(line);
    session.cart = cart;
}

function finishPending(session, item) {
    const p = session.pending_item;
    const { serverPrice } = calcItemServerPrice(item, { customizations: p.customizations || {}, itemQuantities: p.itemQuantities || {} });
    addLine(session, {
        menu_item_id: item.id,
        name: String(item.name || '').trim(),
        price: round2(serverPrice),
        quantity: p.quantity,
        image_url: item.image_url || undefined,
        customizations: p.customizations || {},
        itemQuantities: p.itemQuantities || {},
        options_summary: (p.summary || []).join(', '),
    });
    session.pending_item = null;
    return { quantity: p.quantity, name: String(item.name || '').trim(), unit_price: round2(serverPrice), options: (p.summary || []).join(', ') };
}

// ── Pricing: COPY of calcItemServerPrice in verifyAndCreateOrder (online prices) ──
// Keep identical to the validator so an AI basket can never be refused at checkout.
function calcItemServerPrice(dbItem, orderItem, isPOS = false) {
    const basePrice = (isPOS && dbItem.pos_price != null) ? dbItem.pos_price : dbItem.price;
    let serverPrice = basePrice;
    const breakdown = [`base=£${basePrice.toFixed(2)}`];
    const customizations = orderItem.customizations;
    const itemQuantities = orderItem.itemQuantities || {};
    if (!customizations || typeof customizations !== 'object') return { serverPrice, breakdown };
    const dbOptions = dbItem.customization_options || [];
    const customizationList = Array.isArray(customizations)
        ? customizations
        : Object.entries(customizations).map(([name, value]) => ({ name, value }));
    for (const clientCustom of customizationList) {
        const customName = clientCustom.name ?? clientCustom.key;
        if (customName === undefined || customName === null) continue;
        if (customName.endsWith('_meal_customizations')) continue;
        const dbGroup = dbOptions.find(g => g.name === customName);
        if (!dbGroup) continue;
        if (dbGroup.type === 'meal_upgrade') {
            const selectedUpgrade = clientCustom.selected_option || clientCustom.value;
            if (!selectedUpgrade) continue;
            const upgradeLabel = typeof selectedUpgrade === 'string' ? selectedUpgrade : selectedUpgrade.label;
            const dbUpgradeOption = (dbGroup.options || []).find(o => o.label === upgradeLabel);
            if (dbUpgradeOption && typeof dbUpgradeOption.price === 'number') {
                serverPrice += dbUpgradeOption.price;
                breakdown.push(`upgrade:${upgradeLabel}=£${dbUpgradeOption.price.toFixed(2)}`);
            }
            const mealCustomsObj = (Array.isArray(customizations)
                ? null
                : customizations[`${customName}_meal_customizations`]) || {};
            const mealGroups = (Array.isArray(dbGroup.meal_customizations) && dbGroup.meal_customizations.length)
                ? dbGroup.meal_customizations
                : (Array.isArray(dbUpgradeOption?.meal_customizations) ? dbUpgradeOption.meal_customizations : []);
            if (mealGroups.length) {
                for (const mealGroup of mealGroups) {
                    const mealSelections = mealCustomsObj[mealGroup.name];
                    if (!mealSelections) continue;
                    const selections = Array.isArray(mealSelections) ? mealSelections : [mealSelections];
                    for (const selLabel of selections) {
                        const dbOpt = (mealGroup.options || []).find(o => o.label === selLabel);
                        if (!dbOpt) continue;
                        const optPrice = isPOS && dbOpt.pos_price != null ? dbOpt.pos_price : (dbOpt.price || 0);
                        const qtyKey = `${customName}_meal_${mealGroup.name}_${selLabel}`;
                        const qty = itemQuantities[qtyKey] || 1;
                        serverPrice += optPrice * qty;
                        breakdown.push(`${mealGroup.name}:${selLabel}×${qty}=£${(optPrice * qty).toFixed(2)}`);
                    }
                }
            }
            continue;
        }
        const rawValue = clientCustom.selected_options ?? clientCustom.selected_option ?? clientCustom.value;
        const selectedOptions = Array.isArray(rawValue) ? rawValue : (rawValue != null && rawValue !== '' ? [rawValue] : []);
        for (const sel of selectedOptions) {
            const selLabel = typeof sel === 'string' ? sel : sel?.label;
            if (!selLabel) continue;
            const dbOpt = (dbGroup.options || []).find(o => o.label === selLabel);
            if (!dbOpt) continue;
            const optPrice = isPOS && dbOpt.pos_price != null ? dbOpt.pos_price : (typeof dbOpt.price === 'number' ? dbOpt.price : 0);
            const qtyKey = `${customName}_${selLabel}`;
            const qty = (dbGroup.type === 'multiple' && itemQuantities[qtyKey]) ? itemQuantities[qtyKey] : 1;
            serverPrice += optPrice * qty;
            breakdown.push(`${customName}:${selLabel}×${qty}=£${(optPrice * qty).toFixed(2)}`);
        }
    }
    return { serverPrice, breakdown };
}

/** Re-price every basket line from the CURRENT menu; drops lines no longer sellable. */
function repriceCart(session, menu) {
    const dropped = [];
    const cart = [];
    for (const l of session.cart || []) {
        // Website deals (web chat basket) aren't menu items: checkout prices and validates them
        if (l.external) { cart.push(l); continue; }
        const item = menu.byId.get(l.menu_item_id);
        if (!item) { dropped.push(l.name); continue; }
        const { serverPrice } = calcItemServerPrice(item, l);
        cart.push({ ...l, name: String(item.name || '').trim(), price: round2(serverPrice) });
    }
    session.cart = cart;
    return dropped;
}

// ── Delivery zones: MIRROR of src/components/checkout/DeliveryZoneCalculator.jsx ──
function haversineDistance(p1, p2) {
    const R = 3958.8;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;
    const lat1 = p1.lat * Math.PI / 180, lat2 = p2.lat * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function extractPostcodeDistrict(address) {
    if (!address) return null;
    const fullMatch = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*\d[A-Z]{2}\b/i);
    if (fullMatch) return fullMatch[1].toUpperCase();
    const districtMatch = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/i);
    return districtMatch ? districtMatch[1].toUpperCase() : null;
}
function isPostcodeInZone(customerAddress, zonePostcodes) {
    if (!customerAddress || !zonePostcodes || zonePostcodes.length === 0) return false;
    const district = extractPostcodeDistrict(customerAddress);
    if (!district) return false;
    return zonePostcodes.some(pc => pc.trim().toUpperCase().replace(/\s+/g, '') === district);
}
function isPointInPolygon(point, polygon) {
    if (!point || !polygon || polygon.length < 3) return false;
    const px = point.lng, py = point.lat;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng, yi = polygon[i].lat;
        const xj = polygon[j].lng, yj = polygon[j].lat;
        const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
function matchZone(zones, customerLocation, customerAddress) {
    const sorted = [...zones].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    for (const zone of sorted) {
        const type = zone.zone_type || (zone.postcodes?.length > 0 ? 'postcode' : zone.radius_miles ? 'radius' : 'polygon');
        if (type === 'postcode') {
            if (isPostcodeInZone(customerAddress, zone.postcodes)) return zone;
        } else if (type === 'radius') {
            const center = zone.radius_center;
            if (center?.lat && center?.lng && customerLocation?.lat && customerLocation?.lng) {
                if (haversineDistance(center, customerLocation) <= zone.radius_miles) return zone;
            }
        } else if (zone.coordinates?.length >= 3 && customerLocation) {
            if (isPointInPolygon(customerLocation, zone.coordinates)) return zone;
        }
    }
    return null;
}

async function geocodePostcode(postcode) {
    try {
        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ''))}`);
        if (!res.ok) return { valid: res.status === 404 ? false : null };
        const j = await res.json();
        const r = j?.result;
        return r ? { valid: true, lat: r.latitude, lng: r.longitude, postcode: r.postcode } : { valid: false };
    } catch (e) {
        console.warn(`${LOG} postcode lookup failed: ${e?.message}`);
        return { valid: null }; // unknown - postcode-district zones still work
    }
}

// ── Quote: MIRROR of the price block in src/pages/Checkout.jsx ───────────────
function quote(session, restaurant) {
    const cart = session.cart || [];
    const subtotal = cart.reduce((s, l) => s + (l.price * l.quantity), 0);
    const type = session.order_type || null;
    const dq = session.delivery_quote || null; // null = not checked yet
    const tiered = restaurant?.tiered_delivery;
    const standardFee = restaurant?.delivery_fee ?? 0;
    const standardMin = restaurant?.minimum_order ?? 0;
    const zonesConfigured = dq ? dq.zones_configured === true : null;
    const zoneAvailable = dq?.available === true && zonesConfigured;
    const zoneMinimum = zoneAvailable ? (dq.minimum_order || 0) : 0;
    const zoneFee = zoneAvailable && dq.fee != null ? dq.fee : null;

    let deliveryFee = type === 'collection' ? 0 : (zoneFee ?? standardFee);
    let minimumOrder = 0;
    if (type === 'delivery') {
        if (zoneAvailable) {
            if (tiered?.enabled && (tiered.lower_minimum ?? 0) > 0) {
                const lowerMin = tiered.lower_minimum;
                const lowerFee = tiered.lower_minimum_fee ?? 0;
                if (subtotal < lowerMin) minimumOrder = lowerMin;
                else if (subtotal < zoneMinimum) { deliveryFee = lowerFee; minimumOrder = zoneMinimum; }
                else minimumOrder = zoneMinimum;
            } else minimumOrder = zoneMinimum;
        } else minimumOrder = standardMin;
    }
    // Checkout.jsx adds this whenever it is set (MED-8). Mirrored as-is for parity.
    const smallOrderSurcharge = restaurant?.small_order_surcharge ?? 0;
    const subtotalPence = Math.round(subtotal * 100);
    const total = Math.max(0, subtotalPence + Math.round(deliveryFee * 100) + Math.round(smallOrderSurcharge * 100)) / 100;
    return {
        order_type: type,
        subtotal: round2(subtotal),
        delivery_fee: round2(deliveryFee),
        small_order_surcharge: round2(smallOrderSurcharge),
        discount: 0,
        total: round2(total),
        minimum_order: round2(minimumOrder),
        below_minimum: type === 'delivery' && subtotal < minimumOrder,
        short_by: type === 'delivery' && subtotal < minimumOrder ? round2(minimumOrder - subtotal) : 0,
        delivery_checked: type !== 'delivery' || !!dq,
        delivery_available: type !== 'delivery' ? null : (dq ? dq.available !== false : null),
    };
}

const feeSay = (n) => (Number(n) > 0 ? money(n) : 'free');

/** "25 - 30" / "30-45 mins" -> "about 25 to 30 minutes" for reading out. */
function etaSay(raw) {
    const m = /(\d+)\s*(?:-|to|–)\s*(\d+)/.exec(String(raw || ''));
    return m ? `about ${m[1]} to ${m[2]} minutes` : String(raw || 'about 30 to 45 minutes');
}

/** Delivery fee and minimum in words, including the tiered small-order rule Checkout applies. */
function deliveryTermsSay(dq, restaurant) {
    const t = restaurant?.tiered_delivery;
    if (dq.zones_configured && t?.enabled && (t.lower_minimum ?? 0) > 0 && (dq.minimum_order || 0) > t.lower_minimum) {
        return `Delivery is ${feeSay(dq.fee)} on orders over ${money(dq.minimum_order)}, or ${feeSay(t.lower_minimum_fee ?? 0)} from ${money(t.lower_minimum)}.`;
    }
    return `Delivery is ${feeSay(dq.fee)}${dq.minimum_order ? `, with a minimum order of ${money(dq.minimum_order)}` : ''}.`;
}

/** "Meal, Fanta" from a website line's customizations, for lines the core didn't build. */
function summarizeCustomizations(c) {
    const out = [];
    const walk = (v) => {
        if (v == null || v === '') return;
        if (Array.isArray(v)) v.forEach(walk);
        else if (typeof v === 'object') Object.values(v).forEach(walk);
        else out.push(String(v));
    };
    walk(c);
    return clip(out.join(', '), 120);
}

const DEAL_FLAGS = ['is_deal', 'is_meal_deal', 'is_category_deal'];

/** Basket lines exactly as the website cart (localStorage 'cart') stores them. */
function webLines(session) {
    return (session.cart || []).map((l) => {
        if (l.external) { const { external: _e, ...rest } = l; return rest; }
        return {
            menu_item_id: l.menu_item_id, name: l.name, price: l.price, quantity: l.quantity,
            image_url: l.image_url, customizations: l.customizations || {}, itemQuantities: l.itemQuantities || {},
            options_summary: l.options_summary || '',
        };
    });
}

function basketView(session) {
    return (session.cart || []).map((l, i) => ({
        line: i + 1, menu_item_id: l.menu_item_id, name: l.name, quantity: l.quantity,
        unit_price: l.price, line_total: round2(l.price * l.quantity), options: l.options_summary || '',
        ...(l.external ? { deal: true } : {}),
    }));
}

function basketSay(session, q) {
    const cart = session.cart || [];
    if (!cart.length) return 'Your basket is empty.';
    const lines = cart.map((l) => `${l.quantity} ${l.name}${l.options_summary ? ` (${l.options_summary})` : ''}`).join(', ');
    const fee = q.order_type === 'delivery' && q.delivery_fee ? `, plus ${money(q.delivery_fee)} delivery` : '';
    if (!fee && !q.small_order_surcharge) return `You've got ${lines}. That's ${money(q.total)} in total.`;
    return `You've got ${lines}. That's ${money(q.subtotal)}${fee}${q.small_order_surcharge ? ` and a ${money(q.small_order_surcharge)} service charge` : ''}, ${money(q.total)} in total.`;
}

/**
 * Everything that must be true before an order can be paid for or placed.
 * detailsAtCheckout: the pay link opens the website checkout, which asks for the
 * address and runs the zone check itself (chat channels), so only the lowest
 * possible delivery minimum is enforced here when no postcode was checked.
 */
function readiness(session, restaurant, menu, opts = {}) {
    const closed = restaurantClosedReason(restaurant);
    if (closed) return { code: 'CLOSED', error: closed };
    if (session.pending_item?.queue?.length) {
        const item = menu.byId.get(session.pending_item.menu_item_id);
        if (item) return { code: 'OPTIONS_PENDING', error: `We still need to finish the ${item.name} first.`, question: nextQuestion(item, session.pending_item) };
        session.pending_item = null;
    }
    const dropped = repriceCart(session, menu);
    if (dropped.length) return { code: 'ITEM_UNAVAILABLE', error: `Sorry, ${dropped.join(', ')} ${dropped.length > 1 ? 'are' : 'is'} no longer available, so I've taken ${dropped.length > 1 ? 'them' : 'it'} off.` };
    if (!(session.cart || []).length) return { code: 'EMPTY_BASKET', error: 'The basket is empty.' };
    if (!session.order_type) return { code: 'ORDER_TYPE_NEEDED', error: 'Is this for delivery or collection?' };
    if (session.order_type === 'collection' && !restaurant.collection_enabled) return { code: 'NO_COLLECTION', error: 'Sorry, we only do delivery.' };
    const svc = hoursClosedReason(restaurant, session.order_type);
    if (svc) return { code: 'SERVICE_CLOSED', error: svc };
    const q = quote(session, restaurant);
    if (session.order_type === 'delivery') {
        if (!session.delivery_quote) {
            if (!opts.detailsAtCheckout) return { code: 'POSTCODE_NEEDED', error: "What's the postcode for delivery?" };
            const t = restaurant.tiered_delivery;
            const std = Number(restaurant.minimum_order) || 0;
            const low = t?.enabled && (t.lower_minimum ?? 0) > 0 ? Math.min(t.lower_minimum, std || t.lower_minimum) : std;
            if (q.subtotal < low) return { code: 'BELOW_MINIMUM', minimum_order: round2(low), short_by: round2(low - q.subtotal), error: `The minimum for delivery is ${money(low)}. You need ${money(low - q.subtotal)} more, or you could collect instead.` };
            return { q };
        }
        if (session.delivery_quote.available === false) return { code: 'OUT_OF_AREA', error: 'Sorry, we don\'t deliver to that postcode.' };
        if (q.below_minimum) return { code: 'BELOW_MINIMUM', error: `The minimum for delivery is ${money(q.minimum_order)}. You need ${money(q.short_by)} more, or you could collect instead.` };
    }
    return { q };
}

// ── Session persistence ─────────────────────────────────────────────────────
const OWNED = ['cart', 'pending_item', 'order_type', 'delivery_address', 'delivery_postcode', 'delivery_quote',
    'customer_name', 'customer_phone', 'state', 'checkout_token', 'checkout_token_expires_at', 'order_id',
    'handoff_reason', 'ended_at'];

/**
 * Writes only the fields this call changed. `rev` counts basket/state changes: if
 * another call changed the session after this one read it (two chat messages, or
 * parallel tool calls from a voice platform), this returns true WITHOUT writing so
 * the caller re-runs the action on the fresh session instead of overwriting it.
 * Base44 has no atomic compare-and-set, so this narrows the window rather than
 * closing it; the WhatsApp webhook also processes one message per chat at a time.
 */
async function saveSession(db, before, after, action, okFlag, note, allowRetry = false) {
    const patch = {};
    for (const f of OWNED) {
        const a = after[f] ?? null;
        if (JSON.stringify(a) !== JSON.stringify(before[f] ?? null)) patch[f] = a;
    }
    if (Object.keys(patch).length) {
        const cur = (await db.AiOrderSession.filter({ id: before.id }))[0];
        const curRev = Number(cur?.rev) || 0;
        if (curRev !== (Number(before.rev) || 0) && allowRetry) return true;
        patch.rev = curRev + 1;
    }
    patch.last_activity_at = nowIso();
    patch.event_log = [...(before.event_log || []), { at: nowIso(), action, ok: okFlag, note: clip(note || '', 200) }].slice(-EVENT_LOG_MAX);
    await db.AiOrderSession.update(before.id, patch);
    return false;
}

// ── Auth ────────────────────────────────────────────────────────────────────
async function authorised(req, base44, body) {
    const expected = Deno.env.get('AI_CORE_API_KEY');
    // Each place a key can arrive is checked on its own. Calls from other Base44
    // functions (the WhatsApp agent) carry the platform's own Authorization header,
    // so that header must never shadow the key sent in the body.
    const candidates = [
        req.headers.get('x-ai-core-key'),
        (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''),
        typeof body?.key === 'string' ? body.key : '',
    ];
    if (expected && candidates.some((k) => k && timingSafeEqual(k, expected))) return true;
    try {
        const user = await base44.auth.me();
        return user?.role === 'admin';
    } catch { return false; }
}

// ── Item availability (shared block) ────────────────────────────────────────
// Copied verbatim from src/lib/item-availability.js - check-item-availability.mjs compares.
// ── ITEM AVAILABILITY (shared - keep identical in every copy) ────────────────
const AVAILABILITY_TZ = 'Europe/London';
const SELLS_AT = {
    till: ['both', 'pos_only'],
    online: ['both', 'online_only'],
    kiosk: ['both'],
    qr: ['both'],
};
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** An unknown or missing setting means "both" - never hide a menu by accident. */
function channelOf(item) {
    const c = item?.availability_channel;
    return c === 'online_only' || c === 'pos_only' ? c : 'both';
}

function sellsAt(item, where) {
    return (SELLS_AT[where] || []).includes(channelOf(item));
}

/** Weekday and minute-of-day in the UK, whatever the device's own zone. */
function ukClock(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: AVAILABILITY_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (t) => parts.find(p => p.type === t)?.value;
    return { day: WEEKDAYS[get('weekday')], minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

function hhmmToMinutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    return h > 23 || min > 59 ? null : h * 60 + min;
}

/** Same rule as the till: days, late menus past midnight, start === end is all day. */
function inWindow(w, date) {
    if (!w) return false;
    const start = hhmmToMinutes(w.start), end = hhmmToMinutes(w.end);
    if (start === null || end === null) return false;
    const { day, minutes } = ukClock(date);
    const days = Array.isArray(w.days) && w.days.length ? w.days : [0, 1, 2, 3, 4, 5, 6];
    if (start === end) return days.includes(day);
    if (start < end) return days.includes(day) && minutes >= start && minutes < end;
    if (minutes >= start) return days.includes(day);           // evening part of a late menu
    return minutes < end && days.includes((day + 6) % 7);       // after midnight: yesterday's window
}

/** No windows (or an empty list) means always - scheduling is opt-in. */
function inHours(item, date) {
    const ws = item?.availability_windows;
    if (!Array.isArray(ws) || ws.length === 0) return true;
    return ws.some(w => inWindow(w, date));
}

/**
 * Why this item cannot be sold here at `date`, or null if it can.
 * 'unavailable' - switched off; 'channel' - not sold here; 'hours' - outside its times.
 */
function whyNotSellable(item, where, date) {
    if (!item || item.is_available === false) return 'unavailable';
    if (!sellsAt(item, where)) return 'channel';
    if (!inHours(item, date)) return 'hours';
    return null;
}
/**
 * When an order is FOR: a future scheduled slot, else now. A scheduled order is
 * checked against the time it will be made, not the time it was placed.
 */
function forTime(isScheduled, scheduledFor, now = new Date()) {
    const t = isScheduled !== false && scheduledFor ? new Date(scheduledFor) : null;
    return t && Number.isFinite(t.getTime()) && t.getTime() > now.getTime() ? t : now;
}

/** Customer-facing wording for a refusal (servers use the same words). */
function notSellableMessage(name, why) {
    const n = `"${name || 'An item'}"`;
    if (why === 'channel') return `${n} isn't sold here. Please remove it.`;
    if (why === 'hours') return `${n} isn't available at this time. Please remove it.`;
    return `${n} is currently unavailable. Please remove it.`;
}
// ── END ITEM AVAILABILITY ────────────────────────────────────────────────────

// ── Entry point ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ ok: false, error: 'POST only' }, { status: 405 });
    let body;
    try { body = await req.json(); } catch { return fail('BAD_JSON', 'Body must be JSON', {}, 400); }

    const base44 = createClientFromRequest(req);
    if (!(await authorised(req, base44, body))) return fail('UNAUTHORISED', 'Unauthorised', {}, 401);

    const db = base44.asServiceRole.entities;
    const action = String(body.action || '');

    try {
        // ── start_session: the only action without a session ──
        if (action === 'start_session') {
            const channel = ['phone', 'whatsapp', 'web_chat', 'test'].includes(body.channel) ? body.channel : 'test';
            let restaurantId = body.restaurant_id || null;
            if (!restaurantId && body.called_number) {
                const num = phoneDigits(body.called_number);
                const rows = num ? await db.AiChannelNumber.filter({ number: num }) : [];
                const hit = rows.find((r) => r.is_active !== false && (r.channel === channel || channel === 'test'));
                restaurantId = hit?.restaurant_id || null;
                if (!restaurantId) return fail('NUMBER_NOT_LINKED', `No restaurant is linked to ${body.called_number}.`, { say: 'Sorry, this number is not set up for ordering yet.' });
            }
            if (!restaurantId) return fail('RESTAURANT_REQUIRED', 'Send restaurant_id or called_number.');
            // A malformed id makes the database throw rather than return nothing
            const restaurant = (await db.Restaurant.filter({ id: String(restaurantId) }).catch(() => []))[0];
            if (!restaurant) return fail('RESTAURANT_NOT_FOUND', 'Restaurant not found.');

            // Same call id twice (a platform retry) returns the same session
            if (body.external_id) {
                const existing = (await db.AiOrderSession.filter({ channel, external_id: String(body.external_id) }))[0];
                if (existing) return ok({ session_id: existing.id, resumed: true, ...(await contextOf(db, existing, restaurant)), ...(body.include_menu ? { voice_menu: voiceMenu(await loadMenu(db, restaurant.id)) } : {}) });
            }
            const phone = phoneDigits(body.customer_phone);
            const session = await db.AiOrderSession.create({
                channel, restaurant_id: restaurant.id,
                external_id: body.external_id ? String(body.external_id) : undefined,
                customer_phone: phone || undefined,
                customer_name: body.customer_name ? clip(body.customer_name, 80) : undefined,
                cart: [], state: 'active', started_at: nowIso(), last_activity_at: nowIso(),
                event_log: [{ at: nowIso(), action, ok: true, note: `channel=${channel}` }],
            });
            // Menu and context in parallel: the voice agent waits on this before it can speak
            const [ctxInfo, menuText] = await Promise.all([
                contextOf(db, session, restaurant),
                body.include_menu ? loadMenu(db, restaurant.id).then(voiceMenu) : Promise.resolve(null),
            ]);
            return ok({ session_id: session.id, ...ctxInfo, ...(menuText ? { voice_menu: menuText } : {}) });
        }

        if (!body.session_id) return fail('SESSION_REQUIRED', 'session_id is required.');
        let sideEffect = false; // an SMS sent or an order placed: never re-run the action
        for (let attempt = 0; ; attempt++) {
        const before = (await db.AiOrderSession.filter({ id: String(body.session_id) }).catch(() => []))[0];
        if (!before) return fail('SESSION_NOT_FOUND', 'Session not found.');
        if (['closed'].includes(before.state) && action !== 'get_context') return fail('SESSION_CLOSED', 'This session has ended.');
        // Once an order exists (cash, or a paid link linked by aiOrderLink) the basket is frozen
        const CHANGES_ORDER = ['add_item', 'choose_option', 'cancel_pending', 'remove_item', 'set_quantity', 'clear_basket', 'import_basket', 'set_order_type', 'check_delivery', 'send_payment_link'];
        if (before.order_id && CHANGES_ORDER.includes(action)) {
            return fail('ALREADY_ORDERED', 'This order has already been placed.', { order_id: before.order_id, say: 'Your order is already placed. For any changes, let me put you through to the team.' });
        }
        const restaurant = (await db.Restaurant.filter({ id: before.restaurant_id }))[0];
        if (!restaurant) return fail('RESTAURANT_NOT_FOUND', 'Restaurant not found.');

        const s = JSON.parse(JSON.stringify(before)); // handlers mutate the copy; saveSession diffs it
        const needsMenu = action === 'apply' || !['get_context', 'set_customer', 'handoff', 'end_session', 'check_delivery', 'set_order_type'].includes(action);
        const menu = needsMenu ? await loadMenu(db, restaurant.id) : null;

        let resultOk = true;
        let note = '';

        /** Runs ONE action against the session copy `s`; returns a plain result object. */
        const run = async (action, body) => {
        let result;
        const done = (data) => { result = { ok: true, ...data }; };
        const refuse = (code, error, extra = {}) => { resultOk = false; note = code; result = { ok: false, code, error, say: extra.say || error, ...extra }; };
        if (s.order_id && CHANGES_ORDER.includes(action)) {
            refuse('ALREADY_ORDERED', 'This order has already been placed.', { order_id: s.order_id, say: 'Your order is already placed. For any changes, let me put you through to the team.' });
            return result;
        }

        switch (action) {
            case 'browse_menu': {
                const cats = [...new Set(menu.available.map((i) => i.category || 'Other'))].sort((a, b) => a.localeCompare(b));
                const mode = body.mode || (body.category != null ? 'category' : 'categories');
                if (mode === 'categories') {
                    done({ categories: cats.map((c, i) => ({ index: i, name: c, count: menu.available.filter((x) => (x.category || 'Other') === c).length })) });
                } else if (mode === 'category') {
                    const name = typeof body.category === 'number' ? cats[body.category] : cats.find((c) => norm(c) === norm(body.category));
                    if (!name) { refuse('CATEGORY_NOT_FOUND', "I couldn't find that part of the menu.", { categories: cats }); break; }
                    const items = menu.available.filter((i) => (i.category || 'Other') === name)
                        .sort((a, b) => (b.is_popular ? 1 : 0) - (a.is_popular ? 1 : 0) || a.name.localeCompare(b.name));
                    const per = Math.max(1, Math.min(30, Number(body.per_page) || 9));
                    const page = Math.max(0, Math.floor(Number(body.page) || 0));
                    done({ category: name, category_index: cats.indexOf(name), page, has_more: items.length > (page + 1) * per,
                        items: items.slice(page * per, (page + 1) * per).map(itemSummary) });
                } else if (mode === 'agent') {
                    done({ menu_text: menuForAgent(menu, cats) });
                } else refuse('BAD_MODE', 'mode must be categories, category or agent.');
                break;
            }

            case 'get_context':
                done(await contextOf(db, s, restaurant, { skipReturning: body.skip_returning === true }));
                break;

            case 'search_menu': {
                const qTokens = tokensOf(body.query);
                const qPhrase = norm(body.query);
                const limit = Math.max(1, Math.min(15, Number(body.limit) || 6));
                const weights = wordWeights(menu.available, qTokens);
                const scored = menu.available.map((i) => ({ i, sc: scoreItem(i, qTokens, qPhrase, weights) })).filter((x) => x.sc >= 1)
                    .sort((a, b) => b.sc - a.sc || a.i.name.localeCompare(b.i.name)).slice(0, limit);
                note = `"${clip(body.query, 40)}" -> ${scored.length}`;
                if (!scored.length) {
                    const cats = [...new Set(menu.available.map((i) => i.category || 'Other'))].sort();
                    refuse('NO_MATCH', `Nothing on the menu matches "${clip(body.query, 60)}".`, { categories: cats, say: `Sorry, I couldn't find that. We have ${cats.slice(0, 6).join(', ')}.` });
                    break;
                }
                done({ items: scored.map((x) => itemSummary(x.i)) });
                break;
            }

            case 'get_item': {
                const found = resolveItem(menu, body);
                const item = found.item;
                if (!item) { refuse('ITEM_NOT_FOUND', 'That item is not available right now.', found.candidates?.length ? { did_you_mean: found.candidates } : {}); break; }
                done({
                    item: {
                        ...itemSummary(item),
                        description: item.description || '',
                        allergens: Array.isArray(item.allergens) ? item.allergens : [],
                        allergen_note: 'Read the listed allergens only. Never say an item is allergen-free; for a medical allergy, offer to transfer to staff.',
                        option_groups: (item.customization_options || []).filter((g) => (g.options || []).length).map(groupForAgent),
                    },
                });
                break;
            }

            case 'add_item': {
                const found = resolveItem(menu, body);
                const item = found.item;
                if (!item) { refuse('ITEM_NOT_FOUND', "Sorry, that item isn't available right now.", found.candidates?.length ? { did_you_mean: found.candidates } : {}); break; }
                if (s.pending_item?.queue?.length) {
                    const cur = menu.byId.get(s.pending_item.menu_item_id);
                    if (cur) { refuse('OPTIONS_PENDING', `Let's finish the ${cur.name} first.`, { question: nextQuestion(cur, s.pending_item) }); break; }
                }
                // Choices are stored by group NAME (website, POS and the price check all read them that
                // way), so two groups with the same name would overwrite each other and the order would
                // be priced wrong. Refuse such an item rather than sell it at the wrong price.
                const names = (item.customization_options || []).filter((g) => (g.options || []).length).map((g) => g.name || '');
                if (new Set(names).size !== names.length) {
                    console.error(`${LOG} menu item ${item.id} "${item.name}" has two option groups with the same name - fix it in the menu editor`);
                    refuse('ITEM_SETUP_PROBLEM', `Sorry, I can't take the ${String(item.name).trim()} over the phone right now.`, { say: `Sorry, I can't take the ${String(item.name).trim()} through this line right now. Would you like something else, or shall I put you through to the team?` });
                    break;
                }
                const { pending, ignored } = startPending(item, body.quantity, body.options);
                s.pending_item = pending;
                note = `${pending.quantity}x ${item.name}`;
                if (pending.queue.length) {
                    const question = nextQuestion(item, pending);
                    done({ added: false, needs_choice: question, ignored_options: ignored, say: question.say });
                } else {
                    const added = finishPending(s, item);
                    const q = quote(s, restaurant);
                    done({ added: true, line: added, ignored_options: ignored, basket: basketView(s), quote: q, say: `Added ${added.quantity} ${added.name}${added.options ? ` (${added.options})` : ''}. Anything else?` });
                }
                break;
            }

            case 'choose_option': {
                const p = s.pending_item;
                const item = p && menu.byId.get(p.menu_item_id);
                if (!p || !p.queue?.length || !item) { s.pending_item = null; refuse('NOTHING_PENDING', 'There is no question waiting for an answer.'); break; }
                const step = p.queue[0];
                const group = findGroup(item, step);
                if (!group) { p.queue.shift(); }
                else {
                    const option = Number.isInteger(body.option_index) ? (group.options || [])[body.option_index] : matchOption(group, body.option);
                    if (!option) {
                        refuse('OPTION_NOT_FOUND', `"${clip(body.option, 40)}" isn't one of the choices.`, { question: nextQuestion(item, p) });
                        break;
                    }
                    p.queue.shift();
                    recordChoice(p, item, step, option);
                    note = `${group.name}=${option.label}`;
                }
                if (p.queue.length) {
                    const question = nextQuestion(item, p);
                    done({ added: false, needs_choice: question, say: question.say });
                } else {
                    const added = finishPending(s, item);
                    const q = quote(s, restaurant);
                    done({ added: true, line: added, basket: basketView(s), quote: q, say: `Added ${added.quantity} ${added.name}${added.options ? ` (${added.options})` : ''}. Anything else?` });
                }
                break;
            }

            case 'cancel_pending':
                s.pending_item = null;
                done({ say: 'No problem, I have left that one out.' });
                break;

            case 'remove_item':
            case 'set_quantity': {
                const cart = [...(s.cart || [])];
                const idx = body.line ? Number(body.line) - 1 : cart.findIndex((l) => l.menu_item_id === body.menu_item_id);
                if (!(idx >= 0 && cart[idx])) { refuse('LINE_NOT_FOUND', "I couldn't find that in the basket.", { basket: basketView(s) }); break; }
                if (action === 'remove_item') {
                    const n = Math.round(Number(body.quantity) || 0);
                    if (n > 0 && cart[idx].quantity > n) cart[idx].quantity -= n; else cart.splice(idx, 1);
                } else {
                    const q = Math.round(Number(body.quantity) || 0);
                    if (q <= 0) cart.splice(idx, 1); else cart[idx].quantity = Math.min(MAX_QTY, q);
                }
                s.cart = cart;
                const q = quote(s, restaurant);
                done({ basket: basketView(s), quote: q, say: basketSay(s, q) });
                break;
            }

            case 'clear_basket':
                s.cart = []; s.pending_item = null;
                done({ basket: [], say: 'I have cleared the basket.' });
                break;

            case 'import_basket': {
                // The web chat shares ONE basket with the restaurant page: whatever the customer
                // added by tapping the menu comes in here before the agent acts on it.
                const lines = Array.isArray(body.lines) ? body.lines.slice(0, 60) : [];
                const cart = [];
                const dropped = [];
                const allIds = new Set(menu.all.map((i) => i.id));
                for (const raw of lines) {
                    if (!raw || typeof raw !== 'object') continue;
                    const quantity = Math.max(1, Math.min(MAX_QTY, Math.round(Number(raw.quantity) || 1)));
                    const id = raw.menu_item_id || raw.id;
                    if (DEAL_FLAGS.some((f) => raw[f]) || !allIds.has(id)) {
                        // A deal (or something the website built that isn't a menu item): kept as-is
                        if (typeof raw.price !== 'number' || !raw.name) continue;
                        cart.push({ ...raw, quantity, external: true });
                        continue;
                    }
                    const item = menu.byId.get(id);
                    if (!item) { dropped.push(String(raw.name || 'an item')); continue; } // on the menu but not sellable now
                    const { serverPrice } = calcItemServerPrice(item, raw);
                    cart.push({
                        menu_item_id: item.id, name: String(item.name || '').trim(), price: round2(serverPrice), quantity,
                        image_url: raw.image_url || item.image_url || undefined,
                        customizations: raw.customizations || {}, itemQuantities: raw.itemQuantities || {},
                        options_summary: raw.options_summary || summarizeCustomizations(raw.customizations),
                    });
                }
                s.cart = cart;
                note = `${cart.length} lines${dropped.length ? `, dropped ${dropped.length}` : ''}`;
                const q = quote(s, restaurant);
                done({ basket: basketView(s), quote: q, removed_unavailable: dropped });
                break;
            }

            case 'get_basket': {
                const dropped = repriceCart(s, menu);
                const q = quote(s, restaurant);
                done({ basket: basketView(s), quote: q, removed_unavailable: dropped, pending: pendingQuestion(s, menu),
                    ...(body.full === true ? { cart_lines: webLines(s) } : {}), say: (dropped.length ? `${dropped.join(', ')} is no longer available, so I took it off. ` : '') + basketSay(s, q) });
                break;
            }

            case 'set_order_type': {
                const t = body.order_type;
                if (!['delivery', 'collection'].includes(t)) { refuse('BAD_ORDER_TYPE', 'order_type must be delivery or collection.'); break; }
                if (t === 'collection' && !restaurant.collection_enabled) { refuse('NO_COLLECTION', 'Sorry, we only do delivery.'); break; }
                const svc = hoursClosedReason(restaurant, t);
                s.order_type = t;
                note = t;
                done({ order_type: t, service_note: svc || undefined, say: svc || (t === 'delivery' ? "Delivery it is. What's the postcode?" : 'Collection, great.') });
                break;
            }

            case 'check_delivery': {
                const pc = normPostcode(body.postcode);
                if (!pc) { refuse('BAD_POSTCODE', "That doesn't sound like a full UK postcode.", { say: 'Sorry, could you tell me the full postcode again?' }); break; }
                const [geo, zones] = await Promise.all([
                    geocodePostcode(pc),
                    db.DeliveryZone.filter({ restaurant_id: restaurant.id, is_active: true }).catch(() => []),
                ]);
                if (geo.valid === false) { refuse('UNKNOWN_POSTCODE', `${pc} isn't a postcode I can find.`, { say: `Sorry, I can't find ${pc}. Could you check it?` }); break; }
                const address = `${body.address || s.delivery_address || ''} ${pc}`.trim();
                let dq;
                if (!zones?.length) {
                    dq = { postcode: pc, zones_configured: false, available: true, fee: restaurant.delivery_fee ?? 0, minimum_order: restaurant.minimum_order ?? 0, eta: restaurant.delivery_time || null };
                } else {
                    const zone = matchZone(zones, geo.valid ? { lat: geo.lat, lng: geo.lng } : null, address);
                    dq = zone
                        ? { postcode: pc, zones_configured: true, available: true, fee: zone.delivery_fee, minimum_order: zone.min_order_value || 0, zone_name: zone.name, eta: zone.estimated_delivery_time || null }
                        : { postcode: pc, zones_configured: true, available: false };
                }
                s.delivery_postcode = pc;
                s.delivery_quote = dq;
                if (body.address) s.delivery_address = clip(body.address, 300);
                note = `${pc} -> ${dq.available ? 'yes' : 'no'}`;
                if (!dq.available) { refuse('OUT_OF_AREA', `Sorry, we don't deliver to ${pc}.`, { delivery: dq, collection_enabled: !!restaurant.collection_enabled }); break; }
                const q = quote(s, restaurant);
                done({ delivery: dq, quote: q, say: `Yes, we deliver to ${pc}. ${deliveryTermsSay(dq, restaurant)}` });
                break;
            }

            case 'set_customer': {
                if (body.name) s.customer_name = clip(body.name, 80);
                if (body.phone) {
                    const d = phoneDigits(body.phone);
                    if (!d) { refuse('BAD_PHONE', "That phone number doesn't look right."); break; }
                    s.customer_phone = d;
                }
                if (body.address) s.delivery_address = clip(body.address, 300);
                if (body.postcode) {
                    const pc = normPostcode(body.postcode);
                    if (pc && pc !== s.delivery_postcode) { s.delivery_postcode = pc; s.delivery_quote = null; }
                }
                done({ customer: { name: s.customer_name || null, phone: s.customer_phone ? localPhone(s.customer_phone) : null, address: s.delivery_address || null, postcode: s.delivery_postcode || null }, say: 'Thanks.' });
                break;
            }

            case 'send_payment_link': {
                const atCheckout = body.details_at_checkout === true;
                const r = readiness(s, restaurant, menu, { detailsAtCheckout: atCheckout });
                if (!r.q) {
                    const { code, error, ...rest } = r;
                    refuse(code, error, rest);
                    break;
                }
                if (!atCheckout && s.order_type === 'delivery' && !s.delivery_address) { refuse('ADDRESS_NEEDED', "What's the delivery address?"); break; }
                s.checkout_token = randomToken();
                s.checkout_token_expires_at = new Date(Date.now() + CHECKOUT_TTL_MS).toISOString();
                s.state = 'awaiting_payment';
                const url = `${APP_URL}/AiCheckout?t=${s.checkout_token}`;
                let smsSent = false;
                if (body.send_sms !== false && s.customer_phone) {
                    const text = `${restaurant.name}: your order is ${money(r.q.total)}. Tap to pay and confirm: ${url} (link works for 2 hours)`;
                    sideEffect = true;
                    try {
                        const res = await base44.asServiceRole.functions.invoke('sendSMS', {
                            to: localPhone(s.customer_phone), message: text, restaurantId: restaurant.id,
                            restaurantName: restaurant.name, smsType: 'ai_payment_link',
                        });
                        smsSent = res?.data?.success === true;
                    } catch (e) { console.warn(`${LOG} pay link SMS failed: ${e?.message}`); }
                }
                note = smsSent ? 'sms sent' : 'link only';
                done({ checkout_url: url, expires_at: s.checkout_token_expires_at, sms_sent: smsSent, quote: r.q, basket: basketView(s),
                    say: smsSent ? `I've texted you a link to pay ${money(r.q.total)}. Your order goes through as soon as you pay.` : `Your total is ${money(r.q.total)}. Here's your link to pay.` });
                break;
            }

            case 'place_cash_order': {
                if (restaurant.accepts_cash_on_delivery === false) { refuse('NO_CASH', "Sorry, we can't take cash for this order. I can send you a payment link instead."); break; }
                if (s.order_id) { done({ order_id: s.order_id, duplicate: true, say: 'Your order is already placed.' }); break; }
                const r = readiness(s, restaurant, menu);
                if (!r.q) { refuse(r.code, r.error, r.question ? { question: r.question } : {}); break; }
                if (!s.customer_name) { refuse('NAME_NEEDED', 'Can I take a name for the order?'); break; }
                if (!s.customer_phone) { refuse('PHONE_NEEDED', "What's the best phone number for the order?"); break; }
                if (s.order_type === 'delivery' && !s.delivery_address) { refuse('ADDRESS_NEEDED', "What's the delivery address?"); break; }

                const q = r.q;
                const address = s.order_type === 'delivery'
                    ? clip(`${s.delivery_address}${s.delivery_postcode && !String(s.delivery_address).toUpperCase().includes(s.delivery_postcode.replace(' ', '')) && !String(s.delivery_address).toUpperCase().includes(s.delivery_postcode) ? `, ${s.delivery_postcode}` : ''}`, 500)
                    : '';
                const channelWord = s.channel === 'phone' ? 'phone' : s.channel === 'whatsapp' ? 'WhatsApp' : 'chat';
                // Same shape as src/hooks/useCreateOrder.js builds for the website checkout
                const orderData = {
                    order_number: s.order_type === 'collection' ? `C-${Date.now().toString().slice(-6)}` : null,
                    restaurant_id: restaurant.id,
                    restaurant_name: restaurant.name,
                    items: (s.cart || []).map((l) => ({
                        menu_item_id: l.menu_item_id, name: l.name, price: l.price, quantity: l.quantity,
                        customizations: l.customizations || {}, itemQuantities: l.itemQuantities || {},
                    })),
                    subtotal: q.subtotal,
                    delivery_fee: q.delivery_fee,
                    small_order_surcharge: q.small_order_surcharge,
                    discount: 0,
                    coupon_codes: [],
                    promotion_codes: [],
                    total: q.total,
                    payment_method: 'cash',
                    order_type: s.order_type,
                    status: 'pending',
                    delivery_address: address,
                    delivery_coordinates: null,
                    phone: localPhone(s.customer_phone),
                    notes: clip(`AI ${channelWord} order.${body.notes ? ` ${String(body.notes).replace(/[<>]/g, '')}` : ''}`, 500),
                    estimated_delivery: s.order_type === 'collection' ? '15-20 minutes' : '30-45 minutes',
                    is_scheduled: false,
                    scheduled_for: null,
                    guest_name: s.customer_name,
                    marketing_opt_in: { sms: false, email: false, whatsapp: false },
                };
                if (body.dry_run === true) {
                    note = 'dry run';
                    done({ dry_run: true, order_data: orderData, quote: q, say: `That's ${money(q.total)}, paid in cash on ${s.order_type}.` });
                    break;
                }
                sideEffect = true;
                // verifyAndCreateOrder answers a refusal with a 4xx, which the SDK throws;
                // read the refusal from the error so the agent can say what went wrong.
                const res = await base44.asServiceRole.functions.invoke('verifyAndCreateOrder', {
                    orderData, paymentIntentId: null, idempotency_key: `ai_${s.id}`,
                }).catch((e) => ({ data: e?.response?.data && typeof e.response.data === 'object'
                    ? e.response.data
                    : { success: false, code: 'ORDER_FAILED', error: e?.message } }));
                const out = res?.data || {};
                if (!out.success || !out.order_id) {
                    console.error(`${LOG} order refused session=${s.id} code=${out.code} ${out.error}`);
                    const generic = !out.error || ['ORDER_CREATE_FAILED', 'ORDER_FAILED'].includes(out.code);
                    refuse(out.code || 'ORDER_FAILED', out.error || 'Sorry, something went wrong placing the order.', {
                        detail: out.error,
                        say: generic
                            ? "Sorry, I couldn't place that order. Let me put you through to the team."
                            : `Sorry, I couldn't place that order: ${clip(out.error, 160)}`,
                    });
                    break;
                }
                await db.Order.update(out.order_id, { ai_channel: s.channel === 'test' ? 'web_chat' : s.channel, ai_session_id: s.id })
                    .catch((e) => console.warn(`${LOG} could not tag order ${out.order_id}: ${e?.message}`));
                s.order_id = out.order_id;
                s.state = 'ordered';
                s.checkout_token = null;
                note = `order ${out.order_id}`;
                const eta = s.order_type === 'collection' ? 'about 15 to 20 minutes' : etaSay(s.delivery_quote?.eta || restaurant.delivery_time || '30-45');
                done({ order_id: out.order_id, order_number: out.order_number || null, total: q.total, eta,
                    say: `Your order is placed${out.order_number ? `, number ${out.order_number}` : ''}. It's ${money(q.total)} in cash, ${s.order_type === 'delivery' ? 'with you in' : 'ready in'} ${eta}. Thank you!` });
                break;
            }

            case 'handoff':
                s.state = 'handoff';
                s.handoff_reason = clip(body.reason || 'customer asked for a person', 200);
                note = s.handoff_reason;
                done({ transfer_to: restaurant.alert_phone ? localPhone(phoneDigits(restaurant.alert_phone)) : null,
                    say: 'No problem, let me put you through to the team.' });
                break;

            case 'end_session':
                // A pay link outlives the call: the customer usually pays AFTER hanging up,
                // so a session waiting for payment stays waiting (aiOrderLink links the
                // paid order to it). Everything else without an order is closed.
                if (s.order_id) s.state = 'ordered';
                else if (s.state !== 'awaiting_payment' && s.state !== 'handoff') s.state = 'closed';
                s.ended_at = nowIso();
                note = clip(body.outcome || '', 80);
                done({ state: s.state });
                break;

            default:
                refuse('UNKNOWN_ACTION', `Unknown action "${action}".`);
        }
        return result;
        };

        let response;
        if (action === 'apply') {
            // Several actions in one call (a chat message often says "2 burgers and a coke, no wait 3").
            // Stops at the first question the customer must answer before anything else can be added.
            const steps = Array.isArray(body.steps) ? body.steps.slice(0, 12) : [];
            const results = [];
            for (const st of steps) {
                const a = String(st?.action || '');
                if (!a || ['apply', 'start_session', 'place_cash_order', 'send_payment_link', 'end_session', 'import_basket'].includes(a)) {
                    results.push({ action: a, ok: false, code: 'NOT_ALLOWED_IN_APPLY', error: `${a || 'missing action'} must be its own call.` });
                    continue;
                }
                const r = await run(a, st);
                results.push({ action: a, ...r });
                if (r.needs_choice || (r.code === 'OPTIONS_PENDING')) break;
            }
            note = steps.map((x) => x?.action).join(',');
            resultOk = results.every((r) => r.ok);
            response = ok({ results, basket: basketView(s), quote: quote(s, restaurant), pending: pendingQuestion(s, menu),
                ...(body.full === true ? { cart_lines: webLines(s) } : {}) });
        } else {
            const r = await run(action, body);
            response = Response.json(r, { status: r.code === 'UNKNOWN_ACTION' ? 400 : 200 });
        }

        const conflict = await saveSession(db, before, s, action, resultOk, note, attempt < 2 && !sideEffect)
            .catch((e) => { console.error(`${LOG} save failed: ${e?.message}`); return false; });
        if (conflict) { console.warn(`${LOG} ${action} session=${before.id} changed underneath - re-running on the fresh session`); continue; }
        return response;
        }
    } catch (e) {
        console.error(`${LOG} ${action} failed:`, e?.message, e?.stack);
        return fail('INTERNAL', 'Something went wrong.', { say: 'Sorry, something went wrong on our side.' }, 500);
    }
});

/** The question waiting for the customer, if an item still needs option choices. */
function pendingQuestion(session, menu) {
    const p = session.pending_item;
    if (!p?.queue?.length || !menu) return null;
    const item = menu.byId.get(p.menu_item_id);
    return item ? nextQuestion(item, p) : null;
}

/** Compact menu for an LLM prompt: ids, names, prices, flags, allergens, option groups (* = required). */
function menuForAgent(menu, cats) {
    const opts = (g) => `${g.required ? '*' : ''}${g.name || 'Option'}: ${(g.options || []).map((o) => `${o.label}${o.price ? ` +${Number(o.price).toFixed(2)}` : ''}`).join(' / ')}`;
    return cats.map((cat) => `[${cat}]\n` + menu.available.filter((i) => (i.category || 'Other') === cat).map((i) => {
        const groups = (i.customization_options || []).filter((g) => (g.options || []).length).map((g) => {
            const nested = (g.meal_customizations || []).filter((m) => (m.options || []).length);
            return opts(g) + (nested.length ? ` (with a paid ${g.name || 'upgrade'}: ${nested.map(opts).join('; ')})` : '');
        });
        return `  ${i.id} | ${i.name} | ${money(i.price)}${i.is_popular ? ' | popular' : ''}${i.is_vegetarian ? ' | veg' : ''}${i.is_spicy ? ' | spicy' : ''}`
            + `${i.allergens?.length ? ` | allergens: ${i.allergens.join(', ')}` : ''}`
            + `${groups.length ? `\n      options: ${groups.join('; ')}` : ''}`;
    }).join('\n')).join('\n');
}

/**
 * Short spoken-style menu for a voice agent's prompt: every orderable item by section with its
 * price, a short description and what it comes with, so the agent can work out what a caller
 * means ("the normal chicken burger as a meal", "a big Pepsi") instead of needing exact names.
 * No ids - the agent names the item exactly as written here and the core resolves it.
 */
function voiceMenu(menu) {
    const cats = [...new Set(menu.available.map((i) => i.category || 'Other'))];
    const label = (o) => String(o.label || '').replace(/\s*\(\+?£?[\d.]+\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const extras = (i) => {
        const out = [];
        for (const g of (i.customization_options || []).filter((x) => (x.options || []).length)) {
            const paid = (g.options || []).filter((o) => (o.price || 0) > 0);
            if (g.type === 'meal_upgrade' && paid.length) {
                out.push(`as a meal +${money(Math.min(...paid.map((o) => o.price)))}`);
            } else if (g.required || (g.options || []).length <= 4) {
                // Items priced 0 take their price from the choice ("6 Wings"): say each price in full
                const base = Number(i.price) || 0;
                const opts = (g.options || []).map((o) => {
                    const l = label(o);
                    if (!l) return '';
                    const p = Number(o.price) || 0;
                    return p > 0 ? `${l} ${base > 0 ? '+' : ''}${money(p)}` : l;
                }).filter(Boolean);
                out.push(opts.length <= 5 ? opts.join(' or ') : `${opts.slice(0, 4).join(', ')} and more`);
            } else if (paid.length) out.push('optional extras');
        }
        return out;
    };
    return cats.map((cat) => `${cat}:\n` + menu.available.filter((i) => (i.category || 'Other') === cat).map((i) => {
        const bits = extras(i);
        const about = i.description ? ` - ${clip(String(i.description).replace(/\s+/g, ' ').trim(), 70)}` : '';
        const price = Number(i.price) > 0 ? money(i.price) : 'price depends on choice';
        return `- ${String(i.name || '').trim()} ${price}${bits.length ? ` (${bits.join('; ')})` : ''}${about}`;
    }).join('\n')).join('\n');
}

/**
 * Finds the item an agent means: by id, else by the exact menu name (case, spacing and
 * punctuation ignored), else by a search that clearly favours one item. Returns
 * { item } or { candidates } so a near miss can be offered back rather than failing.
 */
function resolveItem(menu, body) {
    if (body.menu_item_id) {
        const hit = menu.byId.get(String(body.menu_item_id));
        if (hit) return { item: hit };
    }
    const asked = String(body.item_name || '').trim();
    if (!asked) return { candidates: [] };
    const key = norm(asked);
    const exact = menu.available.filter((i) => norm(i.name) === key);
    if (exact.length === 1) return { item: exact[0] };
    const qTokens = tokensOf(asked);
    const weights = wordWeights(menu.available, qTokens);
    const scored = menu.available.map((i) => ({ i, sc: scoreItem(i, qTokens, key, weights) })).filter((x) => x.sc >= 1)
        .sort((a, b) => b.sc - a.sc);
    if (scored[0] && (!scored[1] || scored[0].sc >= scored[1].sc * 1.5)) return { item: scored[0].i, guessed: true };
    return { candidates: scored.slice(0, 4).map((x) => itemSummary(x.i)) };
}

/** What an agent needs at the start of (or back in) a conversation. */
async function contextOf(db, session, restaurant, opts = {}) {
    const closed = restaurantClosedReason(restaurant);
    let returning = null;
    if (session.customer_phone && !opts.skipReturning) {
        const local = localPhone(session.customer_phone);
        for (const p of [local, `+${session.customer_phone}`, session.customer_phone]) {
            const rows = await db.Order.filter({ restaurant_id: restaurant.id, phone: p }, '-created_date', 1).catch(() => []);
            if (rows?.[0]) {
                const o = rows[0];
                returning = {
                    name: o.guest_name || null,
                    last_order_type: o.order_type || null,
                    last_delivery_address: o.order_type === 'delivery' ? o.delivery_address || null : null,
                    last_items: (o.items || []).slice(0, 8).map((i) => `${i.quantity || 1}x ${i.name}`),
                    last_order_date: o.created_date || null,
                };
                break;
            }
        }
    }
    const q = quote(session, restaurant);
    return {
        restaurant: {
            id: restaurant.id,
            name: restaurant.name,
            open: !closed,
            closed_reason: closed || null,
            delivery_open: !closed && !hoursClosedReason(restaurant, 'delivery'),
            collection_enabled: !!restaurant.collection_enabled,
            collection_open: !!restaurant.collection_enabled && !closed && !hoursClosedReason(restaurant, 'collection'),
            accepts_cash: restaurant.accepts_cash_on_delivery !== false,
            delivery_fee: round2(restaurant.delivery_fee ?? 0),
            minimum_order: round2(restaurant.minimum_order ?? 0),
            delivery_time: restaurant.delivery_time || '30-45 mins',
            address: restaurant.address || null,
        },
        session: {
            id: session.id, channel: session.channel, state: session.state,
            customer_name: session.customer_name || null,
            customer_phone: session.customer_phone ? localPhone(session.customer_phone) : null,
            order_type: session.order_type || null,
            delivery_postcode: session.delivery_postcode || null,
        },
        basket: basketView(session),
        quote: q,
        returning_customer: returning,
        say: closed ? `Thanks for calling ${restaurant.name}. ${closed}` : `Thanks for calling ${restaurant.name}. What can I get you?`,
    };
}
