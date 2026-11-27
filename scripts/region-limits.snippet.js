// region-limits:start
// SYNC RULE: server copy of the money limits in src/lib/region.js
// (managerDiscountMax, largeRefundFlag, aiCashLimit, loyaltySpendPerPoint,
// cashSignOffTolerance, cashMaxFloat) and the money prefix ("£" / "Rs "). Every copy must be identical to
// scripts/region-limits.snippet.js; scripts/check-region.mjs enforces it.
// No country, an unknown one, no restaurant or a failed lookup = the UK limits.
const REGION_LIMITS = {
    GB: { managerDiscountMax: 20, largeRefundFlag: 30, prefix: '£', aiCashLimit: 50, loyaltySpendPerPoint: 1, cashSignOffTolerance: 5, cashMaxFloat: 5000 },
    LK: { managerDiscountMax: 5000, largeRefundFlag: 10000, prefix: 'Rs ', aiCashLimit: 10000, loyaltySpendPerPoint: 100, cashSignOffTolerance: 500, cashMaxFloat: 500000 },
};
function regionLimits(restaurant) {
    const c = typeof restaurant?.country === 'string' ? restaurant.country.trim().toUpperCase() : '';
    return REGION_LIMITS[c] || REGION_LIMITS.GB;
}
async function restaurantForRegion(base44, restaurantId) {
    try {
        if (!restaurantId) return null;
        return (await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId }))?.[0] || null;
    } catch (_) {
        return null;
    }
}
// region-limits:end
