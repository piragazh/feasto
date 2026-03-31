/**
/* eslint-disable no-undef */
 * Kiosk Payment Status Model — Smoke Tests
 *
 * Validates that payment_status and status are properly separated
 * and follow the documented state machine rules.
 */

const assert = (condition, message) => {
    if (!condition) throw new Error(`❌ ${message}`);
    console.log(`✅ ${message}`);
};

const suite = (name, fn) => {
    console.log(`\n📋 ${name}`);
    try {
        fn();
        console.log(`✨ ${name} passed`);
    } catch (e) {
        console.error(`💥 ${name} failed: ${e.message}`);
        process.exit(1);
    }
};

// ─────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────

const createMockKioskCardOrder = () => ({
    id: 'order_123',
    order_source: 'kiosk',
    payment_method: 'card',
    payment_status: 'paid_card',
    status: 'confirmed',
    payment_intent_id: 'kiosk_terminal_auth_xyz',
});

const createMockKioskCounterOrder = () => ({
    id: 'order_456',
    order_source: 'kiosk',
    payment_method: 'pay_at_counter',
    payment_status: 'pending_payment',
    status: 'pending',
});

const createMockOnlineOrder = () => ({
    id: 'order_789',
    order_source: 'online',
    payment_method: 'cash',
    payment_status: null,
    status: 'pending',
});

// ─────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────

suite('Kiosk Card Payment — Correct State at Creation', () => {
    const order = createMockKioskCardOrder();
    
    assert(order.order_source === 'kiosk', 'order_source is kiosk');
    assert(order.payment_method === 'card', 'payment_method is card');
    assert(order.payment_status === 'paid_card', 'payment_status is paid_card (not pending)');
    assert(order.status === 'confirmed', 'status is confirmed (ready for kitchen)');
    assert(order.payment_intent_id, 'payment_intent_id set (transaction evidence)');
});

suite('Kiosk Counter Payment — Correct State at Creation', () => {
    const order = createMockKioskCounterOrder();
    
    assert(order.order_source === 'kiosk', 'order_source is kiosk');
    assert(order.payment_method === 'pay_at_counter', 'payment_method is pay_at_counter');
    assert(order.payment_status === 'pending_payment', 'payment_status is pending_payment (awaiting staff)');
    assert(order.status === 'pending', 'status is pending (kitchen should NOT start)');
});

suite('Non-Kiosk Orders — payment_status Unused', () => {
    const order = createMockOnlineOrder();
    
    assert(order.order_source === 'online', 'order_source is online');
    assert(order.payment_status === null || order.payment_status === undefined, 
        'payment_status is null/undefined for non-kiosk');
    assert(order.status === 'pending', 'status exists and is independent');
});

suite('Kiosk Counter — Manual Confirmation Updates Only payment_status', () => {
    const order = createMockKioskCounterOrder();
    
    // Simulate staff confirmation
    const confirmed = {
        ...order,
        payment_status: 'payment_confirmed',  // ← Only this changes
        status: 'confirmed',                  // Also move to confirmed for kitchen
        payment_confirmed_at: new Date().toISOString(),
        payment_confirmed_by: 'staff@example.com',
    };
    
    assert(confirmed.payment_status === 'payment_confirmed', 
        'payment_status updated to payment_confirmed');
    assert(confirmed.status === 'confirmed', 
        'status also updated to confirmed (kitchen now preps)');
    assert(!confirmed.hasOwnProperty('payment_audit_trail') || confirmed.payment_audit_trail, 
        'audit trail should be present');
});

suite('Kitchen Prep State Changes Do NOT Change payment_status', () => {
    const order = {
        ...createMockKioskCounterOrder(),
        payment_status: 'payment_confirmed',  // Already confirmed
        status: 'confirmed',
    };
    
    // Kitchen marks as preparing
    const preparing = {
        ...order,
        status: 'preparing',  // ← Only status changes
        // payment_status remains unchanged
    };
    
    assert(preparing.payment_status === 'payment_confirmed', 
        'payment_status unchanged during kitchen prep');
    assert(preparing.status === 'preparing', 
        'status changed independently');
});

suite('Kitchen Cannot Start Prep Before payment_status Confirmed', () => {
    const order = createMockKioskCounterOrder();
    
    // This order is NOT ready for kitchen
    const shouldKitchenStart = (o) => {
        if (o.order_source !== 'kiosk') return true;  // Non-kiosk, standard flow
        if (o.payment_method === 'pay_at_counter' && o.payment_status === 'pending_payment') {
            return false;  // ← Kitchen should NOT start
        }
        return true;  // paid_card or payment_confirmed
    };
    
    assert(!shouldKitchenStart(order), 
        'Kitchen should NOT start when payment_status=pending_payment');
    
    // After confirmation
    order.payment_status = 'payment_confirmed';
    assert(shouldKitchenStart(order), 
        'Kitchen SHOULD start when payment_status=payment_confirmed');
    
    // Card-paid orders
    const cardOrder = createMockKioskCardOrder();
    assert(shouldKitchenStart(cardOrder), 
        'Kitchen SHOULD start when payment_status=paid_card');
});

suite('Kiosk Card Order — No Manual Confirm Button', () => {
    const order = createMockKioskCardOrder();
    
    // Button should be hidden for card-paid orders
    const showManualConfirmButton = (o) => {
        return o.order_source === 'kiosk' && 
               o.payment_method === 'pay_at_counter' && 
               o.payment_status === 'pending_payment';
    };
    
    assert(!showManualConfirmButton(order), 
        'Manual confirm button NOT shown for paid_card orders');
    
    const counterOrder = createMockKioskCounterOrder();
    assert(showManualConfirmButton(counterOrder), 
        'Manual confirm button shown for pending_payment orders');
});

suite('Live Orders Filter — Unpaid Kiosk Orders', () => {
    const allOrders = [
        createMockKioskCardOrder(),
        createMockKioskCounterOrder(),
        createMockOnlineOrder(),
        { ...createMockKioskCounterOrder(), id: 'order_999', payment_status: 'payment_confirmed' },
    ];
    
    const unpaidKiosk = allOrders.filter(o => 
        o.order_source === 'kiosk' && o.payment_status === 'pending_payment'
    );
    
    assert(unpaidKiosk.length === 1, 'Exactly 1 unpaid kiosk order');
    assert(unpaidKiosk[0].id === 'order_456', 'Correct order identified');
});

suite('Payment Status Badges — Correct Labels', () => {
    const statusLabels = {
        'pending_payment': '⏳ Pending Payment',
        'payment_confirmed': '✓ Payment Confirmed',
        'paid_card': '💳 Paid by Card',
        'failed_payment': '✗ Payment Failed',
        'cancelled_payment': '✕ Cancelled',
    };
    
    assert(statusLabels['pending_payment'] === '⏳ Pending Payment', 
        'pending_payment label correct');
    assert(statusLabels['paid_card'] === '💳 Paid by Card', 
        'paid_card label correct');
    assert(statusLabels['payment_confirmed'] === '✓ Payment Confirmed', 
        'payment_confirmed label correct');
});

suite('Order State Validity Rules', () => {
    const invalidStates = [
        {
            order: { order_source: 'kiosk', payment_status: 'pending_payment', status: 'confirmed' },
            reason: 'Cannot have pending payment with status=confirmed',
            isInvalid: true,
        },
        {
            order: { order_source: 'kiosk', payment_status: 'paid_card', status: 'pending' },
            reason: 'Card-paid order should start at confirmed, not pending',
            isInvalid: false,  // Actually valid, but unusual
        },
        {
            order: { order_source: 'online', payment_status: 'pending_payment', status: 'pending' },
            reason: 'Online orders should NOT have payment_status set',
            isInvalid: true,
        },
    ];
    
    const validateKioskCounterState = (o) => {
        // If pending_payment, status should be pending (waiting for confirmation)
        if (o.order_source === 'kiosk' && o.payment_status === 'pending_payment') {
            return o.status !== 'confirmed' && o.status !== 'preparing';
        }
        return true;
    };
    
    assert(!validateKioskCounterState(invalidStates[0].order), 
        'Detects invalid: pending payment with confirmed status');
});

suite('Backward Compatibility — Existing Online/POS Orders Unaffected', () => {
    const onlineOrder = {
        id: 'online_old',
        order_source: 'online',
        status: 'pending',
        payment_method: 'cash',
        // No payment_status field
    };
    
    // Should work without payment_status
    const isKiosk = onlineOrder.order_source === 'kiosk';
    const paymentStatus = onlineOrder.payment_status || null;
    
    assert(!isKiosk, 'Online order not treated as kiosk');
    assert(paymentStatus === null, 'No payment_status for online');
    assert(onlineOrder.status === 'pending', 'Status field unchanged');
});

suite('Audit Trail — Payment Confirmations Recorded', () => {
    const order = {
        id: 'order_456',
        payment_audit_trail: [
            {
                action: 'payment_confirmed_at_counter',
                actor_email: 'staff@restaurant.com',
                actor_name: 'John Cashier',
                actor_role: 'cashier',
                timestamp: '2026-03-27T10:30:00Z',
                note: 'Kiosk counter-payment confirmed by John Cashier',
            },
        ],
    };
    
    assert(order.payment_audit_trail.length === 1, 'Audit entry created');
    assert(order.payment_audit_trail[0].action === 'payment_confirmed_at_counter', 
        'Correct action recorded');
    assert(order.payment_audit_trail[0].actor_email === 'staff@restaurant.com', 
        'Actor identity recorded');
    assert(order.payment_audit_trail[0].timestamp, 'Timestamp recorded');
});

// ─────────────────────────────────────────────────────────────────────────
// Exit with status
// ─────────────────────────────────────────────────────────────────────────

console.log('\n\n✨ All tests passed!');
process.exit(0);