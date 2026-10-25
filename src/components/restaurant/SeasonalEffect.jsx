import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Seasonal animation overlay (bats, snow, hearts, stars, sparkles).
 *
 * Built for phones first:
 * - one <canvas> with pre-drawn sprites, no animation library;
 * - pointer-events: none, so every tap reaches the menu underneath;
 * - nothing at all for people who turned on Reduce Motion;
 * - pauses while the tab is hidden; resolution capped at 2x;
 * - no flashing: brightness changes stay slow (well under 3 per second).
 *
 * Storefront: fixed over the page, thinning out as the customer scrolls, with a
 * small close button. Preview (Brand Studio): fills its positioned parent.
 */

const COUNTS = {
    bats: [9, 16],
    snow: [40, 80],
    hearts: [10, 18],
    stars: [24, 42],
    sparkles: [18, 34],
};

const rand = (a, b) => a + Math.random() * (b - a);

function sprite(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    return c;
}

// ── Sprites (drawn once) ────────────────────────────────────────────────────

// A bat with its wings at `lift` (-1 down, 1 up). Dark body with a thin light
// outline so it shows on dark hero photos and on light pages alike.
function drawBat(ctx, s, lift) {
    const cx = s / 2;
    const cy = s / 2;
    const span = s * 0.46;
    const tipY = cy - lift * s * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.04);
    ctx.quadraticCurveTo(cx - span * 0.5, tipY - s * 0.08, cx - span, tipY);
    // scalloped trailing edge
    ctx.quadraticCurveTo(cx - span * 0.8, tipY + s * 0.06, cx - span * 0.66, tipY + s * 0.1);
    ctx.quadraticCurveTo(cx - span * 0.5, tipY + s * 0.06, cx - span * 0.36, tipY + s * 0.13);
    ctx.quadraticCurveTo(cx - span * 0.2, cy + s * 0.06, cx, cy + s * 0.12);
    ctx.quadraticCurveTo(cx + span * 0.2, cy + s * 0.06, cx + span * 0.36, tipY + s * 0.13);
    ctx.quadraticCurveTo(cx + span * 0.5, tipY + s * 0.06, cx + span * 0.66, tipY + s * 0.1);
    ctx.quadraticCurveTo(cx + span * 0.8, tipY + s * 0.06, cx + span, tipY);
    ctx.quadraticCurveTo(cx + span * 0.5, tipY - s * 0.08, cx, cy - s * 0.04);
    ctx.closePath();
    // head with ears
    ctx.moveTo(cx - s * 0.05, cy - s * 0.02);
    ctx.lineTo(cx - s * 0.055, cy - s * 0.12);
    ctx.lineTo(cx - s * 0.02, cy - s * 0.07);
    ctx.lineTo(cx + s * 0.02, cy - s * 0.07);
    ctx.lineTo(cx + s * 0.055, cy - s * 0.12);
    ctx.lineTo(cx + s * 0.05, cy - s * 0.02);
    ctx.closePath();
    ctx.fillStyle = '#1c1426';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, s * 0.018);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fill();
}

function makeSprites(type) {
    if (type === 'bats') {
        return Array.from({ length: 8 }, (_, i) => sprite(96, (ctx, s) => drawBat(ctx, s, Math.sin((i / 8) * Math.PI * 2))));
    }
    if (type === 'snow') {
        return [sprite(32, (ctx, s) => {
            const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
            g.addColorStop(0.75, 'rgba(148,163,184,0.55)'); // soft grey rim: visible on white pages
            g.addColorStop(1, 'rgba(148,163,184,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s, s);
        })];
    }
    if (type === 'hearts') {
        return ['#e11d48', '#f43f5e', '#fb7185'].map((colour) => sprite(64, (ctx, s) => {
            ctx.translate(s / 2, s * 0.56);
            ctx.beginPath();
            const k = s * 0.32;
            ctx.moveTo(0, k * 0.55);
            ctx.bezierCurveTo(-k * 1.4, -k * 0.35, -k * 0.5, -k * 1.25, 0, -k * 0.45);
            ctx.bezierCurveTo(k * 0.5, -k * 1.25, k * 1.4, -k * 0.35, 0, k * 0.55);
            ctx.closePath();
            ctx.fillStyle = colour;
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = s * 0.03;
            ctx.stroke();
            ctx.fill();
        }));
    }
    // stars and sparkles: four-point star with a soft glow
    const colours = type === 'sparkles' ? ['#fbbf24', '#fde68a', '#ffffff'] : ['#fcd34d', '#fef3c7'];
    return colours.map((colour) => sprite(64, (ctx, s) => {
        const c = s / 2;
        const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
        glow.addColorStop(0, 'rgba(253,230,138,0.55)');
        glow.addColorStop(1, 'rgba(253,230,138,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, s, s);
        ctx.beginPath();
        const r1 = s * 0.42;
        const r2 = s * 0.09;
        for (let i = 0; i < 8; i++) {
            const r = i % 2 === 0 ? r1 : r2;
            const a = (i * Math.PI) / 4 - Math.PI / 2;
            ctx[i === 0 ? 'moveTo' : 'lineTo'](c + Math.cos(a) * r, c + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = colour;
        ctx.strokeStyle = 'rgba(120,53,15,0.35)'; // faint edge so it shows on white
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fill();
    }));
}

// ── Particles ───────────────────────────────────────────────────────────────

function spawn(type, w, h, initial) {
    switch (type) {
        case 'bats': {
            const size = rand(22, 44);
            const fromLeft = Math.random() < 0.5;
            return {
                x: initial ? rand(0, w) : (fromLeft ? -size : w + size),
                y: rand(h * 0.05, h * 0.55),
                size,
                heading: fromLeft ? rand(-0.4, 0.4) : Math.PI + rand(-0.4, 0.4),
                speed: rand(55, 105) * (size / 34),
                phase: Math.random(),
                flap: rand(2.6, 4.2), // wing beats per second
                wobble: rand(0, Math.PI * 2),
            };
        }
        case 'snow': {
            const r = rand(1.6, 4.4);
            return { x: rand(0, w), y: initial ? rand(-h, h) : rand(-40, -10), r, vy: 18 + r * 11, sway: rand(8, 24), swaySpeed: rand(0.4, 1.1), phase: rand(0, 6.28), alpha: rand(0.55, 0.95) };
        }
        case 'hearts': {
            const size = rand(14, 28);
            return { x: rand(0, w), y: initial ? rand(0, h) : h + size, size, vy: rand(14, 30), sway: rand(10, 26), swaySpeed: rand(0.5, 1.0), phase: rand(0, 6.28), sprite: Math.floor(rand(0, 3)), spin: rand(-0.25, 0.25) };
        }
        case 'stars':
            return { x: rand(0, w), y: rand(0, h * 0.75), size: rand(10, 24), twinkle: rand(0.5, 1.3), phase: rand(0, 6.28), drift: rand(-4, 4), sprite: Math.floor(rand(0, 2)) };
        default: // sparkles
            return { x: rand(0, w), y: initial ? rand(h * 0.2, h) : h + 10, size: rand(8, 20), vy: rand(12, 28), life: rand(3, 6), age: initial ? rand(0, 3) : 0, sprite: Math.floor(rand(0, 3)), phase: rand(0, 6.28) };
    }
}

// `base` is the overall opacity (scroll fade); each particle sets its own on top of it.
function step(type, p, dt, t, w, h, sprites, ctx, base) {
    switch (type) {
        case 'bats': {
            // gentle random wandering, kept mostly in the top half of the screen
            p.heading += (Math.random() - 0.5) * 1.6 * dt + Math.sin(t * 0.9 + p.wobble) * 0.35 * dt;
            if (p.y > h * 0.6) p.heading += (Math.sin(p.heading) > 0 ? -1 : 1) * 1.2 * dt;
            if (p.y < h * 0.02) p.heading += (Math.sin(p.heading) < 0 ? 1 : -1) * 1.2 * dt;
            p.x += Math.cos(p.heading) * p.speed * dt;
            p.y += Math.sin(p.heading) * p.speed * 0.55 * dt + Math.sin(t * 2.2 + p.wobble) * 6 * dt;
            p.phase = (p.phase + p.flap * dt) % 1;
            if (p.x < -80 || p.x > w + 80) Object.assign(p, spawn(type, w, h, false));
            const frame = sprites[Math.floor(p.phase * 8) % 8];
            ctx.drawImage(frame, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            return;
        }
        case 'snow': {
            p.y += p.vy * dt;
            p.x += Math.sin(t * p.swaySpeed + p.phase) * p.sway * dt;
            if (p.y > h + 10) Object.assign(p, spawn(type, w, h, false));
            ctx.globalAlpha = base * p.alpha;
            ctx.drawImage(sprites[0], p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
            ctx.globalAlpha = base;
            return;
        }
        case 'hearts': {
            p.y -= p.vy * dt;
            p.x += Math.sin(t * p.swaySpeed + p.phase) * p.sway * dt;
            if (p.y < -p.size) Object.assign(p, spawn(type, w, h, false));
            const fade = Math.max(0, Math.min(1, p.y / (h * 0.25)));
            ctx.globalAlpha = base * 0.85 * fade;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.sin(t * 0.8 + p.phase) * p.spin);
            ctx.drawImage(sprites[p.sprite], -p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
            ctx.globalAlpha = base;
            return;
        }
        case 'stars': {
            p.x += p.drift * dt;
            if (p.x < -20) p.x = w + 20;
            if (p.x > w + 20) p.x = -20;
            // slow twinkle: well under one cycle per second
            const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * p.twinkle + p.phase));
            ctx.globalAlpha = base * a;
            ctx.drawImage(sprites[p.sprite], p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            ctx.globalAlpha = base;
            return;
        }
        default: { // sparkles drift up and fade in and out over a few seconds
            p.age += dt;
            p.y -= p.vy * dt;
            p.x += Math.sin(t * 0.7 + p.phase) * 6 * dt;
            if (p.age > p.life || p.y < -20) Object.assign(p, spawn(type, w, h, false));
            const k = p.age / p.life;
            const a = Math.sin(Math.PI * Math.min(1, Math.max(0, k)));
            ctx.globalAlpha = base * a;
            ctx.drawImage(sprites[p.sprite], p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            ctx.globalAlpha = base;
        }
    }
}

function prefersReducedMotion() {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

const dismissKey = (id) => `seasonal-off:${id}`;

export default function SeasonalEffect({ type, intensity = 'light', preview = false, restaurantId }) {
    const canvasRef = useRef(null);
    const [reduced] = useState(prefersReducedMotion);
    const [dismissed, setDismissed] = useState(() => {
        if (preview || !restaurantId) return false;
        try { return sessionStorage.getItem(dismissKey(restaurantId)) === '1'; } catch { return false; }
    });
    const [nearTop, setNearTop] = useState(true);

    useEffect(() => {
        if (reduced || dismissed || !COUNTS[type]) return undefined;
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const ctx = canvas.getContext('2d');
        const sprites = makeSprites(type);
        let w = 0;
        let h = 0;
        let particles = [];
        let raf = 0;
        let last = 0;
        let start = 0;

        const resize = () => {
            const box = preview ? canvas.parentElement.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            w = Math.max(1, box.width);
            h = Math.max(1, box.height);
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            // fewer particles on small screens and in the small preview
            const [light, medium] = COUNTS[type];
            const base = intensity === 'medium' ? medium : light;
            const scale = preview ? 0.45 : Math.min(1, Math.max(0.55, w / 1100));
            const target = Math.max(4, Math.round(base * scale));
            while (particles.length < target) particles.push(spawn(type, w, h, true));
            particles.length = target;
        };

        const frame = (now) => {
            raf = requestAnimationFrame(frame);
            if (!start) start = now;
            const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
            last = now;
            const t = (now - start) / 1000;
            ctx.clearRect(0, 0, w, h);
            // thin out as the customer scrolls down the menu
            const scrollFade = preview ? 1 : 1 - Math.min(0.7, (window.scrollY || 0) / 900);
            ctx.globalAlpha = scrollFade;
            for (const p of particles) step(type, p, dt, t, w, h, sprites, ctx, scrollFade);
            ctx.globalAlpha = 1;
        };

        const onVisibility = () => {
            if (document.hidden) {
                cancelAnimationFrame(raf);
                raf = 0;
            } else if (!raf) {
                last = 0;
                raf = requestAnimationFrame(frame);
            }
        };

        resize();
        raf = requestAnimationFrame(frame);
        document.addEventListener('visibilitychange', onVisibility);
        let ro;
        if (preview && typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(resize);
            ro.observe(canvas.parentElement);
        } else {
            window.addEventListener('resize', resize);
        }
        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('resize', resize);
            ro?.disconnect();
        };
    }, [type, intensity, preview, reduced, dismissed]);

    // Close button only while the customer is near the top of the page.
    useEffect(() => {
        if (preview) return undefined;
        const onScroll = () => setNearTop((window.scrollY || 0) < 240);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [preview]);

    if (reduced || dismissed || !COUNTS[type]) return null;

    const dismiss = () => {
        try { sessionStorage.setItem(dismissKey(restaurantId), '1'); } catch { /* storage unavailable */ }
        setDismissed(true);
    };

    return (
        <div
            className={preview ? 'absolute inset-0 pointer-events-none overflow-hidden' : 'fixed inset-0 pointer-events-none z-[35]'}
            aria-hidden={preview ? 'true' : undefined}
        >
            <canvas ref={canvasRef} className="block" />
            {!preview && nearTop && (
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Turn off seasonal animation"
                    className="pointer-events-auto absolute right-3 h-9 w-9 rounded-full bg-black/45 text-white backdrop-blur-sm flex items-center justify-center shadow-md"
                    style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}
