/**
 * probeCouponArrayQuery — Live verification of array-field query behavior
 *
 * This is a diagnostic/admin-only function. It does NOT modify any data.
 *
 * Purpose:
 *   Verify that Order.coupon_codes array-field queries work correctly in the
 *   real platform environment. Specifically:
 *     1. $all operator correctly finds orders where coupon_codes contains a code
 *        at position 1, 2, or 3 of the array
 *     2. Legacy coupon_code (string) queries still work
 *     3. Mixed legacy/new history deduplication produces the correct unique count
 *     4. A deliberately wrong operator ($contains, undefined) returns 0 results
 *        (confirming it fails silently rather than throwing an error)
 *
 * Usage:
 *   POST /probeCouponArrayQuery
 *   Body: { "coupon_code": "SAVE10", "restaurant_id": "optional-filter" }
 *
 *   coupon_code: a real coupon code that has been used on at least one order
 *
 * Returns:
 *   {
 *     probe_summary: { ... },
 *     legacy_query_count: number,       // orders matching coupon_code == code
 *     array_query_all_count: number,    // orders matching coupon_codes $all [code] (correct)
 *     array_query_wrong_op_count: number, // orders matching coupon_codes $contains code (should be 0 or error)
 *     deduplicated_count: number,       // union of legacy + array, deduplicated
 *     position_breakdown: {             // which array positions hold this code
 *       position_1: number,
 *       position_2: number,
 *       position_3: number,
 *     },
 *     warnings: string[],
 *     recommendation: string
 *   }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { coupon_code, restaurant_id } = await req.json();

        if (!coupon_code || typeof coupon_code !== 'string') {
            return Response.json({ error: 'coupon_code required (a real code with order history)' }, { status: 400 });
        }

        const code = coupon_code.trim().toUpperCase();
        const warnings = [];
        const baseFilter = restaurant_id ? { restaurant_id } : {};

        // ── Probe 1: Legacy coupon_code (string) field ────────────────────────
        const legacyOrders = await base44.asServiceRole.entities.Order.filter({
            ...baseFilter,
            coupon_code: code,
        });
        const legacyCount = (legacyOrders || []).length;

        // ── Probe 2: Array field with correct $all operator ───────────────────
        const arrayOrdersAll = await base44.asServiceRole.entities.Order.filter({
            ...baseFilter,
            coupon_codes: { $all: [code] },
        });
        const arrayCountAll = (arrayOrdersAll || []).length;

        // ── Probe 3: Array field with WRONG operator ($contains) ──────────────
        // This is intentionally wrong to detect silent failure behavior.
        // Expected result: 0 results (silent ignore) or possibly a runtime error.
        let wrongOpCount = 0;
        let wrongOpError = null;
        try {
            const arrayOrdersWrong = await base44.asServiceRole.entities.Order.filter({
                ...baseFilter,
                coupon_codes: { $contains: code },
            });
            wrongOpCount = (arrayOrdersWrong || []).length;
            if (wrongOpCount > 0) {
                warnings.push(`UNEXPECTED: $contains returned ${wrongOpCount} results — this operator may be supported after all, or is aliased to $all. Verify manually.`);
            }
        } catch (e) {
            wrongOpError = e.message || String(e);
            warnings.push(`$contains threw an error: "${wrongOpError}" — confirms it is unsupported (explicit failure is better than silent zero).`);
        }

        // ── Probe 4: Deduplicated union ───────────────────────────────────────
        const allIds = new Set();
        for (const o of (legacyOrders || [])) allIds.add(o.id);
        for (const o of (arrayOrdersAll || [])) allIds.add(o.id);
        const deduplicatedCount = allIds.size;

        // ── Probe 5: Position breakdown ───────────────────────────────────────
        // Fetch ALL orders with coupon_codes present (array query) and check position
        const allArrayOrders = arrayOrdersAll || [];
        let pos1 = 0, pos2 = 0, pos3 = 0;
        for (const o of allArrayOrders) {
            const arr = Array.isArray(o.coupon_codes) ? o.coupon_codes : [];
            const idx = arr.indexOf(code);
            if (idx === 0) pos1++;
            else if (idx === 1) pos2++;
            else if (idx === 2) pos3++;
        }

        // ── Analysis and warnings ─────────────────────────────────────────────
        if (legacyCount === 0 && arrayCountAll === 0) {
            warnings.push(`No orders found for coupon "${code}". Provide a code with real order history to get meaningful probe results.`);
        }

        if (arrayCountAll === 0 && legacyCount > 0) {
            // Could be because all orders are legacy (no coupon_codes array), or $all is broken
            const legacyOnlyOrders = (legacyOrders || []).filter(o => !o.coupon_codes || o.coupon_codes.length === 0);
            const hasNewOrders = (legacyOrders || []).some(o => o.coupon_codes && o.coupon_codes.length > 0);
            if (hasNewOrders) {
                warnings.push(`CRITICAL: Legacy query found orders that have coupon_codes populated, but $all query returned 0. The $all operator may not be working correctly for this field.`);
            } else {
                warnings.push(`All existing orders use the legacy coupon_code field only (pre-stacking orders). This is expected if no stacked orders have been placed yet.`);
            }
        }

        if (pos2 > 0 || pos3 > 0) {
            // Positions 2/3 are populated — confirms stacking is in real use
            warnings.push(`INFO: Found ${pos2} order(s) with code at position 2 and ${pos3} at position 3 — stacked orders confirmed in production data.`);
        }

        if (deduplicatedCount < legacyCount + arrayCountAll) {
            const overlap = legacyCount + arrayCountAll - deduplicatedCount;
            warnings.push(`INFO: ${overlap} order(s) have both coupon_code and coupon_codes set (expected for new stacked orders). Deduplication is working correctly.`);
        }

        // ── Recommendation ────────────────────────────────────────────────────
        let recommendation = 'OK';
        if (warnings.some(w => w.startsWith('CRITICAL'))) {
            recommendation = 'CRITICAL: $all query is not returning expected results. Per-customer enforcement for coupon_codes array field is broken. Investigate DB field type and operator support.';
        } else if (wrongOpError === null && wrongOpCount === 0) {
            recommendation = '$contains silently returns 0 (confirmed unsupported). $all is the correct operator and appears to be working. No action needed.';
        } else if (wrongOpError !== null) {
            recommendation = '$contains throws an error (confirmed unsupported). $all is the correct operator. No action needed.';
        }

        console.log(`[PROBE] coupon="${code}" legacy=${legacyCount} array_all=${arrayCountAll} dedup=${deduplicatedCount} pos1=${pos1} pos2=${pos2} pos3=${pos3} wrong_op=${wrongOpCount}/${wrongOpError}`);

        return Response.json({
            probe_summary: {
                coupon_code: code,
                restaurant_filter: restaurant_id || 'none (all restaurants)',
                probed_at: new Date().toISOString(),
            },
            legacy_query_count: legacyCount,
            array_query_all_count: arrayCountAll,
            array_query_wrong_op_count: wrongOpCount,
            array_query_wrong_op_error: wrongOpError,
            deduplicated_count: deduplicatedCount,
            position_breakdown: { position_1: pos1, position_2: pos2, position_3: pos3 },
            warnings,
            recommendation,
        });

    } catch (error) {
        console.error('[PROBE] probeCouponArrayQuery error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});