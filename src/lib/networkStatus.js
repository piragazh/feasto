/**
 * Network-failure detection for POS resilience.
 *
 * Why this exists: `navigator.onLine` is not a connectivity check. It only
 * reports whether the device has *a network interface up* — it stays `true`
 * when the restaurant's WiFi/router is fine but the internet connection (or
 * our backend) is down. That is the most common real-world outage in a busy
 * restaurant: the ISP drops, the router keeps serving DHCP, and every POS
 * device still believes it is online.
 *
 * Any POS write path that relies solely on `navigator.onLine` will therefore
 * take the "online" branch during an outage, throw, and lose the order — after
 * the customer has already paid. Every such path should instead treat a
 * network-level failure as "go offline and queue", using isNetworkError().
 */

/**
 * True if the error looks like a connectivity/transport failure rather than a
 * deliberate rejection from the server (validation, auth, tenant check, 4xx).
 *
 * We deliberately do NOT treat server-issued 4xx responses as network errors:
 * queueing an order the server has already refused would just replay the same
 * rejection on every future sync attempt.
 */
export function isNetworkError(err) {
    if (!err) return false;

    // Explicit offline signal
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

    const name = err.name || '';
    const msg = (err.message || String(err)).toLowerCase();

    // fetch() transport failures / aborts / timeouts
    if (name === 'TypeError' && msg.includes('fetch')) return true;
    if (name === 'AbortError' || name === 'TimeoutError') return true;

    if (
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('network error') ||
        msg.includes('network request failed') ||
        msg.includes('load failed') ||
        msg.includes('connection refused') ||
        msg.includes('err_internet_disconnected') ||
        msg.includes('err_network') ||
        msg.includes('err_connection') ||
        msg.includes('err_name_not_resolved') ||
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.includes('socket hang up') ||
        msg.includes('gateway') ||
        msg.includes('service unavailable')
    ) {
        return true;
    }

    // Upstream/infra HTTP statuses — the request never got a real answer from
    // application code, so retrying later is the right move.
    const status = err.status || err.statusCode || err.response?.status;
    if (status === 408 || status === 502 || status === 503 || status === 504) return true;

    return false;
}

/**
 * Verifies the backend is genuinely reachable, rather than trusting
 * navigator.onLine. Use for status indicators and before actions that must
 * not silently half-complete.
 *
 * Returns true/false; never throws.
 */
export async function checkBackendReachable(timeoutMs = 5000) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        // Same-origin, cache-busted, tiny response. HEAD keeps it cheap.
        await fetch(`/favicon.ico?_probe=${Date.now()}`, {
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal,
        });
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}
