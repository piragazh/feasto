import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * DELETE USER ACCOUNT
 * Permanently removes a user's account and all associated data:
 * - Favorites
 * - Loyalty points & transactions
 * - Anonymises order history (keeps records but removes PII linkage)
 * Must be called by the authenticated user themselves.
 */
Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = user.email;
    console.log(`[deleteUserAccount] Starting deletion for user: ${userEmail}`);

    // 1. Delete favorites
    const favorites = await base44.asServiceRole.entities.Favorite.filter({ user_email: userEmail });
    await Promise.all(favorites.map(f => base44.asServiceRole.entities.Favorite.delete(f.id)));
    console.log(`[deleteUserAccount] Deleted ${favorites.length} favorites`);

    // 2. Delete loyalty points record
    const loyaltyPoints = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: userEmail });
    await Promise.all(loyaltyPoints.map(lp => base44.asServiceRole.entities.LoyaltyPoints.delete(lp.id)));

    // 3. Delete loyalty transactions
    const loyaltyTxns = await base44.asServiceRole.entities.LoyaltyTransaction.filter({ user_email: userEmail });
    await Promise.all(loyaltyTxns.map(t => base44.asServiceRole.entities.LoyaltyTransaction.delete(t.id)));
    console.log(`[deleteUserAccount] Deleted ${loyaltyTxns.length} loyalty transactions`);

    // 4. Anonymise orders — preserve records for restaurant/admin auditing but strip PII
    const orders = await base44.asServiceRole.entities.Order.filter({ customer_email: userEmail });
    await Promise.all(orders.map(o =>
        base44.asServiceRole.entities.Order.update(o.id, {
            customer_email: 'deleted_user@deleted',
            customer_phone: null,
            delivery_address: 'Address removed',
            phone: null,
            notes: null,
        })
    ));
    console.log(`[deleteUserAccount] Anonymised ${orders.length} orders`);

    // 5. Delete the user record last
    const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
    if (users.length > 0) {
        await base44.asServiceRole.entities.User.delete(users[0].id);
    }

    console.log(`[deleteUserAccount] ✅ Account deleted for: ${userEmail}`);
    return Response.json({ success: true });
});