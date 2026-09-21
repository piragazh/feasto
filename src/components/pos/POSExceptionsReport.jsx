import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ShieldAlert, Ban, Percent, Pencil, KeyRound, Loader2 } from 'lucide-react';

/**
 * Exceptions report.
 *
 * Shows the events an owner reviews when the till is short or something looks
 * wrong: voids, manual discounts, order edits, manager overrides, and failed or
 * locked-out logins - with WHO did each, and who authorised it.
 *
 * WHY THIS SHAPE
 *   The value of an audit trail is entirely in whether anyone reads it. Toast
 *   ships this as its Sales Exceptions report for the same reason: most till
 *   losses are not dramatic theft, they are a void here and a discount there
 *   that nobody notices until the totals drift. So this leads with the money,
 *   then lets you drill into the people.
 *
 * DATE FILTERING IS CLIENT-SIDE ON PURPOSE
 *   Server-side range operators on created_date silently match NOTHING on this
 *   platform - that is the bug that made today's orders vanish from History. A
 *   report that quietly returned zero exceptions would be worse than no report,
 *   because it would look like a clean day. So recent entries are fetched and
 *   the range is applied here.
 */

const TYPES = {
    'order.void':         { label: 'Voids',            icon: Ban,         tone: 'red' },
    'discount.apply':     { label: 'Manual discounts', icon: Percent,     tone: 'amber' },
    'coupon.apply':       { label: 'Coupons',          icon: Percent,     tone: 'slate' },
    'order.edit':         { label: 'Order edits',      icon: Pencil,      tone: 'blue' },
    'staff.login_failed': { label: 'Failed logins',    icon: KeyRound,    tone: 'red' },
    'staff.login_locked': { label: 'Lockouts',         icon: ShieldAlert, tone: 'red' },
};

const RANGES = {
    today:     { label: 'Today',       days: 0 },
    yesterday: { label: 'Yesterday',   days: 1 },
    week:      { label: 'Last 7 days', days: 7 },
    month:     { label: 'Last 30 days',days: 30 },
};

function rangeBounds(key) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    if (key === 'yesterday') {
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
    } else if (key === 'week' || key === 'month') {
        start.setDate(start.getDate() - RANGES[key].days);
    }
    return { start, end };
}

const TONE = {
    red:   'text-red-400 bg-red-500/10 border-red-500/30',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    blue:  'text-blue-300 bg-blue-500/10 border-blue-500/30',
    slate: 'text-gray-300 bg-white/5 border-white/10',
};

export default function POSExceptionsReport({ restaurantId, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const t = {
        panel: isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        text:  isDark ? 'text-white' : 'text-gray-900',
        sub:   isDark ? 'text-gray-400' : 'text-gray-500',
        row:   isDark ? 'border-white/[0.06]' : 'border-gray-100',
        chip:  isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
    };

    const [range, setRange] = useState('today');
    const [typeFilter, setTypeFilter] = useState('all');

    const { data: entries = [], isLoading, isError } = useQuery({
        queryKey: ['pos-exceptions', restaurantId],
        // Capped fetch, filtered by date below - see the header comment for why
        // the range is not pushed to the server.
        queryFn: () => base44.entities.PosAuditLog.filter({ restaurant_id: restaurantId }, '-created_date', 1000),
        enabled: !!restaurantId,
        refetchInterval: 60000,
    });

    const inRange = useMemo(() => {
        const { start, end } = rangeBounds(range);
        return entries.filter(e => {
            if (!TYPES[e.action]) return false;          // only exception types, not routine logins
            const d = e.created_date ? new Date(e.created_date) : null;
            return d && d >= start && d <= end;
        });
    }, [entries, range]);

    const visible = typeFilter === 'all' ? inRange : inRange.filter(e => e.action === typeFilter);

    // ── Money summary ────────────────────────────────────────────────────────
    const sumOf = (action) => inRange
        .filter(e => e.action === action && e.outcome !== 'denied')
        .reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0);

    const summary = {
        voided:     sumOf('order.void'),
        discounted: sumOf('discount.apply'),
        overrides:  inRange.filter(e => e.outcome === 'overridden').length,
        denied:     inRange.filter(e => e.outcome === 'denied').length,
    };

    // ── Per-person breakdown: where the money off is concentrated ───────────
    const byStaff = useMemo(() => {
        const map = new Map();
        for (const e of inRange) {
            if (e.outcome === 'denied') continue;
            const key = e.staff_id || '__unattributed';
            const name = e.staff_name || 'Unattributed';
            const row = map.get(key) || { name, voids: 0, voidValue: 0, discountValue: 0, edits: 0 };
            if (e.action === 'order.void') { row.voids += 1; row.voidValue += Math.abs(Number(e.amount || 0)); }
            if (e.action === 'discount.apply') row.discountValue += Math.abs(Number(e.amount || 0));
            if (e.action === 'order.edit') row.edits += 1;
            map.set(key, row);
        }
        return [...map.values()]
            .filter(r => r.voids || r.discountValue || r.edits)
            .sort((a, b) => (b.voidValue + b.discountValue) - (a.voidValue + a.discountValue));
    }, [inRange]);

    const fmtTime = (iso) => {
        const d = new Date(iso);
        return range === 'today'
            ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className={`${t.text} text-lg font-bold`}>Exceptions</h2>
                    <p className={`${t.sub} text-xs`}>Voids, discounts, edits, overrides and failed logins</p>
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Date range">
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
                    Could not load the audit log. This report is showing nothing because it failed, not because nothing happened.
                </div>
            )}

            {/* ── Money first ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Voided', value: `£${summary.voided.toFixed(2)}`, tone: 'red' },
                    { label: 'Manual discounts', value: `£${summary.discounted.toFixed(2)}`, tone: 'amber' },
                    { label: 'Manager overrides', value: summary.overrides, tone: 'blue' },
                    { label: 'Refused attempts', value: summary.denied, tone: 'slate' },
                ].map(c => (
                    <div key={c.label} className={`${t.panel} border rounded-2xl p-4`}>
                        <p className={`${t.sub} text-xs font-semibold uppercase tracking-wide`}>{c.label}</p>
                        <p className={`${t.text} text-2xl font-bold tabular-nums mt-1`}>{c.value}</p>
                    </div>
                ))}
            </div>

            {/* ── By person ────────────────────────────────────────────────── */}
            {byStaff.length > 0 && (
                <div className={`${t.panel} border rounded-2xl p-4`}>
                    <h3 className={`${t.text} font-semibold text-sm mb-3`}>By staff member</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className={t.sub}>
                                    <th className="text-left font-medium pb-2">Staff</th>
                                    <th className="text-right font-medium pb-2">Voids</th>
                                    <th className="text-right font-medium pb-2">Voided £</th>
                                    <th className="text-right font-medium pb-2">Discounted £</th>
                                    <th className="text-right font-medium pb-2">Edits</th>
                                </tr>
                            </thead>
                            <tbody>
                                {byStaff.map(r => (
                                    <tr key={r.name} className={`border-t ${t.row}`}>
                                        <td className={`${t.text} py-2`}>{r.name}</td>
                                        <td className={`${t.text} py-2 text-right tabular-nums`}>{r.voids}</td>
                                        <td className={`${t.text} py-2 text-right tabular-nums`}>£{r.voidValue.toFixed(2)}</td>
                                        <td className={`${t.text} py-2 text-right tabular-nums`}>£{r.discountValue.toFixed(2)}</td>
                                        <td className={`${t.text} py-2 text-right tabular-nums`}>{r.edits}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Detail ───────────────────────────────────────────────────── */}
            <div className={`${t.panel} border rounded-2xl p-4`}>
                <div className="flex flex-wrap gap-1.5 mb-3" role="radiogroup" aria-label="Exception type">
                    <button role="radio" aria-checked={typeFilter === 'all'} onClick={() => setTypeFilter('all')}
                        className={`h-11 px-3 rounded-xl text-xs font-semibold ${typeFilter === 'all' ? 'bg-orange-500 text-white' : t.chip}`}>
                        All ({inRange.length})
                    </button>
                    {Object.entries(TYPES).map(([key, cfg]) => {
                        const n = inRange.filter(e => e.action === key).length;
                        if (!n) return null;
                        return (
                            <button key={key} role="radio" aria-checked={typeFilter === key} onClick={() => setTypeFilter(key)}
                                className={`h-11 px-3 rounded-xl text-xs font-semibold ${typeFilter === key ? 'bg-orange-500 text-white' : t.chip}`}>
                                {cfg.label} ({n})
                            </button>
                        );
                    })}
                </div>

                {isLoading ? (
                    <div className={`${t.sub} text-sm py-10 flex items-center justify-center gap-2`}>
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                ) : visible.length === 0 ? (
                    <p className={`${t.sub} text-sm text-center py-10`}>
                        No exceptions {RANGES[range].label.toLowerCase()}.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {visible.map(e => {
                            const cfg = TYPES[e.action];
                            const Icon = cfg.icon;
                            return (
                                <li key={e.id} className={`flex gap-3 p-3 rounded-xl border ${TONE[cfg.tone]}`}>
                                    <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                            <p className="text-sm font-semibold">
                                                {cfg.label.replace(/s$/, '')}
                                                {e.outcome === 'overridden' && ' · overridden'}
                                                {e.outcome === 'denied' && ' · refused'}
                                            </p>
                                            <span className="text-xs opacity-70 tabular-nums">{fmtTime(e.created_date)}</span>
                                        </div>
                                        <p className="text-xs opacity-90 mt-0.5">
                                            {e.staff_name || 'Unattributed'}
                                            {e.staff_role ? ` (${e.staff_role})` : ''}
                                            {e.authorised_by_name ? ` · authorised by ${e.authorised_by_name}` : ''}
                                            {Number(e.amount) ? ` · £${Math.abs(Number(e.amount)).toFixed(2)}` : ''}
                                            {e.reason ? ` · ${String(e.reason).replace(/_/g, ' ')}` : ''}
                                        </p>
                                        {e.detail && <p className="text-[11px] opacity-60 mt-0.5 break-words">{e.detail}</p>}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
