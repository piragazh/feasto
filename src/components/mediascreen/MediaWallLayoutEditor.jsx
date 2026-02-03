import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Grid3x3, Copy } from 'lucide-react';
import { toast } from 'sonner';

const PRESET_LAYOUTS = [
    { name: 'Single Screen', grid: { rows: 1, cols: 1 }, description: 'Full screen content' },
    { name: '2x2 Grid', grid: { rows: 2, cols: 2 }, description: '4 equal zones' },
    { name: '3x3 Grid', grid: { rows: 3, cols: 3 }, description: '9 equal zones' },
    { name: '2x1 Horizontal', grid: { rows: 1, cols: 2 }, description: 'Two horizontal zones' },
    { name: '1x2 Vertical', grid: { rows: 2, cols: 1 }, description: 'Two vertical zones' },
    { name: 'L-Shape (Big Left)', grid: { rows: 2, cols: 2, customZones: true }, description: 'Large left zone + 2 small right' },
    { name: 'Focus Center', grid: { rows: 3, cols: 3, customZones: true }, description: 'Large center + 8 border zones' }
];

export default function MediaWallLayoutEditor({ open, onClose, onSave }) {
    const [layoutName, setLayoutName] = useState('');
    const [gridRows, setGridRows] = useState(2);
    const [gridCols, setGridCols] = useState(2);
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState(null);
    const [zoneLabel, setZoneLabel] = useState('');
    const [saveAsPreset, setSaveAsPreset] = useState(false);

    const handleGridChange = (rows, cols) => {
        setGridRows(rows);
        setGridCols(cols);
        generateDefaultZones(rows, cols);
    };

    const generateDefaultZones = (rows, cols) => {
        const newZones = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                newZones.push({
                    id: `zone-${r}-${c}`,
                    row: r,
                    col: c,
                    rowSpan: 1,
                    colSpan: 1,
                    label: `Zone ${r * cols + c + 1}`,
                    color: generateColor(r, c, rows, cols)
                });
            }
        }
        setZones(newZones);
    };

    const generateColor = (r, c, rows, cols) => {
        const colors = [
            'bg-blue-100 border-blue-300',
            'bg-green-100 border-green-300',
            'bg-purple-100 border-purple-300',
            'bg-pink-100 border-pink-300',
            'bg-yellow-100 border-yellow-300',
            'bg-indigo-100 border-indigo-300'
        ];
        const index = (r * cols + c) % colors.length;
        return colors[index];
    };

    const updateZone = (zoneId, updates) => {
        setZones(zones.map(z => z.id === zoneId ? { ...z, ...updates } : z));
    };

    const deleteZone = (zoneId) => {
        setZones(zones.filter(z => z.id !== zoneId));
        if (selectedZone?.id === zoneId) setSelectedZone(null);
    };

    const addZone = () => {
        const newZone = {
            id: `zone-${Date.now()}`,
            row: 0,
            col: 0,
            rowSpan: 1,
            colSpan: 1,
            label: `New Zone`,
            color: 'bg-gray-100 border-gray-300'
        };
        setZones([...zones, newZone]);
    };

    const handleSaveLayout = () => {
        if (!layoutName.trim()) {
            toast.error('Please enter a layout name');
            return;
        }
        if (zones.length === 0) {
            toast.error('Layout must have at least one zone');
            return;
        }

        const layout = {
            id: `layout-${Date.now()}`,
            name: layoutName,
            grid: { rows: gridRows, cols: gridCols },
            zones: zones,
            createdAt: new Date().toISOString()
        };

        onSave(layout);
        resetForm();
    };

    const resetForm = () => {
        setLayoutName('');
        setGridRows(2);
        setGridCols(2);
        setZones([]);
        setSelectedZone(null);
        setZoneLabel('');
        setSaveAsPreset(false);
        onClose();
    };

    const applyPreset = (preset) => {
        setGridRows(preset.grid.rows);
        setGridCols(preset.grid.cols);
        generateDefaultZones(preset.grid.rows, preset.grid.cols);
        setLayoutName(preset.name);
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Grid3x3 className="h-5 w-5" />
                        Media Wall Layout Editor
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-6">
                    {/* Left: Preset Layouts */}
                    <div className="col-span-1 space-y-4">
                        <div>
                            <Label className="font-semibold">Preset Layouts</Label>
                            <div className="space-y-2 mt-2">
                                {PRESET_LAYOUTS.map((preset) => (
                                    <Button
                                        key={preset.name}
                                        onClick={() => applyPreset(preset)}
                                        variant="outline"
                                        className="w-full justify-start text-left h-auto p-3"
                                    >
                                        <div>
                                            <div className="font-medium text-sm">{preset.name}</div>
                                            <div className="text-xs text-gray-500">{preset.description}</div>
                                        </div>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Middle: Grid Editor */}
                    <div className="col-span-1 space-y-4">
                        <div>
                            <Label>Layout Name</Label>
                            <Input
                                value={layoutName}
                                onChange={(e) => setLayoutName(e.target.value)}
                                placeholder="e.g., Main Wall Layout"
                                className="mt-1"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Grid Rows</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max="5"
                                    value={gridRows}
                                    onChange={(e) => handleGridChange(parseInt(e.target.value), gridCols)}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label>Grid Cols</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max="5"
                                    value={gridCols}
                                    onChange={(e) => handleGridChange(gridRows, parseInt(e.target.value))}
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        {/* Visual Grid Preview */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Preview</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div 
                                    className="border-2 border-gray-300 rounded-lg p-2 gap-1"
                                    style={{
                                        display: 'grid',
                                        gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                                        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                                        minHeight: '250px'
                                    }}
                                >
                                    {zones.map((zone) => (
                                        <div
                                            key={zone.id}
                                            onClick={() => setSelectedZone(zone)}
                                            className={`border-2 rounded cursor-pointer transition-all ${zone.color} ${
                                                selectedZone?.id === zone.id ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                                            }`}
                                            style={{
                                                gridRow: `${zone.row + 1} / span ${zone.rowSpan}`,
                                                gridColumn: `${zone.col + 1} / span ${zone.colSpan}`
                                            }}
                                        >
                                            <div className="flex items-center justify-center h-full text-xs font-medium text-gray-700">
                                                {zone.label}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Button onClick={addZone} variant="outline" className="w-full">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Zone
                        </Button>
                    </div>

                    {/* Right: Zone Configuration */}
                    <div className="col-span-1 space-y-4">
                        <div>
                            <Label className="font-semibold">Zones ({zones.length})</Label>
                            <div className="space-y-2 mt-2 max-h-[350px] overflow-y-auto">
                                {zones.map((zone) => (
                                    <Card
                                        key={zone.id}
                                        className={`cursor-pointer transition-all ${selectedZone?.id === zone.id ? 'border-blue-500 bg-blue-50' : ''}`}
                                        onClick={() => setSelectedZone(zone)}
                                    >
                                        <CardContent className="p-3">
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <div className={`w-3 h-3 rounded border-2 ${zone.color}`} />
                                                    <span className="text-sm font-medium truncate">{zone.label}</span>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => deleteZone(zone.id)}
                                                >
                                                    <Trash2 className="h-3 w-3 text-red-500" />
                                                </Button>
                                            </div>
                                            <div className="text-xs text-gray-500 space-y-1">
                                                <div>Position: ({zone.row}, {zone.col})</div>
                                                <div>Span: {zone.rowSpan}x{zone.colSpan}</div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        {selectedZone && (
                            <Card className="bg-blue-50 border-blue-200">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Edit Zone</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div>
                                        <Label className="text-xs">Label</Label>
                                        <Input
                                            value={selectedZone.label}
                                            onChange={(e) => updateZone(selectedZone.id, { label: e.target.value })}
                                            className="mt-1 text-sm"
                                            placeholder="Zone name"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-xs">Row Span</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                max={gridRows}
                                                value={selectedZone.rowSpan}
                                                onChange={(e) => updateZone(selectedZone.id, { rowSpan: parseInt(e.target.value) })}
                                                className="mt-1 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Col Span</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                max={gridCols}
                                                value={selectedZone.colSpan}
                                                onChange={(e) => updateZone(selectedZone.id, { colSpan: parseInt(e.target.value) })}
                                                className="mt-1 text-sm"
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                    <Button onClick={handleSaveLayout} className="flex-1">
                        <Copy className="h-4 w-4 mr-2" />
                        Save Layout
                    </Button>
                    <Button onClick={resetForm} variant="outline">
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}