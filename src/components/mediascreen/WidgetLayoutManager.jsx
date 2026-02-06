import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Cloud, Clock, ShoppingBag, Globe, Layout } from 'lucide-react';
import { toast } from 'sonner';

export default function WidgetLayoutManager({ restaurantId }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [editingLayout, setEditingLayout] = useState(null);
    const [layoutName, setLayoutName] = useState('');
    const [layoutDescription, setLayoutDescription] = useState('');
    const [zones, setZones] = useState([]);
    const [applyToWalls, setApplyToWalls] = useState([]);
    const [isDefault, setIsDefault] = useState(false);

    const { data: layouts = [] } = useQuery({
        queryKey: ['widget-layouts', restaurantId],
        queryFn: () => base44.entities.WidgetLayout.filter({ restaurant_id: restaurantId })
    });

    const { data: widgetConfigs = [] } = useQuery({
        queryKey: ['widget-configurations', restaurantId],
        queryFn: () => base44.entities.WidgetConfiguration.filter({ restaurant_id: restaurantId })
    });

    const { data: screens = [] } = useQuery({
        queryKey: ['screens', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId })
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.WidgetLayout.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['widget-layouts']);
            toast.success('Widget layout created');
            resetForm();
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.WidgetLayout.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['widget-layouts']);
            toast.success('Widget layout updated');
            resetForm();
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.WidgetLayout.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['widget-layouts']);
            toast.success('Widget layout deleted');
        }
    });

    const wallNames = [...new Set(screens
        .filter(s => s.media_wall_config?.enabled && s.media_wall_config?.wall_name)
        .map(s => s.media_wall_config.wall_name))];

    const resetForm = () => {
        setShowDialog(false);
        setEditingLayout(null);
        setLayoutName('');
        setLayoutDescription('');
        setZones([]);
        setApplyToWalls([]);
        setIsDefault(false);
    };

    const handleEdit = (layout) => {
        setEditingLayout(layout);
        setLayoutName(layout.name);
        setLayoutDescription(layout.description || '');
        setZones(layout.zones || []);
        setApplyToWalls(layout.apply_to_walls || []);
        setIsDefault(layout.is_default || false);
        setShowDialog(true);
    };

    const addZone = () => {
        const newZone = {
            id: `zone-${Date.now()}`,
            name: `Widget ${zones.length + 1}`,
            widget_type: 'clock',
            widget_config_id: null,
            x: 10,
            y: 10 + (zones.length * 15),
            width: 30,
            height: 20,
            z_index: zones.length
        };
        setZones([...zones, newZone]);
    };

    const updateZone = (id, updates) => {
        setZones(zones.map(z => z.id === id ? { ...z, ...updates } : z));
    };

    const removeZone = (id) => {
        setZones(zones.filter(z => z.id !== id));
    };

    const handleSave = () => {
        if (!layoutName.trim()) {
            toast.error('Please enter a layout name');
            return;
        }

        if (zones.length === 0) {
            toast.error('Please add at least one widget zone');
            return;
        }

        const layoutData = {
            restaurant_id: restaurantId,
            name: layoutName,
            description: layoutDescription,
            zones,
            apply_to_walls: applyToWalls,
            is_default: isDefault,
            is_active: true
        };

        if (editingLayout) {
            updateMutation.mutate({ id: editingLayout.id, data: layoutData });
        } else {
            createMutation.mutate(layoutData);
        }
    };

    const getWidgetIcon = (type) => {
        switch(type) {
            case 'weather': return <Cloud className="h-4 w-4" />;
            case 'clock': return <Clock className="h-4 w-4" />;
            case 'orders': return <ShoppingBag className="h-4 w-4" />;
            default: return null;
        }
    };

    const getConfigName = (configId) => {
        const config = widgetConfigs.find(c => c.id === configId);
        return config?.name || 'Default Config';
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Widget Layouts</h3>
                    <p className="text-sm text-gray-500">Define zones for widget placement on media walls</p>
                </div>
                <Button onClick={() => setShowDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Layout
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {layouts.map(layout => (
                    <Card key={layout.id}>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Layout className="h-4 w-4" />
                                        {layout.name}
                                        {layout.is_default && <Badge>Default</Badge>}
                                        {(!layout.apply_to_walls || layout.apply_to_walls.length === 0) && (
                                            <Badge variant="outline" className="flex items-center gap-1">
                                                <Globe className="h-3 w-3" />
                                                Global
                                            </Badge>
                                        )}
                                    </CardTitle>
                                    {layout.description && (
                                        <p className="text-sm text-gray-600 mt-1">{layout.description}</p>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => handleEdit(layout)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => {
                                        if (confirm('Delete this layout?')) {
                                            deleteMutation.mutate(layout.id);
                                        }
                                    }}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <div className="text-xs text-gray-500">
                                    {layout.zones?.length || 0} widget zone{layout.zones?.length !== 1 ? 's' : ''}
                                </div>
                                {layout.zones && layout.zones.length > 0 && (
                                    <div className="space-y-1">
                                        {layout.zones.map(zone => (
                                            <div key={zone.id} className="flex items-center gap-2 text-xs p-2 bg-gray-50 rounded">
                                                {getWidgetIcon(zone.widget_type)}
                                                <span className="flex-1">{zone.name}</span>
                                                <Badge variant="outline" className="text-[10px]">
                                                    {zone.widget_type}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {layout.apply_to_walls && layout.apply_to_walls.length > 0 && (
                                    <div className="flex gap-1 mt-2 flex-wrap">
                                        {layout.apply_to_walls.map(wall => (
                                            <Badge key={wall} variant="secondary" className="text-xs">{wall}</Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {layouts.length === 0 && (
                    <Card className="col-span-2">
                        <CardContent className="py-12 text-center">
                            <Layout className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                            <p className="text-gray-600 mb-4">No widget layouts yet</p>
                            <Button onClick={() => setShowDialog(true)}>
                                Create Your First Layout
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>

            <Dialog open={showDialog} onOpenChange={(open) => !open && resetForm()}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingLayout ? 'Edit Widget Layout' : 'New Widget Layout'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Layout Name</Label>
                                <Input
                                    value={layoutName}
                                    onChange={(e) => setLayoutName(e.target.value)}
                                    placeholder="e.g., Main Wall Widgets"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label>Description (optional)</Label>
                                <Input
                                    value={layoutDescription}
                                    onChange={(e) => setLayoutDescription(e.target.value)}
                                    placeholder="Describe this layout"
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Apply to Media Walls</Label>
                                <Select 
                                    value={applyToWalls.length === 0 ? 'global' : 'specific'}
                                    onValueChange={(val) => setApplyToWalls(val === 'global' ? [] : applyToWalls)}
                                >
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="global">Global (All Walls)</SelectItem>
                                        <SelectItem value="specific">Specific Walls</SelectItem>
                                    </SelectContent>
                                </Select>
                                {applyToWalls.length === 0 ? null : (
                                    <div className="mt-2 space-y-1">
                                        {wallNames.map(wall => (
                                            <label key={wall} className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={applyToWalls.includes(wall)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setApplyToWalls([...applyToWalls, wall]);
                                                        } else {
                                                            setApplyToWalls(applyToWalls.filter(w => w !== wall));
                                                        }
                                                    }}
                                                    className="rounded"
                                                />
                                                {wall}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <Label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={isDefault}
                                        onChange={(e) => setIsDefault(e.target.checked)}
                                        className="rounded"
                                    />
                                    Set as Default Layout
                                </Label>
                                <p className="text-xs text-gray-500 mt-1">
                                    Default layout will be used when no specific layout is assigned
                                </p>
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-medium">Widget Zones</h4>
                                <Button size="sm" onClick={addZone}>
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Zone
                                </Button>
                            </div>

                            {zones.length === 0 ? (
                                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                                    <p className="text-sm text-gray-500">No zones yet. Add a zone to get started.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {zones.map((zone, idx) => (
                                        <Card key={zone.id}>
                                            <CardContent className="p-4">
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-sm">Zone {idx + 1}</span>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => removeZone(zone.id)}
                                                        >
                                                            <Trash2 className="h-3 w-3 text-red-500" />
                                                        </Button>
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-3">
                                                        <div>
                                                            <Label className="text-xs">Zone Name</Label>
                                                            <Input
                                                                value={zone.name}
                                                                onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                                                                className="h-8 text-sm mt-1"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs">Widget Type</Label>
                                                            <Select
                                                                value={zone.widget_type}
                                                                onValueChange={(value) => updateZone(zone.id, { widget_type: value })}
                                                            >
                                                                <SelectTrigger className="h-8 text-sm mt-1">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="weather">Weather</SelectItem>
                                                                    <SelectItem value="clock">Clock</SelectItem>
                                                                    <SelectItem value="orders">Orders</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs">Configuration Override</Label>
                                                            <Select
                                                                value={zone.widget_config_id || 'default'}
                                                                onValueChange={(value) => updateZone(zone.id, { 
                                                                    widget_config_id: value === 'default' ? null : value 
                                                                })}
                                                            >
                                                                <SelectTrigger className="h-8 text-sm mt-1">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="default">Use Default</SelectItem>
                                                                    {widgetConfigs
                                                                        .filter(c => c.widget_type === zone.widget_type)
                                                                        .map(config => (
                                                                            <SelectItem key={config.id} value={config.id}>
                                                                                {config.name}
                                                                            </SelectItem>
                                                                        ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-4 gap-2">
                                                        <div>
                                                            <Label className="text-xs">X (%)</Label>
                                                            <Input
                                                                type="number"
                                                                value={zone.x}
                                                                onChange={(e) => updateZone(zone.id, { x: parseFloat(e.target.value) || 0 })}
                                                                className="h-7 text-xs mt-1"
                                                                min="0"
                                                                max="100"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs">Y (%)</Label>
                                                            <Input
                                                                type="number"
                                                                value={zone.y}
                                                                onChange={(e) => updateZone(zone.id, { y: parseFloat(e.target.value) || 0 })}
                                                                className="h-7 text-xs mt-1"
                                                                min="0"
                                                                max="100"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs">Width (%)</Label>
                                                            <Input
                                                                type="number"
                                                                value={zone.width}
                                                                onChange={(e) => updateZone(zone.id, { width: parseFloat(e.target.value) || 0 })}
                                                                className="h-7 text-xs mt-1"
                                                                min="1"
                                                                max="100"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs">Height (%)</Label>
                                                            <Input
                                                                type="number"
                                                                value={zone.height}
                                                                onChange={(e) => updateZone(zone.id, { height: parseFloat(e.target.value) || 0 })}
                                                                className="h-7 text-xs mt-1"
                                                                min="1"
                                                                max="100"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}

                            {/* Visual Preview */}
                            {zones.length > 0 && (
                                <div className="mt-4">
                                    <Label className="text-xs mb-2 block">Layout Preview</Label>
                                    <div className="relative w-full h-64 bg-gray-900 rounded-lg overflow-hidden border-2">
                                        {zones.map(zone => (
                                            <div
                                                key={zone.id}
                                                className="absolute border-2 border-dashed bg-white bg-opacity-20 backdrop-blur-sm flex items-center justify-center"
                                                style={{
                                                    left: `${zone.x}%`,
                                                    top: `${zone.y}%`,
                                                    width: `${zone.width}%`,
                                                    height: `${zone.height}%`,
                                                    zIndex: zone.z_index
                                                }}
                                            >
                                                <div className="text-white text-xs text-center">
                                                    {getWidgetIcon(zone.widget_type)}
                                                    <div className="mt-1">{zone.name}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 pt-4 border-t">
                            <Button onClick={handleSave} className="flex-1">
                                {editingLayout ? 'Update' : 'Create'} Layout
                            </Button>
                            <Button onClick={resetForm} variant="outline">
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}