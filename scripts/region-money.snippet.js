// region-money:start
// SYNC RULE: server copy of formatMoney (src/lib/money.js). Every copy must be
// identical to scripts/region-money.snippet.js; scripts/check-region.mjs
// enforces it and compares the answers with money.js. GB text is exactly the
// old `£${x.toFixed(2)}`; other countries: "Rs 1,250.00".
const REGION_MONEY = { GB: { symbol: '£', locale: 'en-GB', decimals: 2 }, LK: { symbol: 'Rs', locale: 'en-LK', decimals: 2 } };
function regionMoney(amount, restaurantOrCountry) {
    const raw = typeof restaurantOrCountry === 'string' ? restaurantOrCountry : restaurantOrCountry?.country;
    const c = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    const r = REGION_MONEY[c] || REGION_MONEY.GB;
    if (r === REGION_MONEY.GB) return amount === null || amount === undefined ? '£' : `£${amount.toFixed(2)}`;
    if (amount === null || amount === undefined) return r.symbol;
    const n = Number(amount);
    const text = Number.isFinite(n) ? n.toLocaleString(r.locale, { minimumFractionDigits: r.decimals, maximumFractionDigits: r.decimals }) : String(amount);
    return `${r.symbol} ${text}`;
}
// region-money:end
