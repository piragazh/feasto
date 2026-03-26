/**
 * Cross-Store Offline Review Portfolio
 * 
 * SuperAdmin view showing:
 * - All restaurants ranked by offline review risk
 * - Outlier flags (worst performers)
 * - Summary metrics
 * - Drill-down to per-restaurant dashboard
 */

import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronRight, Flag, Eye, CheckCircle } from 'lucide-react';
import { buildPortfolioRanking } from '@/lib/offline-review-portfolio-ranking';
import { detectAnomalies } from '@/lib/offline-review-anomaly-rules';
import { enrichAnomaliesWithScoring } from '@/lib/offline-review-severity-scoring';
import { createPageUrl } from '@/utils';

export default function OfflineReviewPortfolio() {
    const [sortBy, setSortBy] = useState('risk'); // 'risk' | 'flagged_rate' | 'escalation_rate' | 'unresolved'
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'critical' | 'risk' | 'watch' | 'ok'

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list()
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['all-orders'],
        queryFn: () => base44.entities.Order.list('-created_date', 1000)
    });

    // Calculate per-restaurant anomalies
    const calculateAnomaliesPerRestaurant = (restaurantId, rOrders) => {
        const flagged = rOrders.filter(o => o.offline_created && o.needs_review);
        const unreviewed = flagged.filter(o => !o.offline_review_status || o.offline_review_status === 'new');
        const reviewed = flagged.filter(o => o.offline_review_status);
        const escalated = reviewed.filter(o => o.offline_review_status === 'escalated');

        const reasonCodeCounts = {};
        const abuseSuspiciousCodes = { potential_abuse: 0, large_price_mismatch: 0, repeated_offline_issues: 0 };
        reviewed.forEach(order => {
            const code = order.offline_review_reason_code;
            reasonCodeCounts[code] = (reasonCodeCounts[code] || 0) + 1;
            if (code in abuseSuspiciousCodes) abuseSuspiciousCodes[code]++;
        });

        const detected = detectAnomalies({
            totalOrders: rOrders.length,
            flaggedCount: flagged.length,
            unresolvedCount: unreviewed.length,
            reviewedCount: reviewed.length,
            escalatedCount: escalated.length,
            oldestUnresolvedHours: unreviewed.length > 0
                ? Math.max(...unreviewed.map(o => o.offline_synced_at ? (new Date().getTime() - new Date(o.offline_synced_at).getTime()) / (1000 * 60 * 60) : 0))
                : 0,
            reasonCodes: reasonCodeCounts,
            reviews: flagged,
            abuseSuspiciousCodes
        });

        return enrichAnomaliesWithScoring(detected);
    };

    // Build portfolio
    const portfolio = useMemo(() => {
        if (restaurants.length === 0 || orders.length === 0) return null;
        return buildPortfolioRanking(restaurants, orders, calculateAnomaliesPerRestaurant);
    }, [restaurants, orders]);

    // Filter and sort
    const filtered = useMemo(() => {
        if (!portfolio) return [];

        let result = portfolio.ranked.filter(r => {
            if (statusFilter === 'all') return true;
            return r.status === statusFilter;
        });

        // Sort by selected column
        if (sortBy === 'flagged_rate') {
            result.sort((a, b) => b.flaggedRate - a.flaggedRate);
        } else if (sortBy === 'escalation_rate') {
            result.sort((a, b) => b.escalationRate - a.escalationRate);
        } else if (sortBy === 'unresolved') {
            result.sort((a, b) => b.unresolvedCount - a.unresolvedCount);
        }
        // else: risk (default sort from portfolio)

        return result;
    }, [portfolio, sortBy, statusFilter]);

    if (!portfolio) {
        return (
            <div className="text-center py-12">
                <div className="w-8 h-8 border-4 border-gray-300 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-600 text-sm">Loading offline review portfolio...</p>
            </div>
        );
    }

    const statusColor = {
        'critical': 'bg-red-50 border-red-200 text-red-900',
        'risk': 'bg-orange-50 border-orange-200 text-orange-900',
        'watch': 'bg-yellow-50 border-yellow-200 text-yellow-900',
        'ok': 'bg-green-50 border-green-200 text-green-900'
    };

    const statusIcon = {
        'critical': <AlertCircle className="h-4 w-4 text-red-600" />,
        'risk': <AlertTriangle className="h-4 w-4 text-orange-600" />,
        'watch': <AlertTriangle className="h-4 w-4 text-yellow-600" />,
        'ok': <CheckCircle className="h-4 w-4 text-green-600" />
    };

    const trendIcon = {
        'improving': <TrendingDown className="h-3.5 w-3.5 text-green-600" />,
        'stable': <Minus className="h-3.5 w-3.5 text-gray-400" />,
        'worsening': <TrendingUp className="h-3.5 w-3.5 text-red-600" />
    };

    return (
        <div className="space-y-6">
            {/* Header + Summary */}
            <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Offline Review Portfolio</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{portfolio.summary.totalRestaurants}</p>
                            <p className="text-xs text-gray-500 mt-1">Restaurants</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-red-50">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-red-900">{portfolio.summary.criticalCount}</p>
                            <p className="text-xs text-red-600 mt-1">Critical</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-orange-50">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-orange-900">{portfolio.summary.riskCount}</p>
                            <p className="text-xs text-orange-600 mt-1">At Risk</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{portfolio.summary.avgRiskScore}</p>
                            <p className="text-xs text-gray-500 mt-1">Avg Risk Score</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Outliers Section */}
            {Object.keys(portfolio.outliers).length > 0 && (
                <Card className="border border-red-200 bg-red-50">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <Flag className="h-4 w-4 text-red-600" />
                            <CardTitle className="text-sm font-semibold text-red-900">Outliers & Warnings</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 text-sm">
                            {portfolio.outliers.highest_flagged_rate && (
                                <p className="text-red-800">
                                    <strong>Highest flagged rate:</strong> {portfolio.outliers.highest_flagged_rate.name} ({portfolio.outliers.highest_flagged_rate.percent}%)
                                </p>
                            )}
                            {portfolio.outliers.highest_escalation_rate && (
                                <p className="text-red-800">
                                    <strong>Highest escalation:</strong> {portfolio.outliers.highest_escalation_rate.name} ({portfolio.outliers.highest_escalation_rate.percent}%)
                                </p>
                            )}
                            {portfolio.outliers.largest_unresolved_backlog && (
                                <p className="text-red-800">
                                    <strong>Largest backlog:</strong> {portfolio.outliers.largest_unresolved_backlog.name} ({portfolio.outliers.largest_unresolved_backlog.count} unresolved)
                                </p>
                            )}
                            {portfolio.outliers.most_overdue && (
                                <p className="text-red-800">
                                    <strong>Most overdue:</strong> {portfolio.outliers.most_overdue.name} ({portfolio.outliers.most_overdue.count} overdue)
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Controls */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex gap-2">
                    <label className="text-xs text-gray-600 font-medium">Sort by:</label>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-orange-500"
                    >
                        <option value="risk">Risk Score</option>
                        <option value="flagged_rate">Flagged Rate</option>
                        <option value="escalation_rate">Escalation Rate</option>
                        <option value="unresolved">Unresolved Count</option>
                    </select>
                </div>
                <div className="flex gap-2">
                    <label className="text-xs text-gray-600 font-medium">Filter:</label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-orange-500"
                    >
                        <option value="all">All Statuses</option>
                        <option value="critical">Critical Only</option>
                        <option value="risk">Risk Only</option>
                        <option value="watch">Watch Only</option>
                        <option value="ok">OK Only</option>
                    </select>
                </div>
            </div>

            {/* Rankings Table */}
            <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px]">
                            <thead>
                                <tr className="border-b bg-gray-50">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Restaurant</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Risk Score</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Flagged %</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Escalations %</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Unresolved</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Trend</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((restaurant, idx) => (
                                    <tr key={restaurant.restaurantId} className="border-b hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">{restaurant.restaurantName}</p>
                                                {restaurant.topReasonCode && (
                                                    <p className="text-xs text-gray-500 mt-0.5">Top code: {restaurant.topReasonCode.replace(/_/g, ' ')}</p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="text-sm font-bold text-gray-900">{restaurant.totalScore}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <Badge className={`text-xs font-medium ${statusColor[restaurant.status]}`}>
                                                {restaurant.status.toUpperCase()}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`text-xs font-medium ${restaurant.flaggedRate > 20 ? 'text-red-600' : 'text-gray-600'}`}>
                                                {restaurant.flaggedRate}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`text-xs font-medium ${restaurant.escalationRate > 60 ? 'text-red-600' : 'text-gray-600'}`}>
                                                {restaurant.escalationRate}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`text-xs font-medium ${restaurant.unresolvedCount > 5 ? 'text-orange-600' : 'text-gray-600'}`}>
                                                {restaurant.unresolvedCount}
                                                {restaurant.overdueCount > 0 && (
                                                    <span className="text-red-600 ml-1">({restaurant.overdueCount} overdue)</span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center">
                                                {trendIcon[portfolio.trends[restaurant.restaurantId] || 'stable']}
                                                <span className="text-xs text-gray-600 ml-1 hidden sm:inline">
                                                    {portfolio.trends[restaurant.restaurantId] || 'stable'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => window.location.href = `${createPageUrl('RestaurantDashboard')}?restaurant_id=${restaurant.restaurantId}`}
                                                className="h-7 text-xs gap-1"
                                            >
                                                <Eye className="h-3 w-3" />
                                                View
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filtered.length === 0 && (
                            <div className="py-12 text-center text-gray-400 text-sm">
                                No restaurants match the selected filter
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}