import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Printer, CreditCard, Save, TabletSmartphone, CheckCircle,
    AlertCircle, Settings, ExternalLink, Info, ShieldCheck, Circle
} from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import BluetoothPrinterManager from '@/components/restaurant/BluetoothPrinterManager';

export default function KioskSettings({ restaurantId }) {
    const queryClient = useQueryClient();

    const { data: restaurant, isLoading } = useQuery({
        queryKey: ['restaurant-kiosk-settings', restaurantId],
        queryFn: async () => {
            const [r] = await base44.entities.Restaurant.filter({ id: restaurantId });
            return r;
        },
    });

    const [cardTerminal, setCardTerminal] = useState(null);
    const [kioskConfig, setKioskConfig] = useState(null);

    // Populate state from restaurant once loaded
    React.useEffect(() => {
        if (restaurant) {
            setCardTerminal(restaurant.kiosk_config?.card_terminal || {
                provider: 'stripe_terminal',
                location_id: '',
                reader_id: '',
                reader_label: '',
                test_mode: true,
            });
            setKioskConfig(restaurant.kiosk_config || {
                auto_print_receipt: false,
                show_allergens: false,
                idle_timeout_seconds: 120,
                payment_card_enabled: true,
                payment_counter_enabled: true,
            });
        }
    }, [restaurant]);

    const updateMutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-kiosk-settings', restaurantId]);
            toast.success('Kiosk settings saved');
        },
        onError: () => toast.error('Failed to save settings'),
    });

    const handleSaveCardTerminal = () => {
        updateMutation.mutate({
            kiosk_config: {
                ...kioskConfig,
                card_terminal: cardTerminal,
            }
        });
    };

    const handleSaveGeneral = () => {
        // Validation: block save if both payment methods are disabled
        if (!kioskConfig.payment_card_enabled && kioskConfig.payment_counter_enabled === false) {
            toast.error('At least one payment method must be enabled before saving.');
            return;
        }
        updateMutation.mutate({
            kiosk_config: {
                ...kioskConfig,
                card_terminal: cardTerminal,
            }
        });
    };

    const handlePrinterSelect = (printer) => {
        updateMutation.mutate({
            kiosk_config: {
                ...kioskConfig,
                card_terminal: cardTerminal,
                kiosk_printer: printer,
            }
        });
    };

    if (isLoading || !kioskConfig || !cardTerminal) {
        return <div className="text-center py-12 text-gray-500">Loading kiosk settings...</div>;
    }

    const kioskUrl = `${window.location.origin}${createPageUrl('KioskDashboard')}?restaurant_id=${restaurantId}`;

    return (
        <div className="space-y-6">
            {/* Kiosk Access */}
            <Card className="border-orange-200 bg-orange-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-800">
                        <TabletSmartphone className="h-5 w-5" />
                        Self-Order Kiosk
                    </CardTitle>
                    <CardDescription className="text-orange-700">
                        Your kiosk URL — open this on a tablet or touchscreen in-store
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex gap-2 items-center">
                        <Input
                            value={kioskUrl}
                            readOnly
                            className="bg-white font-mono text-sm"
                        />
                        <Button
                            variant="outline"
                            onClick={() => {
                                navigator.clipboard.writeText(kioskUrl);
                                toast.success('Kiosk URL copied!');
                            }}
                        >
                            Copy
                        </Button>
                        <Button
                            onClick={() => window.open(kioskUrl, '_blank')}
                            className="bg-orange-500 hover:bg-orange-600 whitespace-nowrap"
                        >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open Kiosk
                        </Button>
                    </div>
                    <p className="text-xs text-orange-700">
                        Tip: Use Chrome or Edge on a tablet in fullscreen mode for the best kiosk experience.
                    </p>
                </CardContent>
            </Card>

            {/* General Kiosk Config */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        General Kiosk Settings
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Payment Methods */}
                    <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-700">Kiosk Payment Methods</p>

                        {/* Pay by Card */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                                <p className="font-medium">Pay by Card</p>
                                <p className="text-sm text-gray-500">Customers pay using a card reader at the kiosk</p>
                            </div>
                            <Switch
                                checked={kioskConfig.payment_card_enabled === true}
                                onCheckedChange={(v) => setKioskConfig({ ...kioskConfig, payment_card_enabled: v })}
                            />
                        </div>

                        {/* Warning A: card enabled, no reader configured */}
                        {kioskConfig.payment_card_enabled && !cardTerminal?.reader_id && (
                            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-yellow-800">
                                    <strong>Card payment is enabled, but no card reader is configured.</strong> Customers will not be able to pay by card until a Reader ID is saved below.
                                </p>
                            </div>
                        )}

                        {/* Warning C: card enabled, terminal flagged unavailable */}
                        {kioskConfig.payment_card_enabled && cardTerminal?.reader_id && kioskConfig.terminal_unavailable && (
                            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-yellow-800">
                                    <strong>Card reader is currently marked as unavailable.</strong> The kiosk will fall back to Pay at Counter if it is enabled.
                                </p>
                            </div>
                        )}

                        {/* Pay at Counter */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                                <p className="font-medium">Pay at Counter</p>
                                <p className="text-sm text-gray-500">Customers place an order at the kiosk and pay staff at the counter</p>
                            </div>
                            <Switch
                                checked={kioskConfig.payment_counter_enabled !== false}
                                onCheckedChange={(v) => setKioskConfig({ ...kioskConfig, payment_counter_enabled: v })}
                            />
                        </div>

                        {/* Info D: counter is the only active method */}
                        {!kioskConfig.payment_card_enabled && kioskConfig.payment_counter_enabled !== false && (
                            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-blue-800">
                                    Customers will place orders at the kiosk and pay at the counter.
                                </p>
                            </div>
                        )}

                        {/* Warning B: both disabled */}
                        {!kioskConfig.payment_card_enabled && kioskConfig.payment_counter_enabled === false && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-red-800">
                                    <strong>At least one kiosk payment method should be enabled.</strong> Customers will be blocked at checkout until this is fixed.
                                </p>
                            </div>
                        )}

                        {/* Runtime unavailable toggle — staff-facing, separate from customer-facing config */}
                        {kioskConfig.payment_card_enabled && cardTerminal?.reader_id && (
                            <div className="flex items-center justify-between p-3 border border-dashed rounded-lg bg-gray-50">
                                <div>
                                    <p className="font-medium text-sm">Mark Card Reader as Unavailable</p>
                                    <p className="text-xs text-gray-500">Use this if the reader is offline or broken — hides card payment from customers without changing your config</p>
                                </div>
                                <Switch
                                    checked={kioskConfig.terminal_unavailable === true}
                                    onCheckedChange={(v) => setKioskConfig({ ...kioskConfig, terminal_unavailable: v })}
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                            <p className="font-medium">Auto-Print Receipt</p>
                            <p className="text-sm text-gray-500">Automatically print receipt when order is placed</p>
                        </div>
                        <Switch
                            checked={kioskConfig.auto_print_receipt === true}
                            onCheckedChange={(v) => setKioskConfig({ ...kioskConfig, auto_print_receipt: v })}
                        />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                            <p className="font-medium">Show Allergen Info</p>
                            <p className="text-sm text-gray-500">Display allergen labels on menu items</p>
                        </div>
                        <Switch
                            checked={kioskConfig.show_allergens === true}
                            onCheckedChange={(v) => setKioskConfig({ ...kioskConfig, show_allergens: v })}
                        />
                    </div>
                    <div>
                        <Label>Admin PIN</Label>
                        <Input
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="4-digit PIN (default: 0000)"
                            value={kioskConfig.admin_pin || ''}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                setKioskConfig({ ...kioskConfig, admin_pin: val });
                            }}
                            className="max-w-xs mt-1 font-mono tracking-widest"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            4-digit PIN for kiosk staff access. Set a unique PIN before going live.
                        </p>
                    </div>
                    <div>
                        <Label>Inactivity Timeout (seconds)</Label>
                        <Input
                            type="number"
                            min={30}
                            max={600}
                            value={kioskConfig.idle_timeout_seconds || 120}
                            onChange={(e) => setKioskConfig({ ...kioskConfig, idle_timeout_seconds: parseInt(e.target.value) || 120 })}
                            className="max-w-xs mt-1"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Kiosk returns to welcome screen after this many seconds of inactivity (30–600)
                        </p>
                    </div>
                    <Button onClick={handleSaveGeneral} disabled={updateMutation.isPending} className="w-full">
                        <Save className="h-4 w-4 mr-2" />
                        Save General Settings
                    </Button>
                </CardContent>
            </Card>

            {/* Hardware Readiness */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        Hardware Readiness
                    </CardTitle>
                    <CardDescription>
                        Quick status overview — check this before opening the kiosk to customers
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {/* Card Reader */}
                    {(() => {
                        const readerId = restaurant?.kiosk_config?.card_terminal?.reader_id;
                        const unavailable = restaurant?.kiosk_config?.terminal_unavailable;
                        const label = restaurant?.kiosk_config?.card_terminal?.reader_label;
                        if (!readerId) return (
                            <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                                <Circle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-gray-600">Card Reader</p>
                                    <p className="text-xs text-gray-400">Not configured — add a Reader ID below to enable card payments</p>
                                </div>
                            </div>
                        );
                        if (unavailable) return (
                            <div className="flex items-center gap-3 p-3 rounded-lg border border-yellow-200 bg-yellow-50">
                                <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-yellow-800">Card Reader — Unavailable</p>
                                    <p className="text-xs text-yellow-600">{label || readerId} · Marked offline. Card payment hidden from customers.</p>
                                </div>
                            </div>
                        );
                        return (
                            <div className="flex items-center gap-3 p-3 rounded-lg border border-green-200 bg-green-50">
                                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-green-800">Card Reader — Configured</p>
                                    <p className="text-xs text-green-600">
                                        {label || readerId} · {restaurant?.kiosk_config?.card_terminal?.provider}
                                        {restaurant?.kiosk_config?.card_terminal?.test_mode ? ' · Test Mode' : ' · Live'}
                                    </p>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Printer */}
                    {restaurant?.kiosk_config?.kiosk_printer?.name ? (
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-green-200 bg-green-50">
                            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-green-800">Receipt Printer — Configured</p>
                                <p className="text-xs text-green-600">{restaurant.kiosk_config.kiosk_printer.name}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                            <Circle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-gray-600">Receipt Printer</p>
                                <p className="text-xs text-gray-400">Not configured — orders will be confirmed on screen only</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Kiosk Printer */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Printer className="h-5 w-5" />
                        Kiosk Receipt Printer
                    </CardTitle>
                    <CardDescription>
                        Connect a separate Bluetooth printer dedicated to the kiosk. This is independent of the POS printer.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {restaurant?.kiosk_config?.kiosk_printer?.name && (
                        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-green-800">Connected: {restaurant.kiosk_config.kiosk_printer.name}</p>
                                <p className="text-xs text-green-600">Kiosk printer is configured</p>
                            </div>
                        </div>
                    )}
                    <BluetoothPrinterManager
                        selectedPrinter={restaurant?.kiosk_config?.kiosk_printer}
                        onPrinterSelect={handlePrinterSelect}
                        restaurantId={restaurantId}
                    />
                </CardContent>
            </Card>

            {/* Card Terminal */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Card Terminal Configuration
                    </CardTitle>
                    <CardDescription>
                        Configure the card payment terminal attached to the kiosk (e.g., Stripe Terminal, SumUp, Square)
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
                        <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-blue-800">
                            The kiosk shows a "Please pay at the card terminal" screen when card is selected.
                            Enter your terminal details below so staff can identify which reader to activate.
                        </p>
                    </div>

                    <div>
                        <Label>Terminal Provider</Label>
                        <select
                            value={cardTerminal.provider || 'stripe_terminal'}
                            onChange={(e) => setCardTerminal({ ...cardTerminal, provider: e.target.value })}
                            className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                        >
                            <option value="stripe_terminal">Stripe Terminal</option>
                            <option value="sumup">SumUp</option>
                            <option value="square">Square</option>
                            <option value="izettle">iZettle / PayPal Zettle</option>
                            <option value="worldpay">Worldpay</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <Label>Terminal / Reader Label</Label>
                            <Input
                                placeholder="e.g., Kiosk Terminal 1"
                                value={cardTerminal.reader_label || ''}
                                onChange={(e) => setCardTerminal({ ...cardTerminal, reader_label: e.target.value })}
                                className="mt-1"
                            />
                            <p className="text-xs text-gray-500 mt-1">Friendly name shown to staff</p>
                        </div>
                        <div>
                            <Label>Reader ID / Serial Number</Label>
                            <Input
                                placeholder="e.g., tmr_xxxxx or serial number"
                                value={cardTerminal.reader_id || ''}
                                onChange={(e) => setCardTerminal({ ...cardTerminal, reader_id: e.target.value })}
                                className="mt-1"
                            />
                            <p className="text-xs text-gray-500 mt-1">Device ID from your provider's dashboard</p>
                        </div>
                    </div>

                    {cardTerminal.provider === 'stripe_terminal' && (
                        <div>
                            <Label>Stripe Location ID</Label>
                            <Input
                                placeholder="e.g., tml_xxxxx"
                                value={cardTerminal.location_id || ''}
                                onChange={(e) => setCardTerminal({ ...cardTerminal, location_id: e.target.value })}
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
                            value={cardTerminal.connection_type || 'wifi'}
                            onChange={(e) => setCardTerminal({ ...cardTerminal, connection_type: e.target.value })}
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
                            checked={cardTerminal.test_mode !== false}
                            onCheckedChange={(v) => setCardTerminal({ ...cardTerminal, test_mode: v })}
                        />
                    </div>

                    {cardTerminal.test_mode && (
                        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                            <p className="text-sm text-yellow-800">
                                Test mode is <strong>ON</strong> — no real payments will be processed. Disable before going live.
                            </p>
                        </div>
                    )}

                    {/* Terminal status */}
                    {restaurant?.kiosk_config?.card_terminal?.reader_id ? (
                        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-green-800">
                                    Terminal configured: {restaurant.kiosk_config.card_terminal.reader_label || restaurant.kiosk_config.card_terminal.reader_id}
                                </p>
                                <p className="text-xs text-green-600">
                                    {restaurant.kiosk_config.card_terminal.provider} ·{' '}
                                    {restaurant.kiosk_config.card_terminal.connection_type || 'WiFi'} ·{' '}
                                    {restaurant.kiosk_config.card_terminal.test_mode ? (
                                        <Badge variant="outline" className="text-yellow-600 border-yellow-400 text-[10px] py-0">Test Mode</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-green-600 border-green-400 text-[10px] py-0">Live</Badge>
                                    )}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <AlertCircle className="h-5 w-5 text-gray-400 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-gray-600">No terminal configured</p>
                                <p className="text-xs text-gray-500">Fill in the Reader ID above and save to enable card payments on the kiosk.</p>
                            </div>
                        </div>
                    )}

                    <Button onClick={handleSaveCardTerminal} disabled={updateMutation.isPending} className="w-full">
                        <Save className="h-4 w-4 mr-2" />
                        Save Card Terminal Settings
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}