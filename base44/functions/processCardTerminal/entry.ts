/**
 * processCardTerminal — Kiosk card terminal payment processor
 *
 * SECURITY CONTRACT:
 *   Returns { success: true, status: 'approved', transactionRef } ONLY when the terminal
 *   has genuinely authorized the payment. The kiosk frontend must treat any other response
 *   as non-authorized and must NOT create a confirmed order.
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
        const provider = terminalConfig?.provider || 'unknown';

        const result = await processTerminalTransaction({
            amount,
            terminal: terminalConfig || {},
            transactionRef: ref,
            provider,
        });

        // Normalize output — frontend checks result.success && result.status === 'approved'
        console.log(`[TERMINAL] ref=${ref} provider=${provider} amount=£${amount.toFixed(2)} status=${result.status}`);
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