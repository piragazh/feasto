/**
 * Uber Eats connect - carrying the request across a domain change and a login.
 *
 * Uber sends the manager back to ONE fixed address after sign-in (the redirect
 * URI registered with Uber), which lives on the main MealDrop domain. A manager
 * working on a restaurant's own custom domain has no session there, so they used
 * to land back signed out and the connection never finished.
 *
 * The fix keeps the whole Uber step on the main domain:
 *
 *   custom domain: "Connect with Uber Eats"
 *     -> main domain /RestaurantDashboard?restaurantId=..&uber_connect=1
 *     -> (sign in there once, if not already)
 *     -> Uber sign-in -> back to the main domain -> pick store -> done
 *
 * The connection is saved against the restaurant on the server, so it shows as
 * connected on the custom domain as well.
 *
 * Why not simply forward Uber's code back to the custom domain? Because the
 * check that makes this safe - "the person finishing is the signed-in person who
 * started" - only holds within one origin. Passing the code to another domain
 * would hand it to whoever controls that domain.
 *
 * The login redirect keeps only the path, not the query string, so the request
 * is parked in sessionStorage (per tab, per origin) until the page is back.
 */
const KEY = 'uberConnectIntent';
const TTL_MS = 15 * 60_000;

/** Call during the first render of the dashboard page, BEFORE any auth redirect. */
export function captureUberConnectIntent() {
    try {
        const params = new URLSearchParams(window.location.search);
        const restaurantId = params.get('restaurantId');
        if (params.get('uber_connect') === '1' && restaurantId) {
            sessionStorage.setItem(KEY, JSON.stringify({ r: restaurantId, t: Date.now() }));
        }
    } catch { /* storage unavailable - the manager can still press Connect by hand */ }
}

/** The parked request, if there is a fresh one. Does not remove it. */
export function peekUberConnectIntent() {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const intent = JSON.parse(raw);
        if (!intent?.r || Date.now() - Number(intent.t || 0) > TTL_MS) {
            sessionStorage.removeItem(KEY);
            return null;
        }
        return intent;
    } catch { return null; }
}

/** Take the parked request for this restaurant - once. Returns true if there was one. */
export function takeUberConnectIntent(restaurantId) {
    const intent = peekUberConnectIntent();
    if (!intent || intent.r !== restaurantId) return false;
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    return true;
}
