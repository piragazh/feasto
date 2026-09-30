/**
 * One definition of screen health, used by every dashboard.
 * (base44/functions/checkScreenHealth uses the same factors — keep in sync.)
 *
 *   online   last check-in within 2 × heartbeat interval
 *   warning  within 5 × interval
 *   offline  longer, or never checked in
 */
export const ONLINE_FACTOR = 2;
export const WARNING_FACTOR = 5;

export function getScreenHealth(screen, now = Date.now()) {
    if (!screen?.last_heartbeat) return 'offline';
    const last = new Date(screen.last_heartbeat).getTime();
    if (!Number.isFinite(last)) return 'offline';
    const interval = Number(screen.heartbeat_interval) || 60;
    const seconds = (now - last) / 1000;
    if (seconds <= interval * ONLINE_FACTOR) return 'online';
    if (seconds <= interval * WARNING_FACTOR) return 'warning';
    return 'offline';
}

export function isPairedScreen(screen) {
    return !!screen?.screen_info?.paired;
}

/** Friendly error text from a failed base44.functions.invoke call */
export function functionErrorMessage(error, fallback = 'Something went wrong') {
    return error?.response?.data?.error || error?.data?.error || error?.message || fallback;
}
