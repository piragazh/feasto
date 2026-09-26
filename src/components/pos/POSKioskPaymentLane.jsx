import React, { useMemo, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Banknote, CreditCard, Monitor, Search, X, Loader2, Clock } from 'lucide-react';
import { getStaffSessionToken } from '@/lib/posStaffSession';
import { isAwaitingKioskPayment } from '@/lib/kiosk-payment';

// Re-exported so existing imports keep working.
export { isAwaitingKioskPayment };

/**
 * Kiosk orders waiting to be paid at the counter.
 *
 * The customer orders at the kiosk and walks to the till with their order
 * number. These orders must NOT be cooked until paid - a walk-away leaves food
 * nobody pays for - so they sit here, apart from the kitchen columns, until
 * staff take the payment. Taking it releases the order to the kitchen.
 *
 * Oldest first: that is the order customers reach the counter in.
 *
 * Staff type the number rather than scanning, because the kiosk has no printer
 * yet; the search matches on the digits alone, so "42" finds "K042".
 */


const digits = (s) => String(s || '').replace(/\D/g, '');
const minutesSince = (iso) => {
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 60000)) : 0;
};

export default function POSKioskPaymentLane({ orders = [], restaurantId, terminal, onPaid, isDark = true }) {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(null);
    const [paying, setPaying] = useState(null);      // 'cash' | 'card' while in flight
    const [, tick] = useState(0);

    // Keep the "waiting N min" ages current.
    useEffect(() => {
        const id = setInterval(() => tick(n => n + 1), 30000);
        return () => clearInterval(id);
    }, []);

    const waiting = useMemo(() => {
        const list = orders.filter(isAwaitingKioskPayment)
            .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        const q = digits(query);
        return q ? list.filter(o => digits(o.order_number).includes(q)) : list;
    }, [orders, query]);

    const total = orders.filter(isAwaitingKioskPayment).length;
    if (total === 0) return null;

    const takePayment = async (tender) => {
        if (!selected) return;
        setPaying(tender);
        try {
            const res = await base44.functions.invoke('confirmKioskPayment', {
                order_id: selected.id,
                tender,
                terminal: terminal ?? undefined,
                staff_session: getStaffSessionToken(restaurantId),
            });
            const data = res?.data ?? res;
            if (data?.error) throw new Error(data.error);
            toast.success(`Order ${selected.order_number} paid by ${tender} \u2014 sent to the kitchen`);
            setSelected(null);
            setQuery('');
            onPaid?.();
        } catch (e) {
            // Deliberately plain: staff must never assume a payment went
            // through when it did not.
            toast.error(`Payment NOT recorded: ${e?.message || 'please try again'}`);
        } finally {
            setPaying(null);
        }
    };

    const card = isDark ? 'bg-[#1a1d29] border-white/10' : 'bg-white border-gray-200';
    const sub = isDark ? 'text-gray-400' : 'text-gray-500';
    const text = isDark ? 'text-white' : 'text-gray-900';

    return (
        <section className="mb-5 rounded-2xl border-2 border-accent-500/50 bg-accent-500/5 p-4" aria-label="Kiosk orders awaiting payment">
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <h2 className={`flex items-center gap-2 font-bold text-lg ${text}`}>
                    <Monitor className="h-5 w-5 text-accent-500" />
                    Awaiting payment
                    <span className="ml-1 rounded-full bg-accent-500 text-white text-sm px-2.5 py-0.5 tabular-nums">{total}</span>
                </h2>
                <p className={`text-sm ${sub} flex-1 min-w-[12rem]`}>Kiosk orders &mdash; not sent to the kitchen until paid.</p>
                <div className="relative">
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${sub}`} />
                    <input
                        type="text"
                        inputMode="numeric"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Order number"
                        aria-label="Find a kiosk order by number"
                        className={`h-11 w-44 rounded-xl pl-9 pr-9 text-base font-semibold tabular-nums ${
                            isDark ? 'bg-black/30 border border-white/10 text-white' : 'bg-white border border-gray-300'
                        }`}
                    />
                    {query && (
                        <button onClick={() => setQuery('')} aria-label="Clear" className={`absolute right-2 top-1/2 -translate-y-1/2 ${sub}`}>
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {waiting.length === 0 ? (
                <p className={`text-sm ${sub} py-3`}>No order matches &ldquo;{query}&rdquo;.</p>
            ) : (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                    {waiting.map(o => {
                        const mins = minutesSince(o.created_date);
                        const itemCount = (o.items || []).reduce((s, i) => s + Number(i.quantity || 1), 0);
                        return (
                            <button
                                key={o.id}
                                onClick={() => setSelected(o)}
                                className={`${card} border rounded-xl p-3 text-left transition-all hover:border-accent-500 active:scale-[0.98] min-h-[112px] flex flex-col`}
                            >
                                <span className={`text-3xl font-extrabold tabular-nums tracking-tight ${text}`}>
                                    {o.order_number || o.id.slice(-4)}
                                </span>
                                <span className="text-accent-500 font-bold text-xl tabular-nums">
                                    &pound;{Number(o.total || 0).toFixed(2)}
                                </span>
                                <span className={`mt-auto pt-1 flex items-center gap-1 text-xs ${mins >= 10 ? 'text-amber-400 font-semibold' : sub}`}>
                                    <Clock className="h-3 w-3" />
                                    {itemCount} item{itemCount === 1 ? '' : 's'} &middot; {mins === 0 ? 'just now' : `${mins} min`}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Take payment */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !paying && setSelected(null)}>
                    <div
                        className={`${card} border rounded-2xl p-6 w-full max-w-md shadow-2xl`}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label={`Take payment for order ${selected.order_number}`}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <p className={`text-sm ${sub}`}>Kiosk order</p>
                                <p className={`text-4xl font-extrabold tabular-nums ${text}`}>{selected.order_number}</p>
                            </div>
                            <button onClick={() => !paying && setSelected(null)} aria-label="Close" className={sub}>
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <ul className={`mb-4 max-h-48 overflow-y-auto space-y-1 text-sm ${text}`}>
                            {(selected.items || []).map((it, i) => (
                                <li key={i} className="flex justify-between gap-3">
                                    <span className="truncate">{it.quantity}&times; {it.name}</span>
                                    <span className="tabular-nums">&pound;{(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}</span>
                                </li>
                            ))}
                        </ul>

                        <div className={`flex items-baseline justify-between border-t ${isDark ? 'border-white/10' : 'border-gray-200'} pt-3 mb-5`}>
                            <span className={`font-semibold ${sub}`}>To pay</span>
                            <span className="text-4xl font-extrabold text-accent-500 tabular-nums pos-display">
                                &pound;{Number(selected.total || 0).toFixed(2)}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => takePayment('cash')}
                                disabled={!!paying}
                                className="h-16 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {paying === 'cash' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Banknote className="h-6 w-6" />}
                                Cash
                            </button>
                            <button
                                onClick={() => takePayment('card')}
                                disabled={!!paying}
                                className="h-16 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {paying === 'card' ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-6 w-6" />}
                                Card
                            </button>
                        </div>
                        <p className={`text-xs ${sub} mt-3 text-center`}>
                            Take the money first. The order goes to the kitchen when you tap.
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}
