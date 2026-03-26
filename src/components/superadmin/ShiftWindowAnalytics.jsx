/**
 * Shift Window Analytics Dashboard
 * 
 * Estimated shift-window visibility using opening_hours + timezone.
 * NO real staffing data. Proxy model only.
 * All labels explicitly mark as "Estimated".
 */

import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, TrendingUp, Users, Eye, AlertTriangle } from 'lucide-react';
import { calculateShiftWindowMetrics, aggregateShiftWindowMetrics, getAverageFlaggedRate, getShiftWindowsForDisplay } from '@/lib/shift-window-proxy';
import { detectShiftWindowOutliers, calculateWindowRiskScore } from '@/lib/shift-window-outlier-rules';

export default function ShiftWindowAnalytics() {
    const [filterRestaurant, setFilterRestaurant] = useState('all');
    const [sortBy, setSortBy] = useState('risk');
    const [selectedWindow, setSelectedWindow] = useState(null);

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list()
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['all-orders'],
        queryFn: () => base44.entities.Order.list('-offline_synced_at', 1000)
    });

    // Calculate metrics per restaurant
    const windowsByRestaurant = useMemo(() => {
        const result = {};
        restaurants.forEach(r => {
            const restaurantOrders = orders.filter(o => o.restaurant_id === r.id);
            result[r.id] = calculateShiftWindowMetrics(r.id, restaurantOrders, r);
        });
        return result;
    }, [restaurants, orders]);

    // Aggregate across all or single restaurant
    const aggregatedMetrics = useMemo(() => {
        if (filterRestaurant === 'all') {
            return aggregateShiftWindowMetrics(windowsByRestaurant);
        } else {
            const single = windowsByRestaurant[filterRestaurant] || {};
            return single;
        }
    }, [windowsByRestaurant, filterRestaurant]);

    // Detect outliers
    const outliers = useMemo(() => {
        return detectShiftWindowOutliers(aggregatedMetrics, windowsByRestaurant);
    }, [aggregatedMetrics, windowsByRestaurant]);

    // Prepare sorted window list
    const sortedWindows = useMemo(() => {
        const withRisk = Object.values(aggregatedMetrics).map(w => ({
            ...w,
            riskScore: calculateWindowRiskScore(w)
        }));
        
        if (sortBy === 'risk') {
            return withRisk.sort((a, b) => b.riskScore - a.riskScore);
        } else if (sortBy === 'flagged') {
            return withRisk.sort((a, b) => b.flaggedRate - a.flaggedRate);
        } else if (sortBy === 'escalation') {
            return withRisk.sort((a, b) => b.escalationRate - a.escalationRate);
        } else if (sortBy === 'volume') {
            return withRisk.sort((a, b) => b.totalOrders - a.totalOrders);
        }
        return withRisk;
    }, [aggregatedMetrics, sortBy]);

    if (restaurants.length === 0 || orders.length === 0) {
        return (
            <div className="text-center py-12">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No shift window data available</p>
            </div>
        );
    }

    const totalOrders = sortedWindows.reduce((sum, w) => sum + w.totalOrders, 0);
    const avgFlaggedRate = getAverageFlaggedRate(aggregatedMetrics);

    return (
        <div className="space-y-6">
            {/* Header + Summary */}
            <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Estimated Shift Window Analytics</h2>
                <p className="text-xs text-gray-500 mb-4">🔍 Proxy model: windows estimated from opening_hours + timezone. No real staffing data.</p>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{sortedWindows.length}</p>
                            <p className="text-xs text-gray-500 mt-1">Shift Windows</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
                            <p className="text-xs text-gray-500 mt-1">Offline Orders</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-orange-50">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-orange-900">{avgFlaggedRate}%</p>
                            <p className="text-xs text-orange-600 mt-1">Avg Flagged Rate</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{Object.keys(outliers).length}</p>
                            <p className="text-xs text-gray-500 mt-1">Detected Patterns</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Honest Disclaimer */}
            <Card className="border-0 shadow-sm bg-blue-50 border border-blue-200">
                <CardContent className="p-4">
                    <div className="flex gap-3">
                        <Clock className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-900">
                            <p className="font-semibold">About Estimated Shift Windows</p>
                            <ul className="list-disc list-inside text-xs mt-2 space-y-1">
                                <li>Windows are <strong>estimated</strong> from opening_hours + restaurant timezone only</li>
                                <li>Morning (05:00-12:00), Afternoon (12:00-17:00), Evening (17:00-22:00), Late (22:00-05:00)</li>
                                <li>NO real shift assignment or staffing roster data</li>
                                <li>Cannot determine actual staff on duty or manager presence</li>
                                <li>Boundary clustering may reflect legitimate workflow or handover context</li>
                                <li>Use for investigation signals only, not staffing conclusions</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Outliers */}
            {Object.keys(outliers).length > 0 && (
                <Card className="border border-orange-200 bg-orange-50">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                            <CardTitle className="text-sm font-semibold text-orange-900">Shift Window Signals</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        {outliers.high_flagged_window && (
                            <div className="p-2 bg-white rounded border border-orange-100">
                                <p className="font-medium text-gray-900">{outliers.high_flagged_window.label}</p>
                                <p className="text-xs text-gray-600">{outliers.high_flagged_window.message}</p>
                            </div>
                        )}
                        {outliers.high_escalation_window && (
                            <div className="p-2 bg-white rounded border border-orange-100">
                                <p className="font-medium text-gray-900">{outliers.high_escalation_window.label}</p>
                                <p className="text-xs text-gray-600">{outliers.high_escalation_window.message}</p>
                            </div>
                        )}
                        {outliers.boundary_concentration && (
                            <div className="p-2 bg-white rounded border border-yellow-100">
                                <p className="font-medium text-gray-900">🔄 Boundary Clustering</p>
                                <p className="text-xs text-gray-600">{outliers.boundary_concentration.message}</p>
                            </div>
                        )}
                        {outliers.abuse_window && (
                            <div className="p-2 bg-white rounded border border-red-100">
                                <p className="font-medium text-gray-900">{outliers.abuse_window.label}</p>
                                <p className="text-xs text-gray-600">{outliers.abuse_window.message}</p>
                            </div>
                        )}
                        {outliers.reason_spike_window && (
                            <div className="p-2 bg-white rounded border border-orange-100">
                                <p className="font-medium text-gray-900">{outliers.reason_spike_window.label}</p>
                                <p className="text-xs text-gray-600">{outliers.reason_spike_window.message}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Controls */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex gap-2">
                    <label className="text-xs text-gray-600 font-medium">Restaurant:</label>
                    <select
                        value={filterRestaurant}
                        onChange={(e) => setFilterRestaurant(e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
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
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                    >
                        <option value="risk">Risk Score</option>
                        <option value="flagged">Flagged Rate</option>
                        <option value="escalation">Escalation Rate</option>
                        <option value="volume">Order Volume</option>
                    </select>
                </div>
            </div>

            {/* Window Table */}
            <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px]">
                            <thead>
                                <tr className="border-b bg-gray-50">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Window</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Risk</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Volume</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Flagged %</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Escalated %</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Boundary %</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedWindows.map((window) => {
                                    const riskColor = window.riskScore > 60 ? 'bg-red-50' : window.riskScore > 40 ? 'bg-orange-50' : 'bg-green-50';
                                    const boundaryPct = window.totalOrders > 0
                                        ? Math.round((window.boundaryOrderCount / window.totalOrders) * 100)
                                        : 0;
                                    
                                    return (
                                        <tr key={window.window} className={`border-b hover:${riskColor} transition-colors`}>
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-medium text-gray-900">{window.label}</p>
                                                <p className="text-xs text-gray-500">Estimated</p>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge className={`text-xs font-semibold ${
                                                    window.riskScore > 60 ? 'bg-red-100 text-red-800' :
                                                    window.riskScore > 40 ? 'bg-orange-100 text-orange-800' :
                                                    'bg-green-100 text-green-800'
                                                }`}>
                                                    {window.riskScore}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-sm font-medium text-gray-900">{window.totalOrders}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-sm font-medium ${window.flaggedRate > 20 ? 'text-orange-600' : 'text-gray-600'}`}>
                                                    {window.flaggedRate}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-sm font-medium ${window.escalationRate > 50 ? 'text-red-600' : 'text-gray-600'}`}>
                                                    {window.flaggedCount > 0 ? window.escalationRate : '—'}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-sm font-medium ${boundaryPct > 20 ? 'text-blue-600' : 'text-gray-600'}`}>
                                                    {boundaryPct}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => setSelectedWindow(window)}
                                                    className="text-xs text-blue-600 hover:underline"
                                                >
                                                    Details
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {sortedWindows.length === 0 && (
                            <div className="py-12 text-center text-gray-400 text-sm">
                                No shift window data
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Detail Modal */}
            {selectedWindow && (
                <Card className="border-0 shadow-sm bg-gray-50">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm">{selectedWindow.label}</CardTitle>
                        <button
                            onClick={() => setSelectedWindow(null)}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            ✕
                        </button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <p className="text-xs text-gray-600">Total Orders</p>
                                <p className="text-lg font-bold text-gray-900">{selectedWindow.totalOrders}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Flagged</p>
                                <p className="text-lg font-bold text-orange-600">{selectedWindow.flaggedCount} ({selectedWindow.flaggedRate}%)</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Escalated</p>
                                <p className="text-lg font-bold text-red-600">{selectedWindow.escalatedCount} ({selectedWindow.escalationRate}%)</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Boundary Orders</p>
                                <p className="text-lg font-bold text-blue-600">{selectedWindow.boundaryOrderCount}</p>
                            </div>
                        </div>
                        
                        {Object.keys(selectedWindow.reasonCodes).length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-gray-700 uppercase mb-2">Reason Code Distribution</p>
                                <div className="space-y-1">
                                    {Object.entries(selectedWindow.reasonCodes)
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
                        
                        {selectedWindow.operatorEmails.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-gray-700 uppercase mb-2">Active Operators</p>
                                <div className="space-y-1">
                                    {selectedWindow.operatorEmails.slice(0, 5).map(email => (
                                        <div key={email} className="text-xs text-gray-600">
                                            {email} ({selectedWindow.operators[email]} orders)
                                        </div>
                                    ))}
                                    {selectedWindow.operatorEmails.length > 5 && (
                                        <p className="text-xs text-gray-500">+{selectedWindow.operatorEmails.length - 5} more</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}