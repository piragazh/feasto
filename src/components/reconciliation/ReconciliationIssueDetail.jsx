import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
    AlertCircle,
    AlertTriangle,
    Info,
    ExternalLink,
    CheckCircle2,
    Clock,
    User,
    DollarSign,
    Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

const ISSUE_LABELS = {
    orphan_payment: 'Orphaned Payment',
    refund_failed: 'Refund Failed',
    unpaid_order: 'Unpaid Order',
    duplicate_payment: 'Duplicate Payment',
    duplicate_order: 'Duplicate Order',
    amount_mismatch: 'Amount Mismatch',
};

const SEVERITY_ICON = {
    critical: <AlertCircle className="h-4 w-4 text-destructive" />,
    warning: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
    info: <Info className="h-4 w-4 text-blue-500" />,
};

export default function ReconciliationIssueDetail({ issue, onResolved }) {
    const queryClient = useQueryClient();
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [actionInProgress, setActionInProgress] = useState(null);

    // Load linked payment transaction and order
    const [paymentTx, setPaymentTx] = React.useState(null);
    const [order, setOrder] = React.useState(null);

    React.useEffect(() => {
        const load = async () => {
            if (issue.payment_transaction_id) {
                const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({
                    id: issue.payment_transaction_id,
                });
                if (pts?.[0]) setPaymentTx(pts[0]);
            }
            if (issue.order_id) {
                const orders = await base44.asServiceRole.entities.Order.filter({
                    id: issue.order_id,
                });
                if (orders?.[0]) setOrder(orders[0]);
            }
        };
        load();
    }, [issue.id]);

    // Mutations
    const markReviewedMutation = useMutation({
        mutationFn: async () => {
            await base44.asServiceRole.entities.ReconciliationIssue.update(issue.id, {
                status: 'reviewed',
            });
        },
        onSuccess: () => {
            toast.success('Marked as reviewed');
            queryClient.invalidateQueries({ queryKey: ['reconciliation-issues'] });
        },
        onError: (err) => toast.error(err.message),
    });

    const resolveIssueMutation = useMutation({
        mutationFn: async (action) => {
            await base44.asServiceRole.entities.ReconciliationIssue.update(issue.id, {
                status: 'resolved',
                resolution_action: action,
                resolution_notes: resolutionNotes,
                resolved_at: new Date().toISOString(),
                resolved_by: (await base44.auth.me()).email,
            });
        },
        onSuccess: () => {
            toast.success('Issue resolved');
            queryClient.invalidateQueries({ queryKey: ['reconciliation-issues'] });
            onResolved();
        },
        onError: (err) => toast.error(err.message),
    });

    const escalateIssueMutation = useMutation({
        mutationFn: async () => {
            await base44.asServiceRole.entities.ReconciliationIssue.update(issue.id, {
                status: 'escalated',
                resolution_notes: resolutionNotes || 'Escalated for further investigation',
            });
        },
        onSuccess: () => {
            toast.success('Issue escalated to support');
            queryClient.invalidateQueries({ queryKey: ['reconciliation-issues'] });
        },
        onError: (err) => toast.error(err.message),
    });

    const formatDate = (date) => {
        if (!date) return '—';
        return new Date(date).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                {SEVERITY_ICON[issue.severity]}
                                <h3 className="font-semibold">
                                    {ISSUE_LABELS[issue.issue_type] || issue.issue_type}
                                </h3>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {issue.suggested_action}
                            </p>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Issue Details */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Issue Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <p className="text-muted-foreground">Detected</p>
                            <p className="font-medium">{formatDate(issue.detected_at)}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Status</p>
                            <Badge className="mt-1">{issue.status}</Badge>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Amount</p>
                            <p className="font-medium">£{(issue.amount || 0).toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Type</p>
                            <p className="font-medium">{issue.issue_type}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Payment Details */}
            {paymentTx && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Payment Transaction</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="grid grid-cols-1 gap-2">
                            <div>
                                <p className="text-muted-foreground">Payment Intent</p>
                                <p className="font-mono text-xs break-all">{paymentTx.payment_intent_id}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Status</p>
                                <Badge className="mt-1">{paymentTx.status}</Badge>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Customer</p>
                                <p className="text-xs">
                                    {paymentTx.guest_email || paymentTx.user_email}
                                    {paymentTx.guest_phone && ` • ${paymentTx.guest_phone}`}
                                </p>
                            </div>
                            {paymentTx.failure_reason && (
                                <div>
                                    <p className="text-muted-foreground">Failure Reason</p>
                                    <p className="text-xs">{paymentTx.failure_reason}</p>
                                </div>
                            )}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => window.open(`https://dashboard.stripe.com/payments/${paymentTx.payment_intent_id}`, '_blank')}
                        >
                            View in Stripe <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Order Details */}
            {order && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Order</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div>
                            <p className="text-muted-foreground">Order Number</p>
                            <p className="font-medium">{order.order_number || order.id}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Total</p>
                            <p className="font-medium">£{(order.total || 0).toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Status</p>
                            <Badge className="mt-1">{order.status}</Badge>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Resolution */}
            {(issue.status === 'open' || issue.status === 'reviewed') && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Resolution</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Textarea
                            placeholder="Resolution notes (required for closing)"
                            value={resolutionNotes}
                            onChange={(e) => setResolutionNotes(e.target.value)}
                            className="text-sm"
                            rows={3}
                        />

                        <div className="space-y-2">
                            {issue.status === 'open' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-xs"
                                    onClick={() => markReviewedMutation.mutate()}
                                    disabled={markReviewedMutation.isPending}
                                >
                                    Mark as Reviewed
                                </Button>
                            )}

                            <Button
                                size="sm"
                                className="w-full text-xs bg-green-600 hover:bg-green-700"
                                onClick={() => resolveIssueMutation.mutate('manual_refund_issued')}
                                disabled={!resolutionNotes || resolveIssueMutation.isPending}
                            >
                                Resolve & Close
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-xs"
                                onClick={() => escalateIssueMutation.mutate()}
                                disabled={escalateIssueMutation.isPending}
                            >
                                Escalate to Support
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Resolution Summary */}
            {(issue.status === 'resolved' || issue.status === 'closed') && (
                <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <CardTitle className="text-sm">Resolved</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div>
                            <p className="text-muted-foreground">Resolved By</p>
                            <p className="font-medium">{issue.resolved_by}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Action</p>
                            <p className="font-medium">{issue.resolution_action}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Notes</p>
                            <p className="text-xs">{issue.resolution_notes}</p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}