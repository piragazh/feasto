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

        setIsLoading(true);
        try {
            const result = await base44.functions.invoke('offlineOrderReview', {
                order_id: order.id,
                restaurant_id: restaurantId,
                action: selectedAction,
                review_notes: reviewNotes || null,
            });

            if (result?.data?.success) {
                toast.success(`Order marked as ${selectedAction}`);
                setShowDialog(false);
                setSelectedAction(null);
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

                    {/* Notes input */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-700">
                            Review notes (optional)
                        </label>
                        <textarea
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="Add your notes..."
                            className="w-full border rounded-lg p-2 text-xs resize-none h-20 focus:outline-none focus:border-blue-400"
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