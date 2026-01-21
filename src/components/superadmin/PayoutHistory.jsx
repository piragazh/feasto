import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Download, Filter, CheckCircle, Clock, TrendingUp, AlertCircle, FileText, BarChart3 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, eachMonthOfInterval, eachYearOfInterval } from 'date-fns';
import jsPDF from 'jspdf';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function PayoutHistory() {
    const [selectedRestaurant, setSelectedRestaurant] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'charts'
    const [summaryPeriod, setSummaryPeriod] = useState('monthly'); // 'monthly' or 'yearly'

    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants-history'],
        queryFn: () => base44.entities.Restaurant.list(),
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

    // Generate chart data based on summary period
    const chartData = useMemo(() => {
        if (filteredPayouts.length === 0) return [];

        const groupedData = {};
        
        filteredPayouts.forEach(payout => {
            const date = parseISO(payout.period_start);
            const key = summaryPeriod === 'monthly' 
                ? format(date, 'MMM yyyy')
                : format(date, 'yyyy');
            
            if (!groupedData[key]) {
                groupedData[key] = {
                    period: key,
                    totalPayouts: 0,
                    paidAmount: 0,
                    pendingAmount: 0,
                    count: 0,
                    grossEarnings: 0,
                    commission: 0,
                };
            }
            
            groupedData[key].totalPayouts += payout.net_payout || 0;
            groupedData[key].grossEarnings += payout.gross_earnings || 0;
            groupedData[key].commission += payout.platform_commission || 0;
            groupedData[key].count += 1;
            
            if (payout.status === 'paid') {
                groupedData[key].paidAmount += payout.net_payout || 0;
            } else if (payout.status === 'pending') {
                groupedData[key].pendingAmount += payout.net_payout || 0;
            }
        });

        return Object.values(groupedData).sort((a, b) => {
            const dateA = summaryPeriod === 'monthly' ? parseISO(`01 ${a.period}`) : parseISO(`${a.period}-01-01`);
            const dateB = summaryPeriod === 'monthly' ? parseISO(`01 ${b.period}`) : parseISO(`${b.period}-01-01`);
            return dateA - dateB;
        });
    }, [filteredPayouts, summaryPeriod]);

    // Status breakdown for pie chart
    const statusBreakdown = useMemo(() => {
        const breakdown = {};
        filteredPayouts.forEach(p => {
            const status = p.status || 'unknown';
            breakdown[status] = (breakdown[status] || 0) + (p.net_payout || 0);
        });
        
        return Object.entries(breakdown).map(([status, amount]) => ({
            name: statusConfig[status]?.label || status,
            value: amount,
            color: status === 'paid' ? '#10b981' : status === 'pending' ? '#f59e0b' : status === 'processing' ? '#3b82f6' : '#ef4444'
        }));
    }, [filteredPayouts]);

    // Export to CSV
    const exportToCSV = () => {
        const headers = ['Restaurant', 'Period Start', 'Period End', 'Frequency', 'Orders', 'Gross', 'Commission', 'Refunds', 'Net Payout', 'Status', 'Paid Date', 'Payment Method'];
        const rows = filteredPayouts.map(p => [
            p.restaurant_name,
            format(new Date(p.period_start), 'yyyy-MM-dd'),
            format(new Date(p.period_end), 'yyyy-MM-dd'),
            p.payout_frequency || '',
            p.total_orders,
            p.gross_earnings?.toFixed(2),
            p.platform_commission?.toFixed(2),
            p.refunds_paid_by_restaurant?.toFixed(2) || '0.00',
            p.net_payout?.toFixed(2),
            p.status,
            p.paid_date ? format(new Date(p.paid_date), 'yyyy-MM-dd') : '',
            p.payment_method || ''
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payout-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    };

    const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'];

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

            {/* View Mode Toggle */}
            <div className="flex gap-2">
                <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    onClick={() => setViewMode('list')}
                    className="flex items-center gap-2"
                >
                    <FileText className="h-4 w-4" />
                    List View
                </Button>
                <Button
                    variant={viewMode === 'charts' ? 'default' : 'outline'}
                    onClick={() => setViewMode('charts')}
                    className="flex items-center gap-2"
                >
                    <BarChart3 className="h-4 w-4" />
                    Analytics
                </Button>
            </div>

            {/* Analytics View */}
            {viewMode === 'charts' && (
                <div className="space-y-6">
                    {/* Period Selector */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                                <label className="text-sm font-medium">Summary Period:</label>
                                <Select value={summaryPeriod} onValueChange={setSummaryPeriod}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                        <SelectItem value="yearly">Yearly</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button onClick={exportToCSV} variant="outline" className="ml-auto">
                                    <Download className="h-4 w-4 mr-2" />
                                    Export CSV
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payout Trends Chart */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Payout Trends Over Time</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="period" />
                                    <YAxis />
                                    <Tooltip formatter={(value) => `£${value.toFixed(2)}`} />
                                    <Legend />
                                    <Line type="monotone" dataKey="totalPayouts" stroke="#8b5cf6" name="Total Payouts" strokeWidth={2} />
                                    <Line type="monotone" dataKey="paidAmount" stroke="#10b981" name="Paid" strokeWidth={2} />
                                    <Line type="monotone" dataKey="pendingAmount" stroke="#f59e0b" name="Pending" strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Revenue Breakdown */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Revenue vs Commission</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="period" />
                                        <YAxis />
                                        <Tooltip formatter={(value) => `£${value.toFixed(2)}`} />
                                        <Legend />
                                        <Bar dataKey="grossEarnings" fill="#3b82f6" name="Gross Earnings" />
                                        <Bar dataKey="commission" fill="#f97316" name="Commission" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        {/* Status Distribution */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Payout Status Distribution</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={statusBreakdown}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, value }) => `${name}: £${value.toFixed(0)}`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {statusBreakdown.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value) => `£${value.toFixed(2)}`} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Summary Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{summaryPeriod === 'monthly' ? 'Monthly' : 'Yearly'} Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-sm font-semibold">Period</th>
                                            <th className="px-4 py-2 text-right text-sm font-semibold">Count</th>
                                            <th className="px-4 py-2 text-right text-sm font-semibold">Gross</th>
                                            <th className="px-4 py-2 text-right text-sm font-semibold">Commission</th>
                                            <th className="px-4 py-2 text-right text-sm font-semibold">Net Total</th>
                                            <th className="px-4 py-2 text-right text-sm font-semibold">Paid</th>
                                            <th className="px-4 py-2 text-right text-sm font-semibold">Pending</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {chartData.map((row, idx) => (
                                            <tr key={idx} className="border-t hover:bg-gray-50">
                                                <td className="px-4 py-2 font-medium">{row.period}</td>
                                                <td className="px-4 py-2 text-right">{row.count}</td>
                                                <td className="px-4 py-2 text-right">£{row.grossEarnings.toFixed(2)}</td>
                                                <td className="px-4 py-2 text-right text-orange-600">£{row.commission.toFixed(2)}</td>
                                                <td className="px-4 py-2 text-right font-semibold">£{row.totalPayouts.toFixed(2)}</td>
                                                <td className="px-4 py-2 text-right text-green-600">£{row.paidAmount.toFixed(2)}</td>
                                                <td className="px-4 py-2 text-right text-yellow-600">£{row.pendingAmount.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="h-5 w-5" />
                            Payout History
                        </CardTitle>
                        <Button onClick={exportToCSV} variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
                            Export CSV
                        </Button>
                    </div>
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
            )}
        </div>
    );
}