import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MessageSquare, Smartphone, RotateCcw, Save, Store, Globe } from 'lucide-react';
import { tplAdmin, fillVars, smsSegments, insertAtCursor, waFormat } from './templateApi';

const CHANNEL_LABEL = { sms: 'SMS', whatsapp: 'WhatsApp', any: 'SMS & WhatsApp' };
const PLATFORM = '__platform__';

export default function MessageWordingEditor() {
    const [catalog, setCatalog] = useState([]);
    const [texts, setTexts] = useState([]);
    const [restaurants, setRestaurants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedKey, setSelectedKey] = useState(null);
    const [scope, setScope] = useState(PLATFORM);
    const [channel, setChannel] = useState('whatsapp');
    const [body, setBody] = useState('');
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const textareaRef = useRef(null);

    const load = async () => {
        try {
            const [c, t, r] = await Promise.all([
                tplAdmin('catalog'),
                tplAdmin('list_texts'),
                base44.entities.Restaurant.list('name', 500).catch(() => []),
            ]);
            setCatalog(c.catalog || []);
            setTexts(t.texts || []);
            setRestaurants(r || []);
            setSelectedKey((k) => k || c.catalog?.[0]?.key || null);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const entry = catalog.find((c) => c.key === selectedKey);
    const restaurantId = scope === PLATFORM ? null : scope;
    const channelOptions = entry ? (entry.channels.length > 1 ? [...entry.channels, 'any'] : entry.channels) : [];

    // Keep the channel valid for the selected message
    useEffect(() => {
        if (entry && !channelOptions.includes(channel)) setChannel(entry.channels[0]);
    }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const row = useMemo(() => texts.find((t) => t.key === selectedKey && t.channel === channel
        && (t.restaurant_id || null) === restaurantId), [texts, selectedKey, channel, restaurantId]);

    /** What customers get right now for this scope + channel, and where it comes from. */
    const effective = useMemo(() => {
        if (!entry) return { text: '', source: '' };
        const live = texts.filter((t) => t.key === entry.key && t.is_active !== false);
        const chans = channel === 'any' ? ['any'] : [channel, 'any'];
        const lookups = [
            ...(restaurantId ? chans.map((c) => ({ r: restaurantId, c, src: `override for this restaurant (${CHANNEL_LABEL[c]})` })) : []),
            ...chans.map((c) => ({ r: null, c, src: `platform default (${CHANNEL_LABEL[c]})` })),
        ];
        for (const l of lookups) {
            const hit = live.find((t) => (t.restaurant_id || null) === l.r && t.channel === l.c);
            if (hit) return { text: hit.body, source: l.src };
        }
        const def = channel === 'any' ? (entry.defaults.whatsapp ?? entry.defaults.sms) : entry.defaults[channel];
        return { text: def || '', source: def ? 'built-in text' : 'not sent (no text)' };
    }, [entry, texts, channel, restaurantId]);

    useEffect(() => {
        setBody(row?.body ?? effective.text ?? '');
        setActive(row ? row.is_active !== false : true);
    }, [row?.id, selectedKey, channel, scope]); // eslint-disable-line react-hooks/exhaustive-deps

    const save = async () => {
        setSaving(true);
        try {
            await tplAdmin('save_text', { id: row?.id, key: selectedKey, channel, restaurant_id: restaurantId, body, is_active: active });
            toast.success('Saved — used from the next message');
            const t = await tplAdmin('list_texts');
            setTexts(t.texts || []);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    const reset = async () => {
        if (!row) return;
        if (!window.confirm(restaurantId ? 'Remove this restaurant override?' : 'Go back to the built-in text?')) return;
        try {
            await tplAdmin('delete_text', { id: row.id });
            const t = await tplAdmin('list_texts');
            setTexts(t.texts || []);
            toast.success('Removed');
        } catch (e) {
            toast.error(e.message);
        }
    };

    if (loading) return <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>;

    const groups = [...new Set(catalog.map((c) => c.group))];
    const preview = fillVars(body);
    const sms = smsSegments(preview);
    const overrides = texts.filter((t) => t.key === selectedKey && t.restaurant_id);
    const unknownVars = entry ? [...new Set([...body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((v) => !entry.variables.includes(v)))] : [];
    const dirty = body !== (row?.body ?? effective.text ?? '') || (row ? (row.is_active !== false) !== active : false);

    return (
        <div className="grid lg:grid-cols-[280px_1fr] gap-4">
            {/* Message list */}
            <div className="bg-white border rounded-xl overflow-hidden h-fit">
                {groups.map((g) => (
                    <div key={g}>
                        <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g}</p>
                        <ul>
                            {catalog.filter((c) => c.group === g).map((c) => {
                                const custom = texts.filter((t) => t.key === c.key);
                                return (
                                    <li key={c.key}>
                                        <button
                                            type="button" onClick={() => setSelectedKey(c.key)}
                                            className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-gray-50 ${selectedKey === c.key ? 'bg-orange-50 border-l-2 border-orange-500' : 'border-l-2 border-transparent'}`}
                                        >
                                            <span className="text-sm text-gray-800">{c.label}</span>
                                            <span className="flex items-center gap-1 shrink-0">
                                                {c.channels.includes('sms') && <MessageSquare className="h-3.5 w-3.5 text-gray-400" aria-label="SMS" />}
                                                {c.channels.includes('whatsapp') && <Smartphone className="h-3.5 w-3.5 text-green-600" aria-label="WhatsApp" />}
                                                {custom.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" title="Customised" />}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>

            {/* Editor */}
            {entry && (
                <div className="space-y-4">
                    <div className="bg-white border rounded-xl p-4 space-y-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">{entry.label}</h3>
                            <p className="text-sm text-gray-500">{entry.used_for}</p>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs text-gray-500">Applies to</Label>
                                <Select value={scope} onValueChange={setScope}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={PLATFORM}>All restaurants (platform default)</SelectItem>
                                        {restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} only</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs text-gray-500">Channel</Label>
                                <Select value={channel} onValueChange={setChannel}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {channelOptions.map((c) => <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="text-xs text-gray-500 flex items-center gap-1.5">
                            {restaurantId ? <Store className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                            Customers currently get the <span className="font-medium text-gray-700">{effective.source}</span>.
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <Label className="text-sm font-semibold">Message</Label>
                                <span className={`text-xs ${channel !== 'whatsapp' && sms.segments > 2 ? 'text-amber-600' : 'text-gray-400'}`}>
                                    {channel !== 'whatsapp'
                                        ? `${sms.len} chars · ${sms.segments} SMS${sms.unicode ? ' (emoji/accents use more)' : ''}`
                                        : `${body.length} chars`}
                                </span>
                            </div>
                            <Textarea
                                ref={textareaRef} rows={5} value={body} maxLength={1500}
                                onChange={(e) => setBody(e.target.value)}
                                placeholder="Leave as is to use the built-in text"
                            />
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {entry.variables.map((v) => (
                                    <button
                                        key={v} type="button"
                                        onClick={() => setBody((b) => insertAtCursor(textareaRef.current, b, `{${v}}`))}
                                        className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-orange-100 text-gray-700 font-mono"
                                    >
                                        {`{${v}}`}
                                    </button>
                                ))}
                            </div>
                            {unknownVars.length > 0 && (
                                <p className="text-xs text-red-600 mt-2">Not available for this message: {unknownVars.map((v) => `{${v}}`).join(', ')}</p>
                            )}
                            {channel !== 'sms' && <p className="text-xs text-gray-400 mt-2">WhatsApp formatting: *bold*, _italic_.</p>}
                        </div>

                        <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t">
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <Switch checked={active} onCheckedChange={setActive} /> Active
                            </label>
                            <div className="flex gap-2">
                                {row && (
                                    <Button variant="ghost" size="sm" onClick={reset}>
                                        <RotateCcw className="h-4 w-4 mr-1.5" />{restaurantId ? 'Remove override' : 'Use built-in'}
                                    </Button>
                                )}
                                <Button size="sm" onClick={save} disabled={saving || !body.trim() || unknownVars.length > 0 || (!dirty && !!row)} className="bg-orange-500 hover:bg-orange-600">
                                    {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                                    Save
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="bg-white border rounded-xl p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Preview with sample data</p>
                        {channel === 'sms' ? (
                            <div className="max-w-sm bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-900 whitespace-pre-wrap">{preview || '—'}</div>
                        ) : (
                            <div className="max-w-sm bg-[#efeae2] rounded-xl p-3">
                                <div className="bg-white rounded-lg rounded-tl-none px-3 py-2 text-sm text-gray-900 shadow-sm whitespace-pre-wrap">{preview ? waFormat(preview) : '—'}</div>
                            </div>
                        )}
                    </div>

                    {/* Overrides */}
                    {overrides.length > 0 && (
                        <div className="bg-white border rounded-xl p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Restaurant overrides</p>
                            <ul className="divide-y">
                                {overrides.map((o) => (
                                    <li key={o.id} className="py-2 flex items-center justify-between gap-3">
                                        <button type="button" className="text-left min-w-0" onClick={() => { setScope(o.restaurant_id); setChannel(o.channel); }}>
                                            <p className="text-sm font-medium text-gray-900 truncate">{o.restaurant_name || o.restaurant_id}</p>
                                            <p className="text-xs text-gray-500 truncate">{o.body}</p>
                                        </button>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Badge variant="outline" className="text-[10px]">{CHANNEL_LABEL[o.channel]}</Badge>
                                            {o.is_active === false && <Badge className="bg-gray-100 text-gray-500 text-[10px]">Off</Badge>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
