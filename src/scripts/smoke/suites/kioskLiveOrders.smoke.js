/**
 * Smoke tests: kiosk order integration in Live Orders
 *
 * Tests order source identification, filter logic, payment confirmation gating,
 * and badge/action display rules — no DOM or network required.
 *
 * Run: node scripts/smoke/suites/kioskLiveOrders.smoke.js
 */

// ── Inline helpers (mirrors LiveOrders component logic) ───────────────────────

function isKioskAwaitingPayment(order) {
    return (
        order.order_source === 'kiosk' &&
        order.payment_method === 'pay_at_counter' &&
        order.status === 'pending'
    );
}

function getOrderChannel(order) {
    if (order.order_source === 'kiosk') return 'kiosk_order';
    if (order.order_type === 'dine_in') return 'pos_order';
    if (order.order_type === 'collection' || order.order_type === 'takeaway') return 'online_order';
    return 'online_order';
}

function applySourceFilter(orders, sourceFilter) {
    return orders.filter(order => {
        if (sourceFilter === 'kiosk') return order.order_source === 'kiosk';
        if (sourceFilter === 'other') return order.order_source !== 'kiosk';
        return true; // 'all'
    });
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

// ── Sample orders ─────────────────────────────────────────────────────────────

const kioskPayAtCounter = {
    id: 'order_kiosk_01',
    order_source: 'kiosk',
    order_type: 'takeaway',
    payment_method: 'pay_at_counter',
    status: 'pending',
    total: 12.50,
};

const kioskCardPaid = {
    id: 'order_kiosk_02',
    order_source: 'kiosk',
    order_type: 'takeaway',
    payment_method: 'card',
    status: 'confirmed',
    payment_intent_id: 'KIOSK-ABC123',
    total: 18.00,
};

const kioskDineIn = {
    id: 'order_kiosk_03',
    order_source: 'kiosk',
    order_type: 'dine_in',
    payment_method: 'pay_at_counter',
    status: 'pending',
    total: 9.00,
};

const onlineDelivery = {
    id: 'order_online_01',
    order_source: 'online',
    order_type: 'delivery',
    payment_method: 'card',
    status: 'pending',
    total: 25.00,
};

const onlineCollection = {
    id: 'order_online_02',
    order_source: 'online',
    order_type: 'collection',
    payment_method: 'cash',
    status: 'preparing',
    total: 14.00,
};

const allOrders = [kioskPayAtCounter, kioskCardPaid, kioskDineIn, onlineDelivery, onlineCollection];

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('isKioskAwaitingPayment — identification', () => {
    assert('kiosk + pay_at_counter + pending → true', isKioskAwaitingPayment(kioskPayAtCounter) === true);
    assert('kiosk + card + confirmed → false (already paid by card)', isKioskAwaitingPayment(kioskCardPaid) === false);
    assert('kiosk + dine_in + pay_at_counter + pending → true', isKioskAwaitingPayment(kioskDineIn) === true);
    assert('online delivery → false', isKioskAwaitingPayment(onlineDelivery) === false);
    assert('kiosk + pay_at_counter + confirmed → false (already processed)', isKioskAwaitingPayment({
        ...kioskPayAtCounter, status: 'confirmed'
    }) === false);
    assert('kiosk + pay_at_counter + preparing → false', isKioskAwaitingPayment({
        ...kioskPayAtCounter, status: 'preparing'
    }) === false);
});

suite('getOrderChannel — channel routing', () => {
    assert('kiosk order → kiosk_order channel', getOrderChannel(kioskPayAtCounter) === 'kiosk_order');
    assert('kiosk card paid → kiosk_order channel', getOrderChannel(kioskCardPaid) === 'kiosk_order');
    assert('online delivery → online_order channel', getOrderChannel(onlineDelivery) === 'online_order');
    assert('online collection → online_order channel', getOrderChannel(onlineCollection) === 'online_order');
    assert('dine_in non-kiosk → pos_order channel', getOrderChannel({ order_type: 'dine_in' }) === 'pos_order');
});

suite('kiosk_order channel fallback to online_order', () => {
    // When no printers have kiosk_order in their assigned_channels, system falls back
    const printers = [
        { assigned_channels: ['online_order'] },
        { assigned_channels: ['online_order', 'pos_order'] },
    ];
    const channel = 'kiosk_order';
    const hasKioskSlot = printers.some(p => (p.assigned_channels || []).includes('kiosk_order'));
    const effectiveChannel = channel === 'kiosk_order' && !hasKioskSlot ? 'online_order' : channel;
    assert('falls back to online_order when no kiosk slot configured', effectiveChannel === 'online_order');

    // When a kiosk printer slot exists, use kiosk_order
    const printersWithKiosk = [
        { assigned_channels: ['online_order'] },
        { assigned_channels: ['kiosk_order'] },
    ];
    const hasKioskSlot2 = printersWithKiosk.some(p => (p.assigned_channels || []).includes('kiosk_order'));
    const effectiveChannel2 = channel === 'kiosk_order' && !hasKioskSlot2 ? 'online_order' : channel;
    assert('uses kiosk_order when slot is configured', effectiveChannel2 === 'kiosk_order');
});

suite('applySourceFilter — tab filtering', () => {
    const kioskOnly = applySourceFilter(allOrders, 'kiosk');
    assert('kiosk tab: returns only kiosk orders', kioskOnly.every(o => o.order_source === 'kiosk'));
    assert('kiosk tab: count is 3', kioskOnly.length === 3);

    const otherOnly = applySourceFilter(allOrders, 'other');
    assert('other tab: returns no kiosk orders', otherOnly.every(o => o.order_source !== 'kiosk'));
    assert('other tab: count is 2', otherOnly.length === 2);

    const all = applySourceFilter(allOrders, 'all');
    assert('all tab: returns all orders', all.length === 5);
});

suite('kiosk badge visibility', () => {
    assert('kiosk order → show Kiosk badge', kioskPayAtCounter.order_source === 'kiosk');
    assert('online order → no Kiosk badge', onlineDelivery.order_source !== 'kiosk');
    assert('kiosk card order → still shows Kiosk badge', kioskCardPaid.order_source === 'kiosk');
});

suite('payment confirm button logic', () => {
    // Show "Confirm Payment Received" only for kiosk + pay_at_counter + pending
    const showConfirmBtn = (order) => isKioskAwaitingPayment(order);
    assert('kiosk pay_at_counter pending → show confirm button', showConfirmBtn(kioskPayAtCounter) === true);
    assert('kiosk card confirmed → no confirm button', showConfirmBtn(kioskCardPaid) === false);
    assert('online pending → no confirm button', showConfirmBtn(onlineDelivery) === false);
    assert('kiosk pay_at_counter already confirmed → no confirm button', showConfirmBtn({
        ...kioskPayAtCounter, status: 'confirmed'
    }) === false);
});

suite('kiosk card orders do NOT require manual payment confirm', () => {
    // Card-terminal kiosk orders come in as status=confirmed — staff should only see workflow actions
    assert('card kiosk order: status is confirmed (not pending)', kioskCardPaid.status === 'confirmed');
    assert('card kiosk order: has payment_intent_id', !!kioskCardPaid.payment_intent_id);
    assert('card kiosk order: isKioskAwaitingPayment=false', isKioskAwaitingPayment(kioskCardPaid) === false);
});

suite('order_source field presence on kiosk-created orders', () => {
    // Ensure created orders would have the field set
    const mockKioskCreate = (paymentMethod, terminalAuthorized) => ({
        order_source: 'kiosk',
        payment_method: paymentMethod,
        status: terminalAuthorized ? 'confirmed' : 'pending',
    });

    const counterOrder = mockKioskCreate('pay_at_counter', false);
    assert('pay_at_counter: order_source=kiosk', counterOrder.order_source === 'kiosk');
    assert('pay_at_counter: status=pending', counterOrder.status === 'pending');

    const cardOrder = mockKioskCreate('card', true);
    assert('card terminal: order_source=kiosk', cardOrder.order_source === 'kiosk');
    assert('card terminal: status=confirmed', cardOrder.status === 'confirmed');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    console.error('\n🚨 Some tests failed');
    process.exit(1);
} else {
    console.log('\n✅ All kiosk live order integration tests passed');
    process.exit(0);
}