import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Download, Calendar } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import jsPDF from 'jspdf';

export default function RestaurantPayoutHistory({ restaurantId }) {
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchDate, setSearchDate] = useState('');

    // Fetch payouts for this restaurant (server-filtered)
    const { data: payouts, isLoading, error } = useQuery({
        queryKey: ['restaurant-payouts', restaurantId],
        queryFn: () => base44.entities.Payout.filter({ restaurant_id: restaurantId }, '-period_start'),
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

    const downloadPayoutStatement = (payout) => {
        const doc = new jsPDF();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        let yPos = 20;

        // Header
        doc.setFontSize(20);
        doc.text('Payout Statement', pageWidth / 2, yPos, { align: 'center' });
        yPos += 15;

        // Payout details
        doc.setFontSize(11);
        doc.text(`Period: ${new Date(payout.period_start).toLocaleDateString()} to ${new Date(payout.period_end).toLocaleDateString()}`, 20, yPos);
        yPos += 8;
        doc.text(`Status: ${payout.status.toUpperCase()}`, 20, yPos);
        yPos += 12;

        // Summary table
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text('Earnings Breakdown', 20, yPos);
        yPos += 8;

        const summaryData = [
            ['Total Orders', `${payout.total_orders || 0}`],
            ['Gross Earnings', `£${(payout.gross_earnings || 0).toFixed(2)}`],
            ['Cash Payments', `£${(payout.cash_payment_amount || 0).toFixed(2)}`],
            ['Card Payments', `£${(payout.card_payment_amount || 0).toFixed(2)}`],
            ['Platform Commission', `-£${(payout.platform_commission || 0).toFixed(2)}`],
        ];

        doc.setTextColor(0);
        summaryData.forEach(([label, value]) => {
            doc.text(label, 20, yPos);
            doc.text(value, pageWidth - 40, yPos, { align: 'right' });
            yPos += 7;
        });

        // Net payout
        yPos += 3;
        doc.setFontSize(12);
        doc.setTextColor(34, 197, 94);
        doc.text('Net Payout', 20, yPos);
        doc.text(`£${(payout.net_payout || 0).toFixed(2)}`, pageWidth - 40, yPos, { align: 'right' });

        if (payout.paid_date) {
            yPos += 15;
            doc.setTextColor(0);
            doc.setFontSize(10);
            doc.text(`Paid on: ${new Date(payout.paid_date).toLocaleDateString()}`, 20, yPos);
            if (payout.payment_method) {
                yPos += 7;
                doc.text(`Payment Method: ${payout.payment_method}`, 20, yPos);
            }
        }

        doc.save(`payout_${new Date(payout.period_start).toISOString().split('T')[0]}.pdf`);
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-600">Total Earnings</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">£{totalEarnings.toFixed(2)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-600">Commission Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-orange-600">-£{totalCommission.toFixed(2)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-600">Total Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-green-600">£{totalPaid.toFixed(2)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-600">Pending Payout</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-yellow-600">£{totalPending.toFixed(2)}</p>
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
                                            <p className="font-semibold text-sm">£{(payout.gross_earnings || 0).toFixed(2)}</p>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <p className="text-xs text-gray-600">Cash</p>
                                            <p className="font-semibold text-sm">£{(payout.cash_payment_amount || 0).toFixed(2)}</p>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <p className="text-xs text-gray-600">Card</p>
                                            <p className="font-semibold text-sm">£{(payout.card_payment_amount || 0).toFixed(2)}</p>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <p className="text-xs text-gray-600">Commission</p>
                                            <p className="font-semibold text-orange-600 text-sm">-£{(payout.platform_commission || 0).toFixed(2)}</p>
                                        </div>
                                        <div className="bg-green-50 p-2 rounded border border-green-200">
                                            <p className="text-xs text-green-700">Net Payout</p>
                                            <p className="font-bold text-green-700 text-sm">£{(payout.net_payout || 0).toFixed(2)}</p>
                                        </div>
                                    </div>

                                    {/* Payment Info */}
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