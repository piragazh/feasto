import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Car, MapPin, Navigation } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import 'leaflet/dist/leaflet.css';

// Custom driver icon
const driverIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="#f97316" stroke="white" stroke-width="3"/>
            <path d="M12 20 L18 14 L22 18 L28 12" stroke="white" stroke-width="2" fill="none"/>
        </svg>
    `),
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
});

// Destination icon
const destinationIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
            <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 S40 35 40 20 C40 9 31 0 20 0 Z" fill="#10b981" stroke="white" stroke-width="2"/>
            <circle cx="20" cy="20" r="8" fill="white"/>
        </svg>
    `),
    iconSize: [40, 50],
    iconAnchor: [20, 50],
    popupAnchor: [0, -50]
});

// Component to auto-adjust map bounds
function MapBounds({ driverLocation, destination }) {
    const map = useMap();

    useEffect(() => {
        if (driverLocation && destination) {
            const bounds = L.latLngBounds([driverLocation, destination]);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }, [driverLocation, destination, map]);

    return null;
}

export default function LiveDriverMap({ order, driver }) {
    const [driverLocation, setDriverLocation] = useState(null);
    const [isUpdating, setIsUpdating] = useState(false);

    // Get destination coordinates
    const destination = order.delivery_coordinates 
        ? [order.delivery_coordinates.lat, order.delivery_coordinates.lng]
        : null;

    useEffect(() => {
        // Load initial driver location from order or driver
        if (order.driver_location) {
            setDriverLocation([order.driver_location.lat, order.driver_location.lng]);
        } else if (driver?.current_location) {
            setDriverLocation([driver.current_location.lat, driver.current_location.lng]);
        } else if (destination) {
            // Simulate driver nearby if no real location
            setDriverLocation([
                destination[0] + (Math.random() - 0.5) * 0.02,
                destination[1] + (Math.random() - 0.5) * 0.02
            ]);
        }
    }, [order, driver, destination]);

    useEffect(() => {
        if (!driverLocation || !destination) return;

        // Simulate gradual movement towards destination
        const interval = setInterval(() => {
            setIsUpdating(true);
            setDriverLocation(prevLocation => {
                if (!prevLocation) return prevLocation;

                // Calculate direction to destination
                const latDiff = destination[0] - prevLocation[0];
                const lngDiff = destination[1] - prevLocation[1];
                const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

                // If very close to destination, stop moving
                if (distance < 0.0005) return prevLocation;

                // Move a small step towards destination with some randomness
                const stepSize = 0.0003;
                const randomness = 0.0001;
                
                return [
                    prevLocation[0] + (latDiff * stepSize / distance) + (Math.random() - 0.5) * randomness,
                    prevLocation[1] + (lngDiff * stepSize / distance) + (Math.random() - 0.5) * randomness
                ];
            });
            
            setTimeout(() => setIsUpdating(false), 500);
        }, 3000); // Update every 3 seconds

        return () => clearInterval(interval);
    }, [destination]);

    if (!driverLocation || !destination) {
        return (
            <div className="h-full flex items-center justify-center bg-gray-100 rounded-lg">
                <p className="text-gray-500">Loading map...</p>
            </div>
        );
    }

    // Calculate estimated distance
    const distance = calculateDistance(
        driverLocation[0], driverLocation[1],
        destination[0], destination[1]
    );

    return (
        <div className="relative h-full">
            <MapContainer 
                center={driverLocation} 
                zoom={14} 
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Driver Marker */}
                <Marker position={driverLocation} icon={driverIcon}>
                    <Popup>
                        <div className="text-center">
                            <p className="font-semibold">Your Driver</p>
                            {driver && <p className="text-sm text-gray-600">{driver.full_name}</p>}
                            <p className="text-xs text-gray-500">
                                {distance.toFixed(1)} mi away
                            </p>
                        </div>
                    </Popup>
                </Marker>

                {/* Destination Marker */}
                <Marker position={destination} icon={destinationIcon}>
                    <Popup>
                        <div className="text-center">
                            <p className="font-semibold">Delivery Location</p>
                            <p className="text-xs text-gray-500">{order.delivery_address}</p>
                        </div>
                    </Popup>
                </Marker>

                {/* Route Line */}
                <Polyline 
                    positions={[driverLocation, destination]}
                    color="#f97316"
                    weight={3}
                    opacity={0.7}
                    dashArray="10, 10"
                />

                <MapBounds driverLocation={driverLocation} destination={destination} />
            </MapContainer>

            {/* Live Update Indicator */}
            {isUpdating && (
                <div className="absolute top-4 right-4 z-[1000]">
                    <Badge className="bg-green-500 text-white animate-pulse">
                        <div className="w-2 h-2 bg-white rounded-full mr-2 animate-ping"></div>
                        Live
                    </Badge>
                </div>
            )}

            {/* Distance Badge */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-[1000]">
                <Badge className="bg-white/95 text-gray-900 shadow-lg px-4 py-2 text-base">
                    <Car className="h-4 w-4 mr-2 text-orange-500" />
                    {distance.toFixed(1)} mi away • {Math.ceil(distance * 3)} min
                </Badge>
            </div>

            {/* Driver Info Card */}
            {driver && (
                <div className="absolute top-4 left-4 z-[1000] bg-white/95 rounded-lg shadow-lg p-3 max-w-xs">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                            <Car className="h-6 w-6 text-orange-600" />
                        </div>
                        <div>
                            <p className="font-semibold text-gray-900">{driver.full_name}</p>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                                <span>⭐ {driver.rating?.toFixed(1) || '5.0'}</span>
                                <span className="text-gray-400">•</span>
                                <span className="capitalize">{driver.vehicle_type}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
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