import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, Cloud, Clock, ShoppingBag, Check, Globe } from 'lucide-react';
import { toast } from 'sonner';

export default function WidgetConfigurationManager({ restaurantId }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [editingConfig, setEditingConfig] = useState(null);
    const [configName, setConfigName] = useState('');
    const [configDescription, setConfigDescription] = useState('');
    const [widgetType, setWidgetType] = useState('weather');
    const [applyToWalls, setApplyToWalls] = useState([]);
    const [isDefault, setIsDefault] = useState(false);

    // Widget-specific settings
    const [weatherLocation, setWeatherLocation] = useState('');
    const [weatherUnits, setWeatherUnits] = useState('metric');
    const [showForecast, setShowForecast] = useState(false);
    
    const [clockFormat, setClockFormat] = useState('24h');
    const [showSeconds, setShowSeconds] = useState(true);
    const [showDate, setShowDate] = useState(true);
    const [timezone, setTimezone] = useState('');
    
    const [ordersDisplayMode, setOrdersDisplayMode] = useState('preparing');
    const [maxOrders, setMaxOrders] = useState(5);
    const [showCustomerName, setShowCustomerName] = useState(false);
    const [autoRefreshInterval, setAutoRefreshInterval] = useState(30);

    const { data: configurations = [] } = useQuery({
        queryKey: ['widget-configurations', restaurantId],
        queryFn: () => base44.entities.WidgetConfiguration.filter({ restaurant_id: restaurantId })
    });

    const { data: screens = [] } = useQuery({
        queryKey: ['screens', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId })
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.WidgetConfiguration.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['widget-configurations']);
            toast.success('Configuration created');
            resetForm();
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.WidgetConfiguration.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['widget-configurations']);
            toast.success('Configuration updated');
            resetForm();
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.WidgetConfiguration.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['widget-configurations']);
            toast.success('Configuration deleted');
        }
    });

    const resetForm = () => {
        setShowDialog(false);
        setEditingConfig(null);
        setConfigName('');
        setConfigDescription('');
        setWidgetType('weather');
        setApplyToWalls([]);
        setIsDefault(false);
        setWeatherLocation('');
        setWeatherUnits('metric');
        setShowForecast(false);
        setClockFormat('24h');
        setShowSeconds(true);
        setShowDate(true);
        setTimezone('');
        setOrdersDisplayMode('preparing');
        setMaxOrders(5);
        setShowCustomerName(false);
        setAutoRefreshInterval(30);
    };

    const handleEdit = (config) => {
        setEditingConfig(config);
        setConfigName(config.name);
        setConfigDescription(config.description || '');
        setWidgetType(config.widget_type);
        setApplyToWalls(config.apply_to_walls || []);
        setIsDefault(config.is_default || false);

        const settings = config.settings || {};
        if (config.widget_type === 'weather') {
            setWeatherLocation(settings.weather?.location || '');
            setWeatherUnits(settings.weather?.units || 'metric');
            setShowForecast(settings.weather?.show_forecast || false);
        } else if (config.widget_type === 'clock') {
            setClockFormat(settings.clock?.format || '24h');
            setShowSeconds(settings.clock?.show_seconds !== false);
            setShowDate(settings.clock?.show_date !== false);
            setTimezone(settings.clock?.timezone || '');
        } else if (config.widget_type === 'orders') {
            setOrdersDisplayMode(settings.orders?.display_mode || 'preparing');
            setMaxOrders(settings.orders?.max_orders || 5);
            setShowCustomerName(settings.orders?.show_customer_name || false);
            setAutoRefreshInterval(settings.orders?.auto_refresh_interval || 30);
        }
        setShowDialog(true);
    };

    const handleSave = () => {
        if (!configName.trim()) {
            toast.error('Please enter a configuration name');
            return;
        }

        const settings = {};
        if (widgetType === 'weather') {
            settings.weather = {
                location: weatherLocation,
                units: weatherUnits,
                show_forecast: showForecast
            };
        } else if (widgetType === 'clock') {
            settings.clock = {
                format: clockFormat,
                show_seconds: showSeconds,
                show_date: showDate,
                timezone: timezone
            };
        } else if (widgetType === 'orders') {
            settings.orders = {
                display_mode: ordersDisplayMode,
                max_orders: maxOrders,
                show_customer_name: showCustomerName,
                auto_refresh_interval: autoRefreshInterval
            };
        }

        const configData = {
            restaurant_id: restaurantId,
            name: configName,
            description: configDescription,
            widget_type: widgetType,
            settings,
            apply_to_walls: applyToWalls,
            is_default: isDefault,
            is_active: true
        };

        if (editingConfig) {
            updateMutation.mutate({ id: editingConfig.id, data: configData });
        } else {
            createMutation.mutate(configData);
        }
    };

    const wallNames = [...new Set(screens
        .filter(s => s.media_wall_config?.enabled && s.media_wall_config?.wall_name)
        .map(s => s.media_wall_config.wall_name))];

    const getWidgetIcon = (type) => {
        switch(type) {
            case 'weather': return <Cloud className="h-4 w-4" />;
            case 'clock': return <Clock className="h-4 w-4" />;
            case 'orders': return <ShoppingBag className="h-4 w-4" />;
            default: return null;
        }
    };

    const groupedConfigs = configurations.reduce((acc, config) => {
        if (!acc[config.widget_type]) acc[config.widget_type] = [];
        acc[config.widget_type].push(config);
        return acc;
    }, {});

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Widget Configurations</h3>
                    <p className="text-sm text-gray-500">Centralized widget settings for all media walls</p>
                </div>
                <Button onClick={() => setShowDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Configuration
                </Button>
            </div>

            <Tabs defaultValue="all" className="w-full">
                <TabsList>
                    <TabsTrigger value="all">All Widgets</TabsTrigger>
                    <TabsTrigger value="weather">Weather</TabsTrigger>
                    <TabsTrigger value="clock">Clock</TabsTrigger>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="space-y-4 mt-4">
                    {Object.entries(groupedConfigs).map(([type, configs]) => (
                        <Card key={type}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    {getWidgetIcon(type)}
                                    {type.charAt(0).toUpperCase() + type.slice(1)} Widgets
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {configs.map(config => (
                                        <div key={config.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm">{config.name}</span>
                                                    {config.is_default && <Badge variant="outline" className="text-xs">Default</Badge>}
                                                    {(!config.apply_to_walls || config.apply_to_walls.length === 0) && (
                                                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                                                            <Globe className="h-3 w-3" />
                                                            Global
                                                        </Badge>
                                                    )}
                                                </div>
                                                {config.description && (
                                                    <p className="text-xs text-gray-500 mt-1">{config.description}</p>
                                                )}
                                                {config.apply_to_walls && config.apply_to_walls.length > 0 && (
                                                    <div className="flex gap-1 mt-1">
                                                        {config.apply_to_walls.map(wall => (
                                                            <Badge key={wall} variant="secondary" className="text-xs">{wall}</Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-1">
                                                <Button size="sm" variant="ghost" onClick={() => handleEdit(config)}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(config.id)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </TabsContent>

                {['weather', 'clock', 'orders'].map(type => (
                    <TabsContent key={type} value={type} className="space-y-2 mt-4">
                        {(groupedConfigs[type] || []).map(config => (
                            <Card key={config.id}>
                                <CardContent className="pt-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                {getWidgetIcon(type)}
                                                <span className="font-medium">{config.name}</span>
                                                {config.is_default && <Badge>Default</Badge>}
                                                {(!config.apply_to_walls || config.apply_to_walls.length === 0) && (
                                                    <Badge variant="outline" className="flex items-center gap-1">
                                                        <Globe className="h-3 w-3" />
                                                        Global
                                                    </Badge>
                                                )}
                                            </div>
                                            {config.description && (
                                                <p className="text-sm text-gray-600 mb-3">{config.description}</p>
                                            )}
                                            <div className="text-xs text-gray-500 space-y-1">
                                                {type === 'weather' && config.settings.weather && (
                                                    <>
                                                        <div>Location: {config.settings.weather.location || 'Not set'}</div>
                                                        <div>Units: {config.settings.weather.units === 'metric' ? 'Metric (°C)' : 'Imperial (°F)'}</div>
                                                        <div>Forecast: {config.settings.weather.show_forecast ? 'Enabled' : 'Disabled'}</div>
                                                    </>
                                                )}
                                                {type === 'clock' && config.settings.clock && (
                                                    <>
                                                        <div>Format: {config.settings.clock.format === '24h' ? '24-hour' : '12-hour'}</div>
                                                        <div>Show Seconds: {config.settings.clock.show_seconds ? 'Yes' : 'No'}</div>
                                                        <div>Show Date: {config.settings.clock.show_date ? 'Yes' : 'No'}</div>
                                                        {config.settings.clock.timezone && <div>Timezone: {config.settings.clock.timezone}</div>}
                                                    </>
                                                )}
                                                {type === 'orders' && config.settings.orders && (
                                                    <>
                                                        <div>Display: {config.settings.orders.display_mode}</div>
                                                        <div>Max Orders: {config.settings.orders.max_orders}</div>
                                                        <div>Show Customer Names: {config.settings.orders.show_customer_name ? 'Yes' : 'No'}</div>
                                                        <div>Auto Refresh: {config.settings.orders.auto_refresh_interval}s</div>
                                                    </>
                                                )}
                                            </div>
                                            {config.apply_to_walls && config.apply_to_walls.length > 0 && (
                                                <div className="flex gap-1 mt-2">
                                                    {config.apply_to_walls.map(wall => (
                                                        <Badge key={wall} variant="secondary" className="text-xs">{wall}</Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-1">
                                            <Button size="sm" variant="ghost" onClick={() => handleEdit(config)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(config.id)}>
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {(!groupedConfigs[type] || groupedConfigs[type].length === 0) && (
                            <Card>
                                <CardContent className="pt-6 text-center text-gray-500">
                                    No {type} configurations yet. Create one to get started.
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                ))}
            </Tabs>

            <Dialog open={showDialog} onOpenChange={(open) => !open && resetForm()}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingConfig ? 'Edit Configuration' : 'New Widget Configuration'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Configuration Name</Label>
                                <Input
                                    value={configName}
                                    onChange={(e) => setConfigName(e.target.value)}
                                    placeholder="e.g., Main Weather Display"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label>Widget Type</Label>
                                <Select value={widgetType} onValueChange={setWidgetType} disabled={!!editingConfig}>
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="weather">Weather</SelectItem>
                                        <SelectItem value="clock">Clock</SelectItem>
                                        <SelectItem value="orders">Orders</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label>Description (optional)</Label>
                            <Input
                                value={configDescription}
                                onChange={(e) => setConfigDescription(e.target.value)}
                                placeholder="Describe this configuration"
                                className="mt-1"
                            />
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
                                    Set as Default Configuration
                                </Label>
                                <p className="text-xs text-gray-500 mt-1">
                                    Default config will be used when no specific config is assigned
                                </p>
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <h4 className="font-medium mb-3">Widget Settings</h4>
                            
                            {widgetType === 'weather' && (
                                <div className="space-y-3">
                                    <div>
                                        <Label>Location</Label>
                                        <Input
                                            value={weatherLocation}
                                            onChange={(e) => setWeatherLocation(e.target.value)}
                                            placeholder="e.g., London, UK"
                                            className="mt-1"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label>Temperature Units</Label>
                                            <Select value={weatherUnits} onValueChange={setWeatherUnits}>
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="metric">Metric (°C)</SelectItem>
                                                    <SelectItem value="imperial">Imperial (°F)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="flex items-center gap-2 mt-1">
                                                <input
                                                    type="checkbox"
                                                    checked={showForecast}
                                                    onChange={(e) => setShowForecast(e.target.checked)}
                                                    className="rounded"
                                                />
                                                Show Forecast
                                            </Label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {widgetType === 'clock' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label>Time Format</Label>
                                            <Select value={clockFormat} onValueChange={setClockFormat}>
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="24h">24-hour</SelectItem>
                                                    <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Timezone (optional)</Label>
                                            <Input
                                                value={timezone}
                                                onChange={(e) => setTimezone(e.target.value)}
                                                placeholder="e.g., Europe/London"
                                                className="mt-1"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Label className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={showSeconds}
                                                onChange={(e) => setShowSeconds(e.target.checked)}
                                                className="rounded"
                                            />
                                            Show Seconds
                                        </Label>
                                        <Label className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={showDate}
                                                onChange={(e) => setShowDate(e.target.checked)}
                                                className="rounded"
                                            />
                                            Show Date
                                        </Label>
                                    </div>
                                </div>
                            )}

                            {widgetType === 'orders' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label>Display Mode</Label>
                                            <Select value={ordersDisplayMode} onValueChange={setOrdersDisplayMode}>
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="recent">Recent Orders</SelectItem>
                                                    <SelectItem value="pending">Pending Orders</SelectItem>
                                                    <SelectItem value="preparing">Preparing Orders</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Max Orders to Display</Label>
                                            <Input
                                                type="number"
                                                value={maxOrders}
                                                onChange={(e) => setMaxOrders(parseInt(e.target.value) || 5)}
                                                min="1"
                                                max="20"
                                                className="mt-1"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label>Auto Refresh (seconds)</Label>
                                            <Input
                                                type="number"
                                                value={autoRefreshInterval}
                                                onChange={(e) => setAutoRefreshInterval(parseInt(e.target.value) || 30)}
                                                min="5"
                                                max="300"
                                                className="mt-1"
                                            />
                                        </div>
                                        <Label className="flex items-center gap-2 mt-6">
                                            <input
                                                type="checkbox"
                                                checked={showCustomerName}
                                                onChange={(e) => setShowCustomerName(e.target.checked)}
                                                className="rounded"
                                            />
                                            Show Customer Names
                                        </Label>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 pt-4 border-t">
                            <Button onClick={handleSave} className="flex-1">
                                <Check className="h-4 w-4 mr-2" />
                                {editingConfig ? 'Update' : 'Create'} Configuration
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