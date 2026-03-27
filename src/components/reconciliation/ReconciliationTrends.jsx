import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, TrendingUp } from 'lucide-react';

export default function ReconciliationTrends({ issues }) {
    const trends = useMemo(() => {
        const now = Date.now();
        const last24h = new Date(now - 24 * 60 * 60 * 1000);
        const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

        const last24hIssues = issues.filter((i) => new Date(i.created_date) > last24h);
        const last7dIssues = issues.filter((i) => new Date(i.created_date) > last7d);

        // Count by type
        const typeBreakdown24h = {};
        const typeBreakdown7d = {};

        last24hIssues.forEach((i) => {
            typeBreakdown24h[i.issue_type] = (typeBreakdown24h[i.issue_type] || 0) + 1;
        });

        last7dIssues.forEach((i) => {
            typeBreakdown7d[i.issue_type] = (typeBreakdown7d[i.issue_type] || 0) + 1;
        });

        return {
            count24h: last24hIssues.length,
            count7d: last7dIssues.length,
            typeBreakdown24h,
            typeBreakdown7d,
            trend: last7dIssues.length > last24hIssues.length * 7 ? 'up' : 'down',
        };
    }, [issues]);

    const ISSUE_LABELS = {
        orphan_payment: 'Orphaned',
        refund_failed: 'Refund Failed',
        unpaid_order: 'Unpaid',
        duplicate_payment: 'Dup. Payment',
        duplicate_order: 'Dup. Order',
        amount_mismatch: 'Amount',
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Last 24h */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Last 24 Hours</CardTitle>
                    <CardDescription>Issues created in the past day</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="text-2xl font-bold">{trends.count24h}</div>
                    <div className="space-y-2">
                        {Object.entries(trends.typeBreakdown24h)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([type, count]) => (
                                <div key={type} className="flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground">
                                        {ISSUE_LABELS[type] || type}
                                    </span>
                                    <Badge variant="outline">{count}</Badge>
                                </div>
                            ))}
                    </div>
                </CardContent>
            </Card>

            {/* Last 7d */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Last 7 Days</CardTitle>
                    <CardDescription>Issues created in the past week</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="text-2xl font-bold">{trends.count7d}</div>
                        {trends.trend === 'down' ? (
                            <TrendingDown className="h-4 w-4 text-green-600" />
                        ) : (
                            <TrendingUp className="h-4 w-4 text-destructive" />
                        )}
                    </div>
                    <div className="space-y-2">
                        {Object.entries(trends.typeBreakdown7d)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([type, count]) => (
                                <div key={type} className="flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground">
                                        {ISSUE_LABELS[type] || type}
                                    </span>
                                    <Badge variant="outline">{count}</Badge>
                                </div>
                            ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}