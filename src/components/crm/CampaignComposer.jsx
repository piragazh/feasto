import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Smartphone, Mail, MessageCircle, Check, Send, FlaskConical, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { crm } from './crmClient';
import { Reach } from './CRMSegments';

const STEPS = ['Audience', 'Channel', 'Message', 'Offer', 'Review'];
const TOKENS = ['{first_name}', '{restaurant}', '{favourite_item}', '{coupon_code}', '{order_link}'];

function smsInfo(text) {
    const unicode = /[^\x00-\x7F£€]/.test(text);
    const single = unicode ? 70 : 160, multi = unicode ? 67 : 153;
    const segments = text.length <= single ? 1 : Math.ceil(text.length / multi);
    return { length: text.length, segments, unicode };
}

const EMPTY = {
    name: '', channel: 'sms', sms_provider: 'auto', segment_key: 'sys:marketable', segment_name: '',
    subject: '', heading: '', body: '', button_text: 'Order now',
    coupon_mode: 'none', coupon_code: '', coupon_config: { discount_type: 'percentage', discount_value: 10, validity_days: 14, minimum_order: 0 },
    holdout_pct: 0, schedule_at: '',
};

export default function CampaignComposer({ restaurantId, restaurantName, initial, onClose }) {
    const qc = useQueryClient();
    const [step, setStep] = useState(0);
    const [f, setF] = useState({ ...EMPTY, ...(initial || {}) });
    const [id, setId] = useState(initial?.id || null);
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState(null);
    const [testTo, setTestTo] = useState('');
    const [testResult, setTestResult] = useState(null);
    const [when, setWhen] = useState(initial?.schedule_at ? 'later' : 'now');
    const set = (patch) => setF(prev => ({ ...prev, ...patch }));

    const { data: segs } = useQuery({ queryKey: ['crm-segments', restaurantId], queryFn: () => crm(restaurantId, 'segments_list') });
    const { data: coupons } = useQuery({ queryKey: ['crm-coupons', restaurantId], queryFn: () => crm(restaurantId, 'coupons_list') });
    const { data: settingsData } = useQuery({ queryKey: ['crm-settings', restaurantId], queryFn: () => crm(restaurantId, 'settings_get') });

    const allSegs = useMemo(() => [...(segs?.system || []), ...(segs?.custom || [])], [segs]);
    useEffect(() => {
        if (!f.segment_key) return;
        crm(restaurantId, 'segment_preview', { segment_key: f.segment_key }).then(setPreview).catch(() => setPreview(null));
    }, [restaurantId, f.segment_key]);
    useEffect(() => {
        if (!initial?.id && settingsData?.settings?.default_sms_provider) set({ sms_provider: settingsData.settings.default_sms_provider });
    }, [settingsData]);

    const sampleBody = (f.body || '')
        .replace(/\{first_name\}/g, 'Sam').replace(/\{restaurant\}/g, restaurantName)
        .replace(/\{favourite_item\}/g, 'Chicken Strips Meal').replace(/\{coupon_code\}/g, f.coupon_mode === 'shared' ? f.coupon_code : f.coupon_mode === 'unique' ? 'CRM-AB12CD3' : '')
        .replace(/\{order_link\}/g, 'mealdrop.co.uk/…');
    const smsText = `${restaurantName}: ${sampleBody}${f.coupon_mode !== 'none' && !f.body.includes('{coupon_code}') ? `\nUse code ${f.coupon_mode === 'shared' ? f.coupon_code : 'CRM-AB12CD3'}` : ''}\nReply STOP to opt out`;
    const sms = smsInfo(smsText);
    const reachable = preview?.channels?.[f.channel]?.reachable ?? 0;
    const rate = f.sms_provider === 'twilio' ? settingsData?.settings?.sms_cost_pence?.twilio : settingsData?.settings?.sms_cost_pence?.httpsms;
    const estCost = f.channel === 'sms' ? (reachable * (1 - (f.holdout_pct || 0) / 100) * sms.segments * (Number(rate) || 0)) / 100 : 0;

    const validStep = () => {
        if (step === 0) return !!f.segment_key;
        if (step === 2) return f.channel === 'whatsapp'
            ? f.name.trim() && f.wa_template_id
            : f.name.trim() && f.body.trim() && (f.channel !== 'email' || f.subject.trim());
        if (step === 3) return f.coupon_mode !== 'shared' || !!f.coupon_code;
        return true;
    };

    const saveDraft = async () => {
        const res = await crm(restaurantId, 'campaign_save', { campaign: { ...f, id, schedule_at: when === 'later' && f.schedule_at ? new Date(f.schedule_at).toISOString() : null } });
        setId(res.id);
        qc.invalidateQueries({ queryKey: ['crm-campaigns', restaurantId] });
        return res.id;
    };

    const next = async () => {
        if (step === 2 || step === 3) {
            setBusy(true);
            try { await saveDraft(); } catch (e) { toast.error(e.message); setBusy(false); return; }
            setBusy(false);
        }
        setStep(s => Math.min(STEPS.length - 1, s + 1));
    };

    const sendTest = async () => {
        setBusy(true); setTestResult(null);
        try {
            const cid = await saveDraft();
            const r = await crm(restaurantId, 'campaign_test', { campaign_id: cid, to: testTo });
            setTestResult(r);
            if (r.status === 'sent' || r.status === 'uncertain') toast.success('Test sent'); else toast.error(r.error || `Test ${r.status}`);
        } catch (e) { toast.error(e.message); } finally { setBusy(false); }
    };

    const launch = async () => {
        if (!window.confirm(when === 'later'
            ? `Schedule "${f.name}" for ${new Date(f.schedule_at).toLocaleString('en-GB')}?`
            : `Send "${f.name}" to ${reachable} customers now?`)) return;
        setBusy(true);
        try {
            const cid = await saveDraft();
            const r = await crm(restaurantId, 'campaign_send', { campaign_id: cid, schedule_at: when === 'later' && f.schedule_at ? new Date(f.schedule_at).toISOString() : null });
            if (r.pending_approval) toast.success(`Sent to MealDrop for approval: ${r.reason}`);
            else toast.success(r.scheduled_for ? 'Campaign scheduled' : `Sending to ${r.queued} customers`);
            qc.invalidateQueries({ queryKey: ['crm-campaigns', restaurantId] });
            onClose(cid);
        } catch (e) { toast.error(e.message); } finally { setBusy(false); }
    };

    const insertToken = (t) => set({ body: `${f.body}${f.body && !f.body.endsWith(' ') ? ' ' : ''}${t}` });

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{id ? 'Edit campaign' : 'New campaign'}</DialogTitle></DialogHeader>

                <div className="flex gap-1 mb-2">
                    {STEPS.map((s, i) => (
                        <button key={s} onClick={() => i < step && setStep(i)} className={`flex-1 text-xs py-1.5 rounded-md font-medium ${i === step ? 'bg-orange-500 text-white' : i < step ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                            {i < step ? <Check className="h-3 w-3 inline mr-1" /> : `${i + 1}. `}{s}
                        </button>
                    ))}
                </div>

                {step === 0 && (
                    <div className="space-y-3">
                        <Label>Who should get it?</Label>
                        <Select value={f.segment_key} onValueChange={(v) => set({ segment_key: v, segment_name: allSegs.find(s => s.key === v)?.name || '' })}>
                            <SelectTrigger><SelectValue placeholder="Choose an audience" /></SelectTrigger>
                            <SelectContent>{allSegs.map(s => <SelectItem key={s.key} value={s.key}>{s.name} ({s.count})</SelectItem>)}</SelectContent>
                        </Select>
                        <Reach preview={preview} />
                        <p className="text-xs text-gray-500">Customers who haven't agreed to offers, have opted out, or already had {settingsData?.settings?.max_marketing_per_week ?? 2} messages this week are left out automatically.</p>
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                            {[['sms', 'SMS', Smartphone], ['email', 'Email', Mail], ['whatsapp', 'WhatsApp', MessageCircle]].map(([ch, label, Icon]) => (
                                <button key={ch} disabled={ch === 'whatsapp' && !settingsData?.providers?.whatsapp} onClick={() => set({ channel: ch })}
                                    className={`rounded-xl border-2 p-4 text-left ${f.channel === ch ? 'border-orange-500 bg-orange-50' : 'border-gray-200'} ${ch === 'whatsapp' && !settingsData?.providers?.whatsapp ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    <Icon className="h-5 w-5 mb-1" /><div className="font-semibold">{label}</div>
                                    <div className="text-xs text-gray-500">{ch === 'whatsapp' && !settingsData?.providers?.whatsapp ? 'Connect a WhatsApp number first' : `${preview?.channels?.[ch]?.reachable ?? '…'} reachable`}</div>
                                </button>
                            ))}
                        </div>
                        {f.channel === 'sms' && (
                            <div className="space-y-1.5">
                                <Label>Send SMS through</Label>
                                <Select value={f.sms_provider} onValueChange={(v) => set({ sms_provider: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="auto" disabled={!settingsData?.providers?.httpsms}>Automatic — httpSMS, Twilio if it fails</SelectItem>
                                        <SelectItem value="httpsms" disabled={!settingsData?.providers?.httpsms}>httpSMS only (cheapest, one phone)</SelectItem>
                                        <SelectItem value="twilio" disabled={!settingsData?.providers?.twilio}>Twilio only (best for large sends)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <div><Label>Campaign name (internal)</Label><Input value={f.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. October win-back" /></div>
                            {f.channel === 'whatsapp' && (
                                <div className="space-y-1.5">
                                    <Label>WhatsApp template</Label>
                                    <Select value={f.wa_template_id || ''} onValueChange={(v) => { const t = settingsData?.whatsapp?.templates?.find(x => x.id === v); set({ wa_template_id: v, body: t?.body || '' }); }}>
                                        <SelectTrigger><SelectValue placeholder="Choose an approved marketing template" /></SelectTrigger>
                                        <SelectContent>{(settingsData?.whatsapp?.templates || []).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <p className="text-xs text-gray-500">WhatsApp offers must use a template Meta has approved. Make one in Super Admin → WhatsApp templates (category Marketing, with a “Stop offers” button).</p>
                                </div>
                            )}
                            {f.channel === 'email' && (
                                <>
                                    <div><Label>Subject line</Label><Input value={f.subject} onChange={e => set({ subject: e.target.value })} placeholder="We've missed you, {first_name}" /></div>
                                    <div><Label>Headline</Label><Input value={f.heading} onChange={e => set({ heading: e.target.value })} placeholder="Your favourites are waiting" /></div>
                                </>
                            )}
                            {f.channel !== 'whatsapp' && <div>
                                <Label>Message</Label>
                                <Textarea rows={f.channel === 'sms' ? 4 : 7} value={f.body} onChange={e => set({ body: e.target.value })} placeholder={f.channel === 'sms' ? "Hi {first_name}, it's been a while! Get 15% off your next order this week." : 'Write your message…'} />
                                <div className="flex flex-wrap gap-1 mt-1.5">{TOKENS.map(t => <button key={t} onClick={() => insertToken(t)} className="text-[11px] px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200">{t}</button>)}</div>
                            </div>}
                            {f.channel === 'email' && <div><Label>Button text</Label><Input value={f.button_text} onChange={e => set({ button_text: e.target.value })} /></div>}
                        </div>
                        <div>
                            <Label>Preview</Label>
                            {f.channel === 'whatsapp' ? (
                                <div className="mt-1.5 rounded-2xl bg-[#e7fbe6] p-3 text-sm whitespace-pre-line">{sampleBody || 'Choose a template to preview it.'}</div>
                            ) : f.channel === 'sms' ? (
                                <div className="mt-1.5">
                                    <div className="rounded-2xl bg-gray-100 p-3 text-sm whitespace-pre-line">{smsText}</div>
                                    <p className={`text-xs mt-1 ${sms.segments > 2 ? 'text-amber-700' : 'text-gray-500'}`}>{sms.length} characters · {sms.segments} SMS part{sms.segments > 1 ? 's' : ''}{sms.unicode ? ' · emoji/special characters shorten each part to 70' : ''}</p>
                                </div>
                            ) : (
                                <div className="mt-1.5 rounded-xl border overflow-hidden text-sm">
                                    <div className="bg-orange-500 text-white px-4 py-3 font-bold">{restaurantName}</div>
                                    <div className="p-4 space-y-2">
                                        {f.heading && <div className="font-bold text-base">{f.heading.replace(/\{first_name\}/g, 'Sam')}</div>}
                                        <div className="whitespace-pre-line text-gray-700">{sampleBody}</div>
                                        <div className="text-center pt-2"><span className="inline-block bg-orange-500 text-white px-4 py-2 rounded-md font-semibold">{f.button_text || 'Order now'}</span></div>
                                    </div>
                                    <div className="bg-gray-50 text-[10px] text-gray-400 text-center py-2">Unsubscribe link added automatically</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                            {[['none', 'No offer'], ['shared', 'One shared code'], ['unique', 'Unique code each']].map(([m, l]) => (
                                <button key={m} onClick={() => set({ coupon_mode: m })} className={`rounded-xl border-2 p-3 text-sm font-medium ${f.coupon_mode === m ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>{l}</button>
                            ))}
                        </div>
                        {f.coupon_mode === 'shared' && (
                            <div className="space-y-1.5">
                                <Label>Coupon</Label>
                                <Select value={f.coupon_code} onValueChange={(v) => set({ coupon_code: v })}>
                                    <SelectTrigger><SelectValue placeholder="Choose one of your active coupons" /></SelectTrigger>
                                    <SelectContent>{(coupons?.coupons || []).map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.discount_type === 'percentage' ? `${c.discount_value}%` : c.discount_type === 'fixed' ? `£${c.discount_value}` : c.discount_type}{c.valid_until ? ` (until ${c.valid_until})` : ''}</SelectItem>)}</SelectContent>
                                </Select>
                                {!coupons?.coupons?.length && <p className="text-xs text-gray-500">No active coupons — create one in Coupons, or use unique codes.</p>}
                            </div>
                        )}
                        {f.coupon_mode === 'unique' && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div><Label>Type</Label>
                                    <Select value={f.coupon_config.discount_type} onValueChange={(v) => set({ coupon_config: { ...f.coupon_config, discount_type: v } })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="percentage">% off</SelectItem><SelectItem value="fixed">£ off</SelectItem></SelectContent>
                                    </Select>
                                </div>
                                <div><Label>Amount</Label><Input type="number" value={f.coupon_config.discount_value} onChange={e => set({ coupon_config: { ...f.coupon_config, discount_value: e.target.value } })} /></div>
                                <div><Label>Valid for (days)</Label><Input type="number" value={f.coupon_config.validity_days} onChange={e => set({ coupon_config: { ...f.coupon_config, validity_days: e.target.value } })} /></div>
                                <div><Label>Minimum order £</Label><Input type="number" value={f.coupon_config.minimum_order} onChange={e => set({ coupon_config: { ...f.coupon_config, minimum_order: e.target.value } })} /></div>
                                <p className="col-span-full text-xs text-gray-500">Each customer gets their own single-use code. Codes are only created for messages that actually send.</p>
                            </div>
                        )}
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-4">
                        <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-1">
                            <div><span className="text-gray-500">Audience:</span> {f.segment_name || allSegs.find(s => s.key === f.segment_key)?.name}</div>
                            <div><span className="text-gray-500">Channel:</span> {f.channel === 'whatsapp' ? `WhatsApp (${settingsData?.whatsapp?.channel?.display_phone_number || 'your number'})` : f.channel.toUpperCase()}{f.channel === 'sms' ? ` via ${f.sms_provider}` : ''}</div>
                            <div><span className="text-gray-500">Will receive it:</span> <b>{Math.round(reachable * (1 - (f.holdout_pct || 0) / 100))}</b> customers</div>
                            {f.channel === 'sms' && <div><span className="text-gray-500">Estimated cost:</span> £{estCost.toFixed(2)} ({sms.segments} part{sms.segments > 1 ? 's' : ''} each)</div>}
                            <div><span className="text-gray-500">Offer:</span> {f.coupon_mode === 'none' ? 'none' : f.coupon_mode === 'shared' ? f.coupon_code : `unique ${f.coupon_config.discount_type === 'fixed' ? '£' : ''}${f.coupon_config.discount_value}${f.coupon_config.discount_type === 'percentage' ? '%' : ''} off codes`}</div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5"><FlaskConical className="h-4 w-4" />Send a test to yourself first</Label>
                            <div className="flex gap-2">
                                <Input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder={f.channel === 'email' ? 'you@example.com' : '07…'} />
                                <Button variant="outline" disabled={busy || !testTo.trim()} onClick={sendTest}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send test'}</Button>
                            </div>
                            {testResult && <p className="text-xs text-gray-600">Test {testResult.status}{testResult.error ? ` — ${testResult.error}` : ''}</p>}
                        </div>

                        <div className="grid md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Hold back a control group</Label>
                                <Select value={String(f.holdout_pct)} onValueChange={(v) => set({ holdout_pct: Number(v) })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">No control group</SelectItem>
                                        <SelectItem value="10">10% — measure the real effect</SelectItem>
                                        <SelectItem value="20">20%</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" />When</Label>
                                <div className="flex gap-2">
                                    <Select value={when} onValueChange={setWhen}>
                                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="now">Now</SelectItem><SelectItem value="later">Later</SelectItem></SelectContent>
                                    </Select>
                                    {when === 'later' && <Input type="datetime-local" value={f.schedule_at} onChange={e => set({ schedule_at: e.target.value })} />}
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">Messages are not sent between {settingsData?.settings?.quiet_hours_start || '21:00'} and {settingsData?.settings?.quiet_hours_end || '09:00'}; anything due then waits until morning.</p>
                    </div>
                )}

                <div className="flex justify-between pt-3 border-t mt-2">
                    <Button variant="outline" onClick={() => (step === 0 ? onClose() : setStep(s => s - 1))}>{step === 0 ? 'Cancel' : 'Back'}</Button>
                    {step < STEPS.length - 1 ? (
                        <Button className="bg-orange-500 hover:bg-orange-600" disabled={busy || !validStep()} onClick={next}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Next</Button>
                    ) : (
                        <Button className="bg-orange-500 hover:bg-orange-600" disabled={busy || !reachable || (when === 'later' && !f.schedule_at)} onClick={launch}>
                            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}{when === 'later' ? 'Schedule' : `Send to ${Math.round(reachable * (1 - (f.holdout_pct || 0) / 100))}`}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
