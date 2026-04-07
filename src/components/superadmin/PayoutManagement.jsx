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
import { DollarSign, TrendingUp, CheckCircle, Clock, AlertCircle, Download, Trash2, AlertTriangle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { generatePayoutPDF } from '@/lib/payoutPDF';

export default function PayoutManagement() {
    const [selectedRestaurant, setSelectedRestaurant] = useState('');
    const [generatingFor, setGeneratingFor] = useState('');
    const [payoutDialog, setPayoutDialog] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
    const [notes, setNotes] = useState('');
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

    const generatePayoutMutation = useMutation({
        mutationFn: async (restaurantId) => {
            // Calculate period based on frequency
            const now = new Date();
            let periodStart, periodEnd;
            
            if (startDate && endDate) {
                periodStart = new Date(startDate);
                periodStart.setHours(0, 0, 0, 0);
                periodEnd = new Date(endDate);
                periodEnd.setHours(23, 59, 59, 999);
            } else if (payoutFrequency === 'daily') {
                // Yesterday (full day)
                periodStart = new Date(now);
                periodStart.setDate(periodStart.getDate() - 1);
                periodStart.setHours(0, 0, 0, 0);
                periodEnd = new Date(periodStart);
                periodEnd.setHours(23, 59, 59, 999);
            } else if (payoutFrequency === 'weekly') {
                // Last full 7 completed days (not including today)
                periodEnd = new Date(now);
                periodEnd.setDate(periodEnd.getDate() - 1);
                periodEnd.setHours(23, 59, 59, 999);
                periodStart = new Date(periodEnd);
                periodStart.setDate(periodStart.getDate() - 6);
                periodStart.setHours(0, 0, 0, 0);
            } else {
                // Monthly (last full calendar month)
                periodStart = startOfMonth(subMonths(now, 1));
                periodEnd = endOfMonth(subMonths(now, 1));
            }

            // Get restaurant details
            const restaurant = restaurants.find(r => r.id === restaurantId);
            if (!restaurant) throw new Error('Restaurant not found');

            // ✅ DUPLICATE GUARD: check if a payout already exists for this restaurant + overlapping period
            const existingPayouts = await base44.entities.Payout.filter({ restaurant_id: restaurantId });
            const duplicate = existingPayouts.find(p => {
                const existStart = new Date(p.period_start);
                const existEnd = new Date(p.period_end);
                // Overlap check: new period overlaps existing if not (new ends before existing starts OR new starts after existing ends)
                return !(periodEnd < existStart || periodStart > existEnd);
            });
            if (duplicate) {
                throw new Error(`A payout already exists for this restaurant covering ${new Date(duplicate.period_start).toLocaleDateString()} – ${new Date(duplicate.period_end).toLocaleDateString()}. Void it first or choose a different period.`);
            }
            
            // Fetch ALL online orders for this specific restaurant (server-filtered by restaurant_id)
            // Use a high limit to avoid pagination truncation on busy restaurants
            const allRestaurantOrders = await base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 5000);
            
            // ONLY count fully completed orders — this matches what the restaurant sees in their order history.
            // Counting in-progress orders (confirmed/preparing/out_for_delivery) would inflate the payout count.
            const completedStatuses = new Set(['delivered', 'collected']);
            // Excluded sources: POS, kiosk, and third_party orders are NOT included in online platform payouts.
            // Also exclude null/undefined order_source only if order_source is explicitly pos/kiosk/third_party.
            // Orders with no order_source (legacy online orders) default to online.
            const excludedSources = new Set(['pos', 'kiosk', 'third_party']);

            const periodOrders = allRestaurantOrders.filter(order => {
                const orderDate = new Date(order.created_date);
                const isCompleted = completedStatuses.has(order.status);
                const isOnlineOrder = !excludedSources.has(order.order_source);
                return orderDate >= periodStart && orderDate <= periodEnd 
                    && isCompleted
                    && isOnlineOrder;
            });

            // Calculate totals — split cash vs card, and by order type
            let grossEarnings = 0;
            let cashPaymentAmount = 0;   // cash / pay_at_counter collected directly by restaurant
            let cardPaymentAmount = 0;   // card/apple_pay/google_pay confirmed by platform
            let deliveryOrders = 0;
            let collectionOrders = 0;
            let dineInOrders = 0;
            let deliveryEarnings = 0;
            let collectionEarnings = 0;
            let dineInEarnings = 0;

            // Payment methods the platform collects money for (card-based)
            const cardMethods = new Set(['card', 'apple_pay', 'google_pay']);
            // Payment statuses that confirm the platform actually received the card payment
            const confirmedPaymentStatuses = new Set(['payment_confirmed', 'paid_card']);

            periodOrders.forEach(order => {
                const orderTotal = order.total || 0;
                grossEarnings += orderTotal;

                const method = order.payment_method;
                const payStatus = order.payment_status;

                if (method === 'cash' || method === 'pay_at_counter') {
                    // Cash / pay-at-counter: restaurant collects directly, never held by platform
                    cashPaymentAmount += orderTotal;
                } else if (cardMethods.has(method)) {
                    // Card-based: only count as platform-held if payment was confirmed
                    // (guards against delivered orders with failed/pending payment edge cases)
                    if (confirmedPaymentStatuses.has(payStatus) || !payStatus) {
                        // No payStatus = legacy order, assume confirmed
                        cardPaymentAmount += orderTotal;
                    } else {
                        // Failed/pending card payment on a delivered order — treat as cash debt
                        cashPaymentAmount += orderTotal;
                    }
                } else {
                    // Unknown method — conservative: treat as cash (platform didn't hold it)
                    cashPaymentAmount += orderTotal;
                }

                // Order type breakdown
                const orderType = order.order_type || 'delivery';
                if (orderType === 'delivery') {
                    deliveryOrders++;
                    deliveryEarnings += orderTotal;
                } else if (orderType === 'collection' || orderType === 'takeaway') {
                    collectionOrders++;
                    collectionEarnings += orderTotal;
                } else if (orderType === 'dine_in') {
                    dineInOrders++;
                    dineInEarnings += orderTotal;
                }
            });

            // Commission is charged on GROSS earnings (all completed online orders)
            let platformCommission = 0;
            const commissionRate = restaurant.commission_rate || 15;
            if (restaurant.commission_type === 'fixed') {
                platformCommission = restaurant.fixed_commission_amount || 0;
            } else {
                platformCommission = grossEarnings * (commissionRate / 100);
            }

            // Refunds in this period — online completed orders only (same source filter as above)
            const refundedOrders = allRestaurantOrders.filter(order => {
                const orderDate = new Date(order.created_date);
                return orderDate >= periodStart && orderDate <= periodEnd 
                    && order.status === 'refunded'
                    && !excludedSources.has(order.order_source);
            });

            const refundsPaidByRestaurant = refundedOrders
                .filter(o => o.refund_paid_by === 'restaurant')
                .reduce((sum, o) => sum + (o.refund_amount || 0), 0);

            const refundsPaidByPlatform = refundedOrders
                .filter(o => o.refund_paid_by === 'platform')
                .reduce((sum, o) => sum + (o.refund_amount || 0), 0);

            // Net payout = card payments held by platform, minus commission on gross, minus restaurant-borne refunds
            // Commission on cash orders creates a debt owed to the platform (restaurant collected that cash directly)
            const cashCommission = cashPaymentAmount * (commissionRate / 100);
            const cardCommission = cardPaymentAmount * (commissionRate / 100);
            // For fixed commission, split proportionally between cash and card
            const cashCommissionDebt = restaurant.commission_type === 'fixed'
                ? (grossEarnings > 0 ? platformCommission * (cashPaymentAmount / grossEarnings) : 0)
                : cashCommission;

            let netPayout = cardPaymentAmount - platformCommission - refundsPaidByRestaurant;
            const finalNetPayout = Math.max(0, netPayout);

            // Audit log in browser console for verification
            console.log(`[Payout Audit] ==========================================`);
            console.log(`[Payout Audit] Restaurant: ${restaurant.name}`);
            console.log(`[Payout Audit] Period: ${periodStart.toLocaleDateString()} → ${periodEnd.toLocaleDateString()}`);
            console.log(`[Payout Audit] All orders fetched for restaurant: ${allRestaurantOrders.length}`);
            console.log(`[Payout Audit] In-period online COMPLETED orders (delivered/collected): ${periodOrders.length}`);
            const inPeriodAll = allRestaurantOrders.filter(o => new Date(o.created_date) >= periodStart && new Date(o.created_date) <= periodEnd);
            console.log(`[Payout Audit] In-period ALL orders (any status/source): ${inPeriodAll.length}`);
            console.log(`[Payout Audit]   ↳ Excluded POS/kiosk/third_party: ${inPeriodAll.filter(o => excludedSources.has(o.order_source)).length}`);
            console.log(`[Payout Audit]   ↳ Excluded not-completed (confirmed/preparing/etc): ${inPeriodAll.filter(o => !completedStatuses.has(o.status) && o.status !== 'refunded' && !excludedSources.has(o.order_source)).length}`);
            console.log(`[Payout Audit]   ↳ Refunded online orders: ${refundedOrders.length}`);
            console.log(`[Payout Audit] Gross: £${grossEarnings.toFixed(2)} | Card: £${cardPaymentAmount.toFixed(2)} | Cash: £${cashPaymentAmount.toFixed(2)}`);
            console.log(`[Payout Audit] Commission (${commissionRate}%): £${platformCommission.toFixed(2)} | Cash commission debt: £${cashCommissionDebt.toFixed(2)}`);
            console.log(`[Payout Audit] Net payout: £${finalNetPayout.toFixed(2)}`);
            console.log(`[Payout Audit] ==========================================`);

            const commissionDebtNote = cashCommissionDebt > 0.01
                ? `ℹ️ Cash order commission debt: £${cashCommissionDebt.toFixed(2)} (commission on £${cashPaymentAmount.toFixed(2)} cash orders collected directly by restaurant).`
                : '';
            const overdraftNote = netPayout < 0
                ? `⚠️ Commission exceeded card payments by £${Math.abs(netPayout).toFixed(2)}. Payout floored to £0.`
                : '';

            const finalNotes = [commissionDebtNote, overdraftNote].filter(Boolean).join('\n') || undefined;

            return base44.entities.Payout.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurant.name,
                period_start: periodStart.toISOString(),
                period_end: periodEnd.toISOString(),
                payout_frequency: payoutFrequency,
                total_orders: periodOrders.length,
                delivery_orders: deliveryOrders,
                collection_orders: collectionOrders,
                dine_in_orders: dineInOrders,
                gross_earnings: grossEarnings,
                delivery_earnings: deliveryEarnings,
                collection_earnings: collectionEarnings,
                cash_payment_amount: cashPaymentAmount,
                card_payment_amount: cardPaymentAmount,
                platform_commission: platformCommission,
                commission_rate: commissionRate,
                commission_type: restaurant.commission_type || 'percentage',
                refunds_paid_by_platform: refundsPaidByPlatform,
                refunds_paid_by_restaurant: refundsPaidByRestaurant,
                net_payout: finalNetPayout,
                status: 'pending',
                notes: finalNotes,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['payouts']);
            toast.success('Payout generated successfully');
            setGeneratingFor(null);
        },
        onError: (err) => {
            toast.error(err?.message || 'Failed to generate payout');
            setGeneratingFor(null);
        }
    });

    const voidPayoutMutation = useMutation({
        mutationFn: (payoutId) => base44.entities.Payout.delete(payoutId),
        onSuccess: () => {
            queryClient.invalidateQueries(['payouts']);
            toast.success('Payout voided and deleted');
        },
        onError: () => toast.error('Failed to void payout'),
    });

    const markPaidMutation = useMutation({
        mutationFn: ({ payoutId }) => 
            base44.entities.Payout.update(payoutId, {
                status: 'paid',
                paid_date: new Date().toISOString(),
                payment_method: paymentMethod,
                notes: notes
            }),
        onSuccess: () => {
            queryClient.invalidateQueries(['payouts']);
            toast.success('Payout marked as paid');
            setPayoutDialog(null);
            setPaymentMethod('bank_transfer');
            setNotes('');
        },
    });

    const statusConfig = {
        pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
        processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: TrendingUp },
        paid: { label: 'Paid', color: 'bg-green-100 text-green-800', icon: CheckCircle },
        failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: AlertCircle },
    };

    const totalPending = payouts
        .filter(p => p.status === 'pending')
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
                                    £{payouts.length > 0 ? ((totalPaid + totalPending) / payouts.length).toFixed(2) : '0.00'}
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
                                <Select value={generatingFor || ''} onValueChange={setGeneratingFor}>
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
                                <Select value={payoutFrequency} onValueChange={setPayoutFrequency}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="daily">Daily (Yesterday)</SelectItem>
                                        <SelectItem value="weekly">Weekly (Last 7 Days)</SelectItem>
                                        <SelectItem value="monthly">Monthly (Last Month)</SelectItem>
                                        <SelectItem value="custom">Custom Range</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        {payoutFrequency === 'custom' && (
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="text-sm font-medium text-blue-900 mb-1 block">Start Date</label>
                                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-blue-900 mb-1 block">End Date</label>
                                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                                </div>
                            </div>
                        )}
                        
                        <Button
                            onClick={() => generatingFor && generatePayoutMutation.mutate(generatingFor)}
                            disabled={!generatingFor || generatePayoutMutation.isPending || (payoutFrequency === 'custom' && (!startDate || !endDate))}
                            className="bg-blue-600 hover:bg-blue-700 w-full"
                        >
                            <DollarSign className="h-4 w-4 mr-2" />
                            Generate Payout
                        </Button>
                    </div>

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

                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                                             <div className="bg-gray-50 p-2 rounded">
                                                 <p className="text-xs text-gray-600">Gross</p>
                                                 <p className="font-semibold">£{payout.gross_earnings?.toFixed(2)}</p>
                                             </div>
                                             <div className="bg-gray-50 p-2 rounded">
                                                 <p className="text-xs text-gray-600">Cash</p>
                                                 <p className="font-semibold">£{payout.cash_payment_amount?.toFixed(2)}</p>
                                             </div>
                                             <div className="bg-gray-50 p-2 rounded">
                                                 <p className="text-xs text-gray-600">Card</p>
                                                 <p className="font-semibold">£{payout.card_payment_amount?.toFixed(2)}</p>
                                             </div>
                                             <div className="bg-gray-50 p-2 rounded">
                                                 <p className="text-xs text-gray-600">Commission</p>
                                                 <p className="font-semibold text-orange-600">-£{payout.platform_commission?.toFixed(2)}</p>
                                             </div>
                                             <div className="bg-green-50 p-2 rounded border border-green-200">
                                                 <p className="text-xs text-green-700">Payout</p>
                                                 <p className="font-bold text-green-700">£{payout.net_payout?.toFixed(2)}</p>
                                             </div>
                                         </div>

                                        {(payout.refunds_paid_by_restaurant > 0 || payout.refunds_paid_by_platform > 0) && (
                                            <div className="text-xs text-gray-600 mb-3 space-y-1">
                                                {payout.refunds_paid_by_restaurant > 0 && (
                                                    <p>Refunds deducted: £{payout.refunds_paid_by_restaurant.toFixed(2)}</p>
                                                )}
                                                {payout.refunds_paid_by_platform > 0 && (
                                                    <p>Platform-covered refunds: £{payout.refunds_paid_by_platform.toFixed(2)}</p>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2">
                                            {payout.status === 'pending' && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => setPayoutDialog(payout)}
                                                        className="bg-green-600 hover:bg-green-700"
                                                    >
                                                        <CheckCircle className="h-4 w-4 mr-2" />
                                                        Mark as Paid
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-red-600 border-red-200 hover:bg-red-50"
                                                        onClick={() => {
                                                            if (window.confirm(`Void and delete this payout for ${payout.restaurant_name}? This cannot be undone.`)) {
                                                                voidPayoutMutation.mutate(payout.id);
                                                            }
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