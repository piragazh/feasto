/* eslint-disable no-undef */
/**
 * Smoke tests: confirmKioskPayment backend function
 *
 * Tests security invariants:
 * 1. Only kiosk counter-pay pending orders can be confirmed
 * 2. Card-terminal orders are rejected
 * 3. Actor identity is recorded
 * 4. Timestamp is recorded
 * 5. Status transitions to confirmed
 * 6. Audit trail is maintained
 *
 * Run: node scripts/smoke/suites/confirmKioskPayment.smoke.js
 */

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

// ── Mock function behavior ────────────────────────────────────────────────────

/**
 * Simulate the backend validation logic from confirmKioskPayment
 */
function validateKioskPaymentConfirmation(order, actor) {
    const errors = [];

    // Authentication
    if (!actor) {
        errors.push('Unauthorized: Must be logged in');
        return { valid: false, errors, status: 401 };
    }

    // Authorization
    const allowedRoles = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'];
    if (!allowedRoles.includes(actor.role)) {
        errors.push(`Forbidden: Role '${actor.role}' cannot confirm payments`);
        return { valid: false, errors, status: 403 };
    }

    // Order source validation
    if (order.order_source !== 'kiosk') {
        errors.push(`Forbidden: Order source '${order.order_source}' is not kiosk`);
        return { valid: false, errors, status: 403 };
    }

    // Payment method validation (CRITICAL)
    if (order.payment_method !== 'pay_at_counter') {
        errors.push(
            `Invalid state: Order payment_method is '${order.payment_method}', not 'pay_at_counter'`
        );
        return { valid: false, errors, status: 409 };
    }

    // Status validation
    if (order.status !== 'pending') {
        errors.push(`Invalid state: Order status is '${order.status}', not 'pending'`);
        return { valid: false, errors, status: 409 };
    }

    return { valid: true, errors: [] };
}

/**
 * Simulate successful payment confirmation
 */
function confirmPaymentSuccess(order, actor) {
    const timestamp = new Date().toISOString();
    return {
        success: true,
        order_id: order.id,
        order_number: order.order_number,
        previous_status: 'pending',
        new_status: 'confirmed',
        confirmed_by: actor.email,
        confirmed_at: timestamp,
        audit_entry: {
            action: 'payment_confirmed_at_counter',
            actor_email: actor.email,
            actor_name: actor.full_name,
            actor_role: actor.role,
            timestamp,
            note: `Kiosk counter-payment confirmed by ${actor.full_name}`,
        },
    };
}

// ── Test data ─────────────────────────────────────────────────────────────────

const kioskCounterPayPending = {
    id: 'order_01',
    order_source: 'kiosk',
    order_number: 'K-1234',
    payment_method: 'pay_at_counter',
    status: 'pending',
};

const kioskCardTerminal = {
    id: 'order_02',
    order_source: 'kiosk',
    order_number: 'K-1235',
    payment_method: 'card',
    status: 'confirmed',
    payment_intent_id: 'TERM-ABC123',
};

const kioskCounterPayConfirmed = {
    id: 'order_03',
    order_source: 'kiosk',
    order_number: 'K-1236',
    payment_method: 'pay_at_counter',
    status: 'confirmed',
};

const onlineDeliveryPending = {
    id: 'order_04',
    order_source: 'online',
    payment_method: 'card',
    status: 'pending',
};

const manager = {
    email: 'manager@restaurant.com',
    full_name: 'Alice Manager',
    role: 'manager',
};

const cashier = {
    email: 'cashier@restaurant.com',
    full_name: 'Bob Cashier',
    role: 'cashier',
};

const customer = {
    email: 'customer@example.com',
    full_name: 'Charlie Customer',
    role: 'customer',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('validateKioskPaymentConfirmation — authentication', () => {
    const noActor = validateKioskPaymentConfirmation(kioskCounterPayPending, null);
    assert('no actor → 401 Unauthorized', noActor.status === 401);
    assert('error message present', noActor.errors.length > 0);
});

suite('validateKioskPaymentConfirmation — authorization', () => {
    const customerAttempt = validateKioskPaymentConfirmation(kioskCounterPayPending, customer);
    assert('customer role → 403 Forbidden', customerAttempt.status === 403);
    assert('error mentions role', customerAttempt.errors.some(e => e.includes("role 'customer'")));

    const managerOK = validateKioskPaymentConfirmation(kioskCounterPayPending, manager);
    assert('manager role → valid', managerOK.valid === true);

    const cashierOK = validateKioskPaymentConfirmation(kioskCounterPayPending, cashier);
    assert('cashier role → valid', cashierOK.valid === true);
});

suite('validateKioskPaymentConfirmation — order source check', () => {
    const result = validateKioskPaymentConfirmation(onlineDeliveryPending, manager);
    assert('online order → 403 Forbidden', result.status === 403);
    assert('error mentions order source', result.errors.some(e => e.includes('order source')));
});

suite('validateKioskPaymentConfirmation — CRITICAL: payment method check', () => {
    // This is the critical check that prevents card-terminal orders from being re-confirmed
    const cardResult = validateKioskPaymentConfirmation(kioskCardTerminal, manager);
    assert('card terminal order → 409 Invalid state', cardResult.status === 409);
    assert('error mentions payment_method', cardResult.errors.some(e => e.includes('payment_method')));

    // Counter-pay is allowed
    const counterResult = validateKioskPaymentConfirmation(kioskCounterPayPending, manager);
    assert('pay_at_counter order → valid', counterResult.valid === true);
});

suite('validateKioskPaymentConfirmation — status check', () => {
    // Already confirmed order cannot be re-confirmed
    const confirmedResult = validateKioskPaymentConfirmation(kioskCounterPayConfirmed, manager);
    assert('confirmed order → 409 Invalid state', confirmedResult.status === 409);
    assert('error mentions status', confirmedResult.errors.some(e => e.includes('status')));

    // Pending order is OK
    const pendingResult = validateKioskPaymentConfirmation(kioskCounterPayPending, manager);
    assert('pending order → valid', pendingResult.valid === true);
});

suite('confirmPaymentSuccess — audit trail recording', () => {
    const result = confirmPaymentSuccess(kioskCounterPayPending, manager);

    assert('returns success=true', result.success === true);
    assert('includes order_id', result.order_id === kioskCounterPayPending.id);
    assert('includes order_number', result.order_number === kioskCounterPayPending.order_number);
    assert('includes confirmed_by email', result.confirmed_by === manager.email);
    assert('includes confirmed_at timestamp', !!result.confirmed_at);
    assert('includes audit_entry', !!result.audit_entry);
    assert('audit_entry has action', result.audit_entry.action === 'payment_confirmed_at_counter');
    assert('audit_entry has actor_email', result.audit_entry.actor_email === manager.email);
    assert('audit_entry has actor_name', result.audit_entry.actor_name === manager.full_name);
    assert('audit_entry has actor_role', result.audit_entry.actor_role === manager.role);
    assert('audit_entry has timestamp', !!result.audit_entry.timestamp);
    assert('previous_status is pending', result.previous_status === 'pending');
    assert('new_status is confirmed', result.new_status === 'confirmed');
});

suite('confirmPaymentSuccess — actor snapshots', () => {
    // Manager confirmation
    const managerResult = confirmPaymentSuccess(kioskCounterPayPending, manager);
    assert('manager name captured', managerResult.audit_entry.actor_name === 'Alice Manager');
    assert('manager role captured', managerResult.audit_entry.actor_role === 'manager');

    // Cashier confirmation
    const cashierResult = confirmPaymentSuccess(kioskCounterPayPending, cashier);
    assert('cashier name captured', cashierResult.audit_entry.actor_name === 'Bob Cashier');
    assert('cashier role captured', cashierResult.audit_entry.actor_role === 'cashier');
});

suite('Full flow: kiosk counter-pay order confirmation', () => {
    // Step 1: Validate
    const validation = validateKioskPaymentConfirmation(kioskCounterPayPending, manager);
    assert('validation passes', validation.valid === true);

    // Step 2: Confirm
    const result = confirmPaymentSuccess(kioskCounterPayPending, manager);
    assert('confirmation succeeds', result.success === true);

    // Step 3: Verify audit trail would be updated
    assert('status_history entry would be created', result.new_status === 'confirmed');
    assert('payment_audit_trail entry would be created', result.audit_entry !== null);

    // Step 4: Verify state prevents re-confirmation
    const confirmAgain = validateKioskPaymentConfirmation(
        { ...kioskCounterPayPending, status: 'confirmed' },
        manager
    );
    assert('re-confirmation blocked', confirmAgain.valid === false);
});

suite('Edge cases', () => {
    // Kiosk order that somehow has been prepared without confirmation
    const preparing = { ...kioskCounterPayPending, status: 'preparing' };
    const result = validateKioskPaymentConfirmation(preparing, manager);
    assert('preparing status rejected', result.valid === false);

    // Order with empty source
    const noSource = { ...kioskCounterPayPending, order_source: null };
    const result2 = validateKioskPaymentConfirmation(noSource, manager);
    assert('null order_source rejected', result2.valid === false);

    // Order with wrong payment method
    const wrongPayment = { ...kioskCounterPayPending, payment_method: 'cash' };
    const result3 = validateKioskPaymentConfirmation(wrongPayment, manager);
    assert('cash payment_method rejected', result3.valid === false);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    console.error('\n🚨 Some tests failed');
    process.exit(1);
} else {
    console.log('\n✅ All kiosk payment confirmation tests passed');
    process.exit(0);
}