import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AlertCircle, Check, X, Settings, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function ThirdPartyIntegrations({ restaurantId }) {
    const [integrations, setIntegrations] = useState({
        uber_eats: { api_key: '', enabled: false },
        deliveroo: { api_key: '', enabled: false },
        just_eat: { api_key: '', enabled: false }
    });
    
    const [editingPlatform, setEditingPlatform] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
    const [syncing, setSyncing] = useState(false);

    // Fetch existing integrations
    const { data: savedIntegrations, isLoading } = useQuery({
        queryKey: ['third-party-integrations', restaurantId],
        queryFn: async () => {
            try {
                const result = await base44.functions.invoke('getThirdPartyIntegrations', { restaurantId });
                return result.data || {};
            } catch (e) {
                console.log('No integrations found');
                return {};
            }
        },
        enabled: !!restaurantId
    });

    React.useEffect(() => {
        if (savedIntegrations) {
            setIntegrations(prev => ({ ...prev, ...savedIntegrations }));
        }
    }, [savedIntegrations]);

    const handleSave = async (platform) => {
        if (!integrations[platform].api_key && integrations[platform].enabled) {
            toast.error(`API key required for ${platform}`);
            return;
        }

        try {
            await base44.functions.invoke('saveThirdPartyIntegration', {
                restaurantId,
                platform,
                api_key: integrations[platform].api_key,
                enabled: integrations[platform].enabled
            });
            toast.success(`${platform} integration saved`);
            setEditingPlatform(null);
        } catch (e) {
            toast.error('Failed to save integration');
        }
    };

    const handleDelete = async (platform) => {
        try {
            await base44.functions.invoke('deleteThirdPartyIntegration', {
                restaurantId,
                platform
            });
            setIntegrations(prev => ({
                ...prev,
                [platform]: { api_key: '', enabled: false }
            }));
            toast.success(`${platform} integration removed`);
            setShowDeleteConfirm(null);
        } catch (e) {
            toast.error('Failed to delete integration');
        }
    };

    const handleSyncOrders = async () => {
        setSyncing(true);
        try {
            const result = await base44.functions.invoke('syncThirdPartyOrders', { restaurantId });
            toast.success(`Synced ${result.data.totalOrders} orders`);
        } catch (e) {
            toast.error('Failed to sync orders');
        } finally {
            setSyncing(false);
        }
    };

    const platforms = [
        { id: 'uber_eats', name: 'Uber Eats', icon: '🚗', color: 'bg-black' },
        { id: 'deliveroo', name: 'Deliveroo', icon: '🚲', color: 'bg-green-600' },
        { id: 'just_eat', name: 'Just Eat', icon: '🍽️', color: 'bg-orange-500' }
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Third-Party Order Integrations</h2>
                <Button
                    onClick={handleSyncOrders}
                    disabled={syncing}
                    className="bg-blue-600 hover:bg-blue-700"
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync Orders Now'}
                </Button>
            </div>

            <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4 flex gap-3">
                <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700">
                    Connect your Uber Eats, Deliveroo, and Just Eat accounts to automatically pull orders into your MealDrop queue. Orders sync every 2 minutes.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {platforms.map(platform => {
                    const integration = integrations[platform.id];
                    const isEditing = editingPlatform === platform.id;

                    return (
                        <Card key={platform.id} className="border-gray-200">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`text-2xl ${platform.color} rounded-lg p-2 text-white`}>
                                            {platform.icon}
                                        </div>
                                        <CardTitle className="text-lg">{platform.name}</CardTitle>
                                    </div>
                                    {integration?.enabled && (
                                        <Check className="h-5 w-5 text-green-600" />
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {!integration?.enabled && !isEditing ? (
                                    <p className="text-sm text-gray-500">Not connected</p>
                                ) : (
                                    <>
                                        {isEditing ? (
                                            <>
                                                <Input
                                                    type="password"
                                                    placeholder="API Key"
                                                    value={integrations[platform.id].api_key || ''}
                                                    onChange={(e) => setIntegrations(prev => ({
                                                        ...prev,
                                                        [platform.id]: {
                                                            ...prev[platform.id],
                                                            api_key: e.target.value
                                                        }
                                                    }))}
                                                    className="text-sm"
                                                />
                                                <div className="flex gap-2">
                                                    <Button
                                                        onClick={() => handleSave(platform.id)}
                                                        size="sm"
                                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                                    >
                                                        Save
                                                    </Button>
                                                    <Button
                                                        onClick={() => setEditingPlatform(null)}
                                                        size="sm"
                                                        variant="outline"
                                                        className="flex-1"
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="space-y-2">
                                                <p className="text-xs text-gray-600">
                                                    API Key: {integration?.api_key?.substring(0, 10)}...
                                                </p>
                                                <div className="flex gap-2">
                                                    <Button
                                                        onClick={() => setEditingPlatform(platform.id)}
                                                        size="sm"
                                                        variant="outline"
                                                        className="flex-1"
                                                    >
                                                        <Settings className="h-3 w-3 mr-1" />
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        onClick={() => setShowDeleteConfirm(platform.id)}
                                                        size="sm"
                                                        variant="outline"
                                                        className="flex-1 text-red-600 hover:text-red-700"
                                                    >
                                                        <X className="h-3 w-3 mr-1" />
                                                        Remove
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {!integration?.enabled && !isEditing && (
                                    <Button
                                        onClick={() => setEditingPlatform(platform.id)}
                                        size="sm"
                                        className="w-full bg-blue-600 hover:bg-blue-700"
                                    >
                                        Connect
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogTitle>Remove Integration?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will stop pulling orders from {platforms.find(p => p.id === showDeleteConfirm)?.name}. You can reconnect anytime.
                    </AlertDialogDescription>
                    <div className="flex gap-3">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleDelete(showDeleteConfirm)}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Remove
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}