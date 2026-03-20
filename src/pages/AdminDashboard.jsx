import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    Building, DollarSign, ShoppingBag, TrendingUp, Star, 
    Users, ArrowUpRight, BarChart3, LayoutDashboard 
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AdminDashboard() {
    const navigate = useNavigate();
    const [isAuthorized, setIsAuthorized] = useState(false);

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
        enabled: isAuthorized,
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['all-orders'],
        queryFn: () => base44.entities.Order.list('-created_date', 100),
        enabled: isAuthorized,
    });

    const { data: reviews = [] } = useQuery({
        queryKey: ['all-reviews'],
        queryFn: () => base44.entities.Review.list(),
        enabled: isAuthorized,
    });

    // Check authentication and admin role
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const user = await base44.auth.me();
                if (!user || user.role !== 'admin') {
                    base44.auth.redirectToLogin(window.location.pathname);
                    return;
                }
                setIsAuthorized(true);
            } catch (e) {
                base44.auth.redirectToLogin(window.location.pathname);
            }
        };
        checkAuth();
    }, []);

    if (!isAuthorized) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Checking access...</p>
                </div>
            </div>
        );
    }

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
            <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                        <p className="text-sm sm:text-base text-gray-600 mt-1">Platform-wide performance overview</p>
                    </div>
                    <Link to={createPageUrl('AdminRestaurants')} className="w-full sm:w-auto">
                        <Button className="bg-orange-500 hover:bg-orange-600 w-full sm:w-auto">
                            <Building className="h-4 w-4 mr-2" />
                            Manage Restaurants
                        </Button>
                    </Link>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                    <Card>
                        <CardContent className="pt-4 sm:pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs sm:text-sm text-gray-600">Total Revenue</span>
                                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-bold">£{totalRevenue.toFixed(2)}</p>
                            <p className="text-xs text-gray-500 mt-1">All time</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-4 sm:pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs sm:text-sm text-gray-600">Total Orders</span>
                                <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-bold">{totalOrders}</p>
                            <p className="text-xs text-gray-500 mt-1">Completed orders</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-4 sm:pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs sm:text-sm text-gray-600">Avg Order Value</span>
                                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-bold">£{avgOrderValue.toFixed(2)}</p>
                            <p className="text-xs text-gray-500 mt-1">Per order</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-4 sm:pt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs sm:text-sm text-gray-600">Restaurants</span>
                                <Building className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-bold">{restaurants.length}</p>
                            <p className="text-xs text-gray-500 mt-1">Active restaurants</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base sm:text-lg">Revenue by Restaurant (Top 10)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={revenueByRestaurant}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Bar dataKey="revenue" fill="#f97316" name="Revenue (£)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base sm:text-lg">Orders by Restaurant (Top 10)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={revenueByRestaurant}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
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
                        <CardTitle className="text-base sm:text-lg">Restaurant Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 sm:px-6">
                        <div className="overflow-x-auto -mx-4 sm:mx-0">
                            <table className="w-full min-w-[600px]">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 sm:py-3 px-3 sm:px-4 font-semibold text-xs sm:text-sm">Restaurant</th>
                                        <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold text-xs sm:text-sm">Orders</th>
                                        <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold text-xs sm:text-sm">Revenue</th>
                                        <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold text-xs sm:text-sm hidden sm:table-cell">Avg Order</th>
                                        <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold text-xs sm:text-sm">Rating</th>
                                        <th className="text-right py-2 sm:py-3 px-3 sm:px-4 font-semibold text-xs sm:text-sm">Status</th>
                                        <th className="text-center py-2 sm:py-3 px-3 sm:px-4 font-semibold text-xs sm:text-sm">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {restaurantStats.map((restaurant) => (
                                        <tr key={restaurant.id} className="border-b hover:bg-gray-50">
                                            <td className="py-2 sm:py-3 px-3 sm:px-4">
                                                <div>
                                                    <p className="font-semibold text-xs sm:text-sm">{restaurant.name}</p>
                                                    <p className="text-xs text-gray-500">{restaurant.cuisine_type}</p>
                                                </div>
                                            </td>
                                            <td className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm">{restaurant.orderCount}</td>
                                            <td className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold text-xs sm:text-sm">
                                                £{restaurant.revenue.toFixed(2)}
                                            </td>
                                            <td className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm hidden sm:table-cell">
                                                £{restaurant.orderCount > 0 ? (restaurant.revenue / restaurant.orderCount).toFixed(2) : '0.00'}
                                            </td>
                                            <td className="text-right py-2 sm:py-3 px-2 sm:px-4">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Star className="h-3 w-3 sm:h-4 sm:w-4 fill-yellow-400 text-yellow-400" />
                                                    <span className="text-xs sm:text-sm">{restaurant.avgRating > 0 ? restaurant.avgRating.toFixed(1) : 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td className="text-right py-2 sm:py-3 px-3 sm:px-4">
                                                <Badge variant={restaurant.is_open ? 'default' : 'secondary'} className="text-xs">
                                                    {restaurant.is_open ? 'Open' : 'Closed'}
                                                </Badge>
                                            </td>
                                            <td className="text-center py-2 sm:py-3 px-3 sm:px-4">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => navigate(createPageUrl('RestaurantDashboard') + `?restaurantId=${restaurant.id}`)}
                                                    className="h-7 text-xs"
                                                >
                                                    <LayoutDashboard className="h-3 w-3 mr-1" />
                                                    Dashboard
                                                </Button>
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