/**
 * kioskDeviceBinding — Device-local restaurant binding
 *
 * BINDING PRIORITY:
 *   1. localStorage['kiosk_bound_restaurant_id']  ← authoritative for production
 *   2. URL ?restaurant_id= param                  ← used ONLY if no binding exists (first setup)
 *
 * A bound device ignores the URL param entirely during normal operation.
 * Only an authenticated admin action (via KioskAdminPanel) can change the binding.
 */

const STORAGE_KEY = 'kiosk_bound_restaurant_id';
const BINDING_META_KEY = 'kiosk_binding_meta';

/** Returns the bound restaurant ID, or null if device is unbound. */
export function getBoundRestaurantId() {
    try {
        return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
        return null;
    }
}

/** Returns binding metadata (who bound it, when). */
export function getBindingMeta() {
    try {
        const raw = localStorage.getItem(BINDING_META_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * Binds this device to a restaurant.
 * Called during first-time setup (from URL param) or admin rebind.
 * @param {string} restaurantId
 * @param {'url_setup'|'admin_rebind'} source
 */
export function bindDevice(restaurantId, source = 'url_setup') {
    try {
        localStorage.setItem(STORAGE_KEY, restaurantId);
        localStorage.setItem(BINDING_META_KEY, JSON.stringify({
            restaurant_id: restaurantId,
            bound_at: new Date().toISOString(),
            source,
        }));
    } catch (e) {
        console.error('[KioskBinding] Failed to persist binding:', e);
    }
}

/** Removes the device binding (admin only — clears to unconfigured state). */
export function unbindDevice() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(BINDING_META_KEY);
    } catch (e) {
        console.error('[KioskBinding] Failed to remove binding:', e);
    }
}

/**
 * Resolves which restaurant ID to use on load.
 * URL param is only accepted for first-time setup (no existing binding).
 * Returns { restaurantId, isNewBinding } 
 */
export function resolveRestaurantId() {
    const bound = getBoundRestaurantId();
    if (bound) {
        return { restaurantId: bound, isNewBinding: false };
    }

    // No binding — check URL for first-time setup
    try {
        const params = new URLSearchParams(window.location.search);
        const urlId = params.get('restaurant_id') || params.get('restaurantId');
        if (urlId) {
            bindDevice(urlId, 'url_setup');
            return { restaurantId: urlId, isNewBinding: true };
        }
    } catch {
        // ignore
    }

    return { restaurantId: null, isNewBinding: false };
}