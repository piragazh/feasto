import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, TrendingUp, TrendingDown, CheckCircle, AlertTriangle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

const StatusBadge = ({ status, value, label }) => {
    let bgColor = 'bg-green-50 border-green-200';
    let textColor = 'text-green-700';
    let icon = <CheckCircle className="w-4 h-4" />;

    if (status === 'critical') {
        bgColor = 'bg-red-50 border-red-200';
        textColor = 'text-red-700';
        icon = <AlertCircle className="w-4 h-4" />;
    } else if (status === 'warning') {
        bgColor = 'bg-amber-50 border-amber-200';
        textColor = 'text-amber-700';
        icon = <AlertTriangle className="w-4 h-4" />;
    }

    return (
        <div className={`${bgColor} border rounded-lg p-3 flex items-start gap-3`}>
            <div className={textColor}>{icon}</div>
            <div>
                <p className={`${textColor} text-2xl font-bold`}>{value}</p>
                <p className={`${textColor} text-xs`}>{label}</p>
            </div>
        </div>
    );
};

const TrendIndicator = ({ value, label }) => {
    const numValue = parseFloat(value);
    const isPositive = numValue > 0;
    const isNeutral = Math.abs(numValue) < 1;

    return (
        <div className="flex items-center gap-2">
            {!isNeutral && (
                isPositive ? 
                    <TrendingUp className="w-4 h-4 text-red-500" /> :
                    <TrendingDown className="w-4 h-4 text-green-500" />
            )}
            <span className={`text-sm font-medium ${isNeutral ? 'text-gray-500' : isPositive ? 'text-red-600' : 'text-green-600'}`}>
                {isPositive ? '+' : ''}{value}%
            </span>
            <span className="text-xs text-gray-500">{label}</span>
        </div>
    );
};

export default function WeeklyOpsHealthDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await base44.functions.invoke('weeklyOpsHealth', {});
                setData(response.data);
                setError(null);
            } catch (err) {
                console.error('Failed to fetch ops health:', err);
                setError('Failed to load dashboard');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5 * 60 * 1000); // Refresh every 5 min
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="space-y-6 p-6">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-40" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-48" />)}
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700">{error || 'No data available'}</p>
            </div>
        );
    }

    const { moneySafety, orderHealth, failures, reconciliation, trends } = data;

    // Determine statuses based on thresholds
    const moneyStatus = moneySafety.orphanedPayments > 0 || moneySafety.refundFailures > 0 ? 'critical' : 
                        moneySafety.refundPercent > 5 ? 'warning' : 'good';
    
    const orderStatus = orderHealth.successRate < 95 ? 'critical' :
                        orderHealth.successRate < 98 ? 'warning' : 'good';
    
    const failureStatus = failures.criticalFailures > 0 ? 'critical' :
                         failures.totalFailures > 50 ? 'warning' : 'good';
    
    const reconciliationStatus = reconciliation.criticalIssues > 0 || reconciliation.oldestIssueAgeHours > 72 ? 'critical' :
                                 reconciliation.openIssues > 5 ? 'warning' : 'good';

    return (
        <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Weekly Operations Health</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Last 7 days • Updated {new Date(data.timestamp).toLocaleString()}
                </p>
            </div>

            {/* Money Safety */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        💰 Money Safety
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <StatusBadge 
                            status={moneyStatus}
                            value={`${moneySafety.refundPercent}%`}
                            label="Refund Rate"
                        />
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-blue-700 text-2xl font-bold">£{moneySafety.totalAmount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
                            <p className="text-blue-700 text-xs">{moneySafety.totalPayments} payments</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>
                            <p className="font-semibold text-gray-900">{moneySafety.refundCount}</p>
                            <p className="text-gray-500 text-xs">Refunds</p>
                        </div>
                        <div className={moneySafety.refundFailures > 0 ? 'text-red-600' : ''}>
                            <p className="font-semibold">{moneySafety.refundFailures}</p>
                            <p className="text-gray-500 text-xs">Refund Fails</p>
                        </div>
                        <div className={moneySafety.orphanedPayments > 0 ? 'text-red-600' : ''}>
                            <p className="font-semibold">{moneySafety.orphanedPayments}</p>
                            <p className="text-gray-500 text-xs">Orphaned</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Order Health */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        🍔 Order Health
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <StatusBadge 
                            status={orderStatus}
                            value={`${orderHealth.successRate}%`}
                            label="Success Rate"
                        />
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <p className="text-purple-700 text-2xl font-bold">£{orderHealth.avgOrderValue}</p>
                            <p className="text-purple-700 text-xs">Avg Order Value</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <p className="text-gray-900 text-2xl font-bold">{orderHealth.totalOrders}</p>
                            <p className="text-gray-500 text-xs">Total Orders</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <p className="font-semibold text-gray-900">{orderHealth.rejectionRate}%</p>
                            <p className="text-gray-500 text-xs">Rejection Rate</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Failures */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        ⚠️ System Failures
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <StatusBadge 
                            status={failureStatus}
                            value={failures.totalFailures}
                            label="Total Failures"
                        />
                        <div className={`${failures.criticalFailures > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'} border rounded-lg p-3`}>
                            <p className={`${failures.criticalFailures > 0 ? 'text-red-700' : 'text-gray-900'} text-2xl font-bold`}>{failures.criticalFailures}</p>
                            <p className={`${failures.criticalFailures > 0 ? 'text-red-700' : 'text-gray-500'} text-xs`}>Critical Failures</p>
                        </div>
                    </div>
                    {failures.topFailures.length > 0 && (
                        <div className="text-sm">
                            <p className="font-semibold text-gray-900 mb-2">Top Failure Types:</p>
                            <ul className="space-y-1">
                                {failures.topFailures.map((f, i) => (
                                    <li key={i} className="text-gray-600">
                                        {i + 1}. <span className="font-medium">{f.type}</span> ({f.count})
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Reconciliation */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        🔄 Reconciliation
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <StatusBadge 
                            status={reconciliationStatus}
                            value={reconciliation.openIssues}
                            label="Open Issues"
                        />
                        <div className={`${reconciliation.criticalIssues > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'} border rounded-lg p-3`}>
                            <p className={`${reconciliation.criticalIssues > 0 ? 'text-red-700' : 'text-gray-900'} text-2xl font-bold`}>{reconciliation.criticalIssues}</p>
                            <p className={`${reconciliation.criticalIssues > 0 ? 'text-red-700' : 'text-gray-500'} text-xs`}>Critical Issues</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <p className="font-semibold text-gray-900">{reconciliation.avgResolutionHours.toFixed(1)} hrs</p>
                            <p className="text-gray-500 text-xs">Avg Resolution Time</p>
                        </div>
                        <div className={reconciliation.oldestIssueAgeHours > 72 ? 'text-red-600' : ''}>
                            <p className="font-semibold">{reconciliation.oldestIssueAgeHours} hrs</p>
                            <p className="text-gray-500 text-xs">Oldest Issue Age</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Trends */}
            <Card>
                <CardHeader>
                    <CardTitle>📊 Week-over-Week Trends</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <TrendIndicator value={trends.orders} label="Orders" />
                    <TrendIndicator value={trends.refunds} label="Refunds" />
                    <TrendIndicator value={trends.failures} label="Failures" />
                    <p className="text-xs text-gray-500 mt-4">
                        Positive = increase. For refunds & failures, negative is better.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}