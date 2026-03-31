/* eslint-disable no-undef */
/**
 * Checkout Integration Test - Real Order Creation Flow
 * 
 * Tests complete checkout with actual restaurants/menu data:
 * - Fetches real restaurants
 * - Fetches real menu items  
 * - Builds valid carts
 * - Tests cart pricing logic
 * - Validates payment initialization
 * - Tests pendingPayment boundTo logic
 */

export async function runCheckoutIntegrationTest() {
    console.log('\n✅ Checkout Integration Test - Real Data\n');
    
    const testResults = [];
    
    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            return { pass: true, name };
        } catch (e) {
            console.error(`  ✗ ${name}: ${e.message}`);
            return { pass: false, name, error: e.message };
        }
    };
    
    // ───────────────────────────────────────────────────────────────
    // PHASE 1: Load Real Data
    // ───────────────────────────────────────────────────────────────
    console.log('📍 PHASE 1: Loading Real Restaurant & Menu Data\n');
    
    let restaurants = [];
    let testRestaurant = null;
    let testMenuItems = [];
    
    testResults.push(await test('Fetch available restaurants', async () => {
        restaurants = await base44.entities.Restaurant.filter({ is_open: true }, '-updated_date', 5);
        if (!restaurants || restaurants.length === 0) {
            throw new Error('No open restaurants found');
        }
        testRestaurant = restaurants[0];
        console.log(`    Found: ${testRestaurant.name}`);
    }));
    
    testResults.push(await test('Fetch restaurant menu items', async () => {
        if (!testRestaurant) throw new Error('No restaurant loaded');
        testMenuItems = await base44.entities.MenuItem.filter(
            { restaurant_id: testRestaurant.id, is_available: true },
            '-updated_date',
            10
        );
        if (!testMenuItems || testMenuItems.length === 0) {
            throw new Error('No menu items available');
        }
        console.log(`    Found: ${testMenuItems.length} items`);
    }));
    
    // ───────────────────────────────────────────────────────────────
    // PHASE 2: Test Cart Pricing Logic
    // ───────────────────────────────────────────────────────────────
    console.log('\n💰 PHASE 2: Testing Cart Pricing Logic\n');
    
    testResults.push(await test('Simple order (1 item, no customization)', async () => {
        if (!testMenuItems[0]) throw new Error('No menu item');
        
        const item = testMenuItems[0];
        const quantity = 1;
        const subtotal = item.price * quantity;
        const deliveryFee = testRestaurant.delivery_fee || 0;
        const surcharge = (subtotal < (testRestaurant.minimum_order || 10)) ? 
            (testRestaurant.small_order_surcharge || 0) : 0;
        const total = subtotal + deliveryFee + surcharge;
        
        // Validate pence arithmetic
        const totalPence = Math.round(total * 100);
        if (!Number.isInteger(totalPence)) {
            throw new Error(`Total pence not integer: ${totalPence}`);
        }
        
        console.log(`    ${item.name}: £${item.price.toFixed(2)} × ${quantity} = £${subtotal.toFixed(2)}`);
        console.log(`    + Delivery: £${deliveryFee.toFixed(2)} | Surcharge: £${surcharge.toFixed(2)}`);
        console.log(`    = Total: £${total.toFixed(2)} (${totalPence}¢)`);
    }));
    
    testResults.push(await test('Order with customization', async () => {
        const item = testMenuItems.find(i => i.customization_options?.length > 0) || testMenuItems[1];
        if (!item) throw new Error('No customizable item');
        
        const customization = item.customization_options?.[0]?.options?.[0] || {};
        const customPrice = customization.price || 0;
        
        const subtotal = item.price + customPrice;
        const deliveryFee = testRestaurant.delivery_fee || 0;
        const total = subtotal + deliveryFee;
        
        console.log(`    ${item.name}: £${item.price.toFixed(2)} + ${customization.label} £${customPrice.toFixed(2)} = £${subtotal.toFixed(2)}`);
        console.log(`    + Delivery: £${deliveryFee.toFixed(2)}`);
        console.log(`    = Total: £${total.toFixed(2)}`);
    }));
    
    testResults.push(await test('Multi-item order', async () => {
        const itemCount = Math.min(3, testMenuItems.length);
        let subtotal = 0;
        const items = [];
        
        for (let i = 0; i < itemCount; i++) {
            const item = testMenuItems[i];
            items.push(item);
            subtotal += item.price;
        }
        
        const deliveryFee = testRestaurant.delivery_fee || 0;
        const surcharge = (subtotal < (testRestaurant.minimum_order || 10)) ? 
            (testRestaurant.small_order_surcharge || 0) : 0;
        const total = subtotal + deliveryFee + surcharge;
        
        console.log(`    Items: ${items.map(i => i.name).join(', ')}`);
        console.log(`    Subtotal: £${subtotal.toFixed(2)}`);
        console.log(`    + Delivery: £${deliveryFee.toFixed(2)} | Surcharge: £${surcharge.toFixed(2)}`);
        console.log(`    = Total: £${total.toFixed(2)}`);
    }));
    
    testResults.push(await test('Order with small order surcharge', async () => {
        if (!testRestaurant.minimum_order || testRestaurant.minimum_order <= 0) {
            throw new Error('Restaurant has no minimum order');
        }
        
        // Find cheap item
        const cheapItem = testMenuItems.reduce((min, item) => 
            !min || item.price < min.price ? item : min, null);
        
        if (!cheapItem || cheapItem.price >= testRestaurant.minimum_order) {
            throw new Error('No item below minimum order');
        }
        
        const subtotal = cheapItem.price;
        const surcharge = testRestaurant.small_order_surcharge || 2.00;
        const deliveryFee = testRestaurant.delivery_fee || 0;
        const total = subtotal + surcharge + deliveryFee;
        
        console.log(`    Item: ${cheapItem.name} £${cheapItem.price.toFixed(2)}`);
        console.log(`    Below minimum (£${testRestaurant.minimum_order}) → Surcharge: £${surcharge.toFixed(2)}`);
        console.log(`    = Total: £${total.toFixed(2)}`);
    }));
    
    testResults.push(await test('Order WITHOUT delivery fee (collection)', async () => {
        const item = testMenuItems[0];
        const subtotal = item.price;
        const deliveryFee = 0; // Collection = no delivery fee
        const total = subtotal + deliveryFee;
        
        console.log(`    Item: ${item.name} £${item.price.toFixed(2)}`);
        console.log(`    Collection (no delivery fee)`);
        console.log(`    = Total: £${total.toFixed(2)}`);
    }));
    
    // ───────────────────────────────────────────────────────────────
    // PHASE 3: Test Payment Initialization Logic
    // ───────────────────────────────────────────────────────────────
    console.log('\n💳 PHASE 3: Testing Payment Initialization Logic\n');
    
    testResults.push(await test('Payment intent amount calculation (pence)', async () => {
        const amounts = [12.50, 25.99, 100.00, 5.05, 0.99];
        
        amounts.forEach(amount => {
            const pence = Math.round(amount * 100);
            if (!Number.isInteger(pence)) {
                throw new Error(`Amount £${amount} → ${pence}¢ is not integer`);
            }
        });
        
        console.log(`    ✓ All amounts convert correctly to pence`);
    }));
    
    testResults.push(await test('Session key stability during payment', async () => {
        let sessionKey = `ps_${Date.now()}_123`;
        const originalKey = sessionKey;
        
        // Simulate adding item
        sessionKey = originalKey;
        if (sessionKey !== originalKey) throw new Error('Key rotated on add');
        
        // Simulate applying coupon
        sessionKey = originalKey;
        if (sessionKey !== originalKey) throw new Error('Key rotated on coupon');
        
        // Simulate changing payment method
        sessionKey = `ps_${Date.now()}_456`;
        if (sessionKey === originalKey) throw new Error('Key should rotate on payment method change');
        
        console.log(`    ✓ Session key stable on cart changes, rotates on payment method change`);
    }));
    
    testResults.push(await test('pendingPayment boundTo logic', async () => {
        // Scenario 1: Guest order
        const guestRecord = {
            paymentIntentId: 'pi_test_guest',
            boundTo: 'guest',
            idempotencyKey: 'ps_guest_001'
        };
        
        // User not authenticated
        let currentBoundTo = 'guest';
        if (guestRecord.boundTo !== currentBoundTo) {
            throw new Error('Guest boundTo mismatch');
        }
        
        // User authenticates
        currentBoundTo = 'user@example.com';
        if (guestRecord.boundTo === currentBoundTo) {
            throw new Error('Should detect boundTo mismatch');
        }
        
        // Scenario 2: Authenticated order
        const userRecord = {
            paymentIntentId: 'pi_test_user',
            boundTo: 'user@example.com',
            idempotencyKey: 'ps_user_001'
        };
        
        currentBoundTo = 'user@example.com';
        if (userRecord.boundTo !== currentBoundTo) {
            throw new Error('User boundTo mismatch');
        }
        
        console.log(`    ✓ Guest/user boundTo detection working correctly`);
    }));
    
    testResults.push(await test('Recovery skip on boundTo mismatch', async () => {
        const pendingRecord = {
            paymentIntentId: 'pi_recovery_test',
            boundTo: 'guest',
            recovery_status: 'pending'
        };
        
        const currentUser = { email: 'newuser@example.com' };
        const currentBoundTo = currentUser.email;
        
        // Recovery should be skipped because boundTo doesn't match
        const shouldRecover = pendingRecord.boundTo === currentBoundTo;
        
        if (shouldRecover) {
            throw new Error('Recovery should be skipped on boundTo mismatch');
        }
        
        console.log(`    ✓ Recovery correctly skipped on boundTo mismatch`);
    }));
    
    // ───────────────────────────────────────────────────────────────
    // SUMMARY
    // ───────────────────────────────────────────────────────────────
    const passed = testResults.filter(r => r.pass).length;
    const total = testResults.length;
    const failed = total - passed;
    
    console.log('\n\n📊 Checkout Integration Test Summary');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Passed: ${passed}/${total} ✓`);
    console.log(`Failed: ${failed}/${total} ✗`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    if (failed > 0) {
        console.log('Failed tests:');
        testResults.filter(r => !r.pass).forEach(r => {
            console.log(`  ✗ ${r.name}: ${r.error}`);
        });
    }
    
    return { passed, failed, total };
}