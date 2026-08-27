import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Printer, RefreshCw, TrendingUp, DollarSign, CreditCard, Banknote, XCircle, Receipt, Calendar } from 'lucide-react';
import { printerService } from '@/components/restaurant/PrinterService';
import { toast } from 'sonner';
import { format, startOfDay, endOfDay } from 'date-fns';

export default function POSEndOfDay({ restaurantId, restaurant, posTheme }) {
    const isDark = posTheme === 'dark';
    const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [isPrinting, setIsPrinting] = useState(false);

    const t = {
        bg:        isDark ? 'bg-[#151720]'    : 'bg-white',
        outerBg:   isDark ? 'bg-[#0f1117]'    : 'bg-gray-50',
        border:    isDark ? 'border-white/[0.07]' : 'border-gray-200',
        text:      isDark ? 'text-white'       : 'text-gray-900',
        textMuted: isDark ? 'text-gray-400'   : 'text-gray-500',
        card:      isDark ? 'bg-[#1a1d27] border border-white/[0.07]' : 'bg-white border border-gray-200',
        divider:   isDark ? 'border-white/[0.07]' : 'border-gray-100',
        input:     isDark ? 'bg-[#0f1117] border-white/[0.07] text-white' : 'bg-white border-gray-200 text-gray-900',
    };

    const selectedStart = startOfDay(new Date(reportDate + 'T00:00:00'));
    const selectedEnd = endOfDay(new Date(reportDate + 'T23:59:59'));

    const { data: orders = [], isFetching, refetch } = useQuery({
        queryKey: ['eod-orders', restaurantId, reportDate],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 500),
        staleTime: 0,
    });

    const stats = useMemo(() => {
        const dayOrders = orders.filter(o => {
            const d = new Date(o.created_date);
            return d >= selectedStart && d <= selectedEnd;
        });

        const completed = dayOrders.filter(o =>
            ['confirmed', 'preparing', 'ready_for_collection', 'delivered', 'collected'].includes(o.status)
        );
        const cancelled = dayOrders.filter(o => o.status === 'cancelled');
        const refunded = dayOrders.filter(o => ['refunded', 'refund_requested'].includes(o.status));

        const totalSales = completed.reduce((s, o) => s + (o.total || 0), 0);
        const totalDiscount = completed.reduce((s, o) => s + (o.discount || 0), 0);
        const orderCount = completed.length;

        const byMethod = {};
        for (const o of completed) {
            const m = o.payment_method || 'cash';
            if (!byMethod[m]) byMethod[m] = { count: 0, total: 0 };
            byMethod[m].count++;
            byMethod[m].total += o.total || 0;
        }

        // Estimate cash collected & change given (best-effort from notes)
        const cashOrders = completed.filter(o => o.payment_method === 'cash');
        const cashTotal = cashOrders.reduce((s, o) => s + (o.total || 0), 0);

        return {
            totalSales,
            totalDiscount,
            orderCount,
            avgOrder: orderCount > 0 ? totalSales / orderCount : 0,
            byMethod,
            cashTotal,
            cancelled,
            refunded,
            allCompleted: completed,
        };
    }, [orders, reportDate]);

    const printEOD = async () => {
        const config = restaurant?.printer_config;
        if (!config?.bluetooth_printer?.id && !config?.qz_printer_name) {
            toast.error('No printer configured. Please connect a printer in Settings > Printing.');
            return;
        }
        setIsPrinting(true);
        try {
            // ── Try QZ Tray first (preferred for Windows POS) ─────────────────
            if (config.qz_printer_name) {
                try {
                    const { default: qzTrayService } = await import('@/lib/qzTrayService');
                    const { buildEODBytes } = await import('@/lib/escpos');
                    if (qzTrayService.isConnected()) {
                        const eodBytes = buildEODBytes(restaurant, stats, format(new Date(reportDate), 'dd MMM yyyy'), config);
                        await qzTrayService.print(config.qz_printer_name, eodBytes);
                        toast.success('EOD report printed');
                        return;
                    }
                } catch (qzErr) {
                    console.warn('[EOD] QZ Tray print failed, falling back to Bluetooth:', qzErr?.message);
                }
            }
            // ── Fall back to Bluetooth ────────────────────────────────────────
            if (!config.bluetooth_printer?.id) {
                toast.error('QZ Tray not connected and no Bluetooth printer configured. Please connect a printer in Settings.');
                return;
            }
            const ESC = '\x1B';
            const GS = '\x1D';
            const cmd = {
                init: `${ESC}@`,
                alignCenter: `${ESC}a\x01`,
                alignLeft: `${ESC}a\x00`,
                boldOn: `${ESC}E\x01`,
                boldOff: `${ESC}E\x00`,
                doubleHeight: `${ESC}!\x10`,
                normal: `${ESC}!\x00`,
                cut: `${GS}V\x41\x00`,
            };

            const send = (t) => printerService.sendText(t);

            // Connect
            if (!printerService.isConnected()) {
                await printerService.connect(config.bluetooth_printer, true);
            }
            await printerService.sendCommand(cmd.init);
            await printerService.sendCommand(cmd.alignCenter);
            await printerService.sendCommand(cmd.boldOn);
            await printerService.sendCommand(cmd.doubleHeight);
            await send(`${restaurant.name}\n`);
            await printerService.sendCommand(cmd.normal);
            await printerService.sendCommand(cmd.boldOff);
            await send('END OF DAY REPORT\n');
            await send(`${format(new Date(reportDate), 'dd MMM yyyy')}\n`);
            await send(`Printed: ${format(new Date(), 'HH:mm dd/MM/yyyy')}\n`);
            await printerService.sendCommand(cmd.alignLeft);
            await send('================================\n');

            // Summary
            await printerService.sendCommand(cmd.boldOn);
            await send('SALES SUMMARY\n');
            await printerService.sendCommand(cmd.boldOff);
            const lw = 32;
            const line = (label, value) => {
                const pad = lw - label.length - value.length;
                return `${label}${' '.repeat(Math.max(1, pad))}${value}\n`;
            };
            await send(line('Total Orders:', stats.orderCount.toString()));
            await send(line('Total Sales:', `£${stats.totalSales.toFixed(2)}`));
            await send(line('Avg Order:', `£${stats.avgOrder.toFixed(2)}`));
            if (stats.totalDiscount > 0) await send(line('Discounts Given:', `-£${stats.totalDiscount.toFixed(2)}`));
            await send('--------------------------------\n');

            // By payment method
            await printerService.sendCommand(cmd.boldOn);
            await send('PAYMENT BREAKDOWN\n');
            await printerService.sendCommand(cmd.boldOff);
            for (const [method, data] of Object.entries(stats.byMethod)) {
                await send(line(`${method.toUpperCase()} (${data.count}):`, `£${data.total.toFixed(2)}`));
            }
            await send('--------------------------------\n');

            // Cash collected
            await printerService.sendCommand(cmd.boldOn);
            await send('CASH SUMMARY\n');
            await printerService.sendCommand(cmd.boldOff);
            await send(line('Cash Collected:', `£${stats.cashTotal.toFixed(2)}`));
            await send('--------------------------------\n');

            // Voids / Cancellations
            await printerService.sendCommand(cmd.boldOn);
            await send(`CANCELLED (${stats.cancelled.length})\n`);
            await printerService.sendCommand(cmd.boldOff);
            if (stats.cancelled.length === 0) {
                await send('  None\n');
            } else {
                for (const o of stats.cancelled) {
                    const num = o.order_number || `#${o.id.slice(-6)}`;
                    await send(`  ${num}  £${(o.total || 0).toFixed(2)}\n`);
                }
            }
            await send('================================\n');
            await printerService.sendCommand(cmd.alignCenter);
            await send('--- End of Day Complete ---\n\n\n');
            await printerService.sendCommand(cmd.cut);
            toast.success('EOD report printed');
        } catch (e) {
            toast.error('Print failed: ' + e.message);
        } finally {
            setIsPrinting(false);
        }
    };

    const PAYMENT_ICONS = {
        cash: <Banknote className="h-4 w-4 text-green-400" />,
        card: <CreditCard className="h-4 w-4 text-blue-400" />,
        apple_pay: <CreditCard className="h-4 w-4 text-purple-400" />,
        google_pay: <CreditCard className="h-4 w-4 text-yellow-400" />,
    };

    const PAYMENT_LABELS = {
        cash: 'Cash', card: 'Card', apple_pay: 'Apple Pay', google_pay: 'Google Pay',
    };

    return (
        <div className={`h-full overflow-y-auto ${t.outerBg} p-4 space-y-4`}>
            {/* Header */}
            <div className={`${t.card} rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3`}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500/15 rounded-xl flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-orange-400" />
                    </div>
                    <div>
                        <h2 className={`${t.text} font-bold text-lg`}>End of Day Report</h2>
                        <p className={`${t.textMuted} text-sm`}>Daily sales summary & reconciliation</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex items-center gap-2">
                        <Calendar className={`h-4 w-4 ${t.textMuted} absolute left-3 pointer-events-none`} />
                        <input
                            type="date"
                            value={reportDate}
                            onChange={e => setReportDate(e.target.value)}
                            className={`pl-9 pr-3 py-2 rounded-xl border text-sm font-medium ${t.input} focus:outline-none focus:ring-2 focus:ring-orange-500/50`}
                        />
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => refetch()} className={t.textMuted}>
                        <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                        size="sm"
                        onClick={printEOD}
                        disabled={isPrinting || (!restaurant?.printer_config?.bluetooth_printer?.id && !restaurant?.printer_config?.qz_printer_name)}
                        className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                    >
                        <Printer className="h-4 w-4" />
                        {isPrinting ? 'Printing...' : 'Print Z-Report'}
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Total Sales', value: `£${stats.totalSales.toFixed(2)}`, icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' },
                    { label: 'Orders', value: stats.orderCount, icon: Receipt, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                    { label: 'Avg Order', value: `£${stats.avgOrder.toFixed(2)}`, icon: DollarSign, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                    { label: 'Cancelled', value: stats.cancelled.length, icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className={`${t.card} rounded-2xl p-4 flex items-center gap-3`}>
                        <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`h-5 w-5 ${color}`} />
                        </div>
                        <div>
                            <p className={`${t.textMuted} text-xs`}>{label}</p>
                            <p className={`${t.text} font-bold text-lg`}>{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Payment Breakdown */}
                <div className={`${t.card} rounded-2xl p-5`}>
                    <h3 className={`${t.text} font-bold mb-4 flex items-center gap-2`}>
                        <CreditCard className="h-4 w-4 text-orange-400" /> Payment Breakdown
                    </h3>
                    {Object.keys(stats.byMethod).length === 0 ? (
                        <p className={`${t.textMuted} text-sm text-center py-6`}>No completed orders for this date</p>
                    ) : (
                        <div className="space-y-3">
                            {Object.entries(stats.byMethod).map(([method, data]) => (
                                <div key={method} className={`flex items-center justify-between py-2 border-b ${t.divider} last:border-0`}>
                                    <div className="flex items-center gap-2">
                                        {PAYMENT_ICONS[method] || <DollarSign className="h-4 w-4 text-gray-400" />}
                                        <span className={`${t.text} font-medium`}>{PAYMENT_LABELS[method] || method}</span>
                                        <span className={`${t.textMuted} text-xs`}>({data.count} orders)</span>
                                    </div>
                                    <span className={`${t.text} font-bold`}>£{data.total.toFixed(2)}</span>
                                </div>
                            ))}
                            <div className={`flex items-center justify-between pt-2`}>
                                <span className={`${t.text} font-bold`}>Total</span>
                                <span className="text-orange-400 font-bold text-lg">£{stats.totalSales.toFixed(2)}</span>
                            </div>
                            {stats.totalDiscount > 0 && (
                                <div className={`flex items-center justify-between text-sm`}>
                                    <span className={t.textMuted}>Discounts Applied</span>
                                    <span className="text-red-400 font-semibold">-£{stats.totalDiscount.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Cash Summary */}
                <div className={`${t.card} rounded-2xl p-5`}>
                    <h3 className={`${t.text} font-bold mb-4 flex items-center gap-2`}>
                        <Banknote className="h-4 w-4 text-green-400" /> Cash Summary
                    </h3>
                    <div className="space-y-3">
                        <div className={`flex justify-between py-2 border-b ${t.divider}`}>
                            <span className={t.textMuted}>Cash Orders</span>
                            <span className={`${t.text} font-semibold`}>{stats.byMethod?.cash?.count || 0}</span>
                        </div>
                        <div className={`flex justify-between py-2 border-b ${t.divider}`}>
                            <span className={t.textMuted}>Cash Collected</span>
                            <span className="text-green-400 font-bold text-lg">£{stats.cashTotal.toFixed(2)}</span>
                        </div>
                        <div className={`rounded-xl p-3 ${isDark ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-100'}`}>
                            <p className={`text-xs ${t.textMuted} mb-1`}>Expected in cash drawer</p>
                            <p className="text-green-400 font-bold text-xl">£{stats.cashTotal.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cancelled / Voided Orders */}
            <div className={`${t.card} rounded-2xl p-5`}>
                <h3 className={`${t.text} font-bold mb-4 flex items-center gap-2`}>
                    <XCircle className="h-4 w-4 text-red-400" />
                    Cancelled / Voided Orders
                    <span className={`ml-auto text-sm font-normal ${t.textMuted}`}>{stats.cancelled.length} total</span>
                </h3>
                {stats.cancelled.length === 0 ? (
                    <p className={`${t.textMuted} text-sm text-center py-6`}>No cancelled orders today</p>
                ) : (
                    <div className="space-y-2">
                        {stats.cancelled.map(o => (
                            <div key={o.id} className={`flex items-center justify-between py-2 px-3 rounded-xl ${isDark ? 'bg-red-500/5 border border-red-500/10' : 'bg-red-50 border border-red-100'}`}>
                                <div>
                                    <span className={`${t.text} font-semibold text-sm`}>
                                        {o.order_number || `#${o.id.slice(-6)}`}
                                    </span>
                                    {o.rejection_reason && (
                                        <p className={`${t.textMuted} text-xs mt-0.5`}>{o.rejection_reason}</p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <span className="text-red-400 font-bold">£{(o.total || 0).toFixed(2)}</span>
                                    <p className={`${t.textMuted} text-xs`}>{format(new Date(o.created_date), 'HH:mm')}</p>
                                </div>
                            </div>
                        ))}
                        <div className={`flex justify-between pt-2 text-sm font-semibold`}>
                            <span className={t.textMuted}>Total voided</span>
                            <span className="text-red-400">£{stats.cancelled.reduce((s, o) => s + (o.total || 0), 0).toFixed(2)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}