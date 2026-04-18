import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Wifi, WifiOff, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';

/**
 * AndroidPrintServicePanel
 * Lets restaurant staff configure and test the Android PrintService backup solution.
 *
 * The Android app runs an HTTP server on the tablet. This panel stores the tablet IP/port
 * in printer_config and lets the user ping the service and send a test print.
 */
export default function AndroidPrintServicePanel({ restaurant, onSave }) {
    const printerConfig = restaurant?.printer_config || {};
    const androidCfg = printerConfig.android_print_service || {};

    const [tabletIp, setTabletIp] = useState(androidCfg.tablet_ip || '');
    const [tabletPort, setTabletPort] = useState(androidCfg.tablet_port || '8080');
    const [printerIp, setPrinterIp] = useState(androidCfg.printer_ip || '');
    const [printerPort, setPrinterPort] = useState(androidCfg.printer_port || '9100');

    const [pingStatus, setPingStatus] = useState(null); // null | 'loading' | 'ok' | 'fail'
    const [pingMsg, setPingMsg] = useState('');
    const [testStatus, setTestStatus] = useState(null); // null | 'loading' | 'ok' | 'fail'
    const [testMsg, setTestMsg] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        const updatedConfig = {
            ...printerConfig,
            android_print_service: {
                tablet_ip: tabletIp.trim(),
                tablet_port: tabletPort.trim() || '8080',
                printer_ip: printerIp.trim(),
                printer_port: printerPort.trim() || '9100',
                enabled: true,
            },
        };
        await onSave({ printer_config: updatedConfig });
        setSaving(false);
    };

    const handlePing = async () => {
        setPingStatus('loading');
        setPingMsg('');
        const res = await base44.functions.invoke('androidPrint', {
            action: 'ping',
            tablet_ip: tabletIp.trim(),
            tablet_port: parseInt(tabletPort) || 8080,
        });
        if (res.data?.success) {
            setPingStatus('ok');
            setPingMsg(res.data.message || 'Reachable');
        } else {
            setPingStatus('fail');
            setPingMsg(res.data?.message || res.data?.error || 'Unreachable');
        }
    };

    const handleTestPrint = async () => {
        setTestStatus('loading');
        setTestMsg('');
        const res = await base44.functions.invoke('androidPrint', {
            action: 'test',
            tablet_ip: tabletIp.trim(),
            tablet_port: parseInt(tabletPort) || 8080,
            printer_ip: printerIp.trim() || null,
            printer_port: printerPort.trim() || '9100',
        });
        if (res.data?.success) {
            setTestStatus('ok');
            setTestMsg(res.data.message || 'Test print sent!');
        } else {
            setTestStatus('fail');
            setTestMsg(res.data?.error || 'Test print failed');
        }
    };

    const StatusIcon = ({ status }) => {
        if (status === 'loading') return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
        if (status === 'ok') return <CheckCircle className="w-4 h-4 text-green-500" />;
        if (status === 'fail') return <XCircle className="w-4 h-4 text-red-500" />;
        return null;
    };

    return (
        <div className="border rounded-xl p-5 bg-white space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg">
                    <Smartphone className="w-5 h-5 text-green-600" />
                </div>
                <div>
                    <h3 className="font-semibold text-gray-900">Android PrintService</h3>
                    <p className="text-sm text-gray-500">Backup print solution via Android tablet on local Wi-Fi</p>
                </div>
                <Badge className="ml-auto bg-green-100 text-green-700 border-green-200">Backup</Badge>
            </div>

            {/* How it works */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <strong>How it works:</strong> Install the PrintService APK on an Android tablet on the same Wi-Fi network. 
                Enter the tablet's local IP below. The tablet bridges print jobs to your thermal printer via TCP, Bluetooth, or USB.
            </div>

            {/* Config fields */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tablet IP Address</label>
                    <Input
                        value={tabletIp}
                        onChange={e => setTabletIp(e.target.value)}
                        placeholder="e.g. 192.168.1.10"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tablet HTTP Port</label>
                    <Input
                        value={tabletPort}
                        onChange={e => setTabletPort(e.target.value)}
                        placeholder="8080"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Printer IP (on tablet's network)</label>
                    <Input
                        value={printerIp}
                        onChange={e => setPrinterIp(e.target.value)}
                        placeholder="e.g. 192.168.1.50 (optional if BT/USB)"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Printer Port</label>
                    <Input
                        value={printerPort}
                        onChange={e => setPrinterPort(e.target.value)}
                        placeholder="9100"
                    />
                </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePing}
                    disabled={!tabletIp || pingStatus === 'loading'}
                    className="flex items-center gap-2"
                >
                    {pingStatus === 'loading' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Wifi className="w-4 h-4" />
                    )}
                    Ping Tablet
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestPrint}
                    disabled={!tabletIp || testStatus === 'loading'}
                    className="flex items-center gap-2"
                >
                    {testStatus === 'loading' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                    Send Test Print
                </Button>

                <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !tabletIp}
                    className="ml-auto flex items-center gap-2"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Save Configuration
                </Button>
            </div>

            {/* Status messages */}
            {pingStatus && pingMsg && (
                <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${pingStatus === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    <StatusIcon status={pingStatus} />
                    <span><strong>Ping:</strong> {pingMsg}</span>
                </div>
            )}
            {testStatus && testMsg && (
                <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${testStatus === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    <StatusIcon status={testStatus} />
                    <span><strong>Test Print:</strong> {testMsg}</span>
                </div>
            )}

            {/* Endpoint info */}
            {tabletIp && (
                <div className="bg-gray-50 border rounded-lg p-3 text-xs text-gray-600 font-mono">
                    Android endpoint: <span className="text-gray-900 font-semibold">http://{tabletIp}:{tabletPort}/print</span>
                </div>
            )}
        </div>
    );
}