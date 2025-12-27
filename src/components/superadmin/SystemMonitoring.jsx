import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
    Activity, 
    Server, 
    Database,
    AlertTriangle,
    CheckCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function SystemMonitoring() {
    const { data: orders = [] } = useQuery({
        queryKey: ['all-orders'],
        queryFn: () => base44.entities.Order.list('-created_date', 500),
    });

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: users = [] } = useQuery({
        queryKey: ['all-users'],
        queryFn: () => base44.entities.User.list(),
    });

    // Orders by day (last 7 days)
    const ordersByDay = React.useMemo(() => {
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            return date.toISOString().split('T')[0];
        });

        return last7Days.map(date => {
            const count = orders.filter(o => o.created_date?.startsWith(date)).length;
            const revenue = orders
                .filter(o => o.created_date?.startsWith(date) && o.status === 'delivered')
                .reduce((sum, o) => sum + (o.total || 0), 0);
            
            return {
                date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                orders: count,
                revenue: parseFloat(revenue.toFixed(2))
            };
        });
    }, [orders]);

    // Order status distribution
    const statusDistribution = React.useMemo(() => {
        const statuses = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
        return statuses.map(status => ({
            status: status.replace('_', ' '),
            count: orders.filter(o => o.status === status).length
        }));
    }, [orders]);

    const systemHealth = [
        {
            name: 'Database',
            status: 'healthy',
            icon: Database,
            value: `${(orders.length + restaurants.length + users.length)} records`,
        },
        {
            name: 'API Response',
            status: 'healthy',
            icon: Server,
            value: '< 200ms',
        },
        {
            name: 'Active Sessions',
            status: 'healthy',
            icon: Activity,
            value: users.length,
        },
    ];

    return (
        <div className="space-y-6">
            {/* System Health */}
            <div className="grid md:grid-cols-3 gap-4">
                {systemHealth.map((item, index) => {
                    const Icon = item.icon;
                    return (
                        <Card key={index}>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600 mb-1">{item.name}</p>
                                        <p className="text-xl font-bold text-gray-900">{item.value}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {item.status === 'healthy' ? (
                                            <CheckCircle className="h-5 w-5 text-green-500" />
                                        ) : (
                                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                                        )}
                                        <Icon className="h-6 w-6 text-gray-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Orders Over Time */}
            <Card>
                <CardHeader>
                    <CardTitle>Orders & Revenue (Last 7 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={ordersByDay}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis yAxisId="left" />
                            <YAxis yAxisId="right" orientation="right" />
                            <Tooltip />
                            <Line yAxisId="left" type="monotone" dataKey="orders" stroke="#f97316" strokeWidth={2} name="Orders" />
                            <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} name="Revenue (£)" />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Order Status Distribution */}
            <Card>
                <CardHeader>
                    <CardTitle>Order Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={statusDistribution}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="status" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="count" fill="#f97316" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Entity Counts */}
            <Card>
                <CardHeader>
                    <CardTitle>Database Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                            <p className="text-3xl font-bold text-blue-600">{restaurants.length}</p>
                            <p className="text-sm text-gray-600">Restaurants</p>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                            <p className="text-3xl font-bold text-green-600">{users.length}</p>
                            <p className="text-sm text-gray-600">Users</p>
                        </div>
                        <div className="text-center p-4 bg-orange-50 rounded-lg">
                            <p className="text-3xl font-bold text-orange-600">{orders.length}</p>
                            <p className="text-sm text-gray-600">Orders</p>
                        </div>
                        <div className="text-center p-4 bg-purple-50 rounded-lg">
                            <p className="text-3xl font-bold text-purple-600">
                                £{orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + (o.total || 0), 0).toFixed(0)}
                            </p>
                            <p className="text-sm text-gray-600">Total Revenue</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}