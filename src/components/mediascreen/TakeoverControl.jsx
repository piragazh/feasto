import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Megaphone, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { isTakeoverActive } from './TakeoverScreen';
import { functionErrorMessage } from './screenHealth';

const PRESETS = [
    { label: 'Cash only', title: 'Cash only', message: 'Sorry — card payments are down right now.\nPlease pay with cash.', style: 'warning' },
    { label: 'Closing early', title: 'Closing early today', message: 'We are closing early today. Thank you for your understanding.', style: 'info' },
    { label: 'Kitchen closed', title: 'Kitchen closed', message: 'Our kitchen is closed for now. Drinks are still available.', style: 'warning' },
    { label: 'Long waits', title: 'Busy right now', message: 'Orders are taking a little longer than usual. Thank you for your patience!', style: 'info' },
    { label: 'Evacuate', title: 'Please leave the building', message: 'Please follow staff instructions and leave calmly by the nearest exit.', style: 'emergency' },
];

const DURATIONS = [
    { value: '15', label: '15 minutes' },
    { value: '60', label: '1 hour' },
    { value: '240', label: '4 hours' },
    { value: '0', label: 'Until I end it' },
];

/**
 * Push a priority message to every screen at this restaurant (or the selected ones).
 */
export default function TakeoverControl({ restaurantId, screens = [], selectedScreenIds = [], onChanged }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ title: '', message: '', style: 'warning', duration: '60', target: 'all' });

    const active = screens.filter(s => isTakeoverActive(s.takeover));
    const sample = active[0]?.takeover;

    const send = async () => {
        if (!form.title.trim() && !form.message.trim()) { toast.error('Enter a message'); return; }
        setBusy(true);
        try {
            const screenIds = form.target === 'selected' ? selectedScreenIds : undefined;
            if (form.target === 'selected' && !selectedScreenIds.length) throw new Error('Select screens first, or choose "All screens"');
            const res = await base44.functions.invoke('screenDevice', {
                action: 'set_takeover', restaurant_id: restaurantId, screen_ids: screenIds,
                title: form.title, message: form.message, style: form.style, duration_minutes: Number(form.duration),
            });
            const data = res?.data ?? res;
            toast.success(`Message showing on ${data?.screens || 0} screen(s) within ~20 seconds`);
            setOpen(false);
            onChanged?.();
        } catch (error) {
            toast.error(functionErrorMessage(error, 'Could not send message'));
        } finally {
            setBusy(false);
        }
    };

    const end = async () => {
        setBusy(true);
        try {
            await base44.functions.invoke('screenDevice', {
                action: 'clear_takeover', restaurant_id: restaurantId, screen_ids: active.map(s => s.id),
            });
            toast.success('Screens are back to normal');
            onChanged?.();
        } catch (error) {
            toast.error(functionErrorMessage(error, 'Could not end message'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            {active.length > 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="status">
                    <div className="flex items-center gap-3 min-w-0">
                        <Megaphone className="h-5 w-5 text-red-600 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-red-800 truncate">
                                Showing on {active.length} screen{active.length === 1 ? '' : 's'}: {sample?.title || sample?.message}
                            </p>
                            <p className="text-xs text-red-600">
                                {sample?.expires_at ? `Ends ${moment(sample.expires_at).fromNow()}` : 'Until ended'}{sample?.set_by ? ` · by ${sample.set_by}` : ''}
                            </p>
                        </div>
                    </div>
                    <Button size="sm" variant="destructive" onClick={end} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                        End now
                    </Button>
                </div>
            ) : (
                <Button variant="outline" onClick={() => setOpen(true)} className="border-red-200 text-red-700 hover:bg-red-50">
                    <Megaphone className="h-4 w-4 mr-2" />
                    Screen message
                </Button>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Show a message on screens</DialogTitle>
                        <DialogDescription>Replaces all content until it ends. Kiosks are not affected.</DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-wrap gap-2">
                        {PRESETS.map(p => (
                            <Button key={p.label} type="button" size="sm" variant="secondary"
                                onClick={() => setForm(f => ({ ...f, title: p.title, message: p.message, style: p.style }))}>
                                {p.label}
                            </Button>
                        ))}
                    </div>

                    <div className="space-y-3">
                        <div><Label htmlFor="to-title">Headline</Label>
                            <Input id="to-title" value={form.title} maxLength={80} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="mt-1.5" /></div>
                        <div><Label htmlFor="to-msg">Message</Label>
                            <Textarea id="to-msg" value={form.message} maxLength={300} rows={3} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} className="mt-1.5" /></div>
                        <div className="grid grid-cols-3 gap-3">
                            <div><Label>Style</Label>
                                <Select value={form.style} onValueChange={v => setForm(f => ({ ...f, style: v }))}>
                                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="info">Info (blue)</SelectItem>
                                        <SelectItem value="warning">Notice (amber)</SelectItem>
                                        <SelectItem value="emergency">Emergency (red)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div><Label>For</Label>
                                <Select value={form.duration} onValueChange={v => setForm(f => ({ ...f, duration: v }))}>
                                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                    <SelectContent>{DURATIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div><Label>Screens</Label>
                                <Select value={form.target} onValueChange={v => setForm(f => ({ ...f, target: v }))}>
                                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All screens</SelectItem>
                                        <SelectItem value="selected" disabled={!selectedScreenIds.length}>Selected ({selectedScreenIds.length})</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={send} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white">
                            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Show on screens
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
