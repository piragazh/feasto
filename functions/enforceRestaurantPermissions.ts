/**
 * Permission enforcement for restaurant operations
 * Verifies user is admin or assigned manager before allowing modifications
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const { restaurantId } = await req.json();

        if (!restaurantId) {
            return new Response(JSON.stringify({ error: 'Restaurant ID required' }), { status: 400 });
        }

        // Admin users can access any restaurant
        if (user.role === 'admin') {
            return new Response(JSON.stringify({ allowed: true, role: 'admin' }));
        }

        // Check if user is assigned manager for this restaurant
        const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
            user_email: user.email,
            is_active: true
        });

        if (!managers || managers.length === 0) {
            return new Response(
                JSON.stringify({ error: 'No restaurant access' }),
                { status: 403 }
            );
        }

        // Check if this restaurant is in user's assigned list
        const hasAccess = managers.some(m => 
            m.restaurant_ids && m.restaurant_ids.includes(restaurantId)
        );

        if (!hasAccess) {
            return new Response(
                JSON.stringify({ error: 'Access denied to this restaurant' }),
                { status: 403 }
            );
        }

        return new Response(JSON.stringify({ allowed: true, role: 'manager' }));

    } catch (error) {
        console.error('Permission check error:', error);
        return new Response(
            JSON.stringify({ error: 'Permission check failed' }),
            { status: 500 }
        );
    }
});