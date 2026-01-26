import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Image, Type, Layout, Clock, CloudRain, List } from 'lucide-react';
import { toast } from 'sonner';

const ZONE_TYPES = [
    { value: 'media', label: 'Media (Image/Video)', icon: Image },
    { value: 'carousel', label: 'Image Carousel', icon: Layout },
    { value: 'text', label: 'Text Block', icon: Type },
    { value: 'clock', label: 'Clock & Date', icon: Clock },
    { value: 'weather', label: 'Weather Widget', icon: CloudRain },
    { value: 'menu', label: 'Menu Items', icon: List }
];

const PRESET_LAYOUTS = [
    {
        name: 'Full Screen',
        zones: [{ id: '1', type: 'media', position: { x: 0, y: 0, width: 100, height: 100 } }]
    },
    {
        name: 'Split Horizontal',
        zones: [
            { id: '1', type: 'media', position: { x: 0, y: 0, width: 50, height: 100 } },
            { id: '2', type: 'media', position: { x: 50, y: 0, width: 50, height: 100 } }
        ]
    },
    {
        name: 'Main + Sidebar',
        zones: [
            { id: '1', type: 'carousel', position: { x: 0, y: 0, width: 70, height: 100 } },
            { id: '2', type: 'text', position: { x: 70, y: 0, width: 30, height: 50 } },
            { id: '3', type: 'weather', position: { x: 70, y: 50, width: 30, height: 25 } },
            { id: '4', type: 'clock', position: { x: 70, y: 75, width: 30, height: 25 } }
        ]
    },
    {
        name: 'Picture-in-Picture',
        zones: [
            { id: '1', type: 'media', position: { x: 0, y: 0, width: 100, height: 100 } },
            { id: '2', type: 'media', position: { x: 65, y: 65, width: 30, height: 30 } }
        ]
    },
    {
        name: 'Triple Split',
        zones: [
            { id: '1', type: 'media', position: { x: 0, y: 0, width: 100, height: 60 } },
            { id: '2', type: 'carousel', position: { x: 0, y: 60, width: 50, height: 40 } },
            { id: '3', type: 'text', position: { x: 50, y: 60, width: 50, height: 40 } }
        ]
    }
];

export default function LayoutDesigner({ open, onClose, onSave, initialLayout }) {
    const [layoutName, setLayoutName] = useState(initialLayout?.template_name || '');
    const [zones, setZones] = useState(initialLayout?.zones || []);
    const [selectedZone, setSelectedZone] = useState(null);
    const [activeTab, setActiveTab] = useState('design');

    const addZone = (type = 'media') => {
        const newZone = {
            id: Date.now().toString(),
            type,
            position: { x: 10, y: 10, width: 30, height: 30 },
            content_filter: {},
            styling: { backgroundColor: '#000000', borderRadius: 8 }
        };
        setZones([...zones, newZone]);
        setSelectedZone(newZone.id);
    };

    const removeZone = (zoneId) => {
        setZones(zones.filter(z => z.id !== zoneId));
        if (selectedZone === zoneId) setSelectedZone(null);
    };

    const updateZone = (zoneId, updates) => {
        setZones(zones.map(z => z.id === zoneId ? { ...z, ...updates } : z));
    };

    const updateZonePosition = (zoneId, field, value) => {
        setZones(zones.map(z => 
            z.id === zoneId 
                ? { ...z, position: { ...z.position, [field]: value } } 
                : z
        ));
    };

    const loadPreset = (preset) => {
        setZones(preset.zones.map(z => ({
            ...z,
            content_filter: {},
            styling: { backgroundColor: '#000000', borderRadius: 8 }
        })));
        toast.success(`Loaded preset: ${preset.name}`);
    };

    const handleSave = () => {
        if (!layoutName.trim()) {
            toast.error('Please enter a layout name');
            return;
        }

        if (zones.length === 0) {
            toast.error('Please add at least one zone');
            return;
        }

        onSave({
            template_name: layoutName,
            zones
        });

        toast.success('Layout saved successfully!');
        onClose();
    };

    const selectedZoneData = zones.find(z => z.id === selectedZone);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle>Layout Designer</DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                        <TabsTrigger value="design">Design</TabsTrigger>
                        <TabsTrigger value="presets">Presets</TabsTrigger>
                    </TabsList>

                    <TabsContent value="design">
                        <div className="grid grid-cols-3 gap-4">
                            {/* Canvas */}
                            <div className="col-span-2 space-y-4">
                                <div>
                                    <Label>Layout Name</Label>
                                    <Input
                                        value={layoutName}
                                        onChange={(e) => setLayoutName(e.target.value)}
                                        placeholder="e.g., Main Entrance Layout"
                                        className="mt-1"
                                    />
                                </div>

                                <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                                    {zones.map(zone => {
                                        const Icon = ZONE_TYPES.find(t => t.value === zone.type)?.icon;
                                        return (
                                            <div
                                                key={zone.id}
                                                onClick={() => setSelectedZone(zone.id)}
                                                className={`absolute border-2 cursor-pointer transition-all hover:border-blue-400 ${
                                                    selectedZone === zone.id ? 'border-blue-500 bg-blue-500/20' : 'border-white/30 bg-white/5'
                                                }`}
                                                style={{
                                                    left: `${zone.position.x}%`,
                                                    top: `${zone.position.y}%`,
                                                    width: `${zone.position.width}%`,
                                                    height: `${zone.position.height}%`,
                                                    borderRadius: `${zone.styling?.borderRadius || 0}px`
                                                }}
                                            >
                                                <div className="absolute inset-0 flex items-center justify-center text-white">
                                                    {Icon && <Icon className="h-8 w-8 opacity-50" />}
                                                </div>
                                                <div className="absolute top-1 left-1 bg-black/70 px-2 py-1 rounded text-xs text-white">
                                                    {zone.type}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    
                                    {zones.length === 0 && (
                                        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                            <p>Add zones to start designing your layout</p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2 flex-wrap">
                                    {ZONE_TYPES.map(type => {
                                        const Icon = type.icon;
                                        return (
                                            <Button
                                                key={type.value}
                                                size="sm"
                                                variant="outline"
                                                onClick={() => addZone(type.value)}
                                            >
                                                <Icon className="h-4 w-4 mr-1" />
                                                {type.label}
                                            </Button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Properties Panel */}
                            <div className="space-y-4">
                                <h3 className="font-semibold">Zone Properties</h3>
                                
                                {selectedZoneData ? (
                                    <Card className="p-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Zone: {selectedZoneData.type}</span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => removeZone(selectedZoneData.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>

                                        <div>
                                            <Label className="text-xs">Type</Label>
                                            <Select
                                                value={selectedZoneData.type}
                                                onValueChange={(value) => updateZone(selectedZoneData.id, { type: value })}
                                            >
                                                <SelectTrigger className="h-8 mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ZONE_TYPES.map(type => (
                                                        <SelectItem key={type.value} value={type.value}>
                                                            {type.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            <Label className="text-xs">X Position (%)</Label>
                                            <Slider
                                                value={[selectedZoneData.position.x]}
                                                onValueChange={([value]) => updateZonePosition(selectedZoneData.id, 'x', value)}
                                                max={100}
                                                step={1}
                                                className="mt-2"
                                            />
                                            <span className="text-xs text-gray-500">{selectedZoneData.position.x}%</span>
                                        </div>

                                        <div>
                                            <Label className="text-xs">Y Position (%)</Label>
                                            <Slider
                                                value={[selectedZoneData.position.y]}
                                                onValueChange={([value]) => updateZonePosition(selectedZoneData.id, 'y', value)}
                                                max={100}
                                                step={1}
                                                className="mt-2"
                                            />
                                            <span className="text-xs text-gray-500">{selectedZoneData.position.y}%</span>
                                        </div>

                                        <div>
                                            <Label className="text-xs">Width (%)</Label>
                                            <Slider
                                                value={[selectedZoneData.position.width]}
                                                onValueChange={([value]) => updateZonePosition(selectedZoneData.id, 'width', value)}
                                                max={100}
                                                step={1}
                                                className="mt-2"
                                            />
                                            <span className="text-xs text-gray-500">{selectedZoneData.position.width}%</span>
                                        </div>

                                        <div>
                                            <Label className="text-xs">Height (%)</Label>
                                            <Slider
                                                value={[selectedZoneData.position.height]}
                                                onValueChange={([value]) => updateZonePosition(selectedZoneData.id, 'height', value)}
                                                max={100}
                                                step={1}
                                                className="mt-2"
                                            />
                                            <span className="text-xs text-gray-500">{selectedZoneData.position.height}%</span>
                                        </div>

                                        <div>
                                            <Label className="text-xs">Border Radius (px)</Label>
                                            <Input
                                                type="number"
                                                value={selectedZoneData.styling?.borderRadius || 0}
                                                onChange={(e) => updateZone(selectedZoneData.id, {
                                                    styling: { ...selectedZoneData.styling, borderRadius: parseInt(e.target.value) || 0 }
                                                })}
                                                className="h-8 mt-1"
                                            />
                                        </div>
                                    </Card>
                                ) : (
                                    <Card className="p-4">
                                        <p className="text-sm text-gray-500 text-center">Select a zone to edit properties</p>
                                    </Card>
                                )}

                                <div className="text-xs text-gray-500 space-y-1">
                                    <p><strong>Zones:</strong> {zones.length}</p>
                                    <p><strong>Tip:</strong> Click a zone to select and edit it</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-4">
                            <Button onClick={handleSave} className="flex-1">
                                Save Layout
                            </Button>
                            <Button onClick={onClose} variant="outline">
                                Cancel
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="presets">
                        <div className="grid grid-cols-3 gap-4">
                            {PRESET_LAYOUTS.map((preset) => (
                                <Card
                                    key={preset.name}
                                    className="p-4 cursor-pointer hover:shadow-lg transition-shadow"
                                    onClick={() => loadPreset(preset)}
                                >
                                    <div className="relative bg-gray-900 rounded mb-2" style={{ aspectRatio: '16/9' }}>
                                        {preset.zones.map((zone, idx) => (
                                            <div
                                                key={idx}
                                                className="absolute border border-white/30 bg-blue-500/20"
                                                style={{
                                                    left: `${zone.position.x}%`,
                                                    top: `${zone.position.y}%`,
                                                    width: `${zone.position.width}%`,
                                                    height: `${zone.position.height}%`
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <h4 className="font-semibold text-sm">{preset.name}</h4>
                                    <p className="text-xs text-gray-500">{preset.zones.length} zones</p>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}