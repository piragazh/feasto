import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
    ShoppingBag, UtensilsCrossed, Printer,
    CheckCircle, XCircle, Clock, Phone, MapPin,
    LogOut, Menu, X, ChevronRight, Search, Bluetooth, AlertCircle,
    MessageSquare, Send, Wifi, WifiOff, Zap, Download
} from 'lucide-react';
import { format } from 'date-fns';
import { printerService } from '@/components/restaurant/PrinterService';

import RejectOrderDialog from '@/components/restaurant/RejectOrderDialog';
import OrderSummary from '@/components/tablet/OrderSummary';

// ─── Login Screen ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await base44.auth.login(email, password);
            const user = await base44.auth.me();
            onLogin(user);
        } catch {
            setError('Invalid email or password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-10">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <UtensilsCrossed className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Restaurant Dashboard</h1>
                    <p className="text-gray-500 mt-1 text-sm">Sign in to manage your restaurant</p>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <Input
                            type="email"
                            placeholder="you@restaurant.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="h-12 text-base"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <Input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="h-12 text-base"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white text-base font-semibold mt-2"
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Signing in...
                            </span>
                        ) : 'Sign In'}
                    </Button>
                </form>
            </div>
        </div>
    );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
    { id: 'orders', label: 'Live Orders', icon: ShoppingBag },
    { id: 'history', label: 'Order History', icon: Clock },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'menu', label: 'Menu Items', icon: UtensilsCrossed },
    { id: 'printer', label: 'Printer Settings', icon: Printer },
];

function Sidebar({ restaurant, activeTab, onTabChange, onLogout, mobileOpen, onMobileClose }) {
    return (
        <>
            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-30 md:hidden"
                    onClick={onMobileClose}
                />
            )}
            <aside className={`
                fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 z-40 flex flex-col
                transition-transform duration-300
                ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
                md:translate-x-0 md:static md:z-auto
            `}>
                {/* Restaurant Info */}
                <div className="p-5 border-b border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        {restaurant?.logo_url ? (
                            <img src={restaurant.logo_url} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-orange-200" />
                        ) : (
                            <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center">
                                <UtensilsCrossed className="h-6 w-6 text-white" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="font-bold text-gray-900 truncate">{restaurant?.name || 'Restaurant'}</p>
                            <Badge className={`mt-1 text-xs ${restaurant?.is_open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {restaurant?.is_open ? 'Open' : 'Closed'}
                            </Badge>
                        </div>
                    </div>
                    {restaurant && <StatusBar restaurant={restaurant} />}
                </div>

                {/* Nav */}
                <nav className="flex-1 py-4">
                    {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => { onTabChange(id); onMobileClose?.(); }}
                            className={`
                                w-full flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors text-left
                                ${activeTab === id
                                    ? 'bg-orange-50 text-orange-600 border-r-4 border-orange-500'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                            `}
                        >
                            <Icon className="h-5 w-5 shrink-0" />
                            {label}
                        </button>
                    ))}
                </nav>

                {/* Logout */}
                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </button>
                </div>
            </aside>
        </>
    );
}

// ─── Live Orders Section ──────────────────────────────────────────────────────
function LiveOrdersSection({ restaurantId }) {
    const [rejectingOrder, setRejectingOrder] = useState(null);
    const queryClient = useQueryClient();

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['tablet-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({
            restaurant_id: restaurantId,
            status: { $in: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection'] }
        }, '-created_date'),
        refetchInterval: 10000,
    });

    const updateMutation = useMutation({
        mutationFn: async ({ orderId, status, rejection_reason }) => {
            const order = orders.find(o => o.id === orderId);
            const statusHistory = [...(order?.status_history || []), {
                status, timestamp: new Date().toISOString(), note: rejection_reason || ''
            }];
            await base44.entities.Order.update(orderId, { status, status_history: statusHistory, rejection_reason });
            // SMS notification
            try {
                await base44.functions.invoke('sendSMS', {
                    to: order?.phone,
                    message: `Your order #${orderId.slice(-6)} is now: ${status.replace(/_/g, ' ')}.`
                });
            } catch {}
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tablet-orders', restaurantId] }),
    });

    const printOrder = async (order) => {
        const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
        const restaurant = restaurants?.[0];
        const config = restaurant?.printer_config || {};

        // Use Bluetooth printer if configured
        if (config.bluetooth_printer?.id) {
            try {
                await printerService.printReceipt(order, restaurant, config);
                toast.success('Receipt printed');
            } catch (e) {
                toast.error('Print failed: ' + e.message);
            }
            return;
        }

        // Fallback: browser print popup
        const printerWidth = config.printer_width === '58mm' ? '400px' : '560px';
        const printWindow = window.open('', '', 'width=300,height=600');
        if (!printWindow) { toast.error('Popup blocked. Allow popups to print.'); return; }
        const orderLabel = order.order_type === 'collection' && order.order_number
            ? order.order_number : `#${order.id.slice(-6)}`;
        printWindow.document.write(`<html><head><title>Order ${orderLabel}</title><style>
            body{font-family:monospace;width:${printerWidth};margin:10px;font-size:30px;}
            h2{text-align:center;} .sep{border-top:2px dashed #000;margin:8px 0;} .total{font-weight:bold;}
        </style></head><body>
        <h2>${restaurant?.name || 'ORDER'}</h2>
        <div class="sep"></div>
        <p><strong>Order:</strong> ${orderLabel}</p>
        <p><strong>Type:</strong> ${order.order_type?.toUpperCase()}</p>
        <p><strong>Time:</strong> ${format(new Date(order.created_date), 'HH:mm')}</p>
        <div class="sep"></div>
        ${order.items.map(i => `<p>${i.quantity}x ${i.name} — £${((i.price || 0) * i.quantity).toFixed(2)}</p>`).join('')}
        <div class="sep"></div>
        <p class="total">TOTAL: £${(order.total || 0).toFixed(2)}</p>
        </body></html>`);
        printWindow.document.close();
        printWindow.print();
    };

    const statusColors = {
        pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        confirmed: 'bg-blue-100 text-blue-800 border-blue-300',
        preparing: 'bg-purple-100 text-purple-800 border-purple-300',
        out_for_delivery: 'bg-orange-100 text-orange-800 border-orange-300',
        ready_for_collection: 'bg-green-100 text-green-800 border-green-300',
    };

    if (isLoading) return (
        <div className="flex items-center justify-center h-64">
            <div className="text-center text-gray-400">
                <Clock className="h-10 w-10 mx-auto mb-3 animate-spin opacity-50" />
                <p>Loading orders...</p>
            </div>
        </div>
    );

    if (orders.length === 0) return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <ShoppingBag className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">No active orders</p>
            <p className="text-sm">New orders will appear here automatically</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {orders.map(order => (
                <Card key={order.id} className={`${order.status === 'pending' ? 'border-2 border-red-400 shadow-md' : 'border border-gray-200'}`}>
                    <CardContent className="p-5">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xl font-bold text-gray-900">
                                        {order.order_type === 'collection' && order.order_number ? order.order_number : `#${order.id.slice(-6)}`}
                                    </span>
                                    <Badge className={`text-xs capitalize border ${statusColors[order.status] || 'bg-gray-100 text-gray-700'}`}>
                                        {order.status.replace(/_/g, ' ')}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                        {order.order_type === 'collection' ? '🏪 Collection' : '🚚 Delivery'}
                                    </Badge>
                                </div>
                                <p className="text-sm text-gray-500 mt-1">{format(new Date(order.created_date), 'h:mm a, MMM d')}</p>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">£{(order.total || 0).toFixed(2)}</p>
                        </div>

                        {/* AI Summary */}
                         <div className="mb-3">
                             <OrderSummary order={order} />
                         </div>

                         {/* Items */}
                         <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1">
                             {order.items.map((item, i) => (
                                 <div key={i} className="flex justify-between text-sm">
                                     <span className="font-medium">{item.quantity}x {item.name}</span>
                                     <span className="text-gray-600">£{((item.price || 0) * item.quantity).toFixed(2)}</span>
                                 </div>
                             ))}
                         </div>

                        {/* Details */}
                        <div className="space-y-1 mb-4 text-sm text-gray-600">
                            {order.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                    <span>{order.phone}</span>
                                </div>
                            )}
                            {order.order_type === 'delivery' && order.delivery_address && (
                                <div className="flex items-start gap-2">
                                    <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                                    <span>{typeof order.delivery_address === 'string' ? order.delivery_address : 'See address'}</span>
                                </div>
                            )}
                            {order.notes && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mt-2">
                                    <span className="font-semibold text-yellow-800 text-xs">Note: </span>
                                    <span className="text-yellow-700 text-xs">{order.notes}</span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 flex-wrap">
                            {order.status === 'pending' && (
                                <>
                                    <Button
                                        onClick={() => { updateMutation.mutate({ orderId: order.id, status: 'confirmed' }); printOrder(order); toast.success('Order accepted!'); }}
                                        className="flex-1 bg-green-600 hover:bg-green-700 h-10"
                                    >
                                        <CheckCircle className="h-4 w-4 mr-1" /> Accept
                                    </Button>
                                    <Button
                                        onClick={() => setRejectingOrder(order)}
                                        variant="destructive"
                                        className="flex-1 h-10"
                                    >
                                        <XCircle className="h-4 w-4 mr-1" /> Reject
                                    </Button>
                                </>
                            )}
                            {order.status === 'confirmed' && (
                                <Button onClick={() => { updateMutation.mutate({ orderId: order.id, status: 'preparing' }); toast.success('Preparing...'); }} className="flex-1 bg-purple-600 hover:bg-purple-700 h-10">
                                    Start Preparing
                                </Button>
                            )}
                            {order.status === 'preparing' && order.order_type !== 'collection' && (
                                <Button onClick={() => { updateMutation.mutate({ orderId: order.id, status: 'out_for_delivery' }); toast.success('Dispatched!'); }} className="flex-1 bg-orange-500 hover:bg-orange-600 h-10">
                                    Mark Dispatched
                                </Button>
                            )}
                            {order.status === 'preparing' && order.order_type === 'collection' && (
                                <Button onClick={() => { updateMutation.mutate({ orderId: order.id, status: 'ready_for_collection' }); toast.success('Ready for collection!'); }} className="flex-1 bg-green-600 hover:bg-green-700 h-10">
                                    Ready for Collection
                                </Button>
                            )}
                            {order.status === 'out_for_delivery' && (
                                <Button onClick={() => { updateMutation.mutate({ orderId: order.id, status: 'delivered' }); toast.success('Delivered!'); }} className="flex-1 bg-green-600 hover:bg-green-700 h-10">
                                    Mark Delivered
                                </Button>
                            )}
                            {order.status === 'ready_for_collection' && (
                                <Button onClick={() => { updateMutation.mutate({ orderId: order.id, status: 'collected' }); toast.success('Collected!'); }} className="flex-1 bg-green-600 hover:bg-green-700 h-10">
                                    Mark Collected
                                </Button>
                            )}
                            <Button variant="outline" onClick={() => printOrder(order)} size="icon" className="h-10 w-10 shrink-0">
                                <Printer className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ))}

            <RejectOrderDialog
                open={!!rejectingOrder}
                onClose={() => setRejectingOrder(null)}
                onReject={(reason) => {
                    updateMutation.mutate({ orderId: rejectingOrder.id, status: 'cancelled', rejection_reason: reason });
                    setRejectingOrder(null);
                    toast.success('Order rejected');
                }}
                orderNumber={rejectingOrder?.id.slice(-6)}
            />
        </div>
    );
}

// ─── Menu Section ─────────────────────────────────────────────────────────────
function MenuSection({ restaurantId }) {
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState('all');
    const queryClient = useQueryClient();

    const { data: items = [], isLoading } = useQuery({
        queryKey: ['tablet-menu', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, is_available }) => base44.entities.MenuItem.update(id, { is_available }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tablet-menu', restaurantId] }),
        onError: () => toast.error('Failed to update item'),
    });

    const categories = ['all', ...new Set(items.map(i => i.category).filter(Boolean))];

    const filtered = items.filter(item => {
        const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
        const matchCat = catFilter === 'all' || item.category === catFilter;
        return matchSearch && matchCat;
    });

    if (isLoading) return (
        <div className="flex items-center justify-center h-64 text-gray-400">
            <p>Loading menu...</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search items..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10 h-10"
                    />
                </div>
                <select
                    value={catFilter}
                    onChange={e => setCatFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-700 min-w-[130px]"
                >
                    {categories.map(c => (
                        <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
                    ))}
                </select>
            </div>

            {/* Stats */}
            <div className="flex gap-4 text-sm">
                <span className="text-gray-500">{filtered.length} items</span>
                <span className="text-green-600 font-medium">{filtered.filter(i => i.is_available).length} available</span>
                <span className="text-red-500 font-medium">{filtered.filter(i => !i.is_available).length} unavailable</span>
            </div>

            {/* Items list */}
            <div className="space-y-2">
                {filtered.map(item => (
                    <div
                        key={item.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${item.is_available ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-70'}`}
                    >
                        {item.image_url && (
                            <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-gray-900 ${!item.is_available ? 'line-through text-gray-400' : ''}`}>{item.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-xs">{item.category}</Badge>
                                <span className="text-orange-600 font-bold text-sm">£{item.price?.toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-medium ${item.is_available ? 'text-green-600' : 'text-red-500'}`}>
                                {item.is_available ? 'Available' : 'Unavailable'}
                            </span>
                            <Switch
                                checked={!!item.is_available}
                                onCheckedChange={(checked) => toggleMutation.mutate({ id: item.id, is_available: checked })}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    <UtensilsCrossed className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No items found</p>
                </div>
            )}
        </div>
    );
}

// ─── Messages Section ────────────────────────────────────────────────────────
function MessagesSection({ restaurantId }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [replyingTo, setReplyingTo] = useState(null);
    const [replyText, setReplyText] = useState('');
    const queryClient = useQueryClient();

    const { data: messages = [], isLoading } = useQuery({
        queryKey: ['tablet-messages', restaurantId],
        queryFn: () => base44.entities.Message.filter({ restaurant_id: restaurantId }, '-created_date'),
        refetchInterval: 15000,
    });

    const markReadMutation = useMutation({
        mutationFn: ({ id }) => base44.entities.Message.update(id, { is_read: true }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tablet-messages', restaurantId] }),
    });

    const replyMutation = useMutation({
        mutationFn: async ({ orderId, messageText }) => {
            await base44.entities.Message.create({
                order_id: orderId,
                restaurant_id: restaurantId,
                sender_type: 'restaurant',
                message: messageText,
                is_read: false,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tablet-messages', restaurantId] });
            setReplyingTo(null);
            setReplyText('');
            toast.success('Message sent');
        },
    });

    const filteredMessages = messages.filter(msg =>
        msg.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.order_id?.includes(searchTerm)
    );

    const unreadCount = messages.filter(m => !m.is_read).length;

    if (isLoading) return (
        <div className="flex items-center justify-center h-64 text-gray-400">
            <p>Loading messages...</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Search & Unread Count */}
            <div className="flex gap-3 items-center">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search messages or order ID..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10 h-10"
                    />
                </div>
                {unreadCount > 0 && (
                    <Badge className="bg-red-500 text-white">{unreadCount} new</Badge>
                )}
            </div>

            {/* Messages list */}
            <div className="space-y-2">
                {filteredMessages.map(msg => (
                    <Card key={msg.id} className={`border ${msg.is_read ? 'border-gray-200 bg-gray-50' : 'border-orange-300 bg-orange-50'}`}>
                        <CardContent className="p-4">
                            {/* Header */}
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-gray-900">{msg.sender_type === 'customer' ? 'Customer' : 'Restaurant'}</span>
                                    <Badge variant="outline" className="text-xs">Order #{msg.order_id?.slice(-6)}</Badge>
                                    {!msg.is_read && <div className="w-2 h-2 bg-orange-500 rounded-full" />}
                                </div>
                                <span className="text-xs text-gray-500">{format(new Date(msg.created_date), 'HH:mm')}</span>
                            </div>

                            {/* Message text */}
                            <p className="text-sm text-gray-700 mb-3">{msg.message}</p>

                            {/* Actions */}
                            <div className="flex gap-2 flex-wrap">
                                {!msg.is_read && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs"
                                        onClick={() => markReadMutation.mutate({ id: msg.id })}
                                    >
                                        Mark as read
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs"
                                    onClick={() => {
                                        setReplyingTo(replyingTo === msg.id ? null : msg.id);
                                        if (replyingTo === msg.id) setReplyText('');
                                    }}
                                >
                                    {replyingTo === msg.id ? 'Cancel' : 'Reply'}
                                </Button>
                            </div>

                            {/* Reply form */}
                            {replyingTo === msg.id && (
                                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Type your reply..."
                                            value={replyText}
                                            onChange={e => setReplyText(e.target.value)}
                                            className="h-9 text-sm"
                                        />
                                        <Button
                                            size="icon"
                                            onClick={() => replyMutation.mutate({ orderId: msg.order_id, messageText: replyText })}
                                            disabled={!replyText.trim()}
                                            className="h-9 w-9 shrink-0"
                                        >
                                            <Send className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="space-y-1.5">
                                        <p className="text-xs font-semibold text-gray-600">Quick replies:</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {['Your order is being prepared!', 'Your order is on the way!', 'We received your order. Thanks!', 'Thank you for contacting us!', 'Your order is ready for pickup!'].map((template, i) => (
                                                <Button
                                                    key={i}
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-xs h-7 px-2"
                                                    onClick={() => { setReplyText(template); replyMutation.mutate({ orderId: msg.order_id, messageText: template }); }}
                                                >
                                                    {template}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {filteredMessages.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>{searchTerm ? 'No messages found' : 'No messages'}</p>
                </div>
            )}
        </div>
    );
}

// ─── Order History Section ───────────────────────────────────────────────────
function OrderHistorySection({ restaurantId }) {
    const [dateFilter, setDateFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [expandedOrder, setExpandedOrder] = useState(null);

    const printOrder = async (order) => {
        const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
        const restaurant = restaurants?.[0];
        const config = restaurant?.printer_config || {};

        // Use Bluetooth printer if configured
        if (config.bluetooth_printer?.id) {
            try {
                await printerService.printReceipt(order, restaurant, config);
                toast.success('Receipt printed');
            } catch (e) {
                toast.error('Print failed: ' + e.message);
            }
            return;
        }

        // Fallback: browser print popup
        const printerWidth = config.printer_width === '58mm' ? '400px' : '560px';
        const printWindow = window.open('', '', 'width=300,height=600');
        if (!printWindow) { toast.error('Popup blocked. Allow popups to print.'); return; }
        const orderLabel = order.order_type === 'collection' && order.order_number
            ? order.order_number : `#${order.id.slice(-6)}`;
        printWindow.document.write(`<html><head><title>Order ${orderLabel}</title><style>
            body{font-family:monospace;width:${printerWidth};margin:10px;font-size:30px;}
            h2{text-align:center;} .sep{border-top:2px dashed #000;margin:8px 0;} .total{font-weight:bold;}
        </style></head><body>
        <h2>${restaurant?.name || 'ORDER'}</h2>
        <div class="sep"></div>
        <p><strong>Order:</strong> ${orderLabel}</p>
        <p><strong>Type:</strong> ${order.order_type?.toUpperCase()}</p>
        <p><strong>Time:</strong> ${format(new Date(order.created_date), 'HH:mm')}</p>
        <div class="sep"></div>
        ${order.items.map(i => `<p>${i.quantity}x ${i.name} — £${((i.price || 0) * i.quantity).toFixed(2)}</p>`).join('')}
        <div class="sep"></div>
        <p class="total">TOTAL: £${(order.total || 0).toFixed(2)}</p>
        </body></html>`);
        printWindow.document.close();
        printWindow.print();
    };

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['tablet-history', restaurantId],
        queryFn: () => base44.entities.Order.filter({
            restaurant_id: restaurantId,
            status: { $in: ['delivered', 'collected', 'cancelled', 'refunded', 'completed'] }
        }, '-created_date'),
        refetchInterval: 30000,
    });

    const getStatusColor = (status) => {
        const colors = {
            delivered: 'bg-green-100 text-green-800 border-green-300',
            collected: 'bg-green-100 text-green-800 border-green-300',
            completed: 'bg-blue-100 text-blue-800 border-blue-300',
            cancelled: 'bg-red-100 text-red-800 border-red-300',
            refunded: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        };
        return colors[status] || 'bg-gray-100 text-gray-700';
    };

    const getStatusLabel = (status) => {
        const labels = {
            delivered: '✓ Delivered',
            collected: '✓ Collected',
            completed: '✓ Completed',
            cancelled: '✗ Cancelled',
            refunded: '↺ Refunded',
        };
        return labels[status] || status;
    };

    const filterOrders = () => {
        return orders.filter(order => {
            const statusMatch = statusFilter === 'all' || order.status === statusFilter;
            if (dateFilter === 'all') return statusMatch;
            
            const orderDate = new Date(order.created_date);
            const now = new Date();
            const daysAgo = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));

            if (dateFilter === 'today') return statusMatch && daysAgo === 0;
            if (dateFilter === 'week') return statusMatch && daysAgo <= 7;
            if (dateFilter === 'month') return statusMatch && daysAgo <= 30;
            return statusMatch;
        });
    };

    const filteredOrders = filterOrders();

    if (isLoading) return (
        <div className="flex items-center justify-center h-64 text-gray-400">
            <p>Loading order history...</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <select
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-700"
                >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                </select>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-700"
                >
                    <option value="all">All Status</option>
                    <option value="delivered">Delivered</option>
                    <option value="collected">Collected</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="refunded">Refunded</option>
                </select>
            </div>

            {/* Stats */}
            <div className="flex gap-4 text-sm">
                <span className="text-gray-500">{filteredOrders.length} orders</span>
                <span className="text-green-600 font-medium">{filteredOrders.filter(o => ['delivered', 'collected', 'completed'].includes(o.status)).length} completed</span>
                <span className="text-red-500 font-medium">{filteredOrders.filter(o => o.status === 'cancelled').length} cancelled</span>
            </div>

            {/* Orders list */}
            <div className="space-y-2">
                {filteredOrders.map(order => (
                    <Card key={order.id} className="border border-gray-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setExpandedOrder(expandedOrder?.id === order.id ? null : order)}>
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-900">{order.order_type === 'collection' && order.order_number ? order.order_number : `#${order.id.slice(-6)}`}</span>
                                    <Badge className={`text-xs capitalize border ${getStatusColor(order.status)}`}>
                                        {getStatusLabel(order.status)}
                                    </Badge>
                                </div>
                                <span className="text-lg font-bold text-gray-900">£{(order.total || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{format(new Date(order.created_date), 'd MMM, HH:mm')}</span>
                                <span className="text-gray-600 font-medium">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
                            </div>
                            
                            {/* Expanded details */}
                             {expandedOrder?.id === order.id && (
                                 <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                                     {/* AI Summary */}
                                     <OrderSummary order={order} />

                                     {/* Items */}
                                     <div>
                                         <p className="text-xs font-semibold text-gray-600 mb-2">Items:</p>
                                        <div className="bg-gray-50 rounded p-2 space-y-1">
                                            {order.items.map((item, i) => (
                                                <div key={i} className="flex justify-between text-xs">
                                                    <span className="font-medium">{item.quantity}x {item.name}</span>
                                                    <span className="text-gray-600">£{((item.price || 0) * item.quantity).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Details */}
                                    <div className="space-y-1 text-xs text-gray-600">
                                        {order.phone && <div><span className="font-medium">Phone:</span> {order.phone}</div>}
                                        {order.order_type === 'delivery' && order.delivery_address && <div><span className="font-medium">Address:</span> {typeof order.delivery_address === 'string' ? order.delivery_address : 'See address'}</div>}
                                        {order.notes && <div className="bg-yellow-50 p-2 rounded"><span className="font-medium">Note:</span> {order.notes}</div>}
                                    </div>

                                    {/* Actions */}
                                    <Button 
                                        onClick={(e) => { e.stopPropagation(); printOrder(order); toast.success('Printing...'); }} 
                                        variant="outline" 
                                        size="sm"
                                        className="w-full text-xs"
                                    >
                                        <Printer className="h-3 w-3 mr-1" /> Reprint Receipt
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {filteredOrders.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No orders found</p>
                </div>
            )}
        </div>
    );
}

// ─── Printer Settings Section ─────────────────────────────────────────────────
function PrinterSettingsSection({ restaurant, onRestaurantUpdate }) {
    const [isConnecting, setIsConnecting] = useState(false);
    const [connStatus, setConnStatus] = useState('disconnected');
    const [autoReconnect, setAutoReconnect] = useState(true);
    const [connectionStats, setConnectionStats] = useState(null);
    const queryClient = useQueryClient();

    const printer = restaurant?.printer_config?.bluetooth_printer;

    useEffect(() => {
        // Setup connection status callback
        printerService.setConnectionStatusCallback((isConnected) => {
            setConnStatus(isConnected ? 'connected' : 'disconnected');
        });

        // Try auto-connect on mount
        if (printer?.id) {
            const attemptAutoConnect = async () => {
                if (!printerService.isConnected()) {
                    await printerService.tryAutoConnect();
                }
            };
            attemptAutoConnect();
        }

        // Monitor connection status
        const statusInterval = setInterval(() => {
            const status = printerService.getConnectionStatus();
            setConnStatus(status.connected ? 'connected' : 'disconnected');
            setConnectionStats(status);
        }, 5000);

        return () => clearInterval(statusInterval);
    }, [printer?.id]);

    useEffect(() => {
        printerService.enableAutoReconnect(autoReconnect);
    }, [autoReconnect]);

    const saveConfig = async (updates) => {
        const newConfig = { ...(restaurant?.printer_config || {}), ...updates };
        await base44.entities.Restaurant.update(restaurant.id, { printer_config: newConfig });
        queryClient.invalidateQueries({ queryKey: ['tablet-restaurant'] });
        toast.success('Printer settings saved');
    };

    const connectPrinter = async () => {
        if (!navigator.bluetooth) { toast.error('Bluetooth not supported. Use Chrome or Edge.'); return; }
        setIsConnecting(true);
        try {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                    '0000ffe0-0000-1000-8000-00805f9b34fb',
                ]
            });
            await saveConfig({ bluetooth_printer: { id: device.id, name: device.name, connectedAt: new Date().toISOString() } });
            setConnStatus('connected');
            toast.success(`Printer "${device.name}" paired!`);
        } catch (err) {
            toast.error('Could not connect: ' + err.message);
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnectPrinter = async () => {
        printerService.disconnect();
        const newConfig = { ...(restaurant?.printer_config || {}) };
        delete newConfig.bluetooth_printer;
        await base44.entities.Restaurant.update(restaurant.id, { printer_config: newConfig });
        queryClient.invalidateQueries({ queryKey: ['tablet-restaurant'] });
        setConnStatus('disconnected');
        toast.success('Printer disconnected');
    };

    const config = restaurant?.printer_config || {};

    return (
        <div className="space-y-6 max-w-xl">
            {/* Bluetooth Printer */}
            <Card>
                <CardContent className="p-6">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Bluetooth className="h-5 w-5 text-blue-500" />
                        Bluetooth Printer
                    </h3>
                    {printer ? (
                        <div className={`rounded-xl p-4 flex items-center justify-between mb-4 ${connStatus === 'connected' ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                            <div className="flex items-center gap-3 flex-1">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${connStatus === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`}>
                                    <Printer className="h-5 w-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900">{printer.name || 'Printer'}</p>
                                    <div className="flex items-center gap-2 flex-wrap text-xs">
                                        <span className={`${connStatus === 'connected' ? 'text-green-600' : 'text-yellow-600'}`}>
                                            {connStatus === 'connected' ? '● Connected' : '○ Disconnected'}
                                        </span>
                                        {connectionStats?.reconnecting && <span className="text-blue-600">🔄 Reconnecting...</span>}
                                        {connectionStats?.reconnectAttempts > 0 && (
                                            <span className="text-gray-500">Attempt {connectionStats.reconnectAttempts}/5</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={disconnectPrinter}>
                                Remove
                            </Button>
                        </div>
                    ) : (
                        <Button onClick={connectPrinter} disabled={isConnecting} className="w-full bg-blue-600 hover:bg-blue-700 mb-4">
                            {isConnecting ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" /> Scanning...</> : <><Bluetooth className="h-4 w-4 mr-2" />Scan & Connect Printer</>}
                        </Button>
                    )}
                    <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                        <p>Turn on your Bluetooth printer, put it in pairing mode, then tap "Scan & Connect Printer".</p>
                        <p>Once connected, the printer will auto-reconnect if the connection drops.</p>
                    </div>
                </CardContent>
            </Card>

            {/* Auto Reconnect Setting */}
            {printer && (
                <Card>
                    <CardContent className="p-6 space-y-4">
                        <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <Wifi className="h-5 w-5 text-gray-500" />
                            Connection Stability
                        </h3>
                        <div className="flex items-center justify-between py-2 border-b border-gray-100">
                            <div className="flex-1">
                                <span className="text-sm font-medium text-gray-700">Auto-Reconnect</span>
                                <p className="text-xs text-gray-500 mt-1">Automatically reconnect if connection drops</p>
                            </div>
                            <Switch
                                checked={autoReconnect}
                                onCheckedChange={setAutoReconnect}
                            />
                        </div>
                        {connectionStats && (
                            <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-xs text-gray-600">
                                <div className="flex justify-between">
                                    <span>Status:</span>
                                    <span className={connStatus === 'connected' ? 'text-green-600 font-medium' : 'text-yellow-600 font-medium'}>
                                        {connStatus === 'connected' ? 'Connected' : 'Disconnected'}
                                    </span>
                                </div>
                                {connectionStats.lastConnectionTime && (
                                    <div className="flex justify-between">
                                        <span>Last Connection:</span>
                                        <span>{format(new Date(connectionStats.lastConnectionTime), 'HH:mm:ss')}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Print Settings */}
            <Card>
                <CardContent className="p-6 space-y-4">
                    <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <Printer className="h-5 w-5 text-gray-500" />
                        Print Settings
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Paper Width</label>
                            <select
                                value={config.printer_width || '80mm'}
                                onChange={e => saveConfig({ printer_width: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            >
                                <option value="58mm">58mm</option>
                                <option value="80mm">80mm</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Font Size</label>
                            <select
                                value={config.font_size || 'medium'}
                                onChange={e => saveConfig({ font_size: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            >
                                <option value="small">Small</option>
                                <option value="medium">Medium</option>
                                <option value="large">Large</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Header Text</label>
                        <Input
                            placeholder="e.g. Thank you for your order!"
                            value={config.header_text || ''}
                            onChange={e => saveConfig({ header_text: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
                        <Input
                            placeholder="e.g. Visit us again soon!"
                            value={config.footer_text || ''}
                            onChange={e => saveConfig({ footer_text: e.target.value })}
                        />
                    </div>

                    <div className="flex items-center justify-between py-2 border-t border-gray-100">
                        <span className="text-sm font-medium text-gray-700">Auto-print on new order</span>
                        <Switch
                            checked={!!config.auto_print}
                            onCheckedChange={v => saveConfig({ auto_print: v })}
                        />
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-gray-100">
                        <span className="text-sm font-medium text-gray-700">Show restaurant logo</span>
                        <Switch
                            checked={config.show_logo !== false}
                            onCheckedChange={v => saveConfig({ show_logo: v })}
                        />
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-gray-100">
                        <span className="text-sm font-medium text-gray-700">Show customer details</span>
                        <Switch
                            checked={config.show_customer_details !== false}
                            onCheckedChange={v => saveConfig({ show_customer_details: v })}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ─── Status Bar Component ──────────────────────────────────────────────────────
function StatusBar({ restaurant }) {
    const [network, setNetwork] = useState({ online: true, speed: 'good', latency: 0 });
    const [printerStatus, setPrinterStatus] = useState('disconnected');

    useEffect(() => {
        // Network status
        const updateNetwork = async () => {
            setNetwork(prev => ({ ...prev, online: navigator.onLine }));
            try {
                const start = performance.now();
                await fetch('/api/health', { method: 'HEAD' });
                const latency = Math.round(performance.now() - start);
                setNetwork(prev => ({ ...prev, latency, speed: latency < 100 ? 'good' : latency < 500 ? 'fair' : 'poor' }));
            } catch {
                setNetwork(prev => ({ ...prev, online: false }));
            }
        };

        updateNetwork();
        const interval = setInterval(updateNetwork, 10000);

        // Printer status
        const checkPrinter = () => {
            const hasPrinter = restaurant?.printer_config?.bluetooth_printer?.id;
            setPrinterStatus(hasPrinter ? 'connected' : 'disconnected');
        };
        checkPrinter();
        const printerInterval = setInterval(checkPrinter, 8000);

        return () => { clearInterval(interval); clearInterval(printerInterval); };
    }, [restaurant?.printer_config?.bluetooth_printer?.id]);

    const speedColors = { good: 'text-green-600', fair: 'text-yellow-600', poor: 'text-red-600' };
    const networkIcon = network.online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />;

    return (
        <div className="space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-gray-600">
                {networkIcon}
                <span className="font-medium">{network.online ? 'Online' : 'Offline'}</span>
                {network.online && <span className={`font-medium ${speedColors[network.speed]}`}>({network.latency}ms)</span>}
            </div>
            <div className="flex items-center gap-1.5">
                {printerStatus === 'connected' ? (
                    <><Zap className="h-4 w-4 text-green-600" /><span className="text-green-600 font-medium">Printer OK</span></>
                ) : (
                    <><AlertCircle className="h-4 w-4 text-gray-400" /><span className="text-gray-500">No Printer</span></>
                )}
            </div>
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function TabletDashboard() {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('orders');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [installPrompt, setInstallPrompt] = useState(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [canShowInstall, setCanShowInstall] = useState(true);
    const queryClient = useQueryClient();

    useEffect(() => {
        base44.auth.me()
            .then(u => setUser(u))
            .catch(() => setUser(null))
            .finally(() => setAuthLoading(false));

        // Setup PWA manifest first
        setupPWA().then(() => {
            // Then listen for install prompt after manifest is ready
            const handleBeforeInstallPrompt = (e) => {
                e.preventDefault();
                setInstallPrompt(e);
                setCanShowInstall(true);
                console.log('✅ Install prompt captured', e);
            };

            window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            
            // Check if already installed
            if (window.matchMedia('(display-mode: standalone)').matches) {
                setIsInstalled(true);
                console.log('✅ App already installed');
            } else {
                console.log('⏳ Waiting for install prompt...');
            }

            return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        });
    }, []);

    const setupPWA = async () => {
        try {
            const savedRestaurantId = sessionStorage.getItem('tablet_restaurant_id');
            const urlParams = new URLSearchParams(window.location.search);
            const rid = urlParams.get('restaurant_id') || savedRestaurantId;

            // Fetch manifest directly to ensure valid JSON
            let manifestUrl = '/getManifest?mode=tablet';
            if (rid) {
                manifestUrl += `&restaurant_id=${rid}`;
            }

            try {
                const response = await fetch(manifestUrl);
                if (!response.ok) {
                    console.error('Manifest fetch failed:', response.status, response.statusText);
                    return;
                }
                const manifest = await response.json();
                
                // Create blob URL from the fetched manifest
                const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
                const blobUrl = URL.createObjectURL(blob);
                
                let manifestLink = document.querySelector('link[rel="manifest"]');
                if (!manifestLink) {
                    manifestLink = document.createElement('link');
                    manifestLink.rel = 'manifest';
                    document.head.appendChild(manifestLink);
                }
                manifestLink.href = blobUrl;
                console.log('✅ PWA Manifest loaded and set as blob URL');
            } catch (err) {
                console.error('Failed to fetch manifest:', err.message);
            }

            // Register service worker
            if ('serviceWorker' in navigator) {
                try {
                    await navigator.serviceWorker.register('/sw.js');
                    console.log('✅ Service worker registered');
                } catch (err) {
                    console.log('Service worker registration failed:', err.message);
                }
            }
        } catch (err) {
            console.error('PWA setup error:', err);
        }
    };

    const handleInstall = async () => {
        console.log('Install button clicked. Prompt available:', !!installPrompt);
        
        if (!installPrompt) {
            console.warn('No install prompt available');
            toast.error('Install prompt not available. Try refreshing the page or check browser support.');
            return;
        }
        
        try {
            await installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;
            console.log('Install outcome:', outcome);
            
            if (outcome === 'accepted') {
                setIsInstalled(true);
                setCanShowInstall(false);
                toast.success('App installed! Check your home screen.');
            } else {
                toast.info('Install cancelled.');
            }
        } catch (err) {
            console.error('Install error:', err);
            toast.error('Install failed: ' + err.message);
        }
    };

    // Load restaurant for this user
    const { data: restaurant } = useQuery({
        queryKey: ['tablet-restaurant', user?.email],
        queryFn: async () => {
            // Check sessionStorage first for quick reload
            const savedRestaurantId = sessionStorage.getItem('tablet_restaurant_id');
            if (savedRestaurantId) {
                const r = await base44.entities.Restaurant.filter({ id: savedRestaurantId });
                if (r[0]) return r[0];
            }

            // Check if user is a manager
            const managers = await base44.entities.RestaurantManager.filter({ user_email: user.email });
            if (managers.length > 0) {
                const restaurantId = managers[0].restaurant_ids[0];
                sessionStorage.setItem('tablet_restaurant_id', restaurantId);
                const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
                return restaurants[0] || null;
            }
            // Admin: show first restaurant or use URL param
            const urlParams = new URLSearchParams(window.location.search);
            const rid = urlParams.get('restaurant_id');
            if (rid) {
                sessionStorage.setItem('tablet_restaurant_id', rid);
                const r = await base44.entities.Restaurant.filter({ id: rid });
                return r[0] || null;
            }
            if (user.role === 'admin') {
                const all = await base44.entities.Restaurant.list();
                if (all[0]) {
                    sessionStorage.setItem('tablet_restaurant_id', all[0].id);
                    return all[0];
                }
            }
            return null;
        },
        enabled: !!user,
    });

    const handleLogout = () => {
        base44.auth.logout();
        setUser(null);
    };

    if (authLoading) return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (!user) return <LoginScreen onLogin={(u) => { setUser(u); setAuthLoading(false); }} />;

    const tabLabels = { orders: 'Live Orders', history: 'Order History', messages: 'Messages', menu: 'Menu Items', printer: 'Printer Settings' };

    return (
        <div className="min-h-screen bg-gray-50 flex">
            <Sidebar
                restaurant={restaurant}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onLogout={handleLogout}
                mobileOpen={mobileMenuOpen}
                onMobileClose={() => setMobileMenuOpen(false)}
            />

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-4 sticky top-0 z-20">
                    <button
                        className="md:hidden p-2 rounded-lg hover:bg-gray-100"
                        onClick={() => setMobileMenuOpen(true)}
                    >
                        <Menu className="h-5 w-5 text-gray-600" />
                    </button>
                    <h1 className="text-lg font-semibold text-gray-800">{tabLabels[activeTab]}</h1>
                    <div className="ml-auto flex items-center gap-3">
                        {!isInstalled && !installPrompt && (
                            <span className="text-xs text-gray-500">PWA ready (Chrome/Edge to install)</span>
                        )}
                        {!isInstalled && (canShowInstall || installPrompt) && (
                            <Button 
                                onClick={handleInstall} 
                                size="sm" 
                                className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                                disabled={!installPrompt}
                                title={installPrompt ? 'Install as PWA' : 'Waiting for install prompt...'}
                            >
                                <Download className="h-4 w-4" />
                                Install App
                            </Button>
                        )}
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 p-5 overflow-y-auto">
                    {!restaurant ? (
                        <div className="flex items-center justify-center h-64 text-gray-400">
                            <div className="text-center">
                                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
                                <p className="font-medium">No restaurant found</p>
                                <p className="text-sm mt-1">Your account isn't linked to a restaurant yet.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'orders' && <LiveOrdersSection restaurantId={restaurant.id} />}
                            {activeTab === 'history' && <OrderHistorySection restaurantId={restaurant.id} />}
                            {activeTab === 'messages' && <MessagesSection restaurantId={restaurant.id} />}
                            {activeTab === 'menu' && <MenuSection restaurantId={restaurant.id} />}
                            {activeTab === 'printer' && <PrinterSettingsSection restaurant={restaurant} />}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}