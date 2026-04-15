import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Wifi, WifiOff, CheckCircle2, AlertCircle, RefreshCw,
    Send, Terminal, FlaskConical, Info, Printer, Zap
} from 'lucide-react';
import { toast } from 'sonner';

// ── Common ESC/POS snippets ────────────────────────────────────────────────
const ESC_SNIPPETS = [
    { label: 'Init printer',    cmd: '\\x1B\\x40' },
    { label: 'Cut paper',       cmd: '\\x1D\\x56\\x41\\x00' },
    { label: 'Feed 3 lines',    cmd: '\\x1B\\x64\\x03' },
    { label: 'Bold ON',         cmd: '\\x1B\\x45\\x01' },
    { label: 'Bold OFF',        cmd: '\\x1B\\x45\\x00' },
    { label: 'Align center',    cmd: '\\x1B\\x61\\x01' },
    { label: 'Align left',      cmd: '\\x1B\\x61\\x00' },
    { label: 'Double height',   cmd: '\\x1B\\x21\\x10' },
    { label: 'Normal size',     cmd: '\\x1B\\x21\\x00' },
];

const ZPL_SNIPPETS = [
    { label: 'Test label',      cmd: '^XA\n^FO50,50^A0N,30,30^FDTest Label^FS\n^XZ' },
    { label: 'Hello World',     cmd: '^XA\n^FO50,100^ADN,36,20^FDHello World^FS\n^XZ' },
    { label: 'Print config',    cmd: '~WC' },
    { label: 'Printer status',  cmd: '~HS' },
];

// Decode ESC/POS escape sequences in a string like \x1B\x40
function decodeEscapes(str) {
    return str.replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── Connectivity test result ───────────────────────────────────────────────
function PingResult({ result }) {
    if (!result) return null;
    const ok = result.success;
    return (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {ok
                ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                : <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />}
            <div>
                <p className={`font-medium ${ok ? 'text-green-800' : 'text-red-700'}`}>
                    {ok ? 'Printer reachable' : 'Cannot reach printer'}
                </p>
                {result.latency_ms != null && (
                    <p className="text-xs text-green-600">Response time: {result.latency_ms}ms</p>
                )}
                {result.error && <p className="text-xs text-red-600">{result.error}</p>}
            </div>
        </div>
    );
}

// ── Command response log ───────────────────────────────────────────────────
function CommandLog({ entries }) {
    if (!entries.length) return null;
    return (
        <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs max-h-52 overflow-y-auto space-y-1">
            {entries.map((e, i) => (
                <div key={i}>
                    <span className="text-gray-500">[{e.time}] </span>
                    <span className={e.ok ? 'text-green-400' : 'text-red-400'}>{e.ok ? '✓' : '✗'} </span>
                    <span className="text-gray-300">{e.msg}</span>
                    {e.detail && <div className="pl-6 text-gray-500">{e.detail}</div>}
                </div>
            ))}
        </div>
    );
}

// ── Per-printer diagnostic panel ───────────────────────────────────────────
function PrinterDiagPanel({ printer, index }) {
    const type = printer.connection_type || 'bluetooth';
    const ip = printer.network_ip;
    const port = printer.network_port || '9100';

    const [pinging, setPinging] = useState(false);
    const [pingResult, setPingResult] = useState(null);
    const [sending, setSending] = useState(false);
    const [rawMode, setRawMode] = useState('escpos'); // 'escpos' | 'zpl' | 'text'
    const [rawCmd, setRawCmd] = useState('');
    const [log, setLog] = useState([]);

    const addLog = (msg, ok, detail) => {
        setLog(prev => [...prev.slice(-49), { msg, ok, detail, time: new Date().toLocaleTimeString() }]);
    };

    // ── Ping / connectivity test ───────────────────────────────────────────
    const handlePing = async () => {
        if (!ip) { toast.error('No IP configured for this printer'); return; }
        setPinging(true);
        setPingResult(null);
        const t0 = Date.now();
        try {
            const res = await base44.functions.invoke('networkPrint', {
                action: 'ping',
                printer_ip: ip,
                printer_port: port,
            });
            const latency = Date.now() - t0;
            const ok = res.data?.success;
            const result = { success: ok, latency_ms: ok ? latency : null, error: res.data?.error };
            setPingResult(result);
            addLog(`Ping ${ip}:${port}`, ok, ok ? `${latency}ms` : res.data?.error);
        } catch (e) {
            setPingResult({ success: false, error: e.message });
            addLog(`Ping ${ip}:${port}`, false, e.message);
        } finally {
            setPinging(false);
        }
    };

    // ── Test print ────────────────────────────────────────────────────────
    const handleTestPrint = async () => {
        if (!ip) { toast.error('No IP configured for this printer'); return; }
        setSending(true);
        try {
            const res = await base44.functions.invoke('networkPrint', {
                action: 'test',
                printer_ip: ip,
                printer_port: port,
                printer_name: printer.name || `Printer ${index + 1}`,
                command_set: printer.command_set || 'esc_pos',
            });
            const ok = res.data?.success;
            addLog('Test print', ok, ok ? 'Page sent' : res.data?.error);
            if (ok) toast.success('Test page sent!');
            else toast.error(res.data?.error || 'Print failed');
        } catch (e) {
            addLog('Test print', false, e.message);
            toast.error(e.message);
        } finally {
            setSending(false);
        }
    };

    // ── Raw command send ──────────────────────────────────────────────────
    const handleSendRaw = async () => {
        if (!rawCmd.trim()) { toast.error('Enter a command first'); return; }
        if (!ip) { toast.error('No IP configured for this printer'); return; }
        setSending(true);
        try {
            let payload;
            if (rawMode === 'zpl') {
                // Send ZPL as text via raw_base64
                const bytes = new TextEncoder().encode(rawCmd);
                const b64 = btoa(String.fromCharCode(...bytes));
                payload = { action: 'print_raw_base64', printer_ip: ip, printer_port: port, raw_base64: b64 };
            } else if (rawMode === 'text') {
                const text = rawCmd + '\n';
                const bytes = new TextEncoder().encode(text);
                const b64 = btoa(String.fromCharCode(...bytes));
                payload = { action: 'print_raw_base64', printer_ip: ip, printer_port: port, raw_base64: b64 };
            } else {
                // ESC/POS — decode escape sequences then base64
                const decoded = decodeEscapes(rawCmd);
                const bytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)));
                const b64 = btoa(String.fromCharCode(...bytes));
                payload = { action: 'print_raw_base64', printer_ip: ip, printer_port: port, raw_base64: b64 };
            }

            const res = await base44.functions.invoke('networkPrint', payload);
            const ok = res.data?.success;
            addLog(`Send ${rawMode.toUpperCase()} command`, ok, ok ? 'Sent OK' : res.data?.error);
            if (ok) toast.success('Command sent!');
            else toast.error(res.data?.error || 'Send failed');
        } catch (e) {
            addLog('Send raw', false, e.message);
            toast.error(e.message);
        } finally {
            setSending(false);
        }
    };

    if (type !== 'network') {
        return (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex items-center gap-2">
                <Info className="h-4 w-4 flex-shrink-0" />
                Diagnostics are available for <strong>Network</strong> printers only. Bluetooth/USB printers can be tested via the printer card above.
            </div>
        );
    }

    const snippets = rawMode === 'zpl' ? ZPL_SNIPPETS : ESC_SNIPPETS;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <Printer className="h-4 w-4 text-gray-500" />
                    <span className="font-medium text-sm text-gray-800">{printer.name || `Printer ${index + 1}`}</span>
                    <Badge variant="outline" className="font-mono text-xs">{ip}:{port}</Badge>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handlePing} disabled={pinging} className="gap-1.5">
                        {pinging ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                        {pinging ? 'Pinging…' : 'Ping'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleTestPrint} disabled={sending} className="gap-1.5">
                        {sending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
                        Test Print
                    </Button>
                </div>
            </div>

            {/* Ping result */}
            <PingResult result={pingResult} />

            {/* Raw command sender */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Terminal className="h-3.5 w-3.5" />Raw Command
                    </Label>
                    {/* Mode tabs */}
                    <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                        {[
                            { id: 'escpos', label: 'ESC/POS' },
                            { id: 'zpl',    label: 'ZPL' },
                            { id: 'text',   label: 'Text' },
                        ].map(m => (
                            <button
                                key={m.id}
                                onClick={() => { setRawMode(m.id); setRawCmd(''); }}
                                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-all ${
                                    rawMode === m.id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Quick snippet buttons */}
                <div className="flex flex-wrap gap-1.5">
                    {snippets.map(s => (
                        <button
                            key={s.label}
                            onClick={() => setRawCmd(prev => prev ? prev + (rawMode === 'zpl' ? '\n' : '') + s.cmd : s.cmd)}
                            className="px-2 py-1 text-[11px] bg-gray-100 hover:bg-gray-200 rounded text-gray-600 border border-gray-200 transition-colors"
                        >
                            + {s.label}
                        </button>
                    ))}
                </div>

                <Textarea
                    value={rawCmd}
                    onChange={e => setRawCmd(e.target.value)}
                    placeholder={
                        rawMode === 'zpl'    ? '^XA\n^FO50,50^ADN,36,20^FDHello^FS\n^XZ' :
                        rawMode === 'text'   ? 'Hello, World!\nSecond line' :
                        '\\x1B\\x40\\x1B\\x61\\x01Hello\\n'
                    }
                    className="font-mono text-xs min-h-[80px] resize-y"
                />
                {rawMode === 'escpos' && (
                    <p className="text-[10px] text-gray-400">Use <code>\x1B</code>, <code>\x1D</code> etc. for escape bytes. They will be decoded before sending.</p>
                )}

                <Button onClick={handleSendRaw} disabled={sending || !rawCmd.trim()} size="sm" className="gap-1.5 bg-gray-800 hover:bg-gray-900">
                    {sending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send to Printer
                </Button>
            </div>

            {/* Activity log */}
            {log.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><Zap className="h-3 w-3" />Session Log</p>
                    <CommandLog entries={log} />
                </div>
            )}
        </div>
    );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function PrinterDiagnosticTool({ printers = [] }) {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const networkPrinters = printers.map((p, i) => ({ ...p, _origIdx: i })).filter(p => p.connection_type === 'network');

    return (
        <div className="space-y-4">
            <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 items-start">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold">Printer Diagnostic Tool</p>
                    <p>Test connectivity, send raw ESC/POS or ZPL commands, and inspect printer responses. Network printers only — save your printer settings first.</p>
                </div>
            </div>

            {printers.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">
                    No printers configured yet. Add a printer in the Printers tab first.
                </div>
            )}

            {printers.length > 0 && (
                <>
                    {/* Printer selector */}
                    {printers.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                            {printers.map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => setSelectedIdx(i)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border-2 transition-all ${
                                        selectedIdx === i
                                            ? 'border-gray-800 bg-gray-900 text-white'
                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    <Printer className="h-3.5 w-3.5" />
                                    {p.name || `Printer ${i + 1}`}
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">{p.connection_type || 'bt'}</Badge>
                                </button>
                            ))}
                        </div>
                    )}

                    <Card>
                        <CardContent className="pt-5">
                            <PrinterDiagPanel
                                printer={printers[selectedIdx]}
                                index={selectedIdx}
                            />
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}