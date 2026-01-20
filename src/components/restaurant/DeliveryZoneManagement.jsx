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
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet';
import { MapPin, Trash2, Edit, Plus, DollarSign, Clock } from 'lucide-react';
import { toast } from 'sonner';
import * as turf from '@turf/turf';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';

function GeomanControl({ onDrawn, editingZone, mapKey }) {
    const map = useMap();

    useEffect(() => {
        if (!map) return;

        // Fix map size on mount
        const sizeTimeout = setTimeout(() => {
            map.invalidateSize();
        }, 200);

        let cleanup;

        // Import geoman dynamically
        const initGeoman = async () => {
            try {
                await import('@geoman-io/leaflet-geoman-free');
                
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

export default function DeliveryZoneManagement({ restaurantId, restaurantLocation }) {
    const [showDialog, setShowDialog] = useState(false);
    const [editingZone, setEditingZone] = useState(null);
    const [drawnCoordinates, setDrawnCoordinates] = useState(null);
    const [mapKey, setMapKey] = useState(0);
    const queryClient = useQueryClient();
    const mapRef = useRef(null);

    const [formData, setFormData] = useState({
        name: '',
        delivery_fee: '',
        estimated_delivery_time: '',
        min_order_value: '',
        color: '#FF6B35'
    });

    const { data: rawZones = [] } = useQuery({
        queryKey: ['delivery-zones', restaurantId],
        queryFn: () => base44.entities.DeliveryZone.filter({ restaurant_id: restaurantId }),
    });

    // Sort zones by creation date to ensure consistent ordering for overlap calculation
    const zones = rawZones.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

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
            color: '#FF6B35'
        });
        setDrawnCoordinates(null);
        setEditingZone(null);
        setShowDialog(false);
        setMapKey(prev => prev + 1);
    };

    const handleEdit = (zone) => {
        setEditingZone(zone);
        setFormData({
            name: zone.name,
            delivery_fee: zone.delivery_fee,
            estimated_delivery_time: zone.estimated_delivery_time,
            min_order_value: zone.min_order_value || '',
            color: zone.color || '#FF6B35'
        });
        setDrawnCoordinates(zone.coordinates);
        setMapKey(prev => prev + 1);
        setShowDialog(true);
    };

    const handleSubmit = () => {
        if (!formData.name || !formData.delivery_fee || !formData.estimated_delivery_time) {
            toast.error('Please fill in all required fields');
            return;
        }

        if (!drawnCoordinates) {
            toast.error('Please draw a delivery zone on the map');
            return;
        }

        const zoneData = {
            restaurant_id: restaurantId,
            name: formData.name,
            coordinates: drawnCoordinates,
            delivery_fee: parseFloat(formData.delivery_fee),
            estimated_delivery_time: formData.estimated_delivery_time,
            min_order_value: formData.min_order_value ? parseFloat(formData.min_order_value) : null,
            color: formData.color,
            is_active: true
        };

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

    // Calculate difference zones (remove overlapping areas)
    const getZoneDifference = (zoneToProcess) => {
        if (!zoneToProcess?.coordinates || zoneToProcess.coordinates.length < 3) {
            return null;
        }

        try {
            let coords = zoneToProcess.coordinates.map(c => [c.lng, c.lat]);
            let difference = turf.polygon([coords]);

            // Subtract each zone that was created before this one
            const zoneIndex = zones.findIndex(z => z.id === zoneToProcess.id);
            
            for (let i = 0; i < zoneIndex; i++) {
                const otherZone = zones[i];
                if (otherZone.coordinates && otherZone.coordinates.length >= 3) {
                    try {
                        const otherCoords = otherZone.coordinates.map(c => [c.lng, c.lat]);
                        const otherPolygon = turf.polygon([otherCoords]);
                        const result = turf.difference(difference, otherPolygon);
                        
                        if (result && result.geometry) {
                            if (result.geometry.type === 'GeometryCollection') {
                                // Handle geometry collection by extracting polygons
                                const polygons = result.geometry.geometries.filter(g => g.type === 'Polygon');
                                if (polygons.length > 0) {
                                    difference = turf.polygon(polygons[0].coordinates);
                                }
                            } else {
                                difference = result;
                            }
                        }
                    } catch (e) {
                        console.error('Error subtracting zone:', e);
                    }
                }
            }

            return difference;
        } catch (e) {
            console.error('Error calculating zone difference:', e);
            return null;
        }
    };

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
                            ref={mapRef}
                            zoomControl={true}
                        >
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            
                            {zones.map((zone) => {
                                if (!zone.is_active || !zone.coordinates) return null;
                                
                                const difference = getZoneDifference(zone);
                                let displayCoords = zone.coordinates.map(c => [c.lat, c.lng]);

                                if (difference && difference.geometry) {
                                    if (difference.geometry.type === 'Polygon') {
                                        displayCoords = difference.geometry.coordinates[0].map(c => [c[1], c[0]]);
                                    } else if (difference.geometry.type === 'MultiPolygon') {
                                        // For MultiPolygon, use the largest polygon
                                        const largest = difference.geometry.coordinates.reduce((prev, current) => 
                                            (prev.length > current.length) ? prev : current
                                        );
                                        displayCoords = largest[0].map(c => [c[1], c[0]]);
                                    }
                                }

                                return (
                                    <Polygon
                                        key={zone.id}
                                        positions={displayCoords}
                                        pathOptions={{
                                            color: zone.color || '#FF6B35',
                                            fillColor: zone.color || '#FF6B35',
                                            fillOpacity: 0.2,
                                        }}
                                    >
                                        <Popup>
                                            <div className="p-2">
                                                <h3 className="font-semibold">{zone.name}</h3>
                                                <p className="text-sm">Fee: £{zone.delivery_fee.toFixed(2)}</p>
                                                <p className="text-sm">ETA: {zone.estimated_delivery_time}</p>
                                            </div>
                                        </Popup>
                                    </Polygon>
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
                                        <div className="flex items-center gap-3 mb-2">
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
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="h-4 w-4 text-gray-500" />
                                                <div>
                                                    <p className="text-xs text-gray-500">Delivery Fee</p>
                                                    <p className="font-semibold">£{zone.delivery_fee.toFixed(2)}</p>
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
                                                        <p className="font-semibold">£{zone.min_order_value.toFixed(2)}</p>
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
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        attribution='&copy; OpenStreetMap'
                                    />
                                    <GeomanControl onDrawn={handleDrawn} editingZone={editingZone} mapKey={mapKey} />
                                    
                                    {/* Show all existing zones (with overlaps removed) */}
                                    {zones.map((zone, idx) => {
                                        if (!zone.coordinates || (editingZone && zone.id === editingZone.id)) return null;
                                        
                                        const difference = getZoneDifference(zone);
                                        let displayCoords = zone.coordinates.map(c => [c.lat, c.lng]);

                                        if (difference && difference.geometry) {
                                            if (difference.geometry.type === 'Polygon') {
                                                displayCoords = difference.geometry.coordinates[0].map(c => [c[1], c[0]]);
                                            } else if (difference.geometry.type === 'MultiPolygon') {
                                                const largest = difference.geometry.coordinates.reduce((prev, current) => 
                                                    (prev.length > current.length) ? prev : current
                                                );
                                                displayCoords = largest[0].map(c => [c[1], c[0]]);
                                            }
                                        }

                                        return (
                                            <Polygon
                                                key={zone.id}
                                                positions={displayCoords}
                                                pathOptions={{
                                                    color: zone.color || '#999999',
                                                    fillColor: zone.color || '#999999',
                                                    fillOpacity: 0.15,
                                                    weight: 2,
                                                    dashArray: '5, 5',
                                                    opacity: 0.8
                                                }}
                                            >
                                                <Popup>
                                                    <div className="text-xs p-2 space-y-1">
                                                        <p className="font-semibold text-sm">{zone.name}</p>
                                                        <p className="text-gray-700">Fee: £{zone.delivery_fee.toFixed(2)}</p>
                                                        <p className="text-gray-700">ETA: {zone.estimated_delivery_time}</p>
                                                    </div>
                                                </Popup>
                                            </Polygon>
                                        );
                                    })}
                                    
                                    {/* Current zone being drawn */}
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