import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
    Search, Plus, User, Phone, Mail, MapPin, ShoppingBag,
    Calendar, Edit2, X, ChevronDown, ChevronUp, Store
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const EMPTY_CUSTOMER = {
    full_name: '',
    phone_number: '',
    email: '',
    restaurant_id: '',
    delivery_address: '',
    notes: '',
};

// ── Customer form (create / edit) ──────────────────────────────────────────
function CustomerForm({ initial, restaurants, onSave, onClose, loading }) {
    const [form, setForm] = useState({ ...EMPTY_CUSTOMER, ...initial });
    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className="text-xs">Full Name *</Label>
                    <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Jane Smith" className="mt-1" />
                </div>
                <div>
                    <Label className="text-xs">Phone Number *</Label>
                    <Input value={form.phone_number} onChange={e => set('phone_number', e.target.value)} placeholder="07700900000" className="mt-1" />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className="text-xs">Email</Label>
                    <Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" className="mt-1" />
                </div>
                <div>
                    <Label className="text-xs">Restaurant *</Label>
                    <select
                        value={form.restaurant_id}
                        onChange={e => set('restaurant_id', e.target.value)}
                        className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                    >
                        <option value="">— Select restaurant —</option>
                        {restaurants.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div>
                <Label className="text-xs">Default Delivery Address</Label>
                <Input value={form.delivery_address} onChange={e => set('delivery_address', e.target.value)} placeholder="12 Main Street, London" className="mt-1" />
            </div>
            <div>
                <Label className="text-xs">Internal Notes</Label>
                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes about this customer..." className="mt-1 min-h-[72px] text-sm" />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                    onClick={() => onSave(form)}
                    disabled={loading || !form.full_name || !form.phone_number || !form.restaurant_id}
                    className="bg-orange-500 hover:bg-orange-600"
                >
                    {loading ? 'Saving...' : 'Save Customer'}
                </Button>
            </DialogFooter>
        </div>
    );
}

// ── Order history mini-list ────────────────────────────────────────────────
function CustomerOrders({ customerId, customerPhone, customerEmail }) {
    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['customer-orders', customerId, customerPhone, customerEmail],
        queryFn: async () => {
            const results = [];
            if (customerPhone) {
                const byPhone = await base44.entities.Order.filter({ customer_phone: customerPhone });
                results.push(...byPhone);
            }
            if (customerEmail) {
                const byEmail = await base44.entities.Order.filter({ customer_email: customerEmail });
                // deduplicate
                for (const o of byEmail) {
                    if (!results.find(r => r.id === o.id)) results.push(o);
                }
            }
            return results.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 20);
        },
        enabled: !!(customerPhone || customerEmail),
    });

    if (isLoading) return <p className="text-xs text-gray-400 py-2">Loading orders...</p>;
    if (!orders.length) return <p className="text-xs text-gray-400 py-2">No orders found.</p>;

    const statusColor = {
        pending: 'bg-yellow-100 text-yellow-700',
        confirmed: 'bg-blue-100 text-blue-700',
        preparing: 'bg-orange-100 text-orange-700',
        out_for_delivery: 'bg-purple-100 text-purple-700',
        delivered: 'bg-green-100 text-green-700',
        collected: 'bg-green-100 text-green-700',
        cancelled: 'bg-red-100 text-red-700',
        refunded: 'bg-gray-100 text-gray-600',
    };

    return (
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {orders.map(order => (
                <div key={order.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                    <div>
                        <span className="font-medium text-gray-700">
                            {order.order_number || `#${order.id.slice(-6).toUpperCase()}`}
                        </span>
                        <span className="text-gray-400 ml-2">
                            {order.created_date ? format(new Date(order.created_date), 'dd MMM yyyy') : ''}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] px-1.5 py-0 ${statusColor[order.status] || 'bg-gray-100 text-gray-500'}`}>
                            {order.status?.replace(/_/g, ' ')}
                        </Badge>
                        <span className="font-semibold text-gray-800">£{(order.total || 0).toFixed(2)}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Customer row card ──────────────────────────────────────────────────────
function CustomerCard({ customer, restaurant, onEdit }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <Card className="overflow-hidden">
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="h-5 w-5 text-orange-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{customer.full_name}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <Phone className="h-3 w-3" />{customer.phone_number}
                                </span>
                                {customer.email && (
                                    <span className="flex items-center gap-1 text-xs text-gray-500">
                                        <Mail className="h-3 w-3" />{customer.email}
                                    </span>
                                )}
                                {restaurant && (
                                    <span className="flex items-center gap-1 text-xs text-blue-600">
                                        <Store className="h-3 w-3" />{restaurant.name}
                                    </span>
                                )}
                            </div>
                            {customer.delivery_address && (
                                <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5 truncate">
                                    <MapPin className="h-3 w-3 flex-shrink-0" />{customer.delivery_address}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-bold text-gray-800">{customer.total_orders || 0}</p>
                            <p className="text-[10px] text-gray-400">orders</p>
                        </div>
                        {customer.last_order_date && (
                            <div className="text-right hidden sm:block">
                                <p className="text-xs text-gray-500">{format(new Date(customer.last_order_date), 'dd MMM yy')}</p>
                                <p className="text-[10px] text-gray-400">last order</p>
                            </div>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(customer)}>
                            <Edit2 className="h-3.5 w-3.5 text-gray-400" />
                        </Button>
                        <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8"
                            onClick={() => setExpanded(e => !e)}
                        >
                            {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                        </Button>
                    </div>
                </div>

                {customer.notes && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        📝 {customer.notes}
                    </p>
                )}

                {expanded && (
                    <div className="mt-3 border-t pt-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                            <ShoppingBag className="h-3 w-3" />Order History
                        </p>
                        <CustomerOrders
                            customerId={customer.id}
                            customerPhone={customer.phone_number}
                            customerEmail={customer.email}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ── Main CRM component ─────────────────────────────────────────────────────
export default function CustomerCRM() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [restaurantFilter, setRestaurantFilter] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState(null); // null = new

    const { data: customers = [], isLoading } = useQuery({
        queryKey: ['admin-customers'],
        queryFn: () => base44.entities.Customer.list('-created_date', 500),
    });

    const { data: restaurants = [] } = useQuery({
        queryKey: ['admin-restaurants-list'],
        queryFn: () => base44.entities.Restaurant.list('name', 200),
    });

    const restaurantMap = useMemo(() => {
        const m = {};
        for (const r of restaurants) m[r.id] = r;
        return m;
    }, [restaurants]);

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.Customer.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-customers']);
            toast.success('Customer added');
            setDialogOpen(false);
        },
        onError: () => toast.error('Failed to save customer'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Customer.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-customers']);
            toast.success('Customer updated');
            setDialogOpen(false);
        },
        onError: () => toast.error('Failed to update customer'),
    });

    const handleSave = (form) => {
        if (editing) {
            updateMutation.mutate({ id: editing.id, data: form });
        } else {
            createMutation.mutate(form);
        }
    };

    const handleEdit = (customer) => {
        setEditing(customer);
        setDialogOpen(true);
    };

    const handleAdd = () => {
        setEditing(null);
        setDialogOpen(true);
    };

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return customers.filter(c => {
            const matchSearch = !q || c.full_name?.toLowerCase().includes(q) || c.phone_number?.includes(q) || c.email?.toLowerCase().includes(q);
            const matchRestaurant = !restaurantFilter || c.restaurant_id === restaurantFilter;
            return matchSearch && matchRestaurant;
        });
    }, [customers, search, restaurantFilter]);

    const isSaving = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Customers</h2>
                    <p className="text-sm text-gray-500">{customers.length} total customers across all restaurants</p>
                </div>
                <Button onClick={handleAdd} className="bg-orange-500 hover:bg-orange-600 gap-2">
                    <Plus className="h-4 w-4" />Add Customer
                </Button>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name, phone or email..."
                        className="pl-9"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                            <X className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                    )}
                </div>
                <select
                    value={restaurantFilter}
                    onChange={e => setRestaurantFilter(e.target.value)}
                    className="h-10 px-3 rounded-md border border-input bg-white text-sm min-w-[180px]"
                >
                    <option value="">All Restaurants</option>
                    {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'Total Customers', value: customers.length, color: 'text-blue-600' },
                    { label: 'Showing', value: filtered.length, color: 'text-orange-600' },
                    { label: 'Avg Orders', value: customers.length ? (customers.reduce((s, c) => s + (c.total_orders || 0), 0) / customers.length).toFixed(1) : 0, color: 'text-green-600' },
                ].map(s => (
                    <Card key={s.label} className="p-4 text-center">
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                    </Card>
                ))}
            </div>

            {/* Customer list */}
            {isLoading ? (
                <div className="text-center py-16 text-gray-400">Loading customers...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>{search || restaurantFilter ? 'No customers match your filters.' : 'No customers yet.'}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(c => (
                        <CustomerCard
                            key={c.id}
                            customer={c}
                            restaurant={restaurantMap[c.restaurant_id]}
                            onEdit={handleEdit}
                        />
                    ))}
                </div>
            )}

            {/* Add / Edit dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
                    </DialogHeader>
                    <CustomerForm
                        initial={editing || {}}
                        restaurants={restaurants}
                        onSave={handleSave}
                        onClose={() => setDialogOpen(false)}
                        loading={isSaving}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}