import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign, TrendingUp, Package, Clock } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';

export default function DriverEarnings({ driverId }) {
    const [period, setPeriod] = useState('week');

    const { data: completedOrders = [], isLoading } = useQuery({
        queryKey: ['driver-orders', driverId],
        queryFn: () => base44.entities.Order.filter({ 
            driver_id: driverId,
            status: 'delivered'
        }, '-created_date', 500),
    });

    const earnings = useMemo(() => {
        const now = new Date();
        const ranges = {
            day: { start: startOfDay(now), end: endOfDay(now) },
            week: { start: startOfWeek(now), end: endOfWeek(now) },
            month: { start: startOfMonth(now), end: endOfMonth(now) }
        };

        const filterByPeriod = (range) => {
            return completedOrders.filter(order => {
                if (!order.created_date) return false;
                return isWithinInterval(parseISO(order.created_date), range);
            });
        };

        const dayOrders = filterByPeriod(ranges.day);
        const weekOrders = filterByPeriod(ranges.week);
        const monthOrders = filterByPeriod(ranges.month);

        // Base delivery fee + 15% of order total as driver earnings
        const calculateEarnings = (orders) => {
            return orders.reduce((sum, order) => {
                const deliveryFee = order.delivery_fee || 2.99;
                const commission = (order.total * 0.15);
                return sum + deliveryFee + commission;
            }, 0);
        };

        const dayEarnings = calculateEarnings(dayOrders);
        const weekEarnings = calculateEarnings(weekOrders);
        const monthEarnings = calculateEarnings(monthOrders);

        // Earnings by day for the week
        const earningsByDay = {};
        weekOrders.forEach(order => {
            const day = format(parseISO(order.created_date), 'EEE');
            const deliveryFee = order.delivery_fee || 2.99;
            const commission = (order.total * 0.15);
            earningsByDay[day] = (earningsByDay[day] || 0) + deliveryFee + commission;
        });

        const weekChartData = Object.entries(earningsByDay).map(([day, earnings]) => ({
            day,
            earnings: parseFloat(earnings.toFixed(2))
        }));

        // Earnings by day for the month
        const earningsByDate = {};
        monthOrders.forEach(order => {
            const date = format(parseISO(order.created_date), 'MMM dd');
            const deliveryFee = order.delivery_fee || 2.99;
            const commission = (order.total * 0.15);
            earningsByDate[date] = (earningsByDate[date] || 0) + deliveryFee + commission;
        });

        const monthChartData = Object.entries(earningsByDate).map(([date, earnings]) => ({
            date,
            earnings: parseFloat(earnings.toFixed(2))
        }));

        // Average earnings per delivery
        const avgEarningsPerDelivery = completedOrders.length > 0 
            ? calculateEarnings(completedOrders) / completedOrders.length 
            : 0;

        return {
            dayEarnings,
            weekEarnings,
            monthEarnings,
            dayOrders: dayOrders.length,
            weekOrders: weekOrders.length,
            monthOrders: monthOrders.length,
            weekChartData,
            monthChartData,
            avgEarningsPerDelivery,
            totalEarnings: calculateEarnings(completedOrders)
        };
    }, [completedOrders]);

    if (isLoading) {
        return <Skeleton className="h-96 w-full" />;
    }

    const currentEarnings = period === 'day' ? earnings.dayEarnings : 
                           period === 'week' ? earnings.weekEarnings : 
                           earnings.monthEarnings;

    const currentOrders = period === 'day' ? earnings.dayOrders : 
                         period === 'week' ? earnings.weekOrders : 
                         earnings.monthOrders;

    return (
        <div className="space-y-6">
            <Tabs value={period} onValueChange={setPeriod}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="day">Today</TabsTrigger>
                    <TabsTrigger value="week">This Week</TabsTrigger>
                    <TabsTrigger value="month">This Month</TabsTrigger>
                </TabsList>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Earnings</p>
                                    <p className="text-2xl font-bold text-green-600">
                                        ${currentEarnings.toFixed(2)}
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                    <DollarSign className="h-6 w-6 text-green-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Deliveries</p>
                                    <p className="text-2xl font-bold text-gray-900">{currentOrders}</p>
                                </div>
                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                    <Package className="h-6 w-6 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-600">Avg Per Delivery</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        ${earnings.avgEarningsPerDelivery.toFixed(2)}
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                                    <TrendingUp className="h-6 w-6 text-purple-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <TabsContent value="week" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Weekly Earnings</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={earnings.weekChartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="day" />
                                    <YAxis />
                                    <Tooltip formatter={(value) => `$${value}`} />
                                    <Bar dataKey="earnings" fill="#10b981" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="month" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Monthly Earnings</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={earnings.monthChartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} />
                                    <YAxis />
                                    <Tooltip formatter={(value) => `$${value}`} />
                                    <Line type="monotone" dataKey="earnings" stroke="#10b981" strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Card>
                <CardHeader>
                    <CardTitle>All-Time Stats</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Total Earnings</p>
                            <p className="text-xl font-bold text-gray-900">${earnings.totalEarnings.toFixed(2)}</p>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Total Deliveries</p>
                            <p className="text-xl font-bold text-gray-900">{completedOrders.length}</p>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Avg Per Delivery</p>
                            <p className="text-xl font-bold text-gray-900">
                                ${earnings.avgEarningsPerDelivery.toFixed(2)}
                            </p>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Completion Rate</p>
                            <p className="text-xl font-bold text-gray-900">
                                {completedOrders.length > 0 ? '100%' : '0%'}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}