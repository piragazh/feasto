import React, { useEffect, useRef, useState } from 'react';
import { scheduledPrice } from '@/lib/pos-schedule-logic';
import { whyNotSellable, sellsAt } from '@/lib/item-availability';
import { couponValidFromInstant, couponValidUntilInstant } from '@/lib/order-logic';

/**
 * AI ad slide: an AI-generated picture with the words drawn live on top.
 *
 * The AI image never carries text. Headline, item names, prices and promo
 * codes are rendered here, so they are always spelled correctly, sharp at any
 * screen size, never cropped off a square image, and prices always match the
 * till (same engine as the menu board: timed deals, sold-out, till-only items).
 *
 * item.ad_overlay = {
 *   headline, hook, cta, item_ids: [hero, ...], show_prices,
 *   promo_text, promo_code, promo_expires_at, accent, layout: 'auto'|'left'|'right'|'bottom'|'center',
 *   motion: 'none'|'zoom', logo_url
 * }
 */

const gbp = (n) => `£${Number(n || 0).toFixed(2)}`;
const tillBase = (item) => Number(item?.pos_price != null && item.pos_price !== '' ? item.pos_price : item?.price) || 0;

/** Live price for an item at the till right now. */
export function livePrice(item, now = new Date()) {
    const base = tillBase(item);
    const price = scheduledPrice(base, item, now);
    return { base, price, deal: price < base };
}

/**
 * Can this coupon be used right now? Same date rules as checkout (UK days).
 * Accepts the full Coupon record or the slim copy in a screen manifest
 * (where `used_up` replaces usage_limit/usage_count).
 */
export function couponUsableNow(c, now = new Date()) {
    if (!c || c.is_active === false) return false;
    if (c.used_up) return false;
    if (c.usage_limit && (Number(c.usage_count) || 0) >= Number(c.usage_limit)) return false;
    if (c.valid_from && couponValidFromInstant(c.valid_from) > now) return false;
    const end = c.expires_at ? new Date(c.expires_at) : c.valid_until ? couponValidUntilInstant(c.valid_until) : null;
    if (end && end <= now) return false;
    return true;
}

export const adCouponId = (item) => item?.ad_overlay?.coupon_id || '';

/**
 * Should this ad be on screen right now?
 * - hero dish sold out / outside its hours / not sold in store → hide the ad
 * - linked promo code expired, switched off, used up or deleted → hide the ad
 * Menu / coupons not loaded yet (undefined) → don't hide anything.
 */
export function isAdPlayable(item, menuItems, now = new Date(), coupons) {
    const ov = item?.ad_overlay;
    if (!ov) return true;
    if (ov.promo_expires_at && new Date(ov.promo_expires_at).getTime() <= now.getTime()) return false;
    if (ov.coupon_id && Array.isArray(coupons)) {
        const c = coupons.find(x => x.id === ov.coupon_id);
        if (!couponUsableNow(c, now)) return false;
    }
    const ids = Array.isArray(ov.item_ids) ? ov.item_ids : [];
    if (!ids.length || !Array.isArray(menuItems)) return true;
    const hero = menuItems.find(m => m.id === ids[0]);
    if (!hero) return false;                                  // dish deleted from the menu
    return sellsAt(hero, 'till') && !whyNotSellable(hero, 'till', now);
}

export const adNeedsMenu = (item) => Array.isArray(item?.ad_overlay?.item_ids) && item.ad_overlay.item_ids.length > 0;

function useBoxSize(ref) {
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => setSize({ w: el.clientWidth || window.innerWidth, h: el.clientHeight || window.innerHeight });
        measure();
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(measure);
            ro.observe(el);
            return () => ro.disconnect();
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [ref]);
    return size;
}

const KEYFRAMES_ID = 'md-ad-zoom-keyframes';
function ensureKeyframes() {
    if (typeof document === 'undefined' || document.getElementById(KEYFRAMES_ID)) return;
    const style = document.createElement('style');
    style.id = KEYFRAMES_ID;
    style.textContent = '@keyframes mdAdZoom{from{transform:scale(1)}to{transform:scale(1.12)}}';
    document.head.appendChild(style);
}

export default function AdSlide({ item, menuItems, now = new Date(), onError, active = true }) {
    const ov = item.ad_overlay || {};
    const boxRef = useRef(null);
    const { w, h } = useBoxSize(boxRef);
    const portrait = h > w * 1.05;
    const unit = Math.max(8, Math.min(w, h) / 100);             // 1% of the shorter side
    const accent = ov.accent || '#f97316';

    useEffect(() => { if (ov.motion === 'zoom') ensureKeyframes(); }, [ov.motion]);

    const ids = Array.isArray(ov.item_ids) ? ov.item_ids : [];
    const items = Array.isArray(menuItems)
        ? ids.map(id => menuItems.find(m => m.id === id))
            .filter(m => m && sellsAt(m, 'till') && !whyNotSellable(m, 'till', now))
        : [];
    const hero = items[0];
    const others = items.slice(1, 4);
    const showPrices = ov.show_prices !== false;

    let layout = ov.layout || 'auto';
    if (layout === 'auto') layout = portrait ? 'bottom' : 'left';
    if (portrait && (layout === 'left' || layout === 'right')) layout = 'bottom';

    const panelPos = {
        left:   { inset: '0 auto 0 0', width: '48%', padding: `${unit * 6}px`, justifyContent: 'center', background: 'linear-gradient(90deg, rgba(0,0,0,.82) 0%, rgba(0,0,0,.6) 70%, rgba(0,0,0,0) 100%)' },
        right:  { inset: '0 0 0 auto', width: '48%', padding: `${unit * 6}px`, justifyContent: 'center', alignItems: 'flex-end', textAlign: 'right', background: 'linear-gradient(270deg, rgba(0,0,0,.82) 0%, rgba(0,0,0,.6) 70%, rgba(0,0,0,0) 100%)' },
        bottom: { inset: 'auto 0 0 0', padding: `${unit * 6}px ${unit * 5}px`, justifyContent: 'flex-end', background: 'linear-gradient(0deg, rgba(0,0,0,.88) 0%, rgba(0,0,0,.65) 65%, rgba(0,0,0,0) 100%)', paddingTop: `${unit * 18}px` },
        center: { inset: '0', padding: `${unit * 6}px`, justifyContent: 'center', alignItems: 'center', textAlign: 'center', background: 'rgba(0,0,0,.45)' },
    }[layout];

    const headline = ov.headline || hero?.name || '';
    const fs = (n) => `${unit * n}px`;

    return (
        <div ref={boxRef} className="relative w-full h-full overflow-hidden bg-black" data-ad-slide={item.id}>
            {item.media_url ? (
                <img
                    src={item.media_url}
                    alt=""
                    onError={onError}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={ov.motion === 'zoom' && active ? { animation: `mdAdZoom ${Math.max(6, Number(item.duration) || 10)}s ease-out both`, transformOrigin: 'center' } : undefined}
                />
            ) : (
                <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 75% 35%, ${accent}66, #0b0b0f 70%)` }} />
            )}

            {ov.logo_url && (
                <img src={ov.logo_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    className="absolute object-contain drop-shadow-lg"
                    style={{ top: fs(4), [layout === 'left' ? 'right' : 'left']: fs(4), height: fs(12), maxWidth: fs(30) }} />
            )}

            <div className="absolute flex flex-col text-white" style={{ ...panelPos, gap: fs(1.6) }}>
                {ov.hook && (
                    <span className="font-black uppercase tracking-widest" style={{ color: accent, fontSize: fs(3.6) }}>{ov.hook}</span>
                )}
                {headline && (
                    <h2 className="font-black leading-[0.95] tracking-tight" style={{ fontSize: fs(headline.length > 22 ? 7 : 9), textShadow: '0 4px 24px rgba(0,0,0,.5)' }}>{headline}</h2>
                )}

                {hero && showPrices && (() => {
                    const p = livePrice(hero, now);
                    return (
                        <div className="flex items-baseline flex-wrap" style={{ gap: fs(2), justifyContent: layout === 'right' ? 'flex-end' : layout === 'center' ? 'center' : 'flex-start' }}>
                            {ov.headline && ov.headline !== hero.name && <span className="font-bold" style={{ fontSize: fs(4) }}>{hero.name}</span>}
                            {p.deal && <span className="line-through opacity-70 font-bold" style={{ fontSize: fs(4) }}>{gbp(p.base)}</span>}
                            <span className="font-black rounded-2xl" style={{ fontSize: fs(9), color: accent }}>{gbp(p.price)}</span>
                            {p.deal && <span className="font-black uppercase rounded-full bg-green-500 text-white" style={{ fontSize: fs(2.6), padding: `${unit * 0.6}px ${unit * 1.8}px` }}>Deal now</span>}
                        </div>
                    );
                })()}

                {others.length > 0 && (
                    <div className="flex flex-col" style={{ gap: fs(0.8), marginTop: fs(1) }}>
                        {others.map(m => {
                            const p = livePrice(m, now);
                            return (
                                <div key={m.id} className="flex items-baseline font-bold" style={{ gap: fs(2), fontSize: fs(3.6), justifyContent: layout === 'right' ? 'flex-end' : layout === 'center' ? 'center' : 'flex-start' }}>
                                    <span>{m.name}</span>
                                    {showPrices && <span style={{ color: accent }}>{gbp(p.price)}</span>}
                                </div>
                            );
                        })}
                    </div>
                )}

                {(ov.promo_text || ov.promo_code) && (
                    <div className="inline-flex flex-col rounded-2xl"
                        style={{ alignSelf: layout === 'right' ? 'flex-end' : layout === 'center' ? 'center' : 'flex-start', background: accent, padding: `${unit * 1.4}px ${unit * 3}px`, marginTop: fs(1) }}>
                        {ov.promo_text && <span className="font-black uppercase" style={{ fontSize: fs(4.4) }}>{ov.promo_text}</span>}
                        {ov.promo_code && (
                            <span className="font-bold" style={{ fontSize: fs(3) }}>
                                Use code <span className="font-mono font-black tracking-wider bg-black/25 rounded px-2">{ov.promo_code}</span>
                            </span>
                        )}
                    </div>
                )}

                {ov.cta && (
                    <span className="font-extrabold uppercase tracking-wide opacity-90" style={{ fontSize: fs(3), marginTop: fs(1) }}>{ov.cta}</span>
                )}
            </div>
        </div>
    );
}
