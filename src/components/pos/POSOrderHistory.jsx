import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search, ChevronDown, ChevronUp, Calendar, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const STATUS_COLORS = {
    pending:               'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    confirmed:             'bg-blue-500/10 text-blue-400 border-blue-500/30',
    preparing:             'bg-orange-500/10 text-orange-400 border-orange-500/30',
    out_for_delivery:      'bg-purple-500/10 text-purple-400 border-purple-500/30',
    ready_for_collection:  'bg-teal-500/10 text-teal-400 border-teal-500/30',
    delivered:             'bg-green-500/10 text-green-400 border-green-500/30',
    collected:             'bg-green-500/10 text-green-400 border-green-500/30',
    cancelled:             'bg-red-500/10 text-red-400 border-red-500/30',
    refunded:              'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

const STATUS_LABELS = {
    pending: 'Pending', confirmed: 'Confirmed', preparing: 'Preparing',
    out_for_delivery: 'Out for Delivery', ready_for_collection: 'Ready', delivered: 'Delivered',
    collected: 'Collected', cancelled: 'Cancelled', refunded: 'Refunded',
    refund_requested: 'Refund Req.', refund_rejected_by_restaurant: 'Refund Rejected',
};

const ORDER_TYPE_LABELS = { delivery: 'Delivery', collection: 'Collection', takeaway: 'Takeaway', dine_in: 'Dine In' };

const DATE_PRESETS = [
    { label: 'Today',      getDates: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
    { label: 'Yesterday',  getDates: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
    { label: 'Last 7 days',getDates: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }) },
    { label: 'Last 30 days',getDates: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }) },
    { label: 'All time',   getDates: () => ({ from: null, to: null }) },
];

function OrderRow({ order, t, isDark }) {
    const [expanded, setExpanded] = useState(false);
    const statusClass = STATUS_COLORS[order.status] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';

    return (
        <div className={`${isDark ? 'bg-[#1a1d27] border-white/[0.06]' : 'bg-white border-gray-200'} border rounded-2xl overflow-hidden transition-all`}>
            {/* Row header */}
            <button
                onClick={() => setExpanded(p => !p)}
                className="w-full flex items-center justify-between px-4 py-3 text-left gap-3"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div>
                        <p className={`${t.text} font-bold text-sm`}>
                            {order.order_number || `#${order.id.slice(-6).toUpperCase()}`}
                        </p>
                        <p className={`${t.textSub} text-xs`}>
                            {format(new Date(order.created_date), 'dd MMM yyyy, HH:mm')}
                        </p>
                    </div>
                    <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded-full ${statusClass}`}>
                        {STATUS_LABELS[order.status] || order.status}
                    </span>
                    <span className={`text-[10px] font-medium ${isDark ? 'text-gray-500' : 'text-gray-400'} capitalize hidden sm:block`}>
                        {ORDER_TYPE_LABELS[order.order_type] || order.order_type}
                    </span>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`${t.text} font-bold text-base`}>£{order.total?.toFixed(2)}</span>
                    {expanded
                        ? <ChevronUp className={`h-4 w-4 ${t.textSub}`} />
                        : <ChevronDown className={`h-4 w-4 ${t.textSub}`} />
                    }
                </div>
            </button>

            {/* Expanded details */}
            {expanded && (
                <div className={`border-t ${isDark ? 'border-white/[0.05]' : 'border-gray-100'} px-4 py-3 space-y-3`}>
                    {/* Customer info */}
                    {(order.guest_name || order.delivery_address || order.phone || order.table_number) && (
                        <div className={`${isDark ? 'bg-white/[0.03]' : 'bg-gray-50'} rounded-xl p-3 space-y-1`}>
                            <p className={`${t.textMuted} text-[10px] font-semibold uppercase tracking-wider mb-1`}>Customer</p>
                            {order.guest_name && <p className={`${t.text} text-xs font-medium`}>{order.guest_name}</p>}
                            {order.phone && <p className={`${t.textSub} text-xs`}>{order.phone}</p>}
                            {order.delivery_address && <p className={`${t.textSub} text-xs`}>{order.delivery_address}</p>}
                            {order.table_number && <p className={`${t.textSub} text-xs`}>Table: {order.table_number}</p>}
                        </div>
                    )}

                    {/* Items */}
                    <div>
                        <p className={`${t.textMuted} text-[10px] font-semibold uppercase tracking-wider mb-2`}>Items</p>
                        <div className="space-y-1.5">
                            {(order.items || []).map((item, i) => (
                                <div key={i} className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className={`${t.text} text-xs font-medium`}>{item.quantity}× {item.name}</p>
                                        {item.customizations && Object.keys(item.customizations).length > 0 && (
                                            <p className={`${t.textSub} text-[10px] truncate`}>
                                                {Object.entries(item.customizations).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')}
                                            </p>
                                        )}
                                    </div>
                                    <p className="text-orange-500 text-xs font-bold flex-shrink-0">£{(item.price * item.quantity).toFixed(2)}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Totals */}
                    <div className={`border-t ${isDark ? 'border-white/[0.05]' : 'border-gray-100'} pt-2 space-y-1`}>
                        {order.discount > 0 && (
                            <div className="flex justify-between text-xs">
                                <span className={t.textMuted}>Discount</span>
                                <span className="text-green-400">-£{order.discount?.toFixed(2)}</span>
                            </div>
                        )}
                        {order.delivery_fee > 0 && (
                            <div className="flex justify-between text-xs">
                                <span className={t.textMuted}>Delivery</span>
                                <span className={t.text}>£{order.delivery_fee?.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm font-bold">
                            <span className={t.text}>Total</span>
                            <span className="text-orange-500">£{order.total?.toFixed(2)}</span>
                        </div>
                        {order.payment_method && (
                            <p className={`${t.textSub} text-[10px] text-right capitalize`}>Paid by {order.payment_method.replace('_', ' ')}</p>
                        )}
                    </div>

                    {order.notes && (
                        <div className={`${isDark ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'} border rounded-xl px-3 py-2`}>
                            <p className={`${isDark ? 'text-yellow-400' : 'text-yellow-700'} text-xs`}>📝 {order.notes}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function POSOrderHistory({ restaurantId, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const t = {
        text:     isDark ? 'text-white'     : 'text-gray-900',
        textMuted:isDark ? 'text-gray-400'  : 'text-gray-500',
        textSub:  isDark ? 'text-gray-500'  : 'text-gray-400',
        panel:    isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        input:    isDark ? 'bg-[#0f1117] border-white/[0.08] text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400',
        select:   isDark ? 'bg-[#0f1117] border-white/[0.08] text-white' : 'bg-gray-50 border-gray-200 text-gray-900',
        pill:     isDark ? 'bg-white/5 hover:bg-white/10 border-white/[0.08] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-600',
        pillActive:'bg-orange-500 text-white border-orange-500',
    };

    const [datePreset, setDatePreset] = useState('Today');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [search, setSearch] = useState('');

    const { from, to } = DATE_PRESETS.find(p => p.label === datePreset)?.getDates() || {};

    // NOTE: do NOT add a server-side created_date range filter here.
    // `created_date` is a platform-managed field and range operators ($gte/$lte)
    // against it match NOTHING through the entity filter API - verified: even
    // { created_date: { $gte: '2026-01-01' } } returns zero rows while the same
    // query without it returns orders normally. A previous version filtered
    // server-side and silently showed an empty History for every date preset.
    // Fetch recent orders and narrow by date on the client instead.
    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['pos-order-history', restaurantId],
        queryFn: async () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 500),
        enabled: !!restaurantId,
        refetchInterval: 30000,
    });

    const filtered = orders.filter(order => {
        // Date range applied client-side (see note on the query above)
        if (from || to) {
            const created = order.created_date ? new Date(order.created_date) : null;
            if (!created || isNaN(created)) return false;
            if (from && created < from) return false;
            if (to && created > to) return false;
        }
        if (statusFilter !== 'all' && order.status !== statusFilter) return false;
        if (typeFilter !== 'all' && order.order_type !== typeFilter) return false;
        if (search) {
            const s = search.toLowerCase();
            const matches = (order.order_number || '').toLowerCase().includes(s)
                || (order.guest_name || '').toLowerCase().includes(s)
                || (order.delivery_address || '').toLowerCase().includes(s)
                || order.id.toLowerCase().includes(s);
            if (!matches) return false;
        }
        return true;
    });

    const totalRevenue = filtered.filter(o => !['cancelled', 'refunded'].includes(o.status)).reduce((s, o) => s + (o.total || 0), 0);

    return (
        <div className="flex flex-col h-full min-h-0 gap-3">
            {/* Filters */}
            <div className={`${t.panel} border rounded-2xl p-3 flex flex-wrap gap-2 items-center flex-shrink-0`}>
                {/* Date presets */}
                <div className="flex items-center gap-1 flex-wrap">
                    <Calendar className={`h-4 w-4 ${t.textMuted} mr-1`} />
                    {DATE_PRESETS.map(p => (
                        <button key={p.label} onClick={() => setDatePreset(p.label)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${datePreset === p.label ? t.pillActive : t.pill}`}>
                            {p.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 ml-auto flex-wrap">
                    {/* Status filter */}
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                        className={`${t.select} border rounded-xl px-3 py-2 text-xs font-medium outline-none`}>
                        <option value="all">All Statuses</option>
                        {Object.entries(STATUS_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    </select>

                    {/* Order type filter */}
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                        className={`${t.select} border rounded-xl px-3 py-2 text-xs font-medium outline-none`}>
                        <option value="all">All Types</option>
                        {Object.entries(ORDER_TYPE_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    </select>

                    {/* Search */}
                    <div className="relative">
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textSub}`} />
                        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders..."
                            className={`${t.input} h-9 pl-8 rounded-xl text-xs w-44 focus:ring-0`} />
                    </div>
                </div>
            </div>

            {/* Summary bar */}
            <div className={`${t.panel} border rounded-2xl px-4 py-2.5 flex items-center gap-6 flex-shrink-0`}>
                <div>
                    <p className={`${t.textMuted} text-[10px] font-semibold uppercase tracking-wider`}>Orders</p>
                    <p className={`${t.text} font-bold text-lg`}>{filtered.length}</p>
                </div>
                <div>
                    <p className={`${t.textMuted} text-[10px] font-semibold uppercase tracking-wider`}>Revenue</p>
                    <p className="text-orange-500 font-bold text-lg">£{totalRevenue.toFixed(2)}</p>
                </div>
                <div>
                    <p className={`${t.textMuted} text-[10px] font-semibold uppercase tracking-wider`}>Avg. Order</p>
                    <p className={`${t.text} font-bold text-lg`}>£{filtered.length ? (totalRevenue / filtered.filter(o => !['cancelled','refunded'].includes(o.status)).length || 0).toFixed(2) : '0.00'}</p>
                </div>
            </div>

            {/* Order list */}
            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
                {isLoading ? (
                    <div className="flex items-center justify-center h-40">
                        <div className="w-8 h-8 rounded-full border-4 border-orange-500/30 border-t-orange-500 animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center">
                        <Filter className={`h-8 w-8 ${t.textSub} mb-2`} />
                        <p className={`${t.textMuted} text-sm font-medium`}>No orders found</p>
                        <p className={`${t.textSub} text-xs mt-1`}>Try adjusting your filters</p>
                    </div>
                ) : (
                    filtered.map(order => <OrderRow key={order.id} order={order} t={t} isDark={isDark} />)
                )}
            </div>
        </div>
    );
}