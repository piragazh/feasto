import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Activity, AlertCircle, CheckCircle2, Clock, TrendingUp, Filter, X, Loader2 } from 'lucide-react';

export default function KioskMonitoringDashboard() {
  const [restaurantFilter, setRestaurantFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch restaurants
  const { data: restaurants = [] } = useQuery({
    queryKey: ['restaurants-for-kiosk-monitoring'],
    queryFn: async () => {
      const data = await base44.entities.Restaurant.filter({ pos_enabled: true });
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch kiosk orders
  const { data: kioskOrders = [], isLoading } = useQuery({
    queryKey: ['kiosk-orders', restaurantFilter, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      const filters = { order_source: 'kiosk' };
      if (restaurantFilter !== 'all') filters.restaurant_id = restaurantFilter;
      if (statusFilter !== 'all') filters.status = statusFilter;

      let orders = await base44.entities.Order.filter(filters, '-created_date', 100);
      
      // Apply date range
      if (dateFrom || dateTo) {
        orders = orders.filter(order => {
          const orderDate = new Date(order.created_date);
          if (dateFrom && orderDate < new Date(dateFrom)) return false;
          if (dateTo) {
            const endDate = new Date(dateTo);
            endDate.setHours(23, 59, 59, 999);
            if (orderDate > endDate) return false;
          }
          return true;
        });
      }

      return orders || [];
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Kiosk status monitoring
  const { data: kioskStatus = [] } = useQuery({
    queryKey: ['kiosk-status'],
    queryFn: async () => {
      // Get unique restaurants with kiosks
      const restaurantsWithKiosks = restaurants.filter(r => r.pos_enabled);
      
      // Get last order per restaurant to determine active/inactive
      const status = await Promise.all(
        restaurantsWithKiosks.map(async (restaurant) => {
          const recentOrders = await base44.entities.Order.filter(
            { restaurant_id: restaurant.id, order_source: 'kiosk' },
            '-created_date',
            1
          );
          
          const lastOrder = recentOrders?.[0];
          const lastActivityTime = lastOrder ? new Date(lastOrder.created_date) : null;
          const now = new Date();
          const inactiveMinutes = lastActivityTime ? Math.floor((now - lastActivityTime) / 60000) : null;
          const isActive = inactiveMinutes !== null && inactiveMinutes < 30;

          return {
            id: restaurant.id,
            name: restaurant.name,
            lastActivity: lastActivityTime,
            inactiveMinutes,
            isActive,
            totalOrders: recentOrders?.length || 0,
          };
        })
      );

      return status;
    },
    staleTime: 60000,
  });

  // Calculate stats
  const activeKiosks = kioskStatus.filter(k => k.isActive).length;
  const totalOrders = kioskOrders.length;
  const completedOrders = kioskOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length;

  const handleClearFilters = () => {
    setRestaurantFilter('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
  };

  const activeFilters = [restaurantFilter !== 'all', statusFilter !== 'all', dateFrom, dateTo].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Kiosks</p>
                <p className="text-3xl font-bold text-green-600">{activeKiosks}</p>
                <p className="text-xs text-gray-500 mt-1">of {kioskStatus.length}</p>
              </div>
              <Activity className="h-8 w-8 text-green-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Orders</p>
                <p className="text-3xl font-bold">{totalOrders}</p>
                <p className="text-xs text-gray-500 mt-1">Last 100</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-3xl font-bold text-blue-600">{completedOrders}</p>
                <p className="text-xs text-gray-500 mt-1">{totalOrders ? `${Math.round(completedOrders / totalOrders * 100)}%` : '0%'}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Inactive</p>
                <p className="text-3xl font-bold text-orange-600">{kioskStatus.length - activeKiosks}</p>
                <p className="text-xs text-gray-500 mt-1">&gt; 30 min idle</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                <X className="h-4 w-4 mr-2" />
                Clear ({activeFilters})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <Input
              placeholder="Search restaurant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Restaurants</SelectItem>
                {restaurants.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="preparing">Preparing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
            />
          </div>
        </CardContent>
      </Card>

      {/* Kiosk Status */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Kiosk Device Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kioskStatus.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="py-8 text-center text-gray-500">
                No kiosks found
              </CardContent>
            </Card>
          ) : (
            kioskStatus.map(kiosk => (
              <Card key={kiosk.id} className={kiosk.isActive ? '' : 'opacity-75'}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-sm">{kiosk.name}</h4>
                    <Badge className={kiosk.isActive ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}>
                      {kiosk.isActive ? 'Active' : 'Idle'}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="text-gray-600">
                      Last Activity: {kiosk.lastActivity 
                        ? format(new Date(kiosk.lastActivity), 'MMM d, HH:mm') 
                        : 'Never'}
                    </p>
                    {kiosk.inactiveMinutes !== null && (
                      <p className="text-gray-600">
                        Inactive: {kiosk.inactiveMinutes} min
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Kiosk Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : kioskOrders.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No orders found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold">Restaurant</th>
                    <th className="text-left p-3 font-semibold">Order ID</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                    <th className="text-left p-3 font-semibold">Total</th>
                    <th className="text-left p-3 font-semibold">Date</th>
                    <th className="text-left p-3 font-semibold">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {kioskOrders.map(order => (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{order.restaurant_name}</td>
                      <td className="p-3 font-mono text-xs">{order.id.slice(0, 8)}</td>
                      <td className="p-3">
                        <Badge className={
                          order.status === 'completed' || order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                          order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }>
                          {order.status}
                        </Badge>
                      </td>
                      <td className="p-3 font-semibold">£{(order.total || 0).toFixed(2)}</td>
                      <td className="p-3 text-xs">{format(new Date(order.created_date), 'MMM d, HH:mm')}</td>
                      <td className="p-3 text-xs">{(order.items || []).length} item(s)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}