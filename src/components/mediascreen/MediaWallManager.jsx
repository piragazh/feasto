import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Grid3x3, Monitor, Plus, Settings, Eye, Trash2, Maximize2, Film } from 'lucide-react';
import MediaWallConfigurator from './MediaWallConfigurator';
import MediaWallContentManager from './MediaWallContentManager';
import { toast } from 'sonner';

export default function MediaWallManager({ restaurantId }) {
    const [selectedWall, setSelectedWall] = useState(null);
    const [showConfigurator, setShowConfigurator] = useState(false);
    const [configuringScreen, setConfiguringScreen] = useState(null);
    const [showContentManager, setShowContentManager] = useState(false);
    const [managingWallName, setManagingWallName] = useState(null);
    const queryClient = useQueryClient();

    const { data: screens = [] } = useQuery({
        queryKey: ['screens', restaurantId],
        queryFn: async () => {
            return await base44.entities.Screen.filter({ restaurant_id: restaurantId });
        },
        enabled: !!restaurantId
    });

    const updateScreenMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Screen.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['screens', restaurantId]);
            toast.success('Screen updated');
        }
    });

    // Group screens by media wall
    const mediaWalls = screens.reduce((acc, screen) => {
        if (!screen.media_wall_config?.enabled) return acc;
        
        const wallName = screen.media_wall_config.wall_name || 'Unnamed Wall';
        if (!acc[wallName]) {
            acc[wallName] = {
                name: wallName,
                screens: [],
                grid_size: screen.media_wall_config.grid_size || { rows: 2, cols: 2 }
            };
        }
        acc[wallName].screens.push(screen);
        return acc;
    }, {});

    const handleConfigureScreen = (screen) => {
        setConfiguringScreen(screen);
        setShowConfigurator(true);
    };

    const handleSaveConfig = async (config) => {
        if (!configuringScreen) return;
        
        await updateScreenMutation.mutateAsync({
            id: configuringScreen.id,
            data: { media_wall_config: config }
        });
        setShowConfigurator(false);
        setConfiguringScreen(null);
    };

    const handleDisableWall = async (screen) => {
        await updateScreenMutation.mutateAsync({
            id: screen.id,
            data: { 
                media_wall_config: { ...screen.media_wall_config, enabled: false }
            }
        });
    };

    const renderWallGrid = (wall) => {
        const { rows, cols } = wall.grid_size;
        const cells = [];
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const screen = wall.screens.find(s => 
                    s.media_wall_config?.position?.row === row && 
                    s.media_wall_config?.position?.col === col
                );
                
                cells.push(
                    <div
                        key={`${row}-${col}`}
                        className={`border-2 rounded-lg p-3 flex flex-col items-center justify-center min-h-[100px] ${
                            screen 
                                ? 'border-green-500 bg-green-50' 
                                : 'border-gray-300 bg-gray-100 border-dashed'
                        }`}
                    >
                        {screen ? (
                            <>
                                <Monitor className="h-6 w-6 text-green-600 mb-1" />
                                <span className="text-xs font-semibold text-center">
                                    {screen.screen_name}
                                </span>
                                <Badge variant="outline" className="mt-1 text-[10px]">
                                    {row},{col}
                                </Badge>
                                <div className="flex gap-1 mt-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2"
                                        onClick={() => handleConfigureScreen(screen)}
                                    >
                                        <Settings className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2 text-red-500"
                                        onClick={() => handleDisableWall(screen)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Monitor className="h-6 w-6 text-gray-400 mb-1" />
                                <span className="text-xs text-gray-500">
                                    Empty
                                </span>
                                <Badge variant="outline" className="mt-1 text-[10px]">
                                    {row},{col}
                                </Badge>
                            </>
                        )}
                    </div>
                );
            }
        }
        
        return cells;
    };

    const standaloneScreens = screens.filter(s => !s.media_wall_config?.enabled);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Grid3x3 className="h-5 w-5" />
                    Media Walls
                </h3>

                {Object.keys(mediaWalls).length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="py-12 text-center">
                            <Grid3x3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                            <p className="text-gray-600 mb-2">No media walls configured</p>
                            <p className="text-sm text-gray-500">
                                Configure screens below to create a media wall
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-6">
                        {Object.values(mediaWalls).map((wall, idx) => (
                            <Card key={idx}>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="flex items-center gap-2">
                                            <Maximize2 className="h-5 w-5" />
                                            {wall.name}
                                        </CardTitle>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline">
                                                {wall.grid_size.rows}×{wall.grid_size.cols} Grid
                                                ({wall.grid_size.rows * wall.grid_size.cols} screens)
                                            </Badge>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setManagingWallName(wall.name);
                                                    setShowContentManager(true);
                                                }}
                                            >
                                                <Film className="h-3 w-3 mr-1" />
                                                Manage Content
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div 
                                        className="grid gap-3"
                                        style={{
                                            gridTemplateColumns: `repeat(${wall.grid_size.cols}, 1fr)`
                                        }}
                                    >
                                        {renderWallGrid(wall)}
                                    </div>

                                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                        <p className="text-sm text-blue-900">
                                            <strong>Status:</strong> {wall.screens.length}/{wall.grid_size.rows * wall.grid_size.cols} screens configured
                                        </p>
                                        {wall.screens.length < (wall.grid_size.rows * wall.grid_size.cols) && (
                                            <p className="text-xs text-blue-700 mt-1">
                                                Configure more screens to complete this media wall
                                            </p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Standalone Screens
                </h3>

                {standaloneScreens.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="py-8 text-center">
                            <p className="text-sm text-gray-500">
                                All screens are part of media walls
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {standaloneScreens.map(screen => (
                            <Card key={screen.id}>
                                <CardContent className="pt-6">
                                    <div className="text-center">
                                        <Monitor className="h-8 w-8 mx-auto text-gray-600 mb-2" />
                                        <p className="font-semibold">{screen.screen_name}</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="mt-3 w-full"
                                            onClick={() => handleConfigureScreen(screen)}
                                        >
                                            <Grid3x3 className="h-3 w-3 mr-1" />
                                            Add to Wall
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <Dialog open={showConfigurator} onOpenChange={setShowConfigurator}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Grid3x3 className="h-5 w-5" />
                            Configure Media Wall
                        </DialogTitle>
                    </DialogHeader>
                    <MediaWallConfigurator
                        screen={configuringScreen}
                        onSave={handleSaveConfig}
                        onCancel={() => {
                            setShowConfigurator(false);
                            setConfiguringScreen(null);
                        }}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={showContentManager} onOpenChange={setShowContentManager}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Maximize2 className="h-5 w-5" />
                            {managingWallName} - Full Screen Content
                        </DialogTitle>
                    </DialogHeader>
                    <MediaWallContentManager 
                        restaurantId={restaurantId}
                        wallName={managingWallName}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}