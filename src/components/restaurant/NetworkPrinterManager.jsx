import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Wifi, WifiOff, CheckCircle2, AlertCircle, RefreshCw,
    FlaskConical, Info, Circle, Loader2, Signal
} from 'lucide-react';
import { toast } from 'sonner';

// ── Network Printer Status Badge ──────────────────────────────────────────
export function NetworkPrinterStatusBadge({ ip, port, pingIntervalMs = 30000 }) {
    const [status, setStatus] = useState('unknown'); // unknown | reachable | unreachable | checking
    const timerRef = useRef(null);

    const ping = useCallback(async () => {
        if (!ip) return;
        setStatus('checking');
        try {
            const res = await base44.functions.invoke('networkPrint', {
                action: 'ping',
                printer_ip: ip,
                printer_port: port || '9100',
            });
            setStatus(res.data?.success ? 'reachable' : 'unreachable');
        } catch {
            setStatus('unreachable');
        }
    }, [ip, port]);

    useEffect(() => {
        if (!ip) return;
        ping();
        timerRef.current = setInterval(ping, pingIntervalMs);
        return () => clearInterval(timerRef.current);
    }, [ip, port, pingIntervalMs, ping]);

    if (!ip) return <Badge className="bg-gray-100 text-gray-500 gap-1"><Circle className="h-3 w-3" />Not Configured</Badge>;
    if (status === 'checking') return <Badge className="bg-amber-100 text-amber-700 gap-1"><Loader2 className="h-3 w-3 animate-spin" />Checking…</Badge>;
    if (status === 'reachable') return <Badge className="bg-green-100 text-green-700 gap-1"><CheckCircle2 className="h-3 w-3" />{ip} — Online</Badge>;
    if (status === 'unreachable') return <Badge className="bg-red-100 text-red-700 gap-1"><WifiOff className="h-3 w-3" />{ip} — Offline</Badge>;
    return <Badge className="bg-gray-100 text-gray-500 gap-1"><Signal className="h-3 w-3" />{ip}</Badge>;
}

// ── Main Network Printer Manager Component ────────────────────────────────
export default function NetworkPrinterManager({ printer, onUpdate }) {
    const [testing, setTesting] = useState(false);
    const [pinging, setPinging] = useState(false);
    const [pingResult, setPingResult] = useState(null);

    const ip = printer.network_ip || '';
    const port = printer.network_port || '9100';
    const commandSet = printer.command_set || 'esc_pos';
    const printerName = printer.name || 'Network Printer';

    const handlePing = async () => {
        if (!ip) { toast.error('Enter an IP address first'); return; }
        setPinging(true);
        setPingResult(null);
        try {
            const res = await base44.functions.invoke('networkPrint', {
                action: 'ping',
                printer_ip: ip,
                printer_port: port,
            });
            const success = res.data?.success;
            setPingResult({ success, message: res.data?.message || (success ? 'Reachable' : 'Unreachable') });
            if (success) toast.success(res.data.message);
            else toast.error(res.data?.message || 'Printer unreachable');
        } catch (e) {
            setPingResult({ success: false, message: e.message });
            toast.error(`Ping failed: ${e.message}`);
        } finally {
            setPinging(false);
        }
    };

    const handleTestPrint = async () => {
        if (!ip) { toast.error('Enter an IP address first'); return; }
        setTesting(true);
        try {
            const res = await base44.functions.invoke('networkPrint', {
                action: 'test',
                printer_ip: ip,
                printer_port: port,
                command_set: commandSet,
                printer_name: printerName,
            });
            if (res.data?.success) toast.success('Test page sent successfully!');
            else toast.error(res.data?.error || 'Test print failed');
        } catch (e) {
            toast.error(`Test failed: ${e.message}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Info Banner */}
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex gap-2.5 text-xs text-emerald-800">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-emerald-600" />
                <div>
                    <p className="font-semibold mb-0.5">Network (Wi-Fi/LAN) Printing — Recommended</p>
                    <p className="leading-relaxed">The printer must be on the <strong>same local network</strong> as the server. Assign a <strong>static IP address</strong> to the printer to prevent it from changing. Default ESC/POS port is <code className="bg-white px-1 rounded">9100</code>.</p>
                </div>
            </div>

            {/* IP & Port inputs */}
            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                    <Label className="text-xs">Printer IP Address</Label>
                    <Input
                        placeholder="192.168.1.100"
                        value={ip}
                        onChange={e => onUpdate({ network_ip: e.target.value })}
                        className="mt-1 font-mono text-sm"
                    />
                </div>
                <div>
                    <Label className="text-xs">Port</Label>
                    <Input
                        placeholder="9100"
                        value={port}
                        onChange={e => onUpdate({ network_port: e.target.value })}
                        className="mt-1 font-mono text-sm"
                    />
                </div>
            </div>

            {/* Static IP reminder */}
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-800">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span><strong>Important:</strong> Set a static IP on your printer (via router DHCP reservation or printer's own network settings) so the IP never changes after a power cycle.</span>
            </div>

            {/* Ping result */}
            {pingResult && (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${pingResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    {pingResult.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                    {pingResult.message}
                </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePing}
                    disabled={pinging || !ip}
                    className="gap-1.5 text-xs"
                >
                    {pinging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Signal className="h-3.5 w-3.5" />}
                    {pinging ? 'Pinging…' : 'Test Connection'}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestPrint}
                    disabled={testing || !ip}
                    className="gap-1.5 text-xs"
                >
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
                    {testing ? 'Printing…' : 'Print Test Page'}
                </Button>
            </div>

            {/* Setup guide */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <details>
                    <summary className="px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100">
                        📋 How to set up your network printer
                    </summary>
                    <div className="px-4 py-3 text-xs text-gray-600 space-y-2 bg-white">
                        <p><strong className="text-gray-800">1. Connect printer to Wi-Fi or Ethernet</strong><br />Use the printer's control panel or companion app to join your restaurant's local network.</p>
                        <p><strong className="text-gray-800">2. Find the printer's IP address</strong><br />Print a network configuration page from the printer (usually via a button combo) or check your router's connected devices list.</p>
                        <p><strong className="text-gray-800">3. Assign a static IP</strong><br />In your router admin panel, reserve the IP for the printer's MAC address, or configure it statically in the printer's network settings.</p>
                        <p><strong className="text-gray-800">4. Enter IP + Port above</strong><br />Most thermal printers use port <code className="bg-gray-100 px-1 rounded">9100</code>. Enter the IP and click "Test Connection" to verify.</p>
                        <p><strong className="text-gray-800">5. Print Test Page</strong><br />Click "Print Test Page" to confirm ESC/POS commands reach the printer correctly.</p>
                        <p className="text-amber-700 bg-amber-50 border border-amber-100 rounded p-2"><strong>Note:</strong> The network print backend function must be able to reach your printer's IP. This works when the server and printer are on the same LAN, or when network routing allows it.</p>
                    </div>
                </details>
            </div>
        </div>
    );
}

// ── Utility: send a receipt to a network printer via backend function ──────
export async function printReceiptToNetworkPrinter({ printer, order, restaurant }) {
    const res = await base44.functions.invoke('networkPrint', {
        action: 'print_receipt',
        printer_ip: printer.network_ip,
        printer_port: printer.network_port || '9100',
        order,
        restaurant,
        config: {
            printer_width: printer.printer_width || '80mm',
            command_set: printer.command_set || 'esc_pos',
            template: printer.template || 'standard',
            show_logo: printer.show_logo !== false,
            show_order_number: printer.show_order_number !== false,
            show_customer_details: printer.show_customer_details !== false,
            header_text: printer.header_text || '',
            footer_text: printer.footer_text || '',
        },
    });
    if (!res.data?.success) throw new Error(res.data?.error || 'Network print failed');
    return true;
}