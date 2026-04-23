import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Smartphone, CheckCircle2, AlertCircle, Clock, RefreshCw,
    Copy, ExternalLink, Wifi, WifiOff, Circle, RotateCcw, X
} from 'lucide-react';
import { toast } from 'sonner';

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

export default function AndroidAgentSetupPanel({ restaurantId }) {
    const [jobs, setJobs] = useState([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [cleaning, setCleaning] = useState(false);

    // Derive the function endpoint URL
    const hostname = window.location.hostname;
    const appId = import.meta.env.VITE_BASE44_APP_ID;
    const functionUrl = `https://${hostname}/api/v2/apps/${appId}/functions/managePrintQueue`;

    // Detect active Android agents from recent 'processing' jobs
    const activeAgents = [...new Set(
        jobs
            .filter(j => j.agent_id && j.agent_id.startsWith('android-'))
            .map(j => j.agent_id)
    )];

    // Detect any agent that completed a job in the last 5 minutes
    const recentAgents = [...new Set(
        jobs
            .filter(j => {
                if (!j.agent_id || !j.completed_at) return false;
                return new Date(j.completed_at) > new Date(Date.now() - 5 * 60 * 1000);
            })
            .map(j => j.agent_id)
    )];

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

    const handleManualRetry = async (jobId) => {
        try {
            await base44.functions.invoke('managePrintQueue', { action: 'manual_retry', job_id: jobId });
            toast.success('Job re-queued');
            fetchJobs();
        } catch (e) {
            toast.error('Retry failed: ' + e.message);
        }
    };

    const handleCancelJob = async (jobId) => {
        try {
            await base44.functions.invoke('managePrintQueue', { action: 'cancel', job_id: jobId });
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

    return (
        <div className="space-y-5">
            {/* Active Android Agents */}
            <Card className={`border-2 ${recentAgents.length > 0 ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                <CardContent className="pt-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${recentAgents.length > 0 ? 'bg-green-100' : 'bg-gray-100'}`}>
                            <Smartphone className={`h-5 w-5 ${recentAgents.length > 0 ? 'text-green-600' : 'text-gray-400'}`} />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">Android Print Agents</p>
                            <p className="text-xs text-gray-500">
                                {recentAgents.length > 0
                                    ? `${recentAgents.length} agent(s) active in last 5 minutes`
                                    : 'No Android agents seen recently — waiting for tablets to connect'}
                            </p>
                        </div>
                        {recentAgents.length > 0 ? (
                            <Badge className="ml-auto bg-green-100 text-green-700 gap-1">
                                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
                                Connected
                            </Badge>
                        ) : (
                            <Badge className="ml-auto bg-gray-100 text-gray-500 gap-1">
                                <WifiOff className="h-3 w-3" />Waiting
                            </Badge>
                        )}
                    </div>

                    {recentAgents.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {recentAgents.map(agentId => (
                                <div key={agentId} className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-1.5 text-xs">
                                    <span className="h-2 w-2 rounded-full bg-green-400 inline-block" />
                                    <span className="font-mono text-gray-700">{agentId}</span>
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
                    <CopyField
                        label="Print Queue Endpoint URL"
                        value={functionUrl}
                        mono
                    />
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
                            This identifies which device is processing jobs in the queue below. It must start with <code className="bg-blue-100 px-1 rounded font-mono">android-</code> to appear in the agent list above.
                        </div>
                    </div>

                    {/* How it works */}
                    <div className="border rounded-xl p-4 bg-gray-50 text-sm space-y-2">
                        <p className="font-semibold text-gray-700">How it works</p>
                        <ol className="list-decimal list-inside space-y-1 text-gray-600 text-xs leading-relaxed">
                            <li>Open your Android PrintService app and go to <strong>Settings</strong></li>
                            <li>Paste the <strong>Endpoint URL</strong>, <strong>Restaurant ID</strong>, and <strong>API Key</strong> above</li>
                            <li>Set a unique <strong>Agent ID</strong> for this tablet</li>
                            <li>The app will automatically poll for new print jobs every few seconds</li>
                            <li>When a new order arrives, the job appears below and the tablet prints it automatically</li>
                        </ol>
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