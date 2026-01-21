import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Download, Filter, CheckCircle, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';

export default function PayoutHistory() {
    const [selectedRestaurant, setSelectedRestaurant] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.asServiceRole.entities.Restaurant.list(),
    });

    const { data: allPayouts = [], isLoading } = useQuery({
        queryKey: ['all-payouts'],
        queryFn: () => base44.asServiceRole.entities.Payout.list('-created_date', 500),
        refetchInterval: 30000,
    });

    const filteredPayouts = allPayouts.filter(payout => {
        if (selectedRestaurant && payout.restaurant_id !== selectedRestaurant) return false;
        if (selectedStatus && payout.status !== selectedStatus) return false;
        
        if (startDate) {
            const payoutStart = new Date(payout.period_start);
            if (payoutStart < new Date(startDate)) return false;
        }
        
        if (endDate) {
            const payoutEnd = new Date(payout.period_end);
            if (payoutEnd > new Date(endDate)) return false;
        }
        
        return true;
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

    const statusConfig = {
        pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
        processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: TrendingUp },
        paid: { label: 'Paid', color: 'bg-green-100 text-green-800', icon: CheckCircle },
        failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: AlertCircle },
    };

    const totalAmount = filteredPayouts.reduce((sum, p) => sum + (p.net_payout || 0), 0);
    const totalPaid = filteredPayouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.net_payout || 0), 0);
    const totalPending = filteredPayouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.net_payout || 0), 0);

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <DollarSign className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Payouts</p>
                                <p className="text-xl font-bold">£{totalAmount.toFixed(2)}</p>
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
                                <p className="text-sm text-gray-500">Paid</p>
                                <p className="text-xl font-bold text-green-600">£{totalPaid.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                                <Clock className="h-5 w-5 text-yellow-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Pending</p>
                                <p className="text-xl font-bold text-yellow-600">£{totalPending.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Records</p>
                                <p className="text-xl font-bold">{filteredPayouts.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters and List */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Payout History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Restaurant</label>
                            <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Restaurants" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>All Restaurants</SelectItem>
                                    {restaurants.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block">Status</label>
                            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>All Status</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="processing">Processing</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block">Start Date</label>
                            <Input 
                                type="date" 
                                value={startDate} 
                                onChange={(e) => setStartDate(e.target.value)} 
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block">End Date</label>
                            <Input 
                                type="date" 
                                value={endDate} 
                                onChange={(e) => setEndDate(e.target.value)} 
                            />
                        </div>
                    </div>

                    {/* Payouts List */}
                    {isLoading ? (
                        <p className="text-center text-gray-500 py-8">Loading payouts...</p>
                    ) : filteredPayouts.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No payouts found with current filters</p>
                    ) : (
                        <div className="space-y-3">
                            {filteredPayouts.map((payout) => {
                                const StatusIcon = statusConfig[payout.status]?.icon || Clock;
                                return (
                                    <div key={payout.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
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
                                            <div className="flex items-center gap-2">
                                                <Badge className={statusConfig[payout.status]?.color}>
                                                    <StatusIcon className="h-3 w-3 mr-1" />
                                                    {statusConfig[payout.status]?.label}
                                                </Badge>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                                            <div className="bg-gray-50 p-2 rounded">
                                                <p className="text-xs text-gray-600">Orders</p>
                                                <p className="font-semibold">{payout.total_orders}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 rounded">
                                                <p className="text-xs text-gray-600">Gross</p>
                                                <p className="font-semibold">£{payout.gross_earnings?.toFixed(2)}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 rounded">
                                                <p className="text-xs text-gray-600">Commission</p>
                                                <p className="font-semibold text-orange-600">-£{payout.platform_commission?.toFixed(2)}</p>
                                            </div>
                                            {payout.refunds_paid_by_restaurant > 0 && (
                                                <div className="bg-gray-50 p-2 rounded">
                                                    <p className="text-xs text-gray-600">Refunds</p>
                                                    <p className="font-semibold text-red-600">-£{payout.refunds_paid_by_restaurant?.toFixed(2)}</p>
                                                </div>
                                            )}
                                            <div className="bg-green-50 p-2 rounded border border-green-200">
                                                <p className="text-xs text-green-700">Net</p>
                                                <p className="font-bold text-green-700">£{payout.net_payout?.toFixed(2)}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div>
                                                {payout.status === 'paid' && payout.paid_date && (
                                                    <p className="text-xs text-green-600">
                                                        Paid on {format(new Date(payout.paid_date), 'MMM d, yyyy')}
                                                        {payout.payment_method && ` via ${payout.payment_method}`}
                                                    </p>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => generatePayoutPDF(payout)}
                                            >
                                                <Download className="h-4 w-4 mr-2" />
                                                Download PDF
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}