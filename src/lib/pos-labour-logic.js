/**
 * src/lib/pos-labour-logic.js
 * ===========================
 * TESTED source of truth for timesheets and labour cost.
 *
 * Mirrored in functions/posTimeClock (see SYNC RULE). Pay is the one place in a
 * POS where a rounding choice becomes a legal problem, so every rule below is
 * the conservative one.
 *
 * ─── HOURS COME FROM REAL ELAPSED TIME, NEVER THE CLOCK FACE ────────────────
 * A shift from 22:00 to 06:00 on the night the UK clocks go BACK is 9 real hours;
 * subtracting wall-clock times says 8 and underpays the worker by an hour. On the
 * night they go FORWARD it is 7 real hours, and wall-clock says 8. Timestamps are
 * stored as instants, and duration is always their difference.
 *
 * ─── PAY BY THE MINUTE ──────────────────────────────────────────────────────
 * No rounding shifts to the quarter-hour. Rounding that consistently favours the
 * employer can take a worker below the National Minimum Wage, and is the kind of
 * practice that turns up in an HMRC or tribunal claim. Minutes are exact; only
 * the final money figure is rounded, to the penny.
 *
 * SYNC RULE: any change here MUST be applied to functions/posTimeClock →
 *   workedMinutes, isForgottenClockOut
 */

/** A shift longer than this is almost certainly a forgotten clock-out. */
export const FORGOTTEN_CLOCK_OUT_HOURS = 16;

/**
 * UK Working Time Regulations: a worker is entitled to an uninterrupted 20-minute
 * break when working more than 6 hours.
 */
export const BREAK_THRESHOLD_MINUTES = 6 * 60;
export const MIN_BREAK_MINUTES = 20;

const toTime = (v) => {
    if (v === null || v === undefined || v === '') return NaN;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : NaN;
};

/**
 * Minutes worked for one entry: elapsed real time minus breaks.
 *
 * Returns null when it cannot be computed honestly - no clock-out yet, or times
 * that are missing or reversed. Null is deliberate: a report must be able to say
 * "this shift is unfinished" rather than silently counting it as zero or as the
 * time since clock-in.
 *
 * A break longer than the shift clamps to zero rather than producing negative
 * hours (and negative pay).
 */
export function workedMinutes(entry) {
    const start = toTime(entry?.clock_in);
    const end = toTime(entry?.clock_out);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const elapsed = Math.floor((end - start) / 60000);
    const breaks = Math.max(0, Math.floor(Number(entry?.break_minutes || 0)));
    return Math.max(0, elapsed - breaks);
}

/**
 * Is this entry an open shift that has run implausibly long?
 * Flagged, never paid automatically: paying 60 hours for a weekend nobody
 * remembered to clock out of is as wrong as paying nothing.
 */
export function isForgottenClockOut(entry, now = new Date()) {
    if (!entry || entry.clock_out) return false;
    const start = toTime(entry.clock_in);
    if (!Number.isFinite(start)) return false;
    return (now.getTime() - start) / 3600000 > FORGOTTEN_CLOCK_OUT_HOURS;
}

/** Does this shift fall short of the statutory break? */
export function breakShortfall(entry) {
    const start = toTime(entry?.clock_in);
    const end = toTime(entry?.clock_out);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
    const elapsed = (end - start) / 60000;
    return elapsed > BREAK_THRESHOLD_MINUTES && Number(entry?.break_minutes || 0) < MIN_BREAK_MINUTES;
}

/**
 * Pay for one entry, to the penny, from exact minutes.
 * Returns null if the shift can't be computed or has no rate - never a guess.
 */
export function entryPay(entry, hourlyRate) {
    const mins = workedMinutes(entry);
    const rate = Number(hourlyRate);
    if (mins === null || !Number.isFinite(rate) || rate < 0) return null;
    // Multiply before dividing, in pence, so floating point never loses a penny.
    return Math.round((mins * rate * 100) / 60) / 100;
}

/**
 * The rate in force for a staff member ON A GIVEN DAY.
 *
 * Rates change - every April with the National Minimum Wage, and on promotion.
 * A shift must be costed at the rate that applied when it was worked. Using
 * today's rate for a March shift after an April rise overstates last month's
 * labour cost, and understating it the other way hides a real cost increase.
 *
 * Picks the latest effective_from on or before the shift's date. Returns
 * undefined if no rate had started yet - which entryPay reports as missing
 * rather than guessing.
 *
 * @param {object[]} rates  [{ staff_id, hourly_rate, effective_from: 'YYYY-MM-DD' }]
 */
export function rateInForce(rates = [], staffId, when, timeZone = 'Europe/London') {
    // The UK LOCAL date, not UTC. A shift starting at 00:30 on 1 April is 23:30
    // UTC on 31 March during BST - and the National Minimum Wage rises on
    // 1 April, which is in BST. Using the UTC date costed exactly those
    // just-after-midnight shifts at the old, lower rate.
    const d = new Date(when);
    if (!Number.isFinite(d.getTime())) return undefined;
    const day = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);                                   // en-CA gives YYYY-MM-DD
    let best;
    for (const r of rates) {
        if (r?.staff_id !== staffId) continue;
        const from = String(r.effective_from || '').slice(0, 10);
        if (!from || from > day) continue;
        if (!best || from > String(best.effective_from).slice(0, 10)) best = r;
    }
    return best ? Number(best.hourly_rate) : undefined;
}

/**
 * Labour summary for a set of entries.
 *
 * @param {object[]} entries
 * @param {Record<string, number>} ratesByStaff  staff_id → hourly rate
 * @param {number} revenue  sales for the same period, for labour %
 */
export function labourSummary(entries = [], ratesByStaff = {}, revenue = 0, now = new Date()) {
    let minutes = 0, cost = 0;
    let unfinished = 0, forgotten = 0, missingRate = 0, breakIssues = 0;

    for (const e of entries) {
        const mins = workedMinutes(e);
        if (mins === null) {
            unfinished += 1;
            if (isForgottenClockOut(e, now)) forgotten += 1;
            continue;
        }
        minutes += mins;
        if (breakShortfall(e)) breakIssues += 1;
        // A dated rate list costs each shift at the rate in force that day; a
        // plain { staff_id: rate } map is still accepted for simple use.
        const rate = Array.isArray(ratesByStaff)
            ? rateInForce(ratesByStaff, e.staff_id, e.clock_in)
            : ratesByStaff[e.staff_id];
        const pay = entryPay(e, rate);
        if (pay === null) missingRate += 1;
        else cost += pay;
    }

    const labourCost = Math.round(cost * 100) / 100;
    const rev = Number(revenue || 0);
    return {
        hours: Math.round((minutes / 60) * 100) / 100,
        labourCost,
        // Null rather than 0% or Infinity when there were no sales - both of
        // those would be a misleading headline number.
        labourPercent: rev > 0 ? Math.round((labourCost / rev) * 1000) / 10 : null,
        unfinished,
        forgotten,
        missingRate,
        breakIssues,
    };
}
