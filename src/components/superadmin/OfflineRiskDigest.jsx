/**
 * Offline Risk Digest Panel (SuperAdmin)
 * 
 * Portfolio-level digest showing critical, worsening, and summary metrics.
 * Read-only summary for operational awareness.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Clock, TrendingUp, Copy, Eye, History } from 'lucide-react';
import { generatePortfolioDigest, formatDigestAsPlaintext, isDigestCritical } from '@/lib/offline-digest-logic';
import DigestSnapshotHistory from './DigestSnapshotHistory';

export default function OfflineRiskDigest() {
    const [period, setPeriod] = useState('24h');
    const [copiedToClipboard, setCopiedToClipboard] = useState(false);
    const [activeTab, setActiveTab] = useState('current');

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list()
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['all-orders'],
        queryFn: () => base44.entities.Order.list('-offline_synced_at', 1000)
    });

    // Mock portfolio analytics (in real setup, fetch from dashboard state)
    const portfolioAnalytics = useMemo(() => {
        const restaurantRisks = restaurants.map(r => {
            const rOrders = orders.filter(o => o.restaurant_id === r.id && o.offline_created);
            const flagged = rOrders.filter(o => o.needs_review).length;
            const escalated = rOrders.filter(o => o.offline_review_status === 'escalated').length;
            
            const flaggedRate = rOrders.length > 0 ? Math.round((flagged / rOrders.length) * 100) : 0;
            const escalationRate = flagged > 0 ? Math.round((escalated / flagged) * 100) : 0;
            
            return {
              restaurant_id: r.id,
              flagged_rate: flaggedRate,
              escalation_rate: escalationRate,
              flagged_count: flagged,
              escalated_count: escalated,
              total_orders: rOrders.length,
              risk_score: Math.round(flaggedRate * 0.6 + escalationRate * 0.4)
            };
        });

        return {
            rankedRestaurants: restaurantRisks.sort((a, b) => b.risk_score - a.risk_score)
        };
    }, [restaurants, orders]);

    // Mock operator analytics
    const operatorAnalytics = useMemo(() => {
        const operatorStats = {};
        orders
            .filter(o => o.offline_created && o.offline_created_by)
            .forEach(o => {
                if (!operatorStats[o.offline_created_by]) {
                    operatorStats[o.offline_created_by] = { total: 0, flagged: 0 };
                }
                operatorStats[o.offline_created_by].total++;
                if (o.needs_review) {
                    operatorStats[o.offline_created_by].flagged++;
                }
            });

        const avgFlaggedRate = orders.filter(o => o.offline_created && o.needs_review).length / Math.max(orders.filter(o => o.offline_created).length, 1);

        const outliers = Object.entries(operatorStats)
            .filter(([, stats]) => stats.total >= 5)
            .map(([email, stats]) => {
                const rate = stats.flagged / stats.total;
                return {
                    type: rate > avgFlaggedRate * 2 ? 'high_flagged' : 'normal',
                    operator_email: email,
                    flagged_rate: Math.round(rate * 100),
                    vs_average: Math.round((rate - avgFlaggedRate) * 100)
                };
            })
            .filter(o => o.type === 'high_flagged');

        return { outliers };
    }, [orders]);

    const digest = useMemo(() => {
        return generatePortfolioDigest(orders, restaurants, portfolioAnalytics, operatorAnalytics);
    }, [orders, restaurants, portfolioAnalytics, operatorAnalytics]);

    const plaintext = useMemo(() => {
        return formatDigestAsPlaintext(digest);
    }, [digest]);

    // Auto-snapshot digest when component mounts
    useEffect(() => {
        const snapshot = async () => {
            try {
                if (digest && plaintext) {
                    await base44.functions.invoke('createDigestSnapshot', {
                        digest,
                        scope: 'portfolio',
                        scope_id: null,
                        plaintext
                    });
                }
            } catch (e) {
                // Silently fail - snapshot is optional
            }
        };
        snapshot();
    }, [digest, plaintext]);

    const isCritical = isDigestCritical(digest);

    const handleCopyToClipboard = () => {
        navigator.clipboard.writeText(plaintext);
        setCopiedToClipboard(true);
        setTimeout(() => setCopiedToClipboard(false), 2000);
    };

    return (
        <div className="space-y-4">
            {/* Tabs: Current vs History */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="current">Current Digest</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="current" className="space-y-4">
                    {/* Header + Controls */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Offline Risk Digest</h2>
                    <p className="text-xs text-gray-500 mt-1">Portfolio summary for operational awareness</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={handleCopyToClipboard}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                    >
                        <Copy className="h-3 w-3 mr-1" />
                        {copiedToClipboard ? 'Copied!' : 'Copy Text'}
                    </Button>
                </div>
            </div>

            {/* Critical Alert */}
            {isCritical && (
                <Card className="border border-red-200 bg-red-50">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-red-900">
                                <p className="font-semibold">Critical Issues Detected</p>
                                <p className="text-xs mt-1">Review overdue orders and escalations below</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Critical Now Section */}
            {digest.critical_now && (
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <span className="text-lg">🚨</span> Critical Now
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Overdue Flagged */}
                        {digest.critical_now.overdue_flagged?.count > 0 && (
                            <div className="p-3 bg-red-50 rounded border border-red-200">
                                <p className="font-semibold text-sm text-red-900">
                                    Overdue Flagged Orders: {digest.critical_now.overdue_flagged.count}
                                </p>
                                <p className="text-xs text-red-700 mt-1">
                                    Oldest: {digest.critical_now.overdue_flagged.oldest_minutes} minutes
                                </p>
                                {digest.critical_now.overdue_flagged.orders.slice(0, 3).map(o => (
                                    <div key={o.order_id} className="text-xs text-red-600 mt-1">
                                        <span className="font-mono">{o.order_id}</span> · {o.age_minutes}m ago · {o.restaurant_name}
                                    </div>
                                ))}
                                {digest.critical_now.overdue_flagged.orders.length > 3 && (
                                    <p className="text-xs text-red-600 mt-1">+{digest.critical_now.overdue_flagged.orders.length - 3} more</p>
                                )}
                            </div>
                        )}

                        {/* Top Risk Restaurants */}
                        {digest.critical_now.top_restaurants?.length > 0 && (
                            <div className="p-3 bg-orange-50 rounded border border-orange-200">
                                <p className="font-semibold text-sm text-orange-900">Top Risk Restaurants</p>
                                {digest.critical_now.top_restaurants.slice(0, 3).map(r => (
                                    <div key={r.restaurant_id} className="text-xs text-orange-700 mt-2 flex justify-between">
                                        <span>
                                            {r.restaurant_name}
                                            <Badge className="ml-2 text-xs">Risk {r.risk_score}</Badge>
                                        </span>
                                        <span>{r.flagged_rate}% flagged</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Abuse Escalations */}
                        {digest.critical_now.abuse_escalations?.count > 0 && (
                            <div className="p-3 bg-red-50 rounded border border-red-200">
                                <p className="font-semibold text-sm text-red-900">
                                    Abuse-Related Escalations: {digest.critical_now.abuse_escalations.count}
                                </p>
                                {digest.critical_now.abuse_escalations.recent.slice(0, 2).map(o => (
                                    <div key={o.order_id} className="text-xs text-red-700 mt-1">
                                        <span className="font-mono">{o.order_id}</span> · {o.reason_code} · {o.restaurant_name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Worsening Section */}
            {digest.watch_worsening && (
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" /> Watch (Worsening)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {digest.watch_worsening.escalation_rate_up && (
                            <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                                <p className="font-semibold text-sm text-yellow-900">Escalation Rate Trending Up</p>
                                <p className="text-xs text-yellow-700 mt-1">
                                    Last 24h: {digest.watch_worsening.escalation_24h}% | Last 7d: {digest.watch_worsening.escalation_7d}%
                                    <span className="ml-2 font-semibold">+{digest.watch_worsening.delta_points}pts</span>
                                </p>
                            </div>
                        )}

                        {digest.watch_worsening.operator_outliers?.length > 0 && (
                            <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                                <p className="font-semibold text-sm text-yellow-900">Operator Outliers</p>
                                {digest.watch_worsening.operator_outliers.slice(0, 2).map(o => (
                                    <div key={o.operator_email} className="text-xs text-yellow-700 mt-1">
                                        <span className="font-mono">{o.operator_email}</span> · {o.flagged_rate}% flagged
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Summary Metrics */}
            {digest.summary_metrics && (
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">📊 Summary (24h)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <p className="text-xs text-gray-600">Total Offline</p>
                                <p className="text-lg font-bold text-gray-900">{digest.summary_metrics.total_offline}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Flagged</p>
                                <p className="text-lg font-bold text-orange-600">
                                    {digest.summary_metrics.total_flagged}
                                    <span className="ml-1 text-sm">({digest.summary_metrics.flagged_rate}%)</span>
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Escalated</p>
                                <p className="text-lg font-bold text-red-600">
                                    {digest.summary_metrics.total_escalated}
                                    <span className="ml-1 text-sm">({digest.summary_metrics.escalation_rate}%)</span>
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Restaurants w/ Issues</p>
                                <p className="text-lg font-bold text-gray-900">{digest.summary_metrics.restaurants_with_issues}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

                    {/* Footer Note */}
                    <div className="text-xs text-gray-500 text-center p-3 bg-gray-50 rounded">
                        ℹ️ Digest is a summary signal layer. Items require human investigation. Not proof.
                    </div>
                </TabsContent>

                <TabsContent value="history">
                    <Card className="border-0 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2">
                                <History className="h-4 w-4" /> Recent Digest Snapshots
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DigestSnapshotHistory scope="portfolio" scopeId={null} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}