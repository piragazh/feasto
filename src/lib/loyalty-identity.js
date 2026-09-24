/**
 * src/lib/loyalty-identity.js
 * ===========================
 * TESTED source of truth for identifying a loyalty customer by phone number.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Points were AWARDED with one normalisation and LOOKED UP with another. A
 * customer who typed "+44 7123 456789" earned points under 07123456789 and was
 * then told they had none. A number saved as "0044 7123..." started a second,
 * separate balance.
 *
 * A phone number is the customer's identity here, so every place that touches
 * it must agree exactly. One function, one rule, mirrored into the backend
 * functions with a parity check.
 *
 * SYNC RULE: mirrored in functions/awardLoyaltyPoints, getGuestLoyaltyPoints and
 * redeemReward. scripts/check-loyalty-identity.mjs executes them side by side.
 */

/**
 * A UK mobile or landline in any of the ways people actually write it, reduced
 * to one canonical form: 0 followed by the national number.
 *
 *   07123456789, 07123 456789, (07123) 456-789,
 *   +447123456789, 447123456789, 00447123456789   →  07123456789
 *
 * A number that isn't recognisably UK keeps its digits, so international
 * customers still get a stable key rather than being merged together.
 * Returns '' for anything too short to be a phone number.
 */
export function normalizeUkPhone(phone) {
    let digits = String(phone ?? '').replace(/\D/g, '');
    if (!digits) return '';

    // International dialling prefix, e.g. 0044…
    if (digits.startsWith('00')) digits = digits.slice(2);

    // UK country code in any remaining form, e.g. 447123456789
    if (digits.startsWith('44') && digits.length >= 11) {
        digits = '0' + digits.slice(2);
    }

    // A UK national number without its leading 0, e.g. 7123456789
    if (digits.length === 10 && digits.startsWith('7')) {
        digits = '0' + digits;
    }

    // Too short to be real - treat as no number rather than inventing a key
    // that several different customers could collide on.
    return digits.length >= 9 ? digits : '';
}

/** The key a phone-identified balance is stored under. */
export function phoneLoyaltyKey(phone) {
    const n = normalizeUkPhone(phone);
    return n ? `phone:${n}` : null;
}

/**
 * Which loyalty balance an order belongs to.
 *
 * A signed-in customer is keyed by their account, so their history stays with
 * the account they can log into. Everyone else is keyed by phone.
 *
 * NOTE: someone who sometimes signs in and sometimes checks out as a guest
 * therefore builds up TWO balances. Merging them is a deliberate decision with
 * real consequences (whose points, which restaurant, who asked for it), so it
 * is surfaced by mergeCandidate() rather than done silently.
 */
export function loyaltyIdentifier(order) {
    const account = order?.created_by;
    if (account && account !== 'anonymous') {
        return { type: 'email', key: account };
    }
    const key = phoneLoyaltyKey(order?.phone ?? order?.customer_phone ?? order?.guest_phone);
    return key ? { type: 'phone', key } : null;
}

/**
 * Does this order suggest an account balance and a phone balance are the same
 * person? Used to offer a merge, never to perform one automatically.
 */
export function mergeCandidate(order) {
    const account = order?.created_by;
    const key = phoneLoyaltyKey(order?.phone ?? order?.customer_phone);
    return (account && account !== 'anonymous' && key)
        ? { accountKey: account, phoneKey: key }
        : null;
}
