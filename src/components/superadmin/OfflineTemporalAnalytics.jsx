/**
 * Offline Temporal Analytics Dashboard
 * 
 * Shows when offline issues occur:
 * - Daypart (breakfast/lunch/afternoon/dinner/late)
 * - Day-of-week (weekday vs weekend)
 * - Hourly trends
 * - Temporal outliers (5 rule-based signals)
 * 
 * All timestamps in UTC. No timezone conversion (see docs for limitation).
 */

import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, Clock, Calendar, TrendingUp, Eye } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { calculateTemporalMetrics, detectTemporalOutliers, aggregateTemporalMetricsAcrossRestaurants } from '@/lib/offline-temporal-analytics';
import { createPageUrl } from '@/utils';

const DAYPART_ORDER = ['morning', 'lunch', 'afternoon', 'dinner', 'late'];
const DAYPART_DISPLAY = {
    morning: '🌅 Morning',
    lunch: '🍽️ Lunch',
    afternoon: '☀️ Afternoon',
    dinner: '🍽️ Dinner',
    late: '🌙 Late'
};

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function OfflineTemporalAnalytics() {
    const [sortBy, setSortBy] = useState('daypart'); // 'daypart' | 'flagged_rate' | 'volume'

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list()
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['all-orders'],
        queryFn: () => base44.entities.Order.list('-offline_synced_at', 1000)
    });

    // Calculate temporal metrics per restaurant
    const temporalByRestaurant = useMemo(() => {
        const result = {};
        restaurants.forEach(r => {
            const restaurantOrders = orders.filter(o => o.restaurant_id === r.id);
            result[r.id] = calculateTemporalMetrics(r.id, restaurantOrders);
        });
        return result;
    }, [restaurants, orders]);

    // Aggregate across restaurants
    const aggregatedTemporal = useMemo(() => {
        return aggregateTemporalMetricsAcrossRestaurants(temporalByRestaurant);
    }, [temporalByRestaurant]);

    // Detect outliers
    const temporalOutliers = useMemo(() => {
        return detectTemporalOutliers(aggregatedTemporal);
    }, [aggregatedTemporal]);

    // Prepare data for charts
    const daypartData = useMemo(() => {
        return DAYPART_ORDER
            .map(dp => aggregatedTemporal.byDaypart[dp])
            .filter(Boolean)
            .map(dp => ({
                name: DAYPART_DISPLAY[dp.daypart],
                orders: dp.totalOrders,
                flagged: dp.flaggedCount,
                rate: dp.flaggedRate
            }));
    }, [aggregatedTemporal]);

    const dayOfWeekData = useMemo(() => {
        return DAY_ORDER
            .map(day => aggregatedTemporal.byDayOfWeek[day])
            .filter(Boolean)
            .map(dow => ({
                name: dow.day.slice(0, 3),
                orders: dow.totalOrders,
                flagged: dow.flaggedCount,
                rate: dow.flaggedRate,
                isWeekend: dow.isWeekend
            }));
    }, [aggregatedTemporal]);

    const hourlyData = useMemo(() => {
        return aggregatedTemporal.hourlyTrend
            .filter(h => h.count > 0)
            .map(h => ({
                hour: `${String(h.hour).padStart(2, '0')}:00`,
                orders: h.count,
                flagged: h.flagged,
                rate: h.flaggedRate
            }));
    }, [aggregatedTemporal]);

    if (restaurants.length === 0 || orders.length === 0) {
        return (
            <div className="text-center py-12">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No offline orders to analyze</p>
            </div>
        );
    }

    const outlierColor = {
        high_flagged_daypart: 'bg-red-50 border-red-200',
        high_escalation_daypart: 'bg-red-50 border-red-200',
        daypart_concentration: 'bg-yellow-50 border-yellow-200',
        weekend_weekday_anomaly: 'bg-orange-50 border-orange-200',
        high_flagged_hour: 'bg-red-50 border-red-200'
    };

    const outlierIcon = {
        high_flagged_daypart: <AlertTriangle className="h-4 w-4 text-red-600" />,
        high_escalation_daypart: <AlertTriangle className="h-4 w-4 text-red-600" />,
        daypart_concentration: <TrendingUp className="h-4 w-4 text-yellow-600" />,
        weekend_weekday_anomaly: <AlertCircle className="h-4 w-4 text-orange-600" />,
        high_flagged_hour: <Clock className="h-4 w-4 text-red-600" />
    };

    return (
        <div className="space-y-6">
            {/* Header + Summary */}
            <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Offline Temporal Analytics</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{aggregatedTemporal.totalOrders}</p>
                            <p className="text-xs text-gray-500 mt-1">Total Offline Orders</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-red-50">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-red-900">{aggregatedTemporal.summary?.overallFlaggedRate || 0}%</p>
                            <p className="text-xs text-red-600 mt-1">Flagged Rate</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{Object.keys(aggregatedTemporal.byDaypart).length}</p>
                            <p className="text-xs text-gray-500 mt-1">Active Dayparts</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold text-gray-900">{Object.keys(temporalOutliers).length}</p>
                            <p className="text-xs text-gray-500 mt-1">Temporal Outliers</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Outliers Section */}
            {Object.keys(temporalOutliers).length > 0 && (
                <Card className="border border-red-200 bg-red-50">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                            <CardTitle className="text-sm font-semibold text-red-900">Temporal Outliers & Signals</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {Object.entries(temporalOutliers).map(([key, outlier]) => (
                                <div key={key} className={`p-3 rounded border ${outlierColor[key] || 'bg-gray-50'}`}>
                                    <div className="flex items-start gap-2">
                                        {outlierIcon[key]}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-gray-900 break-words">{outlier.message}</p>
                                            {outlier.daypart && (
                                                <p className="text-xs text-gray-600 mt-1">
                                                    {outlier.count || outlier.rate}% • {outlier.daypart}
                                                </p>
                                            )}
                                            {outlier.hour !== undefined && (
                                                <p className="text-xs text-gray-600 mt-1">
                                                    Hour {String(outlier.hour).padStart(2, '0')}:00 UTC
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Daypart Analysis */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm">Offline Orders by Daypart</CardTitle>
                </CardHeader>
                <CardContent>
                    {daypartData.length > 0 ? (
                        <div className="space-y-4">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={daypartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="orders" fill="#3b82f6" />
                                </BarChart>
                            </ResponsiveContainer>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                {daypartData.map(dp => (
                                    <div key={dp.name} className="p-2 bg-gray-50 rounded text-center">
                                        <p className="text-xs font-semibold text-gray-900">{dp.name}</p>
                                        <p className="text-xs text-gray-600">{dp.orders} orders</p>
                                        <Badge className={`text-xs mt-1 ${dp.rate > 20 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                                            {dp.rate}% flagged
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm">No data</p>
                    )}
                </CardContent>
            </Card>

            {/* Day-of-Week Analysis */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm">Offline Orders by Day of Week</CardTitle>
                </CardHeader>
                <CardContent>
                    {dayOfWeekData.length > 0 ? (
                        <div className="space-y-4">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={dayOfWeekData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="orders" fill={dayOfWeekData.some(d => d.isWeekend) ? '#f97316' : '#3b82f6'} />
                                </BarChart>
                            </ResponsiveContainer>
                            <div className="grid grid-cols-7 gap-1">
                                {dayOfWeekData.map(dow => (
                                    <div key={dow.name} className={`p-2 rounded text-center ${dow.isWeekend ? 'bg-orange-50' : 'bg-blue-50'}`}>
                                        <p className="text-xs font-semibold text-gray-900">{dow.name}</p>
                                        <p className="text-xs text-gray-600">{dow.orders}</p>
                                        <p className={`text-xs font-medium ${dow.rate > 20 ? 'text-red-600' : 'text-gray-600'}`}>
                                            {dow.rate}%
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm">No data</p>
                    )}
                </CardContent>
            </Card>

            {/* Hourly Trend */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm">Hourly Trend (UTC)</CardTitle>
                </CardHeader>
                <CardContent>
                    {hourlyData.length > 0 ? (
                        <div className="space-y-4">
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={hourlyData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="hour" interval={2} />
                                    <YAxis />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="rate" stroke="#ef4444" name="Flagged %" />
                                </LineChart>
                            </ResponsiveContainer>
                            <p className="text-xs text-gray-500 text-center">All times in UTC. See docs for timezone limitations.</p>
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm">No data</p>
                    )}
                </CardContent>
            </Card>

            {/* Summary Notes */}
            <Card className="border-0 shadow-sm bg-blue-50 border border-blue-200">
                <CardContent className="p-4">
                    <div className="flex gap-3">
                        <Clock className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-900">
                            <p className="font-semibold">Timestamp Notes</p>
                            <ul className="list-disc list-inside text-xs mt-2 space-y-1">
                                <li>All analysis uses <strong>offline_synced_at</strong> (server-authoritative UTC)</li>
                                <li>No timezone conversion applied (see docs for impact)</li>
                                <li>Dayparts: Morning (05–11), Lunch (11–14), Afternoon (14–17), Dinner (17–22), Late (22–05)</li>
                                <li>Outliers are operational signals, not proof of root cause</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}