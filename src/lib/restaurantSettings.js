import { base44 } from '@/api/base44Client';

/**
 * Save changes to a Restaurant record as a manager.
 *
 * The Restaurant table only accepts direct writes from admins, so manager
 * screens save through the updateRestaurantSettings function, which checks the
 * user manages this restaurant, allowlists fields, validates brand settings and
 * writes an audit entry. Throws an Error carrying the server's message on failure.
 */
export async function saveRestaurantSettings(restaurantId, updates) {
    let res;
    try {
        res = await base44.functions.invoke('updateRestaurantSettings', {
            restaurant_id: restaurantId,
            updates,
        });
    } catch (err) {
        throw new Error(err?.response?.data?.error || err?.message || 'Save failed');
    }
    if (!res?.data?.success) {
        throw new Error(res?.data?.error || 'Save failed');
    }
    if (res.data.stripped_fields?.length) {
        // A field this screen sends isn't on the server allowlist: surface it in
        // development rather than letting the change silently disappear.
        console.warn('[saveRestaurantSettings] not saved:', res.data.stripped_fields.join(', '));
    }
    return res.data;
}
