import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Monitor, Power, RefreshCw, Wifi, WifiOff, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function ScreenControl({ restaurantId }) {
    const queryClient = useQueryClient();
    const [selectedScreens, setSelectedScreens] = useState([]);

    const { data: screens = [], refetch } = useQuery({
        queryKey: ['screens-control', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
        refetchInterval: 10000, // Refresh every 10 seconds
    });

    const updateScreenMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Screen.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['screens-control']);
        },
    });

    const getScreenStatus = (screen) => {
        if (!screen.last_heartbeat) return 'unknown';
        const lastSeen = moment(screen.last_heartbeat);
        const minutesAgo = moment().diff(lastSeen, 'minutes');
        
        if (minutesAgo < 2) return 'online';
        if (minutesAgo < 10) return 'idle';
        return 'offline';
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'online': return 'bg-green-500';
            case 'idle': return 'bg-yellow-500';
            case 'offline': return 'bg-gray-400';
            default: return 'bg-gray-300';
        }
    };

    const getStatusBadge = (status) => {
        const colors = {
            online: 'bg-green-100 text-green-700 border-green-200',
            idle: 'bg-yellow-100 text-yellow-700 border-yellow-200',
            offline: 'bg-gray-100 text-gray-700 border-gray-200',
            unknown: 'bg-gray-100 text-gray-500 border-gray-200'
        };
        const icons = {
            online: <Wifi className="h-3 w-3 mr-1" />,
            idle: <Wifi className="h-3 w-3 mr-1" />,
            offline: <WifiOff className="h-3 w-3 mr-1" />,
            unknown: <AlertCircle className="h-3 w-3 mr-1" />
        };
        return (
            <Badge className={colors[status]}>
                {icons[status]}
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
        );
    };

    const sendCommand = async (screenId, command) => {
        try {
            const timestamp = new Date().toISOString();
            await updateScreenMutation.mutateAsync({
                id: screenId,
                data: {
                    pending_command: command,
                    command_timestamp: timestamp
                }
            });
            toast.success(`${command} command sent to screen`);
        } catch (error) {
            toast.error('Failed to send command');
        }
    };

    const sendBulkCommand = async (command) => {
        if (selectedScreens.length === 0) {
            toast.error('No screens selected');
            return;
        }

        try {
            const timestamp = new Date().toISOString();
            for (const screenId of selectedScreens) {
                await updateScreenMutation.mutateAsync({
                    id: screenId,
                    data: {
                        pending_command: command,
                        command_timestamp: timestamp
                    }
                });
            }
            toast.success(`${command} command sent to ${selectedScreens.length} screen(s)`);
            setSelectedScreens([]);
        } catch (error) {
            toast.error('Failed to send bulk command');
        }
    };

    const pushContentUpdate = async (screenId) => {
        await sendCommand(screenId, 'refresh_content');
    };

    const rebootScreen = async (screenId) => {
        const confirm = window.confirm('Are you sure you want to reboot this screen?');
        if (!confirm) return;
        await sendCommand(screenId, 'reboot');
    };

    const toggleScreenSelection = (screenId) => {
        setSelectedScreens(prev =>
            prev.includes(screenId)
                ? prev.filter(id => id !== screenId)
                : [...prev, screenId]
        );
    };

    const selectAll = () => {
        setSelectedScreens(screens.map(s => s.id));
    };

    const deselectAll = () => {
        setSelectedScreens([]);
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Monitor className="h-5 w-5" />
                            Screen Control Center
                        </CardTitle>
                        <p className="text-sm text-gray-500 mt-1">
                            Monitor and control screens remotely
                        </p>
                    </div>
                    <Button onClick={refetch} variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {selectedScreens.length > 0 && (
                    <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="h-5 w-5 text-blue-600" />
                                    <span className="font-medium text-blue-900">
                                        {selectedScreens.length} screen(s) selected
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => sendBulkCommand('refresh_content')}
                                    >
                                        <Send className="h-3 w-3 mr-1" />
                                        Push Update
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => sendBulkCommand('reboot')}
                                    >
                                        <Power className="h-3 w-3 mr-1" />
                                        Reboot All
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={deselectAll}
                                    >
                                        Clear
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {screens.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No screens available</p>
                    </div>
                ) : (
                    <>
                        <div className="flex justify-end gap-2 text-xs">
                            <Button variant="ghost" size="sm" onClick={selectAll}>
                                Select All
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {screens.map(screen => {
                                const status = getScreenStatus(screen);
                                const isSelected = selectedScreens.includes(screen.id);

                                return (
                                    <Card
                                        key={screen.id}
                                        className={`transition-all ${isSelected ? 'border-blue-500 border-2 bg-blue-50' : ''}`}
                                    >
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-4">
                                                <div className="pt-1">
                                                    <Switch
                                                        checked={isSelected}
                                                        onCheckedChange={() => toggleScreenSelection(screen.id)}
                                                    />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-semibold truncate">
                                                                {screen.screen_name}
                                                            </h3>
                                                            {getStatusBadge(status)}
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => pushContentUpdate(screen.id)}
                                                                disabled={status === 'offline'}
                                                            >
                                                                <Send className="h-3 w-3 mr-1" />
                                                                Push Update
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => rebootScreen(screen.id)}
                                                                disabled={status === 'offline'}
                                                            >
                                                                <Power className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-4 text-xs text-gray-600">
                                                        <div className="flex items-center gap-1">
                                                            <div className={`h-2 w-2 rounded-full ${getStatusColor(status)}`} />
                                                            <span>
                                                                {screen.last_heartbeat 
                                                                    ? `Last seen ${moment(screen.last_heartbeat).fromNow()}`
                                                                    : 'Never connected'}
                                                            </span>
                                                        </div>
                                                        {screen.screen_info && (
                                                            <>
                                                                {screen.screen_info.browser && (
                                                                    <span>• {screen.screen_info.browser}</span>
                                                                )}
                                                                {screen.screen_info.resolution && (
                                                                    <span>• {screen.screen_info.resolution}</span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>

                                                    {screen.pending_command && (
                                                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-xs text-amber-700">
                                                            Pending command: <strong>{screen.pending_command}</strong>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}