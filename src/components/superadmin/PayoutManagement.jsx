import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DollarSign, TrendingUp, CheckCircle, Clock, AlertCircle, Download, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { generatePayoutPDF } from '@/lib/payoutPDF';
import PayoutBatchBar from './PayoutBatchBar';
import PayoutRestaurantSettings from './PayoutRestaurantSettings';

// Finance company whose books payouts are posted to.
const MEALDROP_FINANCE_COMPANY_ID = '6adb27b5c246acfa7f3c9b9a';

export default function PayoutManagement() {
    const [selectedRestaurant, setSelectedRestaurant] = useState('');
    const [generatingFor, setGeneratingFor] = useState('');
    const [payoutDialog, setPayoutDialog] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
    const [notes, setNotes] = useState('');
    const [transactionRef, setTransactionRef] = useState('');
    const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [payoutFrequency, setPayoutFrequency] = useState('weekly');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const queryClient = useQueryClient();

    const { data: restaurants = [], isLoading: loadingRestaurants } = useQuery({
        queryKey: ['restaurants-payout'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: payouts = [], isLoading } = useQuery({
        queryKey: ['payouts', selectedRestaurant],
        queryFn: () => {
            if (selectedRestaurant) {
                return base44.entities.Payout.filter({ 
                    restaurant_id: selectedRestaurant 
                }, '-created_date');
            }
            return base44.entities.Payout.list('-created_date', 50);
        },
        refetchInterval: 10000,
    });

    const financeCall = async (action, payload) => {
        const res = await base44.functions.invoke('finance-operations', { action, company_id: MEALDROP_FINANCE_COMPANY_ID, ...payload })
            .catch((e) => { throw new Error(e?.response?.data?.error || e?.message || 'Request failed'); });
        const data = res?.data ?? res;
        if (!data?.success) throw new Error(data?.error || 'Request failed');
        return data;
    };

    // The payout is calculated on the server (finance-operations): continuous periods,
    // late orders, refunds and carried-forward balances are all handled there.
    const payoutBody = () => ({
        restaurant_id: generatingFor,
        frequency: payoutFrequency,
        ...(payoutFrequency === 'custom' ? { end_date: endDate } : {}),
        ...(startDate ? { start_date: startDate } : {}),
    });
    const [preview, setPreview] = useState(null);
    const previewMutation = useMutation({
        mutationFn: () => financeCall('preview_payout', payoutBody()),
        onSuccess: (data) => setPreview(data.preview),
        onError: (e) => { setPreview(null); toast.error(e.message || 'Could not calculate payout'); },
    });
    const generatePayoutMutation = useMutation({
        mutationFn: () => financeCall('generate_payout', payoutBody()),
        onSuccess: () => {
            queryClient.invalidateQueries(['payouts']);
            toast.success('Payout generated');
            setPreview(null);
            setGeneratingFor('');
        },
        onError: (e) => toast.error(e.message || 'Failed to generate payout'),
    });

    // Everything waiting for approval, payment or bank confirmation — not just the latest 50.
    const { data: openPayouts = [] } = useQuery({
        queryKey: ['payouts', 'open'],
        queryFn: () => base44.entities.Payout.filter({ status: { $in: ['awaiting_approval', 'pending', 'processing'] } }, '-created_date', 500),
        refetchInterval: 15000,
    });
    const drafts = openPayouts.filter((p) => p.status === 'awaiting_approval');

    const approveMutation = useMutation({
        mutationFn: (payoutId) => financeCall('approve_payout', { payout_id: payoutId }),
        onSuccess: () => { queryClient.invalidateQueries(['payouts']); toast.success('Approved — ready to pay'); },
        onError: (e) => toast.error(e.message || 'Could not approve'),
    });

    const voidPayoutMutation = useMutation({
        mutationFn: ({ payoutId, reason }) => financeCall('void_payout', { payout_id: payoutId, reason }),
        onSuccess: () => {
            queryClient.invalidateQueries(['payouts']);
            toast.success('Payout voided (kept in history)');
        },
        onError: (e) => toast.error(e.message || 'Failed to void payout'),
    });

    const markPaidMutation = useMutation({
        mutationFn: ({ payoutId }) => financeCall('mark_payout_paid', {
            payout_id: payoutId, payment_method: paymentMethod, paid_date: paidDate,
            transaction_reference: transactionRef, notes,
        }),
        onSuccess: (data) => {
            queryClient.invalidateQueries(['payouts']);
            if (data.posting_error) toast.warning(`Marked paid, but not posted to the books: ${data.posting_error}`);
            else toast.success(data.posted ? 'Payout marked as paid and posted to the books' : 'Payout marked as paid');
            setPayoutDialog(null);
            setPaymentMethod('bank_transfer');
            setNotes('');
            setTransactionRef('');
        },
        onError: (e) => toast.error(e.message || 'Could not mark payout paid'),
    });

    const statusConfig = {
        awaiting_approval: { label: 'Draft — needs approval', color: 'bg-purple-100 text-purple-800', icon: Clock },
        pending: { label: 'Approved — to pay', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
        processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: TrendingUp },
        paid: { label: 'Paid', color: 'bg-green-100 text-green-800', icon: CheckCircle },
        failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: AlertCircle },
        voided: { label: 'Voided', color: 'bg-gray-100 text-gray-500', icon: AlertCircle },
    };

    const totalPending = payouts
        .filter(p => ['pending', 'processing'].includes(p.status))
        .reduce((sum, p) => sum + (p.net_payout || 0), 0);

    const totalPaid = payouts
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + (p.net_payout || 0), 0);

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                                <Clock className="h-5 w-5 text-yellow-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Pending Payouts</p>
                                <p className="text-2xl font-bold text-gray-900">£{totalPending.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <CheckCircle className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Paid Out</p>
                                <p className="text-2xl font-bold text-gray-900">£{totalPaid.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Avg Payout</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {(() => { const live = payouts.filter(p => !['voided', 'failed'].includes(p.status)); return `£${live.length > 0 ? ((totalPaid + totalPending) / live.length).toFixed(2) : '0.00'}`; })()}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-green-500" />
                            Restaurant Payouts
                        </CardTitle>
                        <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                            <SelectTrigger className="w-64">
                                <SelectValue placeholder="Filter by restaurant" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={null}>All Restaurants</SelectItem>
                                {loadingRestaurants ? (
                                    <SelectItem value="loading" disabled>Loading...</SelectItem>
                                ) : restaurants && restaurants.length > 0 ? (
                                    restaurants.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))
                                ) : (
                                    <SelectItem value="empty" disabled>No restaurants found</SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Generate Payout Section */}
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h3 className="font-semibold text-blue-900 mb-3">Generate New Payout</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-sm font-medium text-blue-900 mb-1 block">Restaurant</label>
                                <Select value={generatingFor || ''} onValueChange={(v) => { setGeneratingFor(v); setPreview(null); }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select restaurant" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {loadingRestaurants ? (
                                            <SelectItem value="loading" disabled>Loading...</SelectItem>
                                        ) : restaurants && restaurants.length > 0 ? (
                                            restaurants.map(r => (
                                                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                            ))
                                        ) : (
                                            <SelectItem value="empty" disabled>No restaurants found</SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-blue-900 mb-1 block">Payout Frequency</label>
                                <Select value={payoutFrequency} onValueChange={(v) => { setPayoutFrequency(v); setStartDate(''); setEndDate(''); setPreview(null); }}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="daily">Daily (up to yesterday)</SelectItem>
                                        <SelectItem value="weekly">Weekly (up to last Sunday)</SelectItem>
                                        <SelectItem value="monthly">Monthly (up to end of last month)</SelectItem>
                                        <SelectItem value="custom">Custom end date</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        <p className="text-xs text-blue-800 mb-3">Each payout starts exactly where the restaurant's last one ended, so no days are missed or paid twice. Orders finished late, and refunds or balances owed, are carried into the next payout automatically.</p>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            {payoutFrequency === 'custom' && (
                                <div>
                                    <label className="text-sm font-medium text-blue-900 mb-1 block">End date</label>
                                    <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPreview(null); }} />
                                </div>
                            )}
                            <div>
                                <label className="text-sm font-medium text-blue-900 mb-1 block">Start date <span className="font-normal">(first payout only)</span></label>
                                <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPreview(null); }} />
                            </div>
                        </div>

                        {preview && (
                            <div className="mb-4 rounded-lg border border-blue-300 bg-white p-3 text-sm">
                                <p className="font-semibold">{preview.restaurant_name}: {format(new Date(preview.period_start), 'd MMM yyyy')} – {format(new Date(preview.period_end), 'd MMM yyyy')}</p>
                                <div className="mt-2 space-y-1">
                                    <div className="flex justify-between"><span>Card takings held by MealDrop ({preview.total_orders} orders{preview.late_orders ? `, ${preview.late_orders} late` : ''})</span><span>£{preview.card_payment_amount.toFixed(2)}</span></div>
                                    <div className="flex justify-between text-gray-500"><span>Cash already collected by restaurant</span><span>£{preview.cash_payment_amount.toFixed(2)}</span></div>
                                    <div className="flex justify-between text-orange-700"><span>Commission {preview.commission_type === 'fixed' ? `(fixed, ${preview.commission_months} month${preview.commission_months === 1 ? '' : 's'})` : `(${preview.commission_rate}% of £${preview.gross_earnings.toFixed(2)})`}</span><span>−£{preview.platform_commission.toFixed(2)}</span></div>
                                    {preview.refunds_paid_by_restaurant > 0 && <div className="flex justify-between text-red-700"><span>Refunds on earlier orders</span><span>−£{preview.refunds_paid_by_restaurant.toFixed(2)}</span></div>}
                                    {preview.brought_forward_amount > 0 && <div className="flex justify-between text-red-700"><span>Brought forward from last payout</span><span>−£{preview.brought_forward_amount.toFixed(2)}</span></div>}
                                    <div className="flex justify-between border-t pt-1 font-bold text-green-700"><span>Net payout</span><span>£{preview.net_payout.toFixed(2)}</span></div>
                                    {preview.shortfall_amount > 0 && <p className="text-xs text-red-700">Restaurant owes £{preview.shortfall_amount.toFixed(2)} — carried into the next payout.</p>}
                                    {preview.notes && <p className="text-xs text-gray-500 pt-1">{preview.notes.split(' | ').join(' · ')}</p>}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => previewMutation.mutate()}
                                disabled={!generatingFor || previewMutation.isPending || (payoutFrequency === 'custom' && !endDate)}
                                className="flex-1"
                            >
                                {previewMutation.isPending ? 'Calculating…' : 'Preview'}
                            </Button>
                            <Button
                                onClick={() => generatePayoutMutation.mutate()}
                                disabled={!preview || generatePayoutMutation.isPending}
                                className="bg-blue-600 hover:bg-blue-700 flex-1"
                            >
                                <DollarSign className="h-4 w-4 mr-2" />
                                {generatePayoutMutation.isPending ? 'Generating…' : 'Generate Payout'}
                            </Button>
                        </div>
                    </div>

                    {drafts.length > 0 && (
                        <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
                            <p className="mb-2 font-semibold text-purple-900">{drafts.length} scheduled draft(s) waiting for your approval</p>
                            {drafts.map((d) => (
                                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-purple-200 py-2">
                                    <span>{d.restaurant_name}: {format(new Date(d.period_start), 'd MMM')} – {format(new Date(d.period_end), 'd MMM yyyy')} · <strong>£{d.net_payout?.toFixed(2)}</strong>{d.notes ? <span className="block text-xs text-gray-600">{d.notes.split(' | ').join(' · ')}</span> : null}</span>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => generatePayoutPDF(d)}><Download className="h-4 w-4" /></Button>
                                        <Button size="sm" className="bg-purple-700 hover:bg-purple-800" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(d.id)}>Approve</Button>
                                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => { const reason = window.prompt(`Void this draft for ${d.restaurant_name}? Reason:`); if (reason) voidPayoutMutation.mutate({ payoutId: d.id, reason }); }}>Void</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <PayoutBatchBar payouts={openPayouts} financeCall={financeCall} />

                    {selectedRestaurant && restaurants.find((r) => r.id === selectedRestaurant) && (
                        <PayoutRestaurantSettings restaurant={restaurants.find((r) => r.id === selectedRestaurant)} financeCall={financeCall} />
                    )}

                    {/* Payouts List */}
                    {isLoading ? (
                        <p className="text-center text-gray-500 py-8">Loading...</p>
                    ) : payouts.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No payouts generated yet</p>
                    ) : (
                        <div className="space-y-3">
                            {payouts.map((payout) => {
                                const StatusIcon = statusConfig[payout.status]?.icon || Clock;
                                return (
                                    <div key={payout.id} className="border rounded-lg p-4">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <h3 className="font-semibold text-lg">{payout.restaurant_name}</h3>
                                                <p className="text-sm text-gray-600">
                                                    {format(new Date(payout.period_start), 'MMM d')} - {format(new Date(payout.period_end), 'MMM d, yyyy')}
                                                </p>
                                                {payout.payout_frequency && (
                                                    <Badge variant="outline" className="mt-1">
                                                        {payout.payout_frequency}
                                                    </Badge>
                                                )}
                                            </div>
                                            <Badge className={statusConfig[payout.status]?.color}>
                                                <StatusIcon className="h-3 w-3 mr-1" />
                                                {statusConfig[payout.status]?.label}
                                            </Badge>
                                        </div>

                                        {/* Order Counts Row */}
                                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
                                            <div className="bg-blue-50 p-2 rounded text-center">
                                                <p className="text-xs text-blue-600">Orders</p>
                                                <p className="font-bold text-blue-800">{payout.total_orders ?? 0}</p>
                                                <p className="text-xs font-medium text-blue-700">£{payout.gross_earnings?.toFixed(2)}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 rounded text-center">
                                                <p className="text-xs text-gray-500">Cancelled</p>
                                                <p className="font-semibold text-gray-600">{payout.cancelled_orders ?? 0}</p>
                                                <p className="text-xs text-gray-400">£{(payout.cancelled_orders_value ?? 0).toFixed(2)}</p>
                                            </div>
                                            <div className="bg-red-50 p-2 rounded text-center">
                                                <p className="text-xs text-red-500">Refunded</p>
                                                <p className="font-semibold text-red-600">{payout.refunded_orders_count ?? 0}</p>
                                                <p className="text-xs font-medium text-red-500">{(payout.refunds_paid_by_restaurant ?? 0) > 0 ? `-£${payout.refunds_paid_by_restaurant.toFixed(2)}` : '—'}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 rounded text-center">
                                                <p className="text-xs text-gray-500">Delivery</p>
                                                <p className="font-semibold">{payout.delivery_orders ?? 0}</p>
                                                <p className="text-xs text-gray-500">£{(payout.delivery_earnings ?? 0).toFixed(2)}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 rounded text-center">
                                                <p className="text-xs text-gray-500">Collection</p>
                                                <p className="font-semibold">{payout.collection_orders ?? 0}</p>
                                                <p className="text-xs text-gray-500">£{(payout.collection_earnings ?? 0).toFixed(2)}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 rounded text-center">
                                                <p className="text-xs text-gray-500">Dine-In</p>
                                                <p className="font-semibold">{payout.dine_in_orders ?? 0}</p>
                                                <p className="text-xs text-gray-500">£{Math.max(0, (payout.gross_earnings ?? 0) - (payout.delivery_earnings ?? 0) - (payout.collection_earnings ?? 0)).toFixed(2)}</p>
                                            </div>
                                        </div>

                                        {/* Financial Row */}
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                                             <div className="bg-gray-50 p-2 rounded">
                                                 <p className="text-xs text-gray-600">Gross Earnings</p>
                                                 <p className="font-semibold">£{payout.gross_earnings?.toFixed(2)}</p>
                                             </div>
                                             <div className="bg-gray-50 p-2 rounded">
                                                 <p className="text-xs text-gray-600">Cash (by restaurant)</p>
                                                 <p className="font-semibold">£{payout.cash_payment_amount?.toFixed(2)}</p>
                                             </div>
                                             <div className="bg-gray-50 p-2 rounded">
                                                 <p className="text-xs text-gray-600">Card (held by platform)</p>
                                                 <p className="font-semibold">£{payout.card_payment_amount?.toFixed(2)}</p>
                                             </div>
                                             <div className="bg-orange-50 p-2 rounded">
                                                 <p className="text-xs text-orange-600">Commission ({payout.commission_rate ?? 0}%)</p>
                                                 <p className="font-semibold text-orange-600">-£{payout.platform_commission?.toFixed(2)}</p>
                                             </div>
                                             <div className="bg-green-50 p-2 rounded border border-green-200">
                                                 <p className="text-xs text-green-700">Net Payout</p>
                                                 <p className="font-bold text-green-700">£{payout.net_payout?.toFixed(2)}</p>
                                             </div>
                                         </div>

                                        {(payout.refunds_paid_by_restaurant > 0 || payout.refunds_paid_by_platform > 0) && (
                                            <div className="flex gap-3 text-xs mb-3 flex-wrap">
                                                {payout.refunds_paid_by_restaurant > 0 && (
                                                    <span className="bg-red-50 text-red-700 px-2 py-1 rounded">Restaurant refunds deducted: -£{payout.refunds_paid_by_restaurant.toFixed(2)}</span>
                                                )}
                                                {payout.refunds_paid_by_platform > 0 && (
                                                    <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded">Refunds covered by MealDrop (not deducted): £{payout.refunds_paid_by_platform.toFixed(2)}</span>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2">
                                            {payout.status === 'awaiting_approval' && (
                                                <Button size="sm" className="bg-purple-700 hover:bg-purple-800" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(payout.id)}>
                                                    <CheckCircle className="h-4 w-4 mr-2" />
                                                    Approve
                                                </Button>
                                            )}
                                            {['awaiting_approval', 'pending'].includes(payout.status) && (
                                                <>
                                                    {payout.status === 'pending' && <Button
                                                        size="sm"
                                                        onClick={() => setPayoutDialog(payout)}
                                                        className="bg-green-600 hover:bg-green-700"
                                                    >
                                                        <CheckCircle className="h-4 w-4 mr-2" />
                                                        Mark as Paid
                                                    </Button>}
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-red-600 border-red-200 hover:bg-red-50"
                                                        onClick={() => {
                                                            const reason = window.prompt(`Void this payout for ${payout.restaurant_name}? It stays in history marked void. Reason:`);
                                                            if (reason) voidPayoutMutation.mutate({ payoutId: payout.id, reason });
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Void
                                                    </Button>
                                                </>
                                            )}

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => generatePayoutPDF(payout)}
                                            >
                                                <Download className="h-4 w-4 mr-2" />
                                                Download PDF
                                            </Button>
                                        </div>

                                        {payout.status === 'paid' && payout.paid_date && (
                                            <p className="text-xs text-green-600 mt-2">
                                                Paid on {format(new Date(payout.paid_date), 'MMM d, yyyy')}
                                                {payout.payment_method && ` via ${payout.payment_method}`}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Mark Paid Dialog */}
            <Dialog open={!!payoutDialog} onOpenChange={() => setPayoutDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark Payout as Paid</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-gray-600">Restaurant:</span>
                                    <p className="font-medium">{payoutDialog?.restaurant_name}</p>
                                </div>
                                <div>
                                    <span className="text-gray-600">Period:</span>
                                    <p className="font-medium">
                                        {payoutDialog?.period_start && format(new Date(payoutDialog.period_start), 'MMM d')} - 
                                        {payoutDialog?.period_end && format(new Date(payoutDialog.period_end), 'MMM d, yyyy')}
                                    </p>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-gray-600">Amount to Pay:</span>
                                    <p className="text-2xl font-bold text-green-600">
                                        £{payoutDialog?.net_payout?.toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Payment Method</label>
                            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                    <SelectItem value="paypal">PayPal</SelectItem>
                                    <SelectItem value="stripe">Stripe</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Date paid</label>
                                <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Bank reference</label>
                                <input value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="e.g. MD-TILB-OCT" className="w-full rounded-md border px-3 py-2 text-sm" />
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Notes (Optional)</label>
                            <Textarea
                                placeholder="Add any notes about this payment..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPayoutDialog(null)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => markPaidMutation.mutate({ payoutId: payoutDialog.id })}
                            disabled={markPaidMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Confirm Payment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}