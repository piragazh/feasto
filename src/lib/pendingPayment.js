/**
 * pendingPayment — sessionStorage-based pending payment persistence
 * =================================================================
 *
 * Written immediately when a PaymentIntent succeeds (before createOrder runs).
 * Read on checkout mount to detect interrupted payments.
 * Cleared only after confirmed order creation.
 *
 * Why sessionStorage not localStorage:
 *   - sessionStorage is tab-scoped: a new tab won't see another tab's pending payment
 *   - Cleared automatically when the browser session ends (unlike localStorage)
 *   - Sufficient durability: we only need to survive a page reload in the same tab
 *
 * Schema:
 *   {
 *     paymentIntentId: string,   // pi_xxx — used as dedup key
 *     idempotencyKey:  string,   // original session key for Order dedup
 *     total:           number,   // for display
 *     restaurantId:    string,
 *     restaurantName:  string,
 *     orderData:       object,   // full order payload for replay
 *     savedAt:         string,   // ISO timestamp
 *   }
 */

const STORAGE_KEY = 'pending_payment_v1';

export const pendingPayment = {
    /**
     * Persist the pending payment immediately after PI succeeds.
     * Called BEFORE createOrder to ensure durability across reloads.
     */
    save(payload) {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                ...payload,
                savedAt: new Date().toISOString(),
            }));
            console.log('[pendingPayment] saved pi=', payload.paymentIntentId);
        } catch (e) {
            // sessionStorage may be unavailable (private mode quota etc.) — non-fatal
            console.warn('[pendingPayment] save failed:', e.message);
        }
    },

    /**
     * Read the persisted pending payment (or null if none).
     */
    read() {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            // Sanity check: must have a valid PI ID
            if (!parsed?.paymentIntentId?.startsWith('pi_')) return null;
            return parsed;
        } catch (e) {
            console.warn('[pendingPayment] read failed:', e.message);
            return null;
        }
    },

    /**
     * Clear after confirmed order creation. Call this once you have an order_id.
     */
    clear() {
        try {
            sessionStorage.removeItem(STORAGE_KEY);
            console.log('[pendingPayment] cleared');
        } catch (e) {
            console.warn('[pendingPayment] clear failed:', e.message);
        }
    },

    /**
     * Returns true if a pending payment exists that is NOT yet resolved.
     */
    hasPending() {
        return this.read() !== null;
    },
};