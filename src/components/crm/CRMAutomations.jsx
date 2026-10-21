import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Hand, Repeat, HeartCrack, Moon, Cake, Crown, Star, Settings2, ArrowUp, ArrowDown, Smartphone, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { crm, money } from './crmClient';

const META = {
    welcome: { icon: Hand, title: 'Welcome', when: 'The day after a customer’s first order' },
    second_order: { icon: Repeat, title: 'Second order nudge', when: (s) => `${s?.delay_days || 14} days after a first order, if they haven’t ordered again` },
    win_back: { icon: HeartCrack, title: 'Win-back', when: 'When a regular becomes overdue (At risk)' },
    lapsed: { icon: Moon, title: 'Lapsed reactivation', when: 'When a customer reaches 90 days without an order' },
    birthday: { icon: Cake, title: 'Birthday', when: (s) => `${s?.days_before ?? 3} days before their birthday (if known)` },
    vip_milestone: { icon: Crown, title: 'VIP thank-you', when: (s) => `On their ${(s?.milestones || [10, 25, 50]).join(', ')}th order` },
    review_request: { icon: Star, title: 'Review request', when: '2 hours after an order is completed (max once a month)' },
};
const CH = { sms: ['SMS', Smartphone], email: ['Email', Mail], whatsapp: ['WhatsApp', MessageCircle] };
const TOKENS = ['{first_name}', '{restaurant}', '{favourite_item}', '{coupon_code}', '{order_link}', '{days_since_last_order}'];

function Editor({ restaurantId, automation, whatsapp, onClose }) {
    const qc = useQueryClient();
    const [a, setA] = useState(() => JSON.parse(JSON.stringify(automation)));
    const [saving, setSaving] = useState(false);
    const set = (patch) => setA(prev => ({ ...prev, ...patch }));
    const setContent = (ch, patch) => setA(prev => ({ ...prev, content: { ...prev.content, [ch]: { ...(prev.content?.[ch] || {}), ...patch } } }));
    const order = a.channel_order || [];
    const toggleChannel = (ch) => set({ channel_order: order.includes(ch) ? order.filter(c => c !== ch) : [...order, ch] });
    const move = (i, d) => { const o = [...order]; [o[i], o[i + d]] = [o[i + d], o[i]]; set({ channel_order: o }); };

    const save = async () => {
        setSaving(true);
        try {
            await crm(restaurantId, 'automation_save', { automation: a });
            toast.success('Automation saved');
            qc.invalidateQueries({ queryKey: ['crm-automations', restaurantId] });
            onClose();
        } catch (e) { toast.error(e.message); } finally { setSaving(false); }
    };

    const m = META[a.type];
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{m.title}</DialogTitle></DialogHeader>
                <div className="space-y-5">
                    <div>
                        <Label>Channels, in order of preference</Label>
                        <p className="text-xs text-gray-500 mb-2">Each customer gets one message, on the first channel they agreed to.</p>
                        <div className="space-y-1.5">
                            {order.map((ch, i) => {
                                const [label, Icon] = CH[ch];
                                return (
                                    <div key={ch} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                                        <span className="flex items-center gap-2"><span className="text-gray-400 w-4">{i + 1}</span><Icon className="h-4 w-4" />{label}</span>
                                        <span className="flex gap-1">
                                            <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" disabled={i === order.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="sm" onClick={() => toggleChannel(ch)}>Remove</Button>
                                        </span>
                                    </div>
                                );
                            })}
                            <div className="flex gap-2">
                                {Object.keys(CH).filter(ch => !order.includes(ch)).map(ch => (
                                    <Button key={ch} size="sm" variant="outline" onClick={() => toggleChannel(ch)}>+ {CH[ch][0]}</Button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {order.includes('sms') && (
                        <div>
                            <Label>SMS message</Label>
                            <Textarea rows={3} value={a.content?.sms?.body || ''} onChange={e => setContent('sms', { body: e.target.value })} />
                            <p className="text-xs text-gray-500 mt-1">Starts with your sender name and ends with “Reply STOP to opt out” automatically.</p>
                        </div>
                    )}
                    {order.includes('email') && (
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input placeholder="Subject" value={a.content?.email?.subject || ''} onChange={e => setContent('email', { subject: e.target.value })} />
                            <Input placeholder="Headline" value={a.content?.email?.heading || ''} onChange={e => setContent('email', { heading: e.target.value })} />
                            <Textarea rows={4} value={a.content?.email?.body || ''} onChange={e => setContent('email', { body: e.target.value })} />
                            <Input placeholder="Button text" value={a.content?.email?.button_text || ''} onChange={e => setContent('email', { button_text: e.target.value })} />
                        </div>
                    )}
                    {order.includes('whatsapp') && (
                        <div className="space-y-1.5">
                            <Label>WhatsApp template</Label>
                            {!whatsapp?.channel ? (
                                <p className="text-xs text-amber-700">No WhatsApp number connected for this restaurant yet — WhatsApp is skipped and the next channel is used.</p>
                            ) : (
                                <>
                                    <Select value={a.content?.whatsapp?.template_id || ''} onValueChange={(v) => setContent('whatsapp', { template_id: v })}>
                                        <SelectTrigger><SelectValue placeholder="Choose an approved marketing template" /></SelectTrigger>
                                        <SelectContent>{(whatsapp.templates || []).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                    {!whatsapp.templates?.length && <p className="text-xs text-gray-500">No marketing templates approved yet. Create one in Super Admin → WhatsApp templates (category MARKETING, with a “Stop offers” button).</p>}
                                </>
                            )}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-1">{TOKENS.map(t => <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-gray-100">{t}</span>)}</div>

                    <div className="space-y-2">
                        <Label>Offer</Label>
                        <Select value={a.coupon_mode || 'none'} onValueChange={(v) => set({ coupon_mode: v, coupon_config: a.coupon_config || { discount_type: 'percentage', discount_value: 10, validity_days: 14, minimum_order: 0 } })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="none">No offer</SelectItem><SelectItem value="unique">Unique single-use code</SelectItem></SelectContent>
                        </Select>
                        {a.coupon_mode === 'unique' && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <Select value={a.coupon_config?.discount_type || 'percentage'} onValueChange={(v) => set({ coupon_config: { ...a.coupon_config, discount_type: v } })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="percentage">% off</SelectItem><SelectItem value="fixed">£ off</SelectItem></SelectContent>
                                </Select>
                                <Input type="number" value={a.coupon_config?.discount_value ?? ''} onChange={e => set({ coupon_config: { ...a.coupon_config, discount_value: e.target.value } })} placeholder="Amount" />
                                <Input type="number" value={a.coupon_config?.validity_days ?? ''} onChange={e => set({ coupon_config: { ...a.coupon_config, validity_days: e.target.value } })} placeholder="Valid days" />
                                <Input type="number" value={a.coupon_config?.minimum_order ?? ''} onChange={e => set({ coupon_config: { ...a.coupon_config, minimum_order: e.target.value } })} placeholder="Min order £" />
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div><Label>Control group %</Label><Input type="number" min="0" max="50" value={a.holdout_pct ?? 0} onChange={e => set({ holdout_pct: e.target.value })} /><p className="text-xs text-gray-500 mt-1">Held back at random to show the real effect.</p></div>
                        {['win_back', 'lapsed', 'birthday', 'review_request'].includes(a.type) && (
                            <div><Label>Don’t repeat within (days)</Label><Input type="number" value={a.cooldown_days ?? 0} onChange={e => set({ cooldown_days: e.target.value })} /></div>
                        )}
                        {a.type === 'second_order' && <div><Label>Days after first order</Label><Input type="number" value={a.settings?.delay_days ?? 14} onChange={e => set({ settings: { ...a.settings, delay_days: e.target.value } })} /></div>}
                        {a.type === 'birthday' && <div><Label>Days before birthday</Label><Input type="number" value={a.settings?.days_before ?? 3} onChange={e => set({ settings: { ...a.settings, days_before: e.target.value } })} /></div>}
                        {a.type === 'vip_milestone' && <div><Label>Milestones (orders)</Label><Input value={(a.settings?.milestones || []).join(', ')} onChange={e => set({ settings: { ...a.settings, milestones: e.target.value.split(',').map(s => Number(s.trim())).filter(Boolean) } })} /></div>}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button className="bg-orange-500 hover:bg-orange-600" disabled={saving} onClick={save}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function CRMAutomations({ restaurantId }) {
    const qc = useQueryClient();
    const [editing, setEditing] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const { data, isLoading, error } = useQuery({ queryKey: ['crm-automations', restaurantId], queryFn: () => crm(restaurantId, 'automations_list') });

    const toggle = async (a, on) => {
        if (on && !window.confirm(`Switch on "${META[a.type].title}"? Customers who already qualify will start receiving it within the hour (outside quiet hours).`)) return;
        setBusyId(a.id);
        try { await crm(restaurantId, 'automation_save', { automation: { ...a, is_enabled: on } }); qc.invalidateQueries({ queryKey: ['crm-automations', restaurantId] }); toast.success(on ? 'Switched on' : 'Switched off'); }
        catch (e) { toast.error(e.message); } finally { setBusyId(null); }
    };

    if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
    if (error) return <p className="text-sm text-red-600">{error.message}</p>;

    return (
        <div className="space-y-3">
            <p className="text-sm text-gray-600">Always-on messages triggered by what customers do. Every message still respects consent, opt-outs, quiet hours and the weekly limit.</p>
            <div className="grid md:grid-cols-2 gap-3">
                {data.automations.map(a => {
                    const m = META[a.type];
                    const Icon = m.icon;
                    const s = a.stats_30d || {};
                    return (
                        <Card key={a.id} className={a.is_enabled ? 'border-orange-300' : ''}>
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex gap-3">
                                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${a.is_enabled ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}><Icon className="h-5 w-5" /></div>
                                        <div>
                                            <div className="font-semibold text-gray-900">{m.title}</div>
                                            <div className="text-xs text-gray-500">{typeof m.when === 'function' ? m.when(a.settings) : m.when}</div>
                                        </div>
                                    </div>
                                    <Switch checked={!!a.is_enabled} disabled={busyId === a.id} onCheckedChange={(v) => toggle(a, v)} />
                                </div>
                                <div className="text-xs text-gray-600">
                                    {(a.channel_order || []).map(c => CH[c]?.[0]).join(' → ') || 'No channel'}
                                    {a.coupon_mode === 'unique' && a.coupon_config ? ` · ${a.coupon_config.discount_type === 'fixed' ? `£${a.coupon_config.discount_value}` : `${a.coupon_config.discount_value}%`} off code` : ''}
                                    {a.holdout_pct ? ` · ${a.holdout_pct}% control` : ''}
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-center">
                                    {[['Sent', s.messaged], ['Ordered', s.converted], ['Revenue', money(s.revenue)], ['Lift', s.messaged_order_rate != null && s.holdout_order_rate != null ? `${(s.messaged_order_rate - s.holdout_order_rate).toFixed(1)} pts` : '—']].map(([k, v]) => (
                                        <div key={k} className="rounded-md bg-gray-50 py-1.5"><div className="text-[10px] text-gray-500">{k} · 30d</div><div className="text-sm font-semibold">{v ?? 0}</div></div>
                                    ))}
                                </div>
                                <Button variant="outline" size="sm" className="w-full" onClick={() => setEditing(a)}><Settings2 className="h-4 w-4 mr-1" />Edit message & settings</Button>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
            {editing && <Editor restaurantId={restaurantId} automation={editing} whatsapp={data.whatsapp} onClose={() => setEditing(null)} />}
        </div>
    );
}
