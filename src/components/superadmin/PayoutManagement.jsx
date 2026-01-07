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
import { DollarSign, TrendingUp, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';

export default function PayoutManagement() {
    const [selectedRestaurant, setSelectedRestaurant] = useState('');
    const [generatingFor, setGeneratingFor] = useState(null);
    const [payoutDialog, setPayoutDialog] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
    const [notes, setNotes] = useState('');
    const queryClient = useQueryClient();

    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.asServiceRole.entities.Restaurant.list(),
    });

    const { data: payouts = [], isLoading } = useQuery({
        queryKey: ['payouts', selectedRestaurant],
        queryFn: () => {
            if (selectedRestaurant) {
                return base44.asServiceRole.entities.Payout.filter({ 
                    restaurant_id: selectedRestaurant 
                }, '-created_date');
            }
            return base44.asServiceRole.entities.Payout.list('-created_date', 50);
        },
        refetchInterval: 10000,
    });

    const generatePayoutMutation = useMutation({
        mutationFn: async (restaurantId) => {
            // Calculate last month's period
            const now = new Date();
            const periodStart = startOfMonth(subMonths(now, 1));
            const periodEnd = endOfMonth(subMonths(now, 1));

            // Get restaurant details
            const restaurant = restaurants.find(r => r.id === restaurantId);
            
            // Get all completed orders in period
            const orders = await base44.asServiceRole.entities.Order.filter({
                restaurant_id: restaurantId,
                status: ['delivered', 'collected', 'refunded']
            });

            const periodOrders = orders.filter(order => {
                const orderDate = new Date(order.created_date);
                return orderDate >= periodStart && orderDate <= periodEnd;
            });

            // Calculate totals
            const grossEarnings = periodOrders
                .filter(o => ['delivered', 'collected'].includes(o.status))
                .reduce((sum, order) => sum + (order.total || 0), 0);

            const commissionRate = (restaurant.commission_rate || 15) / 100;
            const platformCommission = grossEarnings * commissionRate;

            const refundsPaidByRestaurant = periodOrders
                .filter(o => o.status === 'refunded' && o.refund_paid_by === 'restaurant')
                .reduce((sum, order) => sum + (order.refund_amount || 0), 0);

            const refundsPaidByPlatform = periodOrders
                .filter(o => o.status === 'refunded' && o.refund_paid_by === 'platform')
                .reduce((sum, order) => sum + (order.refund_amount || 0), 0);

            const netPayout = grossEarnings - platformCommission - refundsPaidByRestaurant;

            // Create payout record
            return base44.asServiceRole.entities.Payout.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurant.name,
                period_start: periodStart.toISOString(),
                period_end: periodEnd.toISOString(),
                total_orders: periodOrders.length,
                gross_earnings: grossEarnings,
                platform_commission: platformCommission,
                refunds_paid_by_platform: refundsPaidByPlatform,
                refunds_paid_by_restaurant: refundsPaidByRestaurant,
                net_payout: netPayout,
                status: 'pending'
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['payouts']);
            toast.success('Payout generated successfully');
            setGeneratingFor(null);
        },
        onError: () => {
            toast.error('Failed to generate payout');
            setGeneratingFor(null);
        }
    });

    const markPaidMutation = useMutation({
        mutationFn: ({ payoutId }) => 
            base44.asServiceRole.entities.Payout.update(payoutId, {
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
                                {restaurants.map(r => (
                                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Generate Payout Section */}
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h3 className="font-semibold text-blue-900 mb-2">Generate New Payout</h3>
                        <p className="text-sm text-blue-700 mb-3">
                            Generate payout for last month's completed orders
                        </p>
                        <div className="flex gap-2">
                            <Select 
                                value={generatingFor || ''} 
                                onValueChange={setGeneratingFor}
                            >
                                <SelectTrigger className="w-64">
                                    <SelectValue placeholder="Select restaurant" />
                                </SelectTrigger>
                                <SelectContent>
                                    {restaurants.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                onClick={() => generatingFor && generatePayoutMutation.mutate(generatingFor)}
                                disabled={!generatingFor || generatePayoutMutation.isPending}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                Generate Payout
                            </Button>
                        </div>
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
                                            </div>
                                            <Badge className={statusConfig[payout.status]?.color}>
                                                <StatusIcon className="h-3 w-3 mr-1" />
                                                {statusConfig[payout.status]?.label}
                                            </Badge>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                            <div className="bg-gray-50 p-2 rounded">
                                                <p className="text-xs text-gray-600">Orders</p>
                                                <p className="font-semibold">{payout.total_orders}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 rounded">
                                                <p className="text-xs text-gray-600">Gross Earnings</p>
                                                <p className="font-semibold">£{payout.gross_earnings?.toFixed(2)}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 rounded">
                                                <p className="text-xs text-gray-600">Commission</p>
                                                <p className="font-semibold text-orange-600">-£{payout.platform_commission?.toFixed(2)}</p>
                                            </div>
                                            <div className="bg-green-50 p-2 rounded border border-green-200">
                                                <p className="text-xs text-green-700">Net Payout</p>
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

                                        {payout.status === 'pending' && (
                                            <Button
                                                size="sm"
                                                onClick={() => setPayoutDialog(payout)}
                                                className="bg-green-600 hover:bg-green-700"
                                            >
                                                <CheckCircle className="h-4 w-4 mr-2" />
                                                Mark as Paid
                                            </Button>
                                        )}

                                        {payout.status === 'paid' && payout.paid_date && (
                                            <p className="text-xs text-green-600">
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