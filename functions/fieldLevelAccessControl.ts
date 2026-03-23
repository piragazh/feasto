/**
 * Field-Level Access Control
 * Restrict access to specific entity fields based on user role and permissions
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Define field-level access rules
const FIELD_ACCESS_RULES = {
    Order: {
        // Fields visible to customer who placed the order
        customer: ['id', 'order_number', 'items', 'total', 'status', 'delivery_address', 'estimated_delivery'],
        // Fields visible to restaurant owner
        restaurant: ['id', 'order_number', 'items', 'status', 'phone', 'delivery_address', 'notes', 'payment_method', 'restaurant_earnings'],
        // Fields visible to admin
        admin: ['*'] // All fields
    },
    Restaurant: {
        customer: ['id', 'name', 'logo_url', 'image_url', 'description', 'cuisine_type', 'rating', 'delivery_fee', 'opening_hours'],
        manager: ['*'], // Can see all their restaurant data
        admin: ['*']
    },
    User: {
        customer: ['id', 'full_name', 'email'], // Can only see own profile
        restaurant: ['id', 'full_name', 'email'], // Managers can see their own
        admin: ['*']
    }
};

/**
 * Filter entity fields based on user access level
 */
export function filterEntityFields(entity, entityType, user, context = {}) {
    if (!entity || typeof entity !== 'object') return entity;

    const rules = FIELD_ACCESS_RULES[entityType];
    if (!rules) return entity; // No rules defined, return as-is

    // Determine access level
    let accessLevel = 'customer';
    
    if (user?.role === 'admin') {
        accessLevel = 'admin';
    } else if (context.isRestaurantManager) {
        accessLevel = 'restaurant';
    } else if (context.isRestaurantOwner) {
        accessLevel = 'restaurant';
    }

    const allowedFields = rules[accessLevel];
    if (!allowedFields) return entity;

    // If wildcard, return all fields
    if (allowedFields.includes('*')) return entity;

    // Filter to allowed fields only
    const filtered = {};
    allowedFields.forEach(field => {
        if (field in entity) {
            filtered[field] = entity[field];
        }
    });

    return filtered;
}

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

        const { entityType, entity } = await req.json();

        if (!entityType || !entity) {
            return new Response(
                JSON.stringify({ error: 'Missing entityType or entity' }),
                { status: 400 }
            );
        }

        // SECURITY: Verify manager status server-side — never trust client-supplied flags
        let isRestaurantManager = false;
        let isRestaurantOwner = false;
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true
            });
            isRestaurantManager = managers && managers.length > 0;
            isRestaurantOwner = isRestaurantManager;
        }

        // Apply field-level filtering
        const filtered = filterEntityFields(entity, entityType, user, {
            isRestaurantManager,
            isRestaurantOwner
        });

        return new Response(
            JSON.stringify({ success: true, entity: filtered }),
            { status: 200 }
        );

    } catch (error) {
        console.error('Field access control error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500 }
        );
    }
});