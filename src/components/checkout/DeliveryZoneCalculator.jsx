import { base44 } from '@/api/base44Client';

/**
 * Check if a point is inside a polygon using ray-casting algorithm
 */
function isPointInPolygon(point, polygon) {
    const { lat, lng } = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat;
        const yi = polygon[i].lng;
        const xj = polygon[j].lat;
        const yj = polygon[j].lng;

        const intersect = ((yi > lng) !== (yj > lng)) &&
            (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);

        if (intersect) inside = !inside;
    }

    return inside;
}

/**
 * Find the delivery zone for a given location
 */
export async function findDeliveryZone(restaurantId, customerLocation) {
    try {
        // Fetch all active zones for the restaurant
        const zones = await base44.entities.DeliveryZone.filter({
            restaurant_id: restaurantId,
            is_active: true
        });

        if (!zones || zones.length === 0) {
            return null;
        }

        // Sort zones by creation date (oldest first) for consistent overlap handling
        const sortedZones = [...zones].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

        // Check which zone contains the customer location (return the first/oldest matching zone)
        for (const zone of sortedZones) {
            if (zone.coordinates && zone.coordinates.length > 0) {
                if (isPointInPolygon(customerLocation, zone.coordinates)) {
                    return zone;
                }
            }
        }

        return null; // No zone found
    } catch (error) {
        console.error('Error finding delivery zone:', error);
        return null;
    }
}

/**
 * Calculate delivery fee and ETA for a location
 */
export async function calculateDeliveryDetails(restaurantId, customerLocation) {
    const zone = await findDeliveryZone(restaurantId, customerLocation);

    if (!zone) {
        return {
            available: false,
            message: 'Sorry, delivery is not available to your location.',
            deliveryFee: null,
            estimatedTime: null,
            zone: null
        };
    }

    return {
        available: true,
        deliveryFee: zone.delivery_fee,
        estimatedTime: zone.estimated_delivery_time,
        minOrderValue: zone.min_order_value,
        minimumOrder: zone.min_order_value,
        zoneName: zone.name,
        zone: zone
    };
}