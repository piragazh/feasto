/**
 * Shared restaurant permission utility — enforce atomically in each backend function.
 * NOT a separate HTTP call — import and use inline.
 *
 * Pattern:
 *   const user = await base44.auth.me();
 *   const permissionResult = await checkRestaurantPermission(base44, user, restaurantId);
 *   if (!permissionResult.allowed) {
 *     return Response.json({ error: permissionResult.error }, { status: permissionResult.statusCode });
 *   }
 *   // permissionResult.role is either 'admin' or 'manager'
 */

export async function checkRestaurantPermission(base44, user, restaurantId) {
    if (!user) {
        return {
            allowed: false,
            error: 'Unauthorized',
            statusCode: 401,
        };
    }

    if (!restaurantId) {
        return {
            allowed: false,
            error: 'Restaurant ID required',
            statusCode: 400,
        };
    }

    // Admin users can access any restaurant
    if (user.role === 'admin') {
        console.log(`[AUDIT] Admin ${user.email} accessing restaurant ${restaurantId}`);
        return {
            allowed: true,
            role: 'admin',
            statusCode: 200,
        };
    }

    // Check if user is assigned manager for this restaurant
    let managers;
    try {
        managers = await base44.asServiceRole.entities.RestaurantManager.filter({
            user_email: user.email,
            is_active: true,
        });
    } catch (error) {
        console.error(`[PERMISSION] Failed to fetch managers for ${user.email}:`, error.message);
        return {
            allowed: false,
            error: 'Permission check failed',
            statusCode: 500,
        };
    }

    if (!managers || managers.length === 0) {
        console.error(`[SECURITY] Non-admin user ${user.email} has no restaurant access`);
        return {
            allowed: false,
            error: 'No restaurant access',
            statusCode: 403,
        };
    }

    // Check if this restaurant is in user's assigned list
    const hasAccess = managers.some(m =>
        m.restaurant_ids && m.restaurant_ids.includes(restaurantId)
    );

    if (!hasAccess) {
        console.error(`[SECURITY] User ${user.email} attempted unauthorized access to restaurant ${restaurantId}`);
        return {
            allowed: false,
            error: 'Access denied to this restaurant',
            statusCode: 403,
        };
    }

    console.log(`[AUDIT] Manager ${user.email} accessing restaurant ${restaurantId}`);
    return {
        allowed: true,
        role: 'manager',
        statusCode: 200,
    };
}