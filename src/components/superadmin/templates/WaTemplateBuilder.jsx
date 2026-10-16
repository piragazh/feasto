import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Loader2, Plus, Send, RefreshCw, Trash2, Copy, Save, Lock, ExternalLink, Phone, Reply, AlertTriangle,
} from 'lucide-react';
import { tplAdmin, fillVars, insertAtCursor, waFormat } from './templateApi';

const EMPTY = {
    name: '', language: 'en_GB', category: 'UTILITY', purpose: 'other',
    header_text: '', body: '', footer: '', buttons: [], target_channel_ids: [], notes: '',
};

const LANGS = [['en_GB', 'English (UK)'], ['en_US', 'English (US)'], ['en', 'English'], ['ur', 'Urdu'], ['bn', 'Bengali'], ['pa', 'Punjabi'], ['tr', 'Turkish'], ['pl', 'Polish']];

const STATUS_STYLE = {
    APPROVED: 'bg-green-100 text-green-800',
    PENDING: 'bg-amber-100 text-amber-800',
    IN_APPEAL: 'bg-amber-100 text-amber-800',
    REJECTED: 'bg-red-100 text-red-800',
    ERROR: 'bg-red-100 text-red-800',
    PAUSED: 'bg-orange-100 text-orange-800',
    DISABLED: 'bg-gray-200 text-gray-700',
    NOT_FOUND: 'bg-gray-200 text-gray-700',
    DISCONNECTED: 'bg-gray-200 text-gray-700',
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

/** Client-side checks that mirror Meta's rules (the server re-checks). */
function problems(t, knownVars) {
    const out = [];
    if (!/^[a-z0-9_]{1,512}$/.test(t.name)) out.push('Name: lowercase letters, numbers and underscores only.');
    const body = t.body.trim();
    if (!body) out.push('Body is required.');
    if (body.length > 1024) out.push('Body is over 1024 characters.');
    if (t.header_text.length > 60) out.push('Header is over 60 characters.');
    if (t.footer.length > 60) out.push('Footer is over 60 characters.');
    if (/\{[a-z_]+\}/.test(t.header_text + t.footer)) out.push('Variables can only go in the body.');
    const unknown = [...new Set([...body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((v) => !knownVars.includes(v)))];
    if (unknown.length) out.push(`Unknown variable(s): ${unknown.map((v) => `{${v}}`).join(', ')}`);
    if (/^\{[a-z_]+\}/.test(body) || /\{[a-z_]+\}$/.test(body)) out.push("Body can't start or end with a variable.");
    if (/\{[a-z_]+\}\s*\{[a-z_]+\}/.test(body)) out.push('Put words between variables.');
    for (const b of t.buttons) {
        if (!b.text.trim() || b.text.length > 25) out.push('Each button needs 1–25 characters of text.');
        if (b.type === 'URL' && !/^https:\/\//.test(b.url || '')) out.push('Website buttons need an https:// link.');
        if (b.type === 'PHONE_NUMBER' && !/^\+\d{7,15}$/.test((b.phone_number || '').replace(/\s/g, ''))) out.push('Call buttons need a +44… number.');
    }
    return [...new Set(out)];
}

function summary(t) {
    const subs = t.submissions || [];
    if (!subs.length) return { label: 'Draft', cls: 'bg-gray-100 text-gray-700' };
    const approved = subs.filter((s) => s.status === 'APPROVED').length;
    const rejected = subs.filter((s) => ['REJECTED', 'ERROR'].includes(s.status)).length;
    if (approved === subs.length) return { label: 'Approved', cls: STATUS_STYLE.APPROVED };
    if (rejected) return { label: `${rejected} rejected`, cls: STATUS_STYLE.REJECTED };
    return { label: `${approved}/${subs.length} approved`, cls: STATUS_STYLE.PENDING };
}

export default function WaTemplateBuilder() {
    const [data, setData] = useState({ templates: [], accounts: [], channels: [], variables: {} });
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(null);
    const [busy, setBusy] = useState('');
    const bodyRef = useRef(null);

    const load = async (selectId) => {
        try {
            const res = await tplAdmin('wa_list');
            setData(res);
            if (selectId) {
                const t = res.templates.find((x) => x.id === selectId);
                if (t) setForm({ ...EMPTY, ...t });
            }
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const knownVars = Object.keys(data.variables || {});
    const locked = !!form?.id && (data.templates.find((t) => t.id === form.id)?.submissions || []).length > 0;
    const issues = useMemo(() => (form ? problems(form, knownVars) : []), [form, knownVars.join()]); // eslint-disable-line react-hooks/exhaustive-deps
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    const save = async () => {
        setBusy('save');
        try {
            const res = await tplAdmin('wa_save', { template: form });
            toast.success('Template saved');
            await load(res.template.id);
            return res.template.id;
        } catch (e) {
            toast.error(e.message);
            return null;
        } finally {
            setBusy('');
        }
    };

    const submit = async () => {
        const id = form.id && !isDirty() ? form.id : await save();
        if (!id) return;
        if (!window.confirm(`Submit "${form.name}" to Meta for review on ${targetCount()} WhatsApp account(s)?`)) return;
        setBusy('submit');
        try {
            const res = await tplAdmin('wa_submit', { id });
            const errs = (res.results || []).filter((r) => r.status === 'ERROR');
            if (errs.length) toast.error(`${errs.length} account(s) failed: ${errs[0].reason}`);
            else toast.success('Submitted — Meta usually reviews within minutes to a day');
            await load(id);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy('');
        }
    };

    const sync = async () => {
        setBusy('sync');
        try {
            await tplAdmin('wa_sync', { id: form.id });
            await load(form.id);
            toast.success('Status refreshed');
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy('');
        }
    };

    const remove = async () => {
        const submitted = locked;
        const fromMeta = submitted && window.confirm('Also delete it from Meta on every account? (OK = delete from Meta too, Cancel = only remove it here)');
        if (!window.confirm(`Delete "${form.name}"${fromMeta ? ' here and from Meta' : ' from MealDrop'}?`)) return;
        setBusy('delete');
        try {
            const res = await tplAdmin('wa_delete', { id: form.id, remove_from_meta: fromMeta });
            if (res.problems?.length) toast.warning(res.problems.join('; '));
            else toast.success('Deleted');
            setForm(null);
            await load();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy('');
        }
    };

    const duplicate = () => {
        const { id: _id, submissions: _s, created_date: _c, updated_date: _u, ...rest } = form;
        setForm({ ...EMPTY, ...rest, name: slug(`${form.name}_v2`) });
    };

    function isDirty() {
        const saved = data.templates.find((t) => t.id === form?.id);
        if (!saved) return true;
        const pick = (x) => JSON.stringify([x.name, x.language, x.category, x.purpose, x.header_text || '', x.body, x.footer || '', x.buttons || [], x.target_channel_ids || [], x.notes || '']);
        return pick(saved) !== pick(form);
    }

    function targetCount() {
        if (!form?.target_channel_ids?.length) return data.accounts.length;
        return new Set(data.channels.filter((c) => form.target_channel_ids.includes(c.id)).map((c) => c.waba_id)).size;
    }

    const addButton = (type) => set({ buttons: [...form.buttons, { type, text: '', url: '', phone_number: '' }] });
    const updateButton = (i, patch) => set({ buttons: form.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
    const removeButton = (i) => set({ buttons: form.buttons.filter((_, j) => j !== i) });

    if (loading) return <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>;

    const sampleVars = { ...(data.variables || {}) };

    return (
        <div className="grid lg:grid-cols-[280px_1fr] gap-4">
            {/* Template list */}
            <div className="bg-white border rounded-xl overflow-hidden h-fit">
                <div className="p-3 border-b">
                    <Button size="sm" className="w-full bg-green-600 hover:bg-green-700" onClick={() => setForm({ ...EMPTY })}>
                        <Plus className="h-4 w-4 mr-1.5" /> New template
                    </Button>
                </div>
                {data.accounts.length === 0 && (
                    <p className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border-b">No restaurant has connected WhatsApp yet. You can build templates now and submit them once one does.</p>
                )}
                {data.templates.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">No templates yet.</p>
                ) : (
                    <ul className="divide-y">
                        {data.templates.map((t) => {
                            const s = summary(t);
                            return (
                                <li key={t.id}>
                                    <button
                                        type="button" onClick={() => setForm({ ...EMPTY, ...t })}
                                        className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 ${form?.id === t.id ? 'bg-green-50' : ''}`}
                                    >
                                        <p className="text-sm font-medium text-gray-900 font-mono truncate">{t.name}</p>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <Badge className={`${s.cls} text-[10px] px-1.5 py-0`}>{s.label}</Badge>
                                            <span className="text-[11px] text-gray-400">{t.category?.toLowerCase()} · {t.language}</span>
                                            {t.purpose === 'order_status_update' && <span className="text-[11px] text-green-700">order updates</span>}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {!form ? (
                <div className="bg-white border rounded-xl p-8 text-center text-sm text-gray-500">
                    Choose a template or create a new one. Approved templates let you message customers more than 24 hours after they last wrote — e.g. late order updates or offers.
                </div>
            ) : (
                <div className="grid xl:grid-cols-[1fr_320px] gap-4">
                    {/* Form */}
                    <div className="bg-white border rounded-xl p-4 space-y-4">
                        {locked && (
                            <div className="flex gap-2 text-sm bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3">
                                <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>Submitted to Meta — the content is locked. Use <b>Duplicate</b> to make a new version. You can still change who it's sent to and what it's used for.</span>
                            </div>
                        )}

                        <div className="grid sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2">
                                <Label className="text-xs text-gray-500">Name (Meta template name)</Label>
                                <Input className="mt-1 font-mono" disabled={locked} value={form.name} placeholder="order_update_late"
                                    onChange={(e) => set({ name: slug(e.target.value.replace(/\s/g, '_')) })} />
                            </div>
                            <div>
                                <Label className="text-xs text-gray-500">Category</Label>
                                <Select value={form.category} onValueChange={(v) => set({ category: v })} disabled={locked}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="UTILITY">Utility (order updates)</SelectItem>
                                        <SelectItem value="MARKETING">Marketing (offers, win-back)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs text-gray-500">Language</Label>
                                <Select value={form.language} onValueChange={(v) => set({ language: v })} disabled={locked}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>{LANGS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="sm:col-span-2">
                                <Label className="text-xs text-gray-500">Used for</Label>
                                <Select value={form.purpose} onValueChange={(v) => set({ purpose: v })}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="order_status_update">Order updates after the 24-hour window (sent automatically)</SelectItem>
                                        <SelectItem value="marketing">Marketing campaigns</SelectItem>
                                        <SelectItem value="other">Other / manual</SelectItem>
                                    </SelectContent>
                                </Select>
                                {form.purpose === 'order_status_update' && form.category !== 'UTILITY' && (
                                    <p className="text-xs text-amber-700 mt-1">Order updates should be Utility — Meta may reclassify or reject otherwise.</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <Label className="text-xs text-gray-500">Header (optional, 60 max)</Label>
                            <Input className="mt-1" disabled={locked} value={form.header_text} maxLength={60} onChange={(e) => set({ header_text: e.target.value })} placeholder="Order update" />
                        </div>

                        <div>
                            <div className="flex items-center justify-between">
                                <Label className="text-xs text-gray-500">Body</Label>
                                <span className="text-[11px] text-gray-400">{form.body.length}/1024</span>
                            </div>
                            <Textarea ref={bodyRef} rows={6} className="mt-1" disabled={locked} value={form.body} maxLength={1024}
                                onChange={(e) => set({ body: e.target.value })}
                                placeholder="Hi {customer_name}, your order {order_number} from {restaurant_name} is now {status_text}." />
                            {!locked && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {knownVars.map((v) => (
                                        <button key={v} type="button"
                                            onClick={() => set({ body: insertAtCursor(bodyRef.current, form.body, `{${v}}`) })}
                                            className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-green-100 text-gray-700 font-mono">
                                            {`{${v}}`}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <p className="text-[11px] text-gray-400 mt-1.5">Variables become {'{{1}}'}, {'{{2}}'}… when submitted. Sample values are sent to Meta for review.</p>
                        </div>

                        <div>
                            <Label className="text-xs text-gray-500">Footer (optional, 60 max)</Label>
                            <Input className="mt-1" disabled={locked} value={form.footer} maxLength={60} onChange={(e) => set({ footer: e.target.value })} placeholder="Reply STOP to opt out" />
                        </div>

                        <div>
                            <Label className="text-xs text-gray-500">Buttons (optional)</Label>
                            <div className="space-y-2 mt-1">
                                {form.buttons.map((b, i) => (
                                    <div key={i} className="flex gap-2 items-start">
                                        <Badge variant="outline" className="mt-2 text-[10px] shrink-0">{b.type === 'URL' ? 'Link' : b.type === 'PHONE_NUMBER' ? 'Call' : 'Reply'}</Badge>
                                        <Input disabled={locked} value={b.text} maxLength={25} placeholder="Button text" onChange={(e) => updateButton(i, { text: e.target.value })} />
                                        {b.type === 'URL' && <Input disabled={locked} value={b.url} placeholder="https://…" onChange={(e) => updateButton(i, { url: e.target.value })} />}
                                        {b.type === 'PHONE_NUMBER' && <Input disabled={locked} value={b.phone_number} placeholder="+44…" onChange={(e) => updateButton(i, { phone_number: e.target.value })} />}
                                        {!locked && <Button size="icon" variant="ghost" onClick={() => removeButton(i)} aria-label="Remove button"><Trash2 className="h-4 w-4" /></Button>}
                                    </div>
                                ))}
                            </div>
                            {!locked && form.buttons.length < 10 && (
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    <Button size="sm" variant="outline" onClick={() => addButton('QUICK_REPLY')}><Reply className="h-3.5 w-3.5 mr-1" />Quick reply</Button>
                                    {form.buttons.filter((b) => b.type === 'URL').length < 2 && <Button size="sm" variant="outline" onClick={() => addButton('URL')}><ExternalLink className="h-3.5 w-3.5 mr-1" />Website</Button>}
                                    {!form.buttons.some((b) => b.type === 'PHONE_NUMBER') && <Button size="sm" variant="outline" onClick={() => addButton('PHONE_NUMBER')}><Phone className="h-3.5 w-3.5 mr-1" />Call</Button>}
                                </div>
                            )}
                        </div>

                        <div>
                            <Label className="text-xs text-gray-500">Submit to</Label>
                            <label className="flex items-center gap-2 text-sm mt-1.5">
                                <Checkbox checked={!form.target_channel_ids.length} onCheckedChange={(v) => set({ target_channel_ids: v ? [] : data.channels.map((c) => c.id) })} />
                                Every connected restaurant ({data.channels.length})
                            </label>
                            {form.target_channel_ids.length > 0 && (
                                <div className="grid sm:grid-cols-2 gap-1.5 mt-2 max-h-40 overflow-y-auto">
                                    {data.channels.map((c) => (
                                        <label key={c.id} className="flex items-center gap-2 text-sm">
                                            <Checkbox checked={form.target_channel_ids.includes(c.id)}
                                                onCheckedChange={(v) => set({ target_channel_ids: v ? [...form.target_channel_ids, c.id] : form.target_channel_ids.filter((x) => x !== c.id) })} />
                                            <span className="truncate">{c.restaurant_name} <span className="text-gray-400">{c.display_phone_number}</span></span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        {issues.length > 0 && (
                            <div className="text-xs bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 space-y-0.5">
                                {issues.map((p) => <p key={p} className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{p}</p>)}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-2 border-t">
                            <Button size="sm" variant="outline" onClick={save} disabled={!!busy || issues.length > 0 || (form.id && !isDirty())}>
                                {busy === 'save' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}Save draft
                            </Button>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={submit} disabled={!!busy || issues.length > 0 || targetCount() === 0}>
                                {busy === 'submit' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                                {locked ? 'Submit to remaining' : 'Submit to Meta'}
                            </Button>
                            {locked && (
                                <Button size="sm" variant="outline" onClick={sync} disabled={!!busy}>
                                    {busy === 'sync' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}Refresh status
                                </Button>
                            )}
                            {form.id && <Button size="sm" variant="ghost" onClick={duplicate}><Copy className="h-4 w-4 mr-1.5" />Duplicate</Button>}
                            {form.id && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={remove} disabled={!!busy}><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button>}
                        </div>
                    </div>

                    {/* Preview + status */}
                    <div className="space-y-4">
                        <div className="bg-white border rounded-xl p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Preview</p>
                            <div className="bg-[#efeae2] rounded-xl p-3">
                                <div className="bg-white rounded-lg rounded-tl-none shadow-sm overflow-hidden">
                                    <div className="px-3 py-2 text-sm text-gray-900 space-y-1">
                                        {form.header_text && <p className="font-semibold">{form.header_text}</p>}
                                        <p className="whitespace-pre-wrap">{form.body ? waFormat(fillVars(form.body, sampleVars)) : <span className="text-gray-400">Message body…</span>}</p>
                                        {form.footer && <p className="text-xs text-gray-500">{form.footer}</p>}
                                    </div>
                                    {form.buttons.map((b, i) => (
                                        <div key={i} className="border-t text-center text-sm text-[#027eb5] py-2 flex items-center justify-center gap-1.5">
                                            {b.type === 'URL' ? <ExternalLink className="h-3.5 w-3.5" /> : b.type === 'PHONE_NUMBER' ? <Phone className="h-3.5 w-3.5" /> : <Reply className="h-3.5 w-3.5" />}
                                            {b.text || 'Button'}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {(form.submissions || []).length > 0 && (
                            <div className="bg-white border rounded-xl p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Meta review</p>
                                {form.submissions.some((s) => s.status === 'REJECTED') && (
                                    <p className="text-xs bg-red-50 border border-red-200 text-red-800 rounded-md p-2 mb-2">
                                        Meta won't re-review a rejected template under the same name. Use <b>Duplicate</b>, fix the wording, and submit the new version.
                                    </p>
                                )}
                                <ul className="space-y-2">
                                    {form.submissions.map((s) => (
                                        <li key={s.waba_id} className="text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate text-gray-800">{s.restaurant_names || s.waba_id}</span>
                                                <Badge className={`${STATUS_STYLE[s.status] || 'bg-gray-100 text-gray-700'} text-[10px]`}>{s.status}</Badge>
                                            </div>
                                            {s.reason && <p className="text-xs text-red-600 mt-0.5">{s.reason}</p>}
                                            <p className="text-[11px] text-gray-400">{s.updated_at ? new Date(s.updated_at).toLocaleString('en-GB') : ''}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
