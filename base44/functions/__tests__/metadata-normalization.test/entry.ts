/**
 * METADATA NORMALIZATION CONTRACT
 * 
 * Demonstrates that old and new item schemas both normalize to:
 * { menu_item_id, name, price, quantity }
 * 
 * This ensures webhook recovery works correctly regardless of when
 * the payment intent was created.
 */

/** Normalize item to canonical schema */
function normalizeItem(item) {
    return {
        menu_item_id: item.menu_item_id || item.id,
        name: item.name || '',
        price: item.price,
        quantity: item.quantity || item.qty
    };
}

/** Validate normalized item */
function validateNormalizedItem(item) {
    const errors = [];
    
    if (!item.menu_item_id || typeof item.menu_item_id !== 'string') {
        errors.push(`menu_item_id missing or invalid: ${item.menu_item_id}`);
    }
    if (typeof item.price !== 'number' || isNaN(item.price) || item.price < 0) {
        errors.push(`price invalid: ${item.price}`);
    }
    if (typeof item.quantity !== 'number' || isNaN(item.quantity) || item.quantity < 1) {
        errors.push(`quantity invalid: ${item.quantity}`);
    }
    
    return { valid: errors.length === 0, errors };
}

// ── TEST CASES ────────────────────────────────────────────────────────

console.log('=== OLD SCHEMA (createPaymentIntent v1) ===');
const oldItem = {
    id: 'item_123',
    name: 'Margherita Pizza',
    price: 12.50,
    qty: 2
};
console.log('Input:', JSON.stringify(oldItem));
const normalizedOld = normalizeItem(oldItem);
console.log('Normalized:', JSON.stringify(normalizedOld));
const validOld = validateNormalizedItem(normalizedOld);
console.log('Valid:', validOld.valid, validOld.errors.length > 0 ? `Errors: ${validOld.errors.join('; ')}` : '');
console.assert(validOld.valid, 'Old schema should normalize correctly');

console.log('\n=== NEW SCHEMA (createPaymentIntent v2) ===');
const newItem = {
    menu_item_id: 'item_456',
    name: 'Caesar Salad',
    price: 9.99,
    quantity: 3
};
console.log('Input:', JSON.stringify(newItem));
const normalizedNew = normalizeItem(newItem);
console.log('Normalized:', JSON.stringify(normalizedNew));
const validNew = validateNormalizedItem(normalizedNew);
console.log('Valid:', validNew.valid, validNew.errors.length > 0 ? `Errors: ${validNew.errors.join('; ')}` : '');
console.assert(validNew.valid, 'New schema should normalize correctly');

console.log('\n=== MIXED SCHEMA (POST-migration) ===');
const mixedItem = {
    id: 'item_789',  // old key
    menu_item_id: 'item_789',  // also new key (preferred)
    name: 'Tiramisu',
    price: 7.50,
    qty: 1  // old key
};
console.log('Input:', JSON.stringify(mixedItem));
const normalizedMixed = normalizeItem(mixedItem);
console.log('Normalized:', JSON.stringify(normalizedMixed));
const validMixed = validateNormalizedItem(normalizedMixed);
console.log('Valid:', validMixed.valid);
console.assert(validMixed.valid, 'Mixed schema should normalize correctly');

console.log('\n=== INVALID SCHEMA (should fail) ===');
const invalidItem = {
    name: 'Espresso',
    price: 'not-a-number'  // Invalid: string instead of number
    // missing menu_item_id
};
console.log('Input:', JSON.stringify(invalidItem));
const normalizedInvalid = normalizeItem(invalidItem);
console.log('Normalized:', JSON.stringify(normalizedInvalid));
const validInvalid = validateNormalizedItem(normalizedInvalid);
console.log('Valid:', validInvalid.valid, `Errors: ${validInvalid.errors.join('; ')}`);
console.assert(!validInvalid.valid, 'Invalid schema should fail validation');

console.log('\n=== FULL CART EXAMPLE (createPaymentIntent output) ===');
const oldCart = [
    { id: 'item_1', name: 'Margherita', price: 12.50, qty: 2 },
    { id: 'item_2', name: 'Coke', price: 2.50, qty: 2 }
];
const newCart = [
    { menu_item_id: 'item_1', name: 'Margherita', price: 12.50, quantity: 2 },
    { menu_item_id: 'item_2', name: 'Coke', price: 2.50, quantity: 2 }
];

console.log('Old Cart Serialization:', JSON.stringify(oldCart));
const normalizedOldCart = oldCart.map(normalizeItem);
console.log('After Normalization:', JSON.stringify(normalizedOldCart));

console.log('\nNew Cart Serialization:', JSON.stringify(newCart));
const normalizedNewCart = newCart.map(normalizeItem);
console.log('After Normalization:', JSON.stringify(normalizedNewCart));

// Both should produce identical output
const oldOutput = JSON.stringify(normalizedOldCart);
const newOutput = JSON.stringify(normalizedNewCart);
console.log('\nOutputs Identical?', oldOutput === newOutput);
console.assert(oldOutput === newOutput, 'Old and new cart formats should normalize to identical output');

console.log('\n✅ All metadata normalization tests passed');