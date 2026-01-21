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
import { DollarSign, TrendingUp, CheckCircle, Clock, AlertCircle, Download } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

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
            // Calculate period based on frequency
            const now = new Date();
            let periodStart, periodEnd;
            
            if (startDate && endDate) {
                // Custom date range
                periodStart = new Date(startDate);
                periodEnd = new Date(endDate);
                periodEnd.setHours(23, 59, 59, 999);
            } else if (payoutFrequency === 'daily') {
                // Yesterday
                periodStart = new Date(now);
                periodStart.setDate(periodStart.getDate() - 1);
                periodStart.setHours(0, 0, 0, 0);
                periodEnd = new Date(periodStart);
                periodEnd.setHours(23, 59, 59, 999);
            } else if (payoutFrequency === 'weekly') {
                // Last 7 days
                periodEnd = new Date(now);
                periodEnd.setHours(23, 59, 59, 999);
                periodStart = new Date(periodEnd);
                periodStart.setDate(periodStart.getDate() - 7);
                periodStart.setHours(0, 0, 0, 0);
            } else {
                // Monthly (default)
                periodStart = startOfMonth(subMonths(now, 1));
                periodEnd = endOfMonth(subMonths(now, 1));
            }

            // Get restaurant details
            const restaurant = restaurants.find(r => r.id === restaurantId);
            
            // Get all orders in period
            const orders = await base44.asServiceRole.entities.Order.list();
            
            const periodOrders = orders.filter(order => {
                const orderDate = new Date(order.created_date);
                return order.restaurant_id === restaurantId && 
                       orderDate >= periodStart && 
                       orderDate <= periodEnd &&
                       ['delivered', 'collected'].includes(order.status);
            });

            // Get previous paid payouts for this restaurant to calculate already paid amount
            const previousPayouts = await base44.asServiceRole.entities.Payout.filter({
                restaurant_id: restaurantId,
                status: 'paid'
            });

            const totalAlreadyPaid = previousPayouts.reduce((sum, p) => sum + (p.net_payout || 0), 0);

            // Calculate totals from net pay
            let grossEarnings = 0;
            let platformCommission = 0;
            let netPayout = 0;

            periodOrders.forEach(order => {
                const orderTotal = order.total || 0;
                grossEarnings += orderTotal;
                
                // Calculate commission per order
                let commission = 0;
                if (restaurant.commission_type === 'fixed') {
                    commission = restaurant.fixed_commission_amount || 0;
                } else {
                    const rate = restaurant.commission_rate || 15;
                    commission = orderTotal * (rate / 100);
                }
                
                platformCommission += commission;
                netPayout += (orderTotal - commission);
            });

            const refundedOrders = orders.filter(order => {
                const orderDate = new Date(order.created_date);
                return order.restaurant_id === restaurantId && 
                       orderDate >= periodStart && 
                       orderDate <= periodEnd &&
                       order.status === 'refunded';
            });

            const refundsPaidByRestaurant = refundedOrders
                .filter(o => o.refund_paid_by === 'restaurant')
                .reduce((sum, order) => sum + (order.refund_amount || 0), 0);

            const refundsPaidByPlatform = refundedOrders
                .filter(o => o.refund_paid_by === 'platform')
                .reduce((sum, order) => sum + (order.refund_amount || 0), 0);

            netPayout -= refundsPaidByRestaurant;

            // Deduct already paid amount from net payout
            const finalNetPayout = Math.max(0, netPayout - totalAlreadyPaid);

            // Create payout record
            return base44.asServiceRole.entities.Payout.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurant.name,
                period_start: periodStart.toISOString(),
                period_end: periodEnd.toISOString(),
                payout_frequency: payoutFrequency,
                total_orders: periodOrders.length,
                gross_earnings: grossEarnings,
                platform_commission: platformCommission,
                refunds_paid_by_platform: refundsPaidByPlatform,
                refunds_paid_by_restaurant: refundsPaidByRestaurant,
                net_payout: finalNetPayout,
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

    const generatePayoutPDF = (payout) => {
        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(22);
        doc.text('PAYOUT STATEMENT', 105, 20, { align: 'center' });
        
        doc.setFontSize(10);
        doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 105, 28, { align: 'center' });
        
        // Restaurant Details
        doc.setFontSize(14);
        doc.text('Restaurant Details', 20, 45);
        doc.setFontSize(10);
        doc.text(`Name: ${payout.restaurant_name}`, 20, 55);
        
        // Period
        doc.setFontSize(14);
        doc.text('Payout Period', 20, 70);
        doc.setFontSize(10);
        doc.text(`From: ${format(new Date(payout.period_start), 'MMM dd, yyyy')}`, 20, 80);
        doc.text(`To: ${format(new Date(payout.period_end), 'MMM dd, yyyy')}`, 20, 87);
        doc.text(`Frequency: ${payout.payout_frequency || 'N/A'}`, 20, 94);
        
        // Financial Summary
        doc.setFontSize(14);
        doc.text('Financial Summary', 20, 110);
        
        let y = 120;
        doc.setFontSize(10);
        doc.text(`Total Orders: ${payout.total_orders}`, 20, y);
        y += 7;
        doc.text(`Gross Earnings: £${payout.gross_earnings?.toFixed(2)}`, 20, y);
        y += 7;
        doc.text(`Platform Commission: -£${payout.platform_commission?.toFixed(2)}`, 20, y);
        
        if (payout.refunds_paid_by_restaurant > 0) {
            y += 7;
            doc.text(`Refunds Deducted: -£${payout.refunds_paid_by_restaurant.toFixed(2)}`, 20, y);
        }
        
        if (payout.refunds_paid_by_platform > 0) {
            y += 7;
            doc.text(`Platform-Covered Refunds: £${payout.refunds_paid_by_platform.toFixed(2)}`, 20, y);
        }
        
        // Net Payout
        y += 15;
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text(`NET PAYOUT: £${payout.net_payout?.toFixed(2)}`, 20, y);
        doc.setFont(undefined, 'normal');
        
        // Payment Status
        y += 15;
        doc.setFontSize(14);
        doc.text('Payment Status', 20, y);
        y += 10;
        doc.setFontSize(10);
        doc.text(`Status: ${payout.status.toUpperCase()}`, 20, y);
        
        if (payout.status === 'paid' && payout.paid_date) {
            y += 7;
            doc.text(`Paid On: ${format(new Date(payout.paid_date), 'MMM dd, yyyy')}`, 20, y);
            if (payout.payment_method) {
                y += 7;
                doc.text(`Payment Method: ${payout.payment_method}`, 20, y);
            }
        }
        
        if (payout.notes) {
            y += 10;
            doc.setFontSize(14);
            doc.text('Notes', 20, y);
            y += 10;
            doc.setFontSize(10);
            const splitNotes = doc.splitTextToSize(payout.notes, 170);
            doc.text(splitNotes, 20, y);
        }
        
        // Footer
        doc.setFontSize(8);
        doc.text('This is an automatically generated payout statement.', 105, 280, { align: 'center' });
        
        // Save
        const filename = `payout-${payout.restaurant_name.replace(/\s+/g, '-')}-${format(new Date(payout.period_start), 'yyyy-MM-dd')}.pdf`;
        doc.save(filename);
    };

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

                                        <div className="flex items-center gap-2">
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