/**
 * Payment Integrity Guards
 * 
 * Provides atomic refs and state guards for preventing:
 * - Double-click submit
 * - Double-confirm (card + express checkout)
 * - Recovery retry duplicates
 * 
 * These must be module-level or page-level refs to survive component remounts.
 */

export class PaymentIntegrityGuards {
    constructor() {
        // Terminal flags (never reset after becoming true)
        this.paymentHandledRef = { current: false };  // Payment processed, period
        this.paymentSuccessHandledRef = { current: false };  // Success callback fired
        
        // In-flight guard (reset after operation completes)
        this.confirmInFlightRef = { current: false };  // Confirm/submit currently executing
        
        // Session tracking
        this.lastSessionKey = null;
        this.sessionKeyChangedAt = null;
    }

    /**
     * Check if payment has already been processed
     */
    isPaymentTerminal() {
        return this.paymentHandledRef.current;
    }

    /**
     * Check if confirmation is already in-flight
     */
    isConfirmInFlight() {
        return this.confirmInFlightRef.current;
    }

    /**
     * Start a confirmation operation
     * Returns true if allowed, false if already in-flight or terminal
     */
    startConfirm() {
        if (this.paymentHandledRef.current) {
            console.warn('[PaymentIntegrityGuards] Payment already handled — skipping new operation');
            return false;
        }
        if (this.confirmInFlightRef.current) {
            console.warn('[PaymentIntegrityGuards] Confirm already in-flight');
            return false;
        }
        this.confirmInFlightRef.current = true;
        return true;
    }

    /**
     * Mark payment as successfully processed (terminal)
     * After this, no further payment attempts are allowed
     */
    markPaymentSuccessful() {
        this.paymentHandledRef.current = true;  // TERMINAL
        this.paymentSuccessHandledRef.current = true;
        this.confirmInFlightRef.current = false;
    }

    /**
     * End the current confirm operation without success
     * Allows retry, but doesn't mark as terminal
     */
    endConfirmFailed() {
        this.confirmInFlightRef.current = false;
    }

    /**
     * Track session key changes
     * If key rotates, reset in-flight flag but maintain terminal flag
     */
    onSessionKeyChange(newKey) {
        if (newKey !== this.lastSessionKey) {
            console.log(`[PaymentIntegrityGuards] Session key rotated ${this.lastSessionKey} → ${newKey}`);
            this.lastSessionKey = newKey;
            this.sessionKeyChangedAt = Date.now();
            
            // Reset in-flight but NOT terminal flag
            // Terminal flag survives session rotation
            this.confirmInFlightRef.current = false;
        }
    }

    /**
     * Reset for recovery flow
     * Called when pendingPayment is detected on reload
     */
    resetForRecovery() {
        console.log('[PaymentIntegrityGuards] Resetting for recovery flow');
        this.confirmInFlightRef.current = false;
        this.paymentSuccessHandledRef.current = false;
        // DO NOT reset paymentHandledRef — recovery should not allow new payments
    }

    /**
     * Full reset (only on successful order placement)
     */
    fullReset() {
        this.paymentHandledRef.current = false;
        this.paymentSuccessHandledRef.current = false;
        this.confirmInFlightRef.current = false;
        this.lastSessionKey = null;
        this.sessionKeyChangedAt = null;
    }
}

// Singleton instance
export const paymentGuards = new PaymentIntegrityGuards();