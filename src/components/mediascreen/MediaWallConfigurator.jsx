import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Grid3x3, Monitor, Maximize2, Check } from 'lucide-react';

export default function MediaWallConfigurator({ screen, onSave, onCancel }) {
    const [config, setConfig] = useState({
        enabled: screen?.media_wall_config?.enabled || false,
        position: screen?.media_wall_config?.position || { row: 0, col: 0 },
        grid_size: screen?.media_wall_config?.grid_size || { rows: 2, cols: 2 },
        bezel_compensation: screen?.media_wall_config?.bezel_compensation || 10,
        wall_name: screen?.media_wall_config?.wall_name || 'Main Wall',
        rotation: screen?.media_wall_config?.rotation || 0
    });

    const handleSave = () => {
        onSave(config);
    };

    const renderGridPreview = () => {
        const cells = [];
        for (let row = 0; row < config.grid_size.rows; row++) {
            for (let col = 0; col < config.grid_size.cols; col++) {
                const isSelected = config.position.row === row && config.position.col === col;
                const cellNumber = row * config.grid_size.cols + col + 1;
                cells.push(
                    <div
                        key={`${row}-${col}`}
                        className={`border-2 rounded flex flex-col items-center justify-center transition-all p-2 relative ${
                            isSelected 
                                ? 'border-blue-500 bg-blue-100' 
                                : 'border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer'
                        }`}
                        onClick={() => setConfig(prev => ({
                            ...prev,
                            position: { row, col }
                        }))}
                    >
                        {isSelected && (
                            <Check className="h-5 w-5 text-blue-600 absolute top-1 right-1" />
                        )}
                        <Monitor className={`h-8 w-8 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className="text-xs font-semibold mt-1 text-gray-700">
                            Screen {cellNumber}
                        </span>
                        <span className="text-[10px] text-gray-500">
                            ({row},{col})
                        </span>
                    </div>
                );
            }
        }
        return cells;
    };

    return (
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
            <div className="flex items-center justify-between">
                <Label htmlFor="wall-enabled">Enable Media Wall Mode</Label>
                <Switch
                    id="wall-enabled"
                    checked={config.enabled}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
                />
            </div>

            {config.enabled && (
                <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-900">
                            <strong>Media Wall Mode:</strong> Display content across multiple screens as one large display. 
                            Configure the grid size and select this screen's position in the wall.
                        </p>
                    </div>

                    <div>
                        <Label>Media Wall Name</Label>
                        <Input
                            value={config.wall_name}
                            onChange={(e) => setConfig(prev => ({
                                ...prev,
                                wall_name: e.target.value
                            }))}
                            placeholder="e.g., Main Wall, Drive-Thru Wall"
                            className="mt-1"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            All screens in the same wall should have the same name
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Grid Rows</Label>
                            <Input
                                type="number"
                                value={config.grid_size.rows}
                                onChange={(e) => setConfig(prev => ({
                                    ...prev,
                                    grid_size: { ...prev.grid_size, rows: parseInt(e.target.value) || 1 }
                                }))}
                                min="1"
                                max="4"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Grid Columns</Label>
                            <Input
                                type="number"
                                value={config.grid_size.cols}
                                onChange={(e) => setConfig(prev => ({
                                    ...prev,
                                    grid_size: { ...prev.grid_size, cols: parseInt(e.target.value) || 1 }
                                }))}
                                min="1"
                                max="4"
                                className="mt-1"
                            />
                        </div>
                    </div>

                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Maximize2 className="h-4 w-4 text-indigo-600" />
                            <span className="text-sm font-semibold text-indigo-900">Total Screens Needed</span>
                        </div>
                        <p className="text-2xl font-bold text-indigo-900">
                            {config.grid_size.rows * config.grid_size.cols} screens
                        </p>
                        <p className="text-xs text-indigo-700 mt-1">
                            Configure each physical screen with its position in the grid
                        </p>
                    </div>

                    <div>
                        <Label className="mb-3 block">Grid Position Preview</Label>
                        <Card className="p-4">
                            <div 
                                className="grid gap-2"
                                style={{
                                    gridTemplateColumns: `repeat(${config.grid_size.cols}, 1fr)`,
                                    gridTemplateRows: `repeat(${config.grid_size.rows}, 80px)`
                                }}
                            >
                                {renderGridPreview()}
                            </div>
                        </Card>
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-sm text-green-900">
                                <strong>This screen:</strong> Position {config.position.row + 1},{config.position.col + 1} 
                                (Screen #{config.position.row * config.grid_size.cols + config.position.col + 1})
                            </p>
                        </div>
                        </div>

                        <div>
                        <Label>Screen Rotation (degrees)</Label>
                        <div className="flex gap-2 mt-2">
                            {[0, 90, 180, 270].map(deg => (
                                <Button
                                    key={deg}
                                    type="button"
                                    variant={config.rotation === deg ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setConfig(prev => ({ ...prev, rotation: deg }))}
                                    className="flex-1"
                                >
                                    {deg}°
                                </Button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Rotate screen if mounted in portrait or upside down
                        </p>
                        </div>

                    <div>
                        <Label>Bezel Compensation (pixels)</Label>
                        <Input
                            type="number"
                            value={config.bezel_compensation}
                            onChange={(e) => setConfig(prev => ({
                                ...prev,
                                bezel_compensation: parseInt(e.target.value) || 0
                            }))}
                            min="0"
                            max="100"
                            className="mt-1"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Adjust to compensate for physical borders between screens
                        </p>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="text-sm text-amber-900">
                            <strong>Note:</strong> All screens in the media wall should have the same grid configuration. 
                            Only set different positions for each physical screen.
                        </p>
                    </div>
                </>
            )}

            <div className="flex gap-2 pt-4 border-t">
                <Button onClick={handleSave} className="flex-1">
                    Save Configuration
                </Button>
                <Button onClick={onCancel} variant="outline">
                    Cancel
                </Button>
            </div>
        </div>
    );
}