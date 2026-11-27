// region-card:start
// SYNC RULE: server copy of cardProvider in src/lib/region.js. Every copy must
// be identical to scripts/region-card.snippet.js; scripts/check-region.mjs
// enforces it. A country with null has no card provider yet (cash / pay at the
// shop only). No country, an unknown one or no restaurant = GB, as before.
const REGION_CARD = { GB: 'stripe', LK: null };
function regionCardProvider(restaurant) {
    const c = typeof restaurant?.country === 'string' ? restaurant.country.trim().toUpperCase() : '';
    return Object.prototype.hasOwnProperty.call(REGION_CARD, c) ? REGION_CARD[c] : REGION_CARD.GB;
}
// region-card:end
