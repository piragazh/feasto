import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Users } from 'lucide-react';
import { labourSummary, workedMinutes, entryPay, rateInForce, isForgottenClockOut, breakShortfall } from '@/lib/pos-labour-logic';
import { sumRevenue } from '@/lib/pos-money-logic';
import { roleHasPermission, PERMISSIONS } from '@/lib/posPermissions';

/**
 * Labour report: hours, cost and labour as a percentage of sales.
 *
 * Labour % is the number owners actually steer by - most UK restaurants aim for
 * roughly 25-35%. It only means something if both halves are right, so:
 *
 *  - Hours and pay come from src/lib/pos-labour-logic.js, imported directly -
 *    no server copy, so nothing to drift. That logic uses real elapsed time
 *    (correct across the clock change), pays by the minute, and costs each shift
 *    at the rate in force on the day it was worked.
 *  - Sales use the same tested revenue rules as every other report.
 *  - Anything it could NOT count - unfinished shifts, forgotten clock-outs, staff
 *    with no rate - is shown prominently, so a labour % built on missing data is
 *    never read as a clean number.
 *
 * Dates are filtered in the browser: server-side created_date ranges silently
 * return nothing on this platform.
 */

const RANGES = {
    week:  { label: 'Last 7 days',  days: 7 },
    fortnight: { label: 'Last 14 days', days: 14 },
    month: { label: 'Last 30 days', days: 30 },
};

export default function POSLabourReport({ restaurantId, restaurant, activeStaffMember, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const t = {
        panel: isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        text:  isDark ? 'text-white' : 'text-gray-900',
        sub:   isDark ? 'text-gray-400' : 'text-gray-500',
        row:   isDark ? 'border-white/[0.06]' : 'border-gray-100',
        chip:  isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        input: isDark ? 'bg-[#0f1117] border border-white/10 text-white' : 'bg-white border border-gray-300 text-gray-900',
    };
    const qc = useQueryClient();
    const [range, setRange] = useState('week');
    const [editing, setEditing] = useState(null);     // staff_id whose rate is being set
    const [rateInput, setRateInput] = useState('');
    const [rateFrom, setRateFrom] = useState(() => new Date().toISOString().slice(0, 10));

    // Rates are sensitive. Only offer the editor to someone who manages staff.
    // (This is a UI gate - see the StaffPayRate entity note on its limits.)
    const canSetRates = !activeStaffMember
        || roleHasPermission(restaurant?.role_permissions, activeStaffMember.role, PERMISSIONS.STAFF_MANAGE);

    // Four independent queries, written out rather than wrapped in a helper:
    // a helper not named use… breaks the rules of hooks.
    const enabled = !!restaurantId;
    const entriesQ = useQuery({ queryKey: ['labour-entries', restaurantId], enabled,
        queryFn: () => base44.entities.TimeEntry.filter({ restaurant_id: restaurantId }, '-clock_in', 2000) });
    const ratesQ = useQuery({ queryKey: ['labour-rates', restaurantId], enabled,
        queryFn: () => base44.entities.StaffPayRate.filter({ restaurant_id: restaurantId }) });
    const ordersQ = useQuery({ queryKey: ['labour-orders', restaurantId], enabled,
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 3000) });
    const staffQ = useQuery({ queryKey: ['labour-staff', restaurantId], enabled,
        queryFn: () => base44.entities.StaffMember.filter({ restaurant_id: restaurantId }) });

    const loading = entriesQ.isLoading || ratesQ.isLoading || ordersQ.isLoading;
    const failed = entriesQ.isError || ratesQ.isError || ordersQ.isError;

    const { summary, perStaff, flagged } = useMemo(() => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - RANGES[range].days);
        const now = new Date();

        const entries = (entriesQ.data || []).filter(e => e.clock_in && new Date(e.clock_in) >= start);
        const orders = (ordersQ.data || []).filter(o => o.created_date && new Date(o.created_date) >= start);
        const rates = ratesQ.data || [];

        const s = labourSummary(entries, rates, sumRevenue(orders), now);

        const byStaff = new Map();
        for (const e of entries) {
            const row = byStaff.get(e.staff_id) || { staff_id: e.staff_id, name: e.staff_name || 'Unknown', minutes: 0, pay: 0, shifts: 0, noRate: false };
            const mins = workedMinutes(e);
            if (mins !== null) {
                row.minutes += mins;
                row.shifts += 1;
                const pay = entryPay(e, rateInForce(rates, e.staff_id, e.clock_in));
                if (pay === null) row.noRate = true; else row.pay += pay;
            }
            byStaff.set(e.staff_id, row);
        }

        const flags = entries.filter(e => isForgottenClockOut(e, now) || breakShortfall(e));
        return {
            summary: s,
            perStaff: [...byStaff.values()].sort((a, b) => b.pay - a.pay),
            flagged: flags,
        };
    }, [entriesQ.data, ratesQ.data, ordersQ.data, range]);

    const currentRate = (staffId) => rateInForce(ratesQ.data || [], staffId, new Date());

    const saveRate = async (staffId) => {
        const rate = Number(rateInput);
        if (!Number.isFinite(rate) || rate < 0 || rate > 500) { toast.error('Enter a valid hourly rate'); return; }
        try {
            await base44.entities.StaffPayRate.create({
                restaurant_id: restaurantId, staff_id: staffId,
                hourly_rate: Math.round(rate * 100) / 100,
                effective_from: rateFrom,
                set_by_name: activeStaffMember?.full_name,
            });
            toast.success('Rate saved');
            setEditing(null); setRateInput('');
            qc.invalidateQueries({ queryKey: ['labour-rates', restaurantId] });
        } catch (e) {
            toast.error('Could not save rate: ' + (e?.message || 'unknown error'));
        }
    };

    const pct = summary.labourPercent;
    const pctTone = pct === null ? t.text : pct > 35 ? 'text-red-400' : pct > 30 ? 'text-amber-300' : 'text-green-400';

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className={`${t.text} text-lg font-bold`}>Labour</h2>
                    <p className={`${t.sub} text-xs`}>Hours worked, wage cost, and labour as a share of sales</p>
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Period">
                    {Object.entries(RANGES).map(([k, r]) => (
                        <button key={k} role="radio" aria-checked={range === k} onClick={() => setRange(k)}
                            className={`h-11 px-4 rounded-xl text-sm font-semibold ${range === k ? 'bg-accent-500 text-white' : t.chip}`}>
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {failed && (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm flex gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    Could not load labour data. Figures below are incomplete because loading failed.
                </div>
            )}

            {loading ? (
                <div className={`${t.panel} border rounded-2xl p-8 flex justify-center ${t.sub}`}><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className={`${t.panel} border rounded-2xl p-4`}>
                            <p className={`${t.sub} text-xs font-semibold uppercase tracking-wide`}>Hours</p>
                            <p className={`${t.text} text-2xl font-bold tabular-nums mt-1`}>{summary.hours.toFixed(1)}</p>
                        </div>
                        <div className={`${t.panel} border rounded-2xl p-4`}>
                            <p className={`${t.sub} text-xs font-semibold uppercase tracking-wide`}>Wage cost</p>
                            <p className={`${t.text} text-2xl font-bold tabular-nums mt-1`}>£{summary.labourCost.toFixed(2)}</p>
                        </div>
                        <div className={`${t.panel} border rounded-2xl p-4 col-span-2`}>
                            <p className={`${t.sub} text-xs font-semibold uppercase tracking-wide`}>Labour % of sales</p>
                            <p className={`${pctTone} text-2xl font-bold tabular-nums mt-1`}>{pct === null ? '—' : `${pct}%`}</p>
                            <p className={`${t.sub} text-[11px] mt-0.5`}>
                                {pct === null ? 'No sales in this period' : 'Most restaurants aim for roughly 25–35%'}
                            </p>
                        </div>
                    </div>

                    {(summary.unfinished > 0 || summary.missingRate > 0) && (
                        <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs flex gap-2">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>
                                Not included:
                                {summary.unfinished > 0 && ` ${summary.unfinished} unfinished shift(s)${summary.forgotten ? ` (${summary.forgotten} likely forgotten clock-outs)` : ''}.`}
                                {summary.missingRate > 0 && ` ${summary.missingRate} shift(s) with no pay rate set.`}
                                {' '}The wage cost and labour % are understated until these are fixed.
                            </span>
                        </div>
                    )}

                    <div className={`${t.panel} border rounded-2xl p-4`}>
                        <h3 className={`${t.text} font-semibold text-sm mb-3 flex items-center gap-2`}><Users className="h-4 w-4" /> By staff member</h3>
                        {(staffQ.data || []).length === 0 ? (
                            <p className={`${t.sub} text-sm text-center py-6`}>No staff yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className={t.sub}>
                                            <th className="text-left font-medium pb-2">Staff</th>
                                            <th className="text-right font-medium pb-2">Shifts</th>
                                            <th className="text-right font-medium pb-2">Hours</th>
                                            <th className="text-right font-medium pb-2">Rate now</th>
                                            <th className="text-right font-medium pb-2">Pay</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(staffQ.data || []).map(member => {
                                            const row = perStaff.find(r => r.staff_id === member.id);
                                            const rate = currentRate(member.id);
                                            return (
                                                <React.Fragment key={member.id}>
                                                    <tr className={`border-t ${t.row}`}>
                                                        <td className={`${t.text} py-2.5`}>{member.full_name}</td>
                                                        <td className={`${t.text} py-2.5 text-right tabular-nums`}>{row?.shifts || 0}</td>
                                                        <td className={`${t.text} py-2.5 text-right tabular-nums`}>{((row?.minutes || 0) / 60).toFixed(1)}</td>
                                                        <td className="py-2.5 text-right tabular-nums">
                                                            {canSetRates ? (
                                                                <button onClick={() => { setEditing(member.id); setRateInput(rate ?? ''); }}
                                                                    className={`underline decoration-dotted ${rate === undefined ? 'text-amber-400' : t.text}`}>
                                                                    {rate === undefined ? 'Set rate' : `£${rate.toFixed(2)}`}
                                                                </button>
                                                            ) : (
                                                                <span className={t.sub}>{rate === undefined ? '—' : '•••'}</span>
                                                            )}
                                                        </td>
                                                        <td className={`${t.text} py-2.5 text-right tabular-nums font-semibold`}>
                                                            £{(row?.pay || 0).toFixed(2)}{row?.noRate && <span className="text-amber-400"> *</span>}
                                                        </td>
                                                    </tr>
                                                    {editing === member.id && (
                                                        <tr>
                                                            <td colSpan={5} className="pb-3">
                                                                <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border border-accent-500/30 bg-accent-500/5">
                                                                    <label className="flex flex-col gap-1">
                                                                        <span className={`${t.sub} text-[11px]`}>Hourly rate £</span>
                                                                        <input type="number" step="0.01" min="0" value={rateInput}
                                                                            onChange={e => setRateInput(e.target.value)}
                                                                            className={`h-11 w-28 rounded-lg px-2 ${t.input}`} />
                                                                    </label>
                                                                    <label className="flex flex-col gap-1">
                                                                        <span className={`${t.sub} text-[11px]`}>From</span>
                                                                        <input type="date" value={rateFrom} onChange={e => setRateFrom(e.target.value)}
                                                                            className={`h-11 rounded-lg px-2 ${t.input}`} />
                                                                    </label>
                                                                    <button onClick={() => saveRate(member.id)}
                                                                        className="h-11 px-4 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-bold">Save</button>
                                                                    <button onClick={() => setEditing(null)} className={`h-11 px-4 rounded-xl ${t.chip}`}>Cancel</button>
                                                                    <p className={`${t.sub} text-[11px] w-full`}>
                                                                        A new rate applies from its start date. Earlier shifts keep the rate they were worked at.
                                                                    </p>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {perStaff.some(r => r.noRate) && (
                                    <p className="text-amber-400 text-[11px] mt-2">* Some shifts have no rate set and aren&rsquo;t included in pay.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {flagged.length > 0 && (
                        <div className={`${t.panel} border rounded-2xl p-4`}>
                            <h3 className={`${t.text} font-semibold text-sm mb-2`}>Needs attention</h3>
                            <ul className="space-y-1.5">
                                {flagged.map(e => (
                                    <li key={e.id} className="text-xs p-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200">
                                        <strong>{e.staff_name}</strong> · {new Date(e.clock_in).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        {' — '}
                                        {isForgottenClockOut(e) ? 'still clocked in after 16h — probably forgot to clock out' : 'over 6 hours without a 20-minute break'}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
