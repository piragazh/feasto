import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    RefreshCw, CheckCircle2, AlertCircle, Clock,
    Wifi, Trash2, Circle, Play, Square, Zap, Download, Usb
} from 'lucide-react';
import { toast } from 'sonner';

// ── WebUSB helper ──────────────────────────────────────────────────────────
const usbAvailable = () => typeof navigator !== 'undefined' && !!navigator.usb;

async function connectUsbPrinter(vendorId, productId) {
    if (!usbAvailable()) throw new Error('WebUSB not supported in this browser');
    const filters = [];
    if (vendorId) filters.push({ vendorId: parseInt(vendorId, 16) });
    const device = await navigator.usb.requestDevice({ filters });
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    await device.claimInterface(0);
    return device;
}

async function sendToUsbPrinter(device, data) {
    // Find bulk OUT endpoint
    const iface = device.configuration.interfaces[0];
    const altIface = iface.alternates[0];
    const endpoint = altIface.endpoints.find(e => e.direction === 'out' && e.type === 'bulk');
    if (!endpoint) throw new Error('No bulk OUT endpoint found on USB printer');

    const chunkSize = 16384;
    for (let offset = 0; offset < data.byteLength; offset += chunkSize) {
        const chunk = data.slice(offset, offset + chunkSize);
        await device.transferOut(endpoint.endpointNumber, chunk);
    }
}

// Build minimal ESC/POS test page bytes
function buildTestBytes(printerName) {
    const enc = new TextEncoder();
    const ESC = 0x1b, GS = 0x1d;
    const init = new Uint8Array([ESC, 0x40]);
    const bold = new Uint8Array([ESC, 0x45, 1]);
    const boldOff = new Uint8Array([ESC, 0x45, 0]);
    const center = new Uint8Array([ESC, 0x61, 1]);
    const left = new Uint8Array([ESC, 0x61, 0]);
    const cut = new Uint8Array([GS, 0x56, 0x41, 0x03]);
    const lf = new Uint8Array([0x0a]);
    const title = enc.encode(`${printerName || 'USB Printer'}\n`);
    const line = enc.encode('================================\n');
    const msg = enc.encode('USB Connection OK\n');
    const ts = enc.encode(`${new Date().toLocaleString()}\n`);

    const parts = [init, center, bold, title, boldOff, line, msg, ts, line, left, lf, lf, lf, cut];
    const total = parts.reduce((n, p) => n + p.byteLength, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { out.set(p, pos); pos += p.byteLength; }
    return out;
}

// ── Job status badge ───────────────────────────────────────────────────────
function JobStatusBadge({ job }) {
    const { status, retry_count, next_retry_at } = job;
    if (status === 'pending' && retry_count > 0) {
        const eta = next_retry_at ? new Date(next_retry_at).toLocaleTimeString() : '...';
        return <Badge className="bg-amber-100 text-amber-700 gap-1"><RefreshCw className="h-3 w-3" />Retry #{retry_count} @ {eta}</Badge>;
    }
    if (status === 'pending')    return <Badge className="bg-amber-100 text-amber-700 gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    if (status === 'processing') return <Badge className="bg-blue-100 text-blue-700 gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Processing</Badge>;
    if (status === 'done')       return <Badge className="bg-green-100 text-green-700 gap-1"><CheckCircle2 className="h-3 w-3" />Done</Badge>;
    if (status === 'failed')     return <Badge className="bg-red-100 text-red-700 gap-1"><AlertCircle className="h-3 w-3" />Failed</Badge>;
    return <Badge className="bg-gray-100 text-gray-500 gap-1"><Circle className="h-3 w-3" />{status}</Badge>;
}

const AGENT_ID = 'dashboard-agent-' + Math.random().toString(36).slice(2, 10);

export default function LocalPrintAgentPanel({ restaurantId, printers = [] }) {
    const [jobs, setJobs] = useState([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const [agentRunning, setAgentRunning] = useState(false);
    const [stats, setStats] = useState({ done: 0, failed: 0, polls: 0 });
    const [agentLog, setAgentLog] = useState([]);
    // USB state
    const [usbDevice, setUsbDevice] = useState(null);
    const [connectingUsb, setConnectingUsb] = useState(false);
    const usbDeviceRef = useRef(null);

    const agentRunningRef = useRef(false);
    const pollTimerRef = useRef(null);
    const logRef = useRef(null);

    const networkPrinters = printers.filter(p => p.connection_type === 'network' && p.network_ip);
    const usbPrinters = printers.filter(p => p.connection_type === 'usb');
    const networkPrintersRef = useRef(networkPrinters);
    useEffect(() => { networkPrintersRef.current = networkPrinters; }, [networkPrinters]);

    const hasActivePrinters = networkPrinters.length > 0 || usbDevice !== null;

    const addLog = useCallback((msg, type = 'info') => {
        const entry = { msg, type, time: new Date().toLocaleTimeString() };
        setAgentLog(prev => [...prev.slice(-99), entry]);
        setTimeout(() => {
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        }, 50);
    }, []);

    // ── USB: Connect device ────────────────────────────────────────────────
    const handleUsbConnect = async (printer) => {
        setConnectingUsb(true);
        try {
            const device = await connectUsbPrinter(printer?.usb_vendor_id, printer?.usb_product_id);
            usbDeviceRef.current = device;
            setUsbDevice(device);
            addLog(`USB printer connected: ${device.productName || 'Unknown'}`, 'ok');
            toast.success(`USB printer connected: ${device.productName || 'USB Device'}`);
        } catch (e) {
            if (e.name !== 'NotFoundError') { // user cancelled — not an error
                addLog(`USB connect failed: ${e.message}`, 'err');
                toast.error(`USB connect failed: ${e.message}`);
            }
        } finally {
            setConnectingUsb(false);
        }
    };

    const handleUsbDisconnect = async () => {
        const device = usbDeviceRef.current;
        if (device) {
            try { await device.close(); } catch (_) {}
            usbDeviceRef.current = null;
            setUsbDevice(null);
            addLog('USB printer disconnected', 'info');
        }
    };

    const handleUsbTestPrint = async () => {
        const device = usbDeviceRef.current;
        if (!device) { toast.error('No USB printer connected'); return; }
        try {
            const printer = usbPrinters[0];
            const data = buildTestBytes(printer?.name || 'USB Printer');
            await sendToUsbPrinter(device, data.buffer);
            toast.success('USB test page sent!');
            addLog('USB test page printed', 'ok');
        } catch (e) {
            toast.error(`USB test failed: ${e.message}`);
            addLog(`USB test failed: ${e.message}`, 'err');
        }
    };

    // Cleanup USB on unmount
    useEffect(() => {
        return () => {
            const device = usbDeviceRef.current;
            if (device) { device.close().catch(() => {}); }
        };
    }, []);

    // ── Fetch job list for display ─────────────────────────────────────────
    const fetchJobs = useCallback(async () => {
        if (!restaurantId) return;
        setLoadingJobs(true);
        try {
            const res = await base44.functions.invoke('managePrintQueue', {
                action: 'list',
                restaurant_id: restaurantId,
            });
            setJobs(res.data?.jobs || []);
        } catch (e) {
            console.error('Failed to fetch jobs:', e);
        } finally {
            setLoadingJobs(false);
        }
    }, [restaurantId]);

    // ── Poll and process one job ───────────────────────────────────────────
    const pollOnce = useCallback(async () => {
        if (!agentRunningRef.current) return;
        setStats(s => ({ ...s, polls: s.polls + 1 }));

        let job = null;
        try {
            const res = await base44.functions.invoke('managePrintQueue', {
                action: 'poll',
                restaurant_id: restaurantId,
                agent_id: AGENT_ID,
            });
            job = res.data?.job;
        } catch (e) {
            addLog('Poll error: ' + e.message, 'err');
            return;
        }

        if (!job) return; // nothing pending

        addLog(`Picked up job ${job.id.slice(-6)} (${job.action})`, 'info');

        try {
            const currentPrinters = networkPrintersRef.current;

            // ── Try USB first if job has no IP and a USB device is connected ──
            const usbDev = usbDeviceRef.current;
            if (!job.printer_ip && usbDev) {
                // Build receipt via backend then send raw bytes over USB
                const printRes = await base44.functions.invoke('networkPrint', {
                    action: 'build_raw',  // returns base64 bytes without sending
                    printer_name: 'USB Printer',
                    command_set: job.command_set || 'esc_pos',
                    printer_width: job.printer_width || '80mm',
                    order: job.order_data,
                    restaurant: job.restaurant_data,
                    config: {
                        printer_width: job.printer_width || '80mm',
                        command_set: job.command_set || 'esc_pos',
                        template: job.template || 'standard',
                        show_customer_details: true,
                        show_order_number: true,
                        header_text: '',
                        footer_text: '',
                        ...(job.config || {}),
                    },
                });

                if (printRes.data?.raw_base64) {
                    const bytes = Uint8Array.from(atob(printRes.data.raw_base64), c => c.charCodeAt(0));
                    await sendToUsbPrinter(usbDev, bytes.buffer);
                } else {
                    throw new Error('Backend did not return raw bytes for USB printing');
                }
            } else {
                // Network path
                const printer = currentPrinters.find(p => p.network_ip === job.printer_ip) || currentPrinters[0];
                if (!printer) throw new Error('No network printer configured');

                const ip = job.printer_ip || printer.network_ip;
                const port = job.printer_port || printer.network_port || '9100';

                const printRes = await base44.functions.invoke('networkPrint', {
                    action: job.action === 'test' ? 'test' : 'print_receipt',
                    printer_ip: ip,
                    printer_port: port,
                    printer_name: printer.name || 'Printer',
                    command_set: job.command_set || printer.command_set || 'esc_pos',
                    order: job.order_data,
                    restaurant: job.restaurant_data,
                    config: {
                        printer_width: job.printer_width || printer.printer_width || '80mm',
                        command_set: job.command_set || printer.command_set || 'esc_pos',
                        template: job.template || printer.template || 'standard',
                        show_customer_details: printer.show_customer_details !== false,
                        show_order_number: printer.show_order_number !== false,
                        header_text: printer.header_text || '',
                        footer_text: printer.footer_text || '',
                        ...(job.config || {}),
                    },
                });

                if (!printRes.data?.success) throw new Error(printRes.data?.error || 'Print failed');
            }

            await base44.functions.invoke('managePrintQueue', {
                action: 'complete',
                job_id: job.id,
                agent_id: AGENT_ID,
            });

            setStats(s => ({ ...s, done: s.done + 1 }));
            addLog(`✓ Printed job ${job.id.slice(-6)}`, 'ok');
            fetchJobs();

        } catch (e) {
            // Report failure — backend will apply exponential backoff retry
            const failRes = await base44.functions.invoke('managePrintQueue', {
                action: 'fail',
                job_id: job.id,
                agent_id: AGENT_ID,
                error_message: e.message,
            }).catch(() => ({ data: {} }));

            const willRetry = failRes.data?.retried;
            const retryCount = failRes.data?.retry_count || 0;
            setStats(s => ({ ...s, failed: willRetry ? s.failed : s.failed + 1 }));
            addLog(
                willRetry
                    ? `↺ Job ${job.id.slice(-6)} failed (attempt ${retryCount}), will retry: ${e.message}`
                    : `✗ Job ${job.id.slice(-6)} permanently failed: ${e.message}`,
                'err'
            );
            fetchJobs();
        }
    // networkPrinters intentionally excluded — accessed via networkPrintersRef to avoid stale closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, addLog, fetchJobs]);

    // ── Start / stop agent ─────────────────────────────────────────────────
    const startAgent = useCallback(() => {
        if (agentRunningRef.current) return;
        if (networkPrinters.length === 0 && !usbDeviceRef.current) {
            toast.error('Configure a Network printer or connect a USB printer first');
            return;
        }
        agentRunningRef.current = true;
        setAgentRunning(true);
        addLog(`Agent started (${AGENT_ID})`, 'ok');
        pollTimerRef.current = setInterval(pollOnce, 3000);
        pollOnce();
    }, [networkPrinters, pollOnce, addLog]);

    const stopAgent = useCallback(() => {
        agentRunningRef.current = false;
        setAgentRunning(false);
        clearInterval(pollTimerRef.current);
        addLog('Agent stopped', 'info');
    }, [addLog]);

    // ── Auto-start when printers become available ─────────────────────────
    const hasAutoStarted = useRef(false);
    useEffect(() => {
        if (networkPrinters.length > 0 && !hasAutoStarted.current && !agentRunningRef.current) {
            hasAutoStarted.current = true;
            startAgent();
        }
        return () => {
            hasAutoStarted.current = false;
            agentRunningRef.current = false;
            clearInterval(pollTimerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [networkPrinters.length]);

    // ── Job list refresh ───────────────────────────────────────────────────
    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 5000);
        return () => clearInterval(interval);
    }, [fetchJobs]);

    const handleCleanup = async () => {
        setCleaning(true);
        try {
            const res = await base44.functions.invoke('managePrintQueue', {
                action: 'cleanup',
                restaurant_id: restaurantId,
            });
            toast.success(`Cleaned up ${res.data?.deleted || 0} old jobs`);
            fetchJobs();
        } catch (e) {
            toast.error('Cleanup failed');
        } finally {
            setCleaning(false);
        }
    };

    const handleTestPrint = async () => {
        if (networkPrinters.length === 0) { toast.error('No network printers configured'); return; }
        const printer = networkPrinters[0];
        try {
            await base44.functions.invoke('managePrintQueue', {
                action: 'enqueue',
                restaurant_id: restaurantId,
                print_action: 'test',
                printer_ip: printer.network_ip,
                printer_port: printer.network_port || '9100',
                command_set: printer.command_set || 'esc_pos',
            });
            toast.success('Test job queued — printing in a moment');
        } catch (e) {
            toast.error('Failed to queue test: ' + e.message);
        }
    };

    // ── Download fallback (for PC/browser use) ─────────────────────────────
    const handleDownload = () => {
        const appBaseUrl = window.location.origin;
        const functionBaseUrl = appBaseUrl.includes('localhost') ? 'http://localhost:3001' : appBaseUrl;
        const html = generateAgentHtml({ restaurantId, functionBaseUrl, printers: networkPrinters });
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `print-agent-${restaurantId.slice(0, 8)}.html`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Agent downloaded — open in Chrome on the PC');
    };

    const pendingCount = jobs.filter(j => j.status === 'pending').length;
    const processingCount = jobs.filter(j => j.status === 'processing').length;
    const retryingCount = jobs.filter(j => j.status === 'pending' && (j.retry_count || 0) > 0).length;

    return (
        <div className="space-y-4">
            {/* Agent Status Card */}
            <Card className={`border-2 ${agentRunning ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                <CardContent className="pt-5">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                        <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${agentRunning ? 'bg-green-100' : 'bg-gray-100'}`}>
                                <Zap className={`h-5 w-5 ${agentRunning ? 'text-green-600' : 'text-gray-400'}`} />
                            </div>
                            <div>
                                <p className="font-semibold text-sm">Dashboard Print Agent</p>
                                <p className="text-xs text-gray-500">
                                    {agentRunning
                                        ? 'Running — polling every 3 seconds'
                                        : 'Stopped — dashboard is not processing jobs'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {agentRunning ? (
                                <Badge className="bg-green-100 text-green-700 gap-1">
                                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
                                    Active
                                </Badge>
                            ) : (
                                <Badge className="bg-gray-100 text-gray-500 gap-1">
                                    <Circle className="h-3 w-3" />Stopped
                                </Badge>
                            )}
                            {agentRunning ? (
                                <Button variant="outline" size="sm" onClick={stopAgent} className="gap-1.5">
                                    <Square className="h-3.5 w-3.5" />Stop
                                </Button>
                            ) : (
                                <Button size="sm" onClick={startAgent} className="gap-1.5 bg-green-600 hover:bg-green-700">
                                    <Play className="h-3.5 w-3.5" />Start Agent
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={handleTestPrint} className="gap-1.5">
                                🧪 Test Print
                            </Button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-4 gap-3">
                        {[
                            { label: 'Printed',  value: stats.done,   color: 'text-green-600' },
                            { label: 'Failed',   value: stats.failed, color: 'text-red-600'   },
                            { label: 'Retrying', value: retryingCount, color: 'text-amber-600' },
                            { label: 'Polls',    value: stats.polls,  color: 'text-blue-600'  },
                        ].map(s => (
                            <div key={s.label} className="text-center bg-white rounded-lg p-3 border">
                                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                                <p className="text-xs text-gray-400">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {!hasActivePrinters && (
                        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-800">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>No printers available. Add a Network printer or connect a USB printer below.</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* USB Printer Section */}
            {usbAvailable() && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Usb className="h-4 w-4 text-gray-400" />
                            USB Printer (WebUSB)
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Connect a USB thermal printer directly from this browser tab. Requires Chrome/Edge on desktop.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {usbDevice ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                                    <div>
                                        <p className="font-medium text-green-800">{usbDevice.productName || 'USB Printer'} — Connected</p>
                                        <p className="text-xs text-green-600">VID: {usbDevice.vendorId?.toString(16).padStart(4, '0')} · PID: {usbDevice.productId?.toString(16).padStart(4, '0')}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={handleUsbTestPrint} className="gap-1.5">
                                        🧪 USB Test Print
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={handleUsbDisconnect} className="gap-1.5 text-red-600 hover:text-red-700">
                                        Disconnect
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-xs text-gray-500">
                                    Click below to select a USB printer. Make sure the printer is plugged in and turned on.
                                    {usbPrinters.length > 0 && ` ${usbPrinters.length} USB printer(s) configured in settings.`}
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleUsbConnect(usbPrinters[0])}
                                    disabled={connectingUsb}
                                    className="gap-1.5"
                                >
                                    <Usb className="h-3.5 w-3.5" />
                                    {connectingUsb ? 'Connecting...' : 'Connect USB Printer'}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Network Printers */}
            {networkPrinters.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Wifi className="h-4 w-4 text-gray-400" />
                            Network Printers ({networkPrinters.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {networkPrinters.map((p, i) => (
                                <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-sm">
                                    <span className="font-medium text-gray-700">🖨️ {p.name || `Printer ${i + 1}`}</span>
                                    <span className="text-gray-400 font-mono text-xs">{p.network_ip}:{p.network_port || '9100'}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Activity log */}
            {agentLog.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Activity Log</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div
                            ref={logRef}
                            className="bg-gray-900 rounded-lg p-3 font-mono text-xs max-h-40 overflow-y-auto space-y-0.5"
                        >
                            {agentLog.map((entry, i) => (
                                <p key={i} className={
                                    entry.type === 'ok'  ? 'text-green-400' :
                                    entry.type === 'err' ? 'text-red-400' :
                                    'text-blue-300'
                                }>
                                    [{entry.time}] {entry.msg}
                                </p>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Job Queue */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                Print Job Queue
                                {(pendingCount + processingCount) > 0 && (
                                    <span className="inline-flex items-center justify-center h-5 w-5 bg-orange-500 text-white text-[10px] font-bold rounded-full">
                                        {pendingCount + processingCount}
                                    </span>
                                )}
                            </CardTitle>
                            <CardDescription>Last 20 jobs · Auto-refreshes every 5s</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loadingJobs}>
                                <RefreshCw className={`h-3.5 w-3.5 ${loadingJobs ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleCleanup} disabled={cleaning}>
                                <Trash2 className="h-3.5 w-3.5 mr-1" />Clean up
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {jobs.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No print jobs yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {jobs.map(job => (
                                <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                                    <div>
                                        <p className="font-medium text-gray-800">
                                            {job.action === 'test' ? '🧪 Test Print' : '📄 Order Receipt'}
                                            {job.order_data?.order_number && (
                                                <span className="ml-1 text-gray-500">#{job.order_data.order_number}</span>
                                            )}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {job.printer_ip ? `${job.printer_ip}:${job.printer_port || '9100'}` : 'USB'}
                                            {' · '}{new Date(job.created_date).toLocaleTimeString()}
                                            {(job.retry_count || 0) > 0 && (
                                                <span className="ml-1 text-amber-600">· {job.retry_count} retries</span>
                                            )}
                                        </p>
                                        {job.error_message && (
                                            <p className="text-xs text-red-600 mt-0.5">{job.error_message}</p>
                                        )}
                                    </div>
                                    <JobStatusBadge job={job} />
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* PC fallback download */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
                <Download className="h-4 w-4 flex-shrink-0" />
                <span>
                    Using a <strong>PC/desktop browser</strong> instead of the tablet app?{' '}
                    <button onClick={handleDownload} className="underline text-orange-600 font-medium">
                        Download the standalone agent file
                    </button>{' '}
                    and open it in Chrome.
                </span>
            </div>
        </div>
    );
}

// ── Standalone HTML agent (PC fallback only) ────────────────────────────────
function generateAgentHtml({ restaurantId, functionBaseUrl, printers }) {
    const printersJson = JSON.stringify(printers);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>MealDrop Print Agent</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#1e293b}
  h1{font-size:1.2rem;margin:0 0 4px}.subtitle{color:#64748b;font-size:.85rem;margin:0 0 20px}
  .card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px}
  .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:99px;font-size:.75rem;font-weight:600}
  .badge-green{background:#dcfce7;color:#166534}.badge-gray{background:#f1f5f9;color:#475569}
  .log{background:#0f172a;color:#94a3b8;border-radius:8px;padding:12px;font-family:monospace;font-size:.78rem;max-height:200px;overflow-y:auto}
  .log p{margin:2px 0}.log .ok{color:#4ade80}.log .err{color:#f87171}.log .info{color:#60a5fa}
  .row{display:flex;justify-content:space-between;align-items:center}
  .stat{text-align:center;flex:1}.stat .num{font-size:1.5rem;font-weight:700}.stat .lbl{font-size:.7rem;color:#64748b}
  button{padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-weight:600;font-size:.85rem}
  .btn-primary{background:#f97316;color:white}.btn-outline{background:white;border:1px solid #e2e8f0;color:#475569}
  button:disabled{opacity:.5;cursor:not-allowed}
</style>
</head>
<body>
<h1>🖨️ MealDrop Print Agent (PC)</h1>
<p class="subtitle">Keep this tab open · It will auto-print new orders</p>
<div class="card">
  <div class="row" style="margin-bottom:12px">
    <span id="status-badge" class="badge badge-gray">⏸ Stopped</span>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" id="btn-start" onclick="startAgent()">▶ Start</button>
      <button class="btn-outline" id="btn-stop" onclick="stopAgent()" disabled>⏹ Stop</button>
    </div>
  </div>
  <div class="row">
    <div class="stat"><div class="num" id="stat-done">0</div><div class="lbl">Printed</div></div>
    <div class="stat"><div class="num" id="stat-fail">0</div><div class="lbl">Failed</div></div>
    <div class="stat"><div class="num" id="stat-retry">0</div><div class="lbl">Retrying</div></div>
    <div class="stat"><div class="num" id="stat-poll">0</div><div class="lbl">Polls</div></div>
  </div>
</div>
<div class="card"><div class="log" id="log"></div></div>
<script>
const RESTAURANT_ID=${JSON.stringify(restaurantId)};
const FUNCTION_BASE=${JSON.stringify(functionBaseUrl)};
const AGENT_ID='pc-agent-'+Math.random().toString(36).slice(2,10);
const PRINTERS=${printersJson};
let polling=false,pollTimer=null,statDone=0,statFail=0,statRetry=0,statPoll=0;
function log(msg,type=''){const d=document.getElementById('log');const p=document.createElement('p');p.className=type;p.textContent='['+new Date().toLocaleTimeString()+'] '+msg;d.appendChild(p);d.scrollTop=d.scrollHeight;if(d.children.length>200)d.removeChild(d.firstChild);}
function upd(){document.getElementById('stat-done').textContent=statDone;document.getElementById('stat-fail').textContent=statFail;document.getElementById('stat-retry').textContent=statRetry;document.getElementById('stat-poll').textContent=statPoll;}
async function api(payload){const r=await fetch(FUNCTION_BASE+'/api/functions/managePrintQueue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function printViaBackend(job){const printer=PRINTERS.find(p=>p.network_ip===job.printer_ip)||PRINTERS[0];if(!printer)throw new Error('No printer');const r=await fetch(FUNCTION_BASE+'/api/functions/networkPrint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:job.action==='test'?'test':'print_receipt',printer_ip:job.printer_ip||printer.network_ip,printer_port:job.printer_port||printer.network_port||'9100',printer_name:printer.name||'Printer',command_set:job.command_set||printer.command_set||'esc_pos',order:job.order_data,restaurant:job.restaurant_data,config:{printer_width:job.printer_width||printer.printer_width||'80mm',command_set:job.command_set||printer.command_set||'esc_pos',template:job.template||printer.template||'standard',show_customer_details:true,header_text:printer.header_text||'',footer_text:printer.footer_text||'',...(job.config||{})}})});const d=await r.json();if(!d.success)throw new Error(d.error||'Print failed');}
async function pollOnce(){if(!polling)return;statPoll++;upd();try{const res=await api({action:'poll',restaurant_id:RESTAURANT_ID,agent_id:AGENT_ID});const job=res.job;if(!job)return;log('Job '+job.id.slice(-6)+' ('+job.action+')','info');try{await printViaBackend(job);await api({action:'complete',job_id:job.id,agent_id:AGENT_ID});statDone++;log('✓ Printed','ok');}catch(e){const fr=await api({action:'fail',job_id:job.id,agent_id:AGENT_ID,error_message:e.message}).catch(()=>({}));if(fr.retried){statRetry++;log('↺ Retry '+fr.retry_count+': '+e.message,'err');}else{statFail++;log('✗ '+e.message,'err');}}}catch(e){log('Poll error: '+e.message,'err');}upd();}
function startAgent(){if(polling)return;polling=true;document.getElementById('status-badge').textContent='🟢 Running';document.getElementById('status-badge').className='badge badge-green';document.getElementById('btn-start').disabled=true;document.getElementById('btn-stop').disabled=false;log('Agent started','ok');pollTimer=setInterval(pollOnce,3000);pollOnce();}
function stopAgent(){polling=false;clearInterval(pollTimer);document.getElementById('status-badge').textContent='⏸ Stopped';document.getElementById('status-badge').className='badge badge-gray';document.getElementById('btn-start').disabled=false;document.getElementById('btn-stop').disabled=true;log('Stopped');}
window.onload=()=>{log('Ready. Click Start.','info');startAgent();};
</script>
</body>
</html>`;
}