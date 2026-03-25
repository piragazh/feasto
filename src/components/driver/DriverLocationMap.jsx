import React from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle } from 'react-leaflet';
import { Navigation } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

/**
 * Compact live driver location map shown on restaurant LiveOrders / customer TrackOrder.
 * Props:
 *   driverLocation  { lat, lng }
 *   deliveryCoords  { lat, lng }  (optional - destination pin)
 *   height          string  (default "192px")
 */
export default function DriverLocationMap({ driverLocation, deliveryCoords, height = '192px' }) {
    if (!driverLocation?.lat || !driverLocation?.lng) {
        return (
            <div className="rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs gap-2" style={{ height }}>
                <Navigation className="h-4 w-4" />
                Waiting for driver GPS…
            </div>
        );
    }

    const center = [driverLocation.lat, driverLocation.lng];
    const hasDestination = deliveryCoords?.lat && deliveryCoords?.lng;

    return (
        <div className="rounded-lg overflow-hidden border" style={{ height, position: 'relative', zIndex: 0 }}>
            <MapContainer
                center={center}
                zoom={14}
                style={{ height: '100%', width: '100%', zIndex: 0 }}
                zoomControl={false}
                scrollWheelZoom={false}
                dragging={false}
                attributionControl={false}
            >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {/* Driver pin */}
                <Marker position={center} />
                <Circle
                    center={center}
                    radius={80}
                    pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.25, weight: 2 }}
                />

                {/* Destination pin + route line */}
                {hasDestination && (
                    <>
                        <Marker position={[deliveryCoords.lat, deliveryCoords.lng]} />
                        <Polyline
                            positions={[center, [deliveryCoords.lat, deliveryCoords.lng]]}
                            pathOptions={{ color: '#f97316', weight: 3, dashArray: '8, 8' }}
                        />
                    </>
                )}
            </MapContainer>

            {/* Live badge overlay */}
            <div className="absolute top-2 right-2 z-[400] flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs font-medium text-orange-600 border border-orange-200 shadow">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                Live
            </div>
        </div>
    );
}