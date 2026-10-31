import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import AdSlide from './AdSlide';
import { cleanCopy } from './aiAdLogic';

/**
 * Edit the words on a published AI ad (headline, top line, call to action,
 * accent colour, price display) without regenerating the picture.
 * Prices and promo codes still come live from the till / coupon, so they
 * are not editable here — the same rule the AI creator follows.
 */
export default function AdTextEditor({ item, restaurantId, open, onClose, onSaved }) {
    const ov = item?.ad_overlay || {};
    const [form, setForm] = useState({ headline: '', hook: '', cta: '', accent: '#f97316', show_prices: true });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!item) return;
        setForm({
            headline: ov.headline || '',
            hook: ov.hook || '',
            cta: ov.cta || '',
            accent: ov.accent || '#f97316',
            show_prices: ov.show_prices !== false,
        });
    }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items-ai', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
        enabled: open && !!restaurantId && Array.isArray(ov.item_ids) && ov.item_ids.length > 0,
    });

    const cleaned = cleanCopy(form);
    const accent = /^#[0-9a-f]{6}$/i.test(form.accent) ? form.accent : (ov.accent || '#f97316');
    const previewItem = useMemo(() => item ? ({
        ...item,
        ad_overlay: { ...ov, ...cleaned, accent, show_prices: form.show_prices },
    }) : null, [item, cleaned.headline, cleaned.hook, cleaned.cta, accent, form.show_prices]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e }));

    const save = async () => {
        if (!item) return;
        setSaving(true);
        try {
            const ad_overlay = { ...ov, ...cleaned, accent, show_prices: form.show_prices };
            const title = cleaned.headline || item.title;
            await base44.entities.PromotionalContent.update(item.id, { ad_overlay, title });
            toast.success('Ad updated — screens pick it up within a minute');
            onSaved?.();
            onClose();
        } catch {
            toast.error("Couldn't save the ad. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const hasPrices = Array.isArray(ov.item_ids) && ov.item_ids.length > 0;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit ad text</DialogTitle>
                    <DialogDescription>Change the words on this ad. The picture stays the same; prices{ov.promo_code ? ' and the promo code' : ''} still come live from the till.</DialogDescription>
                </DialogHeader>
                <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-3">
                        <label className="block text-sm font-semibold text-gray-700">Top line
                            <Input value={form.hook} onChange={set('hook')} maxLength={24} placeholder="e.g. NEW" className="mt-1" />
                        </label>
                        <label className="block text-sm font-semibold text-gray-700">Headline
                            <Input value={form.headline} onChange={set('headline')} maxLength={48} placeholder="e.g. Crunch time" className="mt-1" />
                        </label>
                        <label className="block text-sm font-semibold text-gray-700">Call to action
                            <Input value={form.cta} onChange={set('cta')} maxLength={32} placeholder="e.g. Order at the counter" className="mt-1" />
                        </label>
                        <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">Accent colour
                            <input type="color" value={accent} onChange={set('accent')} className="h-9 w-12 rounded border border-gray-200 bg-white" aria-label="Accent colour" />
                        </label>
                        {hasPrices && (
                            <label className="flex items-center justify-between text-sm font-semibold text-gray-700">Show live prices
                                <Switch checked={form.show_prices} onCheckedChange={set('show_prices')} />
                            </label>
                        )}
                        <p className="text-[11px] text-gray-400">Prices typed into the text are removed — they always come from the till so the screen can't show an old price.</p>
                    </div>
                    <div>
                        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                            {previewItem && <AdSlide item={previewItem} menuItems={menuItems} now={new Date()} />}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1.5">Preview — exactly what the screen will show.</p>
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={save} disabled={saving} className="bg-orange-500 hover:bg-orange-600">{saving ? 'Saving…' : 'Save'}</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
