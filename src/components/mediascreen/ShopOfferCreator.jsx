import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    Loader2, Plus, Trash2, Search, Upload, Sparkles, ImageOff, Send, CheckCircle, Download, Library,
    Monitor, Smartphone, ListPlus, Link2, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import OfferSlide from './OfferSlide';
import { slideToPngResult, downloadBlob } from './offerSnapshot';
import { checkMediaFile } from './mediaInputs';
import { functionErrorMessage } from './screenHealth';
import { buildContentRecord } from './aiAdLogic';
import {
    MAX_PRODUCTS, OFFER_TEMPLATES, parseOffers, cleanProducts, newProduct, looksAgeRestricted, aiProductPrompt,
    offerTitle, buildOfferOverlay, endOfDayUK, themeFor,
} from './offerLogic';
import { AiAllowanceBadge, useAiAllowance, useRefreshAllowance, allowanceUsedUp, generateAiPictures } from './aiAllowance';

/**
 * Shop price-offer creator (supermarkets, convenience stores, off-licences).
 *
 * 1. Type the offers the way you'd write them on a card
 * 2. Add a picture for each product: find a real one, upload a photo, or let AI draw one
 * 3. Pick a look
 * 4. Put it on screens — it fits wide and tall screens by itself
 *
 * Prices and words are never written by AI: what you type is what shows.
 */

const EXAMPLE = 'HAYATI 6000 each £12.99\n2 for £20.00\nPablo all flavours each £5.99\n2 for £10.00';
const TITLES = ["This week's offers", 'Special offers', 'Deal of the day', 'Weekend deals', 'New in store'];
const FOOTERS = ['While stocks last', 'Subject to availability', 'Ask at the till'];
const SHAPES = { landscape: { w: 1920, h: 1080, label: 'Wide' }, portrait: { w: 1080, h: 1920, label: 'Tall' } };

const londonDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
};

function Step({ n, title, hint, children }) {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 space-y-3">
            <div className="flex items-baseline gap-2 flex-wrap">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">{n}</span>
                <h3 className="font-semibold text-gray-900">{title}</h3>
                {hint && <span className="text-xs text-gray-400">{hint}</span>}
            </div>
            {children}
        </section>
    );
}

/** Find a real product photo, or paste a link to one. Always copied into our storage. */
function PicturePicker({ open, product, restaurantId, onPick, onClose }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [searching, setSearching] = useState(false);
    const [importing, setImporting] = useState('');
    const [link, setLink] = useState('');

    const search = async (q) => {
        const text = String(q || '').trim();
        if (text.length < 2) return;
        setSearching(true);
        try {
            const res = await base44.functions.invoke('productImage', { action: 'search', restaurant_id: restaurantId, query: text });
            setResults(res.data?.results || []);
        } catch (e) {
            setResults([]);
            toast.error(functionErrorMessage(e, "Couldn't search for pictures"));
        } finally {
            setSearching(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        const q = product?.name || '';
        setQuery(q); setResults(null); setLink(''); setImporting('');
        if (q.trim().length >= 2) search(q);
    }, [open, product?.name]); // eslint-disable-line react-hooks/exhaustive-deps

    const use = async (url) => {
        if (!url || importing) return;
        setImporting(url);
        try {
            const res = await base44.functions.invoke('productImage', { action: 'import', restaurant_id: restaurantId, url, name: product?.name || 'product' });
            if (!res.data?.file_url) throw new Error(res.data?.error || 'The picture could not be saved');
            onPick(res.data.file_url);
            onClose();
        } catch (e) {
            toast.error(functionErrorMessage(e, "That picture couldn't be used"));
        } finally {
            setImporting('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Find a picture{product?.name ? ` for "${product.name}"` : ''}</DialogTitle>
                    <DialogDescription>Tap the picture that matches your product. Check it's the right pack and size.</DialogDescription>
                </DialogHeader>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(query); }}>
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Product name, e.g. Coca Cola 2L" aria-label="Product to search for" />
                    <Button type="submit" disabled={searching} className="bg-orange-500 hover:bg-orange-600">
                        {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                </form>

                {searching && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Looking for pictures…</p>}
                {!searching && results && results.length === 0 && (
                    <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3">
                        No pictures found for that name. Try a shorter name (just the brand), paste a picture link below, upload your own photo, or use "Make with AI".
                    </p>
                )}
                {!searching && results && results.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {results.map(r => (
                            <button key={r.url} type="button" onClick={() => use(r.url)} disabled={!!importing}
                                className="relative rounded-xl border border-gray-200 bg-white p-2 text-left hover:border-orange-400 hover:shadow disabled:opacity-60">
                                <div className="aspect-square w-full flex items-center justify-center overflow-hidden">
                                    <img src={r.thumb} alt={r.name} loading="lazy" className="max-h-full max-w-full object-contain" />
                                </div>
                                <p className="text-[11px] font-semibold text-gray-800 truncate mt-1">{r.name || r.brand || 'Product'}</p>
                                <p className="text-[10px] text-gray-400 truncate">{[r.brand, r.size].filter(Boolean).join(' · ') || ' '}</p>
                                {importing === r.url && <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></span>}
                            </button>
                        ))}
                    </div>
                )}

                <div className="border-t pt-3 space-y-1.5">
                    <Label className="text-xs text-gray-500 flex items-center gap-1"><Link2 className="h-3 w-3" />Or paste a picture link (for example from your supplier's website)</Label>
                    <div className="flex gap-2">
                        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/product.jpg" aria-label="Picture link" />
                        <Button type="button" variant="outline" disabled={!/^https:\/\//i.test(link.trim()) || !!importing} onClick={() => use(link.trim())}>
                            {importing === link.trim() ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Use'}
                        </Button>
                    </div>
                    <p className="text-[11px] text-gray-400">Search pictures come from the open Open Food Facts product databases. Only use pictures you're allowed to use.</p>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function ShopOfferCreator({
    restaurantId, restaurantName = '', restaurantColor = '#f97316', logoUrl = '',
    onNavigate, editItem = null, onSaved, onCancel,
}) {
    const queryClient = useQueryClient();
    const { data: allowance } = useAiAllowance(restaurantId);
    const refreshAllowance = useRefreshAllowance(restaurantId);
    const aiUsedUp = allowanceUsedUp(allowance);
    const editing = !!editItem;
    const ev = editItem?.ad_overlay || {};

    const [quick, setQuick] = useState('');
    const [products, setProducts] = useState(() => (editing ? cleanProducts(ev.products) : []));
    const [title, setTitle] = useState(editing ? (ev.headline || '') : TITLES[0]);
    const [footer, setFooter] = useState(editing ? (ev.cta || '') : '');
    const [template, setTemplate] = useState(ev.template || 'deal');
    const [accent, setAccent] = useState(ev.accent || restaurantColor || '#f97316');
    const [showLogo, setShowLogo] = useState(editing ? !!ev.logo_url : !!logoUrl);
    const [endDate, setEndDate] = useState(londonDate(ev.promo_expires_at));
    const [ageBadge, setAgeBadge] = useState(!!ev.age_badge);
    const [ageTouched, setAgeTouched] = useState(editing);

    const [busyPic, setBusyPic] = useState({});            // row index → 'ai' | 'upload'
    const [pickerRow, setPickerRow] = useState(null);
    const [shape, setShape] = useState('landscape');
    const [targetScreens, setTargetScreens] = useState([]);
    const [duration, setDuration] = useState(Number(editItem?.duration) || 12);
    const [working, setWorking] = useState('');             // 'publish' | 'save' | 'download' | 'library'
    const [published, setPublished] = useState(null);
    const stageRef = useRef(null);
    const fileRefs = useRef({});

    const { data: screens = [] } = useQuery({
        queryKey: ['screens-ai', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });
    const activeScreens = useMemo(() => screens.filter(s => s.is_active !== false), [screens]);
    const isTall = (s) => String(s?.orientation || 'landscape').startsWith('portrait');

    // One screen: pick it for them, and preview in that screen's shape.
    useEffect(() => {
        if (editing || targetScreens.length || activeScreens.length !== 1) return;
        setTargetScreens([activeScreens[0].screen_name]);
        setShape(isTall(activeScreens[0]) ? 'portrait' : 'landscape');
    }, [activeScreens]); // eslint-disable-line react-hooks/exhaustive-deps

    const clean = useMemo(() => cleanProducts(products), [products]);
    useEffect(() => { if (!ageTouched) setAgeBadge(looksAgeRestricted(clean)); }, [clean, ageTouched]);

    const endsAt = endDate ? endOfDayUK(endDate) : null;
    const expired = !!endsAt && endsAt.getTime() <= Date.now();
    const overlay = useMemo(() => buildOfferOverlay({
        offerId: ev.offer_id, template, accent, title, footer, products: clean,
        logoUrl: showLogo ? (logoUrl || ev.logo_url || '') : '', endsAt, ageBadge,
    }), [template, accent, title, footer, clean, showLogo, logoUrl, endDate, ageBadge]); // eslint-disable-line react-hooks/exhaustive-deps
    const previewItem = { id: 'preview', ad_overlay: overlay };
    const size = SHAPES[shape];
    const usesAccent = template === 'night' || template === 'clean';

    // ── products ──────────────────────────────────────────────────────────
    const setRow = (i, patch) => setProducts(list => list.map((p, n) => (n === i ? { ...p, ...patch } : p)));
    const removeRow = (i) => setProducts(list => list.filter((_, n) => n !== i));
    const addRow = () => setProducts(list => (list.length >= MAX_PRODUCTS ? list : [...list, newProduct()]));

    const addTyped = (text = quick) => {
        const parsed = parseOffers(text);
        if (!parsed.length) { toast.error('Type a product and its price first, e.g. "Milk 2 litre £1.65"'); return; }
        const kept = products.filter(p => p.name || p.price);
        const room = MAX_PRODUCTS - kept.length;
        if (room <= 0) { toast.error(`An ad holds up to ${MAX_PRODUCTS} products. Remove one first, or make a second ad.`); return; }
        setProducts([...kept, ...parsed.slice(0, room)]);
        setQuick('');
        if (parsed.length > room) toast.warning(`Added ${room} of ${parsed.length}. An ad holds up to ${MAX_PRODUCTS} products — put the rest in a second ad.`);
        else toast.success(`Added ${parsed.length} product${parsed.length === 1 ? '' : 's'} — check the prices below`);
    };

    const uploadPhoto = async (i, e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const problem = checkMediaFile(file);
        if (problem) { toast.error(problem, { duration: 8000 }); return; }
        if (!String(file.type).startsWith('image/')) { toast.error('Choose a photo, not a video'); return; }
        setBusyPic(b => ({ ...b, [i]: 'upload' }));
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            setRow(i, { image_url: file_url });
        } catch {
            toast.error('Upload failed. Please try again.');
        } finally {
            setBusyPic(b => ({ ...b, [i]: '' }));
        }
    };

    const makeAiPicture = async (i) => {
        const p = products[i];
        if (!p?.name) { toast.error('Type the product name first'); return; }
        setBusyPic(b => ({ ...b, [i]: 'ai' }));
        try {
            const res = await generateAiPictures({ restaurantId, kind: 'product_picture', prompts: [aiProductPrompt(p)] });
            refreshAllowance(res.status);
            if (!res.urls[0]) throw new Error(res.error || 'No picture came back');
            setRow(i, { image_url: res.urls[0] });
            toast.success('AI picture added. It is an illustration — for branded products a real photo is more accurate.', { duration: 7000 });
        } catch (e) {
            if (e?.status) refreshAllowance(e.status);
            const msg = e?.code ? e.message : functionErrorMessage(e, 'The AI picture failed');
            toast.error(e?.code ? msg : /policy|refus|safety/i.test(msg) ? "The AI service won't draw this product. Use Find or Upload instead." : msg);
        } finally {
            setBusyPic(b => ({ ...b, [i]: '' }));
        }
    };

    // ── picture of the whole ad ───────────────────────────────────────────
    /** The ad as a PNG. Warns (once per save) if any product photo couldn't be included. */
    const drawPng = async () => {
        const node = stageRef.current?.querySelector('[data-offer-slide]');
        const { blob, missing } = await slideToPngResult(node, size.w, size.h);
        if (missing) {
            toast.warning(`${missing} product photo${missing === 1 ? '' : 's'} couldn't be added to the saved picture. Try "Find picture" again for ${missing === 1 ? 'it' : 'them'}. (Screens still show the photos.)`, { duration: 9000 });
        }
        return blob;
    };
    const fileName = () => `${offerTitle(clean, title).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'offer'}-${shape}.png`;

    const uploadSnapshot = async () => {
        try {
            const blob = await drawPng();
            const { file_url } = await base44.integrations.Core.UploadFile({ file: new File([blob], fileName(), { type: 'image/png' }) });
            return file_url ? { url: file_url, size: blob.size } : null;
        } catch (e) {
            console.warn('offer snapshot failed', e);
            return '';
        }
    };

    const download = async () => {
        setWorking('download');
        try { downloadBlob(await drawPng(), fileName()); }
        catch { toast.error("This browser couldn't save the picture. Try Chrome on a computer."); }
        finally { setWorking(''); }
    };

    const saveToLibrary = async () => {
        setWorking('library');
        try {
            const snap = await uploadSnapshot();
            if (!snap) throw new Error('no picture');
            await base44.entities.MediaFile.create({
                restaurant_id: restaurantId, file_url: snap.url, file_name: fileName(), file_type: 'image/png', file_size: snap.size, folder: 'Offers', tags: ['offer'],
            });
            queryClient.invalidateQueries({ queryKey: ['media-files', restaurantId] });
            toast.success('Saved to Media Library as a picture');
        } catch {
            toast.error("Couldn't save the picture. Try Chrome on a computer.");
        } finally {
            setWorking('');
        }
    };

    // ── publish / save ────────────────────────────────────────────────────
    const problems = () => {
        if (!clean.length) return 'Add at least one product';
        const noPrice = clean.find(p => !p.price && !p.offer);
        if (noPrice) return `"${noPrice.name}" has no price or offer`;
        const noName = clean.find(p => !p.name);
        if (noName) return 'One product has a price but no name';
        if (expired) return 'The end date is in the past';
        return '';
    };

    const nextOrder = async (screenName) => {
        const rows = await base44.entities.PromotionalContent.filter({ restaurant_id: restaurantId, screen_name: screenName });
        return rows.reduce((m, r) => Math.max(m, Number(r.display_order) || 0), -1) + 1;
    };

    const publish = async () => {
        const problem = problems();
        if (problem) { toast.error(problem); return; }
        if (!targetScreens.length) { toast.error('Choose at least one screen'); return; }
        setWorking('publish');
        const picture = (await uploadSnapshot())?.url || clean.find(p => p.image_url)?.image_url || '';
        const done = [], failed = [];
        for (const screenName of targetScreens) {
            try {
                await base44.entities.PromotionalContent.create(buildContentRecord({
                    restaurantId, screenName, imageUrl: picture, overlay, title: offerTitle(clean, title),
                    duration, displayOrder: await nextOrder(screenName), imagePrompt: '', endsAt,
                }));
                done.push(screenName);
            } catch (e) {
                console.error('offer publish failed', screenName, e);
                failed.push(screenName);
            }
        }
        queryClient.invalidateQueries({ queryKey: ['promotional-content'] });
        queryClient.invalidateQueries({ queryKey: ['screen-content'] });
        setWorking('');
        if (done.length) { setPublished(done); toast.success(`On ${done.join(', ')} — it starts playing within a minute`); }
        if (failed.length) toast.error(`Could not add to ${failed.join(', ')}`);
    };

    const saveChanges = async () => {
        const problem = problems();
        if (problem) { toast.error(problem); return; }
        setWorking('save');
        try {
            const picture = (await uploadSnapshot())?.url || editItem.media_url || '';
            const all = await base44.entities.PromotionalContent.filter({ restaurant_id: restaurantId });
            const copies = all.filter(c => c.id === editItem.id || (ev.offer_id && c.ad_overlay?.offer_id === ev.offer_id));
            await Promise.all(copies.map(c => {
                const schedule = endsAt
                    ? { ...(c.schedule || {}), enabled: true, end_date: endsAt.toISOString() }
                    : (c.schedule?.end_date ? { ...c.schedule, end_date: '' } : c.schedule);
                return base44.entities.PromotionalContent.update(c.id, {
                    ad_overlay: overlay, title: offerTitle(clean, title), media_url: picture,
                    ...(c.id === editItem.id ? { duration } : {}),
                    ...(schedule !== undefined ? { schedule } : {}),
                });
            }));
            queryClient.invalidateQueries({ queryKey: ['promotional-content'] });
            queryClient.invalidateQueries({ queryKey: ['screen-content'] });
            toast.success(copies.length > 1 ? `Offer updated on ${copies.length} screens` : 'Offer updated — the screen picks it up within a minute');
            onSaved?.();
        } catch (e) {
            toast.error(functionErrorMessage(e, "Couldn't save the offer"));
        } finally {
            setWorking('');
        }
    };

    const chip = (active) => `rounded-full border px-2.5 py-1 text-xs ${active ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`;

    // ── render ────────────────────────────────────────────────────────────
    return (
        <>
            <PicturePicker
                open={pickerRow !== null}
                product={pickerRow !== null ? products[pickerRow] : null}
                restaurantId={restaurantId}
                onPick={(url) => setRow(pickerRow, { image_url: url })}
                onClose={() => setPickerRow(null)}
            />

            {/* Full-size copy used to make the picture file. Off-screen, never visible. */}
            <div ref={stageRef} aria-hidden="true" style={{ position: 'fixed', left: -100000, top: 0, width: size.w, height: size.h, pointerEvents: 'none' }}>
                <OfferSlide item={previewItem} size={{ w: size.w, h: size.h }} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] gap-6 items-start">
                <div className="space-y-4">
                    <Step n="1" title="Your offers" hint={`up to ${MAX_PRODUCTS} products per ad`}>
                        <div className="space-y-2">
                            <Label htmlFor="offer-quick" className="text-sm text-gray-700">Type them like you'd write them on a card — one product per line, the deal on the line below</Label>
                            <Textarea id="offer-quick" rows={4} value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={EXAMPLE} className="font-mono text-sm" />
                            <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" onClick={() => addTyped()} disabled={!quick.trim()} className="bg-orange-500 hover:bg-orange-600">
                                    <ListPlus className="h-4 w-4 mr-2" />Add to my ad
                                </Button>
                                {!products.length && <button type="button" className="text-xs text-orange-600 underline" onClick={() => addTyped(EXAMPLE)}>Try an example</button>}
                            </div>
                        </div>

                        {products.length > 0 && (
                            <div className="space-y-3 pt-1">
                                {products.map((p, i) => (
                                    <div key={i} className="rounded-xl border border-gray-200 p-3 flex flex-col sm:flex-row gap-3" data-testid="offer-row">
                                        <div className="flex sm:flex-col items-center gap-2 sm:w-28 flex-shrink-0">
                                            <div className="h-20 w-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                {busyPic[i] ? <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                                                    : p.image_url ? <img src={p.image_url} alt="" className="max-h-full max-w-full object-contain" />
                                                        : <ImageOff className="h-6 w-6 text-gray-300" />}
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-1 gap-1 w-full">
                                                <Button type="button" size="sm" variant="outline" className="h-7 text-xs justify-start" disabled={!!busyPic[i]} onClick={() => setPickerRow(i)}><Search className="h-3 w-3 mr-1" />Find picture</Button>
                                                <Button type="button" size="sm" variant="outline" className="h-7 text-xs justify-start" disabled={!!busyPic[i]} onClick={() => fileRefs.current[i]?.click()}><Upload className="h-3 w-3 mr-1" />My photo</Button>
                                                <Button type="button" size="sm" variant="outline" className="h-7 text-xs justify-start" disabled={!!busyPic[i] || aiUsedUp} title={aiUsedUp ? 'No AI pictures left this week' : undefined} onClick={() => makeAiPicture(i)}><Sparkles className="h-3 w-3 mr-1" />Make with AI</Button>
                                                {p.image_url && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs justify-start text-gray-500" onClick={() => setRow(i, { image_url: '' })}>No picture</Button>}
                                            </div>
                                            <input ref={(el) => { fileRefs.current[i] = el; }} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => uploadPhoto(i, e)} />
                                        </div>
                                        <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
                                            <label className="col-span-2 text-xs text-gray-500">Product
                                                <Input value={p.name} maxLength={48} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="e.g. Coca Cola 2L" className="mt-0.5" aria-label={`Product ${i + 1} name`} />
                                            </label>
                                            <label className="text-xs text-gray-500">Price
                                                <Input value={p.price} maxLength={14} onChange={(e) => setRow(i, { price: e.target.value })} placeholder="£1.99" className="mt-0.5" aria-label={`Product ${i + 1} price`} />
                                            </label>
                                            <label className="text-xs text-gray-500">Sold
                                                <select value={p.unit} onChange={(e) => setRow(i, { unit: e.target.value })} aria-label={`Product ${i + 1} unit`}
                                                    className="mt-0.5 h-9 w-full rounded-md border border-input bg-white px-2 text-sm text-gray-900">
                                                    <option value="">(nothing shown)</option>
                                                    <option value="each">each</option>
                                                    <option value="per kg">per kg</option>
                                                    <option value="per pack">per pack</option>
                                                    <option value="per litre">per litre</option>
                                                    {p.unit && !['each', 'per kg', 'per pack', 'per litre'].includes(p.unit) && <option value={p.unit}>{p.unit}</option>}
                                                </select>
                                            </label>
                                            <label className="col-span-2 text-xs text-gray-500">Deal (optional)
                                                <Input value={p.offer} maxLength={44} onChange={(e) => setRow(i, { offer: e.target.value })} placeholder="2 for £3.50" className="mt-0.5" aria-label={`Product ${i + 1} deal`} />
                                            </label>
                                            <label className="text-xs text-gray-500">Small line (optional)
                                                <Input value={p.detail} maxLength={40} onChange={(e) => setRow(i, { detail: e.target.value })} placeholder="all flavours" className="mt-0.5" aria-label={`Product ${i + 1} small line`} />
                                            </label>
                                            <label className="text-xs text-gray-500">Was price (optional)
                                                <Input value={p.was} maxLength={14} onChange={(e) => setRow(i, { was: e.target.value })} placeholder="£2.50" className="mt-0.5" aria-label={`Product ${i + 1} was price`} />
                                            </label>
                                        </div>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(i)} className="self-start h-8 w-8 p-0 text-gray-400 hover:text-red-600" title="Remove this product" aria-label={`Remove product ${i + 1}`}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                {products.length < MAX_PRODUCTS && (
                                    <Button type="button" variant="outline" size="sm" onClick={addRow}><Plus className="h-4 w-4 mr-1" />Add another product</Button>
                                )}
                                <AiAllowanceBadge restaurantId={restaurantId} />
                                <p className="text-[11px] text-gray-400">Pictures: "Find picture" searches real pack photos (best for groceries). "My photo" uses your phone camera or a file. "Make with AI" draws an illustration — it can't copy a brand's real packaging.</p>
                            </div>
                        )}
                    </Step>

                    <Step n="2" title="Choose a look">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            {OFFER_TEMPLATES.map(tpl => {
                                const th = themeFor(tpl.value, accent);
                                const on = template === tpl.value;
                                return (
                                    <button key={tpl.value} type="button" aria-pressed={on} onClick={() => setTemplate(tpl.value)}
                                        className={`rounded-xl border-2 p-1.5 text-left transition-all ${on ? 'border-orange-500 shadow' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <div className="h-14 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(155deg, ${th.bg}, ${th.bg2})` }}>
                                            <span className="rounded-md px-2 py-0.5 text-sm font-black" style={{ background: th.priceBg, color: th.price }}>£1.99</span>
                                        </div>
                                        <p className="text-xs font-semibold text-gray-900 mt-1">{tpl.label}</p>
                                        <p className="text-[10px] text-gray-500 leading-tight">{tpl.desc}</p>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="grid md:grid-cols-2 gap-3">
                            <div>
                                <Label htmlFor="offer-title" className="text-xs text-gray-500">Heading at the top</Label>
                                <Input id="offer-title" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder="(no heading)" className="mt-0.5" />
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {TITLES.map(x => <button key={x} type="button" className={chip(title === x)} onClick={() => setTitle(x)}>{x}</button>)}
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="offer-footer" className="text-xs text-gray-500">Small print at the bottom (optional)</Label>
                                <Input id="offer-footer" value={footer} maxLength={60} onChange={(e) => setFooter(e.target.value)} placeholder="(none)" className="mt-0.5" />
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {FOOTERS.map(x => <button key={x} type="button" className={chip(footer === x)} onClick={() => setFooter(footer === x ? '' : x)}>{x}</button>)}
                                </div>
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 pt-1">
                            <div>
                                <Label htmlFor="offer-end" className="text-xs text-gray-500">Offer ends (optional)</Label>
                                <Input id="offer-end" type="date" value={endDate} min={londonDate(new Date().toISOString())} onChange={(e) => setEndDate(e.target.value)} className="mt-0.5" />
                                <p className={`text-[11px] mt-1 ${expired ? 'text-red-600' : 'text-gray-400'}`}>
                                    {expired ? 'That date has already passed.' : endDate ? 'The ad shows the end date and comes off the screen by itself that night.' : 'Leave empty and it plays until you remove it.'}
                                </p>
                            </div>
                            <div className="space-y-2.5">
                                {(logoUrl || ev.logo_url) && (
                                    <label className="flex items-center justify-between text-sm text-gray-700">Show my shop logo
                                        <Switch checked={showLogo} onCheckedChange={setShowLogo} />
                                    </label>
                                )}
                                <label className="flex items-center justify-between text-sm text-gray-700">Show 18+ mark
                                    <Switch checked={ageBadge} onCheckedChange={(v) => { setAgeTouched(true); setAgeBadge(v); }} />
                                </label>
                                {usesAccent && (
                                    <label className="flex items-center justify-between text-sm text-gray-700">Price colour
                                        <input type="color" value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#f97316'} onChange={(e) => setAccent(e.target.value)} className="h-8 w-12 rounded border border-gray-200 bg-white" aria-label="Price colour" />
                                    </label>
                                )}
                            </div>
                        </div>
                    </Step>
                </div>

                {/* ── RIGHT: preview + publish ── */}
                <div className="space-y-4 xl:sticky xl:top-4">
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900">Preview</h3>
                            <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="Screen shape">
                                {Object.entries(SHAPES).map(([k, s]) => (
                                    <button key={k} type="button" aria-pressed={shape === k} onClick={() => setShape(k)}
                                        className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${shape === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}>
                                        {k === 'landscape' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}{s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mx-auto overflow-hidden rounded-xl bg-black shadow-inner" style={shape === 'landscape' ? { aspectRatio: '16 / 9', width: '100%' } : { aspectRatio: '9 / 16', height: 'min(62vh, 560px)' }}>
                            <OfferSlide item={previewItem} />
                        </div>
                        <p className="text-[11px] text-gray-400">Exactly what the screen shows. The same ad fits wide and tall screens by itself — use the buttons to see both.</p>
                        <div className="grid grid-cols-2 gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={download} disabled={!clean.length || !!working}>
                                {working === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}Download picture
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={saveToLibrary} disabled={!clean.length || !!working}>
                                {working === 'library' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Library className="h-3.5 w-3.5 mr-1.5" />}Save to library
                            </Button>
                        </div>
                        <p className="text-[11px] text-gray-400">The picture is saved in the shape shown ({size.label.toLowerCase()}, {size.w}×{size.h}) — handy for WhatsApp, Facebook or printing.</p>
                    </section>

                    {editing ? (
                        <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                            <div>
                                <Label className="text-xs text-gray-500">On screen for {duration}s each time</Label>
                                <input type="range" min="5" max="60" value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10))} className="w-full accent-orange-500" aria-label="Seconds on screen" />
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" onClick={saveChanges} disabled={!!working} className="flex-1 bg-green-600 hover:bg-green-700">
                                    {working === 'save' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Save changes
                                </Button>
                                {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={!!working}>Cancel</Button>}
                            </div>
                        </section>
                    ) : (
                        <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">3</span>Put it on screens</h3>
                            {activeScreens.length === 0 ? (
                                <p className="text-sm text-gray-500">No screens yet. Add one in Screens &amp; Playlists.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {activeScreens.map(s => {
                                        const on = targetScreens.includes(s.screen_name);
                                        return (
                                            <label key={s.id} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${on ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
                                                <span className="flex items-center gap-2">
                                                    <input type="checkbox" checked={on} onChange={() => setTargetScreens(t => (on ? t.filter(x => x !== s.screen_name) : [...t, s.screen_name]))} />
                                                    {s.screen_name}
                                                </span>
                                                <Badge variant="outline" className="text-[10px]">{isTall(s) ? 'Tall' : 'Wide'}</Badge>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                            <div>
                                <Label className="text-xs text-gray-500">On screen for {duration}s each time</Label>
                                <input type="range" min="5" max="60" value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10))} className="w-full accent-orange-500" aria-label="Seconds on screen" />
                            </div>
                            <Button type="button" onClick={publish} disabled={!!working || !clean.length || !targetScreens.length} className="w-full bg-green-600 hover:bg-green-700">
                                {working === 'publish' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                                {targetScreens.length > 1 ? `Put on ${targetScreens.length} screens` : 'Put on screen'}
                            </Button>
                            {published && (
                                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800 flex items-start gap-2">
                                    <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    <div>Playing on {published.join(', ')}. To change a price later, open the playlist and tap the edit button on this ad.
                                        {onNavigate && <button type="button" className="ml-1 underline" onClick={() => onNavigate('playlists')}>Open playlist</button>}
                                    </div>
                                </div>
                            )}
                        </section>
                    )}
                    {restaurantName && !editing && <p className="text-[11px] text-gray-400 px-1">Making ads for {restaurantName}.</p>}
                </div>
            </div>
        </>
    );
}
