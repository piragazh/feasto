import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getRestaurantTimeZone, normaliseCountry } from '@/lib/region';

/**
 * A restaurant's region fields { country, timezone }, for screens that only
 * have its id. One small cached read per restaurant, shared by the hooks below.
 * null while loading or if the read fails.
 */
export function useRestaurantRegionRecord(restaurantId) {
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
    return data ?? null;
}

/**
 * The IANA zone a restaurant's screens show times in (src/lib/region.js).
 * While it loads, or if it fails, the UK clock is used - exactly what every
 * screen showed before region support.
 */
export function useRestaurantTimeZone(restaurantId) {
    return getRestaurantTimeZone(useRestaurantRegionRecord(restaurantId));
}

/** The restaurant's country code ('GB' while loading or unknown). */
export function useRestaurantCountry(restaurantId) {
    return normaliseCountry(useRestaurantRegionRecord(restaurantId)?.country);
}
