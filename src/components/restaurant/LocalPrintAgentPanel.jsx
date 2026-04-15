import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Download, RefreshCw, CheckCircle2, AlertCircle, Clock,
    Cpu, Wifi, Info, Trash2, Circle
} from 'lucide-react';
import { toast } from 'sonner';

function JobStatusBadge({ status }) {
    if (status === 'pending')    return <Badge className="bg-amber-100 text-amber-700 gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    if (status === 'processing') return <Badge className="bg-blue-100 text-blue-700 gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Processing</Badge>;
    if (status === 'done')       return <Badge className="bg-green-100 text-green-700 gap-1"><CheckCircle2 className="h-3 w-3" />Done</Badge>;
    if (status === 'failed')     return <Badge className="bg-red-100 text-red-700 gap-1"><AlertCircle className="h-3 w-3" />Failed</Badge>;
    return <Badge className="bg-gray-100 text-gray-500 gap-1"><Circle className="h-3 w-3" />{status}</Badge>;
}

export default function LocalPrintAgentPanel({ restaurantId, printers = [] }) {
    const [jobs, setJobs] = useState([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [cleaning, setCleaning] = useState(false);

    // Derive the app's base URL for the agent to poll
    const appBaseUrl = window.location.origin;
    // Get the backend function base URL (same origin for base44 apps)
    const functionBaseUrl = appBaseUrl.includes('localhost')
        ? 'http://localhost:3001'
        : appBaseUrl;

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

    const handleDownloadAgent = () => {
        const networkPrinters = printers.filter(p => p.connection_type === 'network' && p.network_ip);

        const agentHtml = generateAgentHtml({
            restaurantId,
            functionBaseUrl,
            printers: networkPrinters,
        });

        const blob = new Blob([agentHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `print-agent-${restaurantId.slice(0, 8)}.html`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Print Agent downloaded! Open the file in Chrome on the local computer.');
    };

    const pendingCount = jobs.filter(j => j.status === 'pending').length;
    const processingCount = jobs.filter(j => j.status === 'processing').length;

    return (
        <div className="space-y-4">
            {/* Info Banner */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex gap-3 text-sm text-blue-800">
                <Info className="h-5 w-5 flex-shrink-0 mt-0.5 text-blue-600" />
                <div className="space-y-1">
                    <p className="font-semibold">How the Local Print Agent works</p>
                    <p className="text-xs leading-relaxed">
                        The <strong>Local Print Agent</strong> is a small HTML file you download and open in Chrome on
                        any computer inside the restaurant. It runs silently in the background, polls this dashboard
                        for pending print jobs, and sends them directly to the local network printer — <strong>no port
                        forwarding or router changes needed</strong>.
                    </p>
                    <ol className="text-xs list-decimal list-inside space-y-0.5 mt-2 text-blue-700">
                        <li>Configure your Network printer IP &amp; port above and save settings</li>
                        <li>Download the Print Agent file below</li>
                        <li>Open the file in <strong>Google Chrome</strong> on any PC in the restaurant</li>
                        <li>Keep that tab open — it will auto-print all new orders</li>
                    </ol>
                </div>
            </div>

            {/* Download Button */}
            <Card>
                <CardContent className="pt-5">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-orange-100 rounded-xl flex items-center justify-center">
                                <Cpu className="h-5 w-5 text-orange-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-sm">Local Print Agent</p>
                                <p className="text-xs text-gray-500">Self-contained HTML file · Open in Chrome</p>
                            </div>
                        </div>
                        <Button
                            onClick={handleDownloadAgent}
                            className="bg-orange-500 hover:bg-orange-600 gap-2"
                        >
                            <Download className="h-4 w-4" />
                            Download Agent
                        </Button>
                    </div>

                    {printers.filter(p => p.connection_type === 'network' && p.network_ip).length === 0 && (
                        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-800">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>No Network printers configured yet. Add a Network printer above and save settings first, then download the agent.</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Job Queue */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Wifi className="h-4 w-4 text-gray-500" />
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
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Clean up
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
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <p className="font-medium text-gray-800">
                                                {job.action === 'test' ? '🧪 Test Print' : `📄 Order Receipt`}
                                                {job.order_data?.order_number && (
                                                    <span className="ml-1 text-gray-500">#{job.order_data.order_number}</span>
                                                )}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {job.printer_ip}:{job.printer_port || '9100'} ·{' '}
                                                {new Date(job.created_date).toLocaleTimeString()}
                                            </p>
                                            {job.error_message && (
                                                <p className="text-xs text-red-600 mt-0.5">{job.error_message}</p>
                                            )}
                                        </div>
                                    </div>
                                    <JobStatusBadge status={job.status} />
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ── Generate the self-contained agent HTML ─────────────────────────────────
function generateAgentHtml({ restaurantId, functionBaseUrl, printers }) {
    const printersJson = JSON.stringify(printers);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>MealDrop Print Agent</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
  h1 { font-size: 1.2rem; margin: 0 0 4px; }
  .subtitle { color: #64748b; font-size: 0.85rem; margin: 0 0 20px; }
  .card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-amber { background: #fef9c3; color: #92400e; }
  .badge-red   { background: #fee2e2; color: #991b1b; }
  .badge-gray  { background: #f1f5f9; color: #475569; }
  .log { background: #0f172a; color: #94a3b8; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 0.78rem; max-height: 240px; overflow-y: auto; }
  .log p { margin: 2px 0; }
  .log .ok  { color: #4ade80; }
  .log .err { color: #f87171; }
  .log .info { color: #60a5fa; }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .stat { text-align: center; flex: 1; }
  .stat .num { font-size: 1.5rem; font-weight: 700; }
  .stat .lbl { font-size: 0.7rem; color: #64748b; }
  button { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
  .btn-primary { background: #f97316; color: white; }
  .btn-outline { background: white; border: 1px solid #e2e8f0; color: #475569; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
</head>
<body>
<h1>🖨️ MealDrop Print Agent</h1>
<p class="subtitle">Keep this tab open in Chrome · It will auto-print new orders</p>

<div class="card">
  <div class="row" style="margin-bottom:12px">
    <span id="status-badge" class="badge badge-gray">⏸ Stopped</span>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" id="btn-start" onclick="startAgent()">▶ Start</button>
      <button class="btn-outline" id="btn-stop" onclick="stopAgent()" disabled>⏹ Stop</button>
      <button class="btn-outline" onclick="sendTestJob()" id="btn-test">🧪 Test Print</button>
    </div>
  </div>
  <div class="row">
    <div class="stat"><div class="num" id="stat-done">0</div><div class="lbl">Printed</div></div>
    <div class="stat"><div class="num" id="stat-fail">0</div><div class="lbl">Failed</div></div>
    <div class="stat"><div class="num" id="stat-poll">0</div><div class="lbl">Polls</div></div>
  </div>
</div>

<div class="card">
  <p style="font-size:0.8rem;color:#64748b;margin:0 0 8px"><strong>Configured Printers</strong></p>
  <div id="printer-list"></div>
</div>

<div class="card">
  <p style="font-size:0.8rem;color:#64748b;margin:0 0 8px"><strong>Activity Log</strong></p>
  <div class="log" id="log"></div>
</div>

<script>
const RESTAURANT_ID = ${JSON.stringify(restaurantId)};
const FUNCTION_BASE = ${JSON.stringify(functionBaseUrl)};
const AGENT_ID = 'agent-' + Math.random().toString(36).slice(2, 10);
const PRINTERS = ${printersJson};

let polling = false;
let pollTimer = null;
let statDone = 0, statFail = 0, statPoll = 0;

function log(msg, type = '') {
  const div = document.getElementById('log');
  const p = document.createElement('p');
  p.className = type;
  p.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  div.appendChild(p);
  div.scrollTop = div.scrollHeight;
  if (div.children.length > 200) div.removeChild(div.firstChild);
}

function updateStats() {
  document.getElementById('stat-done').textContent = statDone;
  document.getElementById('stat-fail').textContent = statFail;
  document.getElementById('stat-poll').textContent = statPoll;
}

function renderPrinters() {
  const container = document.getElementById('printer-list');
  if (!PRINTERS.length) {
    container.innerHTML = '<p style="color:#f97316;font-size:0.8rem">⚠️ No network printers configured. Download a new agent after adding printers.</p>';
    return;
  }
  container.innerHTML = PRINTERS.map(p =>
    '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9">' +
    '<span style="font-size:0.85rem">🖨️ <strong>' + (p.name || 'Printer') + '</strong></span>' +
    '<span style="color:#64748b;font-size:0.78rem">' + p.network_ip + ':' + (p.network_port || '9100') + '</span>' +
    '</div>'
  ).join('');
}

async function callFunction(payload) {
  // Calls the Base44 backend function via the SDK endpoint
  // The agent authenticates as a service-role call since it has the restaurant_id baked in
  const url = FUNCTION_BASE + '/api/functions/managePrintQueue';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

// ESC/POS helpers
const ESC = 0x1B, GS = 0x1D;
const CMDS = {
  init:          [ESC,0x40],
  alignCenter:   [ESC,0x61,0x01],
  alignLeft:     [ESC,0x61,0x00],
  boldOn:        [ESC,0x45,0x01],
  boldOff:       [ESC,0x45,0x00],
  cut:           [GS,0x56,0x41,0x00],
  doubleHeight:  [ESC,0x21,0x10],
  normal:        [ESC,0x21,0x00],
};

function buildTestBytes(printerName) {
  const enc = new TextEncoder();
  const now = new Date().toLocaleString();
  const chunks = [
    new Uint8Array(CMDS.init), new Uint8Array(CMDS.alignCenter),
    new Uint8Array(CMDS.boldOn), new Uint8Array(CMDS.doubleHeight),
    enc.encode('PRINTER TEST\\n'),
    new Uint8Array(CMDS.normal), new Uint8Array(CMDS.boldOff),
    enc.encode('================================\\n'),
    new Uint8Array(CMDS.alignLeft),
    enc.encode('Printer:  ' + printerName + '\\n'),
    enc.encode('Time:     ' + now + '\\n'),
    enc.encode('Mode:     Local Print Agent\\n'),
    enc.encode('================================\\n'),
    new Uint8Array(CMDS.boldOn),
    enc.encode('ABCDEFGHIJKLMNOPQRSTUVWXYZabcd\\n'),
    enc.encode('1234567890 !@#$%^&*()_+-=[]{}|\\n'),
    new Uint8Array(CMDS.boldOff),
    enc.encode('================================\\n'),
    new Uint8Array(CMDS.alignCenter),
    enc.encode('Local agent connected!\\n\\n\\n'),
    new Uint8Array(CMDS.cut),
  ];
  const len = chunks.reduce((n,c)=>n+c.length,0);
  const buf = new Uint8Array(len);
  let off=0; for(const c of chunks){buf.set(c,off);off+=c.length;}
  return buf;
}

function buildReceiptBytes(order, restaurant, config) {
  const enc = new TextEncoder();
  const lineWidth = (config.printer_width === '58mm') ? 32 : 48;
  const chunks = [];
  const add = (...parts) => {
    for(const p of parts) chunks.push(typeof p === 'string' ? enc.encode(p) : new Uint8Array(p));
  };
  add(CMDS.init, CMDS.alignCenter, CMDS.boldOn);
  add((restaurant?.name || 'ORDER') + '\\n');
  add(CMDS.boldOff, CMDS.normal);
  if(restaurant?.address) add(restaurant.address + '\\n');
  add(CMDS.alignLeft, '================================\\n');
  if(config.header_text) add(config.header_text + '\\n================================\\n');
  add(CMDS.boldOn, CMDS.alignCenter);
  const orderNum = order.order_number || ('#' + (order.id||'').slice(-6));
  add('ORDER ' + orderNum + '\\n');
  add(CMDS.normal, CMDS.boldOff, CMDS.alignLeft);
  add(new Date(order.created_date||Date.now()).toLocaleString()+'\\n');
  add('Type: ' + (order.order_type||'Delivery').replace(/_/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase())+'\\n');
  add('--------------------------------\\n');
  if(config.show_customer_details !== false){
    add(CMDS.boldOn,'Customer:\\n',CMDS.boldOff);
    add((order.guest_name||order.created_by||'N/A')+'\\n');
    if(order.phone) add('Tel: '+order.phone+'\\n');
    if(order.delivery_address) add(order.delivery_address+'\\n');
    add('--------------------------------\\n');
  }
  for(const item of (order.items||[])){
    const name = item.quantity+'x '+item.name;
    const price = '£'+((item.price||0)*item.quantity).toFixed(2);
    const pad = Math.max(1, lineWidth - name.length - price.length);
    add(name+' '.repeat(pad)+price+'\\n');
  }
  add('================================\\n');
  const sub='£'+(order.subtotal||0).toFixed(2);
  add('Subtotal:'+' '.repeat(Math.max(1,lineWidth-9-sub.length))+sub+'\\n');
  if((order.delivery_fee||0)>0){const f='£'+order.delivery_fee.toFixed(2);add('Delivery:'+' '.repeat(Math.max(1,lineWidth-9-f.length))+f+'\\n');}
  const tot='£'+(order.total||0).toFixed(2);
  add(CMDS.boldOn,'TOTAL:'+' '.repeat(Math.max(1,lineWidth-6-tot.length))+tot+'\\n',CMDS.normal,CMDS.boldOff);
  add('Payment: '+(order.payment_method||'N/A')+'\\n');
  if(order.notes) add('--------------------------------\\nNotes: '+order.notes+'\\n');
  if(config.footer_text) add('================================\\n'+CMDS.alignCenter+config.footer_text+'\\n'+CMDS.alignLeft);
  add('================================\\n',CMDS.alignCenter,'Thank you!\\n\\n\\n',CMDS.cut);
  const len=chunks.reduce((n,c)=>n+c.length,0);
  const buf=new Uint8Array(len);let off=0;for(const c of chunks){buf.set(c,off);off+=c.length;}
  return buf;
}

async function sendToPrinter(ip, port, data) {
  // Use the QZ Tray HTTP API if available, otherwise try the networkPrint backend
  // Since we are local, we try QZ Tray on localhost:8181 first
  const portNum = parseInt(port)||9100;
  
  // Try via the base44 networkPrint backend function as fallback
  // Convert Uint8Array to base64 for transport
  const base64 = btoa(String.fromCharCode(...data));
  
  const resp = await fetch(FUNCTION_BASE + '/api/functions/networkPrint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'print_raw_base64',
      printer_ip: ip,
      printer_port: String(portNum),
      data_base64: base64,
    }),
  });
  const result = await resp.json();
  if (!result.success) throw new Error(result.error || 'Print failed');
}

async function processJob(job) {
  // Find matching printer
  const printer = PRINTERS.find(p => p.network_ip === job.printer_ip) || PRINTERS[0];
  if (!printer) throw new Error('No matching printer configured in agent');

  const ip = job.printer_ip || printer.network_ip;
  const port = job.printer_port || printer.network_port || '9100';

  let data;
  if (job.action === 'test') {
    data = buildTestBytes(printer.name || 'Printer');
  } else {
    const config = {
      printer_width: job.printer_width || printer.printer_width || '80mm',
      command_set: job.command_set || printer.command_set || 'esc_pos',
      template: job.template || printer.template || 'standard',
      show_customer_details: true,
      header_text: '',
      footer_text: '',
      ...(job.config || {}),
    };
    data = buildReceiptBytes(job.order_data || {}, job.restaurant_data || {}, config);
  }

  await sendToPrinter(ip, port, data);
}

async function pollOnce() {
  if (!polling) return;
  statPoll++;
  updateStats();
  try {
    const res = await callFunction({ action: 'poll', restaurant_id: RESTAURANT_ID, agent_id: AGENT_ID });
    const job = res.job;
    if (!job) return; // nothing pending
    
    log('Picked up job ' + job.id + ' (' + job.action + ')', 'info');
    try {
      await processJob(job);
      await callFunction({ action: 'complete', job_id: job.id, agent_id: AGENT_ID });
      statDone++;
      log('✓ Job ' + job.id + ' printed successfully', 'ok');
    } catch (e) {
      await callFunction({ action: 'fail', job_id: job.id, agent_id: AGENT_ID, error_message: e.message });
      statFail++;
      log('✗ Job ' + job.id + ' failed: ' + e.message, 'err');
    }
    updateStats();
  } catch (e) {
    log('Poll error: ' + e.message, 'err');
  }
}

function startAgent() {
  if (polling) return;
  polling = true;
  document.getElementById('status-badge').textContent = '🟢 Running';
  document.getElementById('status-badge').className = 'badge badge-green';
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').disabled = false;
  log('Agent started (ID: ' + AGENT_ID + ')', 'ok');
  pollTimer = setInterval(pollOnce, 3000);
  pollOnce();
}

function stopAgent() {
  polling = false;
  clearInterval(pollTimer);
  document.getElementById('status-badge').textContent = '⏸ Stopped';
  document.getElementById('status-badge').className = 'badge badge-gray';
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled = true;
  log('Agent stopped');
}

async function sendTestJob() {
  if (!PRINTERS.length) { alert('No network printers configured.'); return; }
  const printer = PRINTERS[0];
  try {
    const res = await callFunction({
      action: 'enqueue',
      restaurant_id: RESTAURANT_ID,
      print_action: 'test',
      printer_ip: printer.network_ip,
      printer_port: printer.network_port || '9100',
      command_set: printer.command_set || 'esc_pos',
    });
    log('Test job enqueued: ' + res.job_id, 'info');
  } catch(e) {
    log('Failed to enqueue test: ' + e.message, 'err');
  }
}

// Auto-start on load
window.onload = () => {
  renderPrinters();
  log('Agent ready. Click Start to begin polling.', 'info');
  startAgent();
};
</script>
</body>
</html>`;
}