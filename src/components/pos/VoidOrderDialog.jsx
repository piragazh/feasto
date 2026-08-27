import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';
import { Ban, Loader2 } from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const REASON_CODES = [
    { value: 'customer_changed_mind', label: 'Customer changed mind' },
    { value: 'item_unavailable', label: 'Item unavailable' },
    { value: 'duplicate_order', label: 'Duplicate order' },
    { value: 'payment_issue', label: 'Payment issue' },
    { value: 'operator_error', label: 'Operator error' },
    { value: 'restaurant_closed', label: 'Restaurant closed' },
    { value: 'manager_discretion', label: 'Manager discretion' },
    { value: 'other', label: 'Other' },
];

export default function VoidOrderDialog({ order, open, onClose, onUpdate, isDark = true }) {
    const [reasonCode, setReasonCode] = useState('');
    const [reasonNote, setReasonNote] = useState('');
    const [isVoiding, setIsVoiding] = useState(false);

    const handleVoid = async () => {
        if (!reasonCode) {
            toast.error('Please select a reason');
            return;
        }
        setIsVoiding(true);
        try {
            const result = await base44.functions.invoke('posVoidOrder', {
                order_id: order.id,
                reason_code: reasonCode,
                reason_note: reasonNote || undefined,
            });
            if (result?.data?.success) {
                const msg = result.data.card_paid_flagged_for_review
                    ? 'Order voided. Card refund flagged for review.'
                    : 'Order voided successfully';
                toast.success(msg);
                setReasonCode('');
                setReasonNote('');
                onUpdate?.();
                onClose();
            } else {
                toast.error(result?.data?.error || 'Failed to void order');
            }
        } catch (e) {
            toast.error('Failed to void order: ' + (e?.message || 'Unknown error'));
        } finally {
            setIsVoiding(false);
        }
    };

    const selectCls = isDark
        ? 'w-full h-10 px-3 rounded-md border bg-[#1a1d27] border-white/[0.08] text-white text-sm'
        : 'w-full h-10 px-3 rounded-md border bg-white border-gray-200 text-gray-900 text-sm';
    const labelCls = isDark ? 'text-white' : 'text-gray-900';

    return (
        <AlertDialog open={open} onOpenChange={(v) => { if (!v) { setReasonCode(''); setReasonNote(''); onClose(); } }}>
            <AlertDialogContent className={isDark ? 'bg-[#151720] border-white/[0.08] text-white' : 'bg-white border-gray-200 text-gray-900'}>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Ban className="h-5 w-5 text-red-500" />
                        Void Order
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Voiding order <strong>#{order?.id?.slice(0, 8)}</strong> (£{(order?.total || 0).toFixed(2)}).
                        {order?.payment_method === 'card' && (
                            <span className="block mt-2 text-orange-400 font-medium">
                                Card payment detected — refund will be flagged for admin review.
                            </span>
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="space-y-3 py-2">
                    <div>
                        <Label className={`${labelCls} mb-1.5`}>Reason *</Label>
                        <select
                            value={reasonCode}
                            onChange={(e) => setReasonCode(e.target.value)}
                            className={selectCls}
                        >
                            <option value="">Select a reason...</option>
                            {REASON_CODES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <Label className={`${labelCls} mb-1.5`}>Note (optional)</Label>
                        <Textarea
                            value={reasonNote}
                            onChange={(e) => setReasonNote(e.target.value)}
                            placeholder="Additional details..."
                            className={isDark ? 'bg-[#1a1d27] border-white/[0.08] text-white' : 'bg-white border-gray-200 text-gray-900'}
                            rows={2}
                        />
                    </div>
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel className={isDark ? 'bg-white/5 text-white border-white/[0.08]' : ''}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleVoid(); }}
                        disabled={!reasonCode || isVoiding}
                        className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                    >
                        {isVoiding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Ban className="h-4 w-4 mr-1" />}
                        Void Order
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}