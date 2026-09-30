import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link2, Monitor, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { createPageUrl } from '@/utils';
import { functionErrorMessage } from './screenHealth';

/**
 * Pair a physical display to a screen with a 6-digit code, and manage the
 * devices already paired to it.
 */
export default function ScreenPairingDialog({ screen, open, onOpenChange }) {
    const [code, setCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [devices, setDevices] = useState([]);
    const [loadingDevices, setLoadingDevices] = useState(false);

    const pairUrl = `${window.location.origin}${createPageUrl('MediaScreen')}`;

    const loadDevices = useCallback(async () => {
        if (!screen?.id) return;
        setLoadingDevices(true);
        try {
            const res = await base44.functions.invoke('screenDevice', { action: 'list', screen_id: screen.id });
            setDevices((res?.data ?? res)?.devices || []);
        } catch (error) {
            toast.error(functionErrorMessage(error, 'Could not load paired devices'));
        } finally {
            setLoadingDevices(false);
        }
    }, [screen?.id]);

    useEffect(() => {
        if (open) { setCode(''); loadDevices(); }
    }, [open, loadDevices]);

    const handlePair = async () => {
        const digits = code.replace(/\D/g, '');
        if (digits.length !== 6) { toast.error('Enter the 6-digit code shown on the display'); return; }
        setSubmitting(true);
        try {
            await base44.functions.invoke('screenDevice', { action: 'claim', code: digits, screen_id: screen.id });
            toast.success(`Display paired to "${screen.screen_name}" — it will start playing within a few seconds`);
            setCode('');
            loadDevices();
        } catch (error) {
            toast.error(functionErrorMessage(error, 'Pairing failed'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevoke = async (device) => {
        if (!window.confirm('Unpair this display? It will stop playing and show a new pairing code.')) return;
        try {
            await base44.functions.invoke('screenDevice', { action: 'revoke', session_id: device.id });
            toast.success('Display unpaired');
            loadDevices();
        } catch (error) {
            toast.error(functionErrorMessage(error, 'Could not unpair display'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Pair a display to "{screen?.screen_name}"</DialogTitle>
                    <DialogDescription>
                        On the TV or stick, open <span className="font-mono text-xs break-all">{pairUrl}</span> — it shows a 6-digit code. Enter it below.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex gap-2">
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handlePair(); }}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        aria-label="Pairing code"
                        className="font-mono text-lg tracking-widest"
                    />
                    <Button onClick={handlePair} disabled={submitting || code.length !== 6} className="bg-orange-500 hover:bg-orange-600">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4 mr-1.5" />}
                        {!submitting && 'Pair'}
                    </Button>
                </div>

                <div className="mt-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Paired displays</p>
                    {loadingDevices ? (
                        <p className="text-sm text-gray-400">Loading…</p>
                    ) : devices.length === 0 ? (
                        <p className="text-sm text-gray-400">No displays paired yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {devices.map((d) => (
                                <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Monitor className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm text-gray-800 truncate">{d.device_info?.resolution || 'Display'} · {d.device_info?.platform || 'unknown device'}</p>
                                            <p className="text-xs text-gray-400">
                                                {d.last_seen ? `Last seen ${moment(d.last_seen).fromNow()}` : 'Not seen yet'}
                                                {d.paired_by ? ` · paired by ${d.paired_by}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <Button size="sm" variant="ghost" onClick={() => handleRevoke(d)} aria-label="Unpair display" className="text-red-500 hover:text-red-600 h-8 w-8 p-0">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
