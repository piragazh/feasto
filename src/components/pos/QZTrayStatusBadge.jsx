import React, { useState, useEffect } from 'react';
import qzTrayService from '@/lib/qzTrayService';
import { Circle, RefreshCw, CheckCircle2, Printer, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Resolve the receipt-role QZ Tray printer name from the centralized
 * printer config array (the single source of truth managed by
 * CentralizedPrinterSettings). Falls back to legacy qz_printer_name
 * only for restaurants that haven't migrated yet.
 */
function resolveQzPrinterName(restaurant) {
    const printers = restaurant?.printer_config?.centralized_printers;
    if (Array.isArray(printers)) {
        const qzReceipt = printers.find(
            (p) => p.role === 'receipt' && (p.connection_type || 'qz_tray') === 'qz_tray'
        );
        if (qzReceipt?.qz_printer_name) return qzReceipt.qz_printer_name;
    }
    // Legacy fallback for unmigrated restaurants
    return restaurant?.printer_config?.qz_printer_name || null;
}

/**
 * QZ Tray connection status badge + Open Cash Drawer button.
 * Shows in the POS header. Auto-connects to QZ Tray on mount.
 */
export default function QZTrayStatusBadge({ restaurant, isDark }) {
    const [status, setStatus] = useState(qzTrayService.getStatus());
    const [opening, setOpening] = useState(false);

    useEffect(() => {
        const unsub = qzTrayService.subscribe((s) => setStatus(s));
        // Attempt auto-connect on POS mount
        qzTrayService.connect();
        return unsub;
    }, []);

    const printerName = resolveQzPrinterName(restaurant);

    const handleOpenDrawer = async () => {
        if (!printerName) {
            toast.error('No QZ Tray receipt printer configured. Add one in Printer Settings.');
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

    // Determine the display state
    const showCertLink = status.preflightFailed && !status.connected && !status.connecting;
    const showChecking = status.preflightChecking;
    const showConnecting = status.connecting && !status.preflightChecking;
    const showConnected = status.connected;

    return (
        <div className="flex items-center gap-1.5">
            {/* Status badge */}
            <div
                className={`flex items-center gap-1.5 border rounded-xl px-2.5 py-1.5 ${t.pill}`}
                title={
                    showConnected ? 'QZ Tray connected — local printing active'
                    : showChecking ? 'Checking if QZ Tray is reachable…'
                    : showCertLink ? 'Accept the QZ Tray certificate to enable printing'
                    : showConnecting ? 'Connecting to QZ Tray…'
                    : 'QZ Tray offline'
                }
            >
                {showChecking || showConnecting ? (
                    <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin" />
                ) : showConnected ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                ) : showCertLink ? (
                    <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                ) : (
                    <Circle className="h-3.5 w-3.5 text-gray-400" />
                )}
                <span className={`text-xs font-semibold ${
                    showConnected ? 'text-green-400'
                    : (showChecking || showConnecting) ? 'text-amber-400'
                    : showCertLink ? 'text-red-400'
                    : isDark ? 'text-gray-400' : 'text-gray-500'
                }`}>
                    {showConnected ? 'QZ'
                    : showChecking ? 'Checking…'
                    : showCertLink ? 'Accept Cert'
                    : showConnecting ? 'Connecting…'
                    : 'QZ Off'}
                </span>
                {showCertLink && (
                    <a
                        href="https://localhost:8181"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                        onClick={(e) => e.stopPropagation()}
                    >
                        open
                    </a>
                )}
            </div>

            {/* Open Cash Drawer button — only when QZ Tray connected and a printer is configured */}
            {showConnected && printerName && (
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