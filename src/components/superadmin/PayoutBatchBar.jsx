import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, CheckCircle, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Paying restaurants by bank file:
 *   approved payouts → "Export bank file" (CSV for your bank's bulk payment upload,
 *   payouts move to "processing") → upload & send in your bank → "Mark batch paid".
 * Payouts whose restaurant has no bank details, or details changed in the last 48h,
 * are skipped and stay approved.
 */
export default function PayoutBatchBar({ payouts, financeCall }) {
    const queryClient = useQueryClient();
    const [paidDates, setPaidDates] = useState({});
    const today = new Date().toISOString().slice(0, 10);
    const approved = payouts.filter((p) => p.status === 'pending' && p.net_payout > 0);
    const approvedTotal = approved.reduce((s, p) => s + (p.net_payout || 0), 0);
    const batches = Object.values(payouts.filter((p) => p.status === 'processing' && p.batch_id).reduce((acc, p) => {
        (acc[p.batch_id] ||= { id: p.batch_id, items: [], total: 0, exported_at: p.exported_at }).items.push(p);
        acc[p.batch_id].total += p.net_payout || 0;
        return acc;
    }, {}));
    const refresh = () => queryClient.invalidateQueries(['payouts']);

    const exportMutation = useMutation({
        mutationFn: () => financeCall('export_payment_batch', {}),
        onSuccess: (data) => {
            const blob = new Blob([data.csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `MealDrop-payments-${data.batch_id}.csv`; a.click();
            URL.revokeObjectURL(url);
            toast.success(`Bank file ${data.batch_id}: ${data.included.length} payment(s), £${data.total.toFixed(2)}. Upload it to your bank, then mark the batch paid.`);
            if (data.skipped?.length) toast.warning(`Not included: ${data.skipped.map((s) => `${s.restaurant} (${s.reason})`).join('; ')}`, { duration: 10000 });
            refresh();
        },
        onError: (e) => toast.error(e.message),
    });
    const paidMutation = useMutation({
        mutationFn: (batchId) => financeCall('mark_batch_paid', { batch_id: batchId, paid_date: paidDates[batchId] || today }),
        onSuccess: (data) => { toast.success(`${data.paid} payout(s) marked paid`); if (data.posting_errors?.length) toast.warning(`Not posted to the books: ${data.posting_errors[0]}`); refresh(); },
        onError: (e) => toast.error(e.message),
    });
    const cancelMutation = useMutation({
        mutationFn: (batchId) => financeCall('cancel_batch', { batch_id: batchId }),
        onSuccess: (data) => { toast.success(`${data.returned} payout(s) back to approved`); refresh(); },
        onError: (e) => toast.error(e.message),
    });

    if (!approved.length && !batches.length) return null;
    return (
        <div className="mb-6 space-y-3 rounded-lg border border-green-200 bg-green-50 p-4">
            {approved.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-green-900"><strong>{approved.length}</strong> approved payout(s) ready to pay — <strong>£{approvedTotal.toFixed(2)}</strong></p>
                    <Button size="sm" className="bg-green-700 hover:bg-green-800" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
                        <Download className="mr-2 h-4 w-4" />{exportMutation.isPending ? 'Preparing…' : 'Export bank file'}
                    </Button>
                </div>
            )}
            {batches.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-green-300 bg-white p-3 text-sm">
                    <div>
                        <p className="font-medium">Batch {b.id} — {b.items.length} payment(s), £{b.total.toFixed(2)}</p>
                        <p className="text-xs text-gray-500">{b.items.map((p) => p.restaurant_name).join(', ')} · exported {b.exported_at ? new Date(b.exported_at).toLocaleString('en-GB') : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input type="date" className="h-8 w-36" value={paidDates[b.id] || today} onChange={(e) => setPaidDates({ ...paidDates, [b.id]: e.target.value })} />
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={paidMutation.isPending} onClick={() => paidMutation.mutate(b.id)}>
                            <CheckCircle className="mr-1 h-4 w-4" />Mark batch paid
                        </Button>
                        <Button size="sm" variant="outline" disabled={cancelMutation.isPending} onClick={() => { if (window.confirm(`Cancel batch ${b.id}? Only do this if the bank did NOT send these payments.`)) cancelMutation.mutate(b.id); }}>
                            <Undo2 className="mr-1 h-4 w-4" />Cancel
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
}
