// region-clock:start
// SYNC RULE: server copy of getRestaurantTimeZone (src/lib/region.js).
// Every copy must be identical to scripts/region-clock.snippet.js;
// scripts/check-region.mjs enforces it and compares it with region.js.
const REGION_CLOCK = { GB: 'Europe/London', LK: 'Asia/Colombo' };
function regionClockTz(restaurant) {
    const tz = typeof restaurant?.timezone === 'string' ? restaurant.timezone.trim() : '';
    if (tz && tz.toUpperCase() !== 'UTC') {
        try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return tz; } catch (_) { /* fall through */ }
    }
    const c = typeof restaurant?.country === 'string' ? restaurant.country.trim().toUpperCase() : '';
    return REGION_CLOCK[c] || 'Europe/London';
}
// region-clock:end
