import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Phone, MessageCircle, Globe, FlaskConical, RefreshCw, Trash2, Plus, Copy, ChevronRight, X } from 'lucide-react';

// ── helpers ─────────────────────────────────────────────────────────────────
/** Same rule as aiOrderingCore phoneDigits: any UK/intl number -> E.164 digits, no +. */
function phoneDigits(raw) {
    let d = String(raw || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = '44' + d.slice(1);
    return /^\d{8,15}$/.test(d) ? d : '';
}
const showPhone = (d) => (!d ? '—' : String(d).startsWith('44') ? `0${String(d).slice(2)}` : `+${d}`);
const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const unwrap = (res) => (res && typeof res === 'object' && 'data' in res && 'status' in res ? res.data : res);

const CHANNEL = {
    phone: { label: 'Phone', icon: Phone, cls: 'bg-blue-100 text-blue-800' },
    whatsapp: { label: 'WhatsApp', icon: MessageCircle, cls: 'bg-green-100 text-green-800' },
    web_chat: { label: 'Web chat', icon: Globe, cls: 'bg-orange-100 text-orange-800' },
    test: { label: 'Test', icon: FlaskConical, cls: 'bg-gray-100 text-gray-700' },
};
const STATE = {
    active: 'bg-blue-50 text-blue-700', awaiting_payment: 'bg-amber-100 text-amber-800', ordered: 'bg-green-100 text-green-800',
    handoff: 'bg-purple-100 text-purple-800', closed: 'bg-gray-100 text-gray-600',
};
const ChannelBadge = ({ c }) => {
    const m = CHANNEL[c] || CHANNEL.test;
    const Icon = m.icon;
    return <Badge className={`${m.cls} gap-1`}><Icon className="h-3 w-3" />{m.label}</Badge>;
};

async function callCore(action, args) {
    try {
        return unwrap(await base44.functions.invoke('aiOrderingCore', { action, ...args }));
    } catch (e) {
        return e?.response?.data || { ok: false, error: e?.message };
    }
}

// ── Numbers ─────────────────────────────────────────────────────────────────
function NumbersTab({ restaurants, byId }) {
    const [rows, setRows] = useState(null);
    const [form, setForm] = useState({ restaurant_id: '', number: '', label: '', provider: 'retell', provider_ref: '', transfer_number: '' });
    const [saving, setSaving] = useState(false);
    const load = async () => setRows(await base44.entities.AiChannelNumber.list('-created_date', 500).catch(() => []));
    useEffect(() => { load(); }, []);

    const add = async () => {
        const number = phoneDigits(form.number);
        if (!form.restaurant_id) return toast.error('Choose a restaurant');
        if (!number) return toast.error("That doesn't look like a phone number");
        const transfer = form.transfer_number.trim() ? phoneDigits(form.transfer_number) : '';
        if (form.transfer_number.trim() && !transfer) return toast.error("The transfer number doesn't look right");
        const clash = (rows || []).find((r) => r.number === number && r.is_active !== false && r.channel === 'phone');
        if (clash) return toast.error(`${showPhone(number)} already answers for ${byId[clash.restaurant_id]?.name || 'another restaurant'}`);
        setSaving(true);
        try {
            await base44.entities.AiChannelNumber.create({
                restaurant_id: form.restaurant_id, channel: 'phone', number, is_active: true,
                label: form.label.trim() || undefined, provider: form.provider.trim() || undefined, provider_ref: form.provider_ref.trim() || undefined,
                transfer_number: transfer || undefined,
            });
            toast.success('Number linked');
            setForm({ restaurant_id: form.restaurant_id, number: '', label: '', provider: form.provider, provider_ref: '', transfer_number: '' });
            load();
        } catch (e) { toast.error(e?.message || 'Could not save'); } finally { setSaving(false); }
    };
    const toggle = async (r) => {
        if (r.is_active === false) {
            const clash = (rows || []).find((x) => x.id !== r.id && x.number === r.number && x.is_active !== false && x.channel === r.channel);
            if (clash) return toast.error(`That number is already active for ${byId[clash.restaurant_id]?.name || 'another restaurant'}`);
        }
        await base44.entities.AiChannelNumber.update(r.id, { is_active: r.is_active === false });
        load();
    };
    const remove = async (r) => {
        if (!window.confirm(`Remove ${showPhone(r.number)}? Calls to it will no longer reach the AI agent.`)) return;
        await base44.entities.AiChannelNumber.delete(r.id);
        load();
    };
    const endpoint = `${window.location.origin}/functions/retellVoice`;

    return (
        <div className="space-y-4">
            <div className="bg-white border rounded-xl p-4 text-sm text-gray-700 space-y-2">
                <p className="font-semibold text-gray-900">How the phone agent finds the restaurant</p>
                <p>When a call comes in, Retell asks MealDrop which restaurant the dialled number belongs to. Link the number here, and in Retell set the number's <b>Inbound Webhook URL</b> (and the agent's webhook) to:</p>
                <div className="flex items-center gap-2">
                    <code className="text-xs bg-gray-50 border rounded px-2 py-1 truncate flex-1">{endpoint}</code>
                    <Button size="sm" variant="ghost" aria-label="Copy endpoint" onClick={() => navigator.clipboard?.writeText(endpoint).then(() => toast.success('Copied'))}><Copy className="h-4 w-4" /></Button>
                </div>
                <p className="text-xs text-gray-500">Requests are checked with the <code>RETELL_API_KEY</code> secret. A call to a number that isn't linked (or is switched off) is rejected. Transfers go to the transfer number, or the restaurant's alert phone if that's empty.</p>
            </div>

            <div className="bg-white border rounded-xl p-4">
                <p className="font-semibold text-gray-900 mb-3">Link a phone number</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    <Select value={form.restaurant_id} onValueChange={(v) => setForm({ ...form, restaurant_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Restaurant" /></SelectTrigger>
                        <SelectContent>{restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder="Number, e.g. 01375 123456" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
                    <Input placeholder="Label (optional)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
                    <Input placeholder="Transfer calls to (optional)" value={form.transfer_number} onChange={(e) => setForm({ ...form, transfer_number: e.target.value })} />
                    <Button onClick={add} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}Link number</Button>
                </div>
                {form.number && !phoneDigits(form.number) && <p className="text-xs text-red-600 mt-2">Enter a full number, e.g. 01375 123456 or +44 1375 123456.</p>}
            </div>

            <div className="bg-white border rounded-xl overflow-hidden">
                {rows === null ? (
                    <div className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></div>
                ) : rows.length === 0 ? (
                    <p className="p-6 text-sm text-gray-500 text-center">No numbers linked yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr>
                                <th className="text-left p-3">Number</th><th className="text-left p-3">Restaurant</th><th className="text-left p-3">Label</th>
                                <th className="text-left p-3">Transfers to</th><th className="text-left p-3">Active</th><th className="p-3" />
                            </tr></thead>
                            <tbody className="divide-y">
                                {rows.map((r) => (
                                    <tr key={r.id}>
                                        <td className="p-3 font-medium whitespace-nowrap">{showPhone(r.number)}</td>
                                        <td className="p-3">{byId[r.restaurant_id]?.name || <span className="text-red-600">Missing restaurant</span>}</td>
                                        <td className="p-3 text-gray-600">{r.label || '—'}</td>
                                        <td className="p-3 text-gray-600">{r.transfer_number ? showPhone(r.transfer_number) : <span className="text-gray-400">alert phone</span>}</td>
                                        <td className="p-3"><Switch checked={r.is_active !== false} onCheckedChange={() => toggle(r)} /></td>
                                        <td className="p-3 text-right"><Button size="icon" variant="ghost" aria-label="Remove number" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-red-500" /></Button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Sessions ────────────────────────────────────────────────────────────────
function SessionsTab({ restaurants, byId }) {
    const [rows, setRows] = useState(null);
    const [channel, setChannel] = useState('all');
    const [state, setState] = useState('all');
    const [restaurant, setRestaurant] = useState('all');
    const [open, setOpen] = useState(null);
    const load = async () => setRows(await base44.entities.AiOrderSession.list('-updated_date', 300).catch(() => []));
    useEffect(() => { load(); }, []);

    const shown = useMemo(() => (rows || []).filter((s) => (channel === 'all' || s.channel === channel)
        && (state === 'all' || s.state === state) && (restaurant === 'all' || s.restaurant_id === restaurant)), [rows, channel, state, restaurant]);

    const stats = useMemo(() => {
        const since = Date.now() - 7 * 864e5;
        const week = (rows || []).filter((s) => new Date(s.created_date).getTime() > since && s.channel !== 'test');
        const by = {};
        for (const s of week) {
            by[s.channel] = by[s.channel] || { sessions: 0, orders: 0, handoffs: 0 };
            by[s.channel].sessions++;
            if (s.order_id) by[s.channel].orders++;
            if (s.state === 'handoff') by[s.channel].handoffs++;
        }
        return by;
    }, [rows]);

    const total = (s) => (s.cart || []).reduce((n, l) => n + (Number(l.price) || 0) * (Number(l.quantity) || 1), 0);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {['phone', 'whatsapp', 'web_chat'].map((c) => {
                    const st = stats[c] || { sessions: 0, orders: 0, handoffs: 0 };
                    return (
                        <div key={c} className="bg-white border rounded-xl p-4">
                            <div className="flex items-center justify-between"><ChannelBadge c={c} /><span className="text-xs text-gray-400">last 7 days</span></div>
                            <p className="text-2xl font-bold text-gray-900 mt-2">{st.sessions}</p>
                            <p className="text-xs text-gray-500">conversations · {st.orders} orders ({st.sessions ? Math.round((st.orders / st.sessions) * 100) : 0}%) · {st.handoffs} to staff</p>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap gap-2 items-center">
                <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All channels</SelectItem>{Object.entries(CHANNEL).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={state} onValueChange={setState}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All states</SelectItem>{Object.keys(STATE).map((k) => <SelectItem key={k} value={k}>{k.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={restaurant} onValueChange={setRestaurant}>
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All restaurants</SelectItem>{restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>
                <span className="text-xs text-gray-400 ml-auto">{shown.length} shown (latest 300)</span>
            </div>

            <div className="grid lg:grid-cols-[1fr_380px] gap-4">
                <div className="bg-white border rounded-xl overflow-hidden">
                    {rows === null ? (
                        <div className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></div>
                    ) : shown.length === 0 ? (
                        <p className="p-6 text-sm text-gray-500 text-center">No conversations match.</p>
                    ) : (
                        <ul className="divide-y">
                            {shown.map((s) => (
                                <li key={s.id}>
                                    <button type="button" onClick={() => setOpen(s)} className={`w-full text-left p-3 hover:bg-gray-50 flex items-center gap-3 ${open?.id === s.id ? 'bg-orange-50' : ''}`}>
                                        <ChannelBadge c={s.channel} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-900 truncate">{byId[s.restaurant_id]?.name || s.restaurant_id} · {s.customer_name || showPhone(s.customer_phone)}</p>
                                            <p className="text-xs text-gray-500">{when(s.updated_date)} · {(s.cart || []).reduce((n, l) => n + (l.quantity || 1), 0)} items · {money(total(s))}</p>
                                        </div>
                                        <Badge className={STATE[s.state] || ''}>{String(s.state || '').replace('_', ' ')}</Badge>
                                        <ChevronRight className="h-4 w-4 text-gray-300" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {open && (
                    <div className="bg-white border rounded-xl p-4 space-y-4 h-fit lg:sticky lg:top-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="font-semibold text-gray-900">{byId[open.restaurant_id]?.name}</p>
                                <p className="text-xs text-gray-500">{open.customer_name || 'No name'} · {showPhone(open.customer_phone)}</p>
                                <p className="text-xs text-gray-400 mt-0.5">Started {when(open.started_at || open.created_date)}{open.ended_at ? ` · ended ${when(open.ended_at)}` : ''}</p>
                            </div>
                            <Button size="icon" variant="ghost" aria-label="Close" onClick={() => setOpen(null)}><X className="h-4 w-4" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            <ChannelBadge c={open.channel} />
                            <Badge className={STATE[open.state] || ''}>{String(open.state || '').replace('_', ' ')}</Badge>
                            {open.order_type && <Badge variant="outline">{open.order_type}</Badge>}
                            {open.order_id && <Badge className="bg-green-600 text-white">Order …{String(open.order_id).slice(-6)}</Badge>}
                        </div>
                        {open.handoff_reason && <p className="text-xs bg-purple-50 text-purple-900 rounded p-2">Handed to staff: {open.handoff_reason}</p>}
                        {open.channel === 'phone' && (open.call_duration_ms || open.recording_url || open.call_summary) && (
                            <div className="space-y-2">
                                <p className="text-xs text-gray-600">
                                    Call {open.call_duration_ms ? `${Math.floor(open.call_duration_ms / 60000)}m ${Math.round((open.call_duration_ms % 60000) / 1000)}s` : ''}
                                    {open.disconnection_reason ? ` · ${open.disconnection_reason.replace(/_/g, ' ')}` : ''}
                                </p>
                                {open.call_summary && <p className="text-xs bg-gray-50 rounded p-2 text-gray-700">{open.call_summary}</p>}
                                {open.recording_url && <audio controls preload="none" src={open.recording_url} className="w-full h-9" />}
                                {open.transcript && (
                                    <details className="text-xs">
                                        <summary className="cursor-pointer text-gray-500">Transcript</summary>
                                        <pre className="whitespace-pre-wrap bg-gray-50 rounded p-2 mt-1 max-h-72 overflow-y-auto font-sans">{open.transcript}</pre>
                                    </details>
                                )}
                            </div>
                        )}
                        <div>
                            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Basket</p>
                            {(open.cart || []).length ? (
                                <ul className="text-sm space-y-1">
                                    {open.cart.map((l, i) => (
                                        <li key={i} className="flex justify-between gap-2">
                                            <span className="min-w-0">{l.quantity}× {l.name}{l.options_summary ? <span className="text-gray-400"> ({l.options_summary})</span> : null}</span>
                                            <span className="shrink-0">{money(l.price * l.quantity)}</span>
                                        </li>
                                    ))}
                                    <li className="flex justify-between font-semibold border-t pt-1"><span>Items</span><span>{money(total(open))}</span></li>
                                </ul>
                            ) : <p className="text-sm text-gray-400">Empty</p>}
                        </div>
                        {open.delivery_quote && (
                            <p className="text-xs text-gray-600">Delivery check: {open.delivery_quote.postcode} — {open.delivery_quote.available ? `yes, fee ${money(open.delivery_quote.fee)}, min ${money(open.delivery_quote.minimum_order)}` : 'outside the area'}</p>
                        )}
                        <div>
                            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">What happened</p>
                            <ol className="text-xs space-y-1 max-h-72 overflow-y-auto">
                                {[...(open.event_log || [])].reverse().map((e, i) => (
                                    <li key={i} className="flex gap-2">
                                        <span className="text-gray-400 shrink-0 w-12">{e.at ? new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                        <span className={e.ok ? 'text-gray-700' : 'text-red-600'}>{e.action}{e.note ? ` — ${e.note}` : ''}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Test console ────────────────────────────────────────────────────────────
const ACTIONS = ['get_context', 'browse_menu', 'search_menu', 'get_item', 'add_item', 'choose_option', 'cancel_pending', 'remove_item',
    'set_quantity', 'clear_basket', 'get_basket', 'set_order_type', 'check_delivery', 'set_customer', 'send_payment_link', 'place_cash_order', 'handoff', 'end_session'];
const EXAMPLES = {
    browse_menu: '{ "mode": "categories" }', search_menu: '{ "query": "chicken burger" }', get_item: '{ "menu_item_id": "" }',
    add_item: '{ "menu_item_id": "", "quantity": 1, "options": {} }', choose_option: '{ "option_index": 0 }', remove_item: '{ "line": 1 }',
    set_quantity: '{ "line": 1, "quantity": 2 }', set_order_type: '{ "order_type": "collection" }', check_delivery: '{ "postcode": "RM18 7AA" }',
    set_customer: '{ "name": "Test", "phone": "07700900123", "address": "1 Test Street" }', send_payment_link: '{ "send_sms": false }',
    place_cash_order: '{ "dry_run": true }', handoff: '{ "reason": "test" }', end_session: '{ "outcome": "test" }',
};

function TestConsole({ restaurants }) {
    const [restaurantId, setRestaurantId] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [action, setAction] = useState('search_menu');
    const [args, setArgs] = useState(EXAMPLES.search_menu);
    const [log, setLog] = useState([]);
    const [busy, setBusy] = useState(false);

    const run = async (a, parsed) => {
        setBusy(true);
        const res = await callCore(a, parsed);
        setLog((l) => [{ at: new Date(), action: a, args: parsed, res }, ...l].slice(0, 30));
        setBusy(false);
        return res;
    };
    const start = async () => {
        if (!restaurantId) return toast.error('Choose a restaurant');
        const r = await run('start_session', { channel: 'test', restaurant_id: restaurantId, customer_phone: '07700900123', customer_name: 'Test' });
        if (r?.ok) setSessionId(r.session_id);
    };
    const send = async () => {
        let parsed = {};
        try { parsed = args.trim() ? JSON.parse(args) : {}; } catch { return toast.error('Arguments must be valid JSON'); }
        if (!sessionId) return toast.error('Start a test session first');
        await run(action, { ...parsed, session_id: sessionId });
    };

    return (
        <div className="grid lg:grid-cols-[360px_1fr] gap-4">
            <div className="bg-white border rounded-xl p-4 space-y-3 h-fit">
                <p className="text-sm text-gray-600">Drive the ordering core by hand, exactly as a voice or chat agent would. Test sessions never send texts unless you ask, and <code>place_cash_order</code> with <code>dry_run</code> creates nothing.</p>
                <div>
                    <Label className="text-xs text-gray-500">Restaurant</Label>
                    <Select value={restaurantId} onValueChange={(v) => { setRestaurantId(v); setSessionId(''); }}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Choose" /></SelectTrigger>
                        <SelectContent>{restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <Button className="w-full" variant={sessionId ? 'outline' : 'default'} onClick={start} disabled={busy}>
                    {sessionId ? 'Start a new test session' : 'Start test session'}
                </Button>
                {sessionId && <p className="text-xs text-gray-500 break-all">Session {sessionId}</p>}
                <div>
                    <Label className="text-xs text-gray-500">Action</Label>
                    <Select value={action} onValueChange={(v) => { setAction(v); setArgs(EXAMPLES[v] || '{}'); }}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div>
                    <Label className="text-xs text-gray-500">Arguments (JSON)</Label>
                    <Textarea className="mt-1 font-mono text-xs" rows={5} value={args} onChange={(e) => setArgs(e.target.value)} />
                </div>
                {action === 'place_cash_order' && !/dry_run"\s*:\s*true/.test(args) && (
                    <p className="text-xs text-red-600">Without dry_run this places a REAL cash order that will reach the restaurant.</p>
                )}
                <Button className="w-full" onClick={send} disabled={busy || !sessionId}>{busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}Run</Button>
            </div>
            <div className="space-y-3">
                {log.length === 0 && <div className="bg-white border rounded-xl p-6 text-sm text-gray-500 text-center">Responses appear here.</div>}
                {log.map((e, i) => (
                    <div key={i} className="bg-white border rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold font-mono">{e.action}</p>
                            <Badge className={e.res?.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>{e.res?.ok ? 'ok' : (e.res?.code || 'error')}</Badge>
                        </div>
                        {e.res?.say && <p className="text-sm text-gray-800 mt-1.5 italic">“{e.res.say}”</p>}
                        <pre className="text-[11px] bg-gray-50 rounded p-2 mt-2 overflow-x-auto max-h-64">{JSON.stringify(e.res, null, 2)}</pre>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function AiOrderingAdmin() {
    const [restaurants, setRestaurants] = useState([]);
    useEffect(() => { base44.entities.Restaurant.list('name', 500).then(setRestaurants).catch(() => setRestaurants([])); }, []);
    const byId = useMemo(() => Object.fromEntries(restaurants.map((r) => [r.id, r])), [restaurants]);

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">AI Ordering</h2>
                <p className="text-sm text-gray-500">One ordering core behind the phone, WhatsApp and website chat agents. Link phone numbers, review conversations, and test the core.</p>
            </div>
            <Tabs defaultValue="sessions">
                <TabsList>
                    <TabsTrigger value="sessions">Conversations</TabsTrigger>
                    <TabsTrigger value="numbers">Phone numbers</TabsTrigger>
                    <TabsTrigger value="test">Test console</TabsTrigger>
                </TabsList>
                <TabsContent value="sessions" className="mt-4"><SessionsTab restaurants={restaurants} byId={byId} /></TabsContent>
                <TabsContent value="numbers" className="mt-4"><NumbersTab restaurants={restaurants} byId={byId} /></TabsContent>
                <TabsContent value="test" className="mt-4"><TestConsole restaurants={restaurants} /></TabsContent>
            </Tabs>
        </div>
    );
}
