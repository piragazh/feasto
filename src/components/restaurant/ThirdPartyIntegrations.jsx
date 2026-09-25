import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AlertCircle, Check, X, Settings, RefreshCw, LogIn, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const PLATFORMS = [
    {
        id: 'uber_eats',
        name: 'Uber Eats',
        icon: '🚗',
        color: 'bg-black',
        loginUrl: 'https://restaurant.uber.com',
        helpText: 'Enter your Uber Eats store ID. You authorise MealDrop on Uber\u2019s own site \u2014 we never ask for or store your marketplace password.',
    },
    {
        id: 'deliveroo',
        name: 'Deliveroo',
        icon: '🚲',
        color: 'bg-teal-600',
        loginUrl: 'https://restaurant-hub.deliveroo.com',
        helpText: 'Enter your Deliveroo site ID. You authorise MealDrop on Deliveroo\u2019s own site \u2014 we never ask for or store your marketplace password.',
    },
    {
        id: 'just_eat',
        name: 'Just Eat',
        icon: '🍽️',
        color: 'bg-orange-500',
        loginUrl: 'https://partner.just-eat.co.uk',
        helpText: 'Just Eat integration requires partner API access and is not available yet. We will never ask for your Just Eat login.',
    },
];

export default function ThirdPartyIntegrations({ restaurantId }) {
    const [editingPlatform, setEditingPlatform] = useState(null);
    // Store ID only. This screen used to collect the restaurant's marketplace
    // email and password - a marketplace login is full account access, so it is
    // never asked for or stored.
    const [credentials, setCredentials] = useState({ store_id: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
    const [syncing, setSyncing] = useState(false);

    const { data: savedIntegrations = {}, isLoading, refetch } = useQuery({
        queryKey: ['third-party-integrations', restaurantId],
        queryFn: async () => {
            try {
                const result = await base44.functions.invoke('getThirdPartyIntegrations', { restaurantId });
                return result.data || {};
            } catch {
                return {};
            }
        },
        enabled: !!restaurantId,
    });

    const openConnect = (platformId) => {
        setCredentials({ store_id: '' });
        setShowPassword(false);
        setEditingPlatform(platformId);
    };

    const handleSave = async () => {
        if (!credentials.store_id) {
            toast.error('Please enter your store ID');
            return;
        }
        setSaving(true);
        try {
            await base44.functions.invoke('saveThirdPartyIntegration', {
                restaurantId,
                platform: editingPlatform,
                store_id: credentials.store_id,
                enabled: true,
            });
            toast.success(`${PLATFORMS.find(p => p.id === editingPlatform)?.name} connected`);
            setEditingPlatform(null);
            refetch();
        } catch {
            toast.error('Failed to save. Please check your credentials.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (platform) => {
        try {
            await base44.functions.invoke('deleteThirdPartyIntegration', { restaurantId, platform });
            toast.success(`${PLATFORMS.find(p => p.id === platform)?.name} disconnected`);
            setShowDeleteConfirm(null);
            refetch();
        } catch {
            toast.error('Failed to disconnect');
        }
    };

    const handleSyncOrders = async () => {
        setSyncing(true);
        try {
            const result = await base44.functions.invoke('syncThirdPartyOrders', { restaurantId });
            toast.success(`Synced ${result.data?.totalOrders ?? 0} orders`);
        } catch {
            toast.error('Failed to sync orders');
        } finally {
            setSyncing(false);
        }
    };

    const activePlatform = PLATFORMS.find(p => p.id === editingPlatform);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Third-Party Order Integrations</h2>
                <Button onClick={handleSyncOrders} disabled={syncing} className="bg-blue-600 hover:bg-blue-700">
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync Orders Now'}
                </Button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700">
                    Connect your Uber Eats, Deliveroo, and Just Eat accounts using your restaurant login credentials to automatically pull orders into your MealDrop queue.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLATFORMS.map(platform => {
                    const saved = savedIntegrations[platform.id];
                    const isConnected = saved?.enabled;

                    return (
                        <Card key={platform.id} className={`border-2 transition-colors ${isConnected ? 'border-green-200' : 'border-gray-200'}`}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`text-xl ${platform.color} rounded-lg p-2 text-white`}>
                                            {platform.icon}
                                        </div>
                                        <CardTitle className="text-base">{platform.name}</CardTitle>
                                    </div>
                                    {isConnected && (
                                        <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                                            <Check className="h-3 w-3" /> Connected
                                        </span>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {isConnected ? (
                                    <>
                                        <p className="text-xs text-gray-500">
                                            Store ID: <span className="font-medium text-gray-700">{saved.store_id || '\u2014'}</span>
                                        </p>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1"
                                                onClick={() => openConnect(platform.id)}
                                            >
                                                <Settings className="h-3 w-3 mr-1" />
                                                Update
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 text-red-600 hover:text-red-700 hover:border-red-300"
                                                onClick={() => setShowDeleteConfirm(platform.id)}
                                            >
                                                <X className="h-3 w-3 mr-1" />
                                                Disconnect
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-xs text-gray-500">{platform.helpText}</p>
                                        <Button
                                            size="sm"
                                            className="w-full bg-blue-600 hover:bg-blue-700"
                                            onClick={() => openConnect(platform.id)}
                                        >
                                            <LogIn className="h-3.5 w-3.5 mr-1.5" />
                                            Connect Account
                                        </Button>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Login Modal */}
            <AlertDialog open={!!editingPlatform} onOpenChange={() => setEditingPlatform(null)}>
                <AlertDialogContent className="max-w-md">
                    {activePlatform && (
                        <>
                            <AlertDialogTitle className="flex items-center gap-2">
                                <span className={`text-xl ${activePlatform.color} rounded-lg p-1.5 text-white`}>
                                    {activePlatform.icon}
                                </span>
                                Connect {activePlatform.name}
                            </AlertDialogTitle>
                            <AlertDialogDescription asChild>
                                <div className="space-y-4 mt-2">
                                    <p className="text-sm text-gray-600">{activePlatform.helpText}</p>
                                    <div className="space-y-3">
                                        <div>
                                            <Label htmlFor="tp-store-id">Store ID</Label>
                                            <Input
                                                id="tp-store-id"
                                                type="text"
                                                placeholder="e.g. 4f2b9c10-…"
                                                value={credentials.store_id}
                                                onChange={e => setCredentials(prev => ({ ...prev, store_id: e.target.value }))}
                                                onKeyDown={e => e.key === 'Enter' && handleSave()}
                                                className="mt-1"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                Find this in your {activePlatform.name} partner portal.
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 bg-gray-50 border rounded-lg p-2">
                                        MealDrop never asks for your {activePlatform.name} password. You approve the
                                        connection on {activePlatform.name}&rsquo;s own site, and you can revoke it there
                                        at any time.
                                    </p>
                                </div>
                            </AlertDialogDescription>
                            <div className="flex gap-3 mt-4">
                                <AlertDialogCancel className="flex-1">Cancel</AlertDialogCancel>
                                <Button
                                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                                    onClick={handleSave}
                                    disabled={saving}
                                >
                                    {saving ? 'Connecting...' : 'Connect'}
                                </Button>
                            </div>
                        </>
                    )}
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Confirm */}
            <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogTitle>Disconnect {PLATFORMS.find(p => p.id === showDeleteConfirm)?.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will stop pulling orders from {PLATFORMS.find(p => p.id === showDeleteConfirm)?.name}. You can reconnect anytime.
                    </AlertDialogDescription>
                    <div className="flex gap-3 mt-2">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleDelete(showDeleteConfirm)}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Disconnect
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}