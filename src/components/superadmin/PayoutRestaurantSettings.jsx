import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { toast } from 'sonner';

const TYPE_LABEL = {
    chargeback: 'Card dispute', dispute_fee: 'Stripe dispute fee', manual_credit: 'Credit', manual_debit: 'Debit', reserve_release: 'Reserve release',
};

/** Per-restaurant payout settings: schedule, reserve, bank details, adjustments. */
export default function PayoutRestaurantSettings({ restaurant, financeCall }) {
    const queryClient = useQueryClient();
    const rid = restaurant.id;
    const [schedule, setSchedule] = useState(restaurant.payout_schedule || 'manual');
    const [reservePct, setReservePct] = useState(restaurant.reserve_percent ?? '');
    const [reserveUntil, setReserveUntil] = useState(restaurant.reserve_until ? restaurant.reserve_until.slice(0, 10) : '');
    const [bank, setBank] = useState({ account_name: '', sort_code: '', account_number: '' });
    const [adj, setAdj] = useState({ type: 'manual_credit', amount: '', reason: '' });
    useEffect(() => {
        setSchedule(restaurant.payout_schedule || 'manual');
        setReservePct(restaurant.reserve_percent ?? '');
        setReserveUntil(restaurant.reserve_until ? restaurant.reserve_until.slice(0, 10) : '');
    }, [restaurant]);

    const { data: bankData, refetch: refetchBank } = useQuery({ queryKey: ['payout-bank', rid], queryFn: () => financeCall('get_bank_details', { restaurant_id: rid }) });
    const { data: adjData, refetch: refetchAdj } = useQuery({ queryKey: ['payout-adjustments', rid], queryFn: () => financeCall('list_adjustments', { restaurant_id: rid }) });
    const current = bankData?.bank;

    const settings = useMutation({
        mutationFn: () => financeCall('set_payout_settings', { restaurant_id: rid, payout_schedule: schedule, ...(reservePct !== '' ? { reserve_percent: Number(reservePct) } : {}), reserve_until: reserveUntil || null }),
        onSuccess: () => { toast.success('Payout settings saved'); queryClient.invalidateQueries(['restaurants-payout']); },
        onError: (e) => toast.error(e.message),
    });
    const saveBank = useMutation({
        mutationFn: () => financeCall('save_bank_details', { restaurant_id: rid, ...bank }),
        onSuccess: (d) => {
            if (d.unchanged) toast.info('Bank details unchanged');
            else toast.success(d.held ? `Bank details changed. For safety they can't be paid to until ${new Date(d.active_from).toLocaleString('en-GB')}.` : 'Bank details saved');
            setBank({ account_name: '', sort_code: '', account_number: '' });
            refetchBank();
        },
        onError: (e) => toast.error(e.message),
    });
    const addAdj = useMutation({
        mutationFn: () => financeCall('add_adjustment', { restaurant_id: rid, type: adj.type, amount: Number(adj.amount), reason: adj.reason }),
        onSuccess: () => { toast.success('Adjustment added — it will be in the next payout'); setAdj({ type: 'manual_credit', amount: '', reason: '' }); refetchAdj(); },
        onError: (e) => toast.error(e.message),
    });
    const waive = useMutation({
        mutationFn: ({ id, reason }) => financeCall('waive_adjustment', { adjustment_id: id, reason }),
        onSuccess: () => { toast.success('Waived — MealDrop absorbs it'); refetchAdj(); },
        onError: (e) => toast.error(e.message),
    });

    return (
        <div className="mb-6 grid gap-4 rounded-lg border bg-gray-50 p-4 text-sm lg:grid-cols-3">
            <div className="space-y-2">
                <h4 className="font-semibold">Schedule & reserve</h4>
                <label className="block text-xs text-gray-600">Payout schedule</label>
                <Select value={schedule} onValueChange={setSchedule}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="manual">Manual (I generate it)</SelectItem>
                        <SelectItem value="weekly">Weekly — drafted every Monday</SelectItem>
                        <SelectItem value="monthly">Monthly — drafted on the 1st</SelectItem>
                    </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs text-gray-600">Reserve %</label>
                        <Input className="bg-white" type="number" min="0" max="50" value={reservePct} placeholder="auto" onChange={(e) => setReservePct(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-600">Hold until</label>
                        <Input className="bg-white" type="date" value={reserveUntil} onChange={(e) => setReserveUntil(e.target.value)} />
                    </div>
                </div>
                <p className="text-xs text-gray-500">New restaurants get 10% for 90 days automatically from their first payout. Held money is paid in the first payout after the date.</p>
                <Button size="sm" onClick={() => settings.mutate()} disabled={settings.isPending}>Save</Button>
            </div>

            <div className="space-y-2">
                <h4 className="font-semibold">Bank details</h4>
                {current ? (
                    <div className="rounded border bg-white p-2">
                        <p className="font-medium">{current.account_name}</p>
                        <p className="font-mono text-xs">{current.sort_code} · {current.account_number}</p>
                        {!current.usable && <p className="text-xs text-amber-700">Changed recently — usable from {new Date(current.active_from).toLocaleString('en-GB')}</p>}
                        {current.history?.length > 0 && <p className="mt-1 text-xs text-gray-500">Previously: {current.history[0].previous} (changed {format(new Date(current.history[0].changed_at), 'd MMM yyyy')} by {current.history[0].changed_by})</p>}
                    </div>
                ) : <p className="text-xs text-amber-700">No bank details — this restaurant can't be included in a bank file.</p>}
                <Input className="bg-white" placeholder="Account name" value={bank.account_name} onChange={(e) => setBank({ ...bank, account_name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                    <Input className="bg-white" placeholder="Sort code" inputMode="numeric" value={bank.sort_code} onChange={(e) => setBank({ ...bank, sort_code: e.target.value })} />
                    <Input className="bg-white" placeholder="Account number" inputMode="numeric" value={bank.account_number} onChange={(e) => setBank({ ...bank, account_number: e.target.value })} />
                </div>
                <p className="text-xs text-gray-500">Confirm any change by phone with the restaurant first. Changed details can't be paid to for 48 hours.</p>
                <Button size="sm" onClick={() => saveBank.mutate()} disabled={saveBank.isPending || !bank.account_name || !bank.sort_code || !bank.account_number}>{current ? 'Change bank details' : 'Save bank details'}</Button>
            </div>

            <div className="space-y-2">
                <h4 className="font-semibold">Adjustments</h4>
                <div className="grid grid-cols-2 gap-2">
                    <Select value={adj.type} onValueChange={(v) => setAdj({ ...adj, type: v })}>
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="manual_credit">Credit (we owe them)</SelectItem>
                            <SelectItem value="manual_debit">Debit (they owe us)</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input className="bg-white" type="number" min="0" step="0.01" placeholder="£" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
                </div>
                <Input className="bg-white" placeholder="Reason (shown on their statement)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
                <Button size="sm" onClick={() => addAdj.mutate()} disabled={addAdj.isPending || !adj.amount || !adj.reason}>Add</Button>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                    {(adjData?.adjustments || []).slice(0, 30).map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-2 rounded border bg-white px-2 py-1 text-xs">
                            <div className="min-w-0">
                                <p className="truncate">{TYPE_LABEL[a.type] || a.type}: {a.description}</p>
                                <p className="text-gray-500">{format(new Date(a.available_from || a.created_date), 'd MMM yyyy')} · {a.status === 'waived' ? 'waived' : a.settled_in_payout_id ? 'in a payout' : 'next payout'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={a.amount < 0 ? 'text-red-700' : 'text-green-700'}>{a.amount < 0 ? '−' : '+'}£{Math.abs(a.amount).toFixed(2)}</span>
                                {a.status === 'open' && !a.settled_in_payout_id && a.type !== 'reserve_release' && (
                                    <button type="button" className="text-gray-500 underline" onClick={() => { const reason = window.prompt('Waive this? MealDrop absorbs it. Reason:'); if (reason) waive.mutate({ id: a.id, reason }); }}>waive</button>
                                )}
                            </div>
                        </div>
                    ))}
                    {adjData?.adjustments?.length === 0 && <p className="text-xs text-gray-500">None yet. Card disputes from Stripe appear here automatically.</p>}
                </div>
            </div>
        </div>
    );
}
