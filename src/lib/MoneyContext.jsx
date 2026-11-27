import React, { createContext, useContext, useMemo } from 'react';
import { formatMoney, currencySymbol, currencyCode } from './money.js';
import { normaliseCountry } from './region.js';

/**
 * Which restaurant's currency the screens inside show.
 *
 * A page that shows one restaurant (menu, checkout, kiosk, QR table, tracking)
 * wraps its content in <MoneyProvider restaurant={restaurant}>; any component
 * inside calls useMoney(). Outside a provider — and while the restaurant is
 * still loading — it is GB (£), exactly what every screen showed before.
 */
const MoneyContext = createContext('GB');

export function MoneyProvider({ restaurant, country, children }) {
    const code = normaliseCountry(country ?? restaurant?.country);
    return <MoneyContext.Provider value={code}>{children}</MoneyContext.Provider>;
}

/**
 * const { money, prefix, symbol, code } = useMoney();
 *   money(12.5)        -> "£12.50" (or "Rs 12.50" inside a Sri Lankan restaurant)
 *   `${prefix}${value}` -> "£15"    (or "Rs 15") for text that shows a raw value
 *   symbol             -> "£" / "Rs" for labels like "Price (£)"
 */
export function useMoney() {
    const country = useContext(MoneyContext);
    return useMemo(() => ({
        country,
        money: (amount) => formatMoney(amount, country),
        prefix: moneyPrefix(country),
        symbol: currencySymbol(country),
        code: currencyCode(country),
    }), [country]);
}

/** What goes in front of a raw number: "£" in the UK (unchanged), "Rs " in Sri Lanka. */
export function moneyPrefix(country) {
    const s = currencySymbol(country);
    return s === '£' ? s : `${s} `;
}
