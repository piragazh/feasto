import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
    Activity, 
    AlertTriangle, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Bell,
    TrendingUp,
    Monitor,
    Wifi,
    WifiOff,
    RefreshCw,
    AlertCircle,
    Power,
    Trash2,
    Send,
    History
} from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function ScreenHealthMonitor({ restaurantId, wallName }) {
    const queryClient = useQueryClient();
    const [selectedScreen, setSelectedScreen] = useState(null);
    const [showDetails, setShowDetails] = useState(false);
    const [showCommandDialog, setShowCommandDialog] = useState(false);
    const [customCommand, setCustomCommand] = useState('');
    const [showCommandLog, setShowCommandLog] = useState(false);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const userData = await base44.auth.me();
                setUser(userData);
            } catch (e) {
                console.error('Failed to load user:', e);
            }
        };
        loadUser();
    }, []);

    const { data: screens = [], refetch } = useQuery({
        queryKey: ['screen-health', restaurantId, wallName],
        queryFn: async () => {
            const allScreens = await base44.entities.Screen.filter({ 
                restaurant_id: restaurantId,
                'media_wall_config.wall_name': wallName,
                'media_wall_config.enabled': true
            });
            
            // Update health status based on last heartbeat
            const now = new Date();
            return allScreens.map(screen => {
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
        refetchInterval: 10000, // Refresh every 10 seconds
        staleTime: 5000,
        enabled: !!restaurantId && !!wallName
    });

    const { data: commandLogs = [] } = useQuery({
        queryKey: ['screen-command-logs', restaurantId],
        queryFn: async () => {
            const logs = await base44.entities.ScreenCommandLog.filter(
                { restaurant_id: restaurantId },
                '-created_date',
                50
            );
            return logs;
        },
        enabled: !!restaurantId
    });

    const sendCommandMutation = useMutation({
        mutationFn: async ({ screenId, command, params = {} }) => {
            const screen = screens.find(s => s.id === screenId);
            if (!screen) throw new Error('Screen not found');

            // Update screen with pending command
            await base44.entities.Screen.update(screenId, {
                pending_command: command,
                command_timestamp: new Date().toISOString()
            });

            // Log the command
            await base44.entities.ScreenCommandLog.create({
                screen_id: screenId,
                restaurant_id: screen.restaurant_id,
                screen_name: screen.screen_name,
                command,
                command_params: params,
                issued_by: user?.email || 'unknown',
                status: 'pending'
            });

            return { screenId, command };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(['screen-health']);
            queryClient.invalidateQueries(['screen-command-logs']);
            toast.success(`Command "${data.command}" sent to screen`);
        },
        onError: (error) => {
            toast.error('Failed to send command: ' + error.message);
        }
    });

    const resolveIssueMutation = useMutation({
        mutationFn: async ({ screenId, type, index }) => {
            const screen = screens.find(s => s.id === screenId);
            if (!screen) return;

            const issues = type === 'error' ? [...(screen.errors || [])] : [...(screen.warnings || [])];
            if (issues[index]) {
                issues[index].resolved = true;
            }

            return base44.entities.Screen.update(screenId, {
                [type === 'error' ? 'errors' : 'warnings']: issues
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['screen-health']);
            toast.success('Issue marked as resolved');
        }
    });

    const clearAllResolvedMutation = useMutation({
        mutationFn: async (screenId) => {
            const screen = screens.find(s => s.id === screenId);
            if (!screen) return;

            return base44.entities.Screen.update(screenId, {
                errors: (screen.errors || []).filter(e => !e.resolved),
                warnings: (screen.warnings || []).filter(w => !w.resolved)
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['screen-health']);
            toast.success('Cleared resolved issues');
        }
    });

    const getStatusColor = (status) => {
        switch (status) {
            case 'online': return 'text-green-600 bg-green-50 border-green-200';
            case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
            case 'error': return 'text-red-600 bg-red-50 border-red-200';
            case 'offline': return 'text-gray-600 bg-gray-50 border-gray-200';
            default: return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'online': return <CheckCircle2 className="h-5 w-5" />;
            case 'warning': return <AlertTriangle className="h-5 w-5" />;
            case 'error': return <XCircle className="h-5 w-5" />;
            case 'offline': return <WifiOff className="h-5 w-5" />;
            default: return <Monitor className="h-5 w-5" />;
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'online': return 'Online';
            case 'warning': return 'Warning';
            case 'error': return 'Error';
            case 'offline': return 'Offline';
            default: return 'Unknown';
        }
    };

    const onlineCount = screens.filter(s => s.computed_status === 'online').length;
    const warningCount = screens.filter(s => s.computed_status === 'warning').length;
    const errorCount = screens.filter(s => s.computed_status === 'error').length;
    const offlineCount = screens.filter(s => s.computed_status === 'offline').length;

    return (
        <div className="space-y-4">
            {/* Overview Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-green-700 font-medium">Online</p>
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
                                <p className="text-xs text-yellow-700 font-medium">Warnings</p>
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
                                <p className="text-xs text-red-700 font-medium">Errors</p>
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
                                <p className="text-xs text-gray-700 font-medium">Offline</p>
                                <p className="text-2xl font-bold text-gray-900">{offlineCount}</p>
                            </div>
                            <WifiOff className="h-8 w-8 text-gray-600" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Screen List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5" />
                            Screen Status
                        </CardTitle>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setShowCommandLog(true)}>
                                <History className="h-4 w-4 mr-1" />
                                Command Log
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => refetch()}>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Refresh
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {screens.map(screen => (
                            <div
                                key={screen.id}
                                className={`p-3 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md ${getStatusColor(screen.computed_status)}`}
                                onClick={() => {
                                    setSelectedScreen(screen);
                                    setShowDetails(true);
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {getStatusIcon(screen.computed_status)}
                                        <div>
                                            <p className="font-semibold">{screen.screen_name}</p>
                                            <div className="flex gap-2 mt-1 text-xs">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {screen.last_heartbeat 
                                                        ? moment(screen.last_heartbeat).fromNow()
                                                        : 'Never'
                                                    }
                                                </span>
                                                {screen.groups && screen.groups.length > 0 && (
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {screen.groups[0]}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge className={getStatusColor(screen.computed_status)}>
                                            {getStatusText(screen.computed_status)}
                                        </Badge>
                                        {screen.unresolved_errors > 0 && (
                                            <Badge className="bg-red-100 text-red-800">
                                                {screen.unresolved_errors} error{screen.unresolved_errors > 1 ? 's' : ''}
                                            </Badge>
                                        )}
                                        {screen.unresolved_warnings > 0 && (
                                            <Badge className="bg-yellow-100 text-yellow-800">
                                                {screen.unresolved_warnings} warning{screen.unresolved_warnings > 1 ? 's' : ''}
                                            </Badge>
                                        )}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <Button size="sm" variant="outline">
                                                    <Send className="h-3 w-3" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenuItem 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        sendCommandMutation.mutate({ 
                                                            screenId: screen.id, 
                                                            command: 'refresh_content' 
                                                        });
                                                    }}
                                                >
                                                    <RefreshCw className="h-3 w-3 mr-2" />
                                                    Refresh Content
                                                </DropdownMenuItem>
                                                <DropdownMenuItem 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        sendCommandMutation.mutate({ 
                                                            screenId: screen.id, 
                                                            command: 'reboot' 
                                                        });
                                                    }}
                                                >
                                                    <Power className="h-3 w-3 mr-2" />
                                                    Reboot Screen
                                                </DropdownMenuItem>
                                                <DropdownMenuItem 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        sendCommandMutation.mutate({ 
                                                            screenId: screen.id, 
                                                            command: 'clear_cache' 
                                                        });
                                                    }}
                                                >
                                                    <Trash2 className="h-3 w-3 mr-2" />
                                                    Clear Cache
                                                </DropdownMenuItem>
                                                <DropdownMenuItem 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedScreen(screen);
                                                        setShowCommandDialog(true);
                                                    }}
                                                >
                                                    <Send className="h-3 w-3 mr-2" />
                                                    Custom Command
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Details Dialog */}
            <Dialog open={showDetails} onOpenChange={setShowDetails}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Monitor className="h-5 w-5" />
                            {selectedScreen?.screen_name} - Health Details
                        </DialogTitle>
                    </DialogHeader>
                    {selectedScreen && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-gray-700">Status</p>
                                    <Badge className={`${getStatusColor(selectedScreen.computed_status)} text-sm py-1 px-3`}>
                                        {getStatusIcon(selectedScreen.computed_status)}
                                        <span className="ml-2">{getStatusText(selectedScreen.computed_status)}</span>
                                    </Badge>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-gray-700">Last Heartbeat</p>
                                    <p className="text-sm">
                                        {selectedScreen.last_heartbeat 
                                            ? moment(selectedScreen.last_heartbeat).format('MMM DD, YYYY HH:mm:ss')
                                            : 'Never received'
                                        }
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-gray-700">Uptime (24h)</p>
                                    <p className="text-sm">
                                        {selectedScreen.uptime_percentage 
                                            ? `${selectedScreen.uptime_percentage.toFixed(1)}%`
                                            : 'N/A'
                                        }
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-gray-700">Groups</p>
                                    <div className="flex gap-1 flex-wrap">
                                        {selectedScreen.groups && selectedScreen.groups.length > 0 ? (
                                            selectedScreen.groups.map(group => (
                                                <Badge key={group} variant="outline" className="text-xs">{group}</Badge>
                                            ))
                                        ) : (
                                            <p className="text-xs text-gray-500">None</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Errors */}
                            {selectedScreen.errors && selectedScreen.errors.length > 0 && (
                                <div className="border rounded-lg p-3 bg-red-50">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-semibold text-red-900 flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4" />
                                            Errors ({selectedScreen.errors.filter(e => !e.resolved).length})
                                        </h4>
                                        {selectedScreen.errors.some(e => e.resolved) && (
                                            <Button 
                                                size="sm" 
                                                variant="ghost"
                                                onClick={() => clearAllResolvedMutation.mutate(selectedScreen.id)}
                                            >
                                                Clear Resolved
                                            </Button>
                                        )}
                                    </div>
                                    <ScrollArea className="max-h-40">
                                        <div className="space-y-2">
                                            {selectedScreen.errors.map((error, idx) => (
                                                <div 
                                                    key={idx} 
                                                    className={`p-2 rounded border text-sm ${
                                                        error.resolved 
                                                            ? 'bg-gray-100 text-gray-500 line-through' 
                                                            : 'bg-white text-red-900'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1">
                                                            <p className="font-medium">{error.message}</p>
                                                            <p className="text-xs mt-1">
                                                                {moment(error.timestamp).format('MMM DD, HH:mm:ss')}
                                                                {error.severity && (
                                                                    <Badge className="ml-2 text-[10px]" variant="outline">
                                                                        {error.severity}
                                                                    </Badge>
                                                                )}
                                                            </p>
                                                        </div>
                                                        {!error.resolved && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-6 text-xs"
                                                                onClick={() => resolveIssueMutation.mutate({
                                                                    screenId: selectedScreen.id,
                                                                    type: 'error',
                                                                    index: idx
                                                                })}
                                                            >
                                                                Resolve
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>
                            )}

                            {/* Warnings */}
                            {selectedScreen.warnings && selectedScreen.warnings.length > 0 && (
                                <div className="border rounded-lg p-3 bg-yellow-50">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-semibold text-yellow-900 flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4" />
                                            Warnings ({selectedScreen.warnings.filter(w => !w.resolved).length})
                                        </h4>
                                        {selectedScreen.warnings.some(w => w.resolved) && (
                                            <Button 
                                                size="sm" 
                                                variant="ghost"
                                                onClick={() => clearAllResolvedMutation.mutate(selectedScreen.id)}
                                            >
                                                Clear Resolved
                                            </Button>
                                        )}
                                    </div>
                                    <ScrollArea className="max-h-40">
                                        <div className="space-y-2">
                                            {selectedScreen.warnings.map((warning, idx) => (
                                                <div 
                                                    key={idx} 
                                                    className={`p-2 rounded border text-sm ${
                                                        warning.resolved 
                                                            ? 'bg-gray-100 text-gray-500 line-through' 
                                                            : 'bg-white text-yellow-900'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1">
                                                            <p className="font-medium">{warning.message}</p>
                                                            <p className="text-xs mt-1">
                                                                {moment(warning.timestamp).format('MMM DD, HH:mm:ss')}
                                                            </p>
                                                        </div>
                                                        {!warning.resolved && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-6 text-xs"
                                                                onClick={() => resolveIssueMutation.mutate({
                                                                    screenId: selectedScreen.id,
                                                                    type: 'warning',
                                                                    index: idx
                                                                })}
                                                            >
                                                                Resolve
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>
                            )}

                            {/* Screen Info */}
                            {selectedScreen.screen_info && (
                                <div className="border rounded-lg p-3 bg-gray-50">
                                    <h4 className="font-semibold text-gray-900 mb-2">Device Information</h4>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        {Object.entries(selectedScreen.screen_info).map(([key, value]) => (
                                            <div key={key}>
                                                <span className="text-gray-600">{key}:</span>
                                                <span className="ml-2 font-medium">{String(value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Remote Control */}
                            <div className="border rounded-lg p-3 bg-blue-50">
                                <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                                    <Send className="h-4 w-4" />
                                    Remote Control
                                </h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="bg-white"
                                        onClick={() => sendCommandMutation.mutate({ 
                                            screenId: selectedScreen.id, 
                                            command: 'refresh_content' 
                                        })}
                                        disabled={sendCommandMutation.isPending}
                                    >
                                        <RefreshCw className="h-3 w-3 mr-2" />
                                        Refresh Content
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="bg-white"
                                        onClick={() => sendCommandMutation.mutate({ 
                                            screenId: selectedScreen.id, 
                                            command: 'reboot' 
                                        })}
                                        disabled={sendCommandMutation.isPending}
                                    >
                                        <Power className="h-3 w-3 mr-2" />
                                        Reboot
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="bg-white"
                                        onClick={() => sendCommandMutation.mutate({ 
                                            screenId: selectedScreen.id, 
                                            command: 'clear_cache' 
                                        })}
                                        disabled={sendCommandMutation.isPending}
                                    >
                                        <Trash2 className="h-3 w-3 mr-2" />
                                        Clear Cache
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="bg-white"
                                        onClick={() => setShowCommandDialog(true)}
                                        disabled={sendCommandMutation.isPending}
                                    >
                                        <Send className="h-3 w-3 mr-2" />
                                        Custom Command
                                    </Button>
                                </div>
                                {selectedScreen.pending_command && (
                                    <div className="mt-3 p-2 bg-yellow-100 rounded text-sm">
                                        <p className="font-medium text-yellow-900">
                                            Pending: {selectedScreen.pending_command}
                                        </p>
                                        <p className="text-xs text-yellow-700">
                                            Sent {moment(selectedScreen.command_timestamp).fromNow()}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Custom Command Dialog */}
            <Dialog open={showCommandDialog} onOpenChange={setShowCommandDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Send Custom Command</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Command</Label>
                            <Input
                                placeholder="e.g., set_volume, enable_debug"
                                value={customCommand}
                                onChange={(e) => setCustomCommand(e.target.value)}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Enter a custom command to send to the screen
                            </p>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowCommandDialog(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => {
                                    if (!customCommand.trim()) {
                                        toast.error('Enter a command');
                                        return;
                                    }
                                    sendCommandMutation.mutate({
                                        screenId: selectedScreen.id,
                                        command: customCommand
                                    });
                                    setCustomCommand('');
                                    setShowCommandDialog(false);
                                }}
                                disabled={sendCommandMutation.isPending}
                            >
                                <Send className="h-4 w-4 mr-2" />
                                Send Command
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Command Log Dialog */}
            <Dialog open={showCommandLog} onOpenChange={setShowCommandLog}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <History className="h-5 w-5" />
                            Command Log
                        </DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-96">
                        <div className="space-y-2">
                            {commandLogs.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No commands logged yet</p>
                            ) : (
                                commandLogs.map(log => (
                                    <div key={log.id} className="border rounded-lg p-3 bg-gray-50">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Badge variant="outline" className="text-xs font-mono">
                                                        {log.command}
                                                    </Badge>
                                                    <Badge 
                                                        className={
                                                            log.status === 'executed' ? 'bg-green-100 text-green-800' :
                                                            log.status === 'failed' ? 'bg-red-100 text-red-800' :
                                                            log.status === 'timeout' ? 'bg-orange-100 text-orange-800' :
                                                            'bg-blue-100 text-blue-800'
                                                        }
                                                    >
                                                        {log.status}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm font-medium">{log.screen_name}</p>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    By {log.issued_by} • {moment(log.created_date).format('MMM DD, HH:mm:ss')}
                                                </p>
                                                {log.executed_at && (
                                                    <p className="text-xs text-green-600 mt-1">
                                                        Executed: {moment(log.executed_at).format('MMM DD, HH:mm:ss')}
                                                    </p>
                                                )}
                                                {log.error_message && (
                                                    <p className="text-xs text-red-600 mt-1">
                                                        Error: {log.error_message}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </div>
    );
}