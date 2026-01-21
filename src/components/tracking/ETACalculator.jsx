import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Hook to calculate and monitor real-time ETA using OpenRouteService API
 * Provides traffic-aware routing and automatic ETA updates
 */
export function useRealtimeETA(driverLocation, deliveryLocation, orderId) {
    const [eta, setEta] = useState(null);
    const [distance, setDistance] = useState(null);
    const [loading, setLoading] = useState(false);
    const previousETA = useRef(null);
    const lastNotified = useRef(0);

    useEffect(() => {
        if (!driverLocation?.lat || !deliveryLocation?.lat) return;

        const calculateETA = async () => {
            try {
                setLoading(true);
                
                // Use OpenRouteService Directions API (free tier: 2000 requests/day)
                const response = await fetch(
                    `https://api.openrouteservice.org/v2/directions/driving-car?` + 
                    `api_key=5b3ce3597851110001cf6248a8b9c9e9e9d84b2ba0c46e8ddb9f9c98&` +
                    `start=${driverLocation.lng},${driverLocation.lat}&` +
                    `end=${deliveryLocation.lng},${deliveryLocation.lat}`
                );

                if (!response.ok) {
                    throw new Error('Failed to fetch route');
                }

                const data = await response.json();
                const route = data.features?.[0]?.properties;

                if (route) {
                    const durationMinutes = Math.ceil(route.segments[0].duration / 60);
                    const distanceKm = (route.segments[0].distance / 1000).toFixed(1);
                    
                    setEta(durationMinutes);
                    setDistance(distanceKm);

                    // Check for significant ETA changes (more than 5 minutes difference)
                    if (previousETA.current !== null) {
                        const etaDiff = Math.abs(durationMinutes - previousETA.current);
                        const now = Date.now();
                        
                        // Only notify if difference > 5 minutes and haven't notified in last 2 minutes
                        if (etaDiff >= 5 && now - lastNotified.current > 120000) {
                            lastNotified.current = now;
                            
                            if (durationMinutes > previousETA.current) {
                                toast.warning(`ETA Updated: Now ${durationMinutes} minutes`, {
                                    description: `Delivery time increased by ${etaDiff} minutes due to traffic conditions.`,
                                    duration: 6000
                                });
                                
                                // Browser notification
                                if ('Notification' in window && Notification.permission === 'granted') {
                                    new Notification('Delivery ETA Updated ⚠️', {
                                        body: `Your delivery will now arrive in approximately ${durationMinutes} minutes.`,
                                        icon: '/icon-192.png',
                                        tag: `eta-update-${orderId}`
                                    });
                                }
                            } else {
                                toast.success(`ETA Improved: Now ${durationMinutes} minutes`, {
                                    description: `Driver is making good progress!`,
                                    duration: 4000
                                });
                            }
                        }
                    }
                    
                    previousETA.current = durationMinutes;
                }
            } catch (error) {
                console.error('ETA calculation error:', error);
                // Fallback to simple calculation
                const dist = calculateSimpleDistance(
                    driverLocation.lat,
                    driverLocation.lng,
                    deliveryLocation.lat,
                    deliveryLocation.lng
                );
                setDistance(dist.toFixed(1));
                setEta(Math.ceil(dist * 3)); // 3 min per km estimate
            } finally {
                setLoading(false);
            }
        };

        calculateETA();
        const interval = setInterval(calculateETA, 30000); // Update every 30 seconds

        return () => clearInterval(interval);
    }, [driverLocation?.lat, driverLocation?.lng, deliveryLocation?.lat, deliveryLocation?.lng, orderId]);

    return { eta, distance, loading };
}

// Haversine distance calculation (fallback)
function calculateSimpleDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}