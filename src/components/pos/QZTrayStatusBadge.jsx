import React, { useState, useEffect } from 'react';
import qzTrayService from '@/lib/qzTrayService';
import { Circle, RefreshCw, CheckCircle2, Printer } from 'lucide-react';
import { toast } from 'sonner';

/**
 * QZ Tray connection status badge + Open Cash Drawer button.
 * Shows in the POS header. Auto-connects to QZ Tray on mount.
 */
export default function QZTrayStatusBadge({ restaurant, isDark }) {
    const [status, setStatus] = useState(qzTrayService.getStatus());
    const [opening, setOpening] = useState(false);

    useEffect(() => {
        qzTrayService.setConnectionStatusCallback((s) => setStatus(s));
        // Attempt auto-connect on POS mount
        qzTrayService.connect();
        return () => { qzTrayService.setConnectionStatusCallback(null); };
    }, []);

    const handleOpenDrawer = async () => {
        const printerName = restaurant?.printer_config?.qz_printer_name;
        if (!printerName) {
            toast.error('No printer configured for cash drawer');
            return;
        }
        setOpening(true);
        try {
            await qzTrayService.openCashDrawer(printerName);
            toast.success('Cash drawer opened');
        } catch (e) {
            toast.error('Could not open drawer: ' + (e?.message || 'QZ Tray not connected'));
        } finally {
            setOpening(false);
        }
    };

    const t = isDark
        ? { pill: 'bg-white/5 border-white/[0.08]', text: 'text-gray-300' }
        : { pill: 'bg-gray-100 border-gray-200', text: 'text-gray-600' };

    return (
        <div className="flex items-center gap-1.5">
            {/* Status badge */}
            <div className={`flex items-center gap-1.5 border rounded-xl px-2.5 py-1.5 ${t.pill}`}
                 title={status.connected ? 'QZ Tray connected — local printing active' : 'QZ Tray offline — install QZ Tray for direct printing'}>
                {status.connecting ? (
                    <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin" />
                ) : status.connected ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                ) : (
                    <Circle className="h-3.5 w-3.5 text-red-400" />
                )}
                <span className={`text-xs font-semibold ${status.connected ? 'text-green-400' : status.connecting ? 'text-amber-400' : 'text-red-400'}`}>
                    {status.connecting ? 'QZ…' : status.connected ? 'QZ' : 'QZ'}
                </span>
            </div>

            {/* Open Cash Drawer button — only when QZ Tray connected */}
            {status.connected && (
                <button
                    onClick={handleOpenDrawer}
                    disabled={opening}
                    aria-label="Open cash drawer"
                    className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-all ${t.pill} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-200'}`}
                    title="Open Cash Drawer"
                >
                    <Printer className={`h-4 w-4 ${opening ? 'animate-pulse text-amber-400' : isDark ? 'text-gray-400' : 'text-gray-600'}`} />
                </button>
            )}
        </div>
    );
}