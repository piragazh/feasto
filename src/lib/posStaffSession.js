/**
 * Staff session held on the till.
 *
 * Issued by posVerifyStaffPin on successful PIN entry and sent back with
 * privileged actions, so the server can establish WHO is acting rather than
 * trusting a staff_id in the request body — a client-supplied id could be
 * forged, which would make sales attribution and the audit trail worthless.
 *
 * Stored per restaurant. An operator may run several of their restaurants from
 * the same device, and a shared key would carry one site's staff session onto
 * another's till.
 *
 * This is a short-lived operator token, not the till's own credential — the
 * till stays authenticated to Base44 separately. Losing this only means the
 * next privileged action needs a fresh PIN.
 */

const key = (restaurantId) => `pos_staff_session:${restaurantId || 'unknown'}`;

export function saveStaffSession(restaurantId, session, expiresAt, staff) {
    if (!session) return;
    try {
        localStorage.setItem(key(restaurantId), JSON.stringify({
            session,
            expires: expiresAt,
            staff_id: staff?.id,
            staff_name: staff?.full_name,
            role: staff?.role,
        }));
    } catch { /* storage unavailable - the session simply won't persist a reload */ }
}

export function readStaffSession(restaurantId) {
    try {
        const raw = localStorage.getItem(key(restaurantId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Expired tokens are dropped here as well as rejected server-side, so
        // the UI doesn't show someone as logged in when they effectively aren't.
        if (parsed.expires && new Date(parsed.expires) < new Date()) {
            clearStaffSession(restaurantId);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

/** The raw token to send with a request, or undefined if there isn't a valid one. */
export function getStaffSessionToken(restaurantId) {
    return readStaffSession(restaurantId)?.session || undefined;
}

export function clearStaffSession(restaurantId) {
    try { localStorage.removeItem(key(restaurantId)); } catch { /* ignore */ }
}
