/**
 * Cart Request Signing - Prevent cart tampering by validating signatures
 * All cart operations must include a valid HMAC signature
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const CART_SIGNING_SECRET = Deno.env.get('CART_SIGNING_SECRET');
if (!CART_SIGNING_SECRET) {
    console.error('[SECURITY] CART_SIGNING_SECRET is not set — cart validation disabled');
}

/**
 * Generate signature for cart data (used by frontend)
 */
export const generateCartSignature = async (cartData, userEmail) => {
    const message = `${userEmail}:${JSON.stringify(cartData)}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const keyData = encoder.encode(CART_SIGNING_SECRET);
    
    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, data);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
};

/**
 * Verify cart signature
 */
const verifyCartSignature = async (cartData, userEmail, providedSignature) => {
    const expectedSignature = await generateCartSignature(cartData, userEmail);
    return expectedSignature === providedSignature;
};

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401 }
            );
        }

        const { cartData, signature } = await req.json();

        if (!cartData || !signature) {
            return new Response(
                JSON.stringify({ error: 'Missing cart data or signature' }),
                { status: 400 }
            );
        }

        // Verify signature
        const isValid = await verifyCartSignature(cartData, user.email, signature);

        if (!isValid) {
            // Log security incident
            console.error(`[SECURITY] Cart signature mismatch for user ${user.email}`);
            
            return new Response(
                JSON.stringify({ 
                    error: 'Cart signature invalid - possible tampering detected',
                    valid: false 
                }),
                { status: 403 }
            );
        }

        return new Response(
            JSON.stringify({ 
                valid: true,
                message: 'Cart signature verified'
            }),
            { status: 200 }
        );

    } catch (error) {
        console.error('Cart signature validation error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500 }
        );
    }
});