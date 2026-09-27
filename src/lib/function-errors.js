/**
 * Turning a failed request into a message a person can act on.
 *
 * base44.functions.invoke (and entity calls) THROW on any non-2xx. SDK 0.8.x
 * wraps the failure in a Base44Error: the response body is on err.data - NOT
 * err.response.data, which is undefined - and err.message is either the body's
 * message/detail or axios's own "Request failed with status code 400".
 *
 * Code that read err.response.data.error always got undefined, then fell back
 * to err.message, so staff saw "Request failed with status code 400" instead
 * of "Order already confirmed". Tested against the real SDK client in
 * __tests__/function-errors.test.js.
 */

const bodiesOf = (err) => [err?.data, err?.originalError?.response?.data, err?.response?.data];
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The body's explicit `error` - the only text a function writes for people to read. */
function explicitError(err) {
    for (const b of bodiesOf(err)) {
        const e = text(b?.error) || text(b?.error?.message);
        if (e) return e;
    }
    return null;
}

/**
 * For CUSTOMERS (kiosk, online). Only a reason a function explicitly returned
 * as `error`; anything else - a crash, a network drop, platform text - gets the
 * friendly fallback. A customer should never read "status code 500".
 */
export function functionErrorMessage(err, fallback) {
    return explicitError(err) || fallback;
}

// Transport noise from axios / fetch / the browser - true, but useless to staff.
const TRANSPORT = [
    /^Request failed with status code \d+$/i,
    /^Network Error$/i,
    /^timeout of \d+ms exceeded$/i,
    /^Failed to fetch$/i,
    /^Load failed$/i,
    /^NetworkError when attempting to fetch resource\.?$/i,
    /^canceled$/i,
];

/**
 * For STAFF screens. The function's reason if it gave one; else the platform's
 * body message (e.g. an entity validation error); else the error's own message
 * when it is ours (`throw new Error("Role 'x' cannot confirm payments")`);
 * else the fallback. Transport noise is never shown.
 */
export function staffErrorMessage(err, fallback) {
    const explicit = explicitError(err);
    if (explicit) return explicit;
    for (const b of bodiesOf(err)) {
        const m = text(b?.message) || text(b?.detail);
        if (m && !TRANSPORT.some(re => re.test(m))) return m;
    }
    const own = text(err?.message);
    if (own && !TRANSPORT.some(re => re.test(own))) return own;
    return fallback;
}
