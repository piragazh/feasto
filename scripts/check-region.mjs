#!/usr/bin/env node
/**
 * check-region.mjs — guard the server copies of the region rules.
 *
 * Server functions cannot import src/, so the phone rules in src/lib/region.js
 * and src/lib/phone.js are copied into each function that sends messages,
 * between "region-mirror:start" and "region-mirror:end".
 *
 *   1. Every copy must be byte-identical to scripts/region-mirror.snippet.js.
 *   2. The snippet's country table must match src/lib/region.js.
 *   3. The snippet's regionMobileE164 must give the same answer as
 *      src/lib/phone.js toE164 for every country, over a wide sample.
 *
 * Run: node scripts/check-region.mjs   (part of npm run check:mirrors)
 */
import fs from 'node:fs';
import { REGIONS, getRestaurantTimeZone, getRegion } from '../src/lib/region.js';
import { restaurantTz, COUNTRY_TZ } from '../src/lib/item-availability.js';
import { toE164 } from '../src/lib/phone.js';
import { formatMoney } from '../src/lib/money.js';

const MIRRORS = [
    'base44/functions/sendSMS/entry.ts',
    'base44/functions/sendWhatsAppCustomer/entry.ts',
    'base44/functions/sendWhatsAppOrder/entry.ts',
    'base44/functions/notifyRestaurantNewOrder/entry.ts',
    'base44/functions/handleHttpsmsWebhook/entry.ts',
];

let failures = 0;
const ok = (msg) => console.log(`  ✓  ${msg}`);
const bad = (msg) => { failures++; console.log(`  ✗ WRONG  ${msg}`); };

const block = (src) => {
    const m = src.match(/\/\/ region-mirror:start[\s\S]*?\/\/ region-mirror:end/);
    return m ? m[0] : null;
};

const canonical = block(fs.readFileSync('scripts/region-mirror.snippet.js', 'utf8'));
if (!canonical) { bad('scripts/region-mirror.snippet.js has no region-mirror block'); process.exit(1); }

// 1. identical copies
for (const file of MIRRORS) {
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { bad(`${file} missing`); continue; }
    const b = block(src);
    if (!b) bad(`${file} has no region-mirror block`);
    else if (b !== canonical) bad(`${file} region-mirror block differs from scripts/region-mirror.snippet.js`);
    else ok(`${file} carries the region mirror unchanged`);
}

// Load the snippet with a stub Deno.
const env = {};
const load = new Function('Deno', `${canonical}\nreturn { REGION_PHONE, regionCountry, regionMobileE164, regionEnv };`);
const mirror = load({ env: { get: (k) => env[k] } });

// 2. same countries and phone settings as src/lib/region.js
const srcCodes = Object.keys(REGIONS).sort().join(',');
const mirrorCodes = Object.keys(mirror.REGION_PHONE).sort().join(',');
if (srcCodes !== mirrorCodes) bad(`countries differ: region.js [${srcCodes}] vs mirror [${mirrorCodes}]`);
else ok(`countries match: ${srcCodes}`);
for (const [code, r] of Object.entries(REGIONS)) {
    const m = mirror.REGION_PHONE[code];
    if (!m) continue;
    if (m.dialCode !== r.dialCode || m.trunkPrefix !== r.trunkPrefix || String(m.mobileNational) !== String(r.mobileNational)) {
        bad(`${code} phone settings differ from region.js`);
    } else ok(`${code} phone settings match region.js`);
}

// 3. same E.164 answer as src/lib/phone.js
const SAMPLES = [
    '07123456789', '07123 456789', '+447123456789', '+44 (0)7123 456789', '447123456789', '00447123456789',
    '7123456789', '01375 123456', '0712345678', '071 234 5678', '+94712345678', '+94 71 234 5678',
    '0094712345678', '94712345678', '(071) 234 5678', '011 234 5678', '', ' ', 'abc', '+1 415 555 0100',
    '07123-456789', '0712345678 9', '+4407123456789', null, undefined, 7123456789,
];
for (const code of Object.keys(REGIONS)) {
    const diffs = SAMPLES.filter((s) => mirror.regionMobileE164(s, code) !== toE164(s, code));
    if (diffs.length) bad(`${code}: server and screen disagree on ${diffs.map((d) => JSON.stringify(d)).join(', ')}`);
    else ok(`${code}: server phone rule matches src/lib/phone.js on ${SAMPLES.length} samples`);
}

// Sender names: GB keeps the original names, others add _<CODE>.
env.HTTPSMS_FROM = 'uk'; env.HTTPSMS_FROM_LK = 'lk';
if (mirror.regionEnv('HTTPSMS_FROM', 'GB') !== 'uk' || mirror.regionEnv('HTTPSMS_FROM', null) !== 'uk' || mirror.regionEnv('HTTPSMS_FROM', 'LK') !== 'lk') {
    bad('regionEnv does not keep GB on the original secret names');
} else ok('GB uses the original secret names; LK uses _LK');
delete env.HTTPSMS_FROM_LK;
if (mirror.regionEnv('HTTPSMS_FROM', 'LK') !== '') bad('a missing LK setting must not fall back to the UK SIM');
else ok('a missing LK httpSMS phone never falls back to the UK SIM');

// 4. The restaurant clock rule inside the shared availability block
//    (copied into the order servers) matches region.js.
{
    const want = Object.fromEntries(Object.entries(REGIONS).map(([c, r]) => [c, r.timezone]));
    if (JSON.stringify(COUNTRY_TZ) !== JSON.stringify(want)) bad(`item-availability COUNTRY_TZ ${JSON.stringify(COUNTRY_TZ)} != region.js ${JSON.stringify(want)}`);
    else ok('availability block country clocks match region.js');
    const R = [null, undefined, {}, { country: null, timezone: 'UTC' }, { timezone: '' }, { timezone: 'utc' },
        { country: 'LK', timezone: 'UTC' }, { country: 'lk' }, { country: 'LK', timezone: 'Asia/Dubai' },
        { country: 'GB', timezone: 'Europe/London' }, { country: 'XX' }, { timezone: 'Not/AZone' },
        { country: 'LK', timezone: 'Not/AZone' }, { timezone: 'America/New_York' }, { country: 7 }];
    const d = R.filter((r) => restaurantTz(r) !== getRestaurantTimeZone(r));
    if (d.length) bad(`restaurantTz differs from getRestaurantTimeZone for ${d.map((x) => JSON.stringify(x)).join(', ')}`);
    else ok(`restaurant clock rule matches region.js on ${R.length} records`);

    // 5. The server clock copy (receipt printers) - identical copies, same answers.
    const CLOCK_MIRRORS = ['base44/functions/androidPrint/entry.ts', 'base44/functions/networkPrint/entry.ts', 'base44/functions/posCreateOrder/entry.ts', 'base44/functions/syncOfflineOrder/entry.ts'];
    const cblock = (s) => (s.match(/\/\/ region-clock:start[\s\S]*?\/\/ region-clock:end/) || [null])[0];
    const clock = cblock(fs.readFileSync('scripts/region-clock.snippet.js', 'utf8'));
    for (const file of CLOCK_MIRRORS) {
        const b = cblock(fs.readFileSync(file, 'utf8'));
        if (!b) bad(`${file} has no region-clock block`);
        else if (b !== clock) bad(`${file} region-clock block differs from scripts/region-clock.snippet.js`);
        else ok(`${file} carries the region clock unchanged`);
    }
    const { REGION_CLOCK, regionClockTz } = new Function(`${clock}\nreturn { REGION_CLOCK, regionClockTz };`)();
    if (JSON.stringify(REGION_CLOCK) !== JSON.stringify(want)) bad('region-clock country zones differ from region.js');
    const dc = R.filter((r) => regionClockTz(r) !== getRestaurantTimeZone(r));
    if (dc.length) bad(`regionClockTz differs from region.js for ${dc.map((x) => JSON.stringify(x)).join(', ')}`);
    else ok(`server clock rule matches region.js on ${R.length} records`);
}

// 6. The server money copy (receipts, restaurant alerts) - identical copies, same text.
{
    const MONEY_MIRRORS = ['base44/functions/aiOrderingCore/entry.ts', 'base44/functions/webChatAgent/entry.ts', 'base44/functions/androidPrint/entry.ts', 'base44/functions/networkPrint/entry.ts',
        'base44/functions/sendWhatsAppOrder/entry.ts', 'base44/functions/notifyRestaurantNewOrder/entry.ts',
        'base44/functions/whatsappOrderNotify/entry.ts', 'base44/functions/sendNotificationFromTemplate/entry.ts'];
    const mblock = (s) => (s.match(/\/\/ region-money:start[\s\S]*?\/\/ region-money:end/) || [null])[0];
    const canon = mblock(fs.readFileSync('scripts/region-money.snippet.js', 'utf8'));
    for (const file of MONEY_MIRRORS) {
        const b = mblock(fs.readFileSync(file, 'utf8'));
        if (!b) bad(`${file} has no region-money block`);
        else if (b !== canon) bad(`${file} region-money block differs from scripts/region-money.snippet.js`);
        else ok(`${file} carries the region money rule unchanged`);
    }
    const { REGION_MONEY, regionMoney } = new Function(`${canon}\nreturn { REGION_MONEY, regionMoney };`)();
    if (Object.keys(REGION_MONEY).sort().join() !== Object.keys(REGIONS).sort().join()) bad('region-money countries differ from region.js');
    const AMTS = [0, 1, 2.5, 12.499, 12.505, 0.1 + 0.2, 99.995, 1065.57, 1234567.891, -3.2, null, undefined, 7, '950'];
    const WHO = [null, {}, { country: null }, 'GB', 'LK', { country: 'lk' }, { country: 'XX' }];
    const diffs = [];
    for (const a of AMTS) for (const w of WHO) {
        if (a === '950' && (w === null || w === 'GB' || (w && !w.country) || (w && w.country === 'XX'))) continue;  // strings throw in the UK, as toFixed always did
        if (regionMoney(a, w) !== formatMoney(a, w)) diffs.push(`${JSON.stringify(a)}/${JSON.stringify(w)}`);
    }
    if (diffs.length) bad(`server money text differs from money.js for ${diffs.join(', ')}`);
    else ok('server money text matches src/lib/money.js');
}

// 7. The server card-provider copy (createPaymentIntent, processCardTerminal).
{
    const CARD_MIRRORS = ['base44/functions/createPaymentIntent/entry.ts', 'base44/functions/processCardTerminal/entry.ts', 'base44/functions/aiOrderingCore/entry.ts'];
    const cb = (s) => (s.match(/\/\/ region-card:start[\s\S]*?\/\/ region-card:end/) || [null])[0];
    const canon = cb(fs.readFileSync('scripts/region-card.snippet.js', 'utf8'));
    for (const file of CARD_MIRRORS) {
        const b = cb(fs.readFileSync(file, 'utf8'));
        if (!b) bad(`${file} has no region-card block`);
        else if (b !== canon) bad(`${file} region-card block differs from scripts/region-card.snippet.js`);
        else ok(`${file} carries the region card rule unchanged`);
    }
    const { REGION_CARD, regionCardProvider } = new Function(`${canon}\nreturn { REGION_CARD, regionCardProvider };`)();
    const want = Object.fromEntries(Object.entries(REGIONS).map(([c, r]) => [c, r.cardProvider]));
    if (JSON.stringify(REGION_CARD) !== JSON.stringify(want)) bad(`region-card ${JSON.stringify(REGION_CARD)} != region.js ${JSON.stringify(want)}`);
    const recs = [null, undefined, {}, { country: null }, { country: 'GB' }, { country: 'LK' }, { country: ' lk ' }, { country: 'XX' }, { country: 7 }];
    const d = recs.filter((r) => regionCardProvider(r) !== getRegion(r).cardProvider);
    if (d.length) bad(`regionCardProvider differs from region.js for ${d.map((x) => JSON.stringify(x)).join(', ')}`);
    else ok('server card rule matches region.js');
}

// 8. The server money-limits copy (discount cap, large-refund flag, money prefix).
{
    const LIMIT_MIRRORS = ['posApplyDiscount', 'posUpdateOrder', 'approveRefund', 'posCreateOrder', 'syncOfflineOrder', 'aiOrderingCore', 'awardLoyaltyPoints', 'verifyAndCreateOrder', 'loyaltyBackfill', 'posCashSession', 'chatbotQuery'].map((f) => `base44/functions/${f}/entry.ts`);
    const lb = (s) => (s.match(/\/\/ region-limits:start[\s\S]*?\/\/ region-limits:end/) || [null])[0];
    const canon = lb(fs.readFileSync('scripts/region-limits.snippet.js', 'utf8'));
    for (const file of LIMIT_MIRRORS) {
        const b = lb(fs.readFileSync(file, 'utf8'));
        if (!b) bad(`${file} has no region-limits block`);
        else if (b !== canon) bad(`${file} region-limits block differs from scripts/region-limits.snippet.js`);
        else ok(`${file} carries the region limits unchanged`);
    }
    const { REGION_LIMITS, regionLimits } = new Function(`${canon}\nreturn { REGION_LIMITS, regionLimits };`)();
    const prefixOf = (c) => (getRegion(c).currencySymbol === '£' ? '£' : `${getRegion(c).currencySymbol} `);
    for (const [code, r] of Object.entries(REGIONS)) {
        const m = REGION_LIMITS[code];
        if (!m) { bad(`region-limits has no ${code}`); continue; }
        const extra = ['aiCashLimit', 'loyaltySpendPerPoint', 'cashSignOffTolerance', 'cashMaxFloat'].filter((k) => m[k] !== r[k]);
        if (extra.length) bad(`${code} ${extra.join(', ')} differ from region.js`);
        if (m.managerDiscountMax !== r.managerDiscountMax || m.largeRefundFlag !== r.largeRefundFlag || m.prefix !== prefixOf(code)) bad(`${code} limits differ from region.js`);
        else ok(`${code} limits match region.js (cap ${m.managerDiscountMax}, refund flag ${m.largeRefundFlag})`);
    }
    if (Object.keys(REGION_LIMITS).sort().join() !== Object.keys(REGIONS).sort().join()) bad('region-limits countries differ from region.js');
    const uk = regionLimits({ country: null });
    if (uk.managerDiscountMax !== 20 || uk.largeRefundFlag !== 30 || uk.prefix !== '£') bad('UK limits must stay £20 / £30');
    else if (uk.aiCashLimit !== 50 || uk.loyaltySpendPerPoint !== 1 || uk.cashSignOffTolerance !== 5 || uk.cashMaxFloat !== 5000) bad('UK AI cash £50 / 1 point per £1 / £5 tolerance / £5000 float must stay');
    else ok('existing UK restaurants keep £20 / £30');
}

if (failures) { console.log(`\ncheck-region: ${failures} problem(s)`); process.exit(1); }
console.log('\ncheck-region: all good');
