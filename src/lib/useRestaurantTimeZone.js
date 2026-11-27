import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getRestaurantTimeZone } from '@/lib/region';

/**
 * The IANA zone a restaurant's screens show times in (src/lib/region.js).
 * One small cached read per restaurant. While it loads, or if it fails, the
 * UK clock is used - exactly what every screen showed before region support.
 */
export function useRestaurantTimeZone(restaurantId) {
    const { data } = useQuery({
        queryKey: ['restaurant-timezone', restaurantId],
        enabled: !!restaurantId,
        staleTime: 30 * 60 * 1000,
        queryFn: async () => {
            const rows = await base44.entities.Restaurant.filter({ id: restaurantId });
            const r = rows?.[0];
            return r ? { country: r.country ?? null, timezone: r.timezone ?? null } : null;
        },
    });
    return getRestaurantTimeZone(data);
}
