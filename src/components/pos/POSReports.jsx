import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Calendar, TrendingUp, Clock, DollarSign, Printer, FileText, ChevronDown } from 'lucide-react';
import { generateReportPDF } from '@/lib/generatePDF';
import { toast } from 'sonner';
import moment from 'moment';
import { printerService } from '@/components/restaurant/PrinterService';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const PRESETS = [
    { label: 'Today', key: 'today', start: () => moment().startOf('day'), end: () => moment().endOf('day') },
    { label: 'Yesterday', key: 'yesterday', start: () => moment().subtract(1, 'days').startOf('day'), end: () => moment().subtract(1, 'days').endOf('day') },
    { label: 'This Week', key: 'week', start: () => moment().startOf('isoWeek'), end: () => moment().endOf('isoWeek') },
    { label: 'Last Week', key: 'lastweek', start: () => moment().subtract(1, 'weeks').startOf('isoWeek'), end: () => moment().subtract(1, 'weeks').endOf('isoWeek') },
    { label: 'This Month', key: 'month', start: () => moment().startOf('month'), end: () => moment().endOf('month') },
    { label: 'Last Month', key: 'lastmonth', start: () => moment().subtract(1, 'months').startOf('month'), end: () => moment().subtract(1, 'months').endOf('month') },
    { label: 'Custom', key: 'custom', start: null, end: null },
];

const ESC = '\x1B';
const GS = '\x1D';

export default function POSReports({ restaurantId, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const t = {
        panel:      isDark ? 'bg-gray-800 border-gray-700'   : 'bg-white border-gray-200',
        label:      isDark ? 'text-gray-400'                  : 'text-gray-500',
        text:       isDark ? 'text-white'                     : 'text-gray-900',
        subtext:    isDark ? 'text-gray-300'                  : 'text-gray-600',
        inactivBtn: isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200',
        input:      isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900',
        tabActive:  isDark ? 'text-orange-400 border-orange-400'  : 'text-orange-500 border-orange-500',
        tabInactive:isDark ? 'text-gray-400 hover:text-white'      : 'text-gray-500 hover:text-gray-900',
        tabBorder:  isDark ? 'border-gray-700'                     : 'border-gray-200',
        chartGrid:  isDark ? '#374151' : '#e5e7eb',
        chartAxis:  isDark ? '#9ca3af' : '#6b7280',
        chartTip:   isDark ? { backgroundColor: '#1f2937', border: '1px solid #374151' } : { backgroundColor: '#fff', border: '1px solid #e5e7eb' },
        chartTipLabel: isDark ? { color: '#fff' } : { color: '#111' },
        row:        isDark ? 'border-gray-700/50 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-gray-50',
        badge:      isDark ? 'bg-gray-700 text-gray-300 text-xs'      : 'bg-gray-100 text-gray-600 text-xs',
    };
    const [preset, setPreset] = useState('today');
    const [startDate, setStartDate] = useState(moment().format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));
    const [isPrinting, setIsPrinting] = useState(false);
    const [activeChart, setActiveChart] = useState('sales'); // sales | items | hours | status

    const effectiveStart = useMemo(() => {
        if (preset === 'custom') return moment(startDate).startOf('day');
        const p = PRESETS.find(x => x.key === preset);
        return p?.start?.() || moment().startOf('day');
    }, [preset, startDate]);

    const effectiveEnd = useMemo(() => {
        if (preset === 'custom') return moment(endDate).endOf('day');
        const p = PRESETS.find(x => x.key === preset);
        return p?.end?.() || moment().endOf('day');
    }, [preset, endDate]);

    const { data: orders = [] } = useQuery({
        queryKey: ['pos-reports-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant-for-report', restaurantId],
        queryFn: async () => {
            const r = await base44.entities.Restaurant.filter({ id: restaurantId });
            return r[0];
        },
        enabled: !!restaurantId,
    });

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const d = moment(order.created_date);
            return d.isBetween(effectiveStart, effectiveEnd, null, '[]');
        });
    }, [orders, effectiveStart, effectiveEnd]);

    const totalRevenue = filteredOrders.reduce((s, o) => s + (o.total || 0), 0);
    const cashRevenue = filteredOrders.filter(o => o.payment_method === 'cash').reduce((s, o) => s + (o.total || 0), 0);
    const cardRevenue = filteredOrders.filter(o => o.payment_method === 'card').reduce((s, o) => s + (o.total || 0), 0);
    const averageOrder = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;

    const salesData = useMemo(() => {
        const map = {};
        filteredOrders.forEach(o => {
            const day = moment(o.created_date).format('MMM DD');
            map[day] = (map[day] || 0) + (o.total || 0);
        });
        return Object.entries(map).map(([date, total]) => ({ date, total: parseFloat(total.toFixed(2)) }));
    }, [filteredOrders]);

    const menuItemsData = useMemo(() => {
        const map = {};
        filteredOrders.forEach(o => {
            o.items?.forEach(item => {
                if (!map[item.name]) map[item.name] = { name: item.name, count: 0, revenue: 0 };
                map[item.name].count += item.quantity;
                map[item.name].revenue += item.price * item.quantity;
            });
        });
        return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
    }, [filteredOrders]);

    const peakHoursData = useMemo(() => {
        const hours = Array(24).fill(0).map((_, i) => ({ hour: `${i}:00`, orders: 0, revenue: 0 }));
        filteredOrders.forEach(o => {
            const h = moment(o.created_date).hour();
            hours[h].orders++;
            hours[h].revenue += o.total || 0;
        });
        return hours.filter(h => h.orders > 0);
    }, [filteredOrders]);

    const statusData = useMemo(() => {
        const map = {};
        filteredOrders.forEach(o => {
            map[o.status || 'unknown'] = (map[o.status || 'unknown'] || 0) + 1;
        });
        return Object.entries(map).map(([name, value]) => ({ name, value }));
    }, [filteredOrders]);

    const orderTypeData = useMemo(() => {
        const map = {};
        filteredOrders.forEach(o => {
            const t = o.order_type || 'unknown';
            map[t] = (map[t] || 0) + 1;
        });
        return Object.entries(map).map(([name, value]) => ({ name, value }));
    }, [filteredOrders]);

    const peakHour = peakHoursData.length > 0
        ? peakHoursData.reduce((max, h) => h.orders > max.orders ? h : max).hour
        : 'N/A';

    const reportLabel = preset === 'custom'
        ? `${startDate} to ${endDate}`
        : PRESETS.find(p => p.key === preset)?.label || '';

    // ─── Export CSV ────────────────────────────────────────────────────────────
    const exportCSV = () => {
        const rows = [
            [`POS Report - ${reportLabel}`],
            [],
            ['Summary'],
            ['Total Orders', filteredOrders.length],
            ['Total Revenue', `£${totalRevenue.toFixed(2)}`],
            ['Cash Revenue', `£${cashRevenue.toFixed(2)}`],
            ['Card Revenue', `£${cardRevenue.toFixed(2)}`],
            ['Average Order', `£${averageOrder.toFixed(2)}`],
            ['Peak Hour', peakHour],
            [],
            ['Top Menu Items', 'Qty', 'Revenue'],
            ...menuItemsData.map(i => [i.name, i.count, `£${i.revenue.toFixed(2)}`]),
            [],
            ['Daily Sales'],
            ['Date', 'Revenue'],
            ...salesData.map(d => [d.date, `£${d.total.toFixed(2)}`]),
        ];
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pos-report-${reportLabel.replace(/ /g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('CSV exported');
    };

    // ─── Print to Thermal Printer ──────────────────────────────────────────────
    const printReport = async () => {
        const config = restaurant?.printer_config || {};
        const printerInfo = config.bluetooth_printer;
        if (!printerInfo?.id) {
            toast.error('No thermal printer configured. Set one up in Restaurant Settings > Printing.');
            return;
        }

        setIsPrinting(true);
        try {
            await printerService.connect(printerInfo, true);
            printerService.setCommandSet(config.command_set || 'esc_pos');
            const cmd = printerService.getCommands();
            const lw = config.printer_width === '58mm' ? 32 : 48;
            const line = '='.repeat(lw);
            const dashes = '-'.repeat(lw);

            const pad = (left, right, width = lw) => {
                const gap = width - left.length - right.length;
                return `${left}${' '.repeat(Math.max(1, gap))}${right}`;
            };

            await printerService.sendCommand(cmd.init);
            await printerService.sendCommand(cmd.alignCenter);
            await printerService.sendCommand(cmd.boldOn);
            await printerService.sendCommand(cmd.doubleHeight);
            await printerService.sendText(`${restaurant?.name || 'POS Report'}\n`);
            await printerService.sendCommand(cmd.normal);
            await printerService.sendCommand(cmd.boldOff);
            await printerService.sendText(`POS SALES REPORT\n`);
            await printerService.sendText(`${reportLabel}\n`);
            await printerService.sendText(`Printed: ${moment().format('DD/MM/YYYY HH:mm')}\n`);
            await printerService.sendCommand(cmd.alignLeft);
            await printerService.sendText(`${line}\n`);

            // Summary
            await printerService.sendCommand(cmd.boldOn);
            await printerService.sendText('SUMMARY\n');
            await printerService.sendCommand(cmd.boldOff);
            await printerService.sendText(`${dashes}\n`);
            await printerService.sendText(pad('Total Orders:', `${filteredOrders.length}`) + '\n');
            await printerService.sendText(pad('Total Revenue:', `£${totalRevenue.toFixed(2)}`) + '\n');
            await printerService.sendText(pad('Cash:', `£${cashRevenue.toFixed(2)}`) + '\n');
            await printerService.sendText(pad('Card:', `£${cardRevenue.toFixed(2)}`) + '\n');
            await printerService.sendText(pad('Avg Order:', `£${averageOrder.toFixed(2)}`) + '\n');
            await printerService.sendText(pad('Peak Hour:', peakHour) + '\n');

            // Order types
            if (orderTypeData.length > 0) {
                await printerService.sendText(`${line}\n`);
                await printerService.sendCommand(cmd.boldOn);
                await printerService.sendText('ORDER TYPES\n');
                await printerService.sendCommand(cmd.boldOff);
                await printerService.sendText(`${dashes}\n`);
                for (const ot of orderTypeData) {
                    await printerService.sendText(pad(ot.name.replace('_', ' ').toUpperCase() + ':', `${ot.value}`) + '\n');
                }
            }

            // Top items
            if (menuItemsData.length > 0) {
                await printerService.sendText(`${line}\n`);
                await printerService.sendCommand(cmd.boldOn);
                await printerService.sendText('TOP ITEMS\n');
                await printerService.sendCommand(cmd.boldOff);
                await printerService.sendText(`${dashes}\n`);
                for (const item of menuItemsData.slice(0, 8)) {
                    const short = item.name.length > lw - 12 ? item.name.slice(0, lw - 14) + '..' : item.name;
                    await printerService.sendText(pad(short, `x${item.count} £${item.revenue.toFixed(2)}`) + '\n');
                }
            }

            // Daily breakdown
            if (salesData.length > 1) {
                await printerService.sendText(`${line}\n`);
                await printerService.sendCommand(cmd.boldOn);
                await printerService.sendText('DAILY BREAKDOWN\n');
                await printerService.sendCommand(cmd.boldOff);
                await printerService.sendText(`${dashes}\n`);
                for (const d of salesData) {
                    await printerService.sendText(pad(d.date, `£${d.total.toFixed(2)}`) + '\n');
                }
            }

            await printerService.sendText(`${line}\n`);
            await printerService.sendCommand(cmd.alignCenter);
            await printerService.sendText('--- End of Report ---\n\n\n');
            await printerService.sendCommand(cmd.cut);

            toast.success('Report printed successfully');
        } catch (e) {
            toast.error(`Print failed: ${e.message}`);
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pb-6">

            {/* ── Filter Bar ── */}
            <div className={`${t.panel} rounded-lg border p-4`}>
                <div className="flex flex-wrap gap-2 mb-3">
                    {PRESETS.map(p => (
                        <Button
                            key={p.key}
                            size="sm"
                            onClick={() => setPreset(p.key)}
                            className={`h-9 px-4 font-bold text-sm ${
                                preset === p.key
                                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                                    : t.inactivBtn
                            }`}
                        >
                            {p.label}
                        </Button>
                    ))}
                </div>

                {preset === 'custom' && (
                    <div className="flex flex-wrap gap-3 mt-2">
                        <div>
                            <label className={`${t.label} text-xs block mb-1`}>From</label>
                            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                className={`${t.input} h-9 w-40`} />
                        </div>
                        <div>
                            <label className={`${t.label} text-xs block mb-1`}>To</label>
                            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                                className={`${t.input} h-9 w-40`} />
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-2 mt-3">
                    <span className={`${t.label} text-xs flex-1`}>
                        {filteredOrders.length} orders · {effectiveStart.format('DD MMM YYYY')} → {effectiveEnd.format('DD MMM YYYY')}
                    </span>
                    <Button onClick={exportCSV} size="sm" className="bg-green-700 hover:bg-green-600 text-white h-9 px-3">
                        <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
                    </Button>
                    <Button onClick={printReport} disabled={isPrinting} size="sm"
                        className="bg-blue-700 hover:bg-blue-600 text-white h-9 px-3">
                        <Printer className="h-3.5 w-3.5 mr-1.5" />
                        {isPrinting ? 'Printing...' : 'Print Report'}
                    </Button>
                </div>
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: 'Revenue', value: `£${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-green-400' },
                    { label: 'Orders', value: filteredOrders.length, icon: TrendingUp, color: 'text-blue-400' },
                    { label: 'Avg Order', value: `£${averageOrder.toFixed(2)}`, icon: DollarSign, color: 'text-orange-400' },
                    { label: 'Cash', value: `£${cashRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-yellow-400' },
                    { label: 'Peak Hour', value: peakHour, icon: Clock, color: 'text-purple-400' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <Card key={label} className={`${t.panel} border`}>
                        <CardContent className="p-4">
                            <p className={`${t.label} text-xs mb-1`}>{label}</p>
                            <div className="flex items-center gap-2">
                                <Icon className={`h-5 w-5 ${color}`} />
                                <p className={`text-xl font-bold ${t.text}`}>{value}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* ── Chart Tabs ── */}
            <div className={`${t.panel} rounded-lg border`}>
                <div className={`flex border-b ${t.tabBorder}`}>
                    {[
                        { key: 'sales', label: 'Sales Trend' },
                        { key: 'items', label: 'Top Items' },
                        { key: 'hours', label: 'Peak Hours' },
                        { key: 'type', label: 'Order Types' },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveChart(tab.key)}
                            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                                activeChart === tab.key
                                    ? `${t.tabActive} border-b-2`
                                    : t.tabInactive
                            }`}>
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="p-4">
                    {activeChart === 'sales' && (
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} />
                                <XAxis dataKey="date" stroke={t.chartAxis} tick={{ fontSize: 11 }} />
                                <YAxis stroke={t.chartAxis} tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={t.chartTip} labelStyle={t.chartTipLabel} formatter={v => [`£${v.toFixed(2)}`, 'Revenue']} />
                                <Line type="monotone" dataKey="total" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                    {activeChart === 'items' && (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={menuItemsData}>
                                <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} />
                                <XAxis dataKey="name" stroke={t.chartAxis} angle={-30} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
                                <YAxis stroke={t.chartAxis} tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={t.chartTip} labelStyle={t.chartTipLabel} />
                                <Bar dataKey="count" fill="#f97316" name="Qty" />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                    {activeChart === 'hours' && (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={peakHoursData}>
                                <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} />
                                <XAxis dataKey="hour" stroke={t.chartAxis} tick={{ fontSize: 11 }} />
                                <YAxis stroke={t.chartAxis} tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={t.chartTip} labelStyle={t.chartTipLabel} />
                                <Bar dataKey="orders" fill="#3b82f6" name="Orders" />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                    {activeChart === 'type' && (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={orderTypeData} cx="50%" cy="50%" outerRadius={100}
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    dataKey="value">
                                    {orderTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={t.chartTip} labelStyle={t.chartTipLabel} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* ── Payment Method Split ── */}
            <div className="grid grid-cols-2 gap-3">
                <Card className={`${t.panel} border`}>
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className={`${t.text} text-sm`}>Payment Methods</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {['cash', 'card'].map(method => {
                            const rev = filteredOrders.filter(o => o.payment_method === method).reduce((s, o) => s + (o.total || 0), 0);
                            const pct = totalRevenue > 0 ? (rev / totalRevenue * 100).toFixed(0) : 0;
                            return (
                                <div key={method} className="flex items-center gap-3 mb-2">
                                    <div className={`w-3 h-3 rounded-full ${method === 'cash' ? 'bg-green-400' : 'bg-blue-400'}`} />
                                    <span className={`${t.subtext} text-sm capitalize flex-1`}>{method}</span>
                                    <span className={`${t.text} font-bold text-sm`}>£{rev.toFixed(2)}</span>
                                    <Badge className={t.badge}>{pct}%</Badge>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                <Card className={`${t.panel} border`}>
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className={`${t.text} text-sm`}>Order Types</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {orderTypeData.map((ot, i) => (
                            <div key={ot.name} className="flex items-center gap-3 mb-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                <span className={`${t.subtext} text-sm capitalize flex-1`}>{ot.name.replace('_', ' ')}</span>
                                <span className={`${t.text} font-bold text-sm`}>{ot.value}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* ── Top Items Table ── */}
            <Card className={`${t.panel} border`}>
                <CardHeader className="pb-2">
                    <CardTitle className={`${t.text} text-sm`}>Menu Item Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className={`border-b ${t.tabBorder}`}>
                                    <th className={`text-left ${t.label} text-xs py-2 px-4`}>Item</th>
                                    <th className={`text-right ${t.label} text-xs py-2 px-4`}>Qty</th>
                                    <th className={`text-right ${t.label} text-xs py-2 px-4`}>Revenue</th>
                                    <th className={`text-right ${t.label} text-xs py-2 px-4`}>Avg</th>
                                </tr>
                            </thead>
                            <tbody>
                                {menuItemsData.map((item, idx) => (
                                    <tr key={idx} className={`border-b ${t.row}`}>
                                        <td className={`${t.text} text-sm py-2 px-4`}>{item.name}</td>
                                        <td className={`${t.text} text-sm text-right py-2 px-4`}>{item.count}</td>
                                        <td className="text-green-500 text-sm text-right py-2 px-4">£{item.revenue.toFixed(2)}</td>
                                        <td className={`${t.subtext} text-sm text-right py-2 px-4`}>£{(item.revenue / item.count).toFixed(2)}</td>
                                    </tr>
                                ))}
                                {menuItemsData.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className={`${t.label} text-center py-8 text-sm`}>No data for this period</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}