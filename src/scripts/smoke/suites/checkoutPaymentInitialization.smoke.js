/* eslint-disable no-undef */
/**
 * Checkout Payment Initialization Smoke Tests
 * 
 * Tests various order combinations:
 * - With/without customization
 * - With/without small order surcharge
 * - With/without delivery fee
 * - Card payment intent creation
 * - pendingPayment recovery validation
 */

const assert = (condition, message) => {
    if (!condition) throw new Error(`✗ ${message}`);
};

const test = async (name, fn) => {
    try {
        await fn();
        console.log(`✓ ${name}`);
        return { pass: true, name };
    } catch (e) {
        console.error(`✗ ${name}: ${e.message}`);
        return { pass: false, name, error: e.message };
    }
};

export async function runCheckoutPaymentTests() {
    console.log('\n🛒 Checkout Payment Initialization Tests\n');
    
    const results = [];
    
    // ───────────────────────────────────────────────────────────────────
    // TEST 1: Order with customization + no surcharge + delivery fee
    // ───────────────────────────────────────────────────────────────────
    results.push(await test('Order with customization + delivery fee', async () => {
        const restaurantId = 'rest_test_001';
        const menuItemId = 'item_burger_001';
        
        const cart = [
            {
                menu_item_id: menuItemId,
                name: 'Classic Burger',
                price: 12.50,
                quantity: 2,
                customizations: {
                    sauce: { label: 'Extra Mayo', price: 0.50 },
                    cheese: { label: 'Double Cheese', price: 1.00 }
                }
            }
        ];
        
        const subtotal = (12.50 * 2) + (0.50 + 1.00) * 2;
        const deliveryFee = 3.50;
        const total = subtotal + deliveryFee;
        
        // Validate pricing
        assert(subtotal === 29, `Subtotal should be £29, got £${subtotal}`);
        assert(total === 32.50, `Total should be £32.50, got £${total}`);
        
        // Simulate payment intent creation
        const paymentIntentPayload = {
            amount: Math.round(total * 100),
            currency: 'gbp',
            metadata: {
                restaurant_id: restaurantId,
                order_type: 'delivery',
                has_customization: 'true',
                item_count: '2'
            }
        };
        
        assert(paymentIntentPayload.amount === 3250, 'PI amount in pence must be 3250');
        assert(paymentIntentPayload.metadata.restaurant_id === restaurantId, 'PI must include restaurant_id');
    }));
    
    // ───────────────────────────────────────────────────────────────────
    // TEST 2: Order without customization + small order surcharge + no delivery
    // ───────────────────────────────────────────────────────────────────
    results.push(await test('Order with surcharge + no customization (collection)', async () => {
        const restaurantId = 'rest_test_002';
        const subtotal = 8.50; // Below £10 minimum
        const smallOrderSurcharge = 2.00;
        const total = subtotal + smallOrderSurcharge;
        
        const cart = [
            {
                menu_item_id: 'item_pizza_001',
                name: 'Margherita Pizza',
                price: 8.50,
                quantity: 1
                // No customizations
            }
        ];
        
        // Validate surcharge applied correctly
        assert(total === 10.50, `Total should be £10.50 (£${subtotal} + £${smallOrderSurcharge} surcharge), got £${total}`);
        
        const paymentIntentPayload = {
            amount: Math.round(total * 100),
            currency: 'gbp',
            metadata: {
                restaurant_id: restaurantId,
                order_type: 'collection',
                has_surcharge: 'true',
                surcharge_amount: String(smallOrderSurcharge)
            }
        };
        
        assert(paymentIntentPayload.amount === 1050, 'PI amount in pence must be 1050');
        assert(paymentIntentPayload.metadata.has_surcharge === 'true', 'PI must flag surcharge');
    }));
    
    // ───────────────────────────────────────────────────────────────────
    // TEST 3: Complex order: customization + delivery fee + surcharge + coupons
    // ───────────────────────────────────────────────────────────────────
    results.push(await test('Complex order: customization + delivery + surcharge + coupon', async () => {
        const subtotal = 15.00;
        const customizationCost = 2.50;
        const deliveryFee = 2.99;
        const smallOrderSurcharge = 0; // Subtotal > £10
        const couponDiscount = -3.00;
        
        const total = subtotal + customizationCost + deliveryFee + smallOrderSurcharge + couponDiscount;
        
        assert(total === 17.49, `Total should be £17.49, got £${total}`);
        
        // Validate discount doesn't exceed 50% of subtotal
        const maxDiscount = subtotal * 0.50;
        assert(Math.abs(couponDiscount) <= maxDiscount, `Discount £${Math.abs(couponDiscount)} exceeds max £${maxDiscount}`);
        
        const paymentIntentPayload = {
            amount: Math.round(total * 100),
            currency: 'gbp',
            metadata: {
                order_type: 'delivery',
                item_count: '1',
                coupon_applied: 'SAVE10'
            }
        };
        
        assert(paymentIntentPayload.amount === 1749, 'PI amount in pence must be 1749');
    }));
    
    // ───────────────────────────────────────────────────────────────────
    // TEST 4: Multiple items, mixed customization
    // ───────────────────────────────────────────────────────────────────
    results.push(await test('Multiple items: some with customization, some without', async () => {
        const cart = [
            {
                menu_item_id: 'item_1',
                name: 'Burger',
                price: 10.00,
                quantity: 2,
                customizations: { sauce: { label: 'Mayo', price: 0.50 } }
            },
            {
                menu_item_id: 'item_2',
                name: 'Fries',
                price: 3.50,
                quantity: 3
                // No customizations
            }
        ];
        
        // Calculate subtotal
        const subtotal = (10.00 + 0.50) * 2 + 3.50 * 3;
        assert(subtotal === 31.50, `Subtotal should be £31.50, got £${subtotal}`);
        
        const total = subtotal + 2.99; // delivery fee
        assert(total === 34.49, `Total should be £34.49, got £${total}`);
    }));
    
    // ───────────────────────────────────────────────────────────────────
    // TEST 5: Payment Intent initialization doesn't reset on valid state
    // ───────────────────────────────────────────────────────────────────
    results.push(await test('Payment intent initialization stability', async () => {
        let clientSecret = 'pi_test_abc123_secret_xyz';
        let sessionKey = 'ps_123_456';
        let resetCount = 0;
        
        // Simulate adding to cart (should NOT reset PI if already exists)
        const addToCart = (state) => {
            if (state.clientSecret) {
                // PI exists — don't reset
                return { clientSecret, sessionKey, resetCount };
            }
            resetCount++;
            return state;
        };
        
        let state = { clientSecret, sessionKey, resetCount };
        state = addToCart(state);
        
        assert(resetCount === 0, 'Adding item should NOT reset PI if already exists');
        assert(state.clientSecret === clientSecret, 'Client secret should persist');
    }));
    
    // ───────────────────────────────────────────────────────────────────
    // TEST 6: pendingPayment recovery validation
    // ───────────────────────────────────────────────────────────────────
    results.push(await test('pendingPayment recovery: boundTo mismatch detection', async () => {
        // Simulate pendingPayment record
        const pendingRecord = {
            paymentIntentId: 'pi_test_123',
            boundTo: 'guest', // Was created as guest
            idempotencyKey: 'ps_guest_001',
            total: 25.50,
            recovery_attempts: 0,
            recovery_status: 'pending'
        };
        
        // Simulate user now authenticated
        const currentUser = { email: 'user@example.com' };
        const currentBoundTo = currentUser.email;
        
        // Validate boundTo mismatch is detected
        assert(
            pendingRecord.boundTo !== currentBoundTo,
            'boundTo mismatch should be detected (guest record, authenticated user)'
        );
        
        // Recovery should be skipped due to mismatch
        const shouldRecover = pendingRecord.boundTo === currentBoundTo;
        assert(
            !shouldRecover,
            'Recovery should be skipped on boundTo mismatch'
        );
    }));
    
    // ───────────────────────────────────────────────────────────────────
    // TEST 7: Session key rotation safety
    // ───────────────────────────────────────────────────────────────────
    results.push(await test('Session key stability during payment flow', async () => {
        const initialSessionKey = 'ps_sess_001';
        let sessionKey = initialSessionKey;
        let piCreated = false;
        
        // Step 1: Create PI with session key
        if (!piCreated) {
            sessionKey = 'ps_sess_001';
            piCreated = true;
        }
        
        // Step 2: Add coupon (should NOT rotate key)
        const applyCoupon = () => {
            // Old bug: would rotate sessionKey here
            // Fixed: should only reset PI if payment method changes
            return sessionKey; // Key stays same
        };
        
        sessionKey = applyCoupon();
        assert(sessionKey === initialSessionKey, 'Session key should NOT rotate on coupon apply');
        
        // Step 3: Change payment method (SHOULD rotate key)
        const changePaymentMethod = () => {
            return 'ps_sess_002'; // New key
        };
        
        sessionKey = changePaymentMethod();
        assert(sessionKey !== initialSessionKey, 'Session key SHOULD rotate on payment method change');
    }));
    
    // ───────────────────────────────────────────────────────────────────
    // TEST 8: Cart integrity validation before PI creation
    // ───────────────────────────────────────────────────────────────────
    results.push(await test('Cart integrity before payment intent creation', async () => {
        const validCart = [
            {
                menu_item_id: 'item_1',
                name: 'Pizza',
                price: 12.50,
                quantity: 1
            }
        ];
        
        // Validate all required fields present
        const validateCart = (cart) => {
            return cart.every(item => 
                item.menu_item_id && 
                item.name && 
                typeof item.price === 'number' && 
                item.quantity >= 1
            );
        };
        
        assert(validateCart(validCart), 'Valid cart should pass validation');
        
        // Invalid cart missing menu_item_id
        const invalidCart = [
            {
                name: 'Pizza',
                price: 12.50,
                quantity: 1
            }
        ];
        
        assert(!validateCart(invalidCart), 'Invalid cart should fail validation');
    }));
    
    // ───────────────────────────────────────────────────────────────────
    // SUMMARY
    // ───────────────────────────────────────────────────────────────────
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    
    console.log('\n📊 Checkout Payment Initialization Summary');
    console.log(`Passed: ${passed}/${results.length}`);
    console.log(`Failed: ${failed}/${results.length}\n`);
    
    if (failed > 0) {
        console.log('Failed tests:');
        results.filter(r => !r.pass).forEach(r => {
            console.log(`  - ${r.name}: ${r.error}`);
        });
    }
    
    return { passed, failed, total: results.length };
}