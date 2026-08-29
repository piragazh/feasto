import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Save, Info, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const PROVIDERS = [
    { value: 'stripe_terminal', label: 'Stripe Terminal' },
    { value: 'sumup', label: 'SumUp' },
    { value: 'square', label: 'Square' },
    { value: 'izettle', label: 'iZettle / PayPal Zettle' },
    { value: 'worldpay', label: 'Worldpay' },
    { value: 'verifone', label: 'Verifone' },
    { value: 'ingenico', label: 'Ingenico' },
    { value: 'other', label: 'Other' },
];

export default function POSCardTerminalSettings({ restaurantId }) {
    const queryClient = useQueryClient();

    const { data: restaurant, isLoading } = useQuery({
        queryKey: ['restaurant-pos-card-terminal', restaurantId],
        queryFn: async () => {
            const [r] = await base44.entities.Restaurant.filter({ id: restaurantId });
            return r;
        },
    });

    const [terminal, setTerminal] = useState({
        provider: 'stripe_terminal',
        reader_label: '',
        reader_id: '',
        location_id: '',
        connection_type: 'wifi',
        test_mode: true,
    });

    useEffect(() => {
        if (restaurant?.printer_config?.card_terminal) {
            setTerminal({ ...terminal, ...restaurant.printer_config.card_terminal });
        }
    }, [restaurant]);

    const mutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-pos-card-terminal', restaurantId]);
            toast.success('Card terminal settings saved');
        },
        onError: () => toast.error('Failed to save settings'),
    });

    const handleSave = () => {
        mutation.mutate({
            printer_config: {
                ...restaurant?.printer_config,
                card_terminal: terminal,
            }
        });
    };

    if (isLoading) return <div className="text-center py-8 text-gray-500">Loading...</div>;

    const saved = restaurant?.printer_config?.card_terminal;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Card Terminal Configuration
                </CardTitle>
                <CardDescription>
                    Configure the card payment terminal used at the POS (e.g., Stripe Terminal, SumUp, Square)
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
                    <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-800">
                        Enter your card terminal details so staff know which reader to activate for card payments at the POS.
                    </p>
                </div>

                {saved?.reader_label && (
                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <div>
                            <p className="font-medium text-green-800">Configured: {saved.reader_label}</p>
                            <p className="text-xs text-green-600 flex items-center gap-2">
                                {saved.provider} · {saved.connection_type || 'WiFi'} ·{' '}
                                {saved.test_mode
                                    ? <Badge variant="outline" className="text-yellow-600 border-yellow-400 text-[10px] py-0">Test Mode</Badge>
                                    : <Badge variant="outline" className="text-green-600 border-green-400 text-[10px] py-0">Live</Badge>
                                }
                            </p>
                        </div>
                    </div>
                )}

                <div>
                    <Label>Terminal Provider</Label>
                    <select
                        value={terminal.provider}
                        onChange={(e) => setTerminal({ ...terminal, provider: e.target.value })}
                        className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                    >
                        {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <Label>Terminal / Reader Label</Label>
                        <Input
                            placeholder="e.g., POS Terminal 1"
                            value={terminal.reader_label}
                            onChange={(e) => setTerminal({ ...terminal, reader_label: e.target.value })}
                            className="mt-1"
                        />
                        <p className="text-xs text-gray-500 mt-1">Friendly name shown to staff</p>
                    </div>
                    <div>
                        <Label>Reader ID / Serial Number</Label>
                        <Input
                            placeholder="e.g., tmr_xxxxx or serial number"
                            value={terminal.reader_id}
                            onChange={(e) => setTerminal({ ...terminal, reader_id: e.target.value })}
                            className="mt-1"
                        />
                        <p className="text-xs text-gray-500 mt-1">Device ID from your provider's dashboard</p>
                    </div>
                </div>

                {terminal.provider === 'stripe_terminal' && (
                    <div>
                        <Label>Stripe Location ID</Label>
                        <Input
                            placeholder="e.g., tml_xxxxx"
                            value={terminal.location_id}
                            onChange={(e) => setTerminal({ ...terminal, location_id: e.target.value })}
                            className="mt-1"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Found in your Stripe Dashboard → Terminal → Locations
                        </p>
                    </div>
                )}

                <div>
                    <Label>Connection Method</Label>
                    <select
                        value={terminal.connection_type}
                        onChange={(e) => setTerminal({ ...terminal, connection_type: e.target.value })}
                        className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                    >
                        <option value="wifi">WiFi / LAN</option>
                        <option value="bluetooth">Bluetooth</option>
                        <option value="usb">USB</option>
                        <option value="manual">Manual (staff-operated)</option>
                    </select>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                        <p className="font-medium">Test Mode</p>
                        <p className="text-sm text-gray-500">Use test/sandbox credentials (no real charges)</p>
                    </div>
                    <Switch
                        checked={terminal.test_mode !== false}
                        onCheckedChange={(v) => setTerminal({ ...terminal, test_mode: v })}
                    />
                </div>

                {terminal.test_mode && (
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                        <p className="text-sm text-yellow-800">
                            Test mode is <strong>ON</strong> — no real payments will be processed. Disable before going live.
                        </p>
                    </div>
                )}

                <Button onClick={handleSave} disabled={mutation.isPending} className="w-full">
                    <Save className="h-4 w-4 mr-2" />
                    Save Card Terminal Settings
                </Button>
            </CardContent>
        </Card>
    );
}