import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapContainer, TileLayer, Polygon, Circle, Popup, useMap, Marker } from 'react-leaflet';
import L from 'leaflet';

// Fix default leaflet marker icon
const restaurantIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});
import { MapPin, Trash2, Edit, Plus, DollarSign, Clock } from 'lucide-react';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import '@geoman-io/leaflet-geoman-free';

function GeomanControl({ onDrawn, editingZone, mapKey }) {
    const map = useMap();

    useEffect(() => {
        if (!map) return;

        // Fix map size on mount
        const sizeTimeout = setTimeout(() => {
            map.invalidateSize();
        }, 200);

        let cleanup;

        // Initialize geoman controls if available
        const initGeoman = async () => {
            try {
                if (!map.pm) return;

                // Remove existing controls first
                if (map.pm.controlsVisible()) {
                    map.pm.removeControls();
                }
                
                // Add controls
                map.pm.addControls({
                    position: 'topright',
                    drawMarker: false,
                    drawCircleMarker: false,
                    drawCircle: false,
                    drawPolyline: false,
                    drawRectangle: false,
                    drawPolygon: true,
                    editMode: false,
                    dragMode: false,
                    cutPolygon: false,
                    rotateMode: false,
                    removalMode: false,
                });

                const handleCreate = (e) => {
                    const layer = e.layer;
                    if (e.shape === 'Polygon') {
                        const coords = layer.getLatLngs()[0].map(latlng => ({
                            lat: latlng.lat,
                            lng: latlng.lng
                        }));
                        onDrawn(coords);
                        // Remove the layer immediately to prevent overlaps
                        if (map.hasLayer(layer)) {
                            map.removeLayer(layer);
                        }
                    }
                };

                map.on('pm:create', handleCreate);

                cleanup = () => {
                    map.off('pm:create', handleCreate);
                    if (map.pm && map.pm.controlsVisible()) {
                        try {
                            map.pm.removeControls();
                        } catch (e) {
                            // Controls already removed
                        }
                    }
                };
            } catch (err) {
                // Geoman failed to load - map will still work without drawing tools
            }
        };

        initGeoman();

        return () => {
            clearTimeout(sizeTimeout);
            if (cleanup) cleanup();
        };
    }, [map, mapKey]);

    return null;
}

export default function DeliveryZoneManagement({ restaurantId, restaurantLocation, restaurantAddress }) {
    const [showDialog, setShowDialog] = useState(false);
    const [editingZone, setEditingZone] = useState(null);
    const [drawnCoordinates, setDrawnCoordinates] = useState(null);
    const [mapKey, setMapKey] = useState(0);
    const queryClient = useQueryClient();
    // mapRef removed — ref is not a valid react-leaflet MapContainer prop

    const [formData, setFormData] = useState({
        name: '',
        delivery_fee: '',
        estimated_delivery_time: '',
        min_order_value: '',
        color: '#FF6B35',
        zone_type: 'polygon',
        postcodes_input: '',
        radius_miles: ''
    });

    const { data: rawZones = [] } = useQuery({
        queryKey: ['delivery-zones', restaurantId],
        queryFn: () => base44.entities.DeliveryZone.filter({ restaurant_id: restaurantId }),
    });

    const zones = rawZones;

    const createZoneMutation = useMutation({
        mutationFn: (data) => base44.entities.DeliveryZone.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['delivery-zones']);
            toast.success('Delivery zone created');
            resetForm();
        },
    });

    const updateZoneMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.DeliveryZone.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['delivery-zones']);
            toast.success('Delivery zone updated');
            resetForm();
        },
    });

    const deleteZoneMutation = useMutation({
        mutationFn: (id) => base44.entities.DeliveryZone.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['delivery-zones']);
            toast.success('Delivery zone deleted');
        },
    });

    const toggleZoneMutation = useMutation({
        mutationFn: ({ id, is_active }) => 
            base44.entities.DeliveryZone.update(id, { is_active }),
        onSuccess: () => {
            queryClient.invalidateQueries(['delivery-zones']);
        },
    });

    const resetForm = () => {
        setFormData({
            name: '',
            delivery_fee: '',
            estimated_delivery_time: '',
            min_order_value: '',
            color: '#FF6B35',
            zone_type: 'polygon',
            postcodes_input: '',
            radius_miles: ''
        });
        setDrawnCoordinates(null);
        setEditingZone(null);
        setShowDialog(false);
        setMapKey(prev => prev + 1);
    };

    const handleEdit = (zone) => {
        const zoneType = zone.zone_type || (zone.postcodes?.length > 0 ? 'postcode' : zone.radius_miles ? 'radius' : 'polygon');
        setEditingZone(zone);
        setFormData({
            name: zone.name,
            delivery_fee: zone.delivery_fee,
            estimated_delivery_time: zone.estimated_delivery_time,
            min_order_value: zone.min_order_value || '',
            color: zone.color || '#FF6B35',
            zone_type: zoneType,
            postcodes_input: (zone.postcodes || []).join(', '),
            radius_miles: zone.radius_miles || ''
        });
        setDrawnCoordinates(zoneType === 'polygon' ? zone.coordinates : null);
        setMapKey(prev => prev + 1);
        setShowDialog(true);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.delivery_fee || !formData.estimated_delivery_time) {
            toast.error('Please fill in all required fields');
            return;
        }

        const zoneData = {
            restaurant_id: restaurantId,
            name: formData.name,
            zone_type: formData.zone_type,
            delivery_fee: parseFloat(formData.delivery_fee),
            estimated_delivery_time: formData.estimated_delivery_time,
            min_order_value: formData.min_order_value ? parseFloat(formData.min_order_value) : null,
            color: formData.color,
            is_active: true,
            coordinates: null,
            postcodes: null,
            radius_miles: null,
            radius_center: null
        };

        if (formData.zone_type === 'polygon') {
            if (!drawnCoordinates || drawnCoordinates.length < 3) {
                toast.error('Please draw a delivery zone on the map');
                return;
            }
            zoneData.coordinates = drawnCoordinates;
        } else if (formData.zone_type === 'postcode') {
            const postcodes = formData.postcodes_input
                .split(/[,\n]+/)
                .map(p => p.trim().toUpperCase())
                .filter(Boolean);
            if (postcodes.length === 0) {
                toast.error('Please enter at least one postcode district');
                return;
            }
            zoneData.postcodes = postcodes;
        } else if (formData.zone_type === 'radius') {
            const miles = parseFloat(formData.radius_miles);
            if (!miles || miles <= 0) {
                toast.error('Please enter a valid radius in miles');
                return;
            }
            zoneData.radius_miles = miles;
            if (restaurantLocation) {
                zoneData.radius_center = { lat: restaurantLocation.lat, lng: restaurantLocation.lng };
            } else if (restaurantAddress) {
                // Geocode the restaurant address using Nominatim
                const toastId = toast.loading('Locating restaurant address...');
                let geocoded = null;
                try {
                    // Try with GB restriction first
                    const res1 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(restaurantAddress)}&countrycodes=GB&limit=1`, { headers: { 'Accept-Language': 'en' } });
                    const r1 = await res1.json();
                    if (r1?.[0]) {
                        geocoded = { lat: parseFloat(r1[0].lat), lng: parseFloat(r1[0].lon) };
                    } else {
                        // Fallback: try without country restriction
                        const res2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(restaurantAddress)}&limit=1`, { headers: { 'Accept-Language': 'en' } });
                        const r2 = await res2.json();
                        if (r2?.[0]) {
                            geocoded = { lat: parseFloat(r2[0].lat), lng: parseFloat(r2[0].lon) };
                        }
                    }
                } catch (e) { console.error('Geocoding failed:', e); }
                toast.dismiss(toastId);
                if (!geocoded) {
                    toast.error('Could not locate restaurant address. Please enter your full postcode in the address (e.g. "123 High St, London, E1 6RF") or add GPS coordinates in restaurant settings.');
                    return;
                }
                zoneData.radius_center = geocoded;
            } else {
                toast.error('Restaurant address is required for radius zones. Please set it in restaurant settings first.');
                return;
            }
        }

        if (editingZone) {
            updateZoneMutation.mutate({ id: editingZone.id, data: zoneData });
        } else {
            createZoneMutation.mutate(zoneData);
        }
    };

    const handleDrawn = (coords) => {
        setDrawnCoordinates(coords);
    };

    const centerLocation = restaurantLocation || { lat: 51.5074, lng: -0.1278 };



    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Delivery Zones</h2>
                    <p className="text-gray-600 text-sm">Define delivery areas with custom fees and ETAs</p>
                </div>
                <Button onClick={() => setShowDialog(true)} className="bg-orange-500 hover:bg-orange-600">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Zone
                </Button>
            </div>

            {/* Map View */}
            <Card>
                <CardHeader>
                    <CardTitle>Delivery Coverage Map</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-96 rounded-lg overflow-hidden border relative" style={{ zIndex: 1 }}>
                        <MapContainer
                            center={[centerLocation.lat, centerLocation.lng]}
                            zoom={12}
                            style={{ height: '100%', width: '100%' }}
                            zoomControl={true}
                        >
                            <TileLayer url="https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}" attribution='&copy; Google Maps' maxZoom={20} />
                            
                            {restaurantLocation && (
                                <Marker position={[restaurantLocation.lat, restaurantLocation.lng]} icon={restaurantIcon}>
                                    <Popup>📍 Your Restaurant</Popup>
                                </Marker>
                            )}

                            {zones.map((zone) => {
                                if (!zone.is_active) return null;
                                const type = zone.zone_type || (zone.postcodes?.length > 0 ? 'postcode' : zone.radius_miles ? 'radius' : 'polygon');
                                const popupContent = (
                                    <div className="p-2 min-w-[180px]">
                                        <h3 className="font-semibold text-sm">{zone.name}</h3>
                                        <p className="text-xs text-gray-600 mt-1">Fee: <span className="font-semibold">£{parseFloat(zone.delivery_fee || 0).toFixed(2)}</span></p>
                                        <p className="text-xs text-gray-600">ETA: <span className="font-semibold">{zone.estimated_delivery_time}</span></p>
                                    </div>
                                );
                                if (type === 'radius' && zone.radius_center?.lat && zone.radius_miles) {
                                    return (
                                        <Circle
                                            key={`${zone.id}-main`}
                                            center={[zone.radius_center.lat, zone.radius_center.lng]}
                                            radius={zone.radius_miles * 1609.34}
                                            pathOptions={{ color: zone.color || '#FF6B35', fillColor: zone.color || '#FF6B35', fillOpacity: 0.2, weight: 2 }}
                                        ><Popup>{popupContent}</Popup></Circle>
                                    );
                                }
                                if (type === 'postcode') {
                                    return null; // Postcode zones can't be shown on map without geocoding each district
                                }
                                if (!zone.coordinates || zone.coordinates.length < 3) return null;
                                return (
                                    <Polygon
                                        key={`${zone.id}-main`}
                                        positions={zone.coordinates.map(c => [c.lat, c.lng])}
                                        pathOptions={{ color: zone.color || '#FF6B35', fillColor: zone.color || '#FF6B35', fillOpacity: 0.2, weight: 2 }}
                                    ><Popup>{popupContent}</Popup></Polygon>
                                );
                            })}
                        </MapContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Zones List */}
            <div className="grid gap-4">
                {zones.length === 0 ? (
                    <Card>
                        <CardContent className="text-center py-12">
                            <MapPin className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">
                                No Delivery Zones
                            </h3>
                            <p className="text-gray-500 mb-4">
                                Create delivery zones to set custom fees and delivery times
                            </p>
                            <Button onClick={() => setShowDialog(true)} className="bg-orange-500">
                                <Plus className="h-4 w-4 mr-2" />
                                Create First Zone
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    zones.map((zone) => (
                        <Card key={zone.id}>
                            <CardContent className="pt-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                                            <div
                                                className="w-6 h-6 rounded border-2"
                                                style={{ backgroundColor: zone.color }}
                                            />
                                            <h3 className="text-lg font-semibold">{zone.name}</h3>
                                            <Switch
                                                checked={zone.is_active}
                                                onCheckedChange={(checked) =>
                                                    toggleZoneMutation.mutate({ id: zone.id, is_active: checked })
                                                }
                                            />
                                            <Badge variant={zone.is_active ? 'default' : 'secondary'}>
                                                {zone.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                            {(zone.zone_type === 'postcode' || zone.postcodes?.length > 0) && (
                                                <Badge variant="outline" className="text-blue-700 border-blue-300">📮 Postcode</Badge>
                                            )}
                                            {(zone.zone_type === 'radius' || zone.radius_miles) && (
                                                <Badge variant="outline" className="text-purple-700 border-purple-300">📍 {zone.radius_miles} mi radius</Badge>
                                            )}
                                        </div>
                                        {zone.postcodes?.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {zone.postcodes.map((pc, i) => (
                                                    <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-mono">{pc}</span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="h-4 w-4 text-gray-500" />
                                                <div>
                                                    <p className="text-xs text-gray-500">Delivery Fee</p>
                                                    <p className="font-semibold">£{parseFloat(zone.delivery_fee || 0).toFixed(2)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-4 w-4 text-gray-500" />
                                                <div>
                                                    <p className="text-xs text-gray-500">ETA</p>
                                                    <p className="font-semibold">{zone.estimated_delivery_time}</p>
                                                </div>
                                            </div>
                                            {zone.min_order_value && (
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="h-4 w-4 text-gray-500" />
                                                    <div>
                                                        <p className="text-xs text-gray-500">Min Order</p>
                                                        <p className="font-semibold">£{parseFloat(zone.min_order_value || 0).toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => handleEdit(zone)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => {
                                                if (confirm('Delete this delivery zone?')) {
                                                    deleteZoneMutation.mutate(zone.id);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Add/Edit Zone Dialog */}
            <Dialog open={showDialog} onOpenChange={(open) => !open && resetForm()}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingZone ? 'Edit Delivery Zone' : 'Create Delivery Zone'}
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="name">Zone Name *</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g., Central, North, South"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label htmlFor="delivery_fee">Delivery Fee (£) *</Label>
                                <Input
                                    id="delivery_fee"
                                    type="number"
                                    step="0.01"
                                    placeholder="3.99"
                                    value={formData.delivery_fee}
                                    onChange={(e) => setFormData({ ...formData, delivery_fee: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label htmlFor="estimated_delivery_time">Estimated Delivery Time *</Label>
                                <Input
                                    id="estimated_delivery_time"
                                    placeholder="e.g., 30-45 min"
                                    value={formData.estimated_delivery_time}
                                    onChange={(e) => setFormData({ ...formData, estimated_delivery_time: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label htmlFor="min_order_value">Min Order Value (£)</Label>
                                <Input
                                    id="min_order_value"
                                    type="number"
                                    step="0.01"
                                    placeholder="10.00"
                                    value={formData.min_order_value}
                                    onChange={(e) => setFormData({ ...formData, min_order_value: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label htmlFor="color">Zone Color</Label>
                                <Input
                                    id="color"
                                    type="color"
                                    value={formData.color}
                                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Zone Type Selector */}
                        <div>
                            <Label className="mb-2 block">Zone Type *</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {[{ value: 'polygon', label: '🗺️ Draw on Map' }, { value: 'postcode', label: '📮 Postcode Areas' }, { value: 'radius', label: '📍 Radius' }].map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, zone_type: opt.value })}
                                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                            formData.zone_type === opt.value
                                                ? 'bg-orange-500 text-white border-orange-500'
                                                : 'bg-white text-gray-700 border-gray-300 hover:border-orange-300'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Polygon Map Drawing */}
                        {formData.zone_type === 'polygon' && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <Label>Draw Delivery Zone on Map *</Label>
                                {drawnCoordinates && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setDrawnCoordinates(null);
                                            setMapKey(prev => prev + 1);
                                        }}
                                    >
                                        Clear & Redraw
                                    </Button>
                                )}
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                                <p className="text-sm text-blue-800">
                                    👉 Click the polygon tool (📐) in the top-right corner of the map to draw your delivery zone
                                </p>
                            </div>
                            <div className="h-[500px] rounded-lg overflow-hidden border relative" style={{ zIndex: 1 }}>
                                <MapContainer
                                    key={mapKey}
                                    center={[centerLocation.lat, centerLocation.lng]}
                                    zoom={13}
                                    style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
                                    scrollWheelZoom={true}
                                    zoomControl={true}
                                >
                                    <TileLayer
                                        url="https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}"
                                        attribution='&copy; Google Maps'
                                        maxZoom={20}
                                    />
                                    <GeomanControl onDrawn={handleDrawn} editingZone={editingZone} mapKey={mapKey} />
                                    {restaurantLocation && (
                                        <Marker position={[restaurantLocation.lat, restaurantLocation.lng]} icon={restaurantIcon}>
                                            <Popup>📍 Your Restaurant</Popup>
                                        </Marker>
                                    )}
                                    {zones.map((zone) => {
                                        if (!zone.coordinates || (editingZone && zone.id === editingZone.id)) return null;
                                        const displayCoords = zone.coordinates.map(c => [c.lat, c.lng]);
                                        return (
                                            <Polygon
                                                key={`${zone.id}-edit`}
                                                positions={displayCoords}
                                                pathOptions={{
                                                    color: zone.color || '#999999',
                                                    fillColor: zone.color || '#999999',
                                                    fillOpacity: 0.1,
                                                    weight: 2,
                                                    dashArray: '5, 5',
                                                    opacity: 0.7
                                                }}
                                            >
                                                <Popup>
                                                    <div className="text-xs p-2 min-w-[180px]">
                                                        <p className="font-semibold text-sm">{zone.name}</p>
                                                    </div>
                                                </Popup>
                                            </Polygon>
                                        );
                                    })}
                                    {drawnCoordinates && (
                                        <Polygon
                                            positions={drawnCoordinates.map(c => [c.lat, c.lng])}
                                            pathOptions={{
                                                color: formData.color,
                                                fillColor: formData.color,
                                                fillOpacity: 0.3,
                                                weight: 2
                                            }}
                                        />
                                    )}
                                </MapContainer>
                            </div>
                        </div>
                        )}

                        {/* Postcode Input */}
                        {formData.zone_type === 'postcode' && (
                        <div>
                            <Label htmlFor="postcodes_input">Postcode Districts *</Label>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 my-2">
                                <p className="text-sm text-blue-800">
                                    📮 Enter UK postcode districts separated by commas (e.g., <strong>RM6, RM8, RM10, E1</strong>). These are the first part of a postcode before the space.
                                </p>
                            </div>
                            <textarea
                                id="postcodes_input"
                                rows={4}
                                className="w-full border rounded-lg p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                                placeholder="RM6, RM8, RM10, E1, E2"
                                value={formData.postcodes_input}
                                onChange={(e) => setFormData({ ...formData, postcodes_input: e.target.value })}
                            />
                            {formData.postcodes_input && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {formData.postcodes_input.split(/[,\n]+/).map(p => p.trim().toUpperCase()).filter(Boolean).map((pc, i) => (
                                        <span key={i} className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-mono font-medium">{pc}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                        )}

                        {/* Radius Input */}
                        {formData.zone_type === 'radius' && (
                        <div>
                            <Label htmlFor="radius_miles">Delivery Radius (miles) *</Label>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 my-2">
                                <p className="text-sm text-blue-800">
                                    📍 Enter the maximum delivery radius in miles from your restaurant location. Customers within this distance will be able to order.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Input
                                    id="radius_miles"
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    max="50"
                                    placeholder="e.g., 3"
                                    value={formData.radius_miles}
                                    onChange={(e) => setFormData({ ...formData, radius_miles: e.target.value })}
                                    className="max-w-[200px]"
                                />
                                <span className="text-gray-600 font-medium">miles from restaurant</span>
                            </div>
                            {!restaurantLocation && !restaurantAddress && (
                                <p className="text-sm text-red-600 mt-2">⚠️ Restaurant address must be set for radius zones to work. Please update your restaurant address in settings first.</p>
                            )}
                            {!restaurantLocation && restaurantAddress && (
                                <p className="text-sm text-amber-600 mt-2">ℹ️ No GPS coordinates set — your restaurant address will be geocoded automatically when you save.</p>
                            )}
                            {restaurantLocation && formData.radius_miles && (
                                <p className="text-sm text-green-700 mt-2">✓ Centred on restaurant at ({restaurantLocation.lat.toFixed(4)}, {restaurantLocation.lng.toFixed(4)})</p>
                            )}
                        </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={resetForm}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={createZoneMutation.isPending || updateZoneMutation.isPending}
                            className="bg-orange-500 hover:bg-orange-600"
                        >
                            {editingZone ? 'Update Zone' : 'Create Zone'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}