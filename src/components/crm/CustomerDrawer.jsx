import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Crown, Phone, Mail, MapPin, AlertTriangle, Smartphone, MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { crm, money, shortDate, daysAgo, STAGE } from './crmClient';

const CH = [
    { ch: 'sms', label: 'SMS', icon: Smartphone },
    { ch: 'email', label: 'Email', icon: Mail },
    { ch: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];
const METHOD = {
    checkout_tickbox: 'Checkout tickbox', soft_opt_in: 'Checkout (pre-ticked)', pos_verbal: 'Asked at the till',
    staff_manual: 'Changed by staff', unsubscribe_link: 'Unsubscribe link', stop_reply: 'Replied STOP',
    whatsapp_optin: 'WhatsApp opt-in', signup_form: 'Sign-up form', import: 'Import',
};

export default function CustomerDrawer({ restaurantId, profileId, onClose }) {
    const qc = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: ['crm-customer', restaurantId, profileId],
        queryFn: () => crm(restaurantId, 'customer_get', { profile_id: profileId }),
        enabled: !!profileId,
    });
    const [notes, setNotes] = useState('');
    const [tagInput, setTagInput] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { setNotes(data?.profile?.notes || ''); }, [data?.profile?.notes, profileId]);

    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['crm-customer', restaurantId, profileId] });
        qc.invalidateQueries({ queryKey: ['crm-customers', restaurantId] });
    };

    const save = async (payload, msg = 'Saved') => {
        setSaving(true);
        try { await crm(restaurantId, 'customer_update', { profile_id: profileId, ...payload }); toast.success(msg); refresh(); }
        catch (e) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const changeConsent = (channel, granted) => {
        if (granted) {
            const note = window.prompt(`How did the customer agree to ${channel.toUpperCase()} offers? (e.g. "asked in shop today")`);
            if (!note) return;
            save({ consent_change: { channel, action: 'grant', note } }, 'Consent recorded');
        } else {
            if (!window.confirm(`Stop sending ${channel.toUpperCase()} offers to this customer?`)) return;
            save({ consent_change: { channel, action: 'withdraw' } }, 'Opted out');
        }
    };

    const p = data?.profile;

    return (
        <Sheet open={!!profileId} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
                {isLoading || !p ? (
                    <div className="py-24 flex justify-center">{error ? <p className="text-sm text-red-600">{error.message}</p> : <Loader2 className="h-6 w-6 animate-spin text-orange-500" />}</div>
                ) : (
                    <div className="space-y-5">
                        <SheetHeader>
                            <SheetTitle className="flex items-center gap-2 text-xl">
                                {p.name}{p.is_vip && <Crown className="h-5 w-5 text-amber-500" />}
                            </SheetTitle>
                            <div className="flex flex-wrap gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAGE[p.stage]?.className}`}>{STAGE[p.stage]?.label}</span>
                                {!p.marketing_eligible && <Badge variant="outline">Marketplace only — cannot be messaged</Badge>}
                                {p.possible_shared_number && <Badge variant="outline" className="text-amber-700 border-amber-300"><AlertTriangle className="h-3 w-3 mr-1" />Possibly a shared phone</Badge>}
                            </div>
                        </SheetHeader>

                        <div className="space-y-1.5 text-sm">
                            {p.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" />{p.phone.replace(/^\+44/, '0')}</div>}
                            {p.emails?.map(e => <div key={e} className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" />{e}</div>)}
                            {p.addresses?.[0] && <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-gray-400 mt-0.5" /><span>{p.addresses[0].address}</span></div>}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {[
                                ['Orders', p.order_count], ['Spend', money(p.total_spend)], ['Average', money(p.avg_order_value)],
                                ['Last order', daysAgo(p.last_order_at)], ['Customer since', shortDate(p.first_order_at)],
                                ['Usually every', p.avg_days_between_orders ? `${Math.round(p.avg_days_between_orders)} days` : '—'],
                            ].map(([k, v]) => (
                                <div key={k} className="rounded-lg bg-gray-50 p-2.5"><div className="text-[11px] text-gray-500">{k}</div><div className="text-sm font-semibold">{v}</div></div>
                            ))}
                        </div>

                        {p.favourite_items?.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold mb-1.5">Favourites</h4>
                                <div className="flex flex-wrap gap-1.5">{p.favourite_items.map(i => <Badge key={i.name} variant="secondary">{i.name} ×{i.quantity}</Badge>)}</div>
                            </div>
                        )}

                        <div>
                            <h4 className="text-sm font-semibold mb-2">Marketing consent</h4>
                            <div className="space-y-2">
                                {CH.map(({ ch, label, icon: Icon }) => {
                                    const on = !!p.consent?.[ch];
                                    return (
                                        <div key={ch} className="flex items-center justify-between rounded-lg border p-2.5">
                                            <span className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-gray-400" />{label}</span>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-medium ${on ? 'text-green-700' : 'text-gray-500'}`}>{on ? 'Agreed' : 'Not agreed'}</span>
                                                <Button size="sm" variant="outline" disabled={saving || !p.marketing_eligible} onClick={() => changeConsent(ch, !on)}>{on ? 'Opt out' : 'Record consent'}</Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {data.consent_history?.length > 0 && (
                                <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                                    {data.consent_history.slice(0, 6).map((r, i) => (
                                        <div key={i}>{shortDate(r.at)} · {r.channel.toUpperCase()} {r.action === 'grant' ? 'agreed' : 'opted out'} · {METHOD[r.method] || r.method}{r.captured_by ? ` (${r.captured_by})` : ''}</div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold mb-1.5">Tags</h4>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {(p.tags || []).map(t => (
                                    <Badge key={t} variant="secondary" className="gap-1">{t}
                                        <button onClick={() => save({ tags: p.tags.filter(x => x !== t) }, 'Tag removed')}><X className="h-3 w-3" /></button>
                                    </Badge>
                                ))}
                            </div>
                            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (tagInput.trim()) { save({ tags: [...(p.tags || []), tagInput.trim()] }, 'Tag added'); setTagInput(''); } }}>
                                <Input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Add a tag, e.g. student" className="h-9" />
                                <Button type="submit" size="sm" variant="outline" disabled={saving}>Add</Button>
                            </form>
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold mb-1.5">Staff notes</h4>
                            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Allergies, preferences, anything staff should know" />
                            <Button size="sm" className="mt-2 bg-orange-500 hover:bg-orange-600" disabled={saving || notes === (p.notes || '')} onClick={() => save({ notes })}>Save notes</Button>
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold mb-2">Orders ({data.orders.length})</h4>
                            <div className="space-y-1.5 max-h-72 overflow-y-auto">
                                {data.orders.map(o => (
                                    <div key={o.id} className="rounded-lg border p-2.5 text-sm">
                                        <div className="flex justify-between"><span className="font-medium">{shortDate(o.created_date)}</span><span className="font-semibold">{money(o.total)}</span></div>
                                        <div className="text-xs text-gray-500">{o.status} · {o.order_type} · {o.order_source || 'online'}{o.coupon_codes?.length ? ` · code ${o.coupon_codes.join(', ')}` : ''}</div>
                                        <div className="text-xs text-gray-600 truncate">{o.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {data.messages?.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold mb-2">Messages sent</h4>
                                <div className="space-y-1.5">
                                    {data.messages.map(m => (
                                        <div key={m.id} className="rounded-lg bg-gray-50 p-2.5 text-xs">
                                            <div className="flex justify-between font-medium"><span>{m.channel.toUpperCase()} · {m.status}</span><span>{shortDate(m.sent_at)}</span></div>
                                            {m.body && <div className="text-gray-600 mt-1 line-clamp-3 whitespace-pre-line">{m.body}</div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
