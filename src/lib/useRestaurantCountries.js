import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { normaliseCountry } from '@/lib/region';
import { formatMoney } from '@/lib/money';

/**
 * For screens that list things from several restaurants (a customer's order
 * history, favourites): which country each restaurant is in, so every amount
 * shows in its own restaurant's currency.
 *
 * One cached read of the restaurant list. While it loads, or for an unknown
 * restaurant, everything is GB (£) - exactly what these screens showed before.
 *
 *   const { countryOf, moneyFor, commonCountry } = useRestaurantCountries();
 *   moneyFor(order.total, order.restaurant_id)      -> "£12.50" / "Rs 1,250.00"
 *   commonCountry(orders.map(o => o.restaurant_id)) -> one country if they all
 *       agree (for totals), else 'GB' - totals never add pounds to rupees
 *       under one symbol without it being the UK default.
 */
export function useRestaurantCountries() {
    const { data: map = {} } = useQuery({
        queryKey: ['restaurant-countries'],
        staleTime: 30 * 60 * 1000,
        queryFn: async () => {
            const rows = await base44.entities.Restaurant.list();
            const out = {};
            for (const r of rows || []) out[r.id] = normaliseCountry(r.country);
            return out;
        },
    });
    const countryOf = (restaurantId) => map[restaurantId] || 'GB';
    const moneyFor = (amount, restaurantId) => formatMoney(amount, countryOf(restaurantId));
    const commonCountry = (restaurantIds) => {
        const set = new Set((restaurantIds || []).map(countryOf));
        return set.size === 1 ? [...set][0] : 'GB';
    };
    return { countryOf, moneyFor, commonCountry };
}
