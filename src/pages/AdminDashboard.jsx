import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    Building, DollarSign, ShoppingBag, TrendingUp, Star, 
    Users, ArrowUpRight, BarChart3 
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AdminDashboard() {
    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['all-orders'],
        queryFn: () => base44.entities.Order.list('-created_date', 500),
    });

    const { data: reviews = [] } = useQuery({
        queryKey: ['all-reviews'],
        queryFn: () => base44.entities.Review.list(),
    });

    // Calculate metrics
    const totalRevenue = orders
        .filter(o => o.status === 'delivered')
        .reduce((sum, o) => sum + (o.total || 0), 0);
    
    const totalOrders = orders.filter(o => o.status === 'delivered').length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Restaurant performance
    const restaurantStats = restaurants.map(restaurant => {
        const restaurantOrders = orders.filter(o => o.restaurant_id === restaurant.id && o.status === 'delivered');
        const restaurantReviews = reviews.filter(r => r.restaurant_id === restaurant.id);
        const revenue = restaurantOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const avgRating = restaurantReviews.length > 0
            ? restaurantReviews.reduce((sum, r) => sum + r.rating, 0) / restaurantReviews.length
            : 0;

        return {
            ...restaurant,
            orderCount: restaurantOrders.length,
            revenue,
            avgRating
        };
    }).sort((a, b) => b.revenue - a.revenue);

    // Revenue by restaurant
    const revenueByRestaurant = restaurantStats.slice(0, 10).map(r => ({
        name: r.name.substring(0, 15) + (r.name.length > 15 ? '...' : ''),
        revenue: r.revenue,
        orders: r.orderCount
    }));

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                        <p className="text-gray-600 mt-1">Platform-wide performance overview</p>
                    </div>
                    <Link to={createPageUrl('AdminRestaurants')}>
                        <Button className="bg-orange-500 hover:bg-orange-600">
                            <Building className="h-4 w-4 mr-2" />
                            Manage Restaurants
                        </Button>
                    </Link>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-600">Total Revenue</span>
                                <DollarSign className="h-5 w-5 text-green-500" />
                            </div>
                            <p className="text-3xl font-bold">£{totalRevenue.toFixed(2)}</p>
                            <p className="text-xs text-gray-500 mt-1">All time</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-600">Total Orders</span>
                                <ShoppingBag className="h-5 w-5 text-blue-500" />
                            </div>
                            <p className="text-3xl font-bold">{totalOrders}</p>
                            <p className="text-xs text-gray-500 mt-1">Completed orders</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-600">Avg Order Value</span>
                                <TrendingUp className="h-5 w-5 text-purple-500" />
                            </div>
                            <p className="text-3xl font-bold">£{avgOrderValue.toFixed(2)}</p>
                            <p className="text-xs text-gray-500 mt-1">Per order</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-600">Restaurants</span>
                                <Building className="h-5 w-5 text-orange-500" />
                            </div>
                            <p className="text-3xl font-bold">{restaurants.length}</p>
                            <p className="text-xs text-gray-500 mt-1">Active restaurants</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts */}
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Revenue by Restaurant (Top 10)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={revenueByRestaurant}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="revenue" fill="#f97316" name="Revenue (£)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Orders by Restaurant (Top 10)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={revenueByRestaurant}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="orders" fill="#3b82f6" name="Orders" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                {/* Restaurant Performance Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Restaurant Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-3 px-4 font-semibold">Restaurant</th>
                                        <th className="text-right py-3 px-4 font-semibold">Orders</th>
                                        <th className="text-right py-3 px-4 font-semibold">Revenue</th>
                                        <th className="text-right py-3 px-4 font-semibold">Avg Order</th>
                                        <th className="text-right py-3 px-4 font-semibold">Rating</th>
                                        <th className="text-right py-3 px-4 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {restaurantStats.map((restaurant) => (
                                        <tr key={restaurant.id} className="border-b hover:bg-gray-50">
                                            <td className="py-3 px-4">
                                                <div>
                                                    <p className="font-semibold">{restaurant.name}</p>
                                                    <p className="text-xs text-gray-500">{restaurant.cuisine_type}</p>
                                                </div>
                                            </td>
                                            <td className="text-right py-3 px-4">{restaurant.orderCount}</td>
                                            <td className="text-right py-3 px-4 font-semibold">
                                                £{restaurant.revenue.toFixed(2)}
                                            </td>
                                            <td className="text-right py-3 px-4">
                                                £{restaurant.orderCount > 0 ? (restaurant.revenue / restaurant.orderCount).toFixed(2) : '0.00'}
                                            </td>
                                            <td className="text-right py-3 px-4">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                                    <span>{restaurant.avgRating > 0 ? restaurant.avgRating.toFixed(1) : 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td className="text-right py-3 px-4">
                                                <Badge variant={restaurant.is_open ? 'default' : 'secondary'}>
                                                    {restaurant.is_open ? 'Open' : 'Closed'}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}