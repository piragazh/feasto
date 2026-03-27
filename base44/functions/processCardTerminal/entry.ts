/**
 * processCardTerminal — Kiosk card terminal payment processor
 *
 * SECURITY CONTRACT:
 *   1. Calls the terminal (or simulation) to get authorization.
 *   2. On approval, writes a KioskTerminalTransaction record server-side with status='approved'.
 *      This is the ONLY trusted source of authorization evidence.
 *   3. Returns the transaction_ref to the frontend.
 *   4. kioskCreateOrder must then look up this record and verify it before creating a paid order.
 *      The frontend's claim that "payment was approved" is NEVER trusted by kioskCreateOrder.
 *   5. The KioskTerminalTransaction record is marked 'redeemed' atomically when an order is created.
 *      This prevents double-redemption of the same authorization.
 *
 * Current implementation: simulation (95% approval) for providers without SDK integration.
 * Replace processTerminalTransaction() per provider when going live:
 *   - stripe_terminal: use Stripe Terminal SDK (server-driven payment intent)
 *   - sumup: use SumUp Kiosk API
 *   - square: use Square Terminal API
 *   - worldpay: use Worldpay POS API
 *
 * All responses are normalized to the same shape so the kiosk frontend has no
 * provider-specific logic.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Authorization window: 10 minutes from approval to order creation
const AUTH_EXPIRY_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // Kiosk operates as guest / unauthenticated session — no user auth required.
        // The restaurant_id is validated instead.

        const { restaurantId, amount, terminalConfig, transactionRef } = await req.json();

        if (!restaurantId || !amount || amount <= 0) {
            return Response.json({ error: 'restaurantId and a positive amount are required', success: false }, { status: 400 });
        }

        if (typeof amount !== 'number' || !isFinite(amount)) {
            return Response.json({ error: 'amount must be a finite number', success: false }, { status: 400 });
        }

        // Verify restaurant exists (tenant check — prevents drive-by requests)
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
        if (!restaurants?.[0]) {
            return Response.json({ error: 'Restaurant not found', success: false }, { status: 404 });
        }

        const ref = transactionRef || `KIOSK-${restaurantId.slice(-6).toUpperCase()}-${Date.now()}`;
        const provider = terminalConfig?.provider || 'simulation';

        // Guard against duplicate terminal calls with the same transactionRef
        // (e.g., rapid double-tap or stale retry)
        const existingTx = await base44.asServiceRole.entities.KioskTerminalTransaction.filter({
            transaction_ref: ref,
        });
        if (existingTx?.length > 0) {
            const tx = existingTx[0];
            console.warn(`[TERMINAL] Duplicate transactionRef=${ref} status=${tx.status}`);
            if (tx.status === 'approved') {
                // Return approved again so frontend can proceed — idempotent
                return Response.json({
                    success: true,
                    status: 'approved',
                    transactionRef: ref,
                    amount: tx.amount,
                    provider: tx.provider,
                    terminal: tx.terminal_label || 'terminal',
                    timestamp: tx.authorized_at,
                    message: 'Transaction approved (idempotent)',
                });
            }
            // For declined/failed, return the original result
            return Response.json({
                success: false,
                status: tx.status,
                transactionRef: ref,
                error: 'Transaction already processed',
            });
        }

        const result = await processTerminalTransaction({
            amount,
            terminal: terminalConfig || {},
            transactionRef: ref,
            provider,
        });

        // ── WRITE TRUSTED RECORD SERVER-SIDE ────────────────────────────────────
        // This is the authoritative evidence of terminal authorization.
        // kioskCreateOrder will look this up — it does NOT trust request fields.
        const now = new Date();
        const expiresAt = new Date(now.getTime() + AUTH_EXPIRY_MS).toISOString();

        await base44.asServiceRole.entities.KioskTerminalTransaction.create({
            transaction_ref: ref,
            restaurant_id: restaurantId,
            amount: amount,
            status: result.status === 'approved' ? 'approved' : (result.status || 'failed'),
            provider,
            terminal_label: terminalConfig?.reader_label || terminalConfig?.reader_id || 'terminal',
            authorized_at: result.status === 'approved' ? now.toISOString() : undefined,
            expires_at: result.status === 'approved' ? expiresAt : undefined,
        });

        console.log(`[TERMINAL] ref=${ref} provider=${provider} amount=£${amount.toFixed(2)} status=${result.status} record_written=true`);
        return Response.json(result);

    } catch (error) {
        console.error('[TERMINAL] processCardTerminal error:', error);
        return Response.json({
            success: false,
            status: 'failed',
            error: 'Terminal processing failed — please try again',
        }, { status: 500 });
    }
});

/**
 * Normalized terminal transaction processor.
 *
 * Always returns:
 *   { success, status, transactionRef, amount, provider, terminal, timestamp, error? }
 *
 * status values: 'approved' | 'declined' | 'failed' | 'timeout'
 */
async function processTerminalTransaction({ amount, terminal, transactionRef, provider }) {
    // ── Provider-specific routing ────────────────────────────────────────────
    // Uncomment and implement when integrating a real terminal SDK.

    // if (provider === 'stripe_terminal') {
    //   return await processStripeTerminal({ amount, terminal, transactionRef });
    // }
    // if (provider === 'sumup') {
    //   return await processSumUp({ amount, terminal, transactionRef });
    // }
    // if (provider === 'square') {
    //   return await processSquareTerminal({ amount, terminal, transactionRef });
    // }

    // ── Simulation (used when no real terminal SDK is configured) ─────────────
    // 95% approval, 5% decline — for development and test_mode.
    const processingDelayMs = 1500 + Math.random() * 2000;

    return new Promise((resolve) => {
        setTimeout(() => {
            const approved = Math.random() < 0.95;
            const timestamp = new Date().toISOString();

            if (approved) {
                resolve({
                    success: true,
                    status: 'approved',
                    transactionRef,
                    amount,
                    provider,
                    terminal: terminal.reader_label || terminal.reader_id || 'kiosk-terminal',
                    timestamp,
                    message: 'Transaction approved',
                });
            } else {
                resolve({
                    success: false,
                    status: 'declined',
                    transactionRef,
                    amount,
                    provider,
                    terminal: terminal.reader_label || terminal.reader_id || 'kiosk-terminal',
                    timestamp,
                    error: 'Card declined — please try a different card or payment method',
                });
            }
        }, processingDelayMs);
    });
}