import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
    Printer, Bluetooth, Usb, Wifi, Save, CheckCircle2,
    AlertCircle, Info, RefreshCw, Circle, ShoppingBag, Cpu,
    TabletSmartphone, ArrowRight, Zap, Plus, Trash2, FlaskConical,
    WifiOff, MonitorSmartphone, ChevronDown, ChevronUp
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

// ── Per-printer receipt settings ───────────────────────────────────────────
function PrinterReceiptSettings({ printer, onUpdate }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="border rounded-lg overflow-hidden">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
            >
                <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-orange-500" />Receipt & Template Settings</span>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {expanded && (
                <div className="p-4 space-y-4 bg-white">
                    {/* Paper & command */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs">Paper Width</Label>
                            <select
                                value={printer.printer_width || '80mm'}
                                onChange={e => onUpdate({ printer_width: e.target.value })}
                                className="w-full h-9 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                            >
                                <option value="58mm">58mm (narrow)</option>
                                <option value="80mm">80mm (standard)</option>
                            </select>
                        </div>
                        <div>
                            <Label className="text-xs">Command Set</Label>
                            <select
                                value={printer.command_set || 'esc_pos'}
                                onChange={e => onUpdate({ command_set: e.target.value })}
                                className="w-full h-9 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                            >
                                <option value="esc_pos">ESC/POS (most printers)</option>
                                <option value="esc_pos_star">ESC/POS Star</option>
                                <option value="esc_bixolon">Bixolon</option>
                                <option value="epson_tm">Epson TM Series</option>
                            </select>
                        </div>
                    </div>

                    {/* Template & font */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs">Receipt Template</Label>
                            <select
                                value={printer.template || 'standard'}
                                onChange={e => onUpdate({ template: e.target.value })}
                                className="w-full h-9 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                            >
                                <option value="standard">Standard</option>
                                <option value="detailed">Detailed</option>
                                <option value="minimal">Minimal</option>
                                <option value="itemized">Itemized</option>
                                <option value="compact">Compact</option>
                            </select>
                        </div>
                        <div>
                            <Label className="text-xs">Font Size</Label>
                            <select
                                value={printer.font_size || 'medium'}
                                onChange={e => onUpdate({ font_size: e.target.value })}
                                className="w-full h-9 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                            >
                                <option value="small">Small</option>
                                <option value="medium">Medium</option>
                                <option value="large">Large</option>
                            </select>
                        </div>
                    </div>

                    {/* Header / Footer text */}
                    <div>
                        <Label className="text-xs">Header Text</Label>
                        <Input
                            value={printer.header_text || ''}
                            onChange={e => onUpdate({ header_text: e.target.value })}
                            placeholder="e.g. Thank you for your order!"
                            className="mt-1 text-sm"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Footer Text</Label>
                        <Input
                            value={printer.footer_text || ''}
                            onChange={e => onUpdate({ footer_text: e.target.value })}
                            placeholder="e.g. Visit us at example.com"
                            className="mt-1 text-sm"
                        />
                    </div>

                    {/* Toggles */}
                    <div className="grid sm:grid-cols-2 gap-2">
                        {[
                            { key: 'auto_print',            label: 'Auto Print on New Order', highlight: true },
                            { key: 'show_logo',             label: 'Show Logo' },
                            { key: 'show_order_number',     label: 'Show Order Number' },
                            { key: 'show_customer_details', label: 'Show Customer Details' },
                        ].map(({ key, label, highlight }) => (
                            <div key={key} className={`flex items-center justify-between p-2.5 border rounded-lg ${highlight ? 'border-orange-200 bg-orange-50' : ''}`}>
                                <p className="text-xs font-medium text-gray-700">{label}</p>
                                <Switch
                                    checked={printer[key] !== false && printer[key] !== undefined ? (printer[key] || false) : false}
                                    onCheckedChange={v => onUpdate({ [key]: v })}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Single printer card ────────────────────────────────────────────────────
function PrinterCard({ printer, index, onUpdate, onRemove, restaurantId }) {
    const service = index === 0 ? printerManager.printerA : printerManager.printerB;
    const type = printer.connection_type || 'bluetooth';
    const accentClass = index === 0 ? 'border-orange-200' : 'border-blue-200';
    const [testing, setTesting] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);

    const handleTestPrint = async () => {
        setTesting(true);
        try {
            if (!service.isConnected()) await service.tryAutoConnect();
            if (!service.isConnected()) { toast.error('Printer not connected. Please connect first.'); return; }
            await service.printTest(printer.name || `Printer ${index + 1}`);
            toast.success('Test page sent to printer!');
        } catch (e) {
            toast.error(`Test failed: ${e.message}`);
        } finally {
            setTesting(false);
        }
    };

    const handleReconnect = async () => {
        if (!printer.bluetooth_printer?.id) { toast.error('No printer paired. Use "Scan for Printers" below.'); return; }
        setReconnecting(true);
        try {
            await service.connect(printer.bluetooth_printer);
            toast.success('Reconnected successfully!');
        } catch (e) {
            toast.error(`Reconnect failed: ${e.message}`);
        } finally {
            setReconnecting(false);
        }
    };

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
                        <p className="text-xs text-gray-400">Slot {index + 1} · {printer.printer_width || '80mm'} · {printer.template || 'standard'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {type === 'bluetooth' && <PrinterStatusBadge service={service} label={`Printer ${index + 1}`} />}
                    {type === 'bluetooth' && (
                        <button
                            onClick={handleReconnect}
                            disabled={reconnecting}
                            title="Reconnect this printer (e.g. after switching devices)"
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 transition-colors"
                        >
                            {reconnecting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Bluetooth className="h-3 w-3" />}
                            Reconnect
                        </button>
                    )}
                    <button
                        onClick={handleTestPrint}
                        disabled={testing}
                        title="Print test page"
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50 transition-colors"
                    >
                        {testing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
                        Test
                    </button>
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

            {/* Order type assignments */}
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
                                    assigned ? `${ch.bg} ${ch.color} ${ch.border}` : 'bg-gray-50 text-gray-400 border-gray-200'
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

            {/* Per-printer receipt settings */}
            <PrinterReceiptSettings printer={printer} onUpdate={onUpdate} />
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
    // Per-printer receipt settings
    printer_width: '80mm',
    command_set: 'esc_pos',
    template: 'standard',
    header_text: '',
    footer_text: '',
    font_size: 'medium',
    show_logo: true,
    show_order_number: true,
    show_customer_details: true,
    auto_print: false,
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

    // Hydrate from existing restaurant data
    useEffect(() => {
        if (!restaurant) return;
        const c = restaurant.printer_config || {};

        if (c.centralized_printers) {
            // Ensure per-printer receipt settings are present (migrate old entries that only had shared settings)
            const migrated = c.centralized_printers.map(p => ({
                ...DEFAULT_PRINTER,
                ...p,
                printer_width: p.printer_width || c.printer_width || '80mm',
                command_set: p.command_set || c.command_set || 'esc_pos',
                template: p.template || c.template || 'standard',
                header_text: p.header_text !== undefined ? p.header_text : (c.header_text || ''),
                footer_text: p.footer_text !== undefined ? p.footer_text : (c.footer_text || ''),
                font_size: p.font_size || c.font_size || 'medium',
                show_logo: p.show_logo !== undefined ? p.show_logo : (c.show_logo !== false),
                show_order_number: p.show_order_number !== undefined ? p.show_order_number : (c.show_order_number !== false),
                show_customer_details: p.show_customer_details !== undefined ? p.show_customer_details : (c.show_customer_details !== false),
                auto_print: p.auto_print !== undefined ? p.auto_print : (c.auto_print || false),
            }));
            setPrinters(migrated);
        } else {
            // Migrate from old single/legacy structure
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
                printer_width: c.printer_width || '80mm',
                command_set: c.command_set || 'esc_pos',
                template: c.template || 'standard',
                header_text: c.header_text || '',
                footer_text: c.footer_text || '',
                font_size: c.font_size || 'medium',
                show_logo: c.show_logo !== false,
                show_order_number: c.show_order_number !== false,
                show_customer_details: c.show_customer_details !== false,
                auto_print: c.auto_print || false,
            };
            const migratedPrinters = [printerA];
            if (restaurant.kiosk_config?.kiosk_printer?.id) {
                migratedPrinters.push({
                    ...DEFAULT_PRINTER,
                    name: 'Printer B (Kiosk)',
                    connection_type: 'bluetooth',
                    bluetooth_printer: restaurant.kiosk_config.kiosk_printer,
                    assigned_channels: ['kiosk_order'],
                    printer_width: c.printer_width || '80mm',
                    template: c.template || 'standard',
                });
            }
            if (c.printer_b_config?.bluetooth_printer?.id) {
                const exists = migratedPrinters.some(p => p.bluetooth_printer?.id === c.printer_b_config.bluetooth_printer.id);
                if (!exists) {
                    migratedPrinters.push({
                        ...DEFAULT_PRINTER,
                        name: 'Printer B (POS)',
                        connection_type: c.printer_b_config.printer_type || 'bluetooth',
                        bluetooth_printer: c.printer_b_config.bluetooth_printer,
                        assigned_channels: ['pos_order'],
                    });
                }
            }
            setPrinters(migratedPrinters);
        }
    }, [restaurant]);

    const mutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-printers', restaurantId]);
            queryClient.invalidateQueries(['restaurant', restaurantId]);
            toast.success('Printer settings saved');
        },
        onError: () => toast.error('Failed to save'),
    });

    const save = () => {
        // Save per-printer settings on each printer entry.
        // Keep top-level legacy fields in sync from Printer A for backward compat.
        const p0 = printers[0] || {};
        const newConfig = {
            centralized_printers: printers,
            // Legacy compat fields (used by old code paths)
            printer_type: p0.connection_type || 'bluetooth',
            bluetooth_printer: p0.bluetooth_printer || null,
            network_ip: p0.network_ip || '',
            network_port: p0.network_port || '9100',
            printer_width: p0.printer_width || '80mm',
            command_set: p0.command_set || 'esc_pos',
            template: p0.template || 'standard',
            header_text: p0.header_text || '',
            footer_text: p0.footer_text || '',
            font_size: p0.font_size || 'medium',
            show_logo: p0.show_logo !== false,
            show_order_number: p0.show_order_number !== false,
            show_customer_details: p0.show_customer_details !== false,
            auto_print: p0.auto_print || false,
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
            {/* ── Bluetooth persistence notice ─── */}
            <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <WifiOff className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-600" />
                <div>
                    <p className="font-semibold mb-1">📱 Opening on a different device or browser tab?</p>
                    <p className="text-xs leading-relaxed">
                        Web Bluetooth connections are <strong>device-local</strong> — they live only in the browser tab where you connected.
                        If you open the dashboard on your phone, your computer's printer won't be connected there (and vice versa).
                        <br />
                        <strong>Fix:</strong> Use the <em>Reconnect</em> button on each printer card after opening the dashboard on a new device or tab.
                        Each device must pair and reconnect independently.
                    </p>
                </div>
            </div>

            {/* ── Channel routing overview ─── */}
            <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-gray-50">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-gray-500" />
                        Order Channel → Printer Routing
                    </CardTitle>
                    <CardDescription>Which printers receive which order types</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid sm:grid-cols-3 gap-3">
                        {channelSummary.map(ch => {
                            const ChIcon = ch.icon;
                            return (
                                <div key={ch.id} className={`rounded-xl p-4 border-2 ${ch.border} ${ch.bg}`}>
                                    <div className={`flex items-center gap-2 font-semibold text-sm mb-2 ${ch.color}`}>
                                        <ChIcon className="h-4 w-4" />{ch.label}
                                    </div>
                                    {ch.assignedPrinters.length > 0 ? (
                                        ch.assignedPrinters.map((name, i) => (
                                            <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                                                <Printer className="h-3 w-3" />{name}
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />No printer assigned</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* ── Printer slots ─── */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />Printers ({printers.length})</CardTitle>
                            <CardDescription>Configure each printer individually — paper width, template, and channels are set per printer</CardDescription>
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

                    <Button onClick={save} disabled={mutation.isPending} className="w-full mt-6 bg-orange-500 hover:bg-orange-600">
                        <Save className="h-4 w-4 mr-2" />
                        {mutation.isPending ? 'Saving...' : 'Save All Printer Settings'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}