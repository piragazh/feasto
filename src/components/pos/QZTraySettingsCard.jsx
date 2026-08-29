import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Printer, CheckCircle2, Circle, RefreshCw, Search, Save, Zap, Download, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import qzTrayService from '@/lib/qzTrayService';

/**
 * QZ Tray settings card — manages the local QZ Tray connection,
 * printer selection, test print, and test cash drawer.
 * The selected printer name persists in restaurant.printer_config.qz_printer_name.
 */
export default function QZTraySettingsCard({ restaurantId }) {
    const queryClient = useQueryClient();
    const [status, setStatus] = useState(qzTrayService.getStatus());
    const [printerName, setPrinterName] = useState('');
    const [searching, setSearching] = useState(false);
    const [availablePrinters, setAvailablePrinters] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant-qz', restaurantId],
        queryFn: async () => {
            const [r] = await base44.entities.Restaurant.filter({ id: restaurantId });
            return r;
        },
        enabled: !!restaurantId,
    });

    useEffect(() => {
        const unsub = qzTrayService.subscribe((s) => setStatus(s));
        qzTrayService.connect();
        return unsub;
    }, []);

    // Close printer dropdown when clicking outside
    useEffect(() => {
        if (!showDropdown) return;
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showDropdown]);

    // Read the saved QZ Tray printer name from the centralized_printers[]
    // array (the single source of truth). Falls back to legacy
    // qz_printer_name for restaurants that haven't migrated yet.
    useEffect(() => {
        const printers = restaurant?.printer_config?.centralized_printers;
        if (Array.isArray(printers)) {
            const qzReceipt = printers.find(
                (p) => (p.connection_type || 'qz_tray') === 'qz_tray' && p.role === 'receipt'
            );
            if (qzReceipt?.qz_printer_name) {
                setPrinterName(qzReceipt.qz_printer_name);
                return;
            }
        }
        if (restaurant?.printer_config?.qz_printer_name) {
            setPrinterName(restaurant.printer_config.qz_printer_name);
        }
    }, [restaurant]);

    const mutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-qz', restaurantId]);
            queryClient.invalidateQueries(['restaurant-pos-printer', restaurantId]);
            toast.success('QZ Tray printer saved');
        },
        onError: () => toast.error('Failed to save QZ Tray printer'),
    });

    const handleSearch = async () => {
        if (!status.connected) {
            toast.error('QZ Tray is not connected. Install and start QZ Tray first.');
            return;
        }
        setSearching(true);
        try {
            const printers = await qzTrayService.findPrinters();
            setAvailablePrinters(printers);
            setShowDropdown(true);
            if (printers.length === 0) toast.info('No printers found via QZ Tray');
        } catch (e) {
            toast.error('Printer search failed: ' + e.message);
        } finally {
            setSearching(false);
        }
    };

    const handleSave = () => {
        const existingConfig = restaurant?.printer_config || {};
        const existingPrinters = Array.isArray(existingConfig.centralized_printers)
            ? existingConfig.centralized_printers
            : [];
        // Upsert the QZ Tray receipt printer into centralized_printers[]
        const idx = existingPrinters.findIndex(
            (p) => (p.connection_type || 'qz_tray') === 'qz_tray' && p.role === 'receipt'
        );
        const updatedPrinters = [...existingPrinters];
        const entry = {
            connection_type: 'qz_tray',
            role: 'receipt',
            qz_printer_name: printerName,
            assigned_channels: idx >= 0 ? (existingPrinters[idx].assigned_channels || ['pos_order']) : ['pos_order'],
        };
        if (idx >= 0) {
            updatedPrinters[idx] = { ...existingPrinters[idx], ...entry };
        } else {
            updatedPrinters.push(entry);
        }
        // Also keep legacy field in sync for any code that still reads it
        mutation.mutate({
            printer_config: {
                ...existingConfig,
                centralized_printers: updatedPrinters,
                qz_printer_name: printerName,
            },
        });
    };

    const handleTestPrint = async () => {
        if (!printerName) { toast.error('Select a printer first'); return; }
        if (!status.connected) { toast.error('QZ Tray not connected'); return; }
        try {
            await qzTrayService.printTest(printerName, restaurant?.printer_config?.command_set || 'esc_pos', restaurant?.printer_config?.printer_width || '80mm');
            toast.success('Test print sent');
        } catch (e) {
            toast.error('Test print failed: ' + e.message);
        }
    };

    const handleTestDrawer = async () => {
        if (!printerName) { toast.error('Select a printer first'); return; }
        if (!status.connected) { toast.error('QZ Tray not connected'); return; }
        try {
            await qzTrayService.openCashDrawer(printerName);
            toast.success('Cash drawer opened');
        } catch (e) {
            toast.error('Drawer test failed: ' + e.message);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-orange-500" />
                    QZ Tray (Direct Local Printing)
                </CardTitle>
                <CardDescription>
                    Connects directly to QZ Tray on this computer for instant receipt printing and cash drawer control — no cloud round-trip.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Connection status */}
                <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                        {status.connecting ? (
                            <Badge className="bg-amber-100 text-amber-700 gap-1.5">
                                <RefreshCw className="h-3 w-3 animate-spin" /> Connecting…
                            </Badge>
                        ) : status.connected ? (
                            <Badge className="bg-green-100 text-green-700 gap-1.5">
                                <CheckCircle2 className="h-3 w-3" /> QZ Tray Online
                            </Badge>
                        ) : (
                            <Badge className="bg-red-100 text-red-700 gap-1.5">
                                <Circle className="h-3 w-3" /> QZ Tray Offline
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!status.connected && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open('https://localhost:8181', '_blank')}
                                title="Open this URL in your browser and accept the certificate warning, then click Reconnect"
                            >
                                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                Accept Cert
                            </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => qzTrayService.connect({ manual: true })} disabled={status.connecting}>
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${status.connecting ? 'animate-spin' : ''}`} />
                            Reconnect
                        </Button>
                    </div>
                </div>

                {/* Last error diagnostic */}
                {!status.connected && !status.connecting && status.lastError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-xs text-red-800">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold mb-0.5">Connection Error:</p>
                            <p className="font-mono break-all">{status.lastError}</p>
                        </div>
                    </div>
                )}

                {!status.connected && !status.connecting && (
                    <div className="space-y-2">
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                            <Download className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>
                                Download and install <strong>QZ Tray</strong> (free) from{' '}
                                <a href="https://qz.io/download" target="_blank" rel="noopener noreferrer" className="underline font-semibold">qz.io/download</a>{' '}
                                on this Windows PC, then launch it. Then click <strong>Reconnect</strong>.
                            </span>
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-800">
                            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>
                                Still not connecting? This site uses HTTPS, so your browser must trust QZ Tray's
                                local certificate. Open{' '}
                                <a href="https://localhost:8181" target="_blank" rel="noopener noreferrer" className="underline font-semibold">https://localhost:8181</a>{' '}
                                in a new tab, click <strong>Advanced → Proceed</strong>, then come back and click <strong>Reconnect</strong>.
                            </span>
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-800">
                            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>
                                Certificate accepted but still stuck? Chrome now requires a separate <strong>Local Network Access</strong> permission
                                for this exact site before it will talk to QZ Tray at all. Click the site info icon next to the
                                address bar → <strong>Site settings</strong> → <strong>Permissions</strong> → set <strong>Local Network Access</strong> to <strong>Allow</strong>,
                                reload this page, then click <strong>Reconnect</strong>. This has to be granted separately on every domain this POS is opened from.
                            </span>
                        </div>
                    </div>
                )}

                {/* Printer name selection */}
                <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wide text-gray-500">Printer Name (via QZ Tray)</Label>
                    <div className="flex gap-2" ref={dropdownRef}>
                        <div className="relative flex-1">
                            <Input
                                placeholder="e.g. EPSON_TM_T20III"
                                value={printerName}
                                onChange={(e) => { setPrinterName(e.target.value); setShowDropdown(false); }}
                                onFocus={() => availablePrinters.length && setShowDropdown(true)}
                                className="font-mono text-sm"
                            />
                            {showDropdown && availablePrinters.length > 0 && (
                                <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white border rounded-lg shadow-lg">
                                    {availablePrinters.map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => { setPrinterName(p); setShowDropdown(false); }}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 font-mono"
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <Button size="sm" variant="outline" onClick={handleSearch} disabled={searching || !status.connected}>
                            <Search className={`h-3.5 w-3.5 mr-1.5 ${searching ? 'animate-spin' : ''}`} />
                            Search
                        </Button>
                    </div>
                    <p className="text-xs text-gray-500">Type the name or click Search to discover printers connected to this PC.</p>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-3 gap-2">
                    <Button onClick={handleSave} disabled={mutation.isPending || !printerName} variant="outline" size="sm">
                        <Save className="h-3.5 w-3.5 mr-1.5" /> Save
                    </Button>
                    <Button onClick={handleTestPrint} disabled={!status.connected || !printerName} variant="outline" size="sm">
                        <Printer className="h-3.5 w-3.5 mr-1.5" /> Test Print
                    </Button>
                    <Button onClick={handleTestDrawer} disabled={!status.connected || !printerName} variant="outline" size="sm">
                        <Zap className="h-3.5 w-3.5 mr-1.5" /> Test Drawer
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}