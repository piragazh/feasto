import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Users, TrendingUp, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';
import { toast } from 'sonner';
import {
    calculateManagerMetrics,
    rankManagersByRisk,
    flagManagerOutliers,
    aggregateManagerMetricsAcrossRestaurants
} from '@/lib/manager-operator-analytics';

/**
 * Manager/Operator Analytics Dashboard
 * 
 * SuperAdmin view:
 * - Rank managers by review quality signals
 * - Flag outliers (high escalations, poor docs, etc.)
 * - Filter/sort by restaurant or manager
 * - Drill down to per-manager order list
 * 
 * Restaurant Admin view:
 * - See own restaurant's managers only
 * - See manager performance metrics
 */
export default function ManagerOperatorAnalytics({ mode = 'superadmin', restaurantId = null }) {
    const [filterRestaurantId, setFilterRestaurantId] = useState(restaurantId || 'all');
    const [sortBy, setSortBy] = useState('escalation'); // escalation | documentation | reviews | speed
    const [selectedManager, setSelectedManager] = useState(null);

    // Fetch all restaurants (for SuperAdmin)
    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants-for-manager-analytics'],
        queryFn: () => base44.entities.Restaurant.list(),
        enabled: mode === 'superadmin',
    });

    // Fetch all orders
    const { data: allOrders = [], isLoading } = useQuery({
        queryKey: ['all-orders-for-manager-analytics', filterRestaurantId],
        queryFn: async () => {
            if (filterRestaurantId === 'all' && mode === 'superadmin') {
                return await base44.entities.Order.list();
            } else if (filterRestaurantId && filterRestaurantId !== 'all') {
                return await base44.entities.Order.filter({ restaurant_id: filterRestaurantId });
            }
            return [];
        },
    });

    // Calculate manager metrics
    const managersData = useMemo(() => {
        if (filterRestaurantId === 'all' && mode === 'superadmin') {
            // Group by restaurant, then calculate
            const byRestaurant = {};
            restaurants.forEach(r => {
                const orders = allOrders.filter(o => o.restaurant_id === r.id);
                byRestaurant[r.id] = calculateManagerMetrics(r.id, orders);
            });
            return aggregateManagerMetricsAcrossRestaurants(byRestaurant);
        } else {
            // Single restaurant
            const orders = allOrders.filter(o => o.restaurant_id === filterRestaurantId || filterRestaurantId === 'all');
            const rId = filterRestaurantId === 'all' ? null : filterRestaurantId;
            return calculateManagerMetrics(rId, orders);
        }
    }, [allOrders, restaurants, filterRestaurantId, mode]);

    // Rank and flag outliers
    const rankedManagers = useMemo(() => rankManagersByRisk(Object.values(managersData)), [managersData]);
    const outliers = useMemo(() => flagManagerOutliers(rankedManagers), [rankedManagers]);

    // Apply sorting
    const sortedManagers = useMemo(() => {
        const sorted = rankedManagers.slice();
        switch (sortBy) {
            case 'escalation':
                return sorted.sort((a, b) => b.escalationRate - a.escalationRate);
            case 'documentation':
                return sorted.sort((a, b) => a.documentationRate - b.documentationRate);
            case 'reviews':
                return sorted.sort((a, b) => b.totalReviews - a.totalReviews);
            case 'speed':
                return sorted.sort((a, b) => b.averageReviewAgeHours - a.averageReviewAgeHours);
            default:
                return sorted;
        }
    }, [rankedManagers, sortBy]);

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Manager Analytics
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-6">
                        <div className="w-8 h-8 border-4 border-gray-300 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-gray-600 text-sm">Loading manager data...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const totalManagers = sortedManagers.length;
    const totalReviews = sortedManagers.reduce((s, m) => s + m.totalReviews, 0);
    const avgEscalation = totalManagers > 0 
        ? Math.round(sortedManagers.reduce((s, m) => s + m.escalationRate, 0) / totalManagers)
        : 0;

    return (
        <>
            {/* Summary Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Total Managers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-gray-900">{totalManagers}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Total Reviews</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-gray-900">{totalReviews}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Avg Escalation Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-3xl font-bold ${avgEscalation > 50 ? 'text-red-600' : avgEscalation > 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                            {avgEscalation}%
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Outliers Section */}
            {Object.keys(outliers).length > 0 && (
                <Card className="mb-6 border-red-200 bg-red-50">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-red-900 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            Manager Outliers
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {outliers.highest_escalation && (
                            <div className="text-sm text-red-800">
                                <span className="font-semibold">🔴 Highest escalation rate:</span> {outliers.highest_escalation.message}
                            </div>
                        )}
                        {outliers.lowest_documentation && (
                            <div className="text-sm text-red-800">
                                <span className="font-semibold">🟡 Lowest documentation:</span> {outliers.lowest_documentation.message}
                            </div>
                        )}
                        {outliers.highest_concentration && (
                            <div className="text-sm text-red-800">
                                <span className="font-semibold">🟠 High reason code concentration:</span> {outliers.highest_concentration.message}
                            </div>
                        )}
                        {outliers.most_abuse_escalations && (
                            <div className="text-sm text-red-800">
                                <span className="font-semibold">🔴 Abuse escalations:</span> {outliers.most_abuse_escalations.message}
                            </div>
                        )}
                        {outliers.slowest_review_time && (
                            <div className="text-sm text-red-800">
                                <span className="font-semibold">⏱️ Slowest review time:</span> {outliers.slowest_review_time.message}
                            </div>
                        )}
                        {outliers.largest_unresolved_backlog && (
                            <div className="text-sm text-red-800">
                                <span className="font-semibold">📋 Largest backlog:</span> {outliers.largest_unresolved_backlog.message}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Controls */}
            <div className="flex flex-wrap gap-3 mb-6">
                {mode === 'superadmin' && (
                    <>
                        <select
                            value={filterRestaurantId}
                            onChange={(e) => setFilterRestaurantId(e.target.value)}
                            className="px-3 py-2 border rounded-lg text-sm"
                        >
                            <option value="all">All Restaurants</option>
                            {restaurants.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    </>
                )}

                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm"
                >
                    <option value="escalation">Sort by: Escalation Rate</option>
                    <option value="documentation">Sort by: Documentation Rate</option>
                    <option value="reviews">Sort by: Total Reviews</option>
                    <option value="speed">Sort by: Review Speed</option>
                </select>
            </div>

            {/* Managers Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Managers ({sortedManagers.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {sortedManagers.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <p className="text-sm">No manager review data available</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-3 px-3 font-semibold text-gray-700">Manager</th>
                                        <th className="text-center py-3 px-3 font-semibold text-gray-700">Reviews</th>
                                        <th className="text-center py-3 px-3 font-semibold text-gray-700">Escalations</th>
                                        <th className="text-center py-3 px-3 font-semibold text-gray-700">Documentation</th>
                                        <th className="text-center py-3 px-3 font-semibold text-gray-700">Avg Review Time</th>
                                        <th className="text-center py-3 px-3 font-semibold text-gray-700">Unresolved</th>
                                        <th className="text-center py-3 px-3 font-semibold text-gray-700">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedManagers.map(manager => (
                                        <tr key={manager.managerEmail} className="border-b hover:bg-gray-50 transition-colors">
                                            <td className="py-3 px-3">
                                                <div>
                                                    <p className="font-medium text-gray-900">{manager.managerEmail.split('@')[0]}</p>
                                                    <p className="text-xs text-gray-500">{manager.managerEmail}</p>
                                                </div>
                                            </td>

                                            <td className="text-center py-3 px-3">
                                                <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                                                    {manager.totalReviews}
                                                </span>
                                            </td>

                                            <td className="text-center py-3 px-3">
                                                <div>
                                                    <p className={`font-semibold ${
                                                        manager.escalationRate > 60 ? 'text-red-600' :
                                                        manager.escalationRate > 40 ? 'text-yellow-600' :
                                                        'text-green-600'
                                                    }`}>
                                                        {manager.escalationRate}%
                                                    </p>
                                                    <p className="text-xs text-gray-500">{manager.escalatedCount}/{manager.resolvedCount + manager.escalatedCount}</p>
                                                </div>
                                            </td>

                                            <td className="text-center py-3 px-3">
                                                <div>
                                                    <p className={`font-semibold ${
                                                        manager.documentationRate < 50 ? 'text-red-600' :
                                                        manager.documentationRate < 70 ? 'text-yellow-600' :
                                                        'text-green-600'
                                                    }`}>
                                                        {manager.documentationRate}%
                                                    </p>
                                                    <p className="text-xs text-gray-500">{manager.withNotesCount}/{manager.totalReviews}</p>
                                                </div>
                                            </td>

                                            <td className="text-center py-3 px-3">
                                                <span className="text-sm font-medium text-gray-700">
                                                    {Math.round(manager.averageReviewAgeHours)}h
                                                </span>
                                            </td>

                                            <td className="text-center py-3 px-3">
                                                {manager.unresolvedCount > 0 ? (
                                                    <Badge className="bg-red-100 text-red-800">{manager.unresolvedCount}</Badge>
                                                ) : (
                                                    <span className="text-gray-400 text-sm">—</span>
                                                )}
                                            </td>

                                            <td className="text-center py-3 px-3">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedManager(manager)}
                                                    className="gap-1"
                                                >
                                                    <Eye className="h-3 w-3" />
                                                    View
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Selected Manager Detail Modal */}
            {selectedManager && (
                <Card className="mt-6 border-blue-200 bg-blue-50">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                {selectedManager.managerEmail}
                            </CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedManager(null)}>✕</Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-xs text-gray-600 font-medium">Total Reviews</p>
                                <p className="text-2xl font-bold text-gray-900">{selectedManager.totalReviews}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600 font-medium">Escalation Rate</p>
                                <p className={`text-2xl font-bold ${selectedManager.escalationRate > 50 ? 'text-red-600' : 'text-green-600'}`}>
                                    {selectedManager.escalationRate}%
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600 font-medium">Documentation</p>
                                <p className={`text-2xl font-bold ${selectedManager.documentationRate < 50 ? 'text-red-600' : 'text-green-600'}`}>
                                    {selectedManager.documentationRate}%
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600 font-medium">Unresolved</p>
                                <p className={`text-2xl font-bold ${selectedManager.unresolvedCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {selectedManager.unresolvedCount}
                                </p>
                            </div>
                        </div>

                        {Object.keys(selectedManager.reasonCodes).length > 0 && (
                            <div>
                                <p className="text-sm font-semibold text-gray-700 mb-2">Reason Code Distribution</p>
                                <div className="space-y-1">
                                    {Object.entries(selectedManager.reasonCodes)
                                        .sort(([,a], [,b]) => b - a)
                                        .slice(0, 5)
                                        .map(([code, count]) => (
                                            <div key={code} className="flex items-center justify-between text-sm">
                                                <span className="text-gray-600">{code.replace(/_/g, ' ')}</span>
                                                <span className="font-medium">{count}</span>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setSelectedManager(null)}>
                                Close
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </>
    );
}