import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Download, Calendar } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { generatePayoutPDF } from '@/lib/payoutPDF';
import { fetchRestaurantPayouts, fetchRestaurantBalance, downloadStatementCsv } from '@/lib/restaurantPayouts';
import { toast } from 'sonner';
import { useMoney } from '@/lib/MoneyContext';

export default function RestaurantPayoutHistory({ restaurantId }) {
    const { money } = useMoney();
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchDate, setSearchDate] = useState('');

    // Fetch payouts for this restaurant (server-filtered)
    const { data: payouts, isLoading, error } = useQuery({
        queryKey: ['restaurant-payouts', restaurantId],
        queryFn: () => fetchRestaurantPayouts(restaurantId),
        enabled: !!restaurantId,
    });

    const { data: balance } = useQuery({
        queryKey: ['restaurant-balance', restaurantId],
        queryFn: () => fetchRestaurantBalance(restaurantId),
        enabled: !!restaurantId,
    });

    // Filter payouts
    const filteredPayouts = (payouts || []).filter(payout => {
        const statusMatch = statusFilter === 'all' || payout.status === statusFilter;
        const dateMatch = !searchDate || payout.period_start?.includes(searchDate);
        return statusMatch && dateMatch;
    }).sort((a, b) => new Date(b.period_start) - new Date(a.period_start));

    // Calculate summaries
    const totalEarnings = filteredPayouts.reduce((sum, p) => sum + (p.gross_earnings || 0), 0);
    const totalCommission = filteredPayouts.reduce((sum, p) => sum + (p.platform_commission || 0), 0);
    const totalPaid = filteredPayouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.net_payout || 0), 0);
    const totalPending = filteredPayouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.net_payout || 0), 0);

    const getStatusBadge = (status) => {
        const variants = {
            pending: 'bg-yellow-100 text-yellow-800',
            processing: 'bg-blue-100 text-blue-800',
            paid: 'bg-green-100 text-green-800',
            failed: 'bg-red-100 text-red-800'
        };
        return variants[status] || 'bg-gray-100 text-gray-800';
    };

    const downloadPayoutStatement = (payout) => generatePayoutPDF(payout);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Next payout so far */}
            {balance && (
                <Card className="border-orange-200 bg-orange-50/40">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Next payout so far</CardTitle>
                        <CardDescription>
                            Orders from {new Date(balance.period_start).toLocaleDateString('en-GB')} to {new Date(balance.period_end).toLocaleDateString('en-GB')}. Updates daily; the final figure is on your statement.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <div className="flex justify-between"><span>Card / online payments ({balance.total_orders} orders)</span><span>{money(balance.card_payment_amount)}</span></div>
                        <div className="flex justify-between text-gray-500"><span>Cash you collected yourself</span><span>{money(balance.cash_payment_amount)}</span></div>
                        <div className="flex justify-between text-orange-700"><span>Commission</span><span>−{money(balance.platform_commission)}</span></div>
                        {balance.refunds_paid_by_restaurant > 0 && <div className="flex justify-between text-red-700"><span>Refunds on earlier orders</span><span>−{money(balance.refunds_paid_by_restaurant)}</span></div>}
                        {balance.adjustments_total !== 0 && <div className="flex justify-between"><span>Adjustments (disputes, credits, reserve released)</span><span>{balance.adjustments_total < 0 ? '−' : '+'}{money(Math.abs(balance.adjustments_total))}</span></div>}
                        {balance.brought_forward_amount > 0 && <div className="flex justify-between text-red-700"><span>Owed from last statement</span><span>−{money(balance.brought_forward_amount)}</span></div>}
                        {balance.reserve_held > 0 && <div className="flex justify-between text-gray-600"><span>Reserve held until {new Date(balance.reserve_until).toLocaleDateString('en-GB')}</span><span>−{money(balance.reserve_held)}</span></div>}
                        <div className="flex justify-between border-t pt-1 font-bold text-green-700"><span>Estimated payout</span><span>{money(balance.net_payout)}</span></div>
                        {balance.held_orders > 0 && <p className="text-xs text-gray-500">{balance.held_orders} order(s) not marked delivered/collected yet — they're added once completed.</p>}
                    </CardContent>
                </Card>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-600">Total Earnings</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{money(totalEarnings)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-600">Commission Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-orange-600">-{money(totalCommission)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-600">Total Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-green-600">{money(totalPaid)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-600">Pending Payout</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-yellow-600">{money(totalPending)}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Payout History</CardTitle>
                    <CardDescription>View all your payouts and earnings</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="flex-1">
                            <label className="text-sm font-medium mb-2 block">Filter by Status</label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="processing">Processing</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1">
                            <label className="text-sm font-medium mb-2 block">Search by Date</label>
                            <Input
                                type="date"
                                value={searchDate}
                                onChange={(e) => setSearchDate(e.target.value)}
                                placeholder="Search by date"
                            />
                        </div>
                    </div>

                    {/* Payouts List */}
                    {filteredPayouts.length === 0 ? (
                        <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>No payouts found for the selected filters.</AlertDescription>
                        </Alert>
                    ) : (
                        <div className="space-y-4">
                            {filteredPayouts.map((payout) => (
                                <div key={payout.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                    {/* Header */}
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                                        <div className="flex items-center gap-3">
                                            <Calendar className="h-5 w-5 text-gray-400" />
                                            <div>
                                                <p className="font-semibold">
                                                    {new Date(payout.period_start).toLocaleDateString()} - {new Date(payout.period_end).toLocaleDateString()}
                                                </p>
                                                <p className="text-sm text-gray-600">{payout.payout_frequency}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge className={getStatusBadge(payout.status)}>
                                                {payout.status}
                                            </Badge>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => downloadPayoutStatement(payout)}
                                            >
                                                <Download className="h-4 w-4 mr-2" />
                                                PDF
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => downloadStatementCsv(restaurantId, payout).catch((e) => toast.error(e.message))}
                                            >
                                                <Download className="h-4 w-4 mr-2" />
                                                CSV
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Details Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
                                        <div className="bg-gray-50 p-2 rounded">
                                            <p className="text-xs text-gray-600">Orders</p>
                                            <p className="font-semibold text-sm">{payout.total_orders}</p>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <p className="text-xs text-gray-600">Gross</p>
                                            <p className="font-semibold text-sm">{money((payout.gross_earnings || 0))}</p>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <p className="text-xs text-gray-600">Cash</p>
                                            <p className="font-semibold text-sm">{money((payout.cash_payment_amount || 0))}</p>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <p className="text-xs text-gray-600">Card</p>
                                            <p className="font-semibold text-sm">{money((payout.card_payment_amount || 0))}</p>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <p className="text-xs text-gray-600">Commission</p>
                                            <p className="font-semibold text-orange-600 text-sm">-{money((payout.platform_commission || 0))}</p>
                                        </div>
                                        <div className="bg-green-50 p-2 rounded border border-green-200">
                                            <p className="text-xs text-green-700">Net Payout</p>
                                            <p className="font-bold text-green-700 text-sm">{money((payout.net_payout || 0))}</p>
                                        </div>
                                    </div>

                                    {/* Payment Info */}
                                    {(payout.chargebacks_amount || payout.manual_adjustments_amount || payout.reserve_held || payout.reserve_released_amount || payout.brought_forward_amount) ? (
                                        <div className="flex flex-wrap gap-2 text-xs mb-2">
                                            {payout.chargebacks_amount ? <span className="rounded bg-red-50 px-2 py-1 text-red-700">Card disputes {payout.chargebacks_amount < 0 ? '−' : '+'}{money(Math.abs(payout.chargebacks_amount))}</span> : null}
                                            {payout.manual_adjustments_amount ? <span className="rounded bg-gray-100 px-2 py-1">Adjustments {payout.manual_adjustments_amount < 0 ? '−' : '+'}{money(Math.abs(payout.manual_adjustments_amount))}</span> : null}
                                            {payout.reserve_held ? <span className="rounded bg-gray-100 px-2 py-1">Reserve held −{money(payout.reserve_held)}</span> : null}
                                            {payout.reserve_released_amount ? <span className="rounded bg-green-50 px-2 py-1 text-green-700">Reserve released +{money(payout.reserve_released_amount)}</span> : null}
                                            {payout.brought_forward_amount ? <span className="rounded bg-red-50 px-2 py-1 text-red-700">Owed from last statement −{money(payout.brought_forward_amount)}</span> : null}
                                        </div>
                                    ) : null}

                                    {payout.paid_date && (
                                        <div className="text-xs text-gray-500 pt-2 border-t">
                                            <p>Paid on {new Date(payout.paid_date).toLocaleDateString()} via {payout.payment_method || 'Not specified'}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}