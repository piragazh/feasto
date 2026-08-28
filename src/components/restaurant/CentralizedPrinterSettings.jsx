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
    AlertCircle, Info, RefreshCw, ShoppingBag, Cpu,
    TabletSmartphone, ArrowRight, Zap, Plus, Trash2, FlaskConical,
    WifiOff, ChevronDown, ChevronUp, ChefHat, Receipt, ExternalLink, Circle
} from 'lucide-react';
import { toast } from 'sonner';
import BluetoothPrinterManager from '@/components/restaurant/BluetoothPrinterManager';
import { printerManager } from '@/components/restaurant/PrinterService';
import PrinterStatusBadge from '@/components/restaurant/PrinterStatusBadge';
import NetworkPrinterManager, { NetworkPrinterStatusBadge } from '@/components/restaurant/NetworkPrinterManager';
import LocalPrintAgentPanel from '@/components/restaurant/LocalPrintAgentPanel';
import PrinterDiagnosticTool from '@/components/restaurant/PrinterDiagnosticTool';
import AndroidAgentSetupPanel from '@/components/restaurant/AndroidAgentSetupPanel';
import qzTrayService from '@/lib/qzTrayService';

// ── Order type channels ────────────────────────────────────────────────────
const ORDER_CHANNELS = [
    { id: 'online_order', label: 'Online Orders', icon: ShoppingBag, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { id: 'pos_order',    label: 'POS Orders',    icon: Cpu,          color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { id: 'kiosk_order',  label: 'Kiosk Orders',  icon: TabletSmartphone, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
];

// ── Template definitions ───────────────────────────────────────────────────
const TEMPLATES = [
    {
        id: 'standard',
        name: 'Standard',
        desc: 'Balanced layout with all details',
        color: 'border-blue-400 bg-blue-50',
        activeColor: 'border-blue-500 bg-blue-50 ring-2 ring-blue-300',
        badge: 'bg-blue-100 text-blue-700',
        preview: [
            { type: 'center-bold', text: 'RESTAURANT NAME' },
            { type: 'center-sm', text: '123 Main St, London' },
            { type: 'divider' },
            { type: 'center-bold', text: 'ORDER #1234' },
            { type: 'divider' },
            { type: 'row', left: '1x Margherita', right: '£12.99' },
            { type: 'row', left: '2x Coca Cola', right: '£5.00' },
            { type: 'divider' },
            { type: 'row-bold', left: 'TOTAL', right: '£17.99' },
            { type: 'divider' },
            { type: 'center-sm', text: 'Thank you!' },
        ],
    },
    {
        id: 'detailed',
        name: 'Detailed',
        desc: 'Extra info, customisations & notes',
        color: 'border-purple-400 bg-purple-50',
        activeColor: 'border-purple-500 bg-purple-50 ring-2 ring-purple-300',
        badge: 'bg-purple-100 text-purple-700',
        preview: [
            { type: 'center-bold', text: 'RESTAURANT NAME' },
            { type: 'center-sm', text: '123 Main St · Tel: 020 1234 5678' },
            { type: 'divider' },
            { type: 'left-bold', text: 'Customer: John Smith' },
            { type: 'left-sm', text: '12 Delivery Road, London' },
            { type: 'divider' },
            { type: 'row', left: '1x Margherita', right: '£12.99' },
            { type: 'indent', text: '→ Extra cheese' },
            { type: 'row', left: '2x Coca Cola', right: '£5.00' },
            { type: 'divider' },
            { type: 'row', left: 'Subtotal', right: '£17.99' },
            { type: 'row', left: 'Delivery', right: '£2.50' },
            { type: 'row-bold', left: 'TOTAL', right: '£20.49' },
            { type: 'left-sm', text: 'Payment: Card' },
        ],
    },
    {
        id: 'minimal',
        name: 'Minimal',
        desc: 'Clean, fast, no frills',
        color: 'border-gray-400 bg-gray-50',
        activeColor: 'border-gray-600 bg-gray-50 ring-2 ring-gray-400',
        badge: 'bg-gray-200 text-gray-700',
        preview: [
            { type: 'center-bold', text: 'ORDER #1234' },
            { type: 'divider' },
            { type: 'row', left: '1x Margherita', right: '£12.99' },
            { type: 'row', left: '2x Coca Cola', right: '£5.00' },
            { type: 'divider' },
            { type: 'row-bold', left: 'TOTAL', right: '£17.99' },
        ],
    },
    {
        id: 'itemized',
        name: 'Itemized',
        desc: 'Large text, item-focused for kitchen',
        color: 'border-orange-400 bg-orange-50',
        activeColor: 'border-orange-500 bg-orange-50 ring-2 ring-orange-300',
        badge: 'bg-orange-100 text-orange-700',
        preview: [
            { type: 'center-bold-lg', text: 'ORDER #1234' },
            { type: 'divider' },
            { type: 'item-lg', text: '1x Margherita Pizza' },
            { type: 'item-lg', text: '2x Coca Cola' },
            { type: 'item-lg', text: '1x Garlic Bread' },
            { type: 'divider' },
            { type: 'center-sm', text: 'Kitchen Copy' },
        ],
    },
    {
        id: 'compact',
        name: 'Compact',
        desc: 'Minimal paper usage',
        color: 'border-green-400 bg-green-50',
        activeColor: 'border-green-500 bg-green-50 ring-2 ring-green-300',
        badge: 'bg-green-100 text-green-700',
        preview: [
            { type: 'row-bold', left: '#1234', right: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
            { type: 'row', left: '1x Margherita', right: '£12.99' },
            { type: 'row', left: '2x Cola', right: '£5.00' },
            { type: 'divider' },
            { type: 'row-bold', left: 'TOTAL', right: '£17.99' },
        ],
    },
    {
        id: 'custom',
        name: 'Custom',
        desc: 'Full control over every section',
        color: 'border-pink-400 bg-pink-50',
        activeColor: 'border-pink-500 bg-pink-50 ring-2 ring-pink-300',
        badge: 'bg-pink-100 text-pink-700',
        preview: [
            { type: 'center-bold', text: '✦ RESTAURANT NAME ✦' },
            { type: 'center-sm', text: '"Your custom header here"' },
            { type: 'divider' },
            { type: 'center-bold', text: 'ORDER #1234' },
            { type: 'divider' },
            { type: 'row', left: '1x Margherita', right: '£12.99' },
            { type: 'row-bold', left: 'TOTAL', right: '£17.99' },
            { type: 'divider' },
            { type: 'center-sm', text: '"Your custom footer here"' },
            { type: 'center-sm', text: '★ Thank you! ★' },
        ],
    },
];

function TemplatePreviewStrip({ tpl }) {
    return (
        <div className="font-mono text-[9px] leading-[1.4] space-y-0.5 select-none">
            {tpl.preview.map((line, i) => {
                if (line.type === 'divider')      return <div key={i} className="border-t border-dashed border-gray-300 my-0.5" />;
                if (line.type === 'center-bold')  return <div key={i} className="text-center font-bold">{line.text}</div>;
                if (line.type === 'center-bold-lg') return <div key={i} className="text-center font-bold text-[11px]">{line.text}</div>;
                if (line.type === 'center-sm')    return <div key={i} className="text-center text-gray-500">{line.text}</div>;
                if (line.type === 'left-bold')    return <div key={i} className="font-bold">{line.text}</div>;
                if (line.type === 'left-sm')      return <div key={i} className="text-gray-500">{line.text}</div>;
                if (line.type === 'indent')       return <div key={i} className="pl-2 text-gray-400 italic">{line.text}</div>;
                if (line.type === 'item-lg')      return <div key={i} className="font-bold text-[11px]">{line.text}</div>;
                if (line.type === 'row')          return <div key={i} className="flex justify-between"><span>{line.left}</span><span>{line.right}</span></div>;
                if (line.type === 'row-bold')     return <div key={i} className="flex justify-between font-bold"><span>{line.left}</span><span>{line.right}</span></div>;
                return null;
            })}
        </div>
    );
}

// ── Default printer config (must be declared before any component that references it) ──
const DEFAULT_PRINTER = {
    name: '',
    enabled: true,
    // 'receipt' = customer-facing copy (prices, totals, payment method).
    // 'kitchen' = item-only ticket for the kitchen — no prices, larger item text.
    role: 'receipt',
    connection_type: 'bluetooth',
    bluetooth_printer: null,
    usb_vendor_id: '',
    usb_product_id: '',
    network_ip: '',
    network_port: '9100',
    qz_printer_name: '',
    assigned_channels: [],
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

// ── Per-printer receipt settings ───────────────────────────────────────────
function PrinterReceiptSettings({ printer, onUpdate }) {
    const [expanded, setExpanded] = useState(false);
    const selectedTemplate = printer.template || 'standard';
    const tpl = TEMPLATES.find(t => t.id === selectedTemplate) || TEMPLATES[0];

    return (
        <div className="border rounded-lg overflow-hidden">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
            >
                <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-500" />
                    Receipt & Template Settings
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tpl.badge}`}>{tpl.name}</span>
                </span>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {expanded && (
                <div className="p-4 space-y-5 bg-white">
                    {/* Paper & Command Set */}
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

                    {/* Visual Template Picker */}
                    <div>
                        <Label className="text-xs mb-2 block">Receipt Template</Label>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
                            {TEMPLATES.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => onUpdate({ template: t.id })}
                                    className={`relative border-2 rounded-xl p-2 text-left transition-all hover:shadow-md ${
                                        selectedTemplate === t.id ? t.activeColor : t.color
                                    }`}
                                >
                                    {selectedTemplate === t.id && (
                                        <div className="absolute top-1.5 right-1.5">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-gray-700" />
                                        </div>
                                    )}
                                    {/* Mini receipt preview */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-1.5 mb-2 min-h-[70px] overflow-hidden">
                                        <TemplatePreviewStrip tpl={t} />
                                    </div>
                                    <div className="text-xs font-semibold text-gray-800">{t.name}</div>
                                    <div className="text-[10px] text-gray-500 leading-tight mt-0.5">{t.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Font Size */}
                    <div>
                        <Label className="text-xs mb-2 block">Font Size</Label>
                        <div className="flex gap-2">
                            {[
                                { value: 'small', label: 'S', desc: 'Small' },
                                { value: 'medium', label: 'M', desc: 'Medium' },
                                { value: 'large', label: 'L', desc: 'Large' },
                            ].map(f => (
                                <button
                                    key={f.value}
                                    onClick={() => onUpdate({ font_size: f.value })}
                                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                                        (printer.font_size || 'medium') === f.value
                                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                    }`}
                                >
                                    <span className={f.value === 'small' ? 'text-xs' : f.value === 'large' ? 'text-base' : 'text-sm'}>{f.label}</span>
                                    <div className="text-[10px] font-normal text-gray-400">{f.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Header / Footer text */}
                    <div className="grid grid-cols-1 gap-3">
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
                    </div>

                    {/* Display toggles */}
                    <div>
                        <Label className="text-xs mb-2 block">Display Options</Label>
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
                                        checked={printer[key] !== undefined ? !!printer[key] : !!DEFAULT_PRINTER[key]}
                                        onCheckedChange={v => onUpdate({ [key]: v })}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Custom template extras */}
                    {selectedTemplate === 'custom' && (
                        <div className="border border-pink-200 bg-pink-50 rounded-xl p-4 space-y-3">
                            <p className="text-xs font-semibold text-pink-700 flex items-center gap-1.5">
                                <Zap className="h-3.5 w-3.5" />Custom Template Extras
                            </p>
                            <div className="grid sm:grid-cols-2 gap-2">
                                {[
                                    { key: 'custom_show_qr',       label: 'QR Code (order tracking)' },
                                    { key: 'custom_show_barcode',   label: 'Barcode (order number)' },
                                    { key: 'custom_show_social',    label: 'Social Media Handles' },
                                    { key: 'custom_show_allergens', label: 'Allergen Warnings' },
                                    { key: 'custom_show_wifi',      label: 'WiFi Password' },
                                    { key: 'custom_show_loyalty',   label: 'Loyalty Points Summary' },
                                ].map(({ key, label }) => (
                                    <div key={key} className="flex items-center justify-between p-2.5 bg-white border border-pink-100 rounded-lg">
                                        <p className="text-xs font-medium text-gray-700">{label}</p>
                                        <Switch
                                            checked={printer[key] || false}
                                            onCheckedChange={v => onUpdate({ [key]: v })}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// BT services are only available for 2 physical slots. Which bluetooth-type
// printer gets which slot is based on its position AMONG bluetooth-type
// printers specifically — not its raw position in the full printer list.
// This must stay in sync with resolveBtService() in src/lib/printUtils.js.
const BT_SERVICES = [printerManager.printerA, printerManager.printerB];

function resolveBtSlotIndex(printers, printer) {
    const btPrinters = printers.filter(p => (p.connection_type || 'bluetooth') === 'bluetooth');
    return btPrinters.indexOf(printer);
}

// ── Single printer card ────────────────────────────────────────────────────
function PrinterCard({ printer, index, onUpdate, onRemove, restaurantId }) {
    // Slots 0 and 1 → BT service A and B. Slots 2+ → no BT service (network/USB only)
    const service = BT_SERVICES[index] || null;
    const type = printer.connection_type || 'bluetooth';
    const accentClass = index === 0 ? 'border-orange-200' : 'border-blue-200';
    const [testing, setTesting] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);

    const [qzStatus, setQzStatus] = useState(qzTrayService.getStatus());
    useEffect(() => {
        if (type !== 'qz_tray') return undefined;
        const unsub = qzTrayService.subscribe(setQzStatus);
        qzTrayService.connect();
        return unsub;
    }, [type]);

    const handleTestPrint = async () => {
        if (type === 'network') return; // handled by NetworkPrinterManager's own test button
        if (type === 'qz_tray') {
            if (!printer.qz_printer_name) { toast.error('Enter the QZ Tray printer name first'); return; }
            if (!qzStatus.connected) { toast.error('QZ Tray is not connected'); return; }
            setTesting(true);
            try {
                const { buildTestBytes } = await import('@/lib/escpos');
                const bytes = buildTestBytes(printer.qz_printer_name, printer.command_set || 'esc_pos', printer.printer_width || '80mm');
                await qzTrayService.print(printer.qz_printer_name, bytes);
                toast.success('Test page sent to printer!');
            } catch (e) {
                toast.error(`Test failed: ${e.message}`);
            } finally {
                setTesting(false);
            }
            return;
        }
        if (!service) { toast.error('Bluetooth is only supported on printer slots 1 and 2'); return; }
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
        if (!service) { toast.error('Bluetooth is only supported on printer slots 1 and 2'); return; }
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

    const enabled = printer.enabled !== false; // default true

    return (
        <div className={`border-2 ${accentClass} rounded-xl p-5 space-y-4 ${!enabled ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <Printer className={`h-5 w-5 ${enabled ? 'text-gray-600' : 'text-gray-400'}`} />
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
                    {/* Enable / Disable toggle */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 bg-gray-50">
                        <span className={`text-xs font-medium ${enabled ? 'text-green-700' : 'text-gray-400'}`}>
                            {enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <Switch
                            checked={enabled}
                            onCheckedChange={v => onUpdate({ enabled: v })}
                        />
                    </div>
                    {type === 'bluetooth' && service && <PrinterStatusBadge service={service} label={`Printer ${index + 1}`} />}
                    {type === 'network' && <NetworkPrinterStatusBadge ip={printer.network_ip} port={printer.network_port} />}
                    {type === 'qz_tray' && (
                        qzStatus.connecting ? (
                            <Badge className="bg-amber-100 text-amber-700 gap-1.5"><RefreshCw className="h-3 w-3 animate-spin" />Connecting…</Badge>
                        ) : qzStatus.connected ? (
                            <Badge className="bg-green-100 text-green-700 gap-1.5"><CheckCircle2 className="h-3 w-3" />QZ Tray Online</Badge>
                        ) : (
                            <Badge className="bg-red-100 text-red-700 gap-1.5"><Circle className="h-3 w-3" />QZ Tray Offline</Badge>
                        )
                    )}
                    {type === 'bluetooth' && service && (
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
                    {((type !== 'network' && service) || type === 'qz_tray') && (
                        <button
                            onClick={handleTestPrint}
                            disabled={testing}
                            title="Print test page"
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50 transition-colors"
                        >
                            {testing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
                            Test
                        </button>
                    )}
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
                {index >= 2 && (
                    <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />Bluetooth is only available on printer slots 1 & 2. Use Network or USB for this slot.
                    </p>
                )}
                <div className="grid grid-cols-4 gap-2">
                    {[
                        { value: 'qz_tray',   label: 'QZ Tray',   icon: Zap       },
                        { value: 'bluetooth', label: 'Bluetooth', icon: Bluetooth },
                        { value: 'usb',       label: 'USB',       icon: Usb       },
                        { value: 'network',   label: 'Network',   icon: Wifi      },
                    ].map(({ value, label, icon: ConnIcon }) => {
                        const disabled = value === 'bluetooth' && index >= 2;
                        return (
                            <button
                                key={value}
                                onClick={() => !disabled && onUpdate({ connection_type: value })}
                                disabled={disabled}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-xs font-medium transition-all ${
                                    disabled
                                        ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                                        : type === value
                                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-500'
                                }`}
                            >
                                <ConnIcon className="h-4 w-4" />
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {type === 'qz_tray' && (
                <div className="space-y-3">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>Connects directly to QZ Tray running on this computer — instant local printing, no cloud round-trip. Requires the free <a href="https://qz.io/download" target="_blank" rel="noopener noreferrer" className="underline font-semibold">QZ Tray app</a> installed and running here.</span>
                    </div>
                    <div>
                        <Label className="text-xs">QZ Tray Printer Name</Label>
                        <Input
                            placeholder="e.g. EPSON_TM_T20III"
                            value={printer.qz_printer_name || ''}
                            onChange={e => onUpdate({ qz_printer_name: e.target.value })}
                            className="mt-1 font-mono text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">The exact printer name as QZ Tray/Windows sees it. Connect below, then use Test to confirm.</p>
                    </div>
                    {!qzStatus.connected && !qzStatus.connecting && (
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => window.open('https://localhost:8181', '_blank')}>
                                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Accept Cert
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => qzTrayService.connect()}>
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Reconnect
                            </Button>
                        </div>
                    )}
                    {!qzStatus.connected && !qzStatus.connecting && qzStatus.lastError && (
                        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-800 font-mono break-all">
                            {qzStatus.lastError}
                        </div>
                    )}
                </div>
            )}
            {type === 'bluetooth' && service && (
                <BluetoothPrinterManager
                    selectedPrinter={printer.bluetooth_printer}
                    onPrinterSelect={p => onUpdate({ bluetooth_printer: p, connection_type: 'bluetooth' })}
                    restaurantId={restaurantId}
                    printerService={service}
                />
            )}
            {type === 'bluetooth' && !service && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    Bluetooth is only supported on printer slots 1 and 2. Please switch to Network or USB.
                </div>
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
                <NetworkPrinterManager printer={printer} onUpdate={onUpdate} restaurantId={restaurantId} />
            )}

            {/* Printer role: customer receipt vs kitchen ticket */}
            <div>
                <Label className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Printer Role</Label>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => onUpdate({ role: 'receipt' })}
                        className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border-2 text-xs font-medium transition-all ${
                            (printer.role || 'receipt') === 'receipt' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'
                        }`}
                    >
                        <Receipt className="h-4 w-4" />Receipt (with prices)
                    </button>
                    <button
                        onClick={() => onUpdate({ role: 'kitchen' })}
                        className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border-2 text-xs font-medium transition-all ${
                            printer.role === 'kitchen' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'
                        }`}
                    >
                        <ChefHat className="h-4 w-4" />Kitchen (items only)
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">A Receipt printer and a Kitchen printer can both be assigned to the same order type below — both get a copy automatically.</p>
            </div>

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
            queryClient.invalidateQueries({ queryKey: ['restaurant-printers', restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] });
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

    const [activeTab, setActiveTab] = useState('printers');

    if (isLoading) return <div className="text-center py-10 text-gray-400">Loading printer settings...</div>;

    return (
        <div className="space-y-6">
            {/* Tab switcher */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {[
                    { id: 'printers', label: '🖨️ Printers' },
                    { id: 'agent', label: '⚡ Local Print Agent' },
                    { id: 'android_agent', label: '📲 Android Agent' },
                    { id: 'diagnostics', label: '🔬 Diagnostics' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.id
                                ? 'bg-white shadow text-gray-900'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'agent' && (
                <LocalPrintAgentPanel restaurantId={restaurantId} printers={printers} />
            )}

            {activeTab === 'android_agent' && (
                <AndroidAgentSetupPanel restaurantId={restaurantId} />
            )}

            {activeTab === 'diagnostics' && (
                <PrinterDiagnosticTool printers={printers} />
            )}

            {activeTab === 'printers' && (<>
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
                                printers={printers}
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
            </>)}
        </div>
    );
}