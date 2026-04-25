import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Smartphone, CheckCircle2, AlertCircle, Clock, RefreshCw,
    Copy, Wifi, WifiOff, Circle, RotateCcw, X
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiUrl } from '@/lib/api-origin';

function JobStatusBadge({ job }) {
    const { status, retry_count, next_retry_at } = job;
    if (status === 'pending' && retry_count > 0) {
        const eta = next_retry_at ? new Date(next_retry_at).toLocaleTimeString() : '...';
        return <Badge className="bg-amber-100 text-amber-700 gap-1 text-xs"><RefreshCw className="h-3 w-3" />Retry #{retry_count} @ {eta}</Badge>;
    }
    if (status === 'pending')    return <Badge className="bg-amber-100 text-amber-700 gap-1 text-xs"><Clock className="h-3 w-3" />Pending</Badge>;
    if (status === 'processing') return <Badge className="bg-blue-100 text-blue-700 gap-1 text-xs"><RefreshCw className="h-3 w-3 animate-spin" />Processing</Badge>;
    if (status === 'done')       return <Badge className="bg-green-100 text-green-700 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Done</Badge>;
    if (status === 'failed')     return <Badge className="bg-red-100 text-red-700 gap-1 text-xs"><AlertCircle className="h-3 w-3" />Failed</Badge>;
    return <Badge className="bg-gray-100 text-gray-500 gap-1 text-xs"><Circle className="h-3 w-3" />{status}</Badge>;
}

function CopyField({ label, value, mono = false }) {
    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        toast.success(`${label} copied!`);
    };
    return (
        <div>
            <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>
            <div className="flex items-center gap-2">
                <code className={`flex-1 bg-gray-100 px-3 py-2 rounded-lg text-sm break-all ${mono ? 'font-mono' : ''}`}>
                    {value}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopy} className="flex-shrink-0 h-9 px-3">
                    <Copy className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}

const OFFLINE_THRESHOLD_MS = 60 * 1000; // 60 seconds

export default function AndroidAgentSetupPanel({ restaurantId }) {
    const [jobs, setJobs] = useState([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    // agentHeartbeats: { [agentId]: ISO timestamp of last seen }
    const [agentHeartbeats, setAgentHeartbeats] = useState({});
    const [now, setNow] = useState(Date.now());

    // Tick every 5s so Online/Offline badges re-evaluate
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(t);
    }, []);

    // Derive the function endpoint URLs using the canonical API origin
    // (avoids custom-domain hosts that don't expose backend function endpoints)
    const appId = import.meta.env.VITE_BASE44_APP_ID || '';
    const functionUrl = getApiUrl(`/api/v2/apps/${appId}/functions/managePrintQueue`);
    // Convert https:// → wss:// for the WebSocket endpoint
    const wsUrl = getApiUrl(`/api/v2/apps/${appId}/functions/printAgentWS`).replace(/^https/, 'wss').replace(/^http/, 'ws');

    // Build per-agent status from heartbeats (agentHeartbeats is now a map of agentId → DB record or fallback obj)
    const agentStatuses = Object.values(agentHeartbeats).map(agent => {
        const lastSeen = agent.last_seen;
        const ageMs = now - new Date(lastSeen).getTime();
        return {
            agentId: agent.agent_id,
            lastSeen,
            connectionMode: agent.connection_mode || 'polling',
            printerAddress: agent.printer_address || null,
            isOnline: ageMs < OFFLINE_THRESHOLD_MS,
            secondsAgo: Math.floor(ageMs / 1000),
        };
    });

    const fetchJobs = useCallback(async () => {
        if (!restaurantId) return;
        setLoadingJobs(true);
        try {
            // Fetch jobs AND agent heartbeats in parallel
            const [jobsRes, agentsRes] = await Promise.all([
                base44.functions.invoke('managePrintQueue', { action: 'list', restaurant_id: restaurantId }),
                base44.functions.invoke('managePrintQueue', { action: 'list_agents', restaurant_id: restaurantId }),
            ]);
            const fetchedJobs = jobsRes.data?.jobs || [];
            setJobs(fetchedJobs);

            // Build heartbeat map from real DB records (primary source)
            const dbAgents = agentsRes.data?.agents || [];
            const heartbeatMap = {};
            dbAgents.forEach(a => { heartbeatMap[a.agent_id] = a; });

            // Also seed from job activity as fallback for agents that never sent a heartbeat
            fetchedJobs.forEach(j => {
                if (!j.agent_id || heartbeatMap[j.agent_id]) return;
                const t = j.updated_date || j.created_date;
                if (t) heartbeatMap[j.agent_id] = { agent_id: j.agent_id, last_seen: t, connection_mode: 'polling' };
            });

            setAgentHeartbeats(heartbeatMap);
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

    const handleManualRetry = async (jobId) => {
        try {
            await base44.functions.invoke('managePrintQueue', { action: 'manual_retry', job_id: jobId, restaurant_id: restaurantId });
            toast.success('Job re-queued');
            fetchJobs();
        } catch (e) {
            toast.error('Retry failed: ' + e.message);
        }
    };

    const handleCancelJob = async (jobId) => {
        try {
            await base44.functions.invoke('managePrintQueue', { action: 'cancel', job_id: jobId, restaurant_id: restaurantId });
            toast.success('Job cancelled');
            fetchJobs();
        } catch (e) {
            toast.error('Cancel failed: ' + e.message);
        }
    };

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

    const pendingCount = jobs.filter(j => j.status === 'pending').length;
    const processingCount = jobs.filter(j => j.status === 'processing').length;
    const onlineCount = agentStatuses.filter(a => a.isOnline).length;

    return (
        <div className="space-y-5">
            {/* Active Android Agents */}
            <Card className={`border-2 ${onlineCount > 0 ? 'border-green-300 bg-green-50' : agentStatuses.length > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                <CardContent className="pt-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${onlineCount > 0 ? 'bg-green-100' : agentStatuses.length > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                            <Smartphone className={`h-5 w-5 ${onlineCount > 0 ? 'text-green-600' : agentStatuses.length > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">Android Print Agents</p>
                            <p className="text-xs text-gray-500">
                                {agentStatuses.length === 0
                                    ? 'No Android agents seen yet — waiting for tablets to connect'
                                    : `${onlineCount} online · ${agentStatuses.length - onlineCount} offline`}
                            </p>
                        </div>
                        {agentStatuses.length === 0 ? (
                            <Badge className="ml-auto bg-gray-100 text-gray-500 gap-1">
                                <WifiOff className="h-3 w-3" />Waiting
                            </Badge>
                        ) : onlineCount > 0 ? (
                            <Badge className="ml-auto bg-green-100 text-green-700 gap-1">
                                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
                                {onlineCount} Online
                            </Badge>
                        ) : (
                            <Badge className="ml-auto bg-red-100 text-red-700 gap-1">
                                <WifiOff className="h-3 w-3" />All Offline
                            </Badge>
                        )}
                    </div>

                    {agentStatuses.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {agentStatuses.map(({ agentId, isOnline, secondsAgo, connectionMode, printerAddress }) => (
                                <div
                                    key={agentId}
                                    className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-xs ${
                                        isOnline ? 'bg-white border-green-200' : 'bg-red-50 border-red-200'
                                    }`}
                                >
                                    <span className={`h-2 w-2 rounded-full flex-shrink-0 mt-1 ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                                    <div>
                                        <p className="font-mono text-gray-800 font-medium">{agentId}</p>
                                        <p className={`text-[10px] mt-0.5 ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                                            {isOnline
                                                ? secondsAgo < 5 ? 'Just now' : `${secondsAgo}s ago`
                                                : `Offline — last seen ${secondsAgo}s ago`}
                                        </p>
                                        {connectionMode && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">
                                                via {connectionMode === 'websocket' ? '⚡ WebSocket' : '🔄 HTTP Poll'}
                                            </p>
                                        )}
                                        {printerAddress && (
                                            <p className="text-[10px] text-gray-400 font-mono">{printerAddress}</p>
                                        )}
                                    </div>
                                    <Badge className={`ml-1 text-[10px] px-1.5 py-0 ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {isOnline ? 'Online' : 'Offline'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Android App Configuration */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Wifi className="h-4 w-4 text-blue-500" />
                        Android App Configuration
                    </CardTitle>
                    <CardDescription>Enter these values in your Android PrintService app settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* WebSocket (recommended) */}
                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl space-y-3">
                        <p className="text-xs font-semibold text-green-800 flex items-center gap-1.5">
                            <Wifi className="h-3.5 w-3.5" />
                            ⚡ Recommended: WebSocket Connection (real-time, instant push)
                        </p>
                        <CopyField
                            label="WebSocket URL (connect once, receive jobs instantly)"
                            value={`${wsUrl}?api_key=YOUR_API_KEY`}
                            mono
                        />
                        <p className="text-[11px] text-green-700 leading-relaxed">
                            Replace <code className="bg-green-100 px-1 rounded font-mono">YOUR_API_KEY</code> with your <code className="bg-green-100 px-1 rounded font-mono">ANDROID_APP_API_KEY</code> secret. 
                            After connecting, send <code className="bg-green-100 px-1 rounded font-mono">{"{"}"type":"register","restaurant_id":"...","agent_id":"android-tablet-1"{"}"}</code>
                        </p>
                    </div>

                    {/* HTTP Polling fallback */}
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                        <p className="text-xs font-semibold text-gray-600">Fallback: HTTP Polling (legacy)</p>
                        <CopyField
                            label="Print Queue Endpoint URL (HTTP polling)"
                            value={functionUrl}
                            mono
                        />
                    </div>

                    <CopyField
                        label="Restaurant ID"
                        value={restaurantId}
                        mono
                    />
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex gap-2">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div>
                            <strong>API Key:</strong> The <code className="bg-amber-100 px-1 rounded font-mono">ANDROID_APP_API_KEY</code> must be entered in the Android app. 
                            Your administrator has set this key — ask them for the value or find it in the Base44 dashboard under <strong>Settings → Secrets</strong>.
                        </div>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex gap-2">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div>
                            <strong>Agent ID:</strong> Set a unique name for each Android tablet (e.g. <code className="bg-blue-100 px-1 rounded font-mono">android-kitchen-1</code>, <code className="bg-blue-100 px-1 rounded font-mono">android-bar</code>). 
                            This identifies which device is processing jobs in the queue below.
                        </div>
                    </div>

                    {/* How it works */}
                    <div className="border rounded-xl p-4 bg-gray-50 text-sm space-y-3">
                        <p className="font-semibold text-gray-700">WebSocket Protocol (for Android developers)</p>
                        <div className="space-y-2 text-xs text-gray-600 font-mono">
                            <div className="bg-white border rounded-lg p-2 space-y-1">
                                <p className="text-gray-400 font-sans font-medium">1. Connect</p>
                                <p className="text-green-700">wss://...printAgentWS?api_key=YOUR_KEY</p>
                            </div>
                            <div className="bg-white border rounded-lg p-2 space-y-1">
                                <p className="text-gray-400 font-sans font-medium">2. Register</p>
                                <p className="text-blue-700">{'→ {"type":"register","restaurant_id":"...","agent_id":"android-1"}'}</p>
                                <p className="text-gray-500">{'← {"type":"registered","agent_id":"android-1"}'}</p>
                            </div>
                            <div className="bg-white border rounded-lg p-2 space-y-1">
                                <p className="text-gray-400 font-sans font-medium">3. Receive jobs (server pushes instantly)</p>
                                <p className="text-gray-500">{'← {"type":"new_job","job":{...}}'}</p>
                            </div>
                            <div className="bg-white border rounded-lg p-2 space-y-1">
                                <p className="text-gray-400 font-sans font-medium">4. Report result</p>
                                <p className="text-blue-700">{'→ {"type":"job_complete","job_id":"...","restaurant_id":"..."}'}</p>
                                <p className="text-blue-700">{'→ {"type":"job_failed","job_id":"...","restaurant_id":"...","error_message":"..."}'}</p>
                            </div>
                            <div className="bg-white border rounded-lg p-2 space-y-1">
                                <p className="text-gray-400 font-sans font-medium">5. Keepalive every 30s</p>
                                <p className="text-blue-700">{'→ {"type":"ping"}'}</p>
                                <p className="text-gray-500">{'← {"type":"pong"}'}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Job Queue Monitor */}
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
                            <CardDescription>Live view — auto-refreshes every 5s</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loadingJobs}>
                                <RefreshCw className={`h-3.5 w-3.5 ${loadingJobs ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleCleanup} disabled={cleaning}>
                                <X className="h-3.5 w-3.5 mr-1" />Clean up
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {jobs.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No print jobs yet</p>
                            <p className="text-xs mt-1">Jobs will appear here when orders are placed</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {jobs.map(job => (
                                <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-gray-800">
                                            {job.action === 'test' ? '🧪 Test Print' : '📄 Order Receipt'}
                                            {job.order_data?.order_number && (
                                                <span className="ml-1 text-gray-500">#{job.order_data.order_number}</span>
                                            )}
                                        </p>
                                        <p className="text-xs text-gray-400 truncate">
                                            {job.agent_id
                                                ? <span className="text-blue-600 font-mono">{job.agent_id}</span>
                                                : 'Unassigned'}
                                            {' · '}{new Date(job.created_date).toLocaleTimeString()}
                                            {(job.retry_count || 0) > 0 && (
                                                <span className="ml-1 text-amber-600">· {job.retry_count} retries</span>
                                            )}
                                        </p>
                                        {job.error_message && (
                                            <p className="text-xs text-red-600 mt-0.5 truncate">{job.error_message}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                        <JobStatusBadge job={job} />
                                        {job.status === 'failed' && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleManualRetry(job.id)}
                                                className="h-7 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50 gap-1"
                                            >
                                                <RotateCcw className="h-3 w-3" />Retry
                                            </Button>
                                        )}
                                        {(job.status === 'pending' || job.status === 'processing') && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleCancelJob(job.id)}
                                                className="h-7 px-2 text-xs text-red-600 border-red-300 hover:bg-red-50 gap-1"
                                            >
                                                <X className="h-3 w-3" />Cancel
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}