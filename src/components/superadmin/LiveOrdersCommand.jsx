import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    Search, RefreshCw, Store, ShoppingBag, Clock, CheckCircle2,
    Truck, X, Eye, ChevronDown, ChevronUp, AlertCircle, Filter
} from 'lucide-react';
import { format } from 'date-fns';
import { formatUKTime } from '@/lib/ukDateUtils';

// ── Status config ──────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    pending:               { label: 'Pending',             color: 'bg-yellow-100 text-yellow-800 border-yellow-200',  dot: 'bg-yellow-400' },
    confirmed:             { label: 'Confirmed',           color: 'bg-blue-100 text-blue-800 border-blue-200',        dot: 'bg-blue-400' },
    preparing:             { label: 'Preparing',           color: 'bg-orange-100 text-orange-800 border-orange-200',  dot: 'bg-orange-400' },
    out_for_delivery:      { label: 'Out for Delivery',    color: 'bg-purple-100 text-purple-800 border-purple-200',  dot: 'bg-purple-400' },
    ready_for_collection:  { label: 'Ready to Collect',   color: 'bg-teal-100 text-teal-800 border-teal-200',        dot: 'bg-teal-400' },
    delivered:             { label: 'Delivered',           color: 'bg-green-100 text-green-800 border-green-200',     dot: 'bg-green-400' },
    collected:             { label: 'Collected',           color: 'bg-green-100 text-green-800 border-green-200',     dot: 'bg-green-400' },
    cancelled:             { label: 'Cancelled',           color: 'bg-red-100 text-red-800 border-red-200',           dot: 'bg-red-400' },
    refunded:              { label: 'Refunded',            color: 'bg-gray-100 text-gray-700 border-gray-200',        dot: 'bg-gray-400' },
};

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection'];

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

// ── Order type badge ───────────────────────────────────────────────────────
const TYPE_COLOR = {
    delivery: 'bg-blue-50 text-blue-700',
    collection: 'bg-purple-50 text-purple-700',
    takeaway: 'bg-purple-50 text-purple-700',
    dine_in: 'bg-green-50 text-green-700',
};

// ── Full order detail dialog ───────────────────────────────────────────────
function OrderDetailDialog({ order, restaurantName, open, onClose }) {
    if (!order) return null;
    const totalItems = (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <ShoppingBag className="h-5 w-5 text-orange-500" />
                        Order {order.order_number || `#${order.id?.slice(-6).toUpperCase()}`}
                        <StatusBadge status={order.status} />
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 pt-2">
                    {/* Meta */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-0.5">Restaurant</p>
                            <p className="font-semibold text-gray-800">{restaurantName || order.restaurant_name || '—'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-0.5">Order Type</p>
                            <p className="font-semibold text-gray-800 capitalize">{order.order_type?.replace(/_/g, ' ') || '—'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-0.5">Payment</p>
                            <p className="font-semibold text-gray-800 capitalize">{order.payment_method?.replace(/_/g, ' ') || '—'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-0.5">Placed At</p>
                            <p className="font-semibold text-gray-800">{order.created_date ? formatUKTime(order.created_date, 'datetime') : '—'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-0.5">Total Items</p>
                            <p className="font-semibold text-gray-800">{totalItems}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-0.5">Order Total</p>
                            <p className="font-bold text-orange-600 text-base">£{(order.total || 0).toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Customer */}
                    <div className="border rounded-lg p-4">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Customer</p>
                        <div className="space-y-1 text-sm">
                            {order.guest_name && <p><span className="text-gray-400">Name:</span> <span className="font-medium">{order.guest_name}</span></p>}
                            {order.customer_email && <p><span className="text-gray-400">Email:</span> <span className="font-medium">{order.customer_email}</span></p>}
                            {order.customer_phone && <p><span className="text-gray-400">Phone:</span> <span className="font-medium">{order.customer_phone}</span></p>}
                            {order.phone && <p><span className="text-gray-400">Phone:</span> <span className="font-medium">{order.phone}</span></p>}
                            {order.delivery_address && <p><span className="text-gray-400">Address:</span> <span className="font-medium">{order.delivery_address}</span></p>}
                        </div>
                    </div>

                    {/* Items */}
                    <div className="border rounded-lg overflow-hidden">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide p-3 bg-gray-50 border-b">Items</p>
                        <div className="divide-y">
                            {(order.items || []).map((item, i) => {
                                // Meal deal items stored in itemQuantities: { "Item Name": qty, ... }
                                const mealDealItems = item.itemQuantities && typeof item.itemQuantities === 'object'
                                    ? Object.entries(item.itemQuantities).filter(([, qty]) => qty > 0)
                                    : [];

                                // Regular customizations: { "Option Name": "value" | ["val1","val2"] }
                                const customEntries = item.customizations && typeof item.customizations === 'object'
                                    ? Object.entries(item.customizations).filter(([, v]) =>
                                        v !== null && v !== undefined && v !== '' &&
                                        !(Array.isArray(v) && v.length === 0)
                                      )
                                    : [];

                                return (
                                    <div key={i} className="p-3 text-sm">
                                        <div className="flex items-start justify-between">
                                            <p className="font-medium text-gray-800">
                                                {item.quantity > 1 && <span className="text-orange-600 font-bold mr-1">{item.quantity}×</span>}
                                                {item.name}
                                                {item.is_meal_deal && <span className="ml-1.5 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-semibold">Meal Deal</span>}
                                            </p>
                                            <p className="font-semibold text-gray-800 ml-3 flex-shrink-0">£{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</p>
                                        </div>

                                        {/* Meal deal chosen items */}
                                        {mealDealItems.length > 0 && (
                                            <div className="mt-1.5 ml-2 space-y-0.5">
                                                {mealDealItems.map(([name, qty]) => (
                                                    <p key={name} className="text-xs text-gray-500 flex items-center gap-1">
                                                        <span className="text-orange-400">›</span>
                                                        {qty > 1 && <span className="font-semibold">{qty}×</span>}
                                                        {name}
                                                    </p>
                                                ))}
                                            </div>
                                        )}

                                        {/* Regular customizations */}
                                        {customEntries.length > 0 && (
                                            <div className="mt-1 ml-2 space-y-0.5">
                                                {customEntries.map(([k, v]) => (
                                                    <p key={k} className="text-xs text-gray-400">
                                                        <span className="font-medium text-gray-500">{k}:</span>{' '}
                                                        {Array.isArray(v) ? v.join(', ') : String(v)}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="border rounded-lg p-4 space-y-2 text-sm">
                        <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>£{(order.subtotal || 0).toFixed(2)}</span></div>
                        {order.delivery_fee > 0 && <div className="flex justify-between text-gray-600"><span>Delivery fee</span><span>£{order.delivery_fee.toFixed(2)}</span></div>}
                        {order.discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-£{order.discount.toFixed(2)}</span></div>}
                        <div className="flex justify-between font-bold text-gray-900 text-base border-t pt-2"><span>Total</span><span>£{(order.total || 0).toFixed(2)}</span></div>
                    </div>

                    {/* Notes */}
                    {order.notes && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                            📝 <span className="font-medium">Note:</span> {order.notes}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Restaurant summary card ────────────────────────────────────────────────
function RestaurantSummaryCard({ restaurantName, orders, onSelectRestaurant, isSelected }) {
    const activeCount = orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length;
    const todayTotal = orders.reduce((s, o) => s + (o.total || 0), 0);

    const statusBreakdown = {};
    for (const o of orders) {
        statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
    }

    return (
        <button
            onClick={onSelectRestaurant}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                isSelected ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/30'
            }`}
        >
            <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-gray-900 text-sm truncate">{restaurantName}</p>
                {activeCount > 0 && (
                    <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                        {activeCount} active
                    </span>
                )}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{orders.length} orders today</span>
                <span className="font-semibold text-gray-700">£{todayTotal.toFixed(2)}</span>
            </div>
        </button>
    );
}

// ── Single order row ───────────────────────────────────────────────────────
function OrderRow({ order, restaurantName, onView }) {
    const age = order.created_date
        ? Math.floor((Date.now() - new Date(order.created_date)) / 60000)
        : null;

    const isUrgent = ACTIVE_STATUSES.includes(order.status) && age !== null && age > 45;

    return (
        <div className={`flex items-center gap-3 p-3 rounded-lg border text-sm transition-colors ${isUrgent ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}>
            {isUrgent && <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}

            <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
                <div>
                    <p className="font-bold text-gray-900">{order.order_number || `#${order.id?.slice(-6).toUpperCase()}`}</p>
                    <p className="text-xs text-gray-400">{order.created_date ? formatUKTime(order.created_date, 'time') : ''}</p>
                </div>
                <div className="hidden sm:block">
                    <p className="text-gray-600 truncate">{restaurantName || order.restaurant_name}</p>
                    <p className="text-xs text-gray-400 capitalize">{order.order_type?.replace(/_/g, ' ')}</p>
                </div>
                <div>
                    <StatusBadge status={order.status} />
                    {age !== null && (
                        <p className={`text-xs mt-0.5 ${age > 45 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{age}m ago</p>
                    )}
                </div>
                <div className="text-right">
                    <p className="font-bold text-gray-900">£{(order.total || 0).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">{(order.items || []).reduce((s, i) => s + (i.quantity || 1), 0)} items</p>
                </div>
            </div>

            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => onView(order)}>
                <Eye className="h-4 w-4 text-gray-400" />
            </Button>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function LiveOrdersCommand() {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all' | specific status
    const [restaurantFilter, setRestaurantFilter] = useState('');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Today's date range — midnight in UK timezone (handles BST/GMT automatically)
    const todayStart = useMemo(() => {
        const now = new Date();
        // Get YYYY-MM-DD in UK timezone
        const ukDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
        // Parse that date as a UTC instant representing London midnight
        // by finding what UTC time corresponds to 00:00:00 in London on that date
        const localMidnight = new Date(`${ukDate}T00:00:00Z`); // naive UTC midnight
        // Adjust: find the UTC time when London shows 00:00:00
        const londonAtMidnight = new Date(localMidnight.toLocaleString('en-US', { timeZone: 'Europe/London' }));
        const diff = localMidnight - londonAtMidnight; // offset in ms
        return new Date(localMidnight.getTime() + diff);
    }, []);

    const { data: orders = [], isLoading, dataUpdatedAt, refetch } = useQuery({
        queryKey: ['superadmin-live-orders'],
        queryFn: () => base44.entities.Order.list('-created_date', 500),
        refetchInterval: autoRefresh ? 15000 : false,
        staleTime: 10000,
    });

    const { data: restaurants = [] } = useQuery({
        queryKey: ['superadmin-restaurants-cmd'],
        queryFn: () => base44.entities.Restaurant.list('name', 200),
        staleTime: 60000,
    });

    const restaurantMap = useMemo(() => {
        const m = {};
        for (const r of restaurants) m[r.id] = r;
        return m;
    }, [restaurants]);

    // Filter to today
    const todayOrders = useMemo(() => {
        return orders.filter(o => o.created_date && new Date(o.created_date) >= todayStart);
    }, [orders, todayStart]);

    // Per-restaurant summary
    const restaurantSummaries = useMemo(() => {
        const map = {};
        for (const o of todayOrders) {
            const rId = o.restaurant_id;
            if (!map[rId]) map[rId] = { name: restaurantMap[rId]?.name || o.restaurant_name || rId, orders: [] };
            map[rId].orders.push(o);
        }
        return Object.entries(map)
            .map(([id, d]) => ({ id, ...d }))
            .sort((a, b) => b.orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length - a.orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length);
    }, [todayOrders, restaurantMap]);

    // Global stats
    const stats = useMemo(() => {
        const active = todayOrders.filter(o => ACTIVE_STATUSES.includes(o.status));
        const completed = todayOrders.filter(o => ['delivered', 'collected'].includes(o.status));
        const cancelled = todayOrders.filter(o => o.status === 'cancelled');
        const revenue = completed.reduce((s, o) => s + (o.total || 0), 0);
        return { total: todayOrders.length, active: active.length, completed: completed.length, cancelled: cancelled.length, revenue };
    }, [todayOrders]);

    // Filtered orders for main list
    const filteredOrders = useMemo(() => {
        return todayOrders.filter(o => {
            const matchStatus = statusFilter === 'all' ? true
                : statusFilter === 'active' ? ACTIVE_STATUSES.includes(o.status)
                : o.status === statusFilter;
            const matchRestaurant = !restaurantFilter || o.restaurant_id === restaurantFilter;
            const q = search.toLowerCase().trim();
            const matchSearch = !q
                || o.order_number?.toLowerCase().includes(q)
                || o.id?.toLowerCase().includes(q)
                || o.customer_email?.toLowerCase().includes(q)
                || o.customer_phone?.includes(q)
                || o.guest_name?.toLowerCase().includes(q)
                || (restaurantMap[o.restaurant_id]?.name || o.restaurant_name || '').toLowerCase().includes(q);
            return matchStatus && matchRestaurant && matchSearch;
        }).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    }, [todayOrders, statusFilter, restaurantFilter, search, restaurantMap]);

    const selectedRestaurantName = restaurantFilter ? (restaurantMap[restaurantFilter]?.name || restaurantFilter) : null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Live Orders Command Centre</h2>
                    <p className="text-sm text-gray-500">
                        Today's orders across all restaurants ·{' '}
                        {dataUpdatedAt ? `Last updated ${format(new Date(dataUpdatedAt), 'HH:mm:ss')}` : 'Loading...'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline" size="sm"
                        onClick={() => setAutoRefresh(r => !r)}
                        className={autoRefresh ? 'border-green-400 text-green-700' : ''}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${autoRefresh ? 'animate-spin' : ''}`} />
                        {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                    { label: "Today's Orders", value: stats.total, color: 'text-gray-900', bg: 'bg-gray-50' },
                    { label: 'Active Now', value: stats.active, color: 'text-orange-600', bg: 'bg-orange-50' },
                    { label: 'Completed', value: stats.completed, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'Cancelled', value: stats.cancelled, color: 'text-red-600', bg: 'bg-red-50' },
                    { label: "Today's Revenue", value: `£${stats.revenue.toFixed(2)}`, color: 'text-blue-600', bg: 'bg-blue-50' },
                ].map(s => (
                    <Card key={s.label} className={`${s.bg} border-0`}>
                        <CardContent className="p-4 text-center">
                            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Restaurant sidebar */}
                <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide px-1">Restaurants ({restaurantSummaries.length})</p>
                    <button
                        onClick={() => setRestaurantFilter('')}
                        className={`w-full text-left p-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                            !restaurantFilter ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-600 hover:border-orange-200'
                        }`}
                    >
                        All Restaurants
                    </button>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                        {restaurantSummaries.map(r => (
                            <RestaurantSummaryCard
                                key={r.id}
                                restaurantName={r.name}
                                orders={r.orders}
                                isSelected={restaurantFilter === r.id}
                                onSelectRestaurant={() => setRestaurantFilter(prev => prev === r.id ? '' : r.id)}
                            />
                        ))}
                        {restaurantSummaries.length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-4">No orders today</p>
                        )}
                    </div>
                </div>

                {/* Main orders panel */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Filters */}
                    <div className="flex gap-2 flex-wrap">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search order, customer, phone..."
                                className="pl-9 h-9 text-sm"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <X className="h-3.5 w-3.5 text-gray-400" />
                                </button>
                            )}
                        </div>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="h-9 px-3 rounded-md border border-input bg-white text-sm"
                        >
                            <option value="active">Active Orders</option>
                            <option value="all">All Today</option>
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Orders header */}
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-700">
                            {filteredOrders.length} orders
                            {selectedRestaurantName && <span className="text-orange-600"> · {selectedRestaurantName}</span>}
                            {statusFilter === 'active' && <span className="text-orange-500"> (active only)</span>}
                        </p>
                        {restaurantFilter && (
                            <Button variant="ghost" size="sm" onClick={() => setRestaurantFilter('')} className="text-xs h-7 gap-1">
                                <X className="h-3 w-3" />Clear filter
                            </Button>
                        )}
                    </div>

                    {/* Order list */}
                    {isLoading ? (
                        <div className="text-center py-16 text-gray-400">
                            <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin opacity-40" />
                            <p className="text-sm">Loading orders...</p>
                        </div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No orders match your filters.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredOrders.map(order => (
                                <OrderRow
                                    key={order.id}
                                    order={order}
                                    restaurantName={restaurantMap[order.restaurant_id]?.name || order.restaurant_name}
                                    onView={setSelectedOrder}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Order detail dialog */}
            <OrderDetailDialog
                order={selectedOrder}
                restaurantName={selectedOrder ? (restaurantMap[selectedOrder.restaurant_id]?.name || selectedOrder.restaurant_name) : ''}
                open={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
            />
        </div>
    );
}