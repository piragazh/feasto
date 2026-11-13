import React, { useEffect, useRef, useState } from 'react';
import { themeFor, gridFor, splitPrice, cleanProducts, endsLabel } from './offerLogic';

/**
 * Draws a shop price-offer ad ("HAYATI 6000 each £12.99 · 2 for £20").
 *
 * Everything is laid out from the size of the box it is in, so the same ad
 * fills a wide TV, a tall (portrait) TV or a small layout zone, and stays
 * sharp at 4K. Inline styles only: the same component is used on screens,
 * in the Studio preview and for the downloadable picture.
 *
 * Layouts (ad_overlay.style): cards · tags (shelf labels) · hero (star
 * product) · list (price board).
 */

function useBoxSize(ref, fixed) {
    const [size, setSize] = useState({ w: fixed?.w || 0, h: fixed?.h || 0 });
    useEffect(() => {
        if (fixed?.w && fixed?.h) { setSize({ w: fixed.w, h: fixed.h }); return undefined; }
        const el = ref.current;
        if (!el) return undefined;
        const measure = () => setSize({
            w: el.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1920),
            h: el.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 1080),
        });
        measure();
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(measure);
            ro.observe(el);
            return () => ro.disconnect();
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [ref, fixed?.w, fixed?.h]);
    return size;
}

// One fixed, always-available font: text is measured to fit, so the font the
// screen draws with must be the font that was measured (TVs, phones and PCs
// all have a bold sans; a web font may not have loaded on a screen yet).
export const OFFER_FONT = 'Arial, Helvetica, "Liberation Sans", Roboto, sans-serif';

let measureCtx = null;
/** Width of `text` in em (multiples of the font size), bold. */
function em(text) {
    const s = String(text || '');
    if (measureCtx === null) {
        try { measureCtx = document.createElement('canvas').getContext('2d') || false; } catch { measureCtx = false; }
    }
    if (!measureCtx || !measureCtx.measureText) return s.length * 0.68;
    measureCtx.font = `900 100px ${OFFER_FONT}`;
    const w = measureCtx.measureText(s).width;
    return w > 0 ? w / 100 : s.length * 0.68;
}

/** Best place to break text into two balanced lines. */
function breakTwo(s) {
    const words = s.split(' ');
    if (words.length < 2) return [s];
    let best = null;
    for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const widest = Math.max(em(a), em(b));
        if (!best || widest < best.widest) best = { widest, lines: [a, b] };
    }
    return best.lines;
}

/** Biggest size (up to max) at which the text fits the width, on one line or two. */
function fitText(text, width, max, { two = true, extraEm = 0 } = {}) {
    const s = String(text || '');
    let lines = [s];
    let size = width / (em(s) + extraEm);
    if (two && size < max) {
        const pair = breakTwo(s);
        if (pair.length === 2) {
            const size2 = Math.min(width / Math.max(em(pair[0]), em(pair[1])), max * 0.74);
            if (size2 > size) { lines = pair; size = size2; }
        }
    }
    return { lines, size: Math.max(6, Math.min(size, max) * 0.97) };
}

function ProductImage({ src, radius }) {
    const [broken, setBroken] = useState(false);
    if (!src || broken) return null;
    return (
        <div style={{ width: '100%', height: '100%', background: '#ffffff', borderRadius: radius, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={src} alt="" onError={() => setBroken(true)}
                style={{ maxWidth: '92%', maxHeight: '92%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }} />
        </div>
    );
}

/** Width of a drawn price, in multiples of its size (for fitting). */
function priceEm(price, unit, boxed = true) {
    const s = splitPrice(price);
    return (s.cur ? 0.36 : 0) + em(s.whole) + (s.frac || s.suffix || unit ? 0.62 : 0) + (boxed ? 0.46 : 0.04);
}

function Price({ price, unit, size, t, plain = false }) {
    const s = splitPrice(price);
    return (
        <div style={{ display: 'inline-flex', alignItems: 'flex-start', background: plain ? 'transparent' : t.priceBg, color: t.price, borderRadius: size * 0.16, padding: plain ? 0 : `${size * 0.08}px ${size * 0.22}px ${size * 0.1}px`, fontWeight: 900, lineHeight: 1, boxShadow: plain ? 'none' : '0 6px 18px rgba(0,0,0,.18)', whiteSpace: 'nowrap' }}>
            {s.cur && <span style={{ fontSize: size * 0.5, marginTop: size * 0.08, marginRight: size * 0.03 }}>{s.cur}</span>}
            <span style={{ fontSize: size }}>{s.whole}</span>
            {(s.frac || s.suffix || unit) && (
                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', marginLeft: size * 0.05, marginTop: size * 0.07 }}>
                    {s.frac && <span style={{ fontSize: size * 0.46 }}>.{s.frac}</span>}
                    {s.suffix && <span style={{ fontSize: size * 0.5 }}>{s.suffix}</span>}
                    {unit && <span style={{ fontSize: size * 0.2, fontWeight: 800, textTransform: 'uppercase', marginTop: s.frac || s.suffix ? size * 0.05 : size * 0.3, opacity: 0.85 }}>{unit}</span>}
                </span>
            )}
        </div>
    );
}

const cardShadow = (t, size) => (t.glow
    ? `0 0 0 ${Math.max(1, size * 0.006)}px ${t.glow}, 0 0 ${size * 0.06}px ${t.glow}55`
    : '0 10px 30px rgba(0,0,0,.22)');

/** Shelf-label look: product on top, a full-width coloured price band at the bottom. */
function TagCard({ p, w, h, t }) {
    const hasImg = !!p.image_url;
    const wide = w / h >= 1.3;
    const r = Math.min(w, h) * 0.07;
    const bandH = h * (p.offer ? 0.44 : 0.36);
    const topH = h - bandH;
    const pad = Math.min(w, topH) * 0.08;
    const innerW = w - pad * 2;
    const innerH = topH - pad * 2;
    const imgW = hasImg ? (wide ? innerW * 0.38 : innerW) : 0;
    const imgH = hasImg ? (wide ? innerH : innerH * 0.55) : 0;
    const gap = Math.min(w, h) * 0.03;
    const textW = wide && hasImg ? innerW - imgW - gap : innerW;
    const textH = !wide && hasImg ? innerH - imgH - gap : innerH;

    let name = fitText(p.name.toUpperCase(), textW, textH * (p.detail ? 0.42 : 0.5));
    let detail = p.detail ? fitText(p.detail, textW, textH * 0.2, { two: false }).size : 0;
    const used = name.size * 1.06 * name.lines.length + (detail ? detail * 1.2 + gap * 0.5 : 0);
    if (used > textH) { const f = textH / used; name = { ...name, size: name.size * f }; detail *= f; }

    // Band: price on the left and the deal on the right when there's room, else stacked.
    const bandPad = Math.min(w, bandH) * 0.1;
    const sideBySide = p.offer && w / bandH > 2.6;
    const offerText = p.offer.toUpperCase();
    const bandInnerW = w - bandPad * 2;
    const bandInnerH = bandH - bandPad * 2;
    const priceW = sideBySide ? bandInnerW * 0.55 : bandInnerW;
    const priceH = sideBySide || !p.offer ? bandInnerH : bandInnerH * 0.68;
    const price = p.price ? Math.min(priceH * 1.05, priceW / priceEm(p.price, p.unit, false)) : 0;
    const offerW = sideBySide ? bandInnerW - priceW - bandPad : bandInnerW;
    const offerH = sideBySide ? bandInnerH * 0.42 : bandInnerH * 0.24;
    const offer = p.offer ? fitText(offerText, offerW, offerH, { two: false, extraEm: 1.5 }).size : 0;
    const align = wide && hasImg ? 'flex-start' : 'center';

    return (
        <div style={{ width: w, height: h, boxSizing: 'border-box', background: t.card, borderRadius: r, overflow: 'hidden', boxShadow: cardShadow(t, Math.min(w, h)), display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: topH, boxSizing: 'border-box', padding: pad, display: 'flex', flexDirection: wide ? 'row' : 'column', gap, alignItems: 'center', justifyContent: 'center' }}>
                {hasImg && <div style={{ width: imgW, height: imgH, flexShrink: 0 }}><ProductImage src={p.image_url} radius={r * 0.6} /></div>}
                <div style={{ width: textW, display: 'flex', flexDirection: 'column', alignItems: align, textAlign: align === 'center' ? 'center' : 'left', gap: gap * 0.5 }}>
                    <div style={{ color: t.text, fontSize: name.size, fontWeight: 900, lineHeight: 1.06, whiteSpace: 'nowrap' }}>{name.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
                    {p.detail && <div style={{ color: t.muted, fontSize: detail, fontWeight: 700, whiteSpace: 'nowrap' }}>{p.detail}</div>}
                    {p.was && <div style={{ color: t.muted, fontSize: Math.max(7, detail || name.size * 0.4), fontWeight: 800, textDecoration: 'line-through', whiteSpace: 'nowrap' }}>was {p.was}</div>}
                </div>
            </div>
            <div style={{ height: bandH, boxSizing: 'border-box', background: t.priceBg, padding: bandPad, display: 'flex', flexDirection: sideBySide ? 'row' : 'column', alignItems: 'center', justifyContent: sideBySide ? 'space-between' : 'center', gap: bandPad * 0.5 }}>
                {p.price && <Price price={p.price} unit={p.unit} size={price} t={t} plain />}
                {p.offer && <div style={{ background: t.offerBg, color: t.offerText, fontSize: offer, fontWeight: 900, lineHeight: 1, padding: `${offer * 0.4}px ${offer * 0.75}px`, borderRadius: offer, whiteSpace: 'nowrap' }}>{offerText}</div>}
            </div>
        </div>
    );
}

/** Sizes for one price-list row, before rows are matched to each other. */
function rowSizes(p, w, h, caps = null) {
    const hasImg = !!p.image_url;
    const pad = Math.min(h * 0.14, w * 0.03);
    const ih = h - pad * 2;
    const gap = pad;
    const imgW = hasImg ? Math.min(ih, w * 0.24) : 0;
    let price = p.price ? Math.min(ih * 0.8, (w * 0.26) / priceEm(p.price, p.unit)) : 0;
    if (caps) price = Math.min(price, caps.price);
    const priceBoxW = p.price ? price * priceEm(p.price, p.unit) : 0;
    const offerText = p.offer.toUpperCase();
    // Narrow rows: the deal goes under the name, so the name keeps its room.
    const stackOffer = !!p.offer && w / h < 4.4;
    let offer = p.offer && !stackOffer ? fitText(offerText, w * 0.26, ih * 0.36, { two: false, extraEm: 1.5 }).size : 0;
    const offerBoxW = p.offer && !stackOffer ? offer * (em(offerText) + 1.5) : 0;
    const textW = Math.max(10, w - pad * 2 - imgW - priceBoxW - offerBoxW - gap * (1 + (hasImg ? 1 : 0) + (offerBoxW ? 1 : 0)));
    if (stackOffer) offer = fitText(offerText, textW, ih * 0.22, { two: false, extraEm: 1.5 }).size;
    if (caps && offer) offer = Math.min(offer, caps.offer);
    let name = fitText(p.name.toUpperCase(), textW, ih * (p.detail || stackOffer ? 0.42 : 0.6));
    if (caps) {
        // Same name size on every row; re-break to one line if that now fits.
        const one = textW / em(p.name.toUpperCase());
        name = one >= caps.name * 0.98 ? { lines: [p.name.toUpperCase()], size: caps.name } : { ...name, size: Math.min(name.size, caps.name) };
    }
    let detail = p.detail ? fitText(p.detail, textW, ih * 0.24, { two: false }).size : 0;
    const used = name.size * 1.06 * name.lines.length + detail * 1.2 + (stackOffer ? offer * 1.9 : 0);
    if (used > ih) { const f = ih / used; name = { ...name, size: name.size * f }; detail *= f; if (stackOffer) offer *= f; }
    return { hasImg, pad, ih, gap, imgW, price, offer, offerText, stackOffer, name, detail };
}

/** Matching sizes for a set of rows, so the board looks even. */
function rowCaps(list, w, h) {
    if (!list.length) return null;
    const all = list.map(p => rowSizes(p, w, h));
    // The middle size, not the smallest: one crowded row shouldn't shrink the
    // whole board. Rows that can't reach it keep their own, smaller size.
    const pick = (k) => {
        const v = all.map(a => (k === 'name' ? a.name.size : a[k])).filter(x => x > 0).sort((a, b) => a - b);
        return v.length ? v[Math.floor((v.length - 1) / 2)] : Infinity;
    };
    return { name: pick('name'), price: pick('price'), offer: pick('offer') };
}

/** Price-list row: picture, name, deal and price on one line. */
function Row({ p, w, h, t, caps }) {
    const { hasImg, pad, ih, gap, imgW, price, offer, offerText, stackOffer, name, detail } = rowSizes(p, w, h, caps);
    const chip = <div style={{ background: t.offerBg, color: t.offerText, fontSize: offer, fontWeight: 900, lineHeight: 1, padding: `${offer * 0.4}px ${offer * 0.75}px`, borderRadius: offer, whiteSpace: 'nowrap', flexShrink: 0, alignSelf: stackOffer ? 'flex-start' : 'center', marginTop: stackOffer ? ih * 0.05 : 0 }}>{offerText}</div>;
    return (
        <div style={{ width: w, height: h, boxSizing: 'border-box', background: t.card, borderRadius: h * 0.16, padding: pad, display: 'flex', alignItems: 'center', gap, overflow: 'hidden', boxShadow: cardShadow(t, h * 1.6) }}>
            {hasImg && <div style={{ width: imgW, height: Math.min(ih, imgW * 1.3), flexShrink: 0 }}><ProductImage src={p.image_url} radius={Math.min(h, w) * 0.05} /></div>}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ color: t.text, fontSize: name.size, fontWeight: 900, lineHeight: 1.06, whiteSpace: 'nowrap' }}>{name.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
                {(p.detail || p.was) && <div style={{ color: t.muted, fontSize: detail || name.size * 0.5, fontWeight: 700, whiteSpace: 'nowrap', marginTop: ih * 0.03 }}>{p.detail}{p.detail && p.was ? ' · ' : ''}{p.was && <span style={{ textDecoration: 'line-through' }}>was {p.was}</span>}</div>}
                {p.offer && stackOffer && chip}
            </div>
            {p.offer && !stackOffer && chip}
            {p.price && <div style={{ flexShrink: 0 }}><Price price={p.price} unit={p.unit} size={price} t={t} /></div>}
        </div>
    );
}

/** Lays products out in the chosen style inside a W×H box. */
function Products({ products, style, portrait, W, H, gap, t }) {
    const n = products.length;
    const many = (list, w, h, cols, Comp) => {
        const rows = Math.ceil(list.length / cols);
        const cw = (w - gap * (cols - 1)) / cols;
        const ch = (h - gap * (rows - 1)) / rows;
        const caps = Comp === Row ? rowCaps(list, cw, ch) : null;
        return list.map((p, i) => <Comp key={i} p={p} w={cw} h={ch} t={t} caps={caps} />);
    };
    const box = (w, h, kids, extra = {}) => (
        <div style={{ width: w, height: h, display: 'flex', flexWrap: 'wrap', gap, justifyContent: 'center', alignContent: 'flex-start', flexShrink: 0, ...extra }}>{kids}</div>
    );

    if (style === 'list') {
        const cols = !portrait && n > 3 ? 2 : 1;
        // Rows never get taller than a sensible height; spare room goes above and below.
        const rows = Math.ceil(n / cols);
        const rowH = Math.min((H - gap * (rows - 1)) / rows, Math.min(W, H) * (portrait ? 0.2 : 0.26));
        const usedH = rowH * rows + gap * (rows - 1);
        return box(W, H, many(products, W, usedH, cols, Row), { alignContent: 'center' });
    }
    if (style === 'hero' && n >= 2) {
        const rest = products.slice(1);
        if (portrait) {
            const heroH = (H - gap) * (rest.length > 3 ? 0.48 : 0.56);
            const restH = H - heroH - gap;
            return box(W, H, [
                <Card key="hero" p={products[0]} w={W} h={heroH} t={t} />,
                <div key="rest" style={{ width: W, height: restH, display: 'flex', flexWrap: 'wrap', gap, alignContent: 'flex-start' }}>{many(rest, W, restH, 1, Row)}</div>,
            ]);
        }
        const heroW = (W - gap) * 0.56;
        const restW = W - heroW - gap;
        // Side rows stay a sensible height (a single row shouldn't fill the whole side).
        const rowH = Math.min((H - gap * (rest.length - 1)) / rest.length, restW * 0.36);
        const restH = rowH * rest.length + gap * (rest.length - 1);
        return box(W, H, [
            <Card key="hero" p={products[0]} w={heroW} h={H} t={t} />,
            <div key="rest" style={{ width: restW, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ width: restW, height: restH, display: 'flex', flexDirection: 'column', gap }}>{many(rest, restW, restH, 1, Row)}</div>
            </div>,
        ], { flexWrap: 'nowrap' });
    }
    const { cols } = gridFor(n, portrait);
    return box(W, H, many(products, W, H, cols, style === 'tags' ? TagCard : Card));
}

function Card({ p, w, h, t }) {
    const hasImg = !!p.image_url;
    const wide = w / h >= 1.3;                                  // picture beside the text, not above it
    const pad = Math.min(w, h) * 0.06;
    const gap0 = Math.min(w, h) * 0.04;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const imgW = hasImg ? (wide ? innerW * 0.4 : innerW) : 0;
    const imgH = hasImg ? (wide ? innerH : innerH * 0.42) : 0;
    const textW = wide && hasImg ? innerW - imgW - gap0 : innerW;
    const textH = !wide && hasImg ? innerH - imgH - gap0 : innerH;

    // First pass: the size each line would like. Text shares a smaller box when
    // the picture sits above it, so it takes a bigger share of that box.
    const k = !wide && hasImg ? 1.3 : 1;
    const nameText = p.name.toUpperCase();
    const offerText = p.offer.toUpperCase();
    let name = fitText(nameText, textW, textH * 0.19 * k);
    let detail = p.detail ? fitText(p.detail, textW, textH * 0.075 * k, { two: false }).size : 0;
    const priceChars = (p.price || '').length + (p.unit ? 1.6 : 0);
    let price = p.price ? Math.min(textH * 0.36 * k, textW / (Math.max(3, priceChars) * 0.52)) : 0;
    let offer = p.offer ? fitText(offerText, textW, textH * 0.11 * k, { two: false, extraEm: 1.5 }).size : 0;
    let was = p.was ? Math.max(7, price * 0.24) : 0;
    let gap = textH * 0.035;

    // Second pass: if the stack is taller than its box, shrink everything together.
    const parts = [name.size * 1.06 * name.lines.length, detail * 1.15, was * 1.1, price * 1.22, offer * 1.8].filter(x => x > 0);
    const total = parts.reduce((a, b) => a + b, 0) + gap * Math.max(0, parts.length - 1);
    if (total > textH) {
        const f = textH / total;
        name = { ...name, size: name.size * f }; detail *= f; price *= f; offer *= f; was *= f; gap *= f;
    }
    const align = wide && hasImg ? 'flex-start' : 'center';

    return (
        <div style={{ width: w, height: h, boxSizing: 'border-box', background: t.card, borderRadius: Math.min(w, h) * 0.07, padding: pad, display: 'flex', flexDirection: wide ? 'row' : 'column', gap: gap0, overflow: 'hidden', boxShadow: cardShadow(t, Math.min(w, h)) }}>
            {hasImg && (
                <div style={{ width: imgW, height: imgH, flexShrink: 0 }}>
                    <ProductImage src={p.image_url} radius={Math.min(w, h) * 0.045} />
                </div>
            )}
            <div style={{ width: textW, height: textH, display: 'flex', flexDirection: 'column', alignItems: align, justifyContent: 'center', textAlign: align === 'center' ? 'center' : 'left', gap, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ color: t.text, fontSize: name.size, fontWeight: 900, lineHeight: 1.06, whiteSpace: 'nowrap' }}>
                    {name.lines.map((l, i) => <div key={i}>{l}</div>)}
                </div>
                {p.detail && <div style={{ color: t.muted, fontSize: detail, fontWeight: 700, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{p.detail}</div>}
                {p.was && <div style={{ color: t.muted, fontSize: was, fontWeight: 800, textDecoration: 'line-through', lineHeight: 1.1, whiteSpace: 'nowrap' }}>was {p.was}</div>}
                {p.price && <Price price={p.price} unit={p.unit} size={price} t={t} />}
                {p.offer && (
                    <div style={{ background: t.offerBg, color: t.offerText, fontSize: offer, fontWeight: 900, lineHeight: 1, padding: `${offer * 0.4}px ${offer * 0.75}px`, borderRadius: offer, whiteSpace: 'nowrap' }}>{offerText}</div>
                )}
            </div>
        </div>
    );
}

export default function OfferSlide({ item, size }) {
    const ov = item?.ad_overlay || {};
    const boxRef = useRef(null);
    const { w, h } = useBoxSize(boxRef, size);
    const t = themeFor(ov.template, ov.accent);
    const products = cleanProducts(ov.products);
    const title = ov.headline || '';
    const ends = endsLabel(ov.promo_expires_at);
    const [logoBroken, setLogoBroken] = useState(false);
    const logo = ov.logo_url && !logoBroken ? ov.logo_url : '';

    const ready = w > 0 && h > 0;
    const portrait = h > w * 1.05;
    const U = Math.min(w, h) / 100;                              // 1% of the shorter side
    const pad = U * 3.2;
    const gap = U * 2.4;
    const headerH = title || logo ? U * (portrait ? 12 : 11) : 0;
    const hasFooter = !!(ov.cta || ends || ov.age_badge);
    const footerH = hasFooter ? U * 6 : 0;
    const gridW = w - pad * 2;
    const gridH = h - pad * 2 - (headerH ? headerH + gap : 0) - (footerH ? footerH + gap * 0.6 : 0);
    const titleW = gridW - (logo ? U * 26 : 0);

    return (
        <div ref={boxRef} data-offer-slide={item?.id || ''}
            style={{ position: 'relative', width: size?.w || '100%', height: size?.h || '100%', overflow: 'hidden', boxSizing: 'border-box', background: `linear-gradient(155deg, ${t.bg} 0%, ${t.bg2} 100%)`, fontFamily: OFFER_FONT }}>
            {ready && (
                <div style={{ position: 'absolute', left: pad, top: pad, width: gridW, height: h - pad * 2, display: 'flex', flexDirection: 'column' }}>
                    {headerH > 0 && (
                        <div style={{ height: headerH, marginBottom: gap, display: 'flex', alignItems: 'center', justifyContent: title ? 'space-between' : 'center', gap: U * 2, flexShrink: 0 }}>
                            {title && (
                                <div style={{ color: t.title, fontWeight: 900, lineHeight: 1, fontSize: fitText(title.toUpperCase(), titleW, headerH * 0.8, { two: false }).size, whiteSpace: 'nowrap', overflow: 'hidden', flex: 1, textAlign: logo ? 'left' : 'center', textShadow: t.glow ? `0 0 ${U * 2}px ${t.glow}88` : 'none' }}>{title.toUpperCase()}</div>
                            )}
                            {logo && (
                                <img src={logo} alt="" onError={() => setLogoBroken(true)}
                                    style={{ height: headerH * 0.9, maxWidth: U * 24, objectFit: 'contain', flexShrink: 0, background: '#ffffff', borderRadius: U * 1.4, padding: U * 0.6, boxSizing: 'border-box' }} />
                            )}
                        </div>
                    )}

                    {products.length === 0 ? (
                        <div style={{ width: gridW, height: gridH, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.title, opacity: 0.7, fontWeight: 800, fontSize: U * 4, flexShrink: 0 }}>Add your first product</div>
                    ) : (
                        <Products products={products} style={ov.style} portrait={portrait} W={gridW} H={gridH} gap={gap} t={t} />
                    )}

                    {footerH > 0 && (
                        <div style={{ height: footerH, marginTop: gap * 0.6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: U * 2, color: t.footer, fontWeight: 800, fontSize: footerH * 0.48, flexShrink: 0, lineHeight: 1 }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', flex: 1, minWidth: 0 }}>{ov.cta || ''}</span>
                            {ends && <span style={{ whiteSpace: 'nowrap' }}>{ends.toUpperCase()}</span>}
                            {ov.age_badge && (
                                <span style={{ width: footerH, height: footerH, borderRadius: '50%', border: `${Math.max(1, footerH * 0.08)}px solid ${t.footer}`, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: footerH * 0.36, fontWeight: 900, flexShrink: 0 }}>18+</span>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
