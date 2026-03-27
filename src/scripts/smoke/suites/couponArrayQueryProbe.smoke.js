/**
 * Smoke tests: coupon_codes array-field query behavior
 *
 * Verifies:
 *   1. probeCouponArrayQuery deploys and responds (even with no history)
 *   2. Wrong operator ($contains) is detected and surfaces 0 results, not an error
 *   3. Probe summary fields are all present in the response
 *   4. Admin-only gate is enforced
 *
 * These are structural smoke tests. A full live verification requires a real coupon
 * code with order history — run the probe manually via the dashboard after seeding.
 */

export const suite = {
    name: 'Coupon Array Query Probe',
    tests: [
        {
            name: 'admin can call probe with a dummy code and get structured response',
            async run({ invoke, adminToken }) {
                const res = await invoke('probeCouponArrayQuery', { coupon_code: 'SMOKE_TEST_CODE' }, adminToken);
                if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
                const body = res.body;
                const requiredKeys = [
                    'probe_summary', 'legacy_query_count', 'array_query_all_count',
                    'array_query_wrong_op_count', 'deduplicated_count',
                    'position_breakdown', 'warnings', 'recommendation'
                ];
                for (const key of requiredKeys) {
                    if (!(key in body)) throw new Error(`Missing key: ${key}`);
                }
                // No orders found for SMOKE_TEST_CODE — legacy and array counts must be 0
                if (body.legacy_query_count !== 0) throw new Error(`Expected legacy_count=0, got ${body.legacy_query_count}`);
                if (body.array_query_all_count !== 0) throw new Error(`Expected array_count=0, got ${body.array_query_all_count}`);
                if (body.deduplicated_count !== 0) throw new Error(`Expected dedup=0, got ${body.deduplicated_count}`);
            }
        },
        {
            name: 'probe detects $contains as unsupported (wrong_op_count=0 or wrong_op_error set)',
            async run({ invoke, adminToken }) {
                const res = await invoke('probeCouponArrayQuery', { coupon_code: 'SMOKE_TEST_CODE' }, adminToken);
                if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
                const body = res.body;
                // Either $contains silently returns 0, or it throws — both are acceptable
                const silentFail = body.array_query_wrong_op_count === 0 && body.array_query_wrong_op_error === null;
                const explicitFail = typeof body.array_query_wrong_op_error === 'string';
                if (!silentFail && !explicitFail) {
                    throw new Error(`$contains returned ${body.array_query_wrong_op_count} results without an error — may be unexpectedly supported. Check warnings.`);
                }
            }
        },
        {
            name: 'probe is admin-only: rejects unauthenticated requests',
            async run({ invoke }) {
                // No token = unauthenticated
                const res = await invoke('probeCouponArrayQuery', { coupon_code: 'TEST' }, null);
                if (res.status !== 401 && res.status !== 403) {
                    throw new Error(`Expected 401 or 403, got ${res.status}`);
                }
            }
        },
        {
            name: 'probe returns 400 when coupon_code is missing',
            async run({ invoke, adminToken }) {
                const res = await invoke('probeCouponArrayQuery', {}, adminToken);
                if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
            }
        },
    ],
};

/**
 * MANUAL VERIFICATION CHECKLIST
 * ─────────────────────────────────────────────────────────────────────────────
 * After placing real orders with stacked coupons in staging, run:
 *
 *   POST /probeCouponArrayQuery
 *   { "coupon_code": "<code that was used at positions 1, 2, and 3 in real orders>" }
 *
 * Expected results:
 *   ✓ legacy_query_count  = N  (orders where coupon_code == code, i.e. position 1)
 *   ✓ array_query_all_count = M (orders where coupon_codes $all [code], all positions)
 *   ✓ position_breakdown.position_2 > 0  (confirms position 2 lookup works)
 *   ✓ position_breakdown.position_3 > 0  (confirms position 3 lookup works)
 *   ✓ deduplicated_count == unique order count (no double-counting)
 *   ✓ array_query_wrong_op_count == 0  (confirms $contains is unsupported/silently ignored)
 *   ✓ recommendation does NOT contain "CRITICAL"
 *
 * If position_breakdown.position_2 == 0 despite real stacked orders existing:
 *   → $all query is broken. Escalate immediately — per-customer limits are unenforced
 *     for codes at positions 2 and 3.
 * ─────────────────────────────────────────────────────────────────────────────
 */