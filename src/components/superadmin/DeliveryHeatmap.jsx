import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCw, MapPin, Flame, TrendingUp, AlertCircle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Heatmap renderer using canvas circles
function HeatmapLayer({ points }) {
    const map = useMap();
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!points || points.length === 0) return;

        // Remove existing canvas layer
        if (canvasRef.current) {
            map.removeLayer(canvasRef.current);
            canvasRef.current = null;
        }

        const CanvasHeatmap = L.Layer.extend({
            onAdd(map) {
                this._map = map;
                const size = map.getSize();
                this._canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-canvas');
                this._canvas.width = size.x;
                this._canvas.height = size.y;
                this._canvas.style.position = 'absolute';
                this._canvas.style.pointerEvents = 'none';
                this._canvas.style.opacity = '0.7';
                this._canvas.style.zIndex = '400';

                const pane = map.getPane('overlayPane');
                pane.appendChild(this._canvas);

                map.on('moveend zoomend resize', this._redraw, this);
                this._redraw();
            },
            onRemove(map) {
                map.off('moveend zoomend resize', this._redraw, this);
                if (this._canvas && this._canvas.parentNode) {
                    this._canvas.parentNode.removeChild(this._canvas);
                }
            },
            _redraw() {
                const map = this._map;
                if (!map || !this._canvas) return;

                const size = map.getSize();
                this._canvas.width = size.x;
                this._canvas.height = size.y;
                this._canvas.style.width = size.x + 'px';
                this._canvas.style.height = size.y + 'px';

                // Align canvas to map container
                const topLeft = map.containerPointToLayerPoint([0, 0]);
                L.DomUtil.setPosition(this._canvas, topLeft);

                const ctx = this._canvas.getContext('2d');
                ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

                const maxWeight = Math.max(...points.map(p => p.weight || 1), 1);

                points.forEach(({ lat, lng, weight = 1 }) => {
                    const point = map.latLngToContainerPoint([lat, lng]);
                    const intensity = weight / maxWeight;
                    const radius = 30 + intensity * 40;

                    const gradient = ctx.createRadialGradient(
                        point.x, point.y, 0,
                        point.x, point.y, radius
                    );

                    const alpha = 0.15 + intensity * 0.55;
                    if (intensity > 0.7) {
                        gradient.addColorStop(0, `rgba(239, 68, 68, ${alpha})`);
                        gradient.addColorStop(0.4, `rgba(249, 115, 22, ${alpha * 0.7})`);
                        gradient.addColorStop(1, 'rgba(249, 115, 22, 0)');
                    } else if (intensity > 0.35) {
                        gradient.addColorStop(0, `rgba(249, 115, 22, ${alpha})`);
                        gradient.addColorStop(0.4, `rgba(234, 179, 8, ${alpha * 0.7})`);
                        gradient.addColorStop(1, 'rgba(234, 179, 8, 0)');
                    } else {
                        gradient.addColorStop(0, `rgba(34, 197, 94, ${alpha})`);
                        gradient.addColorStop(0.4, `rgba(59, 130, 246, ${alpha * 0.7})`);
                        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
                    }

                    ctx.beginPath();
                    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = gradient;
                    ctx.fill();
                });
            }
        });

        const layer = new CanvasHeatmap();
        canvasRef.current = layer;
        layer.addTo(map);

        return () => {
            if (canvasRef.current) {
                map.removeLayer(canvasRef.current);
                canvasRef.current = null;
            }
        };
    }, [points, map]);

    return null;
}

// Geocode a UK address to lat/lng using nominatim
const geocodeCache = {};
async function geocodeAddress(address) {
    if (!address) return null;
    const key = address.toLowerCase().trim();
    if (geocodeCache[key]) return geocodeCache[key];

    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=gb`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'MealDrop-Admin/1.0' } });
        const data = await res.json();
        if (data && data[0]) {
            const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            geocodeCache[key] = result;
            return result;
        }
    } catch (e) {
        // silently fail
    }
    return null;
}

// Extract postcode from address string for faster geocoding
function extractPostcode(address) {
    if (!address) return null;
    const match = address.match(/[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}/i);
    return match ? match[0].toUpperCase() : null;
}

const TIME_FILTERS = [
    { label: 'Last 2 hours', value: 2 },
    { label: 'Last 6 hours', value: 6 },
    { label: 'Last 24 hours', value: 24 },
    { label: 'Last 7 days', value: 168 },
];

const STATUS_COLORS = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    preparing: 'bg-orange-100 text-orange-800',
    out_for_delivery: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
};

export default function DeliveryHeatmap() {
    const [orders, setOrders] = useState([]);
    const [heatPoints, setHeatPoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [geocoding, setGeocoding] = useState(false);
    const [geocodedCount, setGeocodedCount] = useState(0);
    const [timeFilter, setTimeFilter] = useState(6);
    const [stats, setStats] = useState({ total: 0, active: 0, hotZones: [] });
    const [refreshKey, setRefreshKey] = useState(0);

    const fetchAndProcess = async () => {
        setLoading(true);
        setHeatPoints([]);
        setGeocodedCount(0);

        try {
            const cutoff = new Date(Date.now() - timeFilter * 60 * 60 * 1000).toISOString();
            const allOrders = await base44.entities.Order.filter({ order_type: 'delivery' }, '-created_date', 500);
            const filtered = allOrders.filter(o =>
                o.created_date >= cutoff &&
                o.delivery_address &&
                !['cancelled'].includes(o.status)
            );

            setOrders(filtered);

            const activeStatuses = ['pending', 'confirmed', 'preparing', 'out_for_delivery'];
            const active = filtered.filter(o => activeStatuses.includes(o.status)).length;

            setStats(prev => ({ ...prev, total: filtered.length, active }));
            setLoading(false);

            // Geocode addresses in batches (rate-limited)
            setGeocoding(true);
            const points = [];
            const addressGroups = {};

            // Group by postcode/address to reduce API calls
            for (const order of filtered) {
                const postcode = extractPostcode(order.delivery_address) || order.delivery_address;
                if (!addressGroups[postcode]) {
                    addressGroups[postcode] = { address: order.delivery_address, count: 0 };
                }
                addressGroups[postcode].count++;
            }

            const entries = Object.entries(addressGroups);
            let done = 0;

            // Process in batches of 5 with delay
            for (let i = 0; i < entries.length; i += 5) {
                const batch = entries.slice(i, i + 5);
                await Promise.all(batch.map(async ([key, { address, count }]) => {
                    const postcode = extractPostcode(address);
                    const queryAddress = postcode ? `${postcode}, UK` : address;
                    const coords = await geocodeAddress(queryAddress);
                    if (coords) {
                        points.push({ ...coords, weight: count });
                    }
                    done++;
                    setGeocodedCount(done);
                }));

                setHeatPoints([...points]);

                // Rate limit: 1 req/sec for nominatim
                if (i + 5 < entries.length) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            // Compute hot zones (top clusters)
            const sorted = [...points].sort((a, b) => b.weight - a.weight).slice(0, 5);
            setStats(prev => ({ ...prev, hotZones: sorted }));
            setGeocoding(false);
        } catch (e) {
            console.error('Heatmap fetch error:', e);
            setLoading(false);
            setGeocoding(false);
        }
    };

    useEffect(() => {
        fetchAndProcess();
    }, [timeFilter, refreshKey]);

    const totalAddresses = Object.keys(
        orders.reduce((acc, o) => {
            const k = extractPostcode(o.delivery_address) || o.delivery_address;
            acc[k] = true;
            return acc;
        }, {})
    ).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Flame className="h-6 w-6 text-orange-500" />
                        Delivery Demand Heatmap
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Live view of active delivery orders by location</p>
                </div>
                <div className="flex items-center gap-3">
                    <Select value={String(timeFilter)} onValueChange={v => setTimeFilter(Number(v))}>
                        <SelectTrigger className="w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_FILTERS.map(f => (
                                <SelectItem key={f.value} value={String(f.value)}>{f.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={() => setRefreshKey(k => k + 1)} disabled={loading || geocoding}>
                        <RefreshCw className={`h-4 w-4 ${(loading || geocoding) ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Orders', value: stats.total, icon: MapPin, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Active Orders', value: stats.active, icon: Flame, color: 'text-orange-600', bg: 'bg-orange-50' },
                    { label: 'Unique Zones', value: totalAddresses, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Geocoded', value: `${geocodedCount}/${totalAddresses}`, icon: MapPin, color: 'text-green-600', bg: 'bg-green-50' },
                ].map(s => (
                    <Card key={s.label} className="border-0 shadow-sm">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                                <s.icon className={`h-5 w-5 ${s.color}`} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">{s.label}</p>
                                <p className="text-xl font-bold text-gray-900">{s.value}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Map */}
                <div className="lg:col-span-3">
                    <Card className="overflow-hidden border-0 shadow-md">
                        <CardHeader className="pb-3 border-b bg-gray-50">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Live Delivery Map</CardTitle>
                                {geocoding && (
                                    <Badge className="bg-orange-100 text-orange-700 gap-1 text-xs">
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                        Geocoding {geocodedCount}/{totalAddresses}
                                    </Badge>
                                )}
                                {!geocoding && heatPoints.length > 0 && (
                                    <Badge className="bg-green-100 text-green-700 text-xs">
                                        {heatPoints.length} zones plotted
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="h-[500px] flex items-center justify-center bg-gray-50">
                                    <div className="text-center">
                                        <RefreshCw className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-2" />
                                        <p className="text-sm text-gray-500">Loading orders...</p>
                                    </div>
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="h-[500px] flex items-center justify-center bg-gray-50">
                                    <div className="text-center">
                                        <AlertCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-500 font-medium">No delivery orders found</p>
                                        <p className="text-sm text-gray-400 mt-1">Try expanding the time window</p>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ height: '500px' }}>
                                    <MapContainer
                                        center={[51.505, -0.09]}
                                        zoom={10}
                                        style={{ height: '100%', width: '100%' }}
                                        scrollWheelZoom={true}
                                    >
                                        <TileLayer
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                        />
                                        {heatPoints.length > 0 && <HeatmapLayer points={heatPoints} />}
                                    </MapContainer>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Legend */}
                    <div className="mt-3 flex items-center gap-6 px-1">
                        <span className="text-xs text-gray-500 font-medium">Intensity:</span>
                        {[
                            { color: 'bg-blue-400', label: 'Low' },
                            { color: 'bg-yellow-400', label: 'Medium' },
                            { color: 'bg-orange-500', label: 'High' },
                            { color: 'bg-red-500', label: 'Very High' },
                        ].map(l => (
                            <div key={l.label} className="flex items-center gap-1.5">
                                <div className={`w-3 h-3 rounded-full ${l.color}`} />
                                <span className="text-xs text-gray-500">{l.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Hot Zones Sidebar */}
                <div className="space-y-4">
                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-3 border-b bg-gray-50">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Flame className="h-4 w-4 text-orange-500" />
                                Hottest Zones
                            </CardTitle>
                            <CardDescription className="text-xs">Top demand clusters</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            {stats.hotZones.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">No data yet</p>
                            ) : stats.hotZones.map((zone, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                                        i === 0 ? 'bg-red-500' : i === 1 ? 'bg-orange-500' : i === 2 ? 'bg-yellow-500' : 'bg-gray-400'
                                    }`}>
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-gray-500">{zone.lat.toFixed(3)}, {zone.lng.toFixed(3)}</p>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <div className="h-1.5 bg-gray-100 rounded-full flex-1">
                                                <div
                                                    className="h-1.5 bg-orange-400 rounded-full"
                                                    style={{ width: `${(zone.weight / (stats.hotZones[0]?.weight || 1)) * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-semibold text-gray-700">{zone.weight}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Order Status Breakdown */}
                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-3 border-b bg-gray-50">
                            <CardTitle className="text-sm">Status Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2">
                            {Object.entries(
                                orders.reduce((acc, o) => {
                                    acc[o.status] = (acc[o.status] || 0) + 1;
                                    return acc;
                                }, {})
                            ).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                                <div key={status} className="flex items-center justify-between">
                                    <Badge className={`text-xs ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                                        {status.replace(/_/g, ' ')}
                                    </Badge>
                                    <span className="text-sm font-semibold text-gray-800">{count}</span>
                                </div>
                            ))}
                            {orders.length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-2">No orders</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}