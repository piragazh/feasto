// Returns Stripe public key to frontend
Deno.serve(async (req) => {
    try {
        const publicKey = Deno.env.get('STRIPE_PUBLIC_KEY');
        
        if (!publicKey) {
            return Response.json({ 
                error: 'Stripe public key not configured' 
            }, { status: 500 });
        }

        return Response.json({ publicKey });
    } catch (error) {
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});