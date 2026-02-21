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
    LogOut, Menu, X, ChevronRight, Search, Bluetooth, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { printerService } from '@/components/restaurant/PrinterService';
import RejectOrderDialog from '@/components/restaurant/RejectOrderDialog';

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
                    <div className="flex items-center gap-3">
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
            await base44.entities.Order.update(orderId, { status, statusHistory, rejection_reason });
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
        const printerWidth = config.printer_width === '58mm' ? '400px' : '560px';

        const printWindow = window.open('', '', 'width=300,height=600');
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
        ${order.items.map(i => `<p>${i.quantity}x ${i.name} — £${(i.price * i.quantity).toFixed(2)}</p>`).join('')}
        <div class="sep"></div>
        <p class="total">TOTAL: £${order.total.toFixed(2)}</p>
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
                            <p className="text-2xl font-bold text-gray-900">£{order.total.toFixed(2)}</p>
                        </div>

                        {/* Items */}
                        <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1">
                            {order.items.map((item, i) => (
                                <div key={i} className="flex justify-between text-sm">
                                    <span className="font-medium">{item.quantity}x {item.name}</span>
                                    <span className="text-gray-600">£{(item.price * item.quantity).toFixed(2)}</span>
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

// ─── Printer Settings Section ─────────────────────────────────────────────────
function PrinterSettingsSection({ restaurant, onRestaurantUpdate }) {
    const [isConnecting, setIsConnecting] = useState(false);
    const [connStatus, setConnStatus] = useState('disconnected');
    const queryClient = useQueryClient();

    const printer = restaurant?.printer_config?.bluetooth_printer;

    useEffect(() => {
        if (printer?.id) {
            setConnStatus(printerService.isConnected() ? 'connected' : 'disconnected');
            const interval = setInterval(() => {
                setConnStatus(printerService.isConnected() ? 'connected' : 'disconnected');
            }, 8000);
            return () => clearInterval(interval);
        }
    }, [printer?.id]);

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
                            <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${connStatus === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`}>
                                    <Printer className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-900">{printer.name || 'Printer'}</p>
                                    <p className={`text-xs ${connStatus === 'connected' ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {connStatus === 'connected' ? '● Connected' : '○ Disconnected'}
                                    </p>
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
                    <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                        Turn on your Bluetooth printer, put it in pairing mode, then tap "Scan & Connect Printer".
                    </div>
                </CardContent>
            </Card>

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

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function TabletDashboard() {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('orders');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const queryClient = useQueryClient();

    useEffect(() => {
        base44.auth.me()
            .then(u => setUser(u))
            .catch(() => setUser(null))
            .finally(() => setAuthLoading(false));
    }, []);

    // Load restaurant for this user
    const { data: restaurant } = useQuery({
        queryKey: ['tablet-restaurant', user?.email],
        queryFn: async () => {
            // Check if user is a manager
            const managers = await base44.entities.RestaurantManager.filter({ user_email: user.email });
            if (managers.length > 0) {
                const restaurants = await base44.entities.Restaurant.filter({ id: managers[0].restaurant_ids[0] });
                return restaurants[0] || null;
            }
            // Admin: show first restaurant or use URL param
            const urlParams = new URLSearchParams(window.location.search);
            const rid = urlParams.get('restaurant_id');
            if (rid) {
                const r = await base44.entities.Restaurant.filter({ id: rid });
                return r[0] || null;
            }
            if (user.role === 'admin') {
                const all = await base44.entities.Restaurant.list();
                return all[0] || null;
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

    const tabLabels = { orders: 'Live Orders', menu: 'Menu Items', printer: 'Printer Settings' };

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
                            {activeTab === 'menu' && <MenuSection restaurantId={restaurant.id} />}
                            {activeTab === 'printer' && <PrinterSettingsSection restaurant={restaurant} />}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}