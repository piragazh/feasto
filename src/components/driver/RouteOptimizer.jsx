import { toast } from 'sonner';

/**
 * Optimizes delivery route using nearest neighbor algorithm
 * Returns optimized order of delivery stops
 */
export function optimizeRoute(driverLocation, orders) {
    if (!orders || orders.length === 0) return [];
    if (orders.length === 1) return orders;

    const unvisited = [...orders];
    const optimized = [];
    let currentLocation = driverLocation;

    while (unvisited.length > 0) {
        let nearestIndex = 0;
        let minDistance = Infinity;

        unvisited.forEach((order, index) => {
            const coords = order.delivery_coordinates;
            if (coords && coords.lat && coords.lng) {
                const distance = calculateDistance(
                    currentLocation.lat,
                    currentLocation.lng,
                    coords.lat,
                    coords.lng
                );

                // Factor in delivery time priority (scheduled orders should be prioritized)
                let priority = distance;
                if (order.scheduled_for) {
                    const scheduledTime = new Date(order.scheduled_for);
                    const now = new Date();
                    const minutesUntilScheduled = (scheduledTime - now) / (1000 * 60);
                    
                    // Increase priority (reduce effective distance) for urgent deliveries
                    if (minutesUntilScheduled < 30 && minutesUntilScheduled > 0) {
                        priority = distance * 0.5; // High priority
                    }
                }

                if (priority < minDistance) {
                    minDistance = priority;
                    nearestIndex = index;
                }
            }
        });

        const nextOrder = unvisited[nearestIndex];
        optimized.push(nextOrder);
        
        if (nextOrder.delivery_coordinates) {
            currentLocation = nextOrder.delivery_coordinates;
        }
        
        unvisited.splice(nearestIndex, 1);
    }

    return optimized;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Calculate ETA based on distance and estimated speed
 */
export function calculateETA(distance) {
    const avgSpeed = 20; // km/h (considering traffic)
    const timeInHours = distance / avgSpeed;
    const timeInMinutes = Math.ceil(timeInHours * 60);
    
    if (timeInMinutes < 60) {
        return `${timeInMinutes} mins`;
    }
    return `${Math.ceil(timeInMinutes / 60)} hr ${timeInMinutes % 60} min`;
}

/**
 * Check if driver has deviated significantly from route
 */
export function checkDeviation(currentLocation, targetLocation, thresholdKm = 2) {
    if (!currentLocation || !targetLocation) return false;
    
    const distance = calculateDistance(
        currentLocation.lat,
        currentLocation.lng,
        targetLocation.lat,
        targetLocation.lng
    );
    
    return distance > thresholdKm;
}

/**
 * Generate turn-by-turn directions (simplified)
 */
export function generateDirections(fromLocation, toLocation) {
    if (!fromLocation || !toLocation) return [];
    
    const distance = calculateDistance(
        fromLocation.lat,
        fromLocation.lng,
        toLocation.lat,
        toLocation.lng
    );
    
    // Calculate bearing
    const bearing = calculateBearing(
        fromLocation.lat,
        fromLocation.lng,
        toLocation.lat,
        toLocation.lng
    );
    
    const direction = getDirection(bearing);
    
    return [
        {
            instruction: `Head ${direction}`,
            distance: `${(distance * 1000).toFixed(0)}m`,
            type: 'start'
        },
        {
            instruction: `Continue for ${(distance * 1000).toFixed(0)}m`,
            distance: `${(distance * 1000).toFixed(0)}m`,
            type: 'continue'
        },
        {
            instruction: 'Arrive at destination',
            distance: '0m',
            type: 'arrive'
        }
    ];
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    
    const bearing = Math.atan2(y, x);
    return (bearing * 180 / Math.PI + 360) % 360;
}

function getDirection(bearing) {
    const directions = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
}