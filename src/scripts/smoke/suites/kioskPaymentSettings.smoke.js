/* eslint-disable no-undef */
/**
 * Smoke suite: kioskPaymentSettings
 *
 * Tests the KioskPaymentSettings component logic without mounting React.
 * Validates warning/info banner conditions and save-guard behaviour
 * based on the rules defined in docs/KIOSK_PAYMENT_CONFIG.md.
 *
 * Run: node scripts/smoke/run-smoke.js kioskPaymentSettings
 */

'use strict';

// ── Minimal test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition) {
    if (condition) {
        console.log(`  ✅  ${label}`);
        passed++;
    } else {
        console.error(`  ❌  ${label}`);
        failed++;
    }
}

// ── Rule helpers (mirrors KioskPaymentSettings logic) ────────────────────────

/**
 * Returns the set of active UI banners/indicators given a config state.
 * Returns:
 *   warningA  — card on, no reader
 *   warningB  — both methods off
 *   warningC  — card on, reader configured, terminal unavailable
 *   infoD     — counter-only mode
 *   saveBlocked — save should be prevented
 */
function evaluate(kioskConfig, cardTerminal) {
    const cardEnabled = kioskConfig.payment_card_enabled === true;
    const counterEnabled = kioskConfig.payment_counter_enabled !== false;
    const readerConfigured = !!(cardTerminal?.reader_id?.trim());
    const terminalUnavailable = kioskConfig.terminal_unavailable === true;

    return {
        warningA: cardEnabled && !readerConfigured,
        warningB: !cardEnabled && !counterEnabled,
        warningC: cardEnabled && readerConfigured && terminalUnavailable,
        infoD: !cardEnabled && counterEnabled,
        showUnavailableToggle: cardEnabled && readerConfigured,
        saveBlocked: !cardEnabled && !counterEnabled,
    };
}

// ── Test cases ────────────────────────────────────────────────────────────────

console.log('\n📋  kioskPaymentSettings smoke suite\n');

// Scenario 1: Card enabled, no reader → Warning A
console.log('Scenario 1: Card enabled, no reader configured');
{
    const r = evaluate({ payment_card_enabled: true, payment_counter_enabled: true }, { reader_id: '' });
    assert('Warning A shown', r.warningA === true);
    assert('Warning B not shown', r.warningB === false);
    assert('Warning C not shown', r.warningC === false);
    assert('Info D not shown', r.infoD === false);
    assert('Save not blocked', r.saveBlocked === false);
    assert('Unavailable toggle hidden (no reader)', r.showUnavailableToggle === false);
}

// Scenario 2: Both disabled → Warning B, save blocked
console.log('\nScenario 2: Both payment methods disabled');
{
    const r = evaluate({ payment_card_enabled: false, payment_counter_enabled: false }, { reader_id: '' });
    assert('Warning B shown', r.warningB === true);
    assert('Warning A not shown', r.warningA === false);
    assert('Info D not shown', r.infoD === false);
    assert('Save blocked', r.saveBlocked === true);
}

// Scenario 3: Counter only → Info D
console.log('\nScenario 3: Counter only (card disabled)');
{
    const r = evaluate({ payment_card_enabled: false, payment_counter_enabled: true }, { reader_id: '' });
    assert('Info D shown', r.infoD === true);
    assert('Warning A not shown', r.warningA === false);
    assert('Warning B not shown', r.warningB === false);
    assert('Save not blocked', r.saveBlocked === false);
}

// Scenario 4: Card enabled, reader configured, terminal unavailable → Warning C
console.log('\nScenario 4: Card on, reader configured, marked unavailable');
{
    const r = evaluate(
        { payment_card_enabled: true, payment_counter_enabled: true, terminal_unavailable: true },
        { reader_id: 'tmr_abc123', reader_label: 'Kiosk Reader 1' }
    );
    assert('Warning C shown', r.warningC === true);
    assert('Warning A not shown (reader IS configured)', r.warningA === false);
    assert('Unavailable toggle visible', r.showUnavailableToggle === true);
    assert('Save not blocked', r.saveBlocked === false);
}

// Scenario 5: Fully healthy — card + counter, reader configured, available
console.log('\nScenario 5: Healthy config — card + counter, reader configured and available');
{
    const r = evaluate(
        { payment_card_enabled: true, payment_counter_enabled: true, terminal_unavailable: false },
        { reader_id: 'tmr_abc123', reader_label: 'Kiosk Terminal 1' }
    );
    assert('No Warning A', r.warningA === false);
    assert('No Warning B', r.warningB === false);
    assert('No Warning C', r.warningC === false);
    assert('No Info D', r.infoD === false);
    assert('Save not blocked', r.saveBlocked === false);
    assert('Unavailable toggle visible (reader configured)', r.showUnavailableToggle === true);
}

// Scenario 6: Card only (counter disabled) — should not trigger B or D
console.log('\nScenario 6: Card only, counter disabled, reader configured');
{
    const r = evaluate(
        { payment_card_enabled: true, payment_counter_enabled: false },
        { reader_id: 'tmr_xyz', reader_label: 'Reader A' }
    );
    assert('Warning B not shown (card is active)', r.warningB === false);
    assert('Info D not shown (card is enabled)', r.infoD === false);
    assert('Warning A not shown (reader is configured)', r.warningA === false);
    assert('Save not blocked', r.saveBlocked === false);
}

// Scenario 7: payment_counter_enabled defaults (undefined) treated as enabled
console.log('\nScenario 7: payment_counter_enabled is undefined (default = enabled)');
{
    const r = evaluate(
        { payment_card_enabled: false /* counter_enabled omitted → undefined */ },
        { reader_id: '' }
    );
    // undefined !== false → counterEnabled should be true
    assert('Counter treated as enabled when undefined', r.infoD === true);
    assert('Save not blocked', r.saveBlocked === false);
    assert('Warning B not shown', r.warningB === false);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`  Total: ${passed + failed}  ✅ ${passed}  ❌ ${failed}`);
console.log(`${'─'.repeat(50)}\n`);

if (failed > 0) process.exit(1);