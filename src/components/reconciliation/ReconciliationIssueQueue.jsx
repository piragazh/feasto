import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle, Info, ChevronRight } from 'lucide-react';

const ISSUE_LABELS = {
    orphan_payment: 'Orphaned Payment',
    refund_failed: 'Refund Failed',
    unpaid_order: 'Unpaid Order',
    duplicate_payment: 'Duplicate Payment',
    duplicate_order: 'Duplicate Order',
    amount_mismatch: 'Amount Mismatch',
    ambiguous_match: 'Ambiguous Match',
    payment_timeout: 'Payment Timeout',
    order_timeout: 'Order Timeout',
};

const SEVERITY_ICON = {
    critical: <AlertCircle className="h-4 w-4 text-destructive" />,
    warning: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
    info: <Info className="h-4 w-4 text-blue-500" />,
};

const SEVERITY_COLOR = {
    critical: 'bg-destructive/10 text-destructive border-destructive/30',
    warning: 'bg-yellow-50 text-yellow-900 border-yellow-200 dark:bg-yellow-950/20 dark:text-yellow-400 dark:border-yellow-700',
    info: 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-700',
};

const STATUS_BADGE = {
    open: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    reviewed: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    resolved: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    escalated: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
    closed: 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300',
};

export default function ReconciliationIssueQueue({ issues, selectedId, onSelect }) {
    // Sort: critical/open first, then warning, then info; within severity by created_date desc
    const sorted = [...issues].sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        const statusOrder = { open: 0, reviewed: 1, escalated: 2, resolved: 3, closed: 4 };

        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
            return severityOrder[a.severity] - severityOrder[b.severity];
        }
        if (statusOrder[a.status] !== statusOrder[b.status]) {
            return statusOrder[a.status] - statusOrder[b.status];
        }
        return new Date(b.created_date) - new Date(a.created_date);
    });

    return (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {sorted.map((issue) => (
                <button
                    key={issue.id}
                    onClick={() => onSelect(issue.id)}
                    className={`
                        w-full text-left p-3 rounded-lg border transition-all
                        ${selectedId === issue.id
                        ? 'ring-2 ring-primary border-primary bg-primary/5'
                        : `border-border hover:border-primary/50 ${SEVERITY_COLOR[issue.severity]}`
                    }
                    `}
                >
                    <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="mt-0.5 flex-shrink-0">
                            {SEVERITY_ICON[issue.severity]}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium text-sm truncate">
                                    {ISSUE_LABELS[issue.issue_type] || issue.issue_type}
                                </h3>
                                <Badge className={`text-xs ${STATUS_BADGE[issue.status]}`}>
                                    {issue.status}
                                </Badge>
                            </div>

                            <p className="text-xs text-muted-foreground truncate mb-2">
                                £{(issue.amount || 0).toFixed(2)} • {issue.metadata?.payment_intent_id?.slice(0, 12) || issue.metadata?.order_number || 'ID'}
                            </p>

                            <p className="text-xs text-muted-foreground line-clamp-2">
                                {issue.metadata?.customer_email || issue.metadata?.customer_phone || 'Unknown customer'}
                            </p>
                        </div>

                        {/* Chevron */}
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    </div>
                </button>
            ))}
        </div>
    );
}