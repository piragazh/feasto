import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Wifi, WifiOff, CheckCircle2, AlertCircle,
    FlaskConical, Info, Circle, Loader2, Signal,
    Bot, Router, ShieldAlert, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';

// ── Agent Status Hook ─────────────────────────────────────────────────────
// Infers agent liveness by checking for a recently-processed PrintJob.
// If any job was completed/processed within the last 5 minutes, agent is "online".
function useAgentStatus(restaurantId) {
    const [status, setStatus] = useState('unknown'); // unknown | online | offline
    const [lastSeen, setLastSeen] = useState(null);

    const check = useCallback(async () => {
        if (!restaurantId) return;
        try {
            const res = await base44.functions.invoke('managePrintQueue', {
                action: 'list',
                restaurant_id: restaurantId,
            });
            const jobs = res.data?.jobs || [];
            // Find the most recently completed/processing job
            const recentJob = jobs
                .filter(j => j.agent_id && (j.status === 'done' || j.status === 'processing'))
                .sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date))[0];

            if (recentJob) {
                const ageMs = Date.now() - new Date(recentJob.updated_date || recentJob.created_date).getTime();
                if (ageMs < 5 * 60 * 1000) { // within 5 minutes
                    setStatus('online');
                    setLastSeen(new Date(recentJob.updated_date || recentJob.created_date));
                    return;
                }
            }
            setStatus('offline');
        } catch {
            setStatus('unknown');
        }
    }, [restaurantId]);

    useEffect(() => {
        check();
        const interval = setInterval(check, 30_000);
        return () => clearInterval(interval);
    }, [check]);

    return { status, lastSeen, refresh: check };
}

// ── Agent Status Badge ────────────────────────────────────────────────────
function AgentStatusBadge({ status, lastSeen }) {
    if (status === 'online') {
        const mins = lastSeen ? Math.floor((Date.now() - lastSeen.getTime()) / 60000) : 0;
        return (
            <Badge className="bg-green-100 text-green-700 gap-1.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
                Agent Online {mins < 1 ? '(just now)' : `(${mins}m ago)`}
            </Badge>
        );
    }
    if (status === 'offline') {
        return (
            <Badge className="bg-red-100 text-red-700 gap-1.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
                Agent Offline
            </Badge>
        );
    }
    return (
        <Badge className="bg-gray-100 text-gray-500 gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-gray-300 inline-block" />
            Agent Status Unknown
        </Badge>
    );
}

// ── Network Printer Status Badge (ping-based) ─────────────────────────────
export function NetworkPrinterStatusBadge({ ip, port, pingIntervalMs = 60000 }) {
    const [status, setStatus] = useState('unknown');
    const timerRef = useRef(null);
    // Track current ip/port in a ref so the interval callback always sees latest values
    // without needing to be recreated on every change
    const ipRef = useRef(ip);
    const portRef = useRef(port);
    useEffect(() => { ipRef.current = ip; portRef.current = port; }, [ip, port]);

    const ping = useCallback(async () => {
        const currentIp = ipRef.current;
        if (!currentIp) return;
        setStatus('checking');
        try {
            const res = await base44.functions.invoke('networkPrint', {
                action: 'ping',
                printer_ip: currentIp,
                printer_port: portRef.current || '9100',
            });
            setStatus(res.data?.success ? 'reachable' : 'unreachable');
        } catch {
            setStatus('unreachable');
        }
    }, []); // stable — reads from refs

    useEffect(() => {
        if (!ip) { setStatus('unknown'); return; }
        // Stagger initial pings by up to 5s to avoid N simultaneous pings when multiple cards mount
        const initialDelay = Math.floor(Math.random() * 5000);
        const t = setTimeout(() => {
            ping();
            timerRef.current = setInterval(ping, pingIntervalMs);
        }, initialDelay);
        return () => { clearTimeout(t); clearInterval(timerRef.current); };
    }, [ip, pingIntervalMs, ping]);

    if (!ip) return <Badge className="bg-gray-100 text-gray-500 gap-1 text-xs"><Circle className="h-3 w-3" />Not Configured</Badge>;
    if (status === 'checking') return <Badge className="bg-amber-100 text-amber-700 gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" />Checking…</Badge>;
    if (status === 'reachable') return <Badge className="bg-green-100 text-green-700 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />{ip} — Reachable</Badge>;
    if (status === 'unreachable') return <Badge className="bg-red-100 text-red-700 gap-1 text-xs"><WifiOff className="h-3 w-3" />{ip} — Unreachable</Badge>;
    return <Badge className="bg-gray-100 text-gray-500 gap-1 text-xs"><Signal className="h-3 w-3" />{ip}</Badge>;
}

// ── Main Network Printer Manager Component ────────────────────────────────
export default function NetworkPrinterManager({ printer, onUpdate, restaurantId }) {
    const [testing, setTesting] = useState(false);
    const [pinging, setPinging] = useState(false);
    const [pingResult, setPingResult] = useState(null);
    const { status: agentStatus, lastSeen: agentLastSeen, refresh: refreshAgent } = useAgentStatus(restaurantId);

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
            setPingResult({ success, message: res.data?.message || (success ? 'Reachable from cloud' : 'Unreachable from cloud') });
            if (success) toast.success(res.data.message);
            else toast.warning(res.data?.message || 'Not reachable from cloud — use the Local Print Agent instead');
        } catch (e) {
            setPingResult({ success: false, message: e.message });
        } finally {
            setPinging(false);
        }
    };

    const handleTestPrint = async () => {
        if (!ip) { toast.error('Enter an IP address first'); return; }
        setTesting(true);
        try {
            const res = await base44.functions.invoke('managePrintQueue', {
                action: 'enqueue',
                restaurant_id: restaurantId,
                print_action: 'test',
                printer_ip: ip,
                printer_port: port,
                command_set: commandSet,
            });
            if (res.data?.success) {
                toast.success('Test job queued — the Local Print Agent will print it shortly');
                refreshAgent();
            } else {
                toast.error(res.data?.error || 'Failed to queue test job');
            }
        } catch (e) {
            toast.error(`Test failed: ${e.message}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="space-y-4">

            {/* How it works — architecture explanation */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5" />
                    How Network Printing Works
                </p>
                <div className="flex items-start gap-2 text-xs text-blue-800">
                    <div className="flex items-center gap-1.5 mt-0.5 flex-shrink-0 font-semibold">
                        <div className="h-6 w-6 rounded-full bg-blue-200 flex items-center justify-center text-blue-800 font-bold text-[10px]">1</div>
                        Cloud
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-blue-400" />
                    <div className="flex items-center gap-1.5 mt-0.5 flex-shrink-0 font-semibold">
                        <div className="h-6 w-6 rounded-full bg-blue-200 flex items-center justify-center text-blue-800 font-bold text-[10px]">2</div>
                        Local Agent
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-blue-400" />
                    <div className="flex items-center gap-1.5 mt-0.5 flex-shrink-0 font-semibold">
                        <div className="h-6 w-6 rounded-full bg-blue-200 flex items-center justify-center text-blue-800 font-bold text-[10px]">3</div>
                        Printer
                    </div>
                </div>
                <p className="text-xs text-blue-700 leading-relaxed">
                    The cloud cannot directly reach a printer on your local Wi-Fi network — printers have private IP addresses (e.g. <code className="bg-blue-100 px-1 rounded font-mono">192.168.1.x</code>) that are invisible from the internet.
                    The <strong>Local Print Agent</strong> runs on a PC/tablet on your restaurant's network. It polls the cloud for new print jobs and forwards them to your printer locally.
                </p>
            </div>

            {/* Agent Status Panel */}
            <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 flex-wrap ${
                agentStatus === 'online'   ? 'bg-green-50 border-green-200' :
                agentStatus === 'offline'  ? 'bg-red-50 border-red-200' :
                                            'bg-gray-50 border-gray-200'
            }`}>
                <div className="flex items-center gap-2.5">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        agentStatus === 'online'  ? 'bg-green-100' :
                        agentStatus === 'offline' ? 'bg-red-100' : 'bg-gray-100'
                    }`}>
                        <Bot className={`h-5 w-5 ${
                            agentStatus === 'online'  ? 'text-green-600' :
                            agentStatus === 'offline' ? 'text-red-500' : 'text-gray-400'
                        }`} />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-800">Local Print Agent</p>
                        <p className="text-[11px] text-gray-500">
                            {agentStatus === 'online'  ? 'Connected and processing print jobs' :
                             agentStatus === 'offline' ? 'Not detected — open the agent on your restaurant PC' :
                             'Open the "Local Agent" tab to set up and start the agent'}
                        </p>
                    </div>
                </div>
                <AgentStatusBadge status={agentStatus} lastSeen={agentLastSeen} />
            </div>

            {/* Printer Type Distinction */}
            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border-2 border-orange-200 bg-orange-50">
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <Bot className="h-4 w-4 text-orange-600" />
                        <span className="text-xs font-bold text-orange-800">Agent-Managed</span>
                        <Badge className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0 h-4">Recommended</Badge>
                    </div>
                    <p className="text-[11px] text-orange-700 leading-relaxed">
                        Print jobs are queued in the cloud and delivered by the Local Print Agent running on your restaurant's network. <strong>Works for all LAN printers.</strong>
                    </p>
                </div>
                <div className="p-3 rounded-lg border-2 border-gray-200 bg-gray-50">
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <Router className="h-4 w-4 text-gray-500" />
                        <span className="text-xs font-bold text-gray-600">Direct (Cloud)</span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                        The cloud connects directly to your printer's IP. Only works if your printer is <strong>publicly accessible</strong> (port forwarded). Not recommended.
                    </p>
                </div>
            </div>

            {/* Static IP Warning */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-800">
                <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <div>
                    <p className="font-semibold">Use a static IP address for your printer</p>
                    <p className="mt-0.5 leading-relaxed">
                        Printers get a new IP from the router each time they restart (DHCP). Set a <strong>DHCP reservation</strong> in your router admin panel (using the printer's MAC address) so it always gets the same IP — otherwise printing will break after a power cut.
                    </p>
                </div>
            </div>

            {/* IP & Port inputs */}
            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                    <Label className="text-xs font-medium">Printer IP Address <span className="text-gray-400">(on your local network)</span></Label>
                    <Input
                        placeholder="192.168.1.100"
                        value={ip}
                        onChange={e => onUpdate({ network_ip: e.target.value.trim() })}
                        className="mt-1 font-mono text-sm"
                    />
                </div>
                <div>
                    <Label className="text-xs font-medium">Port</Label>
                    <Input
                        placeholder="9100"
                        value={port}
                        onChange={e => onUpdate({ network_port: e.target.value.trim() })}
                        className="mt-1 font-mono text-sm"
                    />
                </div>
            </div>

            {/* Ping result */}
            {pingResult && (
                <div className={`flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg border ${pingResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    {pingResult.success
                        ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />}
                    <span>
                        {pingResult.message}
                        {!pingResult.success && <span className="block mt-0.5 text-amber-700">This is expected — the printer is on your local network. The Local Print Agent handles printing from within your restaurant.</span>}
                    </span>
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
                    {pinging ? 'Pinging…' : 'Test Cloud Reach'}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestPrint}
                    disabled={testing || !ip}
                    className="gap-1.5 text-xs"
                >
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
                    {testing ? 'Queuing…' : 'Queue Test Print (via Agent)'}
                </Button>
            </div>

            {/* Setup guide */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <details>
                    <summary className="px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100">
                        📋 Setup guide: network printer + local agent
                    </summary>
                    <div className="px-4 py-3 text-xs text-gray-600 space-y-2.5 bg-white">
                        <p><strong className="text-gray-800">1. Connect printer to your restaurant's Wi-Fi or Ethernet</strong><br />Use the printer's control panel or companion app to join your local network.</p>
                        <p><strong className="text-gray-800">2. Find the printer's IP address</strong><br />Print a network configuration page from the printer, or check your router's "Connected Devices" list.</p>
                        <p><strong className="text-gray-800">3. Reserve a static IP in your router</strong><br />Log into your router admin panel → DHCP reservations → add the printer's MAC address with a fixed IP (e.g. <code className="bg-gray-100 px-1 rounded font-mono">192.168.1.100</code>). This prevents the IP from changing after restarts.</p>
                        <p><strong className="text-gray-800">4. Enter the IP and port above, then save</strong><br />Default ESC/POS port is <code className="bg-gray-100 px-1 rounded font-mono">9100</code>.</p>
                        <p><strong className="text-gray-800">5. Start the Local Print Agent</strong><br />Go to the <strong>Local Agent</strong> tab in Printer Settings. Open the agent on a PC or tablet that stays on within your restaurant. It will automatically pick up and print new orders.</p>
                        <p><strong className="text-gray-800">6. Queue a test print</strong><br />Click "Queue Test Print" above. The agent will receive the job and print a test page within seconds.</p>
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