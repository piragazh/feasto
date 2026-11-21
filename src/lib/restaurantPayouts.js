import { base44 } from '@/api/base44Client';

/**
 * A restaurant's own payouts, newest period first. Goes through the
 * restaurantPayouts function because the Payout table is admin-read-only.
 * Voided payouts are left out: they were cancelled before any money moved.
 */
export async function fetchRestaurantPayouts(restaurantId) {
    const res = await base44.functions.invoke('restaurantPayouts', { restaurant_id: restaurantId })
        .catch((e) => { throw new Error(e?.response?.data?.error || e?.message || 'Could not load payouts'); });
    const data = res?.data ?? res;
    if (!data?.success) throw new Error(data?.error || 'Could not load payouts');
    return (data.payouts || []).filter((p) => p.status !== 'voided');
}
