import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageSquare, CheckCircle, XCircle, Activity, Download } from 'lucide-react';
import { format } from 'date-fns';

export default function SmsLogViewer() {
    const [restaurantFilter, setRestaurantFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants-sms'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: logs = [], isLoading } = useQuery({
        queryKey: ['sms-logs', restaurantFilter, statusFilter, dateFrom, dateTo],
        queryFn: () => base44.entities.SmsLog.list('-created_date', 500),
    });

    const filtered = logs.filter(log => {
        if (restaurantFilter !== 'all' && log.restaurant_id !== restaurantFilter) return false;
        if (statusFilter !== 'all' && log.status !== statusFilter) return false;
        if (dateFrom && new Date(log.created_date) < new Date(dateFrom)) return false;
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            if (new Date(log.created_date) > to) return false;
        }
        return true;
    });

    // Per-restaurant summary
    const restaurantSummary = restaurants.map(r => {
        const rLogs = filtered.filter(l => l.restaurant_id === r.id);
        return {
            id: r.id,
            name: r.name,
            total: rLogs.length,
            sent: rLogs.filter(l => l.status === 'sent').length,
            failed: rLogs.filter(l => l.status === 'failed').length,
        };
    }).filter(r => r.total > 0).sort((a, b) => b.total - a.total);

    const handleExportCSV = () => {
        const rows = [
            ['Date', 'Restaurant', 'To', 'Type', 'Status', 'Order ID', 'Message SID', 'Message'],
            ...filtered.map(l => [
                format(new Date(l.created_date), 'yyyy-MM-dd HH:mm'),
                l.restaurant_name || l.restaurant_id || '-',
                l.to,
                l.type || '-',
                l.status,
                l.order_id || '-',
                l.message_sid || '-',
                `"${(l.message || '').replace(/"/g, '""')}"`,
            ])
        ];
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sms-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
    };

    const statusBadge = (status) => {
        if (status === 'sent') return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Sent</Badge>;
        if (status === 'failed') return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
        return <Badge className="bg-yellow-100 text-yellow-800"><Activity className="h-3 w-3 mr-1" />Simulated</Badge>;
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">SMS Log</h2>
                    <p className="text-sm text-gray-500">All outbound SMS messages across all restaurants</p>
                </div>
                <Button onClick={handleExportCSV} variant="outline" className="gap-2">
                    <Download className="h-4 w-4" /> Export CSV
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
                            <SelectTrigger><SelectValue placeholder="All Restaurants" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Restaurants</SelectItem>
                                {restaurants.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="sent">Sent</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                                <SelectItem value="simulated">Simulated</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
                        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
                    </div>
                </CardContent>
            </Card>

            {/* Per-restaurant summary */}
            {restaurantSummary.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {restaurantSummary.map(r => (
                        <Card key={r.id} className="cursor-pointer hover:border-orange-400 transition-colors" onClick={() => setRestaurantFilter(r.id)}>
                            <CardContent className="pt-4">
                                <p className="font-semibold text-gray-900 truncate">{r.name}</p>
                                <div className="flex gap-4 mt-2 text-sm">
                                    <span className="text-gray-600">{r.total} total</span>
                                    <span className="text-green-600">{r.sent} sent</span>
                                    {r.failed > 0 && <span className="text-red-600">{r.failed} failed</span>}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Log table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        {filtered.length} messages
                        {restaurantFilter !== 'all' && (
                            <button onClick={() => setRestaurantFilter('all')} className="text-xs text-orange-600 underline ml-2">Clear filter</button>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-center text-gray-500 py-8">Loading...</p>
                    ) : filtered.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No SMS logs found</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-gray-500">
                                        <th className="pb-2 pr-4">Date</th>
                                        <th className="pb-2 pr-4">Restaurant</th>
                                        <th className="pb-2 pr-4">To</th>
                                        <th className="pb-2 pr-4">Type</th>
                                        <th className="pb-2 pr-4">Status</th>
                                        <th className="pb-2">Message</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(log => (
                                        <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50">
                                            <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                                                {format(new Date(log.created_date), 'dd MMM HH:mm')}
                                            </td>
                                            <td className="py-2 pr-4 font-medium max-w-[140px] truncate">
                                                {log.restaurant_name || '-'}
                                            </td>
                                            <td className="py-2 pr-4 text-gray-600">{log.to}</td>
                                            <td className="py-2 pr-4">
                                                <Badge variant="outline" className="text-xs capitalize">
                                                    {(log.type || 'other').replace(/_/g, ' ')}
                                                </Badge>
                                            </td>
                                            <td className="py-2 pr-4">{statusBadge(log.status)}</td>
                                            <td className="py-2 text-gray-600 max-w-[300px]">
                                               <div className="truncate" title={log.message}>{log.message}</div>
                                               {log.error_details && (
                                                   <div className="text-xs text-red-600 mt-0.5 truncate" title={log.error_details}>
                                                       ⚠️ {log.error_details}
                                                   </div>
                                               )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}