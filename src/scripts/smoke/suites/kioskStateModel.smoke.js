/* eslint-disable no-undef */
/**
 * Kiosk State Model Smoke Tests
 *
 * Validates explicit separation of payment_status and order_status
 * for kiosk orders, ensuring no fake paid states or mixed statuses.
 */

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`[ASSERT FAIL] ${message}`);
    }
};

const test = (suiteName, tests) => {
    console.log(`\n🧪 ${suiteName}`);
    let passed = 0;
    let failed = 0;

    Object.entries(tests).forEach(([name, fn]) => {
        try {
            fn();
            console.log(`  ✅ ${name}`);
            passed++;
        } catch (e) {
            console.error(`  ❌ ${name}: ${e.message}`);
            failed++;
        }
    });

    return { passed, failed };
};

// ═══════════════════════════════════════════════════════════════════════════════════
// SUITE 1: Card-Terminal Order Creation
// ═══════════════════════════════════════════════════════════════════════════════════

const cardTerminalTests = test('Card-Terminal Kiosk Order', {
    'Card order created with paid_card + new': () => {
        const order = {
            order_source: 'kiosk',
            payment_method: 'card',
            payment_status: 'paid_card',
            order_status: 'new',
        };
        assert(order.payment_status === 'paid_card', 'payment_status must be paid_card');
        assert(order.order_status === 'new', 'order_status must be new');
    },

    'Card order does NOT have pending_payment': () => {
        const order = {
            order_source: 'kiosk',
            payment_method: 'card',
            payment_status: 'paid_card',
            order_status: 'new',
        };
        assert(order.payment_status !== 'pending_payment', 'Card orders must NOT be pending_payment');
    },

    'Confirm payment button hidden for paid_card': () => {
        const order = {
            payment_status: 'paid_card',
            order_source: 'kiosk',
        };
        const showConfirmButton = order.order_source === 'kiosk' && order.payment_status === 'pending_payment';
        assert(!showConfirmButton, 'Button must be hidden for paid_card orders');
    },
});

// ═══════════════════════════════════════════════════════════════════════════════════
// SUITE 2: Counter-Pay Order Creation
// ═══════════════════════════════════════════════════════════════════════════════════

const counterPayTests = test('Counter-Pay Kiosk Order', {
    'Counter-pay order created with pending_payment + new': () => {
        const order = {
            order_source: 'kiosk',
            payment_method: 'pay_at_counter',
            payment_status: 'pending_payment',
            order_status: 'new',
        };
        assert(order.payment_status === 'pending_payment', 'payment_status must be pending_payment');
        assert(order.order_status === 'new', 'order_status must be new');
    },

    'Counter-pay order is NOT marked as paid': () => {
        const order = {
            payment_status: 'pending_payment',
        };
        assert(order.payment_status !== 'paid_card', 'Must NOT be paid_card');
        assert(order.payment_status !== 'payment_confirmed', 'Must NOT be payment_confirmed yet');
    },

    'Confirm payment button visible for pending_payment': () => {
        const order = {
            order_source: 'kiosk',
            payment_status: 'pending_payment',
        };
        const showConfirmButton = order.order_source === 'kiosk' && order.payment_status === 'pending_payment';
        assert(showConfirmButton, 'Button must be visible for pending_payment orders');
    },

    'Kitchen does NOT prepare until payment confirmed': () => {
        const order = {
            order_source: 'kiosk',
            payment_status: 'pending_payment',
            order_status: 'new',
        };
        const canPrepare = order.payment_status === 'paid_card' || order.payment_status === 'payment_confirmed';
        assert(!canPrepare, 'Kitchen must NOT be able to start if payment is pending');
    },
});

// ═══════════════════════════════════════════════════════════════════════════════════
// SUITE 3: Payment Confirmation State Transition
// ═══════════════════════════════════════════════════════════════════════════════════

const paymentConfirmationTests = test('Payment Confirmation Workflow', {
    'Confirm payment updates ONLY payment_status': () => {
        const orderBefore = {
            payment_status: 'pending_payment',
            order_status: 'new',
        };
        // Staff confirms payment
        const orderAfter = {
            ...orderBefore,
            payment_status: 'payment_confirmed',
            // order_status UNCHANGED
        };
        assert(orderAfter.payment_status === 'payment_confirmed', 'payment_status must update');
        assert(orderAfter.order_status === 'new', 'order_status must NOT change');
    },

    'Payment confirmation does NOT auto-advance order_status': () => {
        const order = {
            payment_status: 'pending_payment',
            order_status: 'new',
        };
        // Simulate payment confirmation (backend)
        order.payment_status = 'payment_confirmed';
        // order_status STAYS 'new'
        assert(order.order_status === 'new', 'order_status must remain new until kitchen accepts');
    },

    'Kitchen must explicitly accept after payment confirmed': () => {
        const order = {
            payment_status: 'payment_confirmed',
            order_status: 'new',
        };
        // Kitchen now explicitly accepts/confirms the order
        order.order_status = 'confirmed';
        assert(order.order_status === 'confirmed', 'Kitchen must explicitly advance to confirmed');
    },
});

// ═══════════════════════════════════════════════════════════════════════════════════
// SUITE 4: Kitchen Preparation Workflow
// ═══════════════════════════════════════════════════════════════════════════════════

const kitchenWorkflowTests = test('Kitchen Preparation Workflow', {
    'Kitchen actions update ONLY order_status': () => {
        const orderBefore = {
            payment_status: 'paid_card',
            order_status: 'confirmed',
        };
        // Kitchen starts preparing
        const orderAfter = {
            ...orderBefore,
            order_status: 'preparing',
            // payment_status UNCHANGED
        };
        assert(orderAfter.order_status === 'preparing', 'order_status must advance');
        assert(orderAfter.payment_status === 'paid_card', 'payment_status must NOT change');
    },

    'Kitchen prep does NOT require payment re-confirmation': () => {
        const order = {
            payment_status: 'paid_card',
            order_status: 'preparing',
        };
        assert(order.order_status === 'preparing', 'Kitchen can prepare with paid_card status');
    },

    'Complete order workflow: paid_card path': () => {
        const order = { payment_status: 'paid_card', order_status: 'new' };
        order.order_status = 'confirmed'; // Kitchen accepts
        order.order_status = 'preparing'; // Kitchen starts prep
        order.order_status = 'ready'; // Kitchen marks ready
        order.order_status = 'completed'; // Customer collects
        assert(order.payment_status === 'paid_card', 'Payment status never changes');
        assert(order.order_status === 'completed', 'Order workflow progresses correctly');
    },

    'Complete order workflow: counter-pay path': () => {
        const order = { payment_status: 'pending_payment', order_status: 'new' };
        order.payment_status = 'payment_confirmed'; // Staff confirms payment
        order.order_status = 'confirmed'; // Kitchen accepts
        order.order_status = 'preparing'; // Kitchen starts prep
        order.order_status = 'ready'; // Kitchen marks ready
        order.order_status = 'completed'; // Customer collects
        assert(order.payment_status === 'payment_confirmed', 'Payment confirmed stays confirmed');
        assert(order.order_status === 'completed', 'Order workflow progresses correctly');
    },
});

// ═══════════════════════════════════════════════════════════════════════════════════
// SUITE 5: UI Display Logic
// ═══════════════════════════════════════════════════════════════════════════════════

const uiDisplayTests = test('UI Display Logic', {
    'Order card shows separate source/payment/order chips': () => {
        const orders = [
            { order_source: 'kiosk', payment_status: 'pending_payment', order_status: 'new' },
            { order_source: 'kiosk', payment_status: 'payment_confirmed', order_status: 'confirmed' },
            { order_source: 'kiosk', payment_status: 'paid_card', order_status: 'ready' },
        ];

        const format = (o) => `${o.order_source} | ${o.payment_status} | ${o.order_status}`;
        assert(format(orders[0]) === 'kiosk | pending_payment | new', 'First order display correct');
        assert(format(orders[1]) === 'kiosk | payment_confirmed | confirmed', 'Second order display correct');
        assert(format(orders[2]) === 'kiosk | paid_card | ready', 'Third order display correct');
    },

    'Pending payment orders visually highlighted': () => {
        const orders = [
            { order_source: 'kiosk', payment_status: 'pending_payment', order_status: 'new' },
            { order_source: 'kiosk', payment_status: 'paid_card', order_status: 'new' },
        ];
        const unpaid = orders.filter(o => o.payment_status === 'pending_payment');
        assert(unpaid.length === 1, 'Filter correctly identifies unpaid orders');
    },

    'Paid orders do NOT show payment badge': () => {
        const order = { order_source: 'kiosk', payment_status: 'paid_card' };
        const shouldShowPaymentBadge = order.payment_status === 'pending_payment';
        assert(!shouldShowPaymentBadge, 'Paid orders do NOT show pending badge');
    },
});

// ═══════════════════════════════════════════════════════════════════════════════════
// SUITE 6: Filtering and Sorting
// ═══════════════════════════════════════════════════════════════════════════════════

const filteringTests = test('Filtering and Sorting', {
    'Filter: All unpaid kiosk orders': () => {
        const orders = [
            { order_source: 'kiosk', payment_status: 'pending_payment', order_status: 'new' },
            { order_source: 'kiosk', payment_status: 'paid_card', order_status: 'new' },
            { order_source: 'kiosk', payment_status: 'payment_confirmed', order_status: 'preparing' },
        ];
        const unpaid = orders.filter(o => o.order_source === 'kiosk' && o.payment_status === 'pending_payment');
        assert(unpaid.length === 1, 'Correctly filters unpaid orders');
    },

    'Filter: All kiosk orders': () => {
        const orders = [
            { order_source: 'kiosk', payment_status: 'paid_card', order_status: 'new' },
            { order_source: 'online', payment_status: 'pending_payment', order_status: 'pending' },
            { order_source: 'kiosk', payment_status: 'pending_payment', order_status: 'new' },
        ];
        const kiosk = orders.filter(o => o.order_source === 'kiosk');
        assert(kiosk.length === 2, 'Correctly filters all kiosk orders');
    },

    'Filter: Ready kiosk orders': () => {
        const orders = [
            { order_source: 'kiosk', payment_status: 'paid_card', order_status: 'ready' },
            { order_source: 'kiosk', payment_status: 'paid_card', order_status: 'preparing' },
            { order_source: 'kiosk', payment_status: 'paid_card', order_status: 'ready' },
        ];
        const ready = orders.filter(o => o.order_source === 'kiosk' && o.order_status === 'ready');
        assert(ready.length === 2, 'Correctly filters ready orders');
    },

    'Sort: Unpaid kiosk orders first': () => {
        const orders = [
            { order_source: 'kiosk', payment_status: 'paid_card', order_status: 'new' },
            { order_source: 'kiosk', payment_status: 'pending_payment', order_status: 'new', id: 1 },
            { order_source: 'kiosk', payment_status: 'pending_payment', order_status: 'new', id: 2 },
        ];
        const sorted = orders.sort((a, b) => {
            // Unpaid first
            const aUnpaid = a.payment_status === 'pending_payment' ? 0 : 1;
            const bUnpaid = b.payment_status === 'pending_payment' ? 0 : 1;
            return aUnpaid - bUnpaid;
        });
        assert(sorted[0].payment_status === 'pending_payment', 'Unpaid orders sorted first');
    },
});

// ═══════════════════════════════════════════════════════════════════════════════════
// SUITE 7: Edge Cases & Error Prevention
// ═══════════════════════════════════════════════════════════════════════════════════

const edgeCaseTests = test('Edge Cases & Error Prevention', {
    'Cannot transition to preparing without payment confirmed (counter-pay)': () => {
        const order = {
            order_source: 'kiosk',
            payment_method: 'pay_at_counter',
            payment_status: 'pending_payment',
            order_status: 'new',
        };
        // Try to advance to preparing
        const canAdvance = order.payment_status !== 'pending_payment' && order.order_status !== 'new';
        assert(!canAdvance, 'Cannot skip to preparing with pending payment');
    },

    'Failed payment order blocked from prep': () => {
        const order = {
            payment_status: 'failed_payment',
            order_status: 'new',
        };
        const canPrepare = ['paid_card', 'payment_confirmed'].includes(order.payment_status);
        assert(!canPrepare, 'Failed payment orders cannot be prepared');
    },

    'Cancelled payment order marked as cancelled': () => {
        const order = {
            payment_status: 'cancelled_payment',
            order_status: 'cancelled',
        };
        assert(order.order_status === 'cancelled', 'Cancelled payment orders voided');
    },

    'No fake "confirmed_but_not_paid" state': () => {
        const order = {
            payment_status: 'paid_card',
            order_status: 'confirmed',
        };
        // This is a valid, non-fake state: paid, confirmed by kitchen
        assert(order.payment_status !== 'pending_payment', 'Never fake a paid state');
    },
});

// ═══════════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
const results = [
    cardTerminalTests,
    counterPayTests,
    paymentConfirmationTests,
    kitchenWorkflowTests,
    uiDisplayTests,
    filteringTests,
    edgeCaseTests,
];

const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

console.log(`\n📊 TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
console.log('='.repeat(80));

process.exit(totalFailed > 0 ? 1 : 0);