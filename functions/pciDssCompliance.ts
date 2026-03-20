/**
 * PCI DSS Compliance Verification
 * Ensures payment data is handled securely
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * Validate PCI DSS compliance for payment operations
 * Requirements:
 * - No full credit card storage
 * - No transmission of card data through unsecured channels
 * - Payment data validated server-side
 * - Proper tokenization via Stripe
 */

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const { paymentData, operationType } = await req.json();

        if (!paymentData) {
            return new Response(
                JSON.stringify({ error: 'Missing payment data' }),
                { status: 400 }
            );
        }

        // Validate based on operation type
        const validations = {
            card_payment: validateCardPayment,
            payment_storage: validatePaymentStorage,
            data_transmission: validateDataTransmission
        };

        const validator = validations[operationType];
        if (!validator) {
            return new Response(
                JSON.stringify({ error: 'Invalid operation type' }),
                { status: 400 }
            );
        }

        const result = validator(paymentData);
        
        if (!result.compliant) {
            console.error(`[PCI DSS] Compliance violation: ${result.violation}`);
            return new Response(
                JSON.stringify({ 
                    compliant: false,
                    violation: result.violation,
                    severity: 'critical'
                }),
                { status: 400 }
            );
        }

        return new Response(
            JSON.stringify({ 
                compliant: true,
                message: 'Payment data meets PCI DSS requirements'
            }),
            { status: 200 }
        );

    } catch (error) {
        console.error('PCI DSS compliance check error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500 }
        );
    }
});

/**
 * Validate card payment compliance
 */
function validateCardPayment(paymentData) {
    // CRITICAL: No full card numbers allowed
    if (paymentData.card_number) {
        return {
            compliant: false,
            violation: 'Full card number detected in payload - must use Stripe tokenization'
        };
    }

    // CRITICAL: No CVV allowed in payment data
    if (paymentData.cvv || paymentData.cvc || paymentData.security_code) {
        return {
            compliant: false,
            violation: 'CVV/Security code detected - CVV must never be stored or transmitted'
        };
    }

    // Only payment intent ID is acceptable (Stripe)
    if (!paymentData.payment_intent_id && !paymentData.stripe_token) {
        return {
            compliant: false,
            violation: 'No Stripe payment intent or token provided'
        };
    }

    return { compliant: true };
}

/**
 * Validate payment storage compliance
 */
function validatePaymentStorage(paymentData) {
    // Check for sensitive data that should never be stored
    const sensitiveFields = ['card_number', 'cvv', 'cvc', 'security_code', 'expiry_date'];
    
    for (const field of sensitiveFields) {
        if (paymentData[field]) {
            return {
                compliant: false,
                violation: `Sensitive field '${field}' should not be stored - use Stripe tokenization`
            };
        }
    }

    // Only allow storage of non-sensitive payment info
    const allowedFields = ['payment_intent_id', 'stripe_token', 'last_4_digits', 'card_brand'];
    const storedFields = Object.keys(paymentData);
    
    const invalidFields = storedFields.filter(f => !allowedFields.includes(f));
    if (invalidFields.length > 0) {
        console.warn(`[PCI DSS] Unusual fields for storage: ${invalidFields.join(', ')}`);
    }

    return { compliant: true };
}

/**
 * Validate data transmission compliance
 */
function validateDataTransmission(paymentData) {
    // Payment data should only contain tokenized references
    const allowedFields = ['payment_intent_id', 'token', 'payment_method_id'];
    
    for (const field of Object.keys(paymentData)) {
        if (!allowedFields.includes(field)) {
            return {
                compliant: false,
                violation: `Field '${field}' should not be transmitted - use Stripe API`
            };
        }
    }

    return { compliant: true };
}

/**
 * Export compliance helpers for use in other functions
 */
export const pciDssValidators = {
    validateCardPayment,
    validatePaymentStorage,
    validateDataTransmission
};