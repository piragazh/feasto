import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const ADJUSTMENT_TYPES = [
    { value: 'correction',       label: 'Correction',        description: 'Fix a data or calculation error' },
    { value: 'goodwill',         label: 'Goodwill',          description: 'Customer service gesture' },
    { value: 'penalty',          label: 'Penalty',           description: 'Remove points (fraud/abuse)' },
    { value: 'expiry_reversal',  label: 'Expiry Reversal',   description: 'Reinstate expired points' },
    { value: 'bulk_promotion',   label: 'Bulk Promotion',    description: 'One-time campaign bonus' },
];

export default function LoyaltyAdjustmentDialog({ open, onOpenChange, targetUser, onSuccess }) {
    const [adjustmentType, setAdjustmentType] = useState('');
    const [pointsDelta, setPointsDelta] = useState('');
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);

    const reset = () => {
        setAdjustmentType('');
        setPointsDelta('');
        setReason('');
        setNote('');
    };

    const handleClose = () => {
        reset();
        onOpenChange(false);
    };

    const handleSubmit = async () => {
        if (!adjustmentType || !pointsDelta || !reason.trim()) return;
        const delta = parseInt(pointsDelta, 10);
        if (isNaN(delta) || delta === 0) {
            toast.error('Points delta must be a non-zero integer');
            return;
        }

        setLoading(true);
        try {
            const result = await base44.functions.invoke('adjustLoyaltyPoints', {
                user_email: targetUser.user_email,
                points_delta: delta,
                adjustment_type: adjustmentType,
                reason: reason.trim(),
                note: note.trim() || undefined,
            });

            if (!result?.data?.success) {
                throw new Error(result?.data?.error || 'Adjustment failed');
            }

            const { balance_before, balance_after, points_delta: actualDelta } = result.data;
            toast.success(
                `Adjusted ${actualDelta >= 0 ? '+' : ''}${actualDelta} pts for ${targetUser.user_email} (${balance_before} → ${balance_after})`
            );
            onSuccess?.();
            handleClose();
        } catch (err) {
            toast.error(err?.message || 'Failed to adjust points');
        } finally {
            setLoading(false);
        }
    };

    const deltaNum = parseInt(pointsDelta, 10);
    const isValid = adjustmentType && pointsDelta && !isNaN(deltaNum) && deltaNum !== 0 && reason.trim();

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Manual Loyalty Adjustment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-sm text-amber-800">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>This action is audited. You must provide a reason. Use negative values to deduct points.</span>
                    </div>

                    {targetUser && (
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                            <div>
                                <p className="font-medium text-sm">{targetUser.user_email}</p>
                                <p className="text-xs text-gray-500">Current balance</p>
                            </div>
                            <Badge className="bg-orange-100 text-orange-800 text-base font-bold">
                                {targetUser.total_points || 0} pts
                            </Badge>
                        </div>
                    )}

                    <div>
                        <Label>Adjustment Type *</Label>
                        <select
                            className="w-full border rounded-md px-3 py-2 mt-1 text-sm"
                            value={adjustmentType}
                            onChange={(e) => setAdjustmentType(e.target.value)}
                        >
                            <option value="">Select type…</option>
                            {ADJUSTMENT_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <Label>Points Delta *</Label>
                        <Input
                            type="number"
                            placeholder="e.g. 100 or -50"
                            value={pointsDelta}
                            onChange={(e) => setPointsDelta(e.target.value)}
                            className="mt-1"
                        />
                        {pointsDelta && !isNaN(deltaNum) && targetUser && (
                            <p className="text-xs text-gray-500 mt-1">
                                New balance: {Math.max(0, (targetUser.total_points || 0) + deltaNum)} pts
                            </p>
                        )}
                    </div>

                    <div>
                        <Label>Reason *</Label>
                        <Input
                            placeholder="Describe why this adjustment is needed"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="mt-1"
                        />
                    </div>

                    <div>
                        <Label>Internal Note (optional)</Label>
                        <Input
                            placeholder="Ticket number, case reference, etc."
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="mt-1"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!isValid || loading}>
                        {loading ? 'Applying…' : 'Apply Adjustment'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}