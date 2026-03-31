/**
/* eslint-disable no-undef */
 * Smoke tests: kioskTerminalReadiness
 *
 * Tests the pure getTerminalReadiness() and getKioskPaymentOptions() logic.
 * No browser / DOM / network required — runs in Node.
 *
 * Run: node scripts/smoke/suites/kioskTerminalReadiness.smoke.js
 */

// ── Inline the logic so this file is self-contained for CI ────────────────────
// (mirrors lib/kioskTerminalReadiness.js exactly)

function getTerminalReadiness(kioskConfig) {
    if (!kioskConfig) {
        return { configured: false, available: false, provider: null, reason: 'No kiosk configuration found.' };
    }
    const terminalConfig = kioskConfig.card_terminal || null;
    const readerId = terminalConfig?.reader_id?.trim() || '';
    if (!readerId) {
        return { configured: false, available: false, provider: terminalConfig?.provider || null, reason: 'No card reader configured. Add a Reader ID in Kiosk Settings.' };
    }
    if (kioskConfig.terminal_unavailable === true) {
        return { configured: true, available: false, provider: terminalConfig?.provider || null, reason: 'Card reader is marked as temporarily unavailable.' };
    }
    return { configured: true, available: true, provider: terminalConfig?.provider || null, reason: null };
}

function getKioskPaymentOptions(kioskConfig) {
    const readiness = getTerminalReadiness(kioskConfig);
    const cardConfigEnabled = kioskConfig?.payment_card_enabled === true;
    const counterConfigEnabled = kioskConfig?.payment_counter_enabled !== false;
    const counterFallback = cardConfigEnabled && !readiness.configured;
    const showCard = cardConfigEnabled && readiness.configured && readiness.available;
    const showCounter = counterConfigEnabled || counterFallback;
    return { showCard, showCounter, terminalReadiness: readiness };
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
        failed++;
    }
}

function suite(name, fn) {
    console.log(`\n📋 ${name}`);
    fn();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('getTerminalReadiness — null/undefined config', () => {
    const r = getTerminalReadiness(null);
    assert('configured=false', r.configured === false);
    assert('available=false', r.available === false);
    assert('provider=null', r.provider === null);
    assert('reason is non-empty string', typeof r.reason === 'string' && r.reason.length > 0);

    const r2 = getTerminalReadiness(undefined);
    assert('undefined: configured=false', r2.configured === false);
    assert('undefined: available=false', r2.available === false);
});

suite('getTerminalReadiness — no reader_id (not configured)', () => {
    const r = getTerminalReadiness({ payment_card_enabled: true, card_terminal: { provider: 'stripe_terminal' } });
    assert('configured=false', r.configured === false);
    assert('available=false', r.available === false);
    assert('provider preserved', r.provider === 'stripe_terminal');
    assert('reason is non-empty string', typeof r.reason === 'string' && r.reason.length > 0);

    // Empty string reader_id
    const r2 = getTerminalReadiness({ card_terminal: { reader_id: '   ' } });
    assert('whitespace-only reader_id: configured=false', r2.configured === false);
});

suite('getTerminalReadiness — configured but terminal_unavailable=true', () => {
    const config = {
        payment_card_enabled: true,
        terminal_unavailable: true,
        card_terminal: { reader_id: 'tmr_test123', provider: 'stripe_terminal', reader_label: 'Kiosk 1' },
    };
    const r = getTerminalReadiness(config);
    assert('configured=true', r.configured === true);
    assert('available=false', r.available === false);
    assert('provider preserved', r.provider === 'stripe_terminal');
    assert('reason is non-empty string', typeof r.reason === 'string' && r.reason.length > 0);
});

suite('getTerminalReadiness — configured and available', () => {
    const config = {
        payment_card_enabled: true,
        terminal_unavailable: false,
        card_terminal: { reader_id: 'tmr_test123', provider: 'stripe_terminal' },
    };
    const r = getTerminalReadiness(config);
    assert('configured=true', r.configured === true);
    assert('available=true', r.available === true);
    assert('provider preserved', r.provider === 'stripe_terminal');
    assert('reason=null', r.reason === null);

    // terminal_unavailable absent (default = available)
    const config2 = { card_terminal: { reader_id: 'tmr_abc' } };
    const r2 = getTerminalReadiness(config2);
    assert('absent unavailable flag: available=true', r2.available === true);
    assert('absent unavailable flag: reason=null', r2.reason === null);
});

suite('getKioskPaymentOptions — card enabled + terminal ready', () => {
    const config = {
        payment_card_enabled: true,
        payment_counter_enabled: true,
        card_terminal: { reader_id: 'tmr_abc', provider: 'stripe_terminal' },
    };
    const { showCard, showCounter } = getKioskPaymentOptions(config);
    assert('showCard=true', showCard === true);
    assert('showCounter=true', showCounter === true);
});

suite('getKioskPaymentOptions — card enabled but terminal not configured', () => {
    const config = {
        payment_card_enabled: true,
        payment_counter_enabled: false, // explicitly disabled
        card_terminal: {},              // no reader_id
    };
    const { showCard, showCounter } = getKioskPaymentOptions(config);
    assert('showCard=false (not configured)', showCard === false);
    assert('showCounter=true (fallback when card enabled but no reader)', showCounter === true);
});

suite('getKioskPaymentOptions — card enabled but terminal unavailable', () => {
    const config = {
        payment_card_enabled: true,
        payment_counter_enabled: true,
        terminal_unavailable: true,
        card_terminal: { reader_id: 'tmr_x' },
    };
    const { showCard, showCounter } = getKioskPaymentOptions(config);
    assert('showCard=false (unavailable)', showCard === false);
    assert('showCounter=true', showCounter === true);
});

suite('getKioskPaymentOptions — counter only (card disabled)', () => {
    const config = {
        payment_card_enabled: false,
        payment_counter_enabled: true,
    };
    const { showCard, showCounter } = getKioskPaymentOptions(config);
    assert('showCard=false', showCard === false);
    assert('showCounter=true', showCounter === true);
});

suite('getKioskPaymentOptions — both methods disabled', () => {
    const config = {
        payment_card_enabled: false,
        payment_counter_enabled: false,
    };
    const { showCard, showCounter } = getKioskPaymentOptions(config);
    assert('showCard=false', showCard === false);
    assert('showCounter=false', showCounter === false);
    // KioskPayment will show the "Ordering unavailable" screen when both are false
});

suite('getKioskPaymentOptions — no config at all (unconfigured kiosk)', () => {
    const { showCard, showCounter } = getKioskPaymentOptions(null);
    assert('showCard=false', showCard === false);
    // counter default is true (payment_counter_enabled !== false) but card_enabled is not set
    // counterFallback = false (cardConfigEnabled=false), counterConfigEnabled = true
    assert('showCounter=true (default)', showCounter === true);
});

suite('getKioskPaymentOptions — default config (no flags set)', () => {
    // Mimics a restaurant that has never touched kiosk payment settings
    const config = {};
    const { showCard, showCounter } = getKioskPaymentOptions(config);
    assert('showCard=false (card_enabled not set)', showCard === false);
    assert('showCounter=true (counter enabled by default)', showCounter === true);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    console.error('\n🚨 Some tests failed');
    process.exit(1);
} else {
    console.log('\n✅ All terminal readiness tests passed');
    process.exit(0);
}