import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { toast } from 'sonner';
import POSConfirmDialog from './POSConfirmDialog';
import {
    UserPlus, Edit2, Trash2, ToggleLeft, ToggleRight,
    TrendingUp, ShoppingCart, DollarSign, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';

const ROLES = [
    { value: 'waiter',        label: 'Waiter',        color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    { value: 'cashier',       label: 'Cashier',       color: 'bg-green-500/10 text-green-400 border-green-500/30' },
    { value: 'kitchen_staff', label: 'Kitchen Staff', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
    { value: 'manager',       label: 'Manager',       color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
];

const DATE_PRESETS = [
    { label: 'Today',      getDates: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
    { label: 'Last 7 days',getDates: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }) },
    { label: 'Last 30 days',getDates: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }) },
    { label: 'All time',   getDates: () => ({ from: null, to: null }) },
];

function RoleBadge({ role }) {
    const r = ROLES.find(x => x.value === role) || { label: role, color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' };
    return (
        <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded-full ${r.color}`}>{r.label}</span>
    );
}

function StaffFormDialog({ open, onClose, staff, restaurantId, onSaved, isDark }) {
    const qc = useQueryClient();
    const [form, setForm] = useState(staff ? { ...staff } : { full_name: '', email: '', role: 'waiter', staff_number: '', pin: '', notes: '' });
    const [saving, setSaving] = useState(false);
    const t = {
        bg:    isDark ? 'bg-[#151720]' : 'bg-white',
        text:  isDark ? 'text-white' : 'text-gray-900',
        label: isDark ? 'text-gray-400' : 'text-gray-600',
        input: isDark ? 'bg-[#0f1117] border-white/[0.08] text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900',
        select:isDark ? 'bg-[#0f1117] border-white/[0.08] text-white' : 'bg-gray-50 border-gray-200 text-gray-900',
    };

    const save = async () => {
        if (!form.full_name.trim() || !form.role) {
            toast.error('Name and role are required');
            return;
        }
        if (form.pin && !/^\d{4}$/.test(form.pin)) {
            toast.error('PIN must be 4 digits');
            return;
        }
        setSaving(true);
        try {
            if (staff?.id) {
                await base44.entities.StaffMember.update(staff.id, form);
                toast.success('Staff member updated');
            } else {
                await base44.entities.StaffMember.create({ ...form, restaurant_id: restaurantId });
                toast.success('Staff member added');
            }
            qc.invalidateQueries({ queryKey: ['pos-staff', restaurantId] });
            onSaved();
            onClose();
        } catch (e) {
            toast.error('Failed to save: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className={`${t.bg} border ${isDark ? 'border-white/[0.08]' : 'border-gray-200'} max-w-md`}>
                <DialogHeader>
                    <DialogTitle className={t.text}>{staff ? 'Edit Staff Member' : 'Add Staff Member'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    {[
                        { key: 'full_name',    label: 'Full Name',                   placeholder: 'Jane Smith' },
                        { key: 'staff_number', label: 'Staff Number (e.g. S001)',    placeholder: 'S001' },
                        { key: 'email',        label: 'Email (optional)',             placeholder: 'jane@restaurant.com', type: 'email' },
                        { key: 'pin',          label: 'PIN (4 digits, optional)',     placeholder: '1234', maxLength: 4 },
                    ].map(({ key, label, placeholder, type, maxLength }) => (
                        <div key={key}>
                            <label className={`${t.label} text-xs font-medium block mb-1`}>{label}</label>
                            <Input
                                type={type || 'text'}
                                placeholder={placeholder}
                                value={form[key] || ''}
                                maxLength={maxLength}
                                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                                className={`${t.input} border`}
                            />
                        </div>
                    ))}
                    <div>
                        <label className={`${t.label} text-xs font-medium block mb-1`}>Role</label>
                        <select
                            value={form.role}
                            onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                            className={`${t.select} border rounded-lg px-3 py-2 text-sm w-full outline-none`}
                        >
                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={`${t.label} text-xs font-medium block mb-1`}>Notes (optional)</label>
                        <Input
                            placeholder="Any internal notes..."
                            value={form.notes || ''}
                            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                            className={`${t.input} border`}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} className={isDark ? 'text-gray-400' : 'text-gray-600'}>Cancel</Button>
                    <Button onClick={save} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
                        {saving ? 'Saving...' : (staff ? 'Save Changes' : 'Add Staff')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function StaffStats({ staff, orders, t }) {
    const staffOrders = orders.filter(o => o.staff_id === staff.id);
    const revenue = staffOrders.reduce((s, o) => s + (o.total || 0), 0);
    return (
        <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
                <ShoppingCart className="h-3 w-3 text-orange-400" />
                <span className={`${t.textSub} text-xs`}>{staffOrders.length} orders</span>
            </div>
            <div className="flex items-center gap-1.5">
                <DollarSign className="h-3 w-3 text-green-400" />
                <span className={`${t.textSub} text-xs`}>£{revenue.toFixed(2)}</span>
            </div>
        </div>
    );
}

export default function POSStaffManager({ restaurantId, posTheme = 'dark', currentUser }) {
    const isDark = posTheme === 'dark';
    const isAdmin = currentUser?.role === 'admin';
    const qc = useQueryClient();
    const t = {
        bg:      isDark ? 'bg-[#0c0e16]' : 'bg-gray-50',
        panel:   isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        card:    isDark ? 'bg-[#1a1d27] border-white/[0.06]' : 'bg-white border-gray-200',
        text:    isDark ? 'text-white' : 'text-gray-900',
        textMuted:isDark ? 'text-gray-400' : 'text-gray-500',
        textSub: isDark ? 'text-gray-500' : 'text-gray-400',
        input:   isDark ? 'bg-[#0f1117] border-white/[0.08] text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900',
        pill:    isDark ? 'bg-white/5 hover:bg-white/10 border-white/[0.08] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-600',
        pillActive: 'bg-orange-500 text-white border-orange-500',
    };

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [datePreset, setDatePreset] = useState('Last 7 days');
    const [formOpen, setFormOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);
    const [selectedStaff, setSelectedStaff] = useState(null);

    const { data: staffList = [] } = useQuery({
        queryKey: ['pos-staff', restaurantId],
        queryFn: () => base44.entities.StaffMember.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { from, to } = DATE_PRESETS.find(p => p.label === datePreset)?.getDates() || {};

    const { data: orders = [] } = useQuery({
        queryKey: ['pos-staff-orders', restaurantId, datePreset],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 500),
        enabled: !!restaurantId,
    });

    const filteredOrders = orders.filter(o => {
        if (from && new Date(o.created_date) < from) return false;
        if (to && new Date(o.created_date) > to) return false;
        return true;
    });

    const filtered = staffList.filter(s => {
        if (roleFilter !== 'all' && s.role !== roleFilter) return false;
        if (search && !s.full_name.toLowerCase().includes(search.toLowerCase()) && !(s.email || '').toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const toggleActive = async (staff) => {
        await base44.entities.StaffMember.update(staff.id, { is_active: !staff.is_active });
        qc.invalidateQueries({ queryKey: ['pos-staff', restaurantId] });
        toast.success(staff.is_active ? 'Staff member deactivated' : 'Staff member activated');
    };

    // Themed dialog rather than window.confirm() - native dialogs are tiny on a
    // touch terminal and are suppressed outright in some kiosk/fullscreen browser
    // setups, where confirm() returns false and the delete silently never runs.
    const [pendingDelete, setPendingDelete] = useState(null);

    const deleteStaff = (staff) => setPendingDelete(staff);

    const confirmDeleteStaff = async () => {
        const staff = pendingDelete;
        setPendingDelete(null);
        if (!staff) return;
        try {
            await base44.entities.StaffMember.delete(staff.id);
            qc.invalidateQueries({ queryKey: ['pos-staff', restaurantId] });
            if (selectedStaff?.id === staff.id) setSelectedStaff(null);
            toast.success('Staff member removed');
        } catch (e) {
            toast.error('Could not remove staff member: ' + (e?.message || e));
        }
    };

    // Stats for selected staff
    const selectedOrders = selectedStaff
        ? filteredOrders.filter(o => o.staff_id === selectedStaff.id)
        : [];
    const selectedRevenue = selectedOrders.reduce((s, o) => s + (o.total || 0), 0);

    // Aggregate stats per staff
    const staffStats = staffList.map(s => ({
        ...s,
        orderCount: filteredOrders.filter(o => o.staff_id === s.id).length,
        revenue: filteredOrders.filter(o => o.staff_id === s.id).reduce((sum, o) => sum + (o.total || 0), 0),
    })).sort((a, b) => b.revenue - a.revenue);

    return (
        <div className={`flex h-full min-h-0 gap-3 ${t.bg}`}>
            {/* Left: Staff list */}
            <div className={`w-80 flex-shrink-0 ${t.panel} border rounded-2xl flex flex-col overflow-hidden`}>
                {/* Header */}
                <div className={`p-4 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'} flex items-center justify-between flex-shrink-0`}>
                    <h2 className={`${t.text} font-bold text-base`}>Staff Members</h2>
                    {isAdmin && (
                        <Button onClick={() => { setEditingStaff(null); setFormOpen(true); }}
                            className="bg-orange-500 hover:bg-orange-600 text-white h-8 px-3 text-xs gap-1">
                            <UserPlus className="h-3.5 w-3.5" /> Add
                        </Button>
                    )}
                </div>

                {/* Filters */}
                <div className={`p-3 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'} flex-shrink-0 space-y-2`}>
                    <div className="relative">
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textSub}`} />
                        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff..."
                            className={`${t.input} h-8 pl-8 text-xs border rounded-lg`} />
                    </div>
                    <div className="flex gap-1 flex-wrap">
                        {['all', ...ROLES.map(r => r.value)].map(r => (
                            <button key={r} onClick={() => setRoleFilter(r)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${roleFilter === r ? t.pillActive : t.pill}`}>
                                {r === 'all' ? 'All' : ROLES.find(x => x.value === r)?.label || r}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-hide">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-center">
                            <p className={`${t.textMuted} text-sm`}>No staff found</p>
                        </div>
                    ) : filtered.map(s => {
                        const stat = staffStats.find(x => x.id === s.id);
                        const isSelected = selectedStaff?.id === s.id;
                        return (
                            <button key={s.id} onClick={() => setSelectedStaff(isSelected ? null : s)}
                                className={`w-full text-left p-3 rounded-xl border transition-all ${
                                    isSelected
                                        ? 'border-orange-500/50 bg-orange-500/5'
                                        : `${t.card} border hover:border-orange-500/30`
                                } ${!s.is_active ? 'opacity-50' : ''}`}>
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${
                                            s.is_active ? 'bg-orange-500' : 'bg-gray-500'
                                        }`}>
                                            {s.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`${t.text} text-xs font-semibold truncate`}>{s.full_name}</p>
                                            <p className={`${t.textSub} text-[10px] truncate`}>{s.email}</p>
                                        </div>
                                    </div>
                                    <RoleBadge role={s.role} />
                                </div>
                                <div className="flex items-center gap-3 mt-1.5 ml-9">
                                    <span className={`${t.textSub} text-[10px]`}>{stat?.orderCount || 0} orders</span>
                                    <span className="text-green-400 text-[10px] font-semibold">£{(stat?.revenue || 0).toFixed(2)}</span>
                                    {!s.is_active && <span className="text-[10px] text-red-400">Inactive</span>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Right: Detail / Stats */}
            <div className="flex-1 flex flex-col gap-3 overflow-hidden min-w-0">
                {/* Date preset bar */}
                <div className={`${t.panel} border rounded-2xl px-4 py-2.5 flex items-center gap-2 flex-shrink-0 flex-wrap`}>
                    <span className={`${t.textMuted} text-xs font-semibold`}>Period:</span>
                    {DATE_PRESETS.map(p => (
                        <button key={p.label} onClick={() => setDatePreset(p.label)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${datePreset === p.label ? t.pillActive : t.pill}`}>
                            {p.label}
                        </button>
                    ))}
                </div>

                {selectedStaff ? (
                    /* Selected staff detail */
                    <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide">
                        {/* Profile card */}
                        <div className={`${t.panel} border rounded-2xl p-5`}>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white ${selectedStaff.is_active ? 'bg-orange-500' : 'bg-gray-500'}`}>
                                        {selectedStaff.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className={`${t.text} font-bold text-lg`}>{selectedStaff.full_name}</h3>
                                        <p className={`${t.textSub} text-sm`}>{selectedStaff.email}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <RoleBadge role={selectedStaff.role} />
                                            <span className={`text-[10px] font-semibold ${selectedStaff.is_active ? 'text-green-400' : 'text-red-400'}`}>
                                                {selectedStaff.is_active ? '● Active' : '● Inactive'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <div className="flex items-center gap-2">
                                        <Button onClick={() => { setEditingStaff(selectedStaff); setFormOpen(true); }}
                                            size="sm" className={isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/[0.08]' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'}>
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button onClick={() => toggleActive(selectedStaff)} size="sm"
                                            className={selectedStaff.is_active
                                                ? 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                                : 'bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30'}>
                                            {selectedStaff.is_active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                                            {selectedStaff.is_active ? 'Deactivate' : 'Activate'}
                                        </Button>
                                        <Button onClick={() => deleteStaff(selectedStaff)} size="sm"
                                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                            {selectedStaff.notes && (
                                <p className={`${t.textSub} text-xs mt-3 border-t ${isDark ? 'border-white/[0.05]' : 'border-gray-100'} pt-3`}>
                                    📝 {selectedStaff.notes}
                                </p>
                            )}
                        </div>

                        {/* KPI cards */}
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: 'Orders', value: selectedOrders.length, icon: ShoppingCart, color: 'text-orange-400' },
                                { label: 'Revenue', value: `£${selectedRevenue.toFixed(2)}`, icon: TrendingUp, color: 'text-green-400' },
                                { label: 'Avg. Order', value: selectedOrders.length ? `£${(selectedRevenue / selectedOrders.length).toFixed(2)}` : '£0.00', icon: DollarSign, color: 'text-blue-400' },
                            ].map(({ label, value, icon: Icon, color }) => (
                                <div key={label} className={`${t.panel} border rounded-2xl p-4`}>
                                    <Icon className={`h-5 w-5 ${color} mb-2`} />
                                    <p className={`${t.text} font-bold text-xl`}>{value}</p>
                                    <p className={`${t.textMuted} text-xs`}>{label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Recent orders */}
                        <div className={`${t.panel} border rounded-2xl overflow-hidden`}>
                            <div className={`px-4 py-3 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                                <h4 className={`${t.text} font-semibold text-sm`}>Recent Orders ({selectedOrders.length})</h4>
                            </div>
                            <div className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto scrollbar-hide">
                                {selectedOrders.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <p className={`${t.textMuted} text-sm`}>No orders in this period</p>
                                    </div>
                                ) : selectedOrders.slice(0, 20).map(order => (
                                    <div key={order.id} className="px-4 py-3 flex items-center justify-between">
                                        <div>
                                            <p className={`${t.text} text-xs font-semibold`}>
                                                {order.order_number || `#${order.id.slice(-6).toUpperCase()}`}
                                            </p>
                                            <p className={`${t.textSub} text-[10px]`}>
                                                {format(new Date(order.created_date), 'dd MMM, HH:mm')} · {order.order_type?.replace('_', ' ')}
                                            </p>
                                        </div>
                                        <p className="text-orange-500 text-sm font-bold">£{order.total?.toFixed(2)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Overview: leaderboard */
                    <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide">
                        <div className={`${t.panel} border rounded-2xl overflow-hidden`}>
                            <div className={`px-4 py-3 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'} flex items-center gap-2`}>
                                <TrendingUp className="h-4 w-4 text-orange-400" />
                                <h4 className={`${t.text} font-semibold text-sm`}>Staff Leaderboard · {datePreset}</h4>
                            </div>
                            <div className="divide-y divide-white/[0.03]">
                                {staffStats.map((s, i) => (
                                    <div key={s.id} className={`px-4 py-3 flex items-center gap-4 ${!s.is_active ? 'opacity-40' : ''}`}>
                                        <span className={`w-6 text-center text-sm font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : t.textSub}`}>
                                            {i + 1}
                                        </span>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${s.is_active ? 'bg-orange-500' : 'bg-gray-500'}`}>
                                            {s.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`${t.text} text-sm font-semibold truncate`}>{s.full_name}</p>
                                            <RoleBadge role={s.role} />
                                        </div>
                                        <div className="text-right">
                                            <p className="text-green-400 font-bold text-sm">£{s.revenue.toFixed(2)}</p>
                                            <p className={`${t.textSub} text-[10px]`}>{s.orderCount} orders</p>
                                        </div>
                                    </div>
                                ))}
                                {staffStats.length === 0 && (
                                    <div className="p-8 text-center">
                                        <p className={`${t.textMuted} text-sm`}>No staff added yet</p>
                                        <p className={`${t.textSub} text-xs mt-1`}>Add staff members to start tracking performance</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {formOpen && (
                <StaffFormDialog
                    open={formOpen}
                    onClose={() => setFormOpen(false)}
                    staff={editingStaff}
                    restaurantId={restaurantId}
                    onSaved={() => setEditingStaff(null)}
                    isDark={isDark}
                />
            )}

            {pendingDelete && (
                <POSConfirmDialog
                    title="Remove staff member?"
                    message={`${pendingDelete.full_name} will be permanently removed. This cannot be undone.`}
                    confirmLabel="Remove"
                    onConfirm={confirmDeleteStaff}
                    onCancel={() => setPendingDelete(null)}
                    isDark={isDark}
                />
            )}
        </div>
    );
}