import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle2, Clock, AlertTriangle, TrendingDown } from 'lucide-react';
import ReconciliationIssueQueue from '@/components/reconciliation/ReconciliationIssueQueue';
import ReconciliationIssueDetail from '@/components/reconciliation/ReconciliationIssueDetail';
import ReconciliationTrends from '@/components/reconciliation/ReconciliationTrends';

export default function ReconciliationDashboard() {
    const queryClient = useQueryClient();
    const [selectedIssueId, setSelectedIssueId] = useState(null);
    const [filterType, setFilterType] = useState('all');
    const [filterSeverity, setFilterSeverity] = useState('all');
    const [filterStatus, setFilterStatus] = useState('open');

    const { data: user, isLoading: userLoading } = useQuery({
        queryKey: ['reconciliation-user'],
        queryFn: () => base44.auth.me(),
    });

    const isAuthorized = user?.role === 'admin';

    const { data: allIssues = [], isLoading: issuesLoading } = useQuery({
        queryKey: ['reconciliation-issues'],
        queryFn: async () => {
            const issues = await base44.entities.ReconciliationIssue.list('-created_date', 1000);
            return issues || [];
        },
        enabled: isAuthorized,
        refetchInterval: 60000,
    });

    // filteredIssues must be declared before any early returns (Rules of Hooks)
    const filteredIssues = useMemo(() => {
        return allIssues.filter((issue) => {
            if (filterStatus !== 'all' && issue.status !== filterStatus) return false;
            if (filterType !== 'all' && issue.issue_type !== filterType) return false;
            if (filterSeverity !== 'all' && issue.severity !== filterSeverity) return false;
            return true;
        });
    }, [allIssues, filterStatus, filterType, filterSeverity]);

    if (userLoading) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>;
    }

    if (!isAuthorized) {
        return (
            <div className="p-6">
                <Card className="border-destructive">
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">
                            You don't have access to the reconciliation dashboard. Contact admin.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // filteredIssues computed above (before early returns)

    // Summary stats
    const stats = {
        critical_open: allIssues.filter((i) => i.status === 'open' && i.severity === 'critical').length,
        refund_failed: allIssues.filter((i) => i.issue_type === 'refund_failed' && i.status === 'open').length,
        orphan_payment: allIssues.filter((i) => i.issue_type === 'orphan_payment' && i.status === 'open').length,
        duplicates: allIssues.filter((i) => (i.issue_type === 'duplicate_payment' || i.issue_type === 'duplicate_order') && i.status === 'open').length,
        awaiting_review: allIssues.filter((i) => i.status === 'reviewed').length,
        resolved_24h: allIssues.filter((i) => i.status === 'resolved' || i.status === 'closed').length,
    };

    const selectedIssue = allIssues.find((i) => i.id === selectedIssueId);

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold">Payment Reconciliation</h1>
                    <p className="text-muted-foreground mt-1">
                        Detect and resolve payment/order mismatches, refund failures, and duplicates.
                    </p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {/* Critical Open */}
                    <Card className={stats.critical_open > 0 ? 'border-destructive bg-destructive/5' : ''}>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-destructive">
                                Critical
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.critical_open}</div>
                            <p className="text-xs text-muted-foreground">Immediate action</p>
                        </CardContent>
                    </Card>

                    {/* Refund Failed */}
                    <Card className={stats.refund_failed > 0 ? 'border-yellow-600 bg-yellow-50 dark:bg-yellow-950/20' : ''}>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">Refund Failed</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{stats.refund_failed}</div>
                            <p className="text-xs text-muted-foreground">Customer contact needed</p>
                        </CardContent>
                    </Card>

                    {/* Orphan Payments */}
                    <Card className={stats.orphan_payment > 0 ? 'border-orange-600 bg-orange-50 dark:bg-orange-950/20' : ''}>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">Orphaned</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{stats.orphan_payment}</div>
                            <p className="text-xs text-muted-foreground">No order created</p>
                        </CardContent>
                    </Card>

                    {/* Duplicates */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">Duplicates</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.duplicates}</div>
                            <p className="text-xs text-muted-foreground">Payment or order</p>
                        </CardContent>
                    </Card>

                    {/* Awaiting Review */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">Reviewed</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-600">{stats.awaiting_review}</div>
                            <p className="text-xs text-muted-foreground">In progress</p>
                        </CardContent>
                    </Card>

                    {/* Resolved */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">{stats.resolved_24h}</div>
                            <p className="text-xs text-muted-foreground">Last 24h</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Trends */}
                <ReconciliationTrends issues={allIssues} />

                {/* Filters & Queue */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Queue */}
                    <div className="lg:col-span-3">
                        <Card>
                            <CardHeader>
                                <CardTitle>Issue Queue</CardTitle>
                                <CardDescription>
                                    {filteredIssues.length} issue{filteredIssues.length !== 1 ? 's' : ''} ({allIssues.length} total)
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3 mb-4">
                                    <div className="flex gap-2">
                                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                                            <SelectTrigger className="w-32">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Status</SelectItem>
                                                <SelectItem value="open">Open</SelectItem>
                                                <SelectItem value="reviewed">Reviewed</SelectItem>
                                                <SelectItem value="resolved">Resolved</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                                            <SelectTrigger className="w-32">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Severity</SelectItem>
                                                <SelectItem value="critical">Critical</SelectItem>
                                                <SelectItem value="warning">Warning</SelectItem>
                                                <SelectItem value="info">Info</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <Select value={filterType} onValueChange={setFilterType}>
                                            <SelectTrigger className="w-40">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Types</SelectItem>
                                                <SelectItem value="orphan_payment">Orphaned Payment</SelectItem>
                                                <SelectItem value="refund_failed">Refund Failed</SelectItem>
                                                <SelectItem value="unpaid_order">Unpaid Order</SelectItem>
                                                <SelectItem value="amount_mismatch">Amount Mismatch</SelectItem>
                                                <SelectItem value="duplicate_payment">Duplicate Payment</SelectItem>
                                                <SelectItem value="duplicate_order">Duplicate Order</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {issuesLoading ? (
                                    <div className="flex items-center justify-center h-32 text-muted-foreground">
                                        Loading issues...
                                    </div>
                                ) : filteredIssues.length === 0 ? (
                                    <div className="flex items-center justify-center h-32 text-muted-foreground">
                                        No issues found
                                    </div>
                                ) : (
                                    <ReconciliationIssueQueue
                                        issues={filteredIssues}
                                        selectedId={selectedIssueId}
                                        onSelect={setSelectedIssueId}
                                    />
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Detail Panel */}
                    <div className="lg:col-span-1">
                        {selectedIssue ? (
                            <ReconciliationIssueDetail
                                issue={selectedIssue}
                                onResolved={() => {
                                    queryClient.invalidateQueries({ queryKey: ['reconciliation-issues'] });
                                    setSelectedIssueId(null);
                                }}
                            />
                        ) : (
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-sm text-muted-foreground text-center">
                                        Select an issue to view details
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}