import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AlertCircle, Check, X, Settings, RefreshCw, LogIn, Eye, EyeOff, Copy } from 'lucide-react';
import { toast } from 'sonner';

const PLATFORMS = [
    {
        id: 'uber_eats',
        name: 'Uber Eats',
        icon: '🚗',
        color: 'bg-black',
        loginUrl: 'https://restaurant.uber.com',
        helpText: 'Use your Uber Eats Restaurant Manager email and password.',
    },
    {
        id: 'deliveroo',
        name: 'Deliveroo',
        icon: '🚲',
        color: 'bg-teal-600',
        loginUrl: 'https://restaurant-hub.deliveroo.com',
        helpText: 'Use your Deliveroo Restaurant Hub email and password.',
    },
    {
        id: 'just_eat',
        name: 'Just Eat',
        icon: '🍽️',
        color: 'bg-orange-500',
        loginUrl: 'https://partner.just-eat.co.uk',
        helpText: 'Use your Just Eat Partner Centre email and password.',
    },
];

export default function ThirdPartyIntegrations({ restaurantId }) {
    const [editingPlatform, setEditingPlatform] = useState(null);
    const [credentials, setCredentials] = useState({ email: '', password: '', store_id: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
    const [syncing, setSyncing] = useState(false);

    const WEBHOOK_URL = `${window.location.origin}/api/v1/functions/uberEatsWebhook`;

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
        setCredentials({ email: '', password: '', store_id: '' });
        setShowPassword(false);
        setEditingPlatform(platformId);
    };

    const handleSave = async () => {
        if (!credentials.email || !credentials.password) {
            toast.error('Please enter your email and password');
            return;
        }
        setSaving(true);
        try {
            await base44.functions.invoke('saveThirdPartyIntegration', {
                restaurantId,
                platform: editingPlatform,
                email: credentials.email,
                password: credentials.password,
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

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-700">
                        Connect your Uber Eats account via webhook. Orders placed on Uber Eats will automatically appear in your MealDrop queue in real-time.
                    </p>
                </div>
                <div className="bg-white border border-blue-200 rounded p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1">📌 Uber Eats Webhook URL (paste this in your Uber Eats developer portal):</p>
                    <div className="flex items-center gap-2">
                        <code className="text-xs bg-gray-100 rounded px-2 py-1 flex-1 truncate">{WEBHOOK_URL}</code>
                        <button
                            onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); }}
                            className="text-blue-600 hover:text-blue-800"
                            title="Copy"
                        >
                            <Copy className="h-4 w-4" />
                        </button>
                    </div>
                </div>
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
                                            Logged in as: <span className="font-medium text-gray-700">{saved.email}</span>
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
                                            <Label htmlFor="tp-email">Email Address</Label>
                                            <Input
                                                id="tp-email"
                                                type="email"
                                                placeholder="restaurant@email.com"
                                                value={credentials.email}
                                                onChange={e => setCredentials(prev => ({ ...prev, email: e.target.value }))}
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="tp-password">Password</Label>
                                            <div className="relative mt-1">
                                                <Input
                                                    id="tp-password"
                                                    type={showPassword ? 'text' : 'password'}
                                                    placeholder="••••••••"
                                                    value={credentials.password}
                                                    onChange={e => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                                                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                                                    className="pr-10"
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                    onClick={() => setShowPassword(v => !v)}
                                                >
                                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400">
                                        Your credentials are stored securely and only used to sync orders on your behalf.{' '}
                                        <a href={activePlatform.loginUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-500">
                                            Forgot password?
                                        </a>
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