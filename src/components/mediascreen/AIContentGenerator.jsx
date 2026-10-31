import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Sparkles, Loader2, Copy, Share2, Monitor, Smartphone, Image as ImageIcon, CheckCircle,
    Library, PenLine, Tag, Star, Grid, Megaphone, AlertTriangle, History, Send, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import CanvasEditor from './CanvasEditor';
import AdSlide, { livePrice } from './AdSlide';
import {
    AD_TYPES, STYLES, buildImagePrompt, referencePhotos, buildCopyPrompt, COPY_SCHEMA, cleanCopy,
    advertisableCoupons, isPlatformCoupon, couponExpiry, describeCoupon, adEligibleItems, pickCategoryItems, buildContentRecord,
} from './aiAdLogic';

/**
 * AI ad generator for Screen Studio.
 *
 * 1. What to advertise  — real menu items / real coupons
 * 2. The words          — AI suggests, you edit; prices are never written by AI
 * 3. The picture        — AI paints a text-free image, optionally from your real food photos
 * 4. Publish            — straight onto the screens you pick
 *
 * The preview is the same renderer the screens use, so what you see is what plays.
 */

const TYPE_ICONS = { single_item: Star, category: Grid, promo_code: Tag, generic: Megaphone };
const HISTORY_MAX = 12;
const historyKey = (rid) => `md_ai_ad_history_${rid}`;
const readHistory = (rid) => { try { return JSON.parse(localStorage.getItem(historyKey(rid)) || '[]'); } catch { return []; } };
const gbp = (n) => `£${Number(n || 0).toFixed(2)}`;
const errText = (e, fallback) => e?.response?.data?.error || e?.data?.error || e?.message || fallback;

function Step({ n, title, children, hint }) {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 space-y-3">
            <div className="flex items-baseline gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">{n}</span>
                <h3 className="font-semibold text-gray-900">{title}</h3>
                {hint && <span className="text-xs text-gray-400">{hint}</span>}
            </div>
            {children}
        </section>
    );
}

const pill = (active) => `rounded-lg border-2 px-3 py-2 text-left text-sm transition-all ${active ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'}`;

export default function AIContentGenerator({
    restaurantId, restaurantName = '', restaurantColor = '#f97316', websiteUrl = '', logoUrl = '',
    onNavigate, onClose,
}) {
    const queryClient = useQueryClient();

    // ── 1. what ───────────────────────────────────────────────────────────
    const [adType, setAdType] = useState('single_item');
    const [itemId, setItemId] = useState('');
    const [category, setCategory] = useState('');
    const [pickedIds, setPickedIds] = useState([]);
    const [couponId, setCouponId] = useState('');
    const [message, setMessage] = useState('');

    // ── 2. words ──────────────────────────────────────────────────────────
    const [copy, setCopy] = useState({ headline: '', hook: '', cta: '' });
    const [copyOptions, setCopyOptions] = useState([]);
    const [keywords, setKeywords] = useState('');
    const [showPrices, setShowPrices] = useState(true);
    const [layout, setLayout] = useState('auto');
    const [copyBusy, setCopyBusy] = useState(false);

    // ── 3. picture ────────────────────────────────────────────────────────
    const [style, setStyle] = useState('cinematic');
    const [accent, setAccent] = useState(restaurantColor || '#f97316');
    const [useRealPhotos, setUseRealPhotos] = useState(true);
    const [extra, setExtra] = useState('');
    const [showLogo, setShowLogo] = useState(!!logoUrl);
    const [motion, setMotion] = useState('zoom');
    const [candidates, setCandidates] = useState([]);
    const [imageUrl, setImageUrl] = useState('');
    const [imagePrompt, setImagePrompt] = useState('');
    const [flattened, setFlattened] = useState(false);       // designed manually in Canvas → no live text layer
    const [imgBusy, setImgBusy] = useState(false);
    const [history, setHistory] = useState(() => readHistory(restaurantId));
    const [showCanvas, setShowCanvas] = useState(false);

    // ── 4. publish ────────────────────────────────────────────────────────
    const [previewShape, setPreviewShape] = useState('landscape');
    const [targetScreens, setTargetScreens] = useState([]);
    const [duration, setDuration] = useState(10);
    const [publishing, setPublishing] = useState(false);
    const [published, setPublished] = useState(null);

    // social
    const [social, setSocial] = useState(null);
    const [socialBusy, setSocialBusy] = useState(false);

    useEffect(() => { setHistory(readHistory(restaurantId)); }, [restaurantId]);

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items-ai', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });
    const { data: coupons = [] } = useQuery({
        queryKey: ['coupons-ai', restaurantId],
        // This restaurant's own coupons plus MealDrop-wide ones (no restaurant set).
        queryFn: async () => {
            const [own, platform] = await Promise.all([
                base44.entities.Coupon.filter({ restaurant_id: restaurantId }),
                base44.entities.Coupon.filter({ restaurant_id: null }).catch(() => []),
            ]);
            const seen = new Set();
            return [...own, ...platform].filter(c => c && !seen.has(c.id) && seen.add(c.id));
        },
        enabled: !!restaurantId,
    });
    const { data: screens = [] } = useQuery({
        queryKey: ['screens-ai', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });
    const { data: unassigned = [], refetch: refetchUnassigned } = useQuery({
        queryKey: ['ai-unassigned', restaurantId],
        queryFn: async () => (await base44.entities.PromotionalContent.filter({ restaurant_id: restaurantId, screen_name: '' }))
            .filter(c => c.media_url),
        enabled: !!restaurantId,
    });

    const eligible = useMemo(() => adEligibleItems(menuItems), [menuItems]);
    const categories = useMemo(() => [...new Set(eligible.map(i => i.category).filter(Boolean))], [eligible]);
    const liveCoupons = useMemo(() => advertisableCoupons(coupons, restaurantId), [coupons, restaurantId]);
    const coupon = liveCoupons.find(c => c.id === couponId) || null;
    const activeScreens = screens.filter(s => s.is_active !== false);

    // Default target screen: the only one, if there is just one
    useEffect(() => {
        if (activeScreens.length === 1 && targetScreens.length === 0) setTargetScreens([activeScreens[0].screen_name]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeScreens.length]);

    // Category picks follow the category
    useEffect(() => {
        if (adType === 'category') setPickedIds(pickCategoryItems(menuItems, category).map(i => i.id));
    }, [adType, category, menuItems]);

    const items = useMemo(() => {
        if (adType === 'single_item') return eligible.filter(i => i.id === itemId);
        if (adType === 'category' || adType === 'promo_code') return pickedIds.map(id => eligible.find(i => i.id === id)).filter(Boolean);
        return [];
    }, [adType, itemId, pickedIds, eligible]);

    const ready = adType === 'single_item' ? items.length === 1
        : adType === 'category' ? items.length > 0
        : adType === 'promo_code' ? !!coupon
        : true;
    const realPhotos = referencePhotos(adType, items);

    const overlay = useMemo(() => {
        if (flattened) return null;
        const expires = coupon ? couponExpiry(coupon) : null;
        return {
            ad_type: adType,
            headline: copy.headline,
            hook: copy.hook,
            cta: copy.cta,
            item_ids: items.map(i => i.id),
            show_prices: adType !== 'generic' && showPrices,
            promo_text: coupon ? describeCoupon(coupon) : '',
            promo_code: coupon ? coupon.code : '',
            coupon_id: coupon?.id || '',
            promo_expires_at: expires ? expires.toISOString() : '',
            accent,
            layout,
            motion,
            logo_url: showLogo && logoUrl ? logoUrl : '',
        };
    }, [flattened, adType, copy, items, showPrices, coupon, accent, layout, motion, showLogo, logoUrl]);

    const resetResult = () => { setCandidates([]); setImageUrl(''); setFlattened(false); setPublished(null); setSocial(null); };
    const chooseType = (t) => { setAdType(t); setPickedIds([]); setItemId(''); setCouponId(''); setCopy({ headline: '', hook: '', cta: '' }); setCopyOptions([]); resetResult(); };

    // ── actions ───────────────────────────────────────────────────────────
    const writeCopy = async () => {
        if (!ready) { toast.error('Finish step 1 first'); return; }
        setCopyBusy(true);
        try {
            const res = await base44.integrations.Core.InvokeLLM({
                prompt: buildCopyPrompt({ adType, restaurantName, items, coupon, message, keywords }),
                response_json_schema: COPY_SCHEMA,
            });
            const options = (res?.options || []).map(cleanCopy).filter(o => o.headline).slice(0, 3);
            if (!options.length) throw new Error('No suggestions came back');
            setCopyOptions(options);
            setCopy(options[0]);
        } catch (e) {
            toast.error(errText(e, 'Could not write copy — try again'));
        } finally {
            setCopyBusy(false);
        }
    };

    const generate = async (count = 1) => {
        if (!ready) { toast.error('Finish step 1 first'); return; }
        setImgBusy(true);
        setFlattened(false);
        setPublished(null);
        let refs = useRealPhotos ? realPhotos : [];
        let prompt = buildImagePrompt({ adType, restaurantName, items, styleValue: style, accent, extra, useRealPhotos: refs.length > 0, message });
        const angles = ['', ' Alternative: a closer, more dramatic angle.', ' Alternative: a wider shot with more background atmosphere.'];
        const run = () => Promise.allSettled(Array.from({ length: count }, (_, i) =>
            base44.integrations.Core.GenerateImage({
                prompt: prompt + angles[i % angles.length],
                ...(refs.length ? { existing_image_urls: refs } : {}),
            })));
        try {
            let results = await run();
            // A dish photo the image service can't read (HEIC, private link, deleted
            // file) fails every request. Retry once from the description alone.
            if (refs.length && !results.some(r => r.status === 'fulfilled' && r.value?.url)) {
                refs = [];
                prompt = buildImagePrompt({ adType, restaurantName, items, styleValue: style, accent, extra, useRealPhotos: false, message });
                results = await run();
                if (results.some(r => r.status === 'fulfilled' && r.value?.url)) {
                    toast.warning("Your dish photo couldn't be used, so this image was created from the description instead.");
                }
            }
            const urls = results.filter(r => r.status === 'fulfilled' && r.value?.url).map(r => r.value.url);
            if (!urls.length) {
                const firstErr = results.find(r => r.status === 'rejected')?.reason;
                throw firstErr || new Error('No image came back');
            }
            setCandidates(urls);
            setImageUrl(urls[0]);
            setImagePrompt(prompt);
            const next = [...urls.map(url => ({ url, at: Date.now(), title: copy.headline || items[0]?.name || restaurantName })), ...history].slice(0, HISTORY_MAX);
            setHistory(next);
            try { localStorage.setItem(historyKey(restaurantId), JSON.stringify(next)); } catch {}
            if (results.some(r => r.status === 'rejected')) toast.warning(`${urls.length} of ${count} images were created`);
            if (!copy.headline && !copyBusy) writeCopy();          // fill the words if still empty
        } catch (e) {
            const msg = errText(e, 'Image generation failed');
            toast.error(/policy|refus|safety/i.test(msg) ? 'The image service refused this request. Try a different style or remove extra directions.' : msg);
        } finally {
            setImgBusy(false);
        }
    };

    const addToLibrary = async (url = imageUrl, title = copy.headline || items[0]?.name || `${restaurantName} AI ad`) => {
        if (!url) return;
        try {
            await base44.entities.MediaFile.create({
                restaurant_id: restaurantId, file_url: url, file_name: `${title}.png`.slice(0, 120),
                file_type: 'image/png', file_size: 0, folder: 'AI ads', tags: ['ai'],
            });
            queryClient.invalidateQueries({ queryKey: ['media-files', restaurantId] });
            toast.success('Saved to Media Library');
        } catch (e) {
            toast.error(errText(e, 'Could not save to library'));
        }
    };

    const nextOrder = async (screenName) => {
        const rows = await base44.entities.PromotionalContent.filter({ restaurant_id: restaurantId, screen_name: screenName });
        return rows.reduce((m, r) => Math.max(m, Number(r.display_order) || 0), -1) + 1;
    };

    const publish = async () => {
        if (!imageUrl) { toast.error('Create the picture first (step 3)'); return; }
        if (!targetScreens.length) { toast.error('Choose at least one screen'); return; }
        if (overlay && !overlay.headline && !overlay.item_ids.length && !overlay.promo_code) {
            toast.error('Add a headline in step 2'); return;
        }
        setPublishing(true);
        const done = [];
        const failed = [];
        for (const screenName of targetScreens) {
            try {
                const record = buildContentRecord({
                    restaurantId, screenName, imageUrl, overlay,
                    title: copy.headline || items[0]?.name || coupon?.code || `${restaurantName} AI ad`,
                    duration, displayOrder: await nextOrder(screenName), imagePrompt,
                    endsAt: overlay?.promo_expires_at || null,
                });
                await base44.entities.PromotionalContent.create(record);
                done.push(screenName);
            } catch (e) {
                console.error('publish failed', screenName, e);
                failed.push(screenName);
            }
        }
        queryClient.invalidateQueries({ queryKey: ['promotional-content'] });
        queryClient.invalidateQueries({ queryKey: ['screen-content'] });
        setPublishing(false);
        if (done.length) {
            setPublished(done);
            toast.success(`Added to ${done.join(', ')} — it plays from the next refresh`);
        }
        if (failed.length) toast.error(`Could not add to ${failed.join(', ')}`);
    };

    const assignOrphan = async (item, screenName) => {
        if (!screenName) return;
        try {
            await base44.entities.PromotionalContent.update(item.id, { screen_name: screenName, display_order: await nextOrder(screenName) });
            toast.success(`"${item.title || 'AI ad'}" now plays on ${screenName}`);
            refetchUnassigned();
            queryClient.invalidateQueries({ queryKey: ['promotional-content'] });
        } catch (e) {
            toast.error(errText(e, 'Could not move it'));
        }
    };

    const writeSocial = async () => {
        setSocialBusy(true);
        try {
            const facts = [
                `Restaurant: ${restaurantName}`,
                copy.headline && `Headline: ${copy.headline}`,
                ...items.map(i => `${i.name}: ${gbp(livePrice(i).price)} in store`),
                coupon && `Offer: ${describeCoupon(coupon)} with code ${coupon.code}${couponExpiry(coupon) ? `, ends ${couponExpiry(coupon).toLocaleDateString('en-GB')}` : ''}`,
                websiteUrl && `Order online: ${websiteUrl}`,
            ].filter(Boolean).join('\n');
            const res = await base44.integrations.Core.InvokeLLM({
                prompt: `Write social media posts for a UK takeaway. Use ONLY these facts, copy prices exactly, invent nothing:\n${facts}\n\nReturn: instagram (2-4 short lines + 5 relevant hashtags), facebook (2-3 friendly sentences), x (under 260 characters). British English, a few emojis is fine.`,
                response_json_schema: { type: 'object', properties: { instagram: { type: 'string' }, facebook: { type: 'string' }, x: { type: 'string' } } },
            });
            setSocial(res);
        } catch (e) {
            toast.error(errText(e, 'Could not write posts'));
        } finally {
            setSocialBusy(false);
        }
    };

    const copyText = (t) => { navigator.clipboard?.writeText(t); toast.success('Copied'); };
    const previewItem = { id: 'preview', media_url: imageUrl, duration, ad_overlay: overlay || undefined };

    // ── render ────────────────────────────────────────────────────────────
    return (
        <>
            <CanvasEditor
                open={showCanvas}
                onClose={() => setShowCanvas(false)}
                backgroundUrl={imageUrl}
                restaurantId={restaurantId}
                menuItems={menuItems}
                onUse={(url) => { setImageUrl(url); setFlattened(true); setShowCanvas(false); toast.success('Canvas design ready — it will play as a plain image'); }}
            />

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] gap-6 items-start">
                {/* ── LEFT: steps ── */}
                <div className="space-y-4">
                    <Step n="1" title="What are you advertising?">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {AD_TYPES.map(t => {
                                const Icon = TYPE_ICONS[t.value];
                                return (
                                    <button key={t.value} type="button" aria-pressed={adType === t.value} onClick={() => chooseType(t.value)} className={pill(adType === t.value)}>
                                        <Icon className={`h-4 w-4 mb-1 ${adType === t.value ? 'text-orange-500' : 'text-gray-400'}`} />
                                        <p className="font-semibold text-gray-900">{t.label}</p>
                                        <p className="text-[11px] text-gray-500 leading-tight">{t.desc}</p>
                                    </button>
                                );
                            })}
                        </div>

                        {adType === 'single_item' && (
                            eligible.length === 0 ? <p className="text-sm text-gray-500">No dishes available in store. Check your menu.</p> : (
                                <select aria-label="Dish" value={itemId} onChange={e => { setItemId(e.target.value); resetResult(); }}
                                    className="w-full h-11 rounded-md border border-input bg-white px-3 text-sm">
                                    <option value="">Choose a dish…</option>
                                    {eligible.map(i => <option key={i.id} value={i.id}>{i.name} — {gbp(livePrice(i).price)}{i.is_popular ? ' ★' : ''}{i.image_url ? '' : ' (no photo)'}</option>)}
                                </select>
                            )
                        )}

                        {(adType === 'category' || adType === 'promo_code') && (
                            <div className="space-y-2">
                                {adType === 'category' && (
                                    <select aria-label="Category" value={category} onChange={e => { setCategory(e.target.value); resetResult(); }}
                                        className="w-full h-11 rounded-md border border-input bg-white px-3 text-sm">
                                        <option value="">Most popular across the menu</option>
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                )}
                                <p className="text-xs text-gray-500">{adType === 'promo_code' ? 'Optional: feature up to 3 dishes' : 'Dishes on the ad (up to 4, first is the star)'}</p>
                                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                                    {(adType === 'category' && category ? eligible.filter(i => i.category === category) : eligible).slice(0, 60).map(i => {
                                        const on = pickedIds.includes(i.id);
                                        const max = adType === 'promo_code' ? 3 : 4;
                                        return (
                                            <button key={i.id} type="button" aria-pressed={on}
                                                onClick={() => setPickedIds(ids => on ? ids.filter(x => x !== i.id) : ids.length >= max ? ids : [...ids, i.id])}
                                                className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}>
                                                {on && pickedIds[0] === i.id ? '★ ' : ''}{i.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {adType === 'promo_code' && (
                            liveCoupons.length === 0 ? (
                                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 flex gap-2">
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                    No coupons can go on a screen right now. You need an active coupon that anyone can use more than once — one-off customer codes (CRM and win-back offers) are left out. Create one in Promotions first; a screen should never show a code that doesn't work.
                                </p>
                            ) : (
                                <select aria-label="Coupon" value={couponId} onChange={e => { setCouponId(e.target.value); resetResult(); }}
                                    className="w-full h-11 rounded-md border border-input bg-white px-3 text-sm">
                                    <option value="">Choose a coupon…</option>
                                    {liveCoupons.map(c => {
                                        const exp = couponExpiry(c);
                                        return <option key={c.id} value={c.id}>{c.code} — {describeCoupon(c)}{exp ? ` (ends ${exp.toLocaleDateString('en-GB')})` : ''}{isPlatformCoupon(c) ? ' · all MealDrop restaurants' : ''}</option>;
                                    })}
                                </select>
                            )
                        )}
                        {coupon && couponExpiry(coupon) && (
                            <p className="text-xs text-gray-500">The ad stops showing automatically when this code expires.</p>
                        )}

                        {adType === 'generic' && (
                            <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} maxLength={200}
                                placeholder="What should people feel or know? e.g. Family-run since 2015, open late" />
                        )}
                    </Step>

                    <Step n="2" title="The words" hint="drawn live on the screen — always spelled right">
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="flex-1 min-w-[200px]">
                                <Label htmlFor="ai-keywords" className="text-xs text-gray-500">Words you like (optional)</Label>
                                <Input id="ai-keywords" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g. crispy, loaded, family deal" className="mt-1" />
                            </div>
                            <Button type="button" variant="outline" onClick={writeCopy} disabled={copyBusy || !ready}>
                                {copyBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                                Write with AI
                            </Button>
                        </div>
                        {copyOptions.length > 1 && (
                            <div className="flex flex-wrap gap-2">
                                {copyOptions.map((o, i) => (
                                    <button key={i} type="button" onClick={() => setCopy(o)} aria-pressed={copy.headline === o.headline}
                                        className={pill(copy.headline === o.headline)}>
                                        <span className="block text-[10px] font-bold text-orange-600">{o.hook}</span>
                                        <span className="font-semibold">{o.headline}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div><Label htmlFor="ai-hook" className="text-xs text-gray-500">Small line on top</Label>
                                <Input id="ai-hook" value={copy.hook} maxLength={24} onChange={e => setCopy(c => ({ ...c, hook: e.target.value }))} placeholder="NEW" className="mt-1" /></div>
                            <div><Label htmlFor="ai-head" className="text-xs text-gray-500">Headline</Label>
                                <Input id="ai-head" value={copy.headline} maxLength={48} onChange={e => setCopy(c => ({ ...c, headline: e.target.value }))} placeholder={items[0]?.name || 'Headline'} className="mt-1" /></div>
                            <div><Label htmlFor="ai-cta" className="text-xs text-gray-500">Call to action</Label>
                                <Input id="ai-cta" value={copy.cta} maxLength={32} onChange={e => setCopy(c => ({ ...c, cta: e.target.value }))} placeholder="Order at the counter" className="mt-1" /></div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                            {adType !== 'generic' && (
                                <label className="flex items-center gap-2"><Switch checked={showPrices} onCheckedChange={setShowPrices} />Show live till prices</label>
                            )}
                            <label className="flex items-center gap-2">Text position
                                <select aria-label="Text position" value={layout} onChange={e => setLayout(e.target.value)} className="h-8 rounded border border-input bg-white px-2 text-sm">
                                    <option value="auto">Automatic</option><option value="left">Left</option><option value="right">Right</option>
                                    <option value="bottom">Bottom</option><option value="center">Centre</option>
                                </select>
                            </label>
                        </div>
                    </Step>

                    <Step n="3" title="The picture" hint="the AI never writes text into it">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            {STYLES.map(s => (
                                <button key={s.value} type="button" aria-pressed={style === s.value} onClick={() => setStyle(s.value)} className={pill(style === s.value)}>
                                    <span className="font-semibold">{s.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                            <label className="flex items-center gap-2">
                                <Switch checked={useRealPhotos && realPhotos.length > 0} disabled={realPhotos.length === 0} onCheckedChange={setUseRealPhotos} />
                                Start from my real food photos
                                {realPhotos.length === 0 && adType !== 'generic' && <span className="text-xs text-gray-400">(no photos on these dishes)</span>}
                            </label>
                            <label className="flex items-center gap-2">Accent
                                <input type="color" aria-label="Accent colour" value={accent} onChange={e => setAccent(e.target.value)} className="h-8 w-10 rounded border border-gray-200" />
                            </label>
                            {logoUrl && <label className="flex items-center gap-2"><Switch checked={showLogo} onCheckedChange={setShowLogo} />Show logo</label>}
                            <label className="flex items-center gap-2"><Switch checked={motion === 'zoom'} onCheckedChange={v => setMotion(v ? 'zoom' : 'none')} />Slow zoom</label>
                        </div>
                        {useRealPhotos && realPhotos.length > 0 && (
                            <p className="text-xs text-gray-500">The AI restyles your actual dish photo, so customers see the food they will really get.</p>
                        )}
                        <Textarea value={extra} onChange={e => setExtra(e.target.value)} rows={2} maxLength={300}
                            placeholder="Extra direction (optional), e.g. served on a wooden board, autumn feel" />
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" onClick={() => generate(1)} disabled={imgBusy || !ready}
                                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold">
                                {imgBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                {imageUrl ? 'New picture' : 'Create picture'}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => generate(3)} disabled={imgBusy || !ready}>3 options</Button>
                            {imageUrl && (
                                <>
                                    <Button type="button" variant="outline" onClick={() => setShowCanvas(true)}><PenLine className="h-4 w-4 mr-2" />Design manually</Button>
                                    <Button type="button" variant="outline" onClick={() => addToLibrary()}><Library className="h-4 w-4 mr-2" />Save picture</Button>
                                </>
                            )}
                        </div>
                        {candidates.length > 1 && (
                            <div className="grid grid-cols-3 gap-2">
                                {candidates.map(u => (
                                    <button key={u} type="button" onClick={() => { setImageUrl(u); setFlattened(false); }} aria-pressed={imageUrl === u}
                                        className={`aspect-square overflow-hidden rounded-lg border-2 ${imageUrl === u ? 'border-orange-500' : 'border-transparent'}`}>
                                        <img src={u} alt="Option" className="h-full w-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                        {history.length > 0 && (
                            <details className="text-sm">
                                <summary className="cursor-pointer text-gray-500 flex items-center gap-1"><History className="h-3.5 w-3.5" /> Recent pictures ({history.length})</summary>
                                <div className="grid grid-cols-6 gap-1.5 mt-2">
                                    {history.map(h => (
                                        <button key={h.url} type="button" title={h.title} onClick={() => { setImageUrl(h.url); setFlattened(false); }}
                                            className="aspect-square overflow-hidden rounded border border-gray-200">
                                            <img src={h.url} alt={h.title || 'Recent picture'} className="h-full w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            </details>
                        )}
                    </Step>
                </div>

                {/* ── RIGHT: preview + publish ── */}
                <div className="space-y-4 xl:sticky xl:top-4">
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900">Preview</h3>
                            <div className="flex gap-1" role="group" aria-label="Preview shape">
                                <Button type="button" size="sm" variant={previewShape === 'landscape' ? 'default' : 'outline'} onClick={() => setPreviewShape('landscape')} aria-label="Wide screen"><Monitor className="h-4 w-4" /></Button>
                                <Button type="button" size="sm" variant={previewShape === 'portrait' ? 'default' : 'outline'} onClick={() => setPreviewShape('portrait')} aria-label="Tall screen"><Smartphone className="h-4 w-4" /></Button>
                            </div>
                        </div>
                        <div className={`mx-auto overflow-hidden rounded-xl bg-gray-900 ${previewShape === 'portrait' ? 'aspect-[9/16] w-[60%]' : 'aspect-video w-full'}`}>
                            {imgBusy ? (
                                <div className="flex h-full flex-col items-center justify-center text-gray-400 text-xs gap-2">
                                    <Loader2 className="h-7 w-7 animate-spin text-orange-500" />Painting your picture…
                                </div>
                            ) : flattened ? (
                                <img src={imageUrl} alt="Canvas design" className="h-full w-full object-cover" />
                            ) : (
                                <AdSlide item={previewItem} menuItems={menuItems} now={new Date()} />
                            )}
                        </div>
                        <p className="text-[11px] text-gray-400">
                            {flattened ? 'Manual design — plays exactly as drawn.' : 'Exactly what the screen shows. Prices update with the till; the ad hides if the star dish sells out.'}
                        </p>
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">4</span>Put it on screens</h3>
                        {activeScreens.length === 0 ? (
                            <p className="text-sm text-gray-500">No screens yet. Add one in Screens &amp; Playlists.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {activeScreens.map(s => {
                                    const on = targetScreens.includes(s.screen_name);
                                    return (
                                        <label key={s.id} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${on ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
                                            <span className="flex items-center gap-2">
                                                <input type="checkbox" checked={on} onChange={() => setTargetScreens(t => on ? t.filter(x => x !== s.screen_name) : [...t, s.screen_name])} />
                                                {s.screen_name}
                                            </span>
                                            <Badge variant="outline" className="text-[10px]">{String(s.orientation || 'landscape').startsWith('portrait') ? 'Tall' : 'Wide'}</Badge>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                        <div>
                            <Label className="text-xs text-gray-500">On screen for {duration}s each time</Label>
                            <input type="range" min="5" max="30" value={duration} onChange={e => setDuration(parseInt(e.target.value, 10))} className="w-full accent-orange-500" aria-label="Seconds on screen" />
                        </div>
                        <Button type="button" onClick={publish} disabled={publishing || !imageUrl || !targetScreens.length} className="w-full bg-green-600 hover:bg-green-700">
                            {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                            {targetScreens.length > 1 ? `Add to ${targetScreens.length} screens` : 'Add to screen'}
                        </Button>
                        {published && (
                            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800 flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <div>Playing on {published.join(', ')}.
                                    {onNavigate && <button type="button" className="ml-1 underline" onClick={() => onNavigate('playlists')}>Open playlist</button>}
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Share2 className="h-4 w-4 text-blue-500" />Social posts</h3>
                            <Button type="button" size="sm" variant="outline" onClick={writeSocial} disabled={socialBusy || !ready}>
                                {socialBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Write'}
                            </Button>
                        </div>
                        {social ? ['instagram', 'facebook', 'x'].filter(k => social[k]).map(k => (
                            <div key={k} className="rounded-lg border border-gray-100 p-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-500">{k === 'x' ? 'X' : k[0].toUpperCase() + k.slice(1)}</span>
                                    <button type="button" aria-label={`Copy ${k} post`} onClick={() => copyText(social[k])}><Copy className="h-3.5 w-3.5 text-gray-400" /></button>
                                </div>
                                <p className="text-sm text-gray-700 whitespace-pre-line mt-1">{social[k]}</p>
                            </div>
                        )) : <p className="text-xs text-gray-400">Same offer and prices, written for Instagram, Facebook and X. Download the picture from the Media Library to post with it.</p>}
                    </section>

                    {unassigned.length > 0 && (
                        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                            <h3 className="font-semibold text-amber-900 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Not on any screen ({unassigned.length})</h3>
                            <p className="text-xs text-amber-800">Earlier AI ads were saved without a screen, so they never played. Pick a screen to fix them.</p>
                            {unassigned.map(u => (
                                <div key={u.id} className="flex items-center gap-2">
                                    <img src={u.media_url} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" />
                                    <span className="text-sm text-gray-800 truncate flex-1">{u.title || 'AI ad'}</span>
                                    <select aria-label={`Screen for ${u.title || 'AI ad'}`} defaultValue="" onChange={e => assignOrphan(u, e.target.value)}
                                        className="h-8 rounded border border-input bg-white px-2 text-xs">
                                        <option value="" disabled>Add to…</option>
                                        {activeScreens.map(s => <option key={s.id} value={s.screen_name}>{s.screen_name}</option>)}
                                    </select>
                                </div>
                            ))}
                        </section>
                    )}

                    {onClose && <Button type="button" variant="ghost" className="w-full" onClick={onClose}><ImageIcon className="h-4 w-4 mr-2" />Back to Media Library</Button>}
                </div>
            </div>
        </>
    );
}
