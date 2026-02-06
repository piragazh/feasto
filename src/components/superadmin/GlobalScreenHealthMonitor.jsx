import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { 
    Monitor, 
    CheckCircle2, 
    XCircle, 
    AlertTriangle,
    WifiOff,
    ChevronDown,
    ChevronRight,
    RefreshCw,
    Activity
} from 'lucide-react';
import moment from 'moment';
import ScreenHealthMonitor from '../mediascreen/ScreenHealthMonitor';

export default function GlobalScreenHealthMonitor() {
    const [selectedRestaurant, setSelectedRestaurant] = useState('all');
    const [selectedGroup, setSelectedGroup] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [expandedRestaurants, setExpandedRestaurants] = useState(new Set());
    const [viewingWall, setViewingWall] = useState(null);

    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants-with-screens'],
        queryFn: async () => {
            const allRestaurants = await base44.entities.Restaurant.list();
            return allRestaurants.filter(r => r.media_screen_enabled);
        }
    });

    const { data: allScreens = [], refetch } = useQuery({
        queryKey: ['all-screens'],
        queryFn: async () => {
            const screens = await base44.entities.Screen.list();
            
            // Update health status
            const now = new Date();
            return screens.map(screen => {
                const lastHeartbeat = screen.last_heartbeat ? new Date(screen.last_heartbeat) : null;
                const heartbeatInterval = screen.heartbeat_interval || 60;
                
                let status = 'offline';
                if (lastHeartbeat) {
                    const secondsSinceHeartbeat = (now - lastHeartbeat) / 1000;
                    if (secondsSinceHeartbeat <= heartbeatInterval * 2) {
                        status = 'online';
                    } else if (secondsSinceHeartbeat <= heartbeatInterval * 4) {
                        status = 'warning';
                    } else {
                        status = 'offline';
                    }
                }
                
                const unresolvedErrors = (screen.errors || []).filter(e => !e.resolved);
                const unresolvedWarnings = (screen.warnings || []).filter(w => !w.resolved);
                
                if (status === 'online' && unresolvedErrors.length > 0) {
                    status = 'error';
                } else if (status === 'online' && unresolvedWarnings.length > 0) {
                    status = 'warning';
                }
                
                return {
                    ...screen,
                    computed_status: status,
                    unresolved_errors: unresolvedErrors.length,
                    unresolved_warnings: unresolvedWarnings.length
                };
            });
        },
        refetchInterval: 15000
    });

    // Filter screens
    const filteredScreens = allScreens.filter(screen => {
        if (selectedRestaurant !== 'all' && screen.restaurant_id !== selectedRestaurant) return false;
        if (statusFilter !== 'all' && screen.computed_status !== statusFilter) return false;
        if (selectedGroup !== 'all' && !screen.groups?.includes(selectedGroup)) return false;
        return true;
    });

    // Group screens by restaurant
    const screensByRestaurant = filteredScreens.reduce((acc, screen) => {
        if (!acc[screen.restaurant_id]) {
            acc[screen.restaurant_id] = [];
        }
        acc[screen.restaurant_id].push(screen);
        return acc;
    }, {});

    // Get all unique groups
    const allGroups = [...new Set(allScreens.flatMap(s => s.groups || []))];

    // Get all unique walls
    const wallsByRestaurant = {};
    allScreens.forEach(screen => {
        if (screen.media_wall_config?.enabled && screen.media_wall_config?.wall_name) {
            const key = `${screen.restaurant_id}_${screen.media_wall_config.wall_name}`;
            if (!wallsByRestaurant[key]) {
                wallsByRestaurant[key] = {
                    restaurantId: screen.restaurant_id,
                    wallName: screen.media_wall_config.wall_name,
                    screens: []
                };
            }
            wallsByRestaurant[key].screens.push(screen);
        }
    });

    const toggleRestaurant = (restaurantId) => {
        const newExpanded = new Set(expandedRestaurants);
        if (newExpanded.has(restaurantId)) {
            newExpanded.delete(restaurantId);
        } else {
            newExpanded.add(restaurantId);
        }
        setExpandedRestaurants(newExpanded);
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'online': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
            case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
            case 'error': return <XCircle className="h-4 w-4 text-red-600" />;
            case 'offline': return <WifiOff className="h-4 w-4 text-gray-600" />;
            default: return <Monitor className="h-4 w-4" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'online': return 'bg-green-100 text-green-800 border-green-200';
            case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'error': return 'bg-red-100 text-red-800 border-red-200';
            case 'offline': return 'bg-gray-100 text-gray-800 border-gray-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    // Calculate stats
    const totalScreens = allScreens.length;
    const onlineCount = allScreens.filter(s => s.computed_status === 'online').length;
    const warningCount = allScreens.filter(s => s.computed_status === 'warning').length;
    const errorCount = allScreens.filter(s => s.computed_status === 'error').length;
    const offlineCount = allScreens.filter(s => s.computed_status === 'offline').length;

    if (viewingWall) {
        return (
            <div className="space-y-4">
                <Button variant="outline" onClick={() => setViewingWall(null)}>
                    ← Back to Overview
                </Button>
                <ScreenHealthMonitor 
                    restaurantId={viewingWall.restaurantId} 
                    wallName={viewingWall.wallName}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-5 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-600">Total Screens</p>
                                <p className="text-2xl font-bold">{totalScreens}</p>
                            </div>
                            <Monitor className="h-8 w-8 text-blue-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-green-700">Online</p>
                                <p className="text-2xl font-bold text-green-900">{onlineCount}</p>
                            </div>
                            <CheckCircle2 className="h-8 w-8 text-green-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-yellow-200 bg-yellow-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-yellow-700">Warnings</p>
                                <p className="text-2xl font-bold text-yellow-900">{warningCount}</p>
                            </div>
                            <AlertTriangle className="h-8 w-8 text-yellow-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-red-700">Errors</p>
                                <p className="text-2xl font-bold text-red-900">{errorCount}</p>
                            </div>
                            <XCircle className="h-8 w-8 text-red-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-gray-200 bg-gray-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-700">Offline</p>
                                <p className="text-2xl font-bold text-gray-900">{offlineCount}</p>
                            </div>
                            <WifiOff className="h-8 w-8 text-gray-600" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5" />
                            Screen Health Monitor
                        </CardTitle>
                        <Button size="sm" variant="outline" onClick={() => refetch()}>
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Refresh
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                            <Label className="text-xs mb-1">Restaurant</Label>
                            <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Restaurants</SelectItem>
                                    {restaurants.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs mb-1">Group</Label>
                            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Groups</SelectItem>
                                    {allGroups.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs mb-1">Status</Label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="online">Online</SelectItem>
                                    <SelectItem value="warning">Warning</SelectItem>
                                    <SelectItem value="error">Error</SelectItem>
                                    <SelectItem value="offline">Offline</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Hierarchical View */}
                    <ScrollArea className="h-[600px]">
                        <div className="space-y-2">
                            {Object.entries(screensByRestaurant).map(([restaurantId, screens]) => {
                                const restaurant = restaurants.find(r => r.id === restaurantId);
                                if (!restaurant) return null;

                                const isExpanded = expandedRestaurants.has(restaurantId);
                                const restaurantOnline = screens.filter(s => s.computed_status === 'online').length;
                                const restaurantOffline = screens.filter(s => s.computed_status === 'offline').length;
                                const restaurantErrors = screens.filter(s => s.computed_status === 'error').length;

                                // Group by screen groups
                                const screensByGroup = screens.reduce((acc, screen) => {
                                    const groups = screen.groups?.length > 0 ? screen.groups : ['Ungrouped'];
                                    groups.forEach(group => {
                                        if (!acc[group]) acc[group] = [];
                                        acc[group].push(screen);
                                    });
                                    return acc;
                                }, {});

                                return (
                                    <div key={restaurantId} className="border rounded-lg">
                                        <div 
                                            className="p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                                            onClick={() => toggleRestaurant(restaurantId)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                    <div className="flex items-center gap-2">
                                                        {restaurant.logo_url && (
                                                            <img src={restaurant.logo_url} alt="" className="h-6 w-6 rounded object-cover" />
                                                        )}
                                                        <span className="font-semibold">{restaurant.name}</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Badge className="bg-green-100 text-green-800">
                                                        {restaurantOnline} online
                                                    </Badge>
                                                    {restaurantErrors > 0 && (
                                                        <Badge className="bg-red-100 text-red-800">
                                                            {restaurantErrors} errors
                                                        </Badge>
                                                    )}
                                                    {restaurantOffline > 0 && (
                                                        <Badge className="bg-gray-100 text-gray-800">
                                                            {restaurantOffline} offline
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="p-3 space-y-3">
                                                {Object.entries(screensByGroup).map(([groupName, groupScreens]) => (
                                                    <div key={groupName} className="border-l-2 border-purple-200 pl-4">
                                                        <p className="text-sm font-semibold text-purple-900 mb-2">
                                                            {groupName} ({groupScreens.length})
                                                        </p>
                                                        <div className="space-y-2">
                                                            {groupScreens.map(screen => (
                                                                <div 
                                                                    key={screen.id}
                                                                    className={`p-2 rounded border ${getStatusColor(screen.computed_status)}`}
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            {getStatusIcon(screen.computed_status)}
                                                                            <span className="text-sm font-medium">{screen.screen_name}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 text-xs">
                                                                            {screen.last_heartbeat && (
                                                                                <span className="text-gray-600">
                                                                                    {moment(screen.last_heartbeat).fromNow()}
                                                                                </span>
                                                                            )}
                                                                            {screen.media_wall_config?.enabled && (
                                                                                <Button
                                                                                    size="sm"
                                                                                    variant="ghost"
                                                                                    className="h-6 px-2"
                                                                                    onClick={() => setViewingWall({
                                                                                        restaurantId: screen.restaurant_id,
                                                                                        wallName: screen.media_wall_config.wall_name
                                                                                    })}
                                                                                >
                                                                                    View Wall
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}