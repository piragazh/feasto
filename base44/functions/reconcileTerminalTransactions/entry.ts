/**
 * Backend: Reconcile Terminal Transactions
 * 
 * Runs daily/weekly reconciliation:
 * 1. Fetch all authorized terminal transactions
 * 2. Match against orders
 * 3. Detect duplicates & orphaned charges
 * 4. Generate reconciliation report
 * 
 * Can be called as:
 * - Scheduled job (daily)
 * - Manual reconciliation from admin
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ──────────────────────────────────────────────────────────────
// Inlined reconciliation logic (cannot import from lib)
// ──────────────────────────────────────────────────────────────

function reconcileTransaction(transaction, allOrders = []) {
    const {
        id: transactionId,
        order_id: linkedOrderId,
        amount_cents: transactionAmount,
        status: transactionStatus,
        created_date: transactionCreatedDate,
    } = transaction;

    if (transactionStatus !== 'authorized') {
        return {
            transaction_id: transactionId,
            status: 'skipped',
            reason: `Transaction status is ${transactionStatus}, not authorized`,
        };
    }

    if (transaction.reconciled) {
        return {
            transaction_id: transactionId,
            status: 'already_reconciled',
            note: transaction.reconciliation_note,
        };
    }

    // Check linked order
    if (linkedOrderId) {
        const linkedOrder = allOrders.find(o => o.id === linkedOrderId);
        if (!linkedOrder) {
            return {
                transaction_id: transactionId,
                status: 'error',
                reason: 'orphaned_link',
                message: `Transaction linked to order ${linkedOrderId}, but order not found`,
                severity: 'warning',
            };
        }

        const orderTotalCents = Math.round(linkedOrder.total * 100);
        if (Math.abs(transactionAmount - orderTotalCents) > 1) {
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

        return {
            transaction_id: transactionId,
            status: 'matched',
            order_id: linkedOrderId,
            message: 'Transaction matched to linked order',
        };
    }

    // Search by amount + timestamp
    const txnTime = new Date(transactionCreatedDate);
    const searchWindowMinutes = 5;

    const candidateOrders = allOrders.filter(order => {
        if (order.payment_method !== 'card') return false;
        if (order.status === 'cancelled') return false;
        const orderTotalCents = Math.round(order.total * 100);
        if (Math.abs(transactionAmount - orderTotalCents) > 1) return false;
        const orderTime = new Date(order.created_date);
        const diffMinutes = Math.abs((txnTime - orderTime) / (1000 * 60));
        return diffMinutes <= searchWindowMinutes;
    });

    if (candidateOrders.length === 0) {
        return {
            transaction_id: transactionId,
            status: 'orphaned',
            reason: 'no_matching_order',
            message: `£${(transactionAmount / 100).toFixed(2)} authorized but no matching order within ±${searchWindowMinutes}min`,
            amount: transactionAmount,
            severity: 'warning',
        };
    }

    if (candidateOrders.length === 1) {
        return {
            transaction_id: transactionId,
            status: 'matched',
            order_id: candidateOrders[0].id,
            message: 'Transaction matched by amount + timestamp',
            auto_link: true,
        };
    }

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

function reconcileTransactions(transactions = [], orders = []) {
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

function detectDuplicates(transactions = []) {
    const duplicates = [];

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

function findOrphanedTransactions(transactions = []) {
    return transactions
        .filter(tx => {
            if (tx.status !== 'authorized') return false;
            if (tx.order_id) return false;
            if (tx.reconciliation_note === 'matched_to_order') return false;
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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Only admins can run reconciliation
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const body = await req.json();
        const { restaurant_id, start_date, end_date } = body;

        if (!restaurant_id) {
            return Response.json({ error: 'Missing restaurant_id' }, { status: 400 });
        }

        // ──────────────────────────────────────────────────────────────
        // 1. Fetch all terminal transactions (authorized only)
        // ──────────────────────────────────────────────────────────────
        const query = {
            restaurant_id,
            status: 'authorized',
        };

        if (start_date) {
            // Filter by created_date range
            const startObj = new Date(start_date);
            const endObj = end_date ? new Date(end_date) : new Date();
            // Note: Base44 entity filters may not support date ranges natively
            // We'll filter in memory if needed
        }

        const transactions = await base44.asServiceRole.entities.TerminalTransaction.filter(query);

        // ──────────────────────────────────────────────────────────────
        // 2. Fetch all orders from this restaurant
        // ──────────────────────────────────────────────────────────────
        const orders = await base44.asServiceRole.entities.Order.filter({
            restaurant_id,
        });

        // ──────────────────────────────────────────────────────────────
        // 3. Apply date filters if provided (in-memory)
        // ──────────────────────────────────────────────────────────────
        let filteredTransactions = transactions;
        let filteredOrders = orders;

        if (start_date) {
            const startTime = new Date(start_date).getTime();
            const endTime = end_date ? new Date(end_date).getTime() : Date.now();
            filteredTransactions = transactions.filter(t => {
                const txTime = new Date(t.created_date).getTime();
                return txTime >= startTime && txTime <= endTime;
            });
            filteredOrders = orders.filter(o => {
                const oTime = new Date(o.created_date).getTime();
                return oTime >= startTime && oTime <= endTime;
            });
        }

        // ──────────────────────────────────────────────────────────────
        // 4. Run reconciliation checks
        // ──────────────────────────────────────────────────────────────
        const reconciliationReport = reconcileTransactions(filteredTransactions, filteredOrders);
        const duplicates = detectDuplicates(filteredTransactions);
        const orphaned = findOrphanedTransactions(filteredTransactions, filteredOrders);

        // ──────────────────────────────────────────────────────────────
        // 5. Auto-link single-match transactions
        // ──────────────────────────────────────────────────────────────
        const autoLinked = [];
        for (const result of reconciliationReport.results) {
            if (result.auto_link && result.order_id) {
                try {
                    await base44.asServiceRole.entities.TerminalTransaction.update(result.transaction_id, {
                        order_id: result.order_id,
                        reconciled: true,
                        reconciled_at: new Date().toISOString(),
                        reconciliation_note: 'matched_to_order',
                    });
                    autoLinked.push(result.transaction_id);
                } catch (e) {
                    console.error(`Failed to auto-link ${result.transaction_id}:`, e.message);
                }
            }
        }

        // ──────────────────────────────────────────────────────────────
        // 6. Generate final report
        // ──────────────────────────────────────────────────────────────
        const finalReport = {
            timestamp: new Date().toISOString(),
            restaurant_id,
            period: {
                start: start_date || null,
                end: end_date || null,
            },
            reconciliation: reconciliationReport,
            duplicates,
            orphaned_transactions: orphaned,
            actions_taken: {
                auto_linked: autoLinked.length,
            },
            critical_issues: [
                ...duplicates.filter(d => d.severity === 'critical'),
                ...reconciliationReport.issues.amount_mismatches,
                ...reconciliationReport.issues.broken_links,
            ],
            warnings: [
                ...reconciliationReport.issues.orphaned,
                ...reconciliationReport.issues.ambiguous,
            ],
        };

        return Response.json(finalReport);

    } catch (error) {
        console.error('[Terminal Reconciliation] Error:', error.message);
        return Response.json(
            { error: error.message, code: 'RECONCILIATION_FAILED' },
            { status: 500 }
        );
    }
});