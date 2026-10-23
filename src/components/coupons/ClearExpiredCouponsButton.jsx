import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader2, Eraser } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Clears coupons that have expired and were never used.
 * restaurantId set → only that restaurant's coupons; omitted → every coupon (Super Admin).
 * `coupons` (optional) is the list already on screen, used to show the count on the button.
 */
export default function ClearExpiredCouponsButton({ restaurantId, coupons, queryKeys = [] }) {
    const qc = useQueryClient();
    const [busy, setBusy] = useState(false);
    const today = new Date().toISOString().slice(0, 10);
    const count = Array.isArray(coupons)
        ? coupons.filter(c => c.valid_until && c.valid_until < today && !(Number(c.usage_count) > 0)).length
        : null;

    const run = async () => {
        setBusy(true);
        try {
            const call = (dry_run) => base44.functions.invoke('adminPurgeExpiredCoupons', { restaurant_id: restaurantId || null, dry_run })
                .then(r => { const d = r?.data ?? r; if (d?.error) throw new Error(d.error); return d; });
            const preview = await call(true);
            if (!preview.matched) { toast.success('No expired unused coupons to clear'); return; }
            const scope = restaurantId ? '' : ' across all restaurants';
            if (!window.confirm(`Clear ${preview.matched} expired coupon${preview.matched === 1 ? '' : 's'} that were never used${scope}?\n\nCoupons with no expiry date, or used at least once, are kept. Cleared coupons can be restored from Recently deleted.`)) return;
            const res = await call(false);
            toast.success(`Cleared ${res.deleted} expired coupon${res.deleted === 1 ? '' : 's'}`);
            queryKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
        } catch (e) {
            toast.error(e?.response?.data?.error || e.message || 'Could not clear coupons');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Button variant="outline" onClick={run} disabled={busy || count === 0} title="Remove coupons that have expired and were never used">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eraser className="h-4 w-4 mr-2" />}
            Clear expired{count ? ` (${count})` : ''}
        </Button>
    );
}
