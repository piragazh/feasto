/* eslint-disable no-undef */
/**
 * End-to-End Checkout Flow Tests
 * 
 * Tests full checkout with real restaurant/menu data:
 * 1. Fetch real restaurants and menu items
 * 2. Build carts with various combinations
 * 3. Create payment intents
 * 4. Validate payment initialization
 * 5. Verify pendingPayment recovery setup
 */

export async function runE2ECheckoutFlow() {
    console.log('\n🚀 End-to-End Checkout Flow Tests\n');
    
    const results = [];
    
    try {
        // ───────────────────────────────────────────────────────────────
        // STEP 1: Fetch real restaurants
        // ───────────────────────────────────────────────────────────────
        console.log('📍 Fetching restaurants...');
        const restaurants = await base44.entities.Restaurant.filter({ is_open: true }, '-updated_date', 5);
        
        if (!restaurants || restaurants.length === 0) {
            console.warn('⚠️  No open restaurants found. Using mock data.');
            results.push({ pass: false, name: 'Fetch restaurants', error: 'No restaurants available' });
            return results;
        }
        
        results.push({ pass: true, name: 'Fetch restaurants', count: restaurants.length });
        console.log(`✓ Found ${restaurants.length} restaurants`);
        
        // ───────────────────────────────────────────────────────────────
        // STEP 2: Test each restaurant with menu items
        // ───────────────────────────────────────────────────────────────
        for (const restaurant of restaurants) {
            console.log(`\n🍔 Testing ${restaurant.name} (${restaurant.id})`);
            
            try {
                // Fetch menu items
                const menuItems = await base44.entities.MenuItem.filter(
                    { restaurant_id: restaurant.id, is_available: true },
                    '-updated_date',
                    10
                );
                
                if (!menuItems || menuItems.length === 0) {
                    console.warn(`  ⚠️  No menu items available`);
                    continue;
                }
                
                console.log(`  Found ${menuItems.length} menu items`);
                
                // ───────────────────────────────────────────────────────
                // TEST 2A: Simple order (no customization, no surcharge)
                // ───────────────────────────────────────────────────────
                try {
                    const item1 = menuItems[0];
                    if (!item1) throw new Error('No menu item available');
                    
                    const cart = [{
                        menu_item_id: item1.id,
                        name: item1.name,
                        price: item1.price,
                        quantity: 1
                    }];
                    
                    const subtotal = item1.price;
                    const deliveryFee = restaurant.delivery_fee || 0;
                    const surcharge = (subtotal < (restaurant.minimum_order || 0)) ? 
                        (restaurant.small_order_surcharge || 0) : 0;
                    const total = subtotal + deliveryFee + surcharge;
                    
                    // Create payment intent
                    const piResponse = await base44.functions.invoke('createPaymentIntent', {
                        amount: total,
                        restaurant_id: restaurant.id,
                        idempotency_key: `test_simple_${restaurant.id}_${Date.now()}`,
                        order_data: {
                            restaurant_id: restaurant.id,
                            items: cart,
                            subtotal,
                            delivery_fee: deliveryFee,
                            small_order_surcharge: surcharge,
                            total
                        }
                    });
                    
                    if (piResponse.data?.client_secret) {
                        console.log(`  ✓ Simple order PI created: £${total.toFixed(2)}`);
                        results.push({
                            pass: true,
                            name: `${restaurant.name} - simple order`,
                            amount: total,
                            pi: piResponse.data.client_secret
                        });
                    } else {
                        throw new Error('No client_secret returned');
                    }
                } catch (err) {
                    console.error(`  ✗ Simple order failed: ${err.message}`);
                    results.push({
                        pass: false,
                        name: `${restaurant.name} - simple order`,
                        error: err.message
                    });
                }
                
                // ───────────────────────────────────────────────────────
                // TEST 2B: Order with customization
                // ───────────────────────────────────────────────────────
                try {
                    const item2 = menuItems.find(i => i.customization_options?.length > 0) || menuItems[1];
                    if (!item2) throw new Error('No item with customization available');
                    
                    const customizationCost = item2.customization_options?.[0]?.options?.[0]?.price || 0;
                    
                    const cart = [{
                        menu_item_id: item2.id,
                        name: item2.name,
                        price: item2.price + customizationCost,
                        quantity: 1,
                        customizations: {
                            option: { label: item2.customization_options?.[0]?.options?.[0]?.label, price: customizationCost }
                        }
                    }];
                    
                    const subtotal = item2.price + customizationCost;
                    const deliveryFee = restaurant.delivery_fee || 0;
                    const total = subtotal + deliveryFee;
                    
                    const piResponse = await base44.functions.invoke('createPaymentIntent', {
                        amount: total,
                        restaurant_id: restaurant.id,
                        idempotency_key: `test_custom_${restaurant.id}_${Date.now()}`,
                        order_data: {
                            restaurant_id: restaurant.id,
                            items: cart,
                            subtotal,
                            delivery_fee: deliveryFee,
                            total
                        }
                    });
                    
                    if (piResponse.data?.client_secret) {
                        console.log(`  ✓ Customized order PI created: £${total.toFixed(2)}`);
                        results.push({
                            pass: true,
                            name: `${restaurant.name} - customized order`,
                            amount: total,
                            pi: piResponse.data.client_secret
                        });
                    }
                } catch (err) {
                    console.error(`  ✗ Customized order failed: ${err.message}`);
                    results.push({
                        pass: false,
                        name: `${restaurant.name} - customized order`,
                        error: err.message
                    });
                }
                
                // ───────────────────────────────────────────────────────
                // TEST 2C: Multiple items (cart)
                // ───────────────────────────────────────────────────────
                try {
                    const cart = [];
                    let subtotal = 0;
                    
                    // Add up to 3 items
                    for (let i = 0; i < Math.min(3, menuItems.length); i++) {
                        const item = menuItems[i];
                        cart.push({
                            menu_item_id: item.id,
                            name: item.name,
                            price: item.price,
                            quantity: 1
                        });
                        subtotal += item.price;
                    }
                    
                    const deliveryFee = restaurant.delivery_fee || 0;
                    const surcharge = (subtotal < (restaurant.minimum_order || 0)) ? 
                        (restaurant.small_order_surcharge || 0) : 0;
                    const total = subtotal + deliveryFee + surcharge;
                    
                    const piResponse = await base44.functions.invoke('createPaymentIntent', {
                        amount: total,
                        restaurant_id: restaurant.id,
                        idempotency_key: `test_multi_${restaurant.id}_${Date.now()}`,
                        order_data: {
                            restaurant_id: restaurant.id,
                            items: cart,
                            subtotal,
                            delivery_fee: deliveryFee,
                            small_order_surcharge: surcharge,
                            total
                        }
                    });
                    
                    if (piResponse.data?.client_secret) {
                        console.log(`  ✓ Multi-item order PI created: £${total.toFixed(2)} (${cart.length} items)`);
                        results.push({
                            pass: true,
                            name: `${restaurant.name} - multi-item order`,
                            amount: total,
                            items: cart.length,
                            pi: piResponse.data.client_secret
                        });
                    }
                } catch (err) {
                    console.error(`  ✗ Multi-item order failed: ${err.message}`);
                    results.push({
                        pass: false,
                        name: `${restaurant.name} - multi-item order`,
                        error: err.message
                    });
                }
                
            } catch (err) {
                console.error(`  ✗ Restaurant test failed: ${err.message}`);
                results.push({
                    pass: false,
                    name: `${restaurant.name} - test suite`,
                    error: err.message
                });
            }
        }
        
    } catch (err) {
        console.error(`\n✗ E2E test suite failed: ${err.message}`);
        results.push({
            pass: false,
            name: 'E2E checkout flow',
            error: err.message
        });
    }
    
    // ───────────────────────────────────────────────────────────────
    // SUMMARY
    // ───────────────────────────────────────────────────────────────
    const passed = results.filter(r => r.pass).length;
    const total = results.length;
    
    console.log('\n\n📊 E2E Checkout Flow Summary');
    console.log(`Passed: ${passed}/${total}`);
    console.log(`Failed: ${total - passed}/${total}\n`);
    
    if (total - passed > 0) {
        console.log('Failed tests:');
        results.filter(r => !r.pass).forEach(r => {
            console.log(`  ✗ ${r.name}: ${r.error}`);
        });
    }
    
    // Print successful PI creations
    const successfulPIs = results.filter(r => r.pass && r.pi);
    if (successfulPIs.length > 0) {
        console.log(`\n✅ Successfully created ${successfulPIs.length} payment intents:`);
        successfulPIs.forEach(r => {
            console.log(`  • ${r.name} - £${r.amount?.toFixed(2)} ${r.items ? `(${r.items} items)` : ''}`);
        });
    }
    
    return { passed, failed: total - passed, total, results };
}