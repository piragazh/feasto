/**
 * pendingPayment — localStorage-based pending payment persistence with recovery tracking
 * =====================================================================================
 *
 * Written immediately when a PaymentIntent succeeds (before createOrder runs).
 * Read on checkout mount to detect interrupted payments.
 * Cleared on terminal outcomes: order_found, order_created, already_refunded, needs_review.
 *
 * Why localStorage (not sessionStorage):
 *   - localStorage persists across tab close and browser restarts.
 *   - This means recovery triggers even if the user reopens the browser after a crash.
 *   - A 24-hour TTL prevents stale records from accumulating.
 *   - sessionStorage was tab-scoped: a crash or new tab = silent loss.
 *
 * NOTE: The primary authoritative recovery source is now the OrderDraft entity in the DB,
 * written by createPaymentIntent before returning the clientSecret. This client-side record
 * is a convenience layer for fast same-session recovery; the webhook + OrderDraft path
 * handles cross-session/crash recovery server-side.
 *
 * FIX #7: User binding (HIGH-7 — cross-user recovery on shared devices)
 *   - Pending payments are now bound to the session user (email) or 'guest'.
 *   - read() verifies boundTo matches current user before returning the record.
 *   - Prevents User A's pending payment from firing recovery under User B's session
 *     on shared computers.
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
 *     expiresAt:       string,     // ISO timestamp — 24h TTL
 *     boundTo:         string,     // user email or 'guest' — validated on read()
 *     recovery_attempts: number,   // count of recovery replay attempts
 *     last_attempted_at: string,   // ISO timestamp of last recovery attempt
 *     recovery_status: string,     // 'replayable' | 'terminal_refunded' | 'terminal_manual_review' | 'terminal_invalid_payload'
 *   }
 */

import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'pending_payment_v2';
const MAX_RECOVERY_ATTEMPTS = 2;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const pendingPayment = {
    /**
     * Persist the pending payment immediately after PI succeeds.
     * Called BEFORE createOrder to ensure durability across reloads and tab closes.
     * FIX #7: Bind to current user to prevent cross-user recovery on shared devices.
     */
    async save(payload, currentUser = null) {
        try {
            // FIX #7: Determine bound user (email or 'guest')
            let boundTo = 'guest';
            if (currentUser) {
                boundTo = currentUser.email || 'guest';
            } else {
                try {
                    const user = await base44.auth.me();
                    boundTo = user.email || 'guest';
                } catch (_) {
                    // Not authenticated — will bind as 'guest'
                }
            }

            const now = new Date().toISOString();
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                ...payload,
                boundTo,
                savedAt: now,
                expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
                recovery_attempts: 0,
                last_attempted_at: null,
                recovery_status: 'replayable',
            }));
            console.log('[pendingPayment] saved pi=', payload.paymentIntentId, 'boundTo=', boundTo);
        } catch (e) {
            console.warn('[pendingPayment] save failed:', e.message);
        }
    },

    /**
     * Read the persisted pending payment (or null if none / expired / bound to different user).
     * FIX #7: Verify boundTo matches current user before returning.
     */
    async read(currentUser = null) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            // Sanity check: must have a valid PI ID
            if (!parsed?.paymentIntentId?.startsWith('pi_')) return null;
            // TTL check — discard expired records silently
            if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
                console.log('[pendingPayment] record expired, clearing');
                localStorage.removeItem(STORAGE_KEY);
                return null;
            }

            // FIX #7: Verify boundTo matches current user
            // CRIT-1 FIX: Don't re-fetch auth if currentUser was passed
            let currentBoundTo = 'guest';
            if (currentUser?.email) {
                currentBoundTo = currentUser.email;
            } else if (!currentUser) {
                try {
                    const user = await base44.auth.me();
                    currentBoundTo = user?.email || 'guest';
                } catch (_) {
                    // Not authenticated — assume 'guest'
                }
            }

            if (parsed.boundTo !== currentBoundTo) {
                console.warn('[pendingPayment] boundTo mismatch: stored=', parsed.boundTo, 'current=', currentBoundTo, '— clearing');
                localStorage.removeItem(STORAGE_KEY);
                return null;
            }

            return parsed;
        } catch (e) {
            console.warn('[pendingPayment] read failed:', e.message);
            return null;
        }
    },

    /**
     * Increment recovery attempt counter.
     * Return true if within limit; false if exceeded.
     * CRIT-7 FIX: Make async to properly await read()
     */
    async recordAttempt() {
        try {
            const current = await this.read();
            if (!current) return false;
            
            const attempts = (current.recovery_attempts || 0) + 1;
            const withinLimit = attempts <= MAX_RECOVERY_ATTEMPTS;
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
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
     */
    async setTerminalStatus(status) {
        try {
            const current = await this.read();
            if (!current) return;
            
            const validStatuses = ['terminal_refunded', 'terminal_manual_review', 'terminal_invalid_payload'];
            if (!validStatuses.includes(status)) {
                console.warn('[pendingPayment] invalid terminal status:', status);
                return;
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
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
     */
    clear() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            // Also clear any legacy sessionStorage record from v1
            sessionStorage.removeItem('pending_payment_v1');
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
     * False if: status is terminal, attempts exceeded, or record expired.
     * NOTE: Reads from raw localStorage synchronously (without boundTo check) for
     * fast startup validation before async user context is available.
     */
    isReplayable() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const record = JSON.parse(raw);
            if (!record?.paymentIntentId?.startsWith('pi_')) return false;
            if (record.expiresAt && new Date(record.expiresAt) < new Date()) return false;

            const isTerminal = record.recovery_status?.startsWith('terminal_');
            const exceedsLimit = (record.recovery_attempts || 0) >= MAX_RECOVERY_ATTEMPTS;

            return !isTerminal && !exceedsLimit;
        } catch (e) {
            return false;
        }
    },
};