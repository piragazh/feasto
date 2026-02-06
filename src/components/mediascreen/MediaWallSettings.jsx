import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Monitor, Grid3x3, Settings, Clock, Cloud, Package, Sparkles, Palette, Info, Timer, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from 'date-fns';

export default function MediaWallSettings({ restaurantId }) {
    const queryClient = useQueryClient();
    const [selectedWall, setSelectedWall] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    const { data: screens = [] } = useQuery({
        queryKey: ['screens', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId
    });

    const { data: weather } = useQuery({
        queryKey: ['widget-weather', restaurantId],
        queryFn: async () => {
            const restaurant = await base44.entities.Restaurant.filter({ id: restaurantId });
            if (restaurant?.[0]?.latitude && restaurant?.[0]?.longitude) {
                const result = await base44.functions.invoke('getWeather', {
                    lat: restaurant[0].latitude,
                    lng: restaurant[0].longitude
                });
                return result.data;
            }
            return null;
        },
        enabled: !!restaurantId,
        staleTime: 600000
    });

    const { data: activeOrders = [] } = useQuery({
        queryKey: ['widget-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({
            restaurant_id: restaurantId,
            order_type: 'collection',
            status: { $in: ['preparing', 'ready_for_collection'] }
        }),
        enabled: !!restaurantId,
        refetchInterval: 5000
    });

    const updateScreenMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Screen.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['screens']);
            toast.success('Settings updated');
        }
    });

    // Group screens by media wall
    const walls = screens.reduce((acc, screen) => {
        if (screen.media_wall_config?.enabled) {
            const wallName = screen.media_wall_config.wall_name;
            if (!acc[wallName]) {
                acc[wallName] = {
                    name: wallName,
                    screens: [],
                    gridSize: screen.media_wall_config.grid_size
                };
            }
            acc[wallName].screens.push(screen);
        }
        return acc;
    }, {});

    const wallNames = Object.keys(walls);
    const currentWall = selectedWall ? walls[selectedWall] : null;

    return (
        <div className="space-y-6">
            <Card className="border-none shadow-lg bg-gradient-to-br from-slate-50 to-slate-100">
                <CardHeader className="border-b bg-white/50 backdrop-blur">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-2xl flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                                    <Settings className="h-6 w-6 text-white" />
                                </div>
                                Media Wall Settings
                            </CardTitle>
                            <p className="text-sm text-gray-600 mt-2">
                                Configure display preferences, content widgets, and advanced features
                            </p>
                        </div>
                        {wallNames.length > 0 && (
                            <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-sm px-4 py-2">
                                {wallNames.length} Wall{wallNames.length > 1 ? 's' : ''}
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-6">
                    {wallNames.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed">
                            <Grid3x3 className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                            <p className="text-gray-600 text-lg mb-2">No Media Walls Configured</p>
                            <p className="text-sm text-gray-500">
                                Create a media wall first in the Screen Manager
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <Label className="text-base font-semibold mb-3 block">Select Media Wall</Label>
                                <Select value={selectedWall || ''} onValueChange={setSelectedWall}>
                                    <SelectTrigger className="w-full h-12 text-base">
                                        <SelectValue placeholder="Choose a media wall to configure..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {wallNames.map(name => (
                                            <SelectItem key={name} value={name} className="text-base">
                                                <div className="flex items-center gap-2">
                                                    <Grid3x3 className="h-4 w-4" />
                                                    {name}
                                                    <span className="text-xs text-gray-500">
                                                        ({walls[name].screens.length} screens)
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {currentWall && (
                                <Tabs defaultValue="content" className="mt-6">
                                    <TabsList className="grid w-full grid-cols-3 h-12">
                                        <TabsTrigger value="content" className="text-base">
                                            <Sparkles className="h-4 w-4 mr-2" />
                                            Content Widgets
                                        </TabsTrigger>
                                        <TabsTrigger value="display" className="text-base">
                                            <Monitor className="h-4 w-4 mr-2" />
                                            Display Settings
                                        </TabsTrigger>
                                        <TabsTrigger value="info" className="text-base">
                                            <Info className="h-4 w-4 mr-2" />
                                            Wall Info
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="content" className="space-y-4 mt-6">
                                        <Card className="bg-white shadow-sm">
                                            <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 border-b">
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <Clock className="h-5 w-5 text-blue-600" />
                                                    Time & Date Widget
                                                </CardTitle>
                                                <p className="text-sm text-gray-600">Display current time and date</p>
                                            </CardHeader>
                                            <CardContent className="p-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <p className="text-sm text-gray-700 mb-2">
                                                            Shows live clock and current date in an elegant display
                                                        </p>
                                                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                                            Real-time updates
                                                        </Badge>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs text-gray-500 mb-2">Preview</p>
                                                        <div className="bg-slate-900 text-white px-4 py-2 rounded-lg">
                                                            <div className="text-2xl font-bold">{format(currentTime, 'HH:mm')}</div>
                                                            <div className="text-xs opacity-70">{format(currentTime, 'MMM d')}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card className="bg-white shadow-sm">
                                            <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b">
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <Cloud className="h-5 w-5 text-blue-600" />
                                                    Weather Widget
                                                </CardTitle>
                                                <p className="text-sm text-gray-600">Display live weather conditions</p>
                                            </CardHeader>
                                            <CardContent className="p-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <p className="text-sm text-gray-700 mb-2">
                                                            Shows current temperature and weather conditions
                                                        </p>
                                                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                                            Updates every 10 minutes
                                                        </Badge>
                                                    </div>
                                                    {weather && (
                                                        <div className="text-right">
                                                            <p className="text-xs text-gray-500 mb-2">Preview</p>
                                                            <div className="bg-gradient-to-br from-blue-600 to-cyan-400 text-white px-4 py-2 rounded-lg">
                                                                <div className="text-2xl font-bold">{Math.round(weather.temp)}°C</div>
                                                                <div className="text-xs capitalize">{weather.description}</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card className="bg-white shadow-sm">
                                            <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b">
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <Package className="h-5 w-5 text-emerald-600" />
                                                    Collection Orders Display
                                                </CardTitle>
                                                <p className="text-sm text-gray-600">Show preparing and ready orders</p>
                                            </CardHeader>
                                            <CardContent className="p-6">
                                                <div className="space-y-4">
                                                    <p className="text-sm text-gray-700">
                                                        Display order numbers for collection orders in real-time
                                                    </p>
                                                    <div className="flex gap-4">
                                                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                                            <Timer className="h-3 w-3 mr-1" />
                                                            Preparing: {activeOrders.filter(o => o.status === 'preparing').length}
                                                        </Badge>
                                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                                            Ready: {activeOrders.filter(o => o.status === 'ready_for_collection').length}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-gray-500">
                                                        Updates every 5 seconds • Displays up to 15 orders
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6">
                                            <h4 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                                                <Sparkles className="h-5 w-5" />
                                                How to Use Custom Widgets
                                            </h4>
                                            <ol className="space-y-2 text-sm text-indigo-800">
                                                <li className="flex gap-2">
                                                    <span className="font-bold">1.</span>
                                                    <span>Go to the <strong>Media Walls</strong> tab</span>
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="font-bold">2.</span>
                                                    <span>Add content and select <strong>"Custom Widget"</strong> as media type</span>
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="font-bold">3.</span>
                                                    <span>Choose widget type: Time, Weather, or Orders</span>
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="font-bold">4.</span>
                                                    <span>Set display duration and priority</span>
                                                </li>
                                            </ol>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="display" className="space-y-4 mt-6">
                                        {currentWall.screens.map(screen => (
                                            <Card key={screen.id} className="bg-white shadow-sm">
                                                <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 border-b">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <CardTitle className="text-base flex items-center gap-2">
                                                                <Monitor className="h-4 w-4 text-slate-600" />
                                                                {screen.screen_name}
                                                            </CardTitle>
                                                            <p className="text-sm text-gray-600 mt-1">
                                                                Position: Row {screen.media_wall_config.position.row}, Col {screen.media_wall_config.position.col}
                                                            </p>
                                                        </div>
                                                        <Badge variant="outline" className={`${
                                                            screen.health_status === 'online' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50'
                                                        }`}>
                                                            {screen.health_status || 'offline'}
                                                        </Badge>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-6 space-y-4">
                                                    <div className="grid grid-cols-2 gap-6">
                                                        <div className="space-y-2">
                                                            <Label className="text-sm font-medium">Screen Orientation</Label>
                                                            <Select
                                                                value={screen.orientation || 'landscape'}
                                                                onValueChange={(value) => 
                                                                    updateScreenMutation.mutate({
                                                                        id: screen.id,
                                                                        data: { orientation: value }
                                                                    })
                                                                }
                                                            >
                                                                <SelectTrigger className="h-10">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="landscape">Landscape</SelectItem>
                                                                    <SelectItem value="portrait">Portrait</SelectItem>
                                                                    <SelectItem value="auto">Auto</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        <div className="space-y-2">
                                                            <Label className="text-sm font-medium">Bezel Compensation (px)</Label>
                                                            <Select
                                                                value={String(screen.media_wall_config?.bezel_compensation || 0)}
                                                                onValueChange={(value) => 
                                                                    updateScreenMutation.mutate({
                                                                        id: screen.id,
                                                                        data: { 
                                                                            media_wall_config: {
                                                                                ...screen.media_wall_config,
                                                                                bezel_compensation: parseInt(value)
                                                                            }
                                                                        }
                                                                    })
                                                                }
                                                            >
                                                                <SelectTrigger className="h-10">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="0">None (0px)</SelectItem>
                                                                    <SelectItem value="5">Small (5px)</SelectItem>
                                                                    <SelectItem value="10">Medium (10px)</SelectItem>
                                                                    <SelectItem value="15">Large (15px)</SelectItem>
                                                                    <SelectItem value="20">X-Large (20px)</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label className="text-sm font-medium">Screen Rotation</Label>
                                                        <Select
                                                            value={String(screen.media_wall_config?.rotation || 0)}
                                                            onValueChange={(value) => 
                                                                updateScreenMutation.mutate({
                                                                    id: screen.id,
                                                                    data: { 
                                                                        media_wall_config: {
                                                                            ...screen.media_wall_config,
                                                                            rotation: parseInt(value)
                                                                        }
                                                                    }
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger className="h-10">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="0">0° (Normal)</SelectItem>
                                                                <SelectItem value="90">90° (Clockwise)</SelectItem>
                                                                <SelectItem value="180">180° (Upside Down)</SelectItem>
                                                                <SelectItem value="270">270° (Counter-clockwise)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </TabsContent>

                                    <TabsContent value="info" className="space-y-4 mt-6">
                                        <Card className="bg-white shadow-sm">
                                            <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b">
                                                <CardTitle className="text-lg">Wall Configuration</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-6">
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div className="space-y-3">
                                                        <div>
                                                            <Label className="text-xs text-gray-500">Wall Name</Label>
                                                            <p className="text-lg font-semibold">{currentWall.name}</p>
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs text-gray-500">Grid Size</Label>
                                                            <p className="text-lg font-semibold">
                                                                {currentWall.gridSize.rows} × {currentWall.gridSize.cols}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <div>
                                                            <Label className="text-xs text-gray-500">Total Screens</Label>
                                                            <p className="text-lg font-semibold">{currentWall.screens.length}</p>
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs text-gray-500">Online Screens</Label>
                                                            <p className="text-lg font-semibold text-green-600">
                                                                {currentWall.screens.filter(s => s.health_status === 'online').length}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-6 pt-6 border-t">
                                                    <Label className="text-sm font-medium mb-3 block">Screen Layout</Label>
                                                    <div 
                                                        className="grid gap-2 bg-slate-100 p-4 rounded-lg"
                                                        style={{
                                                            gridTemplateColumns: `repeat(${currentWall.gridSize.cols}, 1fr)`
                                                        }}
                                                    >
                                                        {Array.from({ length: currentWall.gridSize.rows }, (_, row) =>
                                                            Array.from({ length: currentWall.gridSize.cols }, (_, col) => {
                                                                const screen = currentWall.screens.find(s =>
                                                                    s.media_wall_config.position.row === row &&
                                                                    s.media_wall_config.position.col === col
                                                                );
                                                                return (
                                                                    <div
                                                                        key={`${row}-${col}`}
                                                                        className={`aspect-video rounded border-2 flex items-center justify-center ${
                                                                            screen
                                                                                ? screen.health_status === 'online'
                                                                                    ? 'bg-green-100 border-green-500'
                                                                                    : 'bg-gray-200 border-gray-400'
                                                                                : 'bg-white border-dashed border-gray-300'
                                                                        }`}
                                                                    >
                                                                        {screen ? (
                                                                            <div className="text-center">
                                                                                <Monitor className="h-4 w-4 mx-auto mb-1" />
                                                                                <p className="text-[10px] font-medium">{screen.screen_name}</p>
                                                                            </div>
                                                                        ) : (
                                                                            <p className="text-[10px] text-gray-400">Empty</p>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </TabsContent>
                                </Tabs>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}