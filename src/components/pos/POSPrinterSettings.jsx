import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Printer, Bluetooth, Usb, Wifi, Save, CheckCircle2,
    AlertCircle, Info, RefreshCw, Circle, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import BluetoothPrinterManager from '@/components/restaurant/BluetoothPrinterManager';
import { printerManager } from '@/components/restaurant/PrinterService';

// ── Per-printer status badge ───────────────────────────────────────────────
function PrinterStatusBadge({ service, label }) {
    const [status, setStatus] = useState(() => service.getConnectionStatus());

    useEffect(() => {
        service.setConnectionStatusCallback((connected) => {
            setStatus(service.getConnectionStatus());
        });
        // Initial check
        setStatus(service.getConnectionStatus());
        // Kick off heartbeat
        service.startHeartbeat(6000);
        return () => {
            service.stopHeartbeat();
            service.setConnectionStatusCallback(null);
        };
    }, [service]);

    const { connected, reconnecting, printerName } = status;

    if (reconnecting) return (
        <Badge className="bg-amber-100 text-amber-700 gap-1.5">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Reconnecting…
        </Badge>
    );
    if (connected) return (
        <Badge className="bg-green-100 text-green-700 gap-1.5">
            <CheckCircle2 className="h-3 w-3" />
            {printerName || label} — Connected
        </Badge>
    );
    return (
        <Badge className="bg-gray-100 text-gray-500 gap-1.5">
            <Circle className="h-3 w-3" />
            {label} — Not Connected
        </Badge>
    );
}

// ── Single printer slot card ───────────────────────────────────────────────
function PrinterSlot({ label, accent, service, config, onConfigChange, onSave, saving, restaurantId }) {
    const currentType = config.printer_type || 'bluetooth';

    return (
        <div className={`border-2 ${accent} rounded-xl p-5 space-y-4`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Printer className="h-5 w-5 text-gray-600" />
                    <span className="font-semibold text-gray-800">{label}</span>
                </div>
                <PrinterStatusBadge service={service} label={label} />
            </div>

            {/* Connection type */}
            <div>
                <Label className="mb-2 block text-xs text-gray-500 uppercase tracking-wide">Connection Type</Label>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { value: 'bluetooth', label: 'Bluetooth', icon: Bluetooth },
                        { value: 'usb', label: 'USB', icon: Usb },
                        { value: 'network', label: 'Network', icon: Wifi },
                    ].map(({ value, label: lbl, icon: Icon }) => (
                        <button
                            key={value}
                            onClick={() => onConfigChange({ printer_type: value })}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-xs font-medium transition-all ${
                                currentType === value
                                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                                    : 'border-gray-200 hover:border-gray-300 text-gray-500'
                            }`}
                        >
                            <Icon className="h-5 w-5" />
                            {lbl}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bluetooth */}
            {currentType === 'bluetooth' && (
                <BluetoothPrinterManager
                    selectedPrinter={config.bluetooth_printer}
                    onPrinterSelect={(printer) => {
                        onConfigChange({ bluetooth_printer: printer, printer_type: 'bluetooth' });
                        onSave({ bluetooth_printer: printer, printer_type: 'bluetooth' });
                    }}
                    restaurantId={restaurantId}
                    printerService={service}
                />
            )}

            {/* USB */}
            {currentType === 'usb' && (
                <div className="space-y-3">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>Enter Vendor ID and Product ID from Device Manager or printer specs.</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs">Vendor ID (hex)</Label>
                            <Input placeholder="e.g. 0x04b8" value={config.usb_vendor_id || ''} onChange={e => onConfigChange({ usb_vendor_id: e.target.value })} className="mt-1 font-mono text-sm" />
                        </div>
                        <div>
                            <Label className="text-xs">Product ID (hex)</Label>
                            <Input placeholder="e.g. 0x0202" value={config.usb_product_id || ''} onChange={e => onConfigChange({ usb_product_id: e.target.value })} className="mt-1 font-mono text-sm" />
                        </div>
                    </div>
                </div>
            )}

            {/* Network */}
            {currentType === 'network' && (
                <div className="space-y-3">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>Printer must be on the same WiFi/LAN. Default port is 9100.</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <Label className="text-xs">IP Address</Label>
                            <Input placeholder="192.168.1.100" value={config.network_ip || ''} onChange={e => onConfigChange({ network_ip: e.target.value })} className="mt-1 font-mono text-sm" />
                        </div>
                        <div>
                            <Label className="text-xs">Port</Label>
                            <Input placeholder="9100" value={config.network_port || '9100'} onChange={e => onConfigChange({ network_port: e.target.value })} className="mt-1 font-mono text-sm" />
                        </div>
                    </div>
                </div>
            )}

            <Button onClick={() => onSave()} disabled={saving} size="sm" variant="outline" className="w-full">
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save {label}
            </Button>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────
export default function POSPrinterSettings({ restaurantId }) {
    const queryClient = useQueryClient();

    const { data: restaurant, isLoading } = useQuery({
        queryKey: ['restaurant-pos-printer', restaurantId],
        queryFn: async () => {
            const [r] = await base44.entities.Restaurant.filter({ id: restaurantId });
            return r;
        },
    });

    const defaultConfig = {
        printer_type: 'bluetooth',
        printer_width: '80mm',
        font_size: 'medium',
        template: 'standard',
        header_text: '',
        footer_text: '',
        show_logo: true,
        show_order_number: true,
        show_customer_details: true,
        auto_print: false,
        command_set: 'esc_pos',
        network_ip: '',
        network_port: '9100',
        usb_vendor_id: '',
        usb_product_id: '',
    };

    const [printerAConfig, setPrinterAConfig] = useState(defaultConfig);
    const [printerBConfig, setPrinterBConfig] = useState({ ...defaultConfig });
    const [sharedConfig, setSharedConfig] = useState({
        printer_width: '80mm', font_size: 'medium', template: 'standard',
        header_text: '', footer_text: '',
        show_logo: true, show_order_number: true, show_customer_details: true,
        auto_print: false, command_set: 'esc_pos',
    });

    useEffect(() => {
        if (restaurant?.printer_config) {
            const c = restaurant.printer_config;
            setPrinterAConfig(prev => ({ ...prev, ...c }));
            if (c.printer_b_config) setPrinterBConfig(prev => ({ ...prev, ...c.printer_b_config }));
            setSharedConfig(prev => ({
                ...prev,
                printer_width: c.printer_width || '80mm',
                font_size: c.font_size || 'medium',
                template: c.template || 'standard',
                header_text: c.header_text || '',
                footer_text: c.footer_text || '',
                show_logo: c.show_logo !== false,
                show_order_number: c.show_order_number !== false,
                show_customer_details: c.show_customer_details !== false,
                auto_print: c.auto_print || false,
                command_set: c.command_set || 'esc_pos',
            }));
        }
    }, [restaurant]);

    const mutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-pos-printer', restaurantId]);
            toast.success('Printer settings saved');
        },
        onError: () => toast.error('Failed to save settings'),
    });

    const saveAll = () => {
        const mergedConfig = {
            ...printerAConfig,
            ...sharedConfig,
            printer_b_config: { ...printerBConfig, ...sharedConfig },
        };
        mutation.mutate({ printer_config: mergedConfig });
    };

    const savePrinterA = (overrides = {}) => {
        const mergedConfig = {
            ...printerAConfig,
            ...sharedConfig,
            ...overrides,
            printer_b_config: { ...printerBConfig, ...sharedConfig },
        };
        if (overrides && Object.keys(overrides).length) setPrinterAConfig(p => ({ ...p, ...overrides }));
        mutation.mutate({ printer_config: mergedConfig });
    };

    const savePrinterB = (overrides = {}) => {
        const bConfig = { ...printerBConfig, ...sharedConfig, ...overrides };
        if (overrides && Object.keys(overrides).length) setPrinterBConfig(p => ({ ...p, ...overrides }));
        const mergedConfig = {
            ...printerAConfig,
            ...sharedConfig,
            printer_b_config: bConfig,
        };
        mutation.mutate({ printer_config: mergedConfig });
    };

    if (isLoading) return <div className="text-center py-8 text-gray-400">Loading printer settings...</div>;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Printer className="h-5 w-5" />
                    Receipt Printer
                </CardTitle>
                <CardDescription>
                    Configure up to two printers (e.g. kitchen + counter). Both share receipt layout settings.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Dual printer slots */}
                <div className="grid md:grid-cols-2 gap-4">
                    <PrinterSlot
                        label="Printer A (Primary)"
                        accent="border-orange-200"
                        service={printerManager.printerA}
                        config={printerAConfig}
                        onConfigChange={(changes) => setPrinterAConfig(p => ({ ...p, ...changes }))}
                        onSave={savePrinterA}
                        saving={mutation.isPending}
                        restaurantId={restaurantId}
                    />
                    <PrinterSlot
                        label="Printer B (Secondary)"
                        accent="border-blue-200"
                        service={printerManager.printerB}
                        config={printerBConfig}
                        onConfigChange={(changes) => setPrinterBConfig(p => ({ ...p, ...changes }))}
                        onSave={savePrinterB}
                        saving={mutation.isPending}
                        restaurantId={restaurantId}
                    />
                </div>

                {/* Shared receipt settings */}
                <div className="border-t pt-5 space-y-4">
                    <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-orange-500" />
                        Shared Receipt Settings
                    </h4>

                    <div className="grid md:grid-cols-3 gap-4">
                        <div>
                            <Label>Paper Width</Label>
                            <select
                                value={sharedConfig.printer_width}
                                onChange={e => setSharedConfig(p => ({ ...p, printer_width: e.target.value }))}
                                className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                            >
                                <option value="58mm">58mm (narrow)</option>
                                <option value="80mm">80mm (standard)</option>
                            </select>
                        </div>
                        <div>
                            <Label>Command Set</Label>
                            <select
                                value={sharedConfig.command_set}
                                onChange={e => setSharedConfig(p => ({ ...p, command_set: e.target.value }))}
                                className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                            >
                                <option value="esc_pos">ESC/POS (most printers)</option>
                                <option value="esc_pos_star">ESC/POS Star</option>
                                <option value="esc_bixolon">Bixolon</option>
                                <option value="epson_tm">Epson TM Series</option>
                            </select>
                        </div>
                        <div>
                            <Label>Receipt Template</Label>
                            <select
                                value={sharedConfig.template}
                                onChange={e => setSharedConfig(p => ({ ...p, template: e.target.value }))}
                                className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                            >
                                <option value="standard">Standard</option>
                                <option value="detailed">Detailed</option>
                                <option value="minimal">Minimal</option>
                                <option value="itemized">Itemized</option>
                                <option value="compact">Compact</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <Label>Header Text</Label>
                            <Input
                                placeholder="e.g. Thank you for your order!"
                                value={sharedConfig.header_text}
                                onChange={e => setSharedConfig(p => ({ ...p, header_text: e.target.value }))}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Footer Text</Label>
                            <Input
                                placeholder="e.g. Visit us at example.com"
                                value={sharedConfig.footer_text}
                                onChange={e => setSharedConfig(p => ({ ...p, footer_text: e.target.value }))}
                                className="mt-1"
                            />
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                        {[
                            { key: 'auto_print', label: 'Auto Print on New Order', desc: 'Print receipt automatically when a new order arrives', highlight: true },
                            { key: 'show_logo', label: 'Show Logo', desc: 'Print restaurant logo on receipt' },
                            { key: 'show_order_number', label: 'Show Order Number', desc: 'Include order number on receipt' },
                            { key: 'show_customer_details', label: 'Show Customer Details', desc: 'Include customer name and address' },
                        ].map(({ key, label, desc, highlight }) => (
                            <div key={key} className={`flex items-center justify-between p-3 border rounded-lg ${highlight ? 'border-orange-200 bg-orange-50' : ''}`}>
                                <div>
                                    <p className="font-medium text-sm">{label}</p>
                                    <p className="text-xs text-gray-500">{desc}</p>
                                </div>
                                <Switch
                                    checked={sharedConfig[key] !== false}
                                    onCheckedChange={v => setSharedConfig(p => ({ ...p, [key]: v }))}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <Button onClick={saveAll} disabled={mutation.isPending} className="w-full bg-orange-500 hover:bg-orange-600">
                    <Save className="h-4 w-4 mr-2" />
                    {mutation.isPending ? 'Saving...' : 'Save All Printer Settings'}
                </Button>
            </CardContent>
        </Card>
    );
}