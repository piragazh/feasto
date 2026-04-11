import { base44 } from '@/api/base44Client';

/**
 * Haversine distance between two lat/lng points — returns miles
 */
function haversineDistance(point1, point2) {
    const R = 3958.8;
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;
    const lat1 = point1.lat * Math.PI / 180;
    const lat2 = point2.lat * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Extract UK postcode district from a full address string
 * e.g. "42 High St, Romford, RM6 4QR" → "RM6"
 */
function extractPostcodeDistrict(address) {
    if (!address) return null;
    // Match full postcode first, extract outward code (district)
    const fullMatch = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*\d[A-Z]{2}\b/i);
    if (fullMatch) return fullMatch[1].toUpperCase();
    // Fallback: match a bare district token
    const districtMatch = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/i);
    return districtMatch ? districtMatch[1].toUpperCase() : null;
}

/**
 * Check if customer address postcode district matches any in the zone's list
 */
function isPostcodeInZone(customerAddress, zonePostcodes) {
    if (!customerAddress || !zonePostcodes || zonePostcodes.length === 0) return false;
    const district = extractPostcodeDistrict(customerAddress);
    if (!district) return false;
    return zonePostcodes.some(pc => pc.trim().toUpperCase().replace(/\s+/g, '') === district);
}

/**
 * Ray-casting polygon containment check
 */
function isPointInPolygon(point, polygon) {
    if (!point || !polygon || polygon.length < 3) return false;
    const px = point.lng;
    const py = point.lat;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng, yi = polygon[i].lat;
        const xj = polygon[j].lng, yj = polygon[j].lat;
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Internal: find matching zone from a pre-fetched list — avoids double API call
 */
function matchZone(zones, customerLocation, customerAddress) {
    // Oldest-first for consistent overlap handling
    const sorted = [...zones].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    for (const zone of sorted) {
        // Determine type — fall back to field presence for legacy zones without zone_type
        const type = zone.zone_type ||
            (zone.postcodes?.length > 0 ? 'postcode' :
            zone.radius_miles ? 'radius' : 'polygon');

        if (type === 'postcode') {
            if (isPostcodeInZone(customerAddress, zone.postcodes)) return zone;

        } else if (type === 'radius') {
            const center = zone.radius_center;
            if (center?.lat && center?.lng && customerLocation?.lat && customerLocation?.lng) {
                if (haversineDistance(center, customerLocation) <= zone.radius_miles) return zone;
            }

        } else {
            // polygon (default)
            if (zone.coordinates?.length >= 3 && customerLocation) {
                if (isPointInPolygon(customerLocation, zone.coordinates)) return zone;
            }
        }
    }

    return null;
}

/**
 * Find the matching delivery zone for a customer location + address.
 * Exported for external use — fetches zones internally.
 */
export async function findDeliveryZone(restaurantId, customerLocation, customerAddress) {
    try {
        const zones = await base44.entities.DeliveryZone.filter({
            restaurant_id: restaurantId,
            is_active: true
        });
        if (!zones || zones.length === 0) return null;
        return matchZone(zones, customerLocation, customerAddress);
    } catch (error) {
        console.error('[DeliveryZoneCalculator] findDeliveryZone error:', error);
        return null;
    }
}

/**
 * Calculate delivery fee and ETA for a customer location.
 * Returns null  → no zones configured, standard/tiered restaurant fee applies.
 * Returns { available: false } → zones exist but customer is outside all of them.
 * Returns { available: true, ... } → matched zone details.
 *
 * Single DB fetch — no duplicate API calls.
 */
export async function calculateDeliveryDetails(restaurantId, customerLocation, customerAddress) {
    let allZones = [];
    try {
        allZones = await base44.entities.DeliveryZone.filter({
            restaurant_id: restaurantId,
            is_active: true
        });
    } catch (e) {
        allZones = [];
    }

    if (!allZones || allZones.length === 0) return null;

    // Reuse pre-fetched zones — no second API call
    const zone = matchZone(allZones, customerLocation, customerAddress);

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