/**
 * Terminal Payment Audit & Logging
 * 
 * Provides centralized audit trail for all card terminal transactions.
 * Ensures every attempt (success/failure/timeout/cancel) is logged.
 */

import { base44 } from '@/api/base44Client';

/**
 * Log a new terminal transaction initiation
 * Called BEFORE sending to terminal
 * 
 * @param {object} params
 * @param {string} params.restaurantId
 * @param {string} params.terminalProvider (stripe|ingenico|square|mock)
 * @param {string} params.readerId
 * @param {string} params.readerLabel
 * @param {number} params.amountCents
 * @param {string} params.operatorEmail
 * @param {string} params.operatorName
 * @returns {Promise<object>} TerminalTransaction record
 */
export async function logTerminalTransactionInitiated({
    restaurantId,
    terminalProvider,
    readerId,
    readerLabel,
    amountCents,
    operatorEmail,
    operatorName,
}) {
    if (!restaurantId || !terminalProvider || !amountCents) {
        throw new Error('Missing required audit params: restaurantId, terminalProvider, amountCents');
    }

    const transaction = await base44.entities.TerminalTransaction.create({
        restaurant_id: restaurantId,
        terminal_provider: terminalProvider,
        reader_id: readerId,
        reader_label: readerLabel,
        transaction_id: '', // Will be filled by provider
        amount_cents: Math.round(amountCents),
        currency: 'GBP',
        status: 'initiated',
        initiated_at: new Date().toISOString(),
        operator_email: operatorEmail,
        operator_name: operatorName,
    });

    return transaction;
}

/**
 * Log state change during terminal transaction
 * Called on every terminal state change
 * 
 * @param {object} params
 * @param {string} params.transactionId (TerminalTransaction.id)
 * @param {string} params.stateBefore
 * @param {string} params.stateAfter
 * @param {string} params.message
 * @param {object} params.metadata (provider-specific data)
 * @param {string} params.operatorEmail
 * @returns {Promise<object>} TerminalTransactionLog record
 */
export async function logTerminalStateChange({
    transactionId,
    stateBefore,
    stateAfter,
    message,
    metadata = {},
    operatorEmail,
}) {
    if (!transactionId || !stateBefore || !stateAfter) {
        throw new Error('Missing required params: transactionId, stateBefore, stateAfter');
    }

    const logEntry = await base44.entities.TerminalTransactionLog.create({
        terminal_transaction_id: transactionId,
        restaurant_id: '', // Will be populated server-side if needed
        event_type: 'state_change',
        state_before: stateBefore,
        state_after: stateAfter,
        message,
        metadata,
        logged_at: new Date().toISOString(),
        operator_email: operatorEmail,
    });

    return logEntry;
}

/**
 * Log terminal failure with reason
 * Called on DECLINED, FAILED, TIMEOUT, CANCELLED
 * 
 * @param {object} params
 * @param {string} params.transactionId (TerminalTransaction.id)
 * @param {string} params.failureReason (enum from schema)
 * @param {string} params.errorCode (provider error code)
 * @param {string} params.errorMessage (human-readable)
 * @param {string} params.operatorEmail
 * @returns {Promise<void>}
 */
export async function logTerminalFailure({
    transactionId,
    failureReason,
    errorCode,
    errorMessage,
    operatorEmail,
}) {
    if (!transactionId || !failureReason) {
        throw new Error('Missing required params: transactionId, failureReason');
    }

    // Update main transaction record
    await base44.entities.TerminalTransaction.update(transactionId, {
        failure_reason: failureReason,
        error_code: errorCode,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
    });

    // Log detailed failure event
    await base44.entities.TerminalTransactionLog.create({
        terminal_transaction_id: transactionId,
        event_type: 'error',
        message: `Terminal failure: ${failureReason}`,
        metadata: {
            error_code: errorCode,
            error_message: errorMessage,
        },
        logged_at: new Date().toISOString(),
        operator_email: operatorEmail,
    });
}

/**
 * Log terminal authorization (success)
 * Called when AUTHORIZED state reached
 * 
 * @param {object} params
 * @param {string} params.transactionId (TerminalTransaction.id)
 * @param {string} params.providerTransactionId (e.g., payment_intent ID)
 * @param {string} params.operatorEmail
 * @returns {Promise<void>}
 */
export async function logTerminalAuthorized({
    transactionId,
    providerTransactionId,
    operatorEmail,
}) {
    if (!transactionId) {
        throw new Error('Missing required param: transactionId');
    }

    const now = new Date();
    const transaction = await base44.entities.TerminalTransaction.get(transactionId);
    
    const durationSeconds = Math.round((now - new Date(transaction.initiated_at)) / 1000);

    // Update transaction record with success details
    await base44.entities.TerminalTransaction.update(transactionId, {
        transaction_id: providerTransactionId,
        status: 'authorized',
        completed_at: now.toISOString(),
        duration_seconds: durationSeconds,
    });

    // Log success event
    await base44.entities.TerminalTransactionLog.create({
        terminal_transaction_id: transactionId,
        event_type: 'state_change',
        state_before: 'processing',
        state_after: 'authorized',
        message: 'Payment authorized by terminal',
        metadata: {
            provider_transaction_id: providerTransactionId,
            duration_seconds: durationSeconds,
        },
        logged_at: now.toISOString(),
        operator_email: operatorEmail,
    });
}

/**
 * Log retry attempt
 * 
 * @param {object} params
 * @param {string} params.transactionId (TerminalTransaction.id)
 * @param {number} params.retryAttempt (1, 2, 3, ...)
 * @param {string} params.operatorEmail
 * @returns {Promise<void>}
 */
export async function logTerminalRetry({
    transactionId,
    retryAttempt,
    operatorEmail,
}) {
    await base44.entities.TerminalTransactionLog.create({
        terminal_transaction_id: transactionId,
        event_type: 'retry',
        message: `Retry attempt #${retryAttempt}`,
        metadata: {
            attempt_number: retryAttempt,
        },
        logged_at: new Date().toISOString(),
        operator_email: operatorEmail,
    });
}

/**
 * Link transaction to order after order creation
 * Called after order is successfully created
 * 
 * @param {string} transactionId (TerminalTransaction.id)
 * @param {string} orderId (Order.id)
 * @returns {Promise<void>}
 */
export async function linkTransactionToOrder(transactionId, orderId) {
    await base44.entities.TerminalTransaction.update(transactionId, {
        order_id: orderId,
    });
}

/**
 * Mark transaction as reconciled
 * 
 * @param {string} transactionId (TerminalTransaction.id)
 * @param {string} reconciliationNote (matched_to_order|orphaned|duplicate|mismatch)
 * @returns {Promise<void>}
 */
export async function markTransactionReconciled(transactionId, reconciliationNote) {
    await base44.entities.TerminalTransaction.update(transactionId, {
        reconciled: true,
        reconciled_at: new Date().toISOString(),
        reconciliation_note: reconciliationNote,
    });
}