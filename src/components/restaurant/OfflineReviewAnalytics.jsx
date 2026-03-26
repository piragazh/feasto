import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const REASON_LABELS = {
    sync_validation_acceptable: "Sync validation OK",
    discount_capped_correct: "Discount cap correct",
    coupon_expired_expected: "Coupon expiry expected",
    price_reconciled_fair: "Price reconciled",
    customer_contacted_satisfied: "Customer contacted",
    needs_customer_contact: "Needs customer contact",
    policy_review_needed: "Policy review",
    system_error_found: "System error",
    discount_excessive: "Discount excessive",
    unclear_validation_flag: "Unclear flag",
    other: "Other"
};

const COLORS = [
    '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#6366f1', '#64748b'
];

/**
 * Offline Review Analytics
 * 
 * Analyzes review decisions by structured reason codes:
 * - Count and % of orders resolved/escalated by code
 * - Trends in decision patterns
 * - Quality of review process
 */
export default function OfflineReviewAnalytics({ orders = [] }) {
    const analytics = useMemo(() => {
        const reviewed = orders.filter(o => o.offline_review_reason_code);

        // Group by reason code
        const byReason = {};
        Object.keys(REASON_LABELS).forEach(code => {
            byReason[code] = reviewed.filter(o => o.offline_review_reason_code === code);
        });

        // Calculate stats
        const chartData = Object.entries(byReason)
            .filter(([_, orders]) => orders.length > 0)
            .map(([code, orderList]) => ({
                name: REASON_LABELS[code] || code,
                value: orderList.length,
                code,
                resolved: orderList.filter(o => o.offline_review_status === 'resolved').length,
                escalated: orderList.filter(o => o.offline_review_status === 'escalated').length,
            }))
            .sort((a, b) => b.value - a.value);

        // Resolved vs Escalated split
        const resolved = reviewed.filter(o => o.offline_review_status === 'resolved');
        const escalated = reviewed.filter(o => o.offline_review_status === 'escalated');

        return {
            chartData,
            totalReviewed: reviewed.length,
            resolvedCount: resolved.length,
            escalatedCount: escalated.length,
            resolvedPercent: reviewed.length > 0 ? Math.round((resolved.length / reviewed.length) * 100) : 0,
            escalatedPercent: reviewed.length > 0 ? Math.round((escalated.length / reviewed.length) * 100) : 0,
        };
    }, [orders]);

    if (analytics.totalReviewed === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Review Pattern Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-gray-500">No reviewed orders yet with reason codes.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
                <Card>
                    <CardContent className="pt-4">
                        <p className="text-xs text-gray-600">Total Reviewed</p>
                        <p className="text-2xl font-bold text-gray-900">{analytics.totalReviewed}</p>
                    </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="pt-4">
                        <p className="text-xs text-green-700">Resolved</p>
                        <p className="text-2xl font-bold text-green-900">{analytics.resolvedCount}</p>
                        <p className="text-xs text-green-600 mt-1">{analytics.resolvedPercent}%</p>
                    </CardContent>
                </Card>
                <Card className="border-orange-200 bg-orange-50">
                    <CardContent className="pt-4">
                        <p className="text-xs text-orange-700">Escalated</p>
                        <p className="text-2xl font-bold text-orange-900">{analytics.escalatedCount}</p>
                        <p className="text-xs text-orange-600 mt-1">{analytics.escalatedPercent}%</p>
                    </CardContent>
                </Card>
            </div>

            {/* Decision distribution chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Decision Distribution by Reason</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analytics.chartData} layout="vertical" margin={{ left: 150, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis type="number" />
                                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                                <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: 12, borderRadius: 4 }} />
                                <Legend />
                                <Bar dataKey="resolved" stackId="a" fill="#10b981" />
                                <Bar dataKey="escalated" stackId="a" fill="#f59e0b" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Reason code table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Review Codes Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-auto">
                        <table className="w-full text-xs">
                            <thead className="border-b border-gray-200 bg-gray-50">
                                <tr>
                                    <th className="text-left py-2 px-2 font-medium">Reason</th>
                                    <th className="text-right py-2 px-2 font-medium">Count</th>
                                    <th className="text-right py-2 px-2 font-medium">Resolved</th>
                                    <th className="text-right py-2 px-2 font-medium">Escalated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.chartData.map((item, idx) => (
                                    <tr key={item.code} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="py-2 px-2">
                                            <Badge className="bg-gray-100 text-gray-800 text-xs font-normal">
                                                {item.name}
                                            </Badge>
                                        </td>
                                        <td className="py-2 px-2 text-right font-medium">{item.value}</td>
                                        <td className="py-2 px-2 text-right">
                                            <span className="text-green-700 font-medium">{item.resolved}</span>
                                        </td>
                                        <td className="py-2 px-2 text-right">
                                            <span className="text-orange-700 font-medium">{item.escalated}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Key insights */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Insights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                    {analytics.resolvedPercent >= 80 ? (
                        <p className="text-green-700 bg-green-50 p-2 rounded">
                            ✓ High resolution rate ({analytics.resolvedPercent}%) — effective review process
                        </p>
                    ) : analytics.resolvedPercent <= 40 ? (
                        <p className="text-orange-700 bg-orange-50 p-2 rounded">
                            ⚠ Low resolution rate ({analytics.resolvedPercent}%) — many orders escalated; consider policy review
                        </p>
                    ) : null}
                    
                    {analytics.chartData[0] && (
                        <p className="text-gray-700 bg-gray-50 p-2 rounded">
                            Most common: <strong>{analytics.chartData[0].name}</strong> ({analytics.chartData[0].value} orders)
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}