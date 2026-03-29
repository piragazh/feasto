/**
 * checkoutRecovery — handles the result from recoverPayment backend call.
 *
 * Extracted from Checkout.jsx to keep it under the 2000-line limit and to
 * centralise all recovery-state transitions in one testable place.
 *
 * Returns: { orderPlaced: bool, recoveryError: string|null, clearPending: bool }
 */
import { pendingPayment } from '@/lib/pendingPayment.js';

/**
 * Process the response from recoverPayment and return the UI state to apply.
 *
 * @param {object} result  — response.data from recoverPayment invocation
 * @returns {{ orderPlaced: boolean, recoveryError: string|null }}
 */
export function handleRecoveryResult(result) {
    const status = result?.status;

    // ── Terminal success: order already exists or was just created ─────────────
    if (status === 'order_found' || status === 'order_created') {
        pendingPayment.clear();
        return { orderPlaced: true, recoveryError: null };
    }

    // ── Terminal: payment was refunded ─────────────────────────────────────────
    if (status === 'already_refunded') {
        pendingPayment.clear();
        return {
            orderPlaced: false,
            recoveryError: 'Your previous payment was refunded. Please place a new order.',
        };
    }

    // ── Terminal: ops team must intervene ─────────────────────────────────────
    if (status === 'needs_review') {
        pendingPayment.clear();
        return {
            orderPlaced: false,
            recoveryError: 'There was an issue with your previous payment. Our team has been notified. Please contact support.',
        };
    }

    // ── PI was never charged — safe to let the user retry from scratch ─────────
    if (status === 'payment_not_succeeded') {
        pendingPayment.clear();
        return { orderPlaced: false, recoveryError: null };
    }

    // ── Non-terminal recovery failure — enforce retry limit ────────────────────
    // recordAttempt() increments the counter and returns true while under the limit.
    const canRetry = pendingPayment.recordAttempt();
    if (!canRetry) {
        // Max attempts exhausted — escalate to terminal so we stop looping
        pendingPayment.setTerminalStatus('terminal_manual_review');
        return {
            orderPlaced: false,
            recoveryError:
                'We could not confirm your previous order after multiple attempts. ' +
                'Please check your orders page or contact support with your payment reference.',
        };
    }

    return {
        orderPlaced: false,
        recoveryError:
            result?.error ||
            'We could not confirm your previous order. Please check your orders page or contact support.',
    };
}