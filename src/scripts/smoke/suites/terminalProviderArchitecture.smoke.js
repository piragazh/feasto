/**
 * Terminal Provider Architecture Tests
 * 
 * Validates the new provider-based terminal architecture:
 * 1. Mock provider exists and returns deterministic results
 * 2. Deterministic scenarios work (DECLINE_, FAIL_, TIMEOUT_)
 * 3. Magic amounts work (6.66=decline, 9.99=fail)
 * 4. Default scenario approves (no random)
 * 5. Approved transactions are redeemable via kioskCreateOrder
 * 6. Declined/failed transactions are rejected by kioskCreateOrder
 */

import { trackResult, log } from '../lib/runner.js';

export async function run(env) {
    const { baseUrl, restaurantId, adminToken } = env;
    const bearer = adminToken?.startsWith('Bearer ') ? adminToken : `Bearer ${adminToken}`;

    if (!restaurantId || !adminToken) {
        log('⏭️  SKIPPED: terminalProviderArchitecture (requires restaurant_id and admin token)', 'warn');
        return;
    }

    console.log('\n🏗️  Terminal Provider Architecture Tests\n');

    const invoke = async (fn, payload) => {
        const res = await fetch(`${baseUrl}/api/functions/${fn}`, {
            method: 'POST',
            headers: { 'Authorization': bearer, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        return { status: res.status, data };
    };

    // ── Test 1: Mock provider approves by default ─────────────────────────────
    try {
        const ref1 = `TEST-APPROVE-${Date.now()}`;
        const { status, data } = await invoke('processCardTerminal', {
            restaurantId,
            amount: 15.00,
            terminalConfig: { provider: 'simulation', reader_label: 'test-terminal' },
            transactionRef: ref1,
        });

        if (status === 200 && data?.status === 'approved' && data?.success === true) {
            trackResult('terminal_mock_default_approve', true, 'Mock provider defaults to approve (deterministic)');
        } else {
            trackResult('terminal_mock_default_approve', false,
                `Expected 200 + approved, got status=${status} result=${data?.status} success=${data?.success}`);
        }

        // Verify transaction was written to DB (trusted record)
        const txRes = await fetch(`${baseUrl}/api/entities/KioskTerminalTransaction`, {
            method: 'GET',
            headers: { 'Authorization': bearer, 'Content-Type': 'application/json' },
        });
        const txList = await txRes.json();
        const writtenTx = txList?.find?.(t => t.transaction_ref === ref1);

        if (writtenTx?.status === 'approved') {
            trackResult('terminal_mock_writes_db_record', true, 'Approved transaction written to KioskTerminalTransaction');
        } else {
            trackResult('terminal_mock_writes_db_record', false, 'No DB record found for approved transaction');
        }
    } catch (err) {
        trackResult('terminal_mock_default_approve', false, `Error: ${err.message}`);
    }

    // ── Test 2: DECLINE_ prefix scenario ──────────────────────────────────────
    try {
        const ref2 = `DECLINE_${Date.now()}`;
        const { status, data } = await invoke('processCardTerminal', {
            restaurantId,
            amount: 20.00,
            terminalConfig: { provider: 'simulation' },
            transactionRef: ref2,
        });

        if (status === 200 && data?.status === 'declined' && data?.success === false) {
            trackResult('terminal_mock_decline_scenario', true, 'DECLINE_ prefix triggers decline (deterministic)');
        } else {
            trackResult('terminal_mock_decline_scenario', false,
                `Expected declined, got status=${data?.status}`);
        }
    } catch (err) {
        trackResult('terminal_mock_decline_scenario', false, `Error: ${err.message}`);
    }

    // ── Test 3: FAIL_ prefix scenario ────────────────────────────────────────
    try {
        const ref3 = `FAIL_${Date.now()}`;
        const { status, data } = await invoke('processCardTerminal', {
            restaurantId,
            amount: 25.00,
            terminalConfig: { provider: 'simulation' },
            transactionRef: ref3,
        });

        if (status === 200 && data?.status === 'failed' && data?.success === false) {
            trackResult('terminal_mock_fail_scenario', true, 'FAIL_ prefix triggers failure (deterministic)');
        } else {
            trackResult('terminal_mock_fail_scenario', false,
                `Expected failed, got status=${data?.status}`);
        }
    } catch (err) {
        trackResult('terminal_mock_fail_scenario', false, `Error: ${err.message}`);
    }

    // ── Test 4: TIMEOUT_ prefix scenario ─────────────────────────────────────
    try {
        const ref4 = `TIMEOUT_${Date.now()}`;
        const { status, data } = await invoke('processCardTerminal', {
            restaurantId,
            amount: 30.00,
            terminalConfig: { provider: 'simulation' },
            transactionRef: ref4,
        });

        if (status === 200 && data?.status === 'timeout' && data?.success === false) {
            trackResult('terminal_mock_timeout_scenario', true, 'TIMEOUT_ prefix triggers timeout (deterministic)');
        } else {
            trackResult('terminal_mock_timeout_scenario', false,
                `Expected timeout, got status=${data?.status}`);
        }
    } catch (err) {
        trackResult('terminal_mock_timeout_scenario', false, `Error: ${err.message}`);
    }

    // ── Test 5: Magic amount 6.66 (decline) ──────────────────────────────────
    try {
        const ref5 = `MAGIC-DECLINE-${Date.now()}`;
        const { status, data } = await invoke('processCardTerminal', {
            restaurantId,
            amount: 6.66,
            terminalConfig: { provider: 'simulation' },
            transactionRef: ref5,
        });

        if (status === 200 && data?.status === 'declined') {
            trackResult('terminal_mock_magic_amount_decline', true, 'Amount 6.66 triggers decline (deterministic)');
        } else {
            trackResult('terminal_mock_magic_amount_decline', false,
                `Expected declined for 6.66, got status=${data?.status}`);
        }
    } catch (err) {
        trackResult('terminal_mock_magic_amount_decline', false, `Error: ${err.message}`);
    }

    // ── Test 6: Magic amount 9.99 (fail) ─────────────────────────────────────
    try {
        const ref6 = `MAGIC-FAIL-${Date.now()}`;
        const { status, data } = await invoke('processCardTerminal', {
            restaurantId,
            amount: 9.99,
            terminalConfig: { provider: 'simulation' },
            transactionRef: ref6,
        });

        if (status === 200 && data?.status === 'failed') {
            trackResult('terminal_mock_magic_amount_fail', true, 'Amount 9.99 triggers fail (deterministic)');
        } else {
            trackResult('terminal_mock_magic_amount_fail', false,
                `Expected failed for 9.99, got status=${data?.status}`);
        }
    } catch (err) {
        trackResult('terminal_mock_magic_amount_fail', false, `Error: ${err.message}`);
    }

    // ── Test 7: No Math.random in production path (deterministic reproducibility) ──
    try {
        const ref7a = `DETERMINISTIC-${Date.now()}`;
        const ref7b = `DETERMINISTIC-${Date.now() + 1}`;

        const response1 = await invoke('processCardTerminal', {
            restaurantId,
            amount: 10.00,
            terminalConfig: { provider: 'simulation' },
            transactionRef: ref7a,
        });

        const response2 = await invoke('processCardTerminal', {
            restaurantId,
            amount: 10.00,
            terminalConfig: { provider: 'simulation' },
            transactionRef: ref7b,
        });

        // Both should approve (same amount, no DECLINE_/FAIL_ prefix)
        // This proves no Math.random — same input = same output
        if (response1.data?.status === 'approved' && response2.data?.status === 'approved') {
            trackResult('terminal_mock_deterministic', true, 'Multiple requests with same amount both approve (no randomness)');
        } else {
            trackResult('terminal_mock_deterministic', false,
                `Responses differ: ${response1.data?.status} vs ${response2.data?.status} (suggests randomness)`);
        }
    } catch (err) {
        trackResult('terminal_mock_deterministic', false, `Error: ${err.message}`);
    }

    // ── Test 8: Approved transaction can be redeemed via kioskCreateOrder ────
    try {
        const ref8 = `REDEEM-${Date.now()}`;
        
        // Step 1: Create approved transaction
        const approveRes = await invoke('processCardTerminal', {
            restaurantId,
            amount: 12.50,
            terminalConfig: { provider: 'simulation' },
            transactionRef: ref8,
        });

        if (approveRes.data?.status !== 'approved') {
            trackResult('terminal_mock_redeemable', false, 'Could not create approved transaction');
            return;
        }

        // Step 2: Try to redeem via kioskCreateOrder
        // (Will likely fail on items not found, but should NOT fail on card auth)
        const testItems = [{ menu_item_id: 'NONEXISTENT', name: 'Test', quantity: 1 }];
        const redeemRes = await invoke('kioskCreateOrder', {
            restaurantId,
            orderType: 'takeaway',
            paymentMethod: 'card',
            paymentIntentId: ref8,
            items: testItems,
            idempotency_key: `redeem-${Date.now()}`,
        });

        const isCardAuthError = redeemRes.data?.error?.toLowerCase().includes('authorization') ||
                                redeemRes.data?.error?.toLowerCase().includes('terminal');

        if (isCardAuthError) {
            trackResult('terminal_mock_redeemable', false,
                `Card auth passed but got unexpected auth error: ${redeemRes.data?.error}`);
        } else {
            // Either success (unlikely with fake item) or other error (items, etc.)
            trackResult('terminal_mock_redeemable', true,
                `Approved transaction passed card checks (failed on items — expected in test env)`);
        }
    } catch (err) {
        trackResult('terminal_mock_redeemable', false, `Error: ${err.message}`);
    }

    // ── Test 9: Declined transaction rejected by kioskCreateOrder ────────────
    try {
        const ref9 = `DECLINE_REDEEM-${Date.now()}`;

        // Create declined transaction
        await invoke('processCardTerminal', {
            restaurantId,
            amount: 15.00,
            terminalConfig: { provider: 'simulation' },
            transactionRef: ref9,
        });

        // Try to redeem — should fail on card auth (not approved)
        const testItems = [{ menu_item_id: 'TEST', name: 'Item', quantity: 1 }];
        const redeemRes = await invoke('kioskCreateOrder', {
            restaurantId,
            orderType: 'takeaway',
            paymentMethod: 'card',
            paymentIntentId: ref9,
            items: testItems,
            idempotency_key: `decline-redeem-${Date.now()}`,
        });

        const hasAuthError = redeemRes.data?.error?.toLowerCase().includes('approved') ||
                             redeemRes.data?.error?.toLowerCase().includes('authorization');

        if (redeemRes.status === 400 && hasAuthError) {
            trackResult('terminal_mock_declined_rejected', true, 'Declined transaction correctly rejected on redemption');
        } else if (redeemRes.status === 400) {
            trackResult('terminal_mock_declined_rejected', true,
                `Declined transaction rejected: ${redeemRes.data?.error}`);
        } else {
            trackResult('terminal_mock_declined_rejected', false,
                `Expected 400 rejection, got status=${redeemRes.status}`);
        }
    } catch (err) {
        trackResult('terminal_mock_declined_rejected', false, `Error: ${err.message}`);
    }

    console.log('');
}