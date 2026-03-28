/**
 * pendingPayment — sessionStorage-based pending payment persistence with recovery tracking
 * =====================================================================================
 *
 * Written immediately when a PaymentIntent succeeds (before createOrder runs).
 * Read on checkout mount to detect interrupted payments.
 * Cleared on terminal outcomes: order_found, order_created, already_refunded, needs_review.
 *
 * Why sessionStorage not localStorage:
 *   - sessionStorage is tab-scoped: a new tab won't see another tab's pending payment
 *   - Cleared automatically when the browser session ends (unlike localStorage)
 *   - Sufficient durability: we only need to survive a page reload in the same tab
 *
 * Schema:
 *   {
 *     paymentIntentId: string,     // pi_xxx — used as dedup key
 *     idempotencyKey:  string,     // original session key for Order dedup
 *     total:           number,     // for display
 *     restaurantId:    string,
 *     restaurantName:  string,
 *     orderData:       object,     // full order payload for replay (validated+normalized)
 *     savedAt:         string,     // ISO timestamp when payment succeeded
 *     recovery_attempts: number,   // count of recovery replay attempts
 *     last_attempted_at: string,   // ISO timestamp of last recovery attempt
 *     recovery_status: string,     // 'replayable' | 'terminal_refunded' | 'terminal_manual_review' | 'terminal_invalid_payload'
 *   }
 */

const STORAGE_KEY = 'pending_payment_v1';
const MAX_RECOVERY_ATTEMPTS = 2;

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
                recovery_attempts: 0,
                last_attempted_at: null,
                recovery_status: 'replayable',
            }));
            console.log('[pendingPayment] saved pi=', payload.paymentIntentId);
        } catch (e) {
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
     * Increment recovery attempt counter.
     * Return true if within limit; false if exceeded.
     */
    recordAttempt() {
        try {
            const current = this.read();
            if (!current) return false;
            
            const attempts = (current.recovery_attempts || 0) + 1;
            const withinLimit = attempts <= MAX_RECOVERY_ATTEMPTS;
            
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                ...current,
                recovery_attempts: attempts,
                last_attempted_at: new Date().toISOString(),
            }));
            
            console.log('[pendingPayment] recorded attempt', attempts, 'of', MAX_RECOVERY_ATTEMPTS);
            return withinLimit;
        } catch (e) {
            console.warn('[pendingPayment] recordAttempt failed:', e.message);
            return false;
        }
    },

    /**
     * Update recovery status to terminal state.
     * Used to mark when recovery should stop being attempted.
     */
    setTerminalStatus(status) {
        try {
            const current = this.read();
            if (!current) return;
            
            const validStatuses = ['terminal_refunded', 'terminal_manual_review', 'terminal_invalid_payload'];
            if (!validStatuses.includes(status)) {
                console.warn('[pendingPayment] invalid terminal status:', status);
                return;
            }
            
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                ...current,
                recovery_status: status,
            }));
            
            console.log('[pendingPayment] set terminal status:', status);
        } catch (e) {
            console.warn('[pendingPayment] setTerminalStatus failed:', e.message);
        }
    },

    /**
     * Clear after confirmed order creation or terminal outcome.
     * Called when: order_found, order_created, already_refunded, needs_review, or max attempts exceeded.
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

    /**
     * Check if recovery should be attempted.
     * False if: status is terminal, or attempts exceeded.
     */
    isReplayable() {
        const record = this.read();
        if (!record) return false;
        
        const isTerminal = record.recovery_status?.startsWith('terminal_');
        const exceedsLimit = (record.recovery_attempts || 0) >= MAX_RECOVERY_ATTEMPTS;
        
        return !isTerminal && !exceedsLimit;
    },
};