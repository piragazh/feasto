import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageSquare, CheckCircle, XCircle, Activity, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

const PAGE_SIZE = 50;

export default function SmsLogViewer() {
    const [restaurantFilter, setRestaurantFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [page, setPage] = useState(0);

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants-sms'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    // Build filter query
    const filterQuery = {};
    if (restaurantFilter !== 'all') filterQuery.restaurant_id = restaurantFilter;
    if (statusFilter !== 'all') filterQuery.status = statusFilter;

    const { data: logs = [], isLoading } = useQuery({
        queryKey: ['sms-logs', restaurantFilter, statusFilter, dateFrom, dateTo, page],
        queryFn: () => base44.entities.SmsLog.filter(filterQuery, '-created_date', PAGE_SIZE, page * PAGE_SIZE),
        keepPreviousData: true,
    });

    // Client-side date filtering (since date range isn't supported server-side easily)
    const filtered = logs.filter(log => {
        if (dateFrom && new Date(log.created_date) < new Date(dateFrom)) return false;
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            if (new Date(log.created_date) > to) return false;
        }
        return true;
    });

    const hasNextPage = logs.length === PAGE_SIZE;

    const handleFilterChange = (setter) => (value) => {
        setter(value);
        setPage(0);
    };

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
                        <Select value={restaurantFilter} onValueChange={handleFilterChange(setRestaurantFilter)}>
                            <SelectTrigger><SelectValue placeholder="All Restaurants" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Restaurants</SelectItem>
                                {restaurants.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
                            <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="sent">Sent</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                                <SelectItem value="simulated">Simulated</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
                        <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />
                    </div>
                </CardContent>
            </Card>

            {/* Log table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5" />
                            {filtered.length} messages (page {page + 1})
                            {restaurantFilter !== 'all' && (
                                <button onClick={() => { setRestaurantFilter('all'); setPage(0); }} className="text-xs text-orange-600 underline ml-2">Clear filter</button>
                            )}
                        </CardTitle>
                        {/* Pagination controls */}
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 0}
                                onClick={() => setPage(p => p - 1)}
                                className="h-8 px-3"
                            >
                                <ChevronLeft className="h-4 w-4" /> Prev
                            </Button>
                            <span className="text-sm text-gray-500 px-1">Page {page + 1}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!hasNextPage || isLoading}
                                onClick={() => setPage(p => p + 1)}
                                className="h-8 px-3"
                            >
                                Next <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
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
                    {/* Bottom pagination */}
                    {filtered.length > 0 && (
                        <div className="flex justify-center items-center gap-3 mt-4 pt-4 border-t">
                            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                                <ChevronLeft className="h-4 w-4" /> Previous
                            </Button>
                            <span className="text-sm text-gray-500">Page {page + 1}</span>
                            <Button variant="outline" size="sm" disabled={!hasNextPage || isLoading} onClick={() => setPage(p => p + 1)}>
                                Next <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}