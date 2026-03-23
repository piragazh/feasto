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
    Printer, Bluetooth, Usb, Wifi, Save, CheckCircle2,
    AlertCircle, Info, RefreshCw, Circle, ShoppingBag, Cpu,
    TabletSmartphone, ArrowRight, Zap, Plus, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import BluetoothPrinterManager from '@/components/restaurant/BluetoothPrinterManager';
import { printerManager } from '@/components/restaurant/PrinterService';

// ── Order type channels ────────────────────────────────────────────────────
const ORDER_CHANNELS = [
    { id: 'online_order', label: 'Online Orders', icon: ShoppingBag, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { id: 'pos_order',    label: 'POS Orders',    icon: Cpu,          color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { id: 'kiosk_order',  label: 'Kiosk Orders',  icon: TabletSmartphone, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
];

// ── Printer status badge ───────────────────────────────────────────────────
function PrinterStatusBadge({ service, label }) {
    const [status, setStatus] = useState(() => service.getConnectionStatus());
    useEffect(() => {
        service.setConnectionStatusCallback(() => setStatus(service.getConnectionStatus()));
        setStatus(service.getConnectionStatus());
        service.startHeartbeat(6000);
        return () => { service.stopHeartbeat(); service.setConnectionStatusCallback(null); };
    }, [service]);
    const { connected, reconnecting, printerName } = status;
    if (reconnecting) return <Badge className="bg-amber-100 text-amber-700 gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Reconnecting…</Badge>;
    if (connected) return <Badge className="bg-green-100 text-green-700 gap-1"><CheckCircle2 className="h-3 w-3" />{printerName || label} — Connected</Badge>;
    return <Badge className="bg-gray-100 text-gray-500 gap-1"><Circle className="h-3 w-3" />{label} — Not Connected</Badge>;
}

// ── Single printer card ────────────────────────────────────────────────────
function PrinterCard({ printer, index, onUpdate, onRemove, restaurantId }) {
    const service = index === 0 ? printerManager.printerA : printerManager.printerB;
    const type = printer.connection_type || 'bluetooth';
    const accentClass = index === 0 ? 'border-orange-200' : 'border-blue-200';

    return (
        <div className={`border-2 ${accentClass} rounded-xl p-5 space-y-4`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <Printer className="h-5 w-5 text-gray-600" />
                    <div>
                        <Input
                            value={printer.name || ''}
                            onChange={e => onUpdate({ name: e.target.value })}
                            placeholder={`Printer ${index + 1} name`}
                            className="h-7 text-sm font-semibold border-0 p-0 focus-visible:ring-0 bg-transparent w-44"
                        />
                        <p className="text-xs text-gray-400">Slot {index + 1}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <PrinterStatusBadge service={service} label={`Printer ${index + 1}`} />
                    {index > 0 && (
                        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Connection type selector */}
            <div>
                <Label className="mb-2 block text-xs text-gray-500 uppercase tracking-wide">Connection Type</Label>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { value: 'bluetooth', label: 'Bluetooth', icon: Bluetooth },
                        { value: 'usb',       label: 'USB',       icon: Usb       },
                        { value: 'network',   label: 'Network',   icon: Wifi      },
                    ].map(({ value, label, icon: Icon }) => (
                        <button
                            key={value}
                            onClick={() => onUpdate({ connection_type: value })}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-xs font-medium transition-all ${
                                type === value
                                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                                    : 'border-gray-200 hover:border-gray-300 text-gray-500'
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {type === 'bluetooth' && (
                <BluetoothPrinterManager
                    selectedPrinter={printer.bluetooth_printer}
                    onPrinterSelect={p => onUpdate({ bluetooth_printer: p, connection_type: 'bluetooth' })}
                    restaurantId={restaurantId}
                    printerService={service}
                />
            )}
            {type === 'usb' && (
                <div className="space-y-3">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        Enter Vendor ID and Product ID from Device Manager or printer specs.
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs">Vendor ID (hex)</Label>
                            <Input placeholder="e.g. 0x04b8" value={printer.usb_vendor_id || ''} onChange={e => onUpdate({ usb_vendor_id: e.target.value })} className="mt-1 font-mono text-sm" />
                        </div>
                        <div>
                            <Label className="text-xs">Product ID (hex)</Label>
                            <Input placeholder="e.g. 0x0202" value={printer.usb_product_id || ''} onChange={e => onUpdate({ usb_product_id: e.target.value })} className="mt-1 font-mono text-sm" />
                        </div>
                    </div>
                </div>
            )}
            {type === 'network' && (
                <div className="space-y-3">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        Printer must be on the same WiFi/LAN. Default port is 9100.
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <Label className="text-xs">IP Address</Label>
                            <Input placeholder="192.168.1.100" value={printer.network_ip || ''} onChange={e => onUpdate({ network_ip: e.target.value })} className="mt-1 font-mono text-sm" />
                        </div>
                        <div>
                            <Label className="text-xs">Port</Label>
                            <Input placeholder="9100" value={printer.network_port || '9100'} onChange={e => onUpdate({ network_port: e.target.value })} className="mt-1 font-mono text-sm" />
                        </div>
                    </div>
                </div>
            )}

            {/* Order type assignments for this printer */}
            <div>
                <Label className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Receives Jobs From</Label>
                <div className="flex flex-wrap gap-2">
                    {ORDER_CHANNELS.map(ch => {
                        const assigned = (printer.assigned_channels || []).includes(ch.id);
                        return (
                            <button
                                key={ch.id}
                                onClick={() => {
                                    const current = printer.assigned_channels || [];
                                    const updated = assigned ? current.filter(c => c !== ch.id) : [...current, ch.id];
                                    onUpdate({ assigned_channels: updated });
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                                    assigned
                                        ? `${ch.bg} ${ch.color} ${ch.border}`
                                        : 'bg-gray-50 text-gray-400 border-gray-200'
                                }`}
                            >
                                <ch.icon className="h-3.5 w-3.5" />
                                {ch.label}
                            </button>
                        );
                    })}
                </div>
                {(!printer.assigned_channels || printer.assigned_channels.length === 0) && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1"><AlertCircle className="h-3 w-3" />No order types assigned — this printer won't receive jobs</p>
                )}
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────
const DEFAULT_PRINTER = {
    name: '',
    connection_type: 'bluetooth',
    bluetooth_printer: null,
    usb_vendor_id: '',
    usb_product_id: '',
    network_ip: '',
    network_port: '9100',
    assigned_channels: [],
};

const DEFAULT_SHARED = {
    printer_width: '80mm',
    command_set: 'esc_pos',
    template: 'standard',
    header_text: '',
    footer_text: '',
    show_logo: true,
    show_order_number: true,
    show_customer_details: true,
    auto_print: false,
    font_size: 'medium',
};

export default function CentralizedPrinterSettings({ restaurantId }) {
    const queryClient = useQueryClient();

    const { data: restaurant, isLoading } = useQuery({
        queryKey: ['restaurant-printers', restaurantId],
        queryFn: async () => {
            const [r] = await base44.entities.Restaurant.filter({ id: restaurantId });
            return r;
        },
    });

    const [printers, setPrinters] = useState([
        { ...DEFAULT_PRINTER, name: 'Printer A (Primary)', assigned_channels: ['online_order', 'pos_order', 'kiosk_order'] },
    ]);
    const [shared, setShared] = useState(DEFAULT_SHARED);

    // Hydrate from existing restaurant data
    useEffect(() => {
        if (!restaurant) return;
        const c = restaurant.printer_config || {};

        // Migrate from old structure into new centralized structure
        if (c.centralized_printers) {
            setPrinters(c.centralized_printers);
        } else {
            // Build from legacy single-printer config
            const printerA = {
                ...DEFAULT_PRINTER,
                name: 'Printer A (Primary)',
                connection_type: c.printer_type || 'bluetooth',
                bluetooth_printer: c.bluetooth_printer || null,
                usb_vendor_id: c.usb_vendor_id || '',
                usb_product_id: c.usb_product_id || '',
                network_ip: c.network_ip || '',
                network_port: c.network_port || '9100',
                assigned_channels: ['online_order', 'pos_order'],
            };
            const printers = [printerA];
            // Kiosk printer (was in kiosk_config)
            if (restaurant.kiosk_config?.kiosk_printer?.id) {
                printers.push({
                    ...DEFAULT_PRINTER,
                    name: 'Printer B (Kiosk)',
                    connection_type: 'bluetooth',
                    bluetooth_printer: restaurant.kiosk_config.kiosk_printer,
                    assigned_channels: ['kiosk_order'],
                });
            }
            // POS Printer B
            if (c.printer_b_config?.bluetooth_printer?.id) {
                const exists = printers.some(p => p.bluetooth_printer?.id === c.printer_b_config.bluetooth_printer.id);
                if (!exists) {
                    printers.push({
                        ...DEFAULT_PRINTER,
                        name: 'Printer B (POS)',
                        connection_type: c.printer_b_config.printer_type || 'bluetooth',
                        bluetooth_printer: c.printer_b_config.bluetooth_printer,
                        assigned_channels: ['pos_order'],
                    });
                }
            }
            setPrinters(printers);
        }

        setShared({
            printer_width: c.printer_width || '80mm',
            command_set: c.command_set || 'esc_pos',
            template: c.template || 'standard',
            header_text: c.header_text || '',
            footer_text: c.footer_text || '',
            show_logo: c.show_logo !== false,
            show_order_number: c.show_order_number !== false,
            show_customer_details: c.show_customer_details !== false,
            auto_print: c.auto_print || false,
            font_size: c.font_size || 'medium',
        });
    }, [restaurant]);

    const mutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-printers', restaurantId]);
            toast.success('Printer settings saved');
        },
        onError: () => toast.error('Failed to save'),
    });

    const save = () => {
        const newConfig = {
            ...shared,
            centralized_printers: printers,
            // Keep legacy fields in sync so existing LiveOrders auto-print still works
            printer_type: printers[0]?.connection_type || 'bluetooth',
            bluetooth_printer: printers[0]?.bluetooth_printer || null,
            network_ip: printers[0]?.network_ip || '',
            network_port: printers[0]?.network_port || '9100',
        };
        mutation.mutate({ printer_config: newConfig });
    };

    const updatePrinter = (index, changes) => {
        setPrinters(prev => prev.map((p, i) => i === index ? { ...p, ...changes } : p));
    };

    const addPrinter = () => {
        if (printers.length >= 4) { toast.error('Maximum 4 printers supported'); return; }
        setPrinters(prev => [...prev, { ...DEFAULT_PRINTER, name: `Printer ${String.fromCharCode(65 + prev.length)}` }]);
    };

    const removePrinter = (index) => {
        setPrinters(prev => prev.filter((_, i) => i !== index));
    };

    // Channel → assigned printers summary
    const channelSummary = ORDER_CHANNELS.map(ch => ({
        ...ch,
        assignedPrinters: printers.filter(p => (p.assigned_channels || []).includes(ch.id)).map(p => p.name || 'Unnamed'),
    }));

    if (isLoading) return <div className="text-center py-10 text-gray-400">Loading printer settings...</div>;

    return (
        <div className="space-y-6">
            {/* Channel routing overview */}
            <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-gray-50">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-gray-500" />
                        Order Channel → Printer Routing
                    </CardTitle>
                    <CardDescription>Overview of which printers receive which order types</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid sm:grid-cols-3 gap-3">
                        {channelSummary.map(ch => {
                            const ChIcon = ch.icon;
                            return (
                            <div key={ch.id} className={`rounded-xl p-4 border-2 ${ch.border} ${ch.bg}`}>
                                <div className={`flex items-center gap-2 font-semibold text-sm mb-2 ${ch.color}`}>
                                    <ChIcon className="h-4 w-4" />
                                    {ch.label}
                                </div>
                                {ch.assignedPrinters.length > 0 ? (
                                    ch.assignedPrinters.map((name, i) => (
                                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                                            <Printer className="h-3 w-3" />
                                            {name}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />No printer assigned</p>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Printer slots */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />Printers ({printers.length})</CardTitle>
                            <CardDescription>Configure each printer and assign which order types it handles</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={addPrinter} disabled={printers.length >= 4}>
                            <Plus className="h-4 w-4 mr-1.5" />Add Printer
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                        {printers.map((printer, i) => (
                            <PrinterCard
                                key={i}
                                index={i}
                                printer={printer}
                                onUpdate={(changes) => updatePrinter(i, changes)}
                                onRemove={() => removePrinter(i)}
                                restaurantId={restaurantId}
                            />
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Shared receipt layout settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-orange-500" />
                        Shared Receipt Settings
                    </CardTitle>
                    <CardDescription>These settings apply to all printers and order types</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid md:grid-cols-3 gap-4">
                        <div>
                            <Label>Paper Width</Label>
                            <select value={shared.printer_width} onChange={e => setShared(p => ({ ...p, printer_width: e.target.value }))} className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm">
                                <option value="58mm">58mm (narrow)</option>
                                <option value="80mm">80mm (standard)</option>
                            </select>
                        </div>
                        <div>
                            <Label>Command Set</Label>
                            <select value={shared.command_set} onChange={e => setShared(p => ({ ...p, command_set: e.target.value }))} className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm">
                                <option value="esc_pos">ESC/POS (most printers)</option>
                                <option value="esc_pos_star">ESC/POS Star</option>
                                <option value="esc_bixolon">Bixolon</option>
                                <option value="epson_tm">Epson TM Series</option>
                            </select>
                        </div>
                        <div>
                            <Label>Receipt Template</Label>
                            <select value={shared.template} onChange={e => setShared(p => ({ ...p, template: e.target.value }))} className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm">
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
                            <Input placeholder="e.g. Thank you for your order!" value={shared.header_text} onChange={e => setShared(p => ({ ...p, header_text: e.target.value }))} className="mt-1" />
                        </div>
                        <div>
                            <Label>Footer Text</Label>
                            <Input placeholder="e.g. Visit us at example.com" value={shared.footer_text} onChange={e => setShared(p => ({ ...p, footer_text: e.target.value }))} className="mt-1" />
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                        {[
                            { key: 'auto_print',            label: 'Auto Print on New Order', desc: 'Print receipt automatically when a new order arrives', highlight: true },
                            { key: 'show_logo',             label: 'Show Logo',               desc: 'Print restaurant logo on receipt' },
                            { key: 'show_order_number',     label: 'Show Order Number',       desc: 'Include order number on receipt' },
                            { key: 'show_customer_details', label: 'Show Customer Details',   desc: 'Include customer name and address' },
                        ].map(({ key, label, desc, highlight }) => (
                            <div key={key} className={`flex items-center justify-between p-3 border rounded-lg ${highlight ? 'border-orange-200 bg-orange-50' : ''}`}>
                                <div>
                                    <p className="font-medium text-sm">{label}</p>
                                    <p className="text-xs text-gray-500">{desc}</p>
                                </div>
                                <Switch checked={shared[key] !== false} onCheckedChange={v => setShared(p => ({ ...p, [key]: v }))} />
                            </div>
                        ))}
                    </div>

                    <Button onClick={save} disabled={mutation.isPending} className="w-full bg-orange-500 hover:bg-orange-600">
                        <Save className="h-4 w-4 mr-2" />
                        {mutation.isPending ? 'Saving...' : 'Save All Printer Settings'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}