import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Grid3x3, Monitor } from 'lucide-react';

export default function MediaWallConfigurator({ screen, onSave, onCancel }) {
    const [config, setConfig] = useState({
        enabled: screen?.media_wall_config?.enabled || false,
        position: screen?.media_wall_config?.position || { row: 0, col: 0 },
        grid_size: screen?.media_wall_config?.grid_size || { rows: 2, cols: 2 },
        bezel_compensation: screen?.media_wall_config?.bezel_compensation || 10
    });

    const handleSave = () => {
        onSave(config);
    };

    const renderGridPreview = () => {
        const cells = [];
        for (let row = 0; row < config.grid_size.rows; row++) {
            for (let col = 0; col < config.grid_size.cols; col++) {
                const isSelected = config.position.row === row && config.position.col === col;
                cells.push(
                    <div
                        key={`${row}-${col}`}
                        className={`border-2 rounded flex items-center justify-center transition-all ${
                            isSelected 
                                ? 'border-blue-500 bg-blue-100' 
                                : 'border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer'
                        }`}
                        onClick={() => setConfig(prev => ({
                            ...prev,
                            position: { row, col }
                        }))}
                    >
                        {isSelected && <Monitor className="h-6 w-6 text-blue-600" />}
                        <span className="text-xs text-gray-500 ml-1">
                            {row},{col}
                        </span>
                    </div>
                );
            }
        }
        return cells;
    };

    return (
        <div className="space-y-6">
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
                        <p className="text-xs text-gray-500 mt-2">
                            Click a cell to select this screen's position. 
                            Currently selected: Row {config.position.row}, Column {config.position.col}
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