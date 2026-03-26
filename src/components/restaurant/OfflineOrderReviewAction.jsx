import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

const REASON_CODES = {
    sync_validation_acceptable: "Sync validation is acceptable",
    discount_capped_correct: "Discount cap is policy-correct",
    coupon_expired_expected: "Coupon expiry is expected",
    price_reconciled_fair: "Price reconciled fairly",
    customer_contacted_satisfied: "Customer contacted & satisfied",
    needs_customer_contact: "Needs customer contact",
    policy_review_needed: "Policy review needed",
    system_error_found: "System error found",
    discount_excessive: "Discount appears excessive",
    unclear_validation_flag: "Validation flag unclear",
    other: "Other (specify in notes)"
};

/**
 * Offline Order Review Action Component
 * 
 * Manager actions for flagged offline orders:
 * - Acknowledge (confirmed)
 * - Resolved (acceptable as-is)
 * - Escalated (needs investigation)
 * 
 * Server-controlled: all actions POST to offlineOrderReview function
 * Audit logged automatically
 */
export default function OfflineOrderReviewAction({ order, restaurantId, onReviewComplete }) {
    const [isLoading, setIsLoading] = useState(false);
    const [selectedAction, setSelectedAction] = useState(null);
    const [reviewReasonCode, setReviewReasonCode] = useState('');
    const [reviewNotes, setReviewNotes] = useState('');
    const [showDialog, setShowDialog] = useState(false);

    if (!order.needs_review || order.offline_review_status !== 'new') {
        // Order already reviewed
        return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-blue-700 font-medium">
                    Reviewed: {order.offline_review_status} by {order.offline_review_by?.split('@')[0] || 'unknown'}
                </span>
            </div>
        );
    }

    const handleAction = async (action) => {
        setSelectedAction(action);
        setShowDialog(true);
    };

    const confirmAction = async () => {
        if (!selectedAction) return;

        // Enforce required reason code for terminal decisions
        const requiresReasonCode = ['resolved', 'escalated'].includes(selectedAction);
        if (requiresReasonCode && !reviewReasonCode) {
            toast.error(`Reason code required for "${selectedAction}" action`);
            return;
        }

        setIsLoading(true);
        try {
            const result = await base44.functions.invoke('offlineOrderReview', {
                order_id: order.id,
                restaurant_id: restaurantId,
                action: selectedAction,
                review_reason_code: reviewReasonCode || null,
                review_notes: reviewNotes?.trim() || null,
            });

            if (result?.data?.success) {
                toast.success(`Order marked as ${selectedAction}`);
                setShowDialog(false);
                setSelectedAction(null);
                setReviewReasonCode('');
                setReviewNotes('');
                if (onReviewComplete) {
                    onReviewComplete(order.id);
                }
            } else {
                toast.error(result?.data?.error || 'Action failed');
            }
        } catch (err) {
            toast.error(err?.message || 'Error processing review action');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className="flex gap-1.5 flex-wrap">
                <Button
                    onClick={() => handleAction('acknowledge')}
                    disabled={isLoading}
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 gap-1.5"
                >
                    <AlertCircle className="h-3 w-3" />
                    Acknowledge
                </Button>
                <Button
                    onClick={() => handleAction('resolved')}
                    disabled={isLoading}
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 gap-1.5"
                >
                    <CheckCircle2 className="h-3 w-3" />
                    Resolved
                </Button>
                <Button
                    onClick={() => handleAction('escalated')}
                    disabled={isLoading}
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
                >
                    <AlertTriangle className="h-3 w-3" />
                    Escalate
                </Button>
            </div>

            {/* Action confirmation dialog */}
            <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                            Mark Order as {selectedAction}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {selectedAction === 'acknowledge' && "Confirm you've reviewed this offline order."}
                            {selectedAction === 'resolved' && 'Mark this order as acceptable; no further action needed.'}
                            {selectedAction === 'escalated' && 'Flag for further investigation; needs manager attention.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {/* Reason code (for terminal decisions) */}
                    {['resolved', 'escalated'].includes(selectedAction) && (
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-700">
                                Reason <span className="text-red-500">*required</span>
                            </label>
                            <Select value={reviewReasonCode} onValueChange={setReviewReasonCode}>
                                <SelectTrigger className={`text-xs ${!reviewReasonCode ? 'border-red-300 bg-red-50' : ''}`}>
                                    <SelectValue placeholder="Select a reason..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(REASON_CODES).map(([code, label]) => (
                                        <SelectItem key={code} value={code}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Notes input (optional for all actions) */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-700">
                            Additional notes {(['resolved', 'escalated'].includes(selectedAction)) && <span className="text-gray-400 font-normal">(optional)</span>}
                        </label>
                        <textarea
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder={selectedAction === 'acknowledge' ? "Optional: add context..." : "Add more details..."}
                            className="w-full border border-gray-300 rounded-lg p-2 text-xs resize-none h-16 focus:outline-none focus:border-blue-400"
                        />
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmAction}
                            disabled={isLoading}
                            className="gap-2"
                        >
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}