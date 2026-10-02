import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Lock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { getStaffSessionToken } from '@/lib/posStaffSession';
import { UK_DENOMINATIONS, countTotal } from '@/lib/pos-cash-logic';

/**
 * Cash drawer for one till.
 *
 * THE COUNT IS BLIND
 *   While the drawer is open this screen never has the expected figure - the
 *   server strips it from every response until the count is submitted. That is
 *   deliberate: if the person counting can see the target, a short drawer gets
 *   "counted" up to match, and the variance report measures how well staff hide
 *   shortfalls rather than whether there are any.
 *
 * COUNT BY DENOMINATION
 *   Offered because it is how cash is actually counted, and because it is
 *   summed in whole pence - adding seven 5p coins in floating point gives
 *   0.35000000000000003, which would report a phantom 1p variance.
 */

function DenominationCounter({ counts, onChange, t }) {
    return (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {UK_DENOMINATIONS.map(d => {
                const label = d >= 1 ? `£${d}` : `${Math.round(d * 100)}p`;
                return (
                    <label key={d} className={`flex flex-col gap-1 p-2 rounded-xl border ${t.box}`}>
                        <span className={`${t.sub} text-[11px] font-semibold`}>{label}</span>
                        <input
                            type="number" inputMode="numeric" min="0" step="1"
                            value={counts[String(d)] ?? ''}
                            onChange={e => onChange({ ...counts, [String(d)]: e.target.value })}
                            aria-label={`Number of ${label}`}
                            className={`h-11 w-full rounded-lg px-2 text-base font-bold tabular-nums ${t.input}`}
                        />
                    </label>
                );
            })}
        </div>
    );
}

export default function POSCashDrawer({ restaurantId, terminal = 1, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const t = {
        panel: isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        box:   isDark ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50',
        input: isDark ? 'bg-[#0f1117] border border-white/10 text-white' : 'bg-white border border-gray-300 text-gray-900',
        text:  isDark ? 'text-white' : 'text-gray-900',
        sub:   isDark ? 'text-gray-400' : 'text-gray-500',
        btn:   isDark ? 'bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10' : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200',
    };
    const qc = useQueryClient();
    const [busy, setBusy] = useState(false);
    const [counts, setCounts] = useState({});
    const [mode, setMode] = useState(null);         // null | 'paid_in' | 'paid_out' | 'close'
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [result, setResult] = useState(null);     // the closed session, revealed after count
    const [signOffNote, setSignOffNote] = useState('');

    const call = async (action, extra = {}) => {
        const res = await base44.functions.invoke('posCashSession', {
            action, restaurant_id: restaurantId, terminal,
            staff_session: getStaffSessionToken(restaurantId),
            ...extra,
        });
        const data = res?.data ?? res;
        // invoke() resolves with the error body rather than throwing on a 4xx -
        // ignoring that is how a failed action looks like a success.
        if (data?.error) throw new Error(data.error);
        return data;
    };

    const { data, isLoading, isError } = useQuery({
        queryKey: ['cash-session', restaurantId, terminal],
        queryFn: () => call('status'),
        enabled: !!restaurantId,
    });
    const session = data?.session || null;

    const run = async (fn) => {
        setBusy(true);
        try { await fn(); }
        catch (e) { toast.error(e?.message || 'Something went wrong'); }
        finally { setBusy(false); }
    };

    const counted = countTotal(counts);

    // ── Revealed result after a count ────────────────────────────────────────
    if (result) {
        const v = Number(result.variance || 0);
        const tone = v === 0 ? 'text-green-400' : Math.abs(v) <= 5 ? 'text-amber-300' : 'text-red-400';
        return (
            <div className={`${t.panel} border rounded-2xl p-5 space-y-4`}>
                <h3 className={`${t.text} text-lg font-bold flex items-center gap-2`}>
                    <Lock className="h-5 w-5" /> Till {terminal} closed
                </h3>
                <div className="grid grid-cols-3 gap-3">
                    {[['Counted', result.counted_cash], ['Expected', result.expected_cash]].map(([l, n]) => (
                        <div key={l} className={`p-3 rounded-xl border ${t.box}`}>
                            <p className={`${t.sub} text-xs font-semibold uppercase`}>{l}</p>
                            <p className={`${t.text} text-2xl font-bold tabular-nums`}>£{Number(n || 0).toFixed(2)}</p>
                        </div>
                    ))}
                    <div className={`p-3 rounded-xl border ${t.box}`}>
                        <p className={`${t.sub} text-xs font-semibold uppercase`}>{v < 0 ? 'Short' : v > 0 ? 'Over' : 'Exact'}</p>
                        <p className={`${tone} text-2xl font-bold tabular-nums`}>£{Math.abs(v).toFixed(2)}</p>
                    </div>
                </div>
                <p className={`${t.sub} text-xs`}>
                    Float £{Number(result.opening_float || 0).toFixed(2)} + cash sales £{Number(result.cash_sales || 0).toFixed(2)}
                    {' '}+ paid in £{Number(result.paid_in || 0).toFixed(2)} − paid out £{Number(result.paid_out || 0).toFixed(2)}
                </p>
                {result.legacy_split_count > 0 && (
                    <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs flex gap-2">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        {result.legacy_split_count} split payment(s) from before cash amounts were recorded couldn&rsquo;t be
                        counted, so the expected figure is incomplete. Don&rsquo;t treat this variance as reliable on its own.
                    </div>
                )}
                {result.needs_sign_off ? (
                    <div className="space-y-2">
                        <p className="text-red-300 text-sm font-semibold">This variance needs a manager to sign it off.</p>
                        <textarea
                            value={signOffNote} onChange={e => setSignOffNote(e.target.value)}
                            placeholder="What explains it? e.g. change given wrongly on a £50 note"
                            className={`w-full min-h-[80px] rounded-xl p-3 text-sm ${t.input}`}
                        />
                        <button
                            disabled={busy || !signOffNote.trim()}
                            onClick={() => run(async () => {
                                const d = await call('sign_off', { session_id: result.id, note: signOffNote });
                                setResult(d.session);
                                toast.success('Variance signed off');
                            })}
                            className="h-12 w-full rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-bold disabled:opacity-40">
                            Manager sign-off
                        </button>
                        <p className={`${t.sub} text-[11px]`}>
                            Must be a manager, and not the person who did the count.
                        </p>
                    </div>
                ) : result.signed_off_by_name ? (
                    <p className="text-green-400 text-sm flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" /> Signed off by {result.signed_off_by_name}
                    </p>
                ) : null}
                <button onClick={() => { setResult(null); setCounts({}); qc.invalidateQueries({ queryKey: ['cash-session', restaurantId, terminal] }); }}
                    className={`h-12 w-full rounded-xl font-semibold ${t.btn}`}>
                    Done
                </button>
            </div>
        );
    }

    if (isLoading) {
        return <div className={`${t.panel} border rounded-2xl p-8 flex justify-center ${t.sub}`}><Loader2 className="h-5 w-5 animate-spin" /></div>;
    }
    if (isError) {
        return (
            <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
                Could not load the cash drawer for till {terminal}.
            </div>
        );
    }

    // ── No open session: open the till ───────────────────────────────────────
    if (!session) {
        return (
            <div className={`${t.panel} border rounded-2xl p-5 space-y-4`}>
                <h3 className={`${t.text} text-lg font-bold flex items-center gap-2`}>
                    <Wallet className="h-5 w-5" /> Open till {terminal}
                </h3>
                <p className={`${t.sub} text-sm`}>Count the float into the drawer.</p>
                <DenominationCounter counts={counts} onChange={setCounts} t={t} />
                <div className="flex items-center justify-between">
                    <span className={`${t.sub} text-sm`}>Float</span>
                    <span className={`${t.text} text-3xl font-bold tabular-nums`}>£{counted.toFixed(2)}</span>
                </div>
                <button
                    disabled={busy}
                    onClick={() => run(async () => {
                        await call('open', { opening_float: counted });
                        setCounts({});
                        qc.invalidateQueries({ queryKey: ['cash-session', restaurantId, terminal] });
                        toast.success(`Till ${terminal} opened`);
                    })}
                    className="h-14 w-full rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-bold text-base disabled:opacity-40">
                    Open till with £{counted.toFixed(2)}
                </button>
            </div>
        );
    }

    // ── Open session ─────────────────────────────────────────────────────────
    return (
        <div className={`${t.panel} border rounded-2xl p-5 space-y-4`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className={`${t.text} text-lg font-bold flex items-center gap-2`}>
                        <Wallet className="h-5 w-5" /> Till {terminal} open
                    </h3>
                    <p className={`${t.sub} text-xs`}>
                        Since {new Date(session.opened_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        {session.opened_by_name ? ` by ${session.opened_by_name}` : ''} · float £{Number(session.opening_float || 0).toFixed(2)}
                    </p>
                </div>
            </div>

            {(session.movements || []).length > 0 && (
                <ul className="space-y-1.5">
                    {session.movements.map((m, i) => (
                        <li key={i} className={`flex justify-between text-sm p-2 rounded-lg border ${t.box}`}>
                            <span className={t.text}>
                                {m.type === 'paid_in' ? '↓ In' : '↑ Out'} · {m.reason}
                                <span className={`${t.sub} text-xs`}> · {m.staff_name}</span>
                            </span>
                            <span className={`${t.text} tabular-nums font-semibold`}>£{Number(m.amount).toFixed(2)}</span>
                        </li>
                    ))}
                </ul>
            )}

            {!mode && (
                <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setMode('paid_in')} className={`h-14 rounded-xl text-sm font-semibold flex flex-col items-center justify-center gap-0.5 ${t.btn}`}>
                        <ArrowDownCircle className="h-5 w-5" /> Paid in
                    </button>
                    <button onClick={() => setMode('paid_out')} className={`h-14 rounded-xl text-sm font-semibold flex flex-col items-center justify-center gap-0.5 ${t.btn}`}>
                        <ArrowUpCircle className="h-5 w-5" /> Paid out
                    </button>
                    <button onClick={() => setMode('close')} className="h-14 rounded-xl text-sm font-bold bg-accent-500 hover:bg-accent-600 text-white flex flex-col items-center justify-center gap-0.5">
                        <Lock className="h-5 w-5" /> Close till
                    </button>
                </div>
            )}

            {(mode === 'paid_in' || mode === 'paid_out') && (
                <div className="space-y-2">
                    <p className={`${t.text} font-semibold`}>{mode === 'paid_in' ? 'Cash added to the drawer' : 'Cash taken from the drawer'}</p>
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={amount}
                        onChange={e => setAmount(e.target.value)} placeholder="Amount £"
                        aria-label="Amount" className={`h-12 w-full rounded-xl px-3 text-lg font-bold ${t.input}`} />
                    <input value={reason} onChange={e => setReason(e.target.value)}
                        placeholder={mode === 'paid_in' ? 'e.g. change top-up from the safe' : 'e.g. cash tips paid to staff'}
                        aria-label="Reason" className={`h-12 w-full rounded-xl px-3 ${t.input}`} />
                    <p className={`${t.sub} text-[11px]`}>A reason is required &mdash; an unexplained movement is what a variance report looks for.</p>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => { setMode(null); setAmount(''); setReason(''); }} className={`h-12 rounded-xl font-semibold ${t.btn}`}>Cancel</button>
                        <button disabled={busy || !(Number(amount) > 0) || !reason.trim()}
                            onClick={() => run(async () => {
                                await call('movement', { type: mode, amount: Number(amount), reason });
                                setMode(null); setAmount(''); setReason('');
                                qc.invalidateQueries({ queryKey: ['cash-session', restaurantId, terminal] });
                                toast.success('Recorded');
                            })}
                            className="h-12 rounded-xl font-bold bg-accent-500 hover:bg-accent-600 text-white disabled:opacity-40">
                            Record
                        </button>
                    </div>
                </div>
            )}

            {mode === 'close' && (
                <div className="space-y-3">
                    <p className={`${t.text} font-semibold`}>Count everything in the drawer</p>
                    <p className={`${t.sub} text-xs`}>
                        You won&rsquo;t see what&rsquo;s expected until you submit. Count what&rsquo;s actually there.
                    </p>
                    <DenominationCounter counts={counts} onChange={setCounts} t={t} />
                    <div className="flex items-center justify-between">
                        <span className={`${t.sub} text-sm`}>Counted</span>
                        <span className={`${t.text} text-3xl font-bold tabular-nums`}>£{counted.toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => { setMode(null); setCounts({}); }} className={`h-12 rounded-xl font-semibold ${t.btn}`}>Cancel</button>
                        <button disabled={busy}
                            onClick={() => run(async () => {
                                const d = await call('close', { counted_cash: counted, counted_denominations: counts });
                                setMode(null);
                                setResult(d.session);
                            })}
                            className="h-12 rounded-xl font-bold bg-accent-500 hover:bg-accent-600 text-white disabled:opacity-40">
                            Submit count
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
