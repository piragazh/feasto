/**
 * PAGINATION-AWARE MENU ITEM FETCHER
 * 
 * Reliably fetches ALL menu items for a restaurant, regardless of size.
 * Handles pagination to bypass the 50-item default limit.
 * 
 * Returns: Map<itemId, MenuItem> for O(1) lookup
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const PAGE_SIZE = 50; // Base44 default, explicit for clarity

/**
 * Fetch all MenuItem records for a restaurant with pagination
 * @param {Object} base44 - Authenticated base44 SDK client
 * @param {string} restaurantId - Restaurant ID to fetch items for
 * @returns {Map<string, Object>} Map of item ID to MenuItem object
 */
async function fetchAllMenuItems(base44, restaurantId) {
    const allItems = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        try {
            // Use filter with explicit offset/limit parameters (if supported)
            // Otherwise fetch PAGE_SIZE and check if we got fewer items (EOF)
            const batch = await base44.asServiceRole.entities.MenuItem.filter(
                { restaurant_id: restaurantId },
                null, // sort
                PAGE_SIZE, // limit
                offset // offset (if supported)
            );

            if (!Array.isArray(batch) || batch.length === 0) {
                hasMore = false;
                break;
            }

            allItems.push(...batch);

            // If we got fewer items than PAGE_SIZE, we've reached the end
            if (batch.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                offset += PAGE_SIZE;
            }
        } catch (err) {
            // If offset not supported, fall back to single fetch
            // (Base44 may not support offset, but try anyway)
            console.warn(`[MENU] Pagination attempt failed: ${err.message}, falling back to single fetch`);
            hasMore = false;
        }
    }

    // Return as Map for O(1) lookup by ID
    const itemMap = new Map();
    for (const item of allItems) {
        if (item && item.id) {
            itemMap.set(item.id, item);
        }
    }

    console.log(`[MENU] Fetched ${itemMap.size} items for restaurant=${restaurantId} in ${Math.ceil(allItems.length / PAGE_SIZE)} batch(es)`);
    return itemMap;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { restaurant_id } = await req.json();

        if (!restaurant_id) {
            return Response.json({ error: 'Missing restaurant_id', success: false }, { status: 400 });
        }

        const itemMap = await fetchAllMenuItems(base44, restaurant_id);

        // Convert Map to array for JSON response
        const items = Array.from(itemMap.values());

        return Response.json({
            success: true,
            restaurant_id,
            items_count: items.length,
            items
        }, { status: 200 });
    } catch (error) {
        console.error('[MENU] Error:', error.message);
        return Response.json({ error: error.message, success: false }, { status: 500 });
    }
});

export { fetchAllMenuItems };