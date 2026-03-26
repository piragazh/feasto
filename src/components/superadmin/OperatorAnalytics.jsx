/**
 * Operator Analytics Dashboard
 * 
 * Real operator-level offline risk analytics using captured data only:
 * - offline_created_by identity
 * - flagged order counts
 * - escalation rates
 * - reason code patterns
 * 
 * Honest labeling: these are operational signals, not proof of fault.
 * Operators may share terminals, so patterns reflect workflow, not individual blame.
 */

import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, TrendingUp, Users, Eye, Shield } from 'lucide-react';
import { calculateOperatorMetrics } from '@/lib/manager-operator-analytics';
import { detectOperatorOutliers, rankOperatorsByRisk, calculateOperatorRiskScore } from '@/lib/operator-outlier-rules';

export default function OperatorAnalytics() {
    const [sortBy, setSortBy] = useState('risk');
    const [filterRestaurant, setFilterRestaurant] = useState('all');
    const [selectedOperator, setSelectedOperator] = useState(null);

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list()
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['all-orders'],
        queryFn: () => base44.entities.Order.list('-offline_synced_at', 1000)
    });

    // Calculate operator metrics per restaurant
    const operatorsByRestaurant = useMemo(() => {
        const result = {};
        restaurants.forEach(r => {
            const restaurantOrders = orders.filter(o => o.restaurant_id === r.id);
            result[r.id] = calculateOperatorMetrics(r.id, restaurantOrders);
        });
        return result;
    }, [restaurants, orders]);

    // Aggregate across selected restaurant or all
    const aggregatedOperators = useMemo(() => {
        if (filterRestaurant === 'all') {
            // Merge all restaurants
            const merged = {};
            Object.values(operatorsByRestaurant).forEach(restaurantOps => {
                Object.entries(restaurantOps).forEach(([email, metrics]) => {
                    if (!merged[email]) {
                        merged[email] = { ...metrics };
                    } else {
                        merged[email].totalOrders += metrics.totalOrders;
                        merged[email].flaggedCount += metrics.flaggedCount;
                        merged[email].escalatedCount += metrics.escalatedCount;
                        merged[email].resolvedCount += metrics.resolvedCount;
                        merged[email].acknowledgedCount += metrics.acknowledgedCount;
                        merged[email].abuseEscalations += metrics.abuseEscalations;
                        
                        // Merge reason codes
                        Object.entries(metrics.reasonCodes).forEach(([code, count]) => {
                            merged[email].reasonCodes[code] = (merged[email].reasonCodes[code] || 0) + count;
                        });
                    }
                });
            });
            
            // Recalculate rates
            Object.values(merged).forEach(op => {
                op.flaggedRate = op.totalOrders > 0
                    ? Math.round((op.flaggedCount / op.totalOrders) * 100)
                    : 0;
                op.escalationRate = op.flaggedCount > 0
                    ? Math.round((op.escalatedCount / op.flaggedCount) * 100)
                    : 0;
            });
            
            return merged;
        } else {
            return operatorsByRestaurant[filterRestaurant] || {};
        }
    }, [operatorsByRestaurant, filterRestaurant]);

    // Detect outliers
    const outliers = useMemo(() => {
        return detectOperatorOutliers(aggregatedOperators);
    }, [aggregatedOperators]);

    // Calculate risk scores and sort
    const rankedOperators = useMemo(() => {
        const withRisk = Object.values(aggregatedOperators).map(op => ({
            ...op,
            riskScore: calculateOperatorRiskScore(op)
        }));
        
        if (sortBy === 'risk') {
            return withRisk.sort((a, b) => b.riskScore - a.riskScore);
        } else if (sortBy === 'flagged_rate') {
            return withRisk.sort((a, b) => b.flaggedRate - a.flaggedRate);
        } else if (sortBy === 'volume') {
            return withRisk.sort((a, b) => b.totalOrders - a.totalOrders);
        } else if (sortBy === 'escalation_rate') {
            return withRisk.sort((a, b) => b.escalationRate - a.escalationRate);
        }
        return withRisk;
    }, [aggregatedOperators, sortBy]);

    if (restaurants.length === 0 || orders.length === 0) {
        return (
            <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No operator data available</p>
            </div>
        );
    }

    const totalOperators = Object.keys(aggregatedOperators).length;
    const totalFlagged = rankedOperators.reduce((sum, op) => sum + op.flaggedCount, 0);
    const avgFlaggedRate = rankedOperators.length > 0
        ? Math.round(totalFlagged / rankedOperators.reduce((sum, op) => sum + op.totalOrders, 0) * 100)
        : 0;

    return (
        <div className="space-y-6">
            {/* Header + Summary */}
            <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Operator Analytics</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{totalOperators}</p>
                            <p className="text-xs text-gray-500 mt-1">Total Operators</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{rankedOperators.reduce((sum, op) => sum + op.totalOrders, 0)}</p>
                            <p className="text-xs text-gray-500 mt-1">Offline Orders</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-orange-50">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-orange-900">{totalFlagged}</p>
                            <p className="text-xs text-orange-600 mt-1">Flagged ({avgFlaggedRate}%)</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{Object.keys(outliers).length}</p>
                            <p className="text-xs text-gray-500 mt-1">Outliers</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Outliers Alert */}
            {Object.keys(outliers).length > 0 && (
                <Card className="border border-orange-200 bg-orange-50">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                            <CardTitle className="text-sm font-semibold text-orange-900">Operator Signals & Patterns</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        {outliers.highest_flagged_rate && (
                            <div className="p-2 bg-white rounded border border-orange-100">
                                <p className="font-medium text-gray-900">{outliers.highest_flagged_rate.name}</p>
                                <p className="text-xs text-gray-600">{outliers.highest_flagged_rate.message}</p>
                            </div>
                        )}
                        {outliers.highest_escalation_rate && (
                            <div className="p-2 bg-white rounded border border-orange-100">
                                <p className="font-medium text-gray-900">{outliers.highest_escalation_rate.name}</p>
                                <p className="text-xs text-gray-600">{outliers.highest_escalation_rate.message}</p>
                            </div>
                        )}
                        {outliers.abuse_related_escalations && (
                            <div className="p-2 bg-white rounded border border-red-100">
                                <p className="font-medium text-gray-900">{outliers.abuse_related_escalations.name}</p>
                                <p className="text-xs text-gray-600">{outliers.abuse_related_escalations.message}</p>
                            </div>
                        )}
                        {outliers.reason_code_concentration && (
                            <div className="p-2 bg-white rounded border border-orange-100">
                                <p className="font-medium text-gray-900">{outliers.reason_code_concentration.name}</p>
                                <p className="text-xs text-gray-600">{outliers.reason_code_concentration.message}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Disclaimer */}
            <Card className="border-0 shadow-sm bg-blue-50 border border-blue-200">
                <CardContent className="p-4">
                    <div className="flex gap-3">
                        <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-900">
                            <p className="font-semibold">About These Metrics</p>
                            <ul className="list-disc list-inside text-xs mt-2 space-y-1">
                                <li>Operators may share POS terminals, so patterns reflect workflow context, not individual blame</li>
                                <li>Flagged rate = % of orders by this operator that triggered validation issues</li>
                                <li>Escalation rate = % of flagged orders that manager escalated (not resolved)</li>
                                <li>These are operational signals for investigation, not proof of fault</li>
                                <li>High volume with quality issues may indicate training, process, or workload factors</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Controls */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex gap-2">
                    <label className="text-xs text-gray-600 font-medium">Restaurant:</label>
                    <select
                        value={filterRestaurant}
                        onChange={(e) => setFilterRestaurant(e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-orange-500"
                    >
                        <option value="all">All Restaurants</option>
                        {restaurants.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </select>
                </div>
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
                        <option value="volume">Order Volume</option>
                    </select>
                </div>
            </div>

            {/* Operator List */}
            <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px]">
                            <thead>
                                <tr className="border-b bg-gray-50">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Operator</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Risk</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Volume</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Flagged %</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Escalations %</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Top Code</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rankedOperators.map((op) => {
                                    const topCode = Object.entries(op.reasonCodes)
                                        .sort(([, a], [, b]) => b - a)[0];
                                    
                                    const riskColor = op.riskScore > 60 ? 'bg-red-50' : op.riskScore > 40 ? 'bg-orange-50' : 'bg-green-50';
                                    
                                    return (
                                        <tr key={op.operatorEmail} className={`border-b hover:${riskColor} transition-colors`}>
                                            <td className="px-4 py-3">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{op.operatorName}</p>
                                                    <p className="text-xs text-gray-500">{op.operatorRole}</p>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge className={`text-xs font-semibold ${
                                                    op.riskScore > 60 ? 'bg-red-100 text-red-800' :
                                                    op.riskScore > 40 ? 'bg-orange-100 text-orange-800' :
                                                    'bg-green-100 text-green-800'
                                                }`}>
                                                    {op.riskScore}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-sm font-medium text-gray-900">{op.totalOrders}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-sm font-medium ${op.flaggedRate > 15 ? 'text-orange-600' : 'text-gray-600'}`}>
                                                    {op.flaggedRate}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-sm font-medium ${op.escalationRate > 50 ? 'text-red-600' : 'text-gray-600'}`}>
                                                    {op.flaggedCount > 0 ? op.escalationRate : '—'}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {topCode ? (
                                                    <span className="text-xs text-gray-600">{topCode[0]}</span>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setSelectedOperator(op)}
                                                    className="h-7 text-xs gap-1"
                                                >
                                                    <Eye className="h-3 w-3" />
                                                    Details
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {rankedOperators.length === 0 && (
                            <div className="py-12 text-center text-gray-400 text-sm">
                                No operators with offline orders
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Detail Modal */}
            {selectedOperator && (
                <Card className="border-0 shadow-sm bg-gray-50">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm">{selectedOperator.operatorName} ({selectedOperator.operatorRole})</CardTitle>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedOperator(null)}
                        >
                            ✕
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <p className="text-xs text-gray-600">Total Orders</p>
                                <p className="text-lg font-bold text-gray-900">{selectedOperator.totalOrders}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Flagged</p>
                                <p className="text-lg font-bold text-orange-600">{selectedOperator.flaggedCount} ({selectedOperator.flaggedRate}%)</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Escalated</p>
                                <p className="text-lg font-bold text-red-600">{selectedOperator.escalatedCount} ({selectedOperator.escalationRate}%)</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Risk Score</p>
                                <p className="text-lg font-bold text-gray-900">{calculateOperatorRiskScore(selectedOperator)}</p>
                            </div>
                        </div>
                        
                        {Object.keys(selectedOperator.reasonCodes).length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-gray-700 uppercase mb-2">Reason Code Distribution</p>
                                <div className="space-y-1">
                                    {Object.entries(selectedOperator.reasonCodes)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([code, count]) => (
                                            <div key={code} className="flex justify-between text-xs">
                                                <span className="text-gray-600">{code}</span>
                                                <span className="font-medium text-gray-900">{count}</span>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}