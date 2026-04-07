import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Clock, Car, Wrench, Zap, Save, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

const REASONS = [
    {
        value: 'temporary_closed',
        label: 'Temporarily Closed',
        description: 'General closure — not open right now',
        icon: Clock,
        color: 'border-red-200 bg-red-50 text-red-700'
    },
    {
        value: 'no_drivers',
        label: 'No Drivers Available',
        description: 'Delivery paused — no drivers on shift',
        icon: Car,
        color: 'border-amber-200 bg-amber-50 text-amber-700'
    },
    {
        value: 'technical_fault',
        label: 'Technical Fault',
        description: 'System or kitchen equipment issue',
        icon: Wrench,
        color: 'border-orange-200 bg-orange-50 text-orange-700'
    },
    {
        value: 'extremely_busy',
        label: 'Extremely Busy',
        description: 'Pausing new orders to maintain quality',
        icon: Zap,
        color: 'border-yellow-200 bg-yellow-50 text-yellow-700'
    },
    {
        value: 'custom',
        label: 'Custom Message',
        description: 'Write your own reason for customers',
        icon: AlertTriangle,
        color: 'border-gray-200 bg-gray-50 text-gray-700'
    }
];

export default function TemporaryClosureSettings({ restaurantId }) {
    const queryClient = useQueryClient();

    const { data: restaurant, isLoading } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
    });

    const [enabled, setEnabled] = useState(false);
    const [reason, setReason] = useState('temporary_closed');
    const [customMessage, setCustomMessage] = useState('');

    useEffect(() => {
        if (restaurant?.temporary_closure) {
            setEnabled(restaurant.temporary_closure.enabled || false);
            setReason(restaurant.temporary_closure.reason || 'temporary_closed');
            setCustomMessage(restaurant.temporary_closure.custom_message || '');
        }
    }, [restaurant]);

    const saveMutation = useMutation({
        mutationFn: async (data) => {
            await base44.entities.Restaurant.update(restaurantId, {
                temporary_closure: data
            });
        },
        onSuccess: (_, data) => {
            queryClient.invalidateQueries(['restaurant', restaurantId]);
            if (data.enabled) {
                toast.success('Restaurant paused — customers will see the closure notice');
            } else {
                toast.success('Restaurant is now accepting orders again');
            }
        },
        onError: () => {
            toast.error('Failed to update closure status');
        }
    });

    const handleSave = () => {
        saveMutation.mutate({
            enabled,
            reason,
            custom_message: customMessage
        });
    };

    // Quick toggle — save immediately
    const handleToggle = (checked) => {
        setEnabled(checked);
        saveMutation.mutate({
            enabled: checked,
            reason,
            custom_message: customMessage
        });
    };

    if (isLoading) return <div className="text-center py-8 text-gray-500">Loading...</div>;

    const isCurrentlyClosed = enabled;

    return (
        <Card className={isCurrentlyClosed ? 'border-red-300 shadow-md' : ''}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldOff className="h-5 w-5 text-red-500" />
                    Temporary Order Pause
                </CardTitle>
                <p className="text-sm text-gray-500">
                    Instantly stop accepting orders without changing your opening hours. Customers will see a clear notice when they visit your page.
                </p>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Main Toggle */}
                <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-colors ${
                    enabled
                        ? 'bg-red-50 border-red-300'
                        : 'bg-green-50 border-green-200'
                }`}>
                    <div>
                        <p className={`font-bold text-base ${enabled ? 'text-red-700' : 'text-green-700'}`}>
                            {enabled ? '🔴 Orders Paused' : '🟢 Accepting Orders'}
                        </p>
                        <p className="text-sm text-gray-600 mt-0.5">
                            {enabled
                                ? 'Customers cannot add to cart or checkout'
                                : 'Restaurant is live and accepting orders normally'}
                        </p>
                    </div>
                    <Switch
                        checked={enabled}
                        onCheckedChange={handleToggle}
                        disabled={saveMutation.isPending}
                    />
                </div>

                {/* Reason Selection */}
                <div className="space-y-2">
                    <Label className="font-semibold">Reason (shown to customers)</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {REASONS.map((r) => {
                            const Icon = r.icon;
                            const selected = reason === r.value;
                            return (
                                <button
                                    key={r.value}
                                    type="button"
                                    onClick={() => setReason(r.value)}
                                    className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                                        selected
                                            ? `${r.color} border-current shadow-sm`
                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                    }`}
                                >
                                    <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${selected ? '' : 'text-gray-400'}`} />
                                    <div>
                                        <p className={`text-sm font-semibold ${selected ? '' : 'text-gray-700'}`}>{r.label}</p>
                                        <p className={`text-xs mt-0.5 ${selected ? 'opacity-75' : 'text-gray-500'}`}>{r.description}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Custom Message */}
                <div className="space-y-2">
                    <Label className="font-semibold">
                        Custom Message <span className="font-normal text-gray-500">(optional)</span>
                    </Label>
                    <Textarea
                        placeholder="e.g., We'll be back at 6pm tonight. Sorry for the inconvenience!"
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        rows={3}
                        maxLength={300}
                    />
                    <p className="text-xs text-gray-400">{customMessage.length}/300 — overrides the default message if filled in</p>
                </div>

                <Button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="w-full"
                >
                    <Save className="h-4 w-4 mr-2" />
                    {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
                </Button>
            </CardContent>
        </Card>
    );
}