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

const RESOLVED_CODES = {
    price_adjusted_on_sync: "Sync recalculation was fair",
    acceptable_policy_override: "Manual action was justified",
    customer_already_served: "Customer satisfied, no action needed",
    minor_discrepancy: "Variance within tolerance",
    other: "Other (requires documentation)"
};

const ESCALATED_CODES = {
    potential_abuse: "Suspicious pattern detected",
    large_price_mismatch: "Variance exceeds tolerance",
    repeated_offline_issues: "Recurring problems with this restaurant",
    needs_refund_followup: "Customer refund action required",
    other: "Other (requires documentation)"
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

    const getReasonCodes = () => {
        if (selectedAction === 'resolved') return RESOLVED_CODES;
        if (selectedAction === 'escalated') return ESCALATED_CODES;
        return {};
    };

    const isOtherCode = reviewReasonCode === 'other';
    const notesRequired = ['resolved', 'escalated'].includes(selectedAction) && isOtherCode;
    const notesLength = reviewNotes.trim().length;
    const canSubmit = () => {
        const requiresCode = ['resolved', 'escalated'].includes(selectedAction);
        if (requiresCode && !reviewReasonCode) return false;
        if (notesRequired && notesLength < 10) return false;
        return true;
    };

    const confirmAction = async () => {
        if (!selectedAction || !canSubmit()) return;

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
                                     {Object.entries(getReasonCodes()).map(([code, label]) => (
                                         <SelectItem key={code} value={code}>
                                             {label}
                                         </SelectItem>
                                     ))}
                                 </SelectContent>
                             </Select>
                         </div>
                     )}

                     {/* Notes input */}
                     {['resolved', 'escalated'].includes(selectedAction) && (
                         <div className="space-y-2">
                             <label className="text-xs font-medium text-gray-700">
                                 Notes {notesRequired && <span className="text-red-500">*required (min 10 chars for "Other")</span>}
                                 {!notesRequired && <span className="text-gray-400 font-normal">(optional)</span>}
                             </label>
                             <textarea
                                 value={reviewNotes}
                                 onChange={(e) => setReviewNotes(e.target.value)}
                                 placeholder={notesRequired ? "Explain the unique circumstances (required)..." : "Add optional context..."}
                                 className={`w-full border rounded-lg p-2 text-xs resize-none h-16 focus:outline-none ${
                                     notesRequired && notesLength < 10 ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-300 focus:border-blue-400'
                                 }`}
                             />
                             {notesRequired && (
                                 <p className={`text-xs ${notesLength >= 10 ? 'text-green-600' : 'text-red-600'}`}>
                                     {notesLength} / 10 characters
                                 </p>
                             )}
                         </div>
                     )}

                     {selectedAction === 'acknowledge' && (
                         <div className="space-y-2">
                             <label className="text-xs font-medium text-gray-700">Optional notes</label>
                             <textarea
                                 value={reviewNotes}
                                 onChange={(e) => setReviewNotes(e.target.value)}
                                 placeholder="Add context if needed..."
                                 className="w-full border border-gray-300 rounded-lg p-2 text-xs resize-none h-16 focus:outline-none focus:border-blue-400"
                             />
                         </div>
                     )}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmAction}
                            disabled={isLoading || !canSubmit()}
                            className="gap-2"
                        >
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                            {!canSubmit() ? 'Complete required fields' : 'Confirm'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}