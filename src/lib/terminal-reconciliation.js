/**
 * Terminal Transaction Reconciliation
 * 
 * Detects mismatches between terminal transactions and orders:
 * - Orphaned transactions (no matching order)
 * - Missing transactions (order exists, no terminal transaction)
 * - Duplicates (multiple transactions for same order)
 * - Amount mismatches
 */

/**
 * Reconcile a single transaction against orders
 * 
 * @param {object} transaction (TerminalTransaction record)
 * @param {array} allOrders (all Order records from restaurant)
 * @returns {object} reconciliation result
 */
export function reconcileTransaction(transaction, allOrders = []) {
    const {
        id: transactionId,
        order_id: linkedOrderId,
        amount_cents: transactionAmount,
        status: transactionStatus,
        created_date: transactionCreatedDate,
    } = transaction;

    // Only reconcile authorized/completed transactions
    if (transactionStatus !== 'authorized') {
        return {
            transaction_id: transactionId,
            status: 'skipped',
            reason: `Transaction status is ${transactionStatus}, not authorized`,
        };
    }

    // Already reconciled?
    if (transaction.reconciled) {
        return {
            transaction_id: transactionId,
            status: 'already_reconciled',
            note: transaction.reconciliation_note,
        };
    }

    // ──────────────────────────────────────────────────────────────
    // 1. Check if linked_order_id exists and amount matches
    // ──────────────────────────────────────────────────────────────
    if (linkedOrderId) {
        const linkedOrder = allOrders.find(o => o.id === linkedOrderId);

        if (!linkedOrder) {
            // Transaction claims to be linked, but order doesn't exist
            return {
                transaction_id: transactionId,
                status: 'error',
                reason: 'orphaned_link',
                message: `Transaction linked to order ${linkedOrderId}, but order not found`,
                severity: 'warning',
            };
        }

        // Convert order total to cents for comparison
        const orderTotalCents = Math.round(linkedOrder.total * 100);

        if (Math.abs(transactionAmount - orderTotalCents) > 1) {
            // Allow ±1 cent due to rounding
            return {
                transaction_id: transactionId,
                status: 'error',
                reason: 'amount_mismatch',
                message: `Transaction £${(transactionAmount / 100).toFixed(2)} vs Order £${(orderTotalCents / 100).toFixed(2)}`,
                transaction_amount: transactionAmount,
                order_amount: orderTotalCents,
                delta_cents: transactionAmount - orderTotalCents,
                severity: 'critical',
            };
        }

        // ✅ All checks passed
        return {
            transaction_id: transactionId,
            status: 'matched',
            order_id: linkedOrderId,
            message: 'Transaction matched to linked order',
        };
    }

    // ──────────────────────────────────────────────────────────────
    // 2. No linked order — search by amount + timestamp + status
    // ──────────────────────────────────────────────────────────────
    const txnTime = new Date(transactionCreatedDate);
    const searchWindowMinutes = 5; // Orders within ±5 minutes

    const candidateOrders = allOrders.filter(order => {
        if (order.payment_method !== 'card') return false;
        if (order.status === 'cancelled') return false;

        const orderTotalCents = Math.round(order.total * 100);
        if (Math.abs(transactionAmount - orderTotalCents) > 1) return false; // ±1 cent tolerance

        const orderTime = new Date(order.created_date);
        const diffMinutes = Math.abs((txnTime - orderTime) / (1000 * 60));
        if (diffMinutes > searchWindowMinutes) return false;

        return true;
    });

    if (candidateOrders.length === 0) {
        // No matching order found — orphaned transaction
        return {
            transaction_id: transactionId,
            status: 'orphaned',
            reason: 'no_matching_order',
            message: `£${(transactionAmount / 100).toFixed(2)} authorized but no matching order within ±${searchWindowMinutes}min`,
            amount: transactionAmount,
            severity: 'warning', // Operator may have created order offline
        };
    }

    if (candidateOrders.length === 1) {
        // Single match — auto-link
        return {
            transaction_id: transactionId,
            status: 'matched',
            order_id: candidateOrders[0].id,
            message: 'Transaction matched by amount + timestamp',
            auto_link: true,
        };
    }

    // ──────────────────────────────────────────────────────────────
    // 3. Multiple candidates — ambiguous, requires manual review
    // ──────────────────────────────────────────────────────────────
    return {
        transaction_id: transactionId,
        status: 'ambiguous',
        reason: 'multiple_candidates',
        message: `£${(transactionAmount / 100).toFixed(2)} matches ${candidateOrders.length} orders created near same time`,
        candidate_order_ids: candidateOrders.map(o => o.id),
        severity: 'warning',
        manual_review_required: true,
    };
}

/**
 * Batch reconcile all authorized transactions for a restaurant
 * 
 * @param {array} transactions (TerminalTransaction records)
 * @param {array} orders (Order records)
 * @returns {object} reconciliation report
 */
export function reconcileTransactions(transactions = [], orders = []) {
    const report = {
        timestamp: new Date().toISOString(),
        total_transactions: transactions.length,
        total_orders: orders.length,
        results: [],
        summary: {
            matched: 0,
            already_reconciled: 0,
            orphaned: 0,
            ambiguous: 0,
            errors: 0,
            skipped: 0,
        },
        issues: {
            orphaned: [],
            ambiguous: [],
            amount_mismatches: [],
            broken_links: [],
        },
    };

    transactions.forEach(tx => {
        const result = reconcileTransaction(tx, orders);
        report.results.push(result);

        // Track in summary
        if (result.status === 'matched') {
            report.summary.matched++;
        } else if (result.status === 'already_reconciled') {
            report.summary.already_reconciled++;
        } else if (result.status === 'orphaned') {
            report.summary.orphaned++;
            report.issues.orphaned.push({
                transaction_id: result.transaction_id,
                amount: result.amount,
                reason: result.reason,
            });
        } else if (result.status === 'ambiguous') {
            report.summary.ambiguous++;
            report.issues.ambiguous.push({
                transaction_id: result.transaction_id,
                candidates: result.candidate_order_ids,
            });
        } else if (result.status === 'error') {
            report.summary.errors++;
            if (result.reason === 'amount_mismatch') {
                report.issues.amount_mismatches.push({
                    transaction_id: result.transaction_id,
                    order_id: tx.order_id,
                    transaction_amount: result.transaction_amount,
                    order_amount: result.order_amount,
                    delta_cents: result.delta_cents,
                });
            } else if (result.reason === 'orphaned_link') {
                report.issues.broken_links.push({
                    transaction_id: result.transaction_id,
                    linked_order_id: tx.order_id,
                });
            }
        } else if (result.status === 'skipped') {
            report.summary.skipped++;
        }
    });

    return report;
}

/**
 * Detect duplicate authorizations
 * (same transaction provider ID or same amount within seconds)
 * 
 * @param {array} transactions (TerminalTransaction records)
 * @returns {array} duplicate groups
 */
export function detectDuplicates(transactions = []) {
    const duplicates = [];

    // 1. Find transactions with same provider transaction_id
    const byProviderId = {};
    transactions.forEach(tx => {
        if (!tx.transaction_id) return;
        if (!byProviderId[tx.transaction_id]) {
            byProviderId[tx.transaction_id] = [];
        }
        byProviderId[tx.transaction_id].push(tx);
    });

    Object.entries(byProviderId).forEach(([providerId, txns]) => {
        if (txns.length > 1) {
            duplicates.push({
                type: 'same_provider_id',
                provider_id: providerId,
                transactions: txns.map(t => ({ id: t.id, created_date: t.created_date })),
                severity: 'critical',
                action: 'Investigate — possible double charge',
            });
        }
    });

    // 2. Find transactions by same order_id + status=authorized
    const byOrderId = {};
    transactions
        .filter(tx => tx.order_id && tx.status === 'authorized')
        .forEach(tx => {
            if (!byOrderId[tx.order_id]) {
                byOrderId[tx.order_id] = [];
            }
            byOrderId[tx.order_id].push(tx);
        });

    Object.entries(byOrderId).forEach(([orderId, txns]) => {
        if (txns.length > 1) {
            duplicates.push({
                type: 'multiple_authorizations_same_order',
                order_id: orderId,
                transactions: txns.map(t => ({
                    id: t.id,
                    amount: t.amount_cents,
                    created_date: t.created_date,
                })),
                total_charged: txns.reduce((s, t) => s + t.amount_cents, 0),
                severity: 'critical',
                action: 'Order was charged multiple times — refund duplicates',
            });
        }
    });

    return duplicates;
}

/**
 * Find transactions that lack order links
 * (succeeded but never matched to order)
 * 
 * @param {array} transactions
 * @param {array} orders
 * @returns {array} orphaned transaction details
 */
export function findOrphanedTransactions(transactions = [], orders = []) {
    return transactions
        .filter(tx => {
            if (tx.status !== 'authorized') return false;
            if (tx.order_id) return false; // Has a link
            if (tx.reconciliation_note === 'matched_to_order') return false; // Already matched

            return true;
        })
        .map(tx => ({
            transaction_id: tx.id,
            amount_cents: tx.amount_cents,
            initiated_at: tx.initiated_at,
            completed_at: tx.completed_at,
            restaurant_id: tx.restaurant_id,
            reader_label: tx.reader_label,
            operator_email: tx.operator_email,
            action: 'Create order manually or match to existing order',
        }));
}