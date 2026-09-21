import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { tipsByStaff } from '@/lib/pos-money-logic';

/**
 * Tip distribution report.
 *
 * Under the Employment (Allocation of Tips) Act 2023 an employer must pass tips
 * on to workers in full, allocate them fairly, and keep records. This screen is
 * what an owner uses to do that each pay period.
 *
 * WHY CASH AND CARD ARE SEPARATE COLUMNS
 *   They are paid out differently. Cash tips can be handed over from the drawer;
 *   card tips land in the business bank account and must go through payroll.
 *   Paying both the same way either shorts staff or pays them twice.
 *
 * The calculation lives in pos-money-logic.js (tipsByStaff) and is under test,
 * including a guard that tips from voided orders are never distributed - they
 * were never collected.
 *
 * Dates are filtered client-side: server-side created_date ranges silently match
 * nothing on this platform, and a tip report that quietly showed £0 would look
 * like staff had earned nothing.
 */

const RANGES = {
    week:   { label: 'Last 7 days',  days: 7 },
    fortnight: { label: 'Last 14 days', days: 14 },
    month:  { label: 'Last 30 days', days: 30 },
};

export default function POSTipReport({ restaurantId, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const t = {
        panel: isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        text:  isDark ? 'text-white' : 'text-gray-900',
        sub:   isDark ? 'text-gray-400' : 'text-gray-500',
        row:   isDark ? 'border-white/[0.06]' : 'border-gray-100',
        chip:  isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
    };

    const [range, setRange] = useState('week');

    const { data: orders = [], isLoading, isError } = useQuery({
        queryKey: ['pos-tip-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 2000),
        enabled: !!restaurantId,
        refetchInterval: 120000,
    });

    const rows = useMemo(() => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - RANGES[range].days);
        const inRange = orders.filter(o => o.created_date && new Date(o.created_date) >= start);
        return tipsByStaff(inRange);
    }, [orders, range]);

    const totals = rows.reduce(
        (a, r) => ({ cash: a.cash + r.cash, card: a.card + r.card, total: a.total + r.total }),
        { cash: 0, card: 0, total: 0 },
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className={`${t.text} text-lg font-bold`}>Tip Distribution</h2>
                    <p className={`${t.sub} text-xs`}>What each staff member is owed, split by how it was paid</p>
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pay period">
                    {Object.entries(RANGES).map(([key, r]) => (
                        <button key={key} role="radio" aria-checked={range === key}
                            onClick={() => setRange(key)}
                            className={`h-11 px-4 rounded-xl text-sm font-semibold ${range === key ? 'bg-orange-500 text-white' : t.chip}`}>
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {isError && (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm flex gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    Could not load orders. Figures below are missing because the load failed, not because no tips were earned.
                </div>
            )}

            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'Cash tips', value: totals.cash, hint: 'Pay from the drawer' },
                    { label: 'Card tips', value: totals.card, hint: 'Pay through payroll' },
                    { label: 'Total owed', value: totals.total, hint: 'To be passed on in full' },
                ].map(c => (
                    <div key={c.label} className={`${t.panel} border rounded-2xl p-4`}>
                        <p className={`${t.sub} text-xs font-semibold uppercase tracking-wide`}>{c.label}</p>
                        <p className={`${t.text} text-2xl font-bold tabular-nums mt-1`}>£{c.value.toFixed(2)}</p>
                        <p className={`${t.sub} text-[11px] mt-0.5`}>{c.hint}</p>
                    </div>
                ))}
            </div>

            <div className={`${t.panel} border rounded-2xl p-4`}>
                {isLoading ? (
                    <div className={`${t.sub} text-sm py-10 flex items-center justify-center gap-2`}>
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                ) : rows.length === 0 ? (
                    <p className={`${t.sub} text-sm text-center py-10`}>
                        No tips recorded in the {RANGES[range].label.toLowerCase()}.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className={t.sub}>
                                    <th className="text-left font-medium pb-2">Staff</th>
                                    <th className="text-right font-medium pb-2">Orders</th>
                                    <th className="text-right font-medium pb-2">Cash</th>
                                    <th className="text-right font-medium pb-2">Card</th>
                                    <th className="text-right font-medium pb-2">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.staff_id || 'unattributed'} className={`border-t ${t.row}`}>
                                        <td className={`${t.text} py-2.5`}>
                                            {r.staff_name}
                                            {!r.staff_id && (
                                                <span className="block text-[11px] text-amber-400">
                                                    Taken with no one signed in — allocate manually
                                                </span>
                                            )}
                                        </td>
                                        <td className={`${t.text} py-2.5 text-right tabular-nums`}>{r.orders}</td>
                                        <td className={`${t.text} py-2.5 text-right tabular-nums`}>£{r.cash.toFixed(2)}</td>
                                        <td className={`${t.text} py-2.5 text-right tabular-nums`}>£{r.card.toFixed(2)}</td>
                                        <td className={`${t.text} py-2.5 text-right tabular-nums font-bold`}>£{r.total.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className={`flex gap-2 text-xs ${t.sub}`}>
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>
                    Tips belong to your staff and are not counted in your sales figures. The law requires
                    they are passed on in full and that you keep records &mdash; this report is that record.
                    Tips from voided orders are excluded, as they were never collected.
                </p>
            </div>
        </div>
    );
}
