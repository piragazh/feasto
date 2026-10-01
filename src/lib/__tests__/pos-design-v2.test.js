import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
    readNewDesign, writeNewDesign, NEW_DESIGN_KEY, PRIMARY_NAV, MORE_NAV,
    navState, staffInitials, tillStatus,
} from '../posDesignV2.js';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function memoryStorage(init = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

describe('the per-till switch', () => {
    it('is OFF unless this till turned it on', () => {
        expect(readNewDesign(memoryStorage())).toBe(false);
        expect(readNewDesign(memoryStorage({ [NEW_DESIGN_KEY]: '1' }))).toBe(true);
        expect(readNewDesign(memoryStorage({ [NEW_DESIGN_KEY]: 'true' }))).toBe(false);
    });
    it('turns on and back off, and tells open screens', () => {
        const st = memoryStorage(); const events = [];
        const target = { dispatchEvent: e => events.push(e.detail.on) };
        expect(writeNewDesign(true, st, target)).toBe(true);
        expect(writeNewDesign(false, st, target)).toBe(false);
        expect(events).toEqual([true, false]);
    });
    it('a broken or missing storage means classic, never a crash', () => {
        const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
        expect(readNewDesign(broken)).toBe(false);
        expect(writeNewDesign(true, broken, null)).toBe(false);
        expect(readNewDesign(undefined)).toBe(false);
    });
});

describe('navigation: no screen is lost', () => {
    const dash = read('pages/POSDashboard.jsx');
    const tabsBlock = dash.slice(dash.indexOf('const TABS = ['), dash.indexOf('];', dash.indexOf('const TABS = [')));
    const tabIds = [...tabsBlock.matchAll(/id: '([a-z-]+)'/g)].map(m => m[1]);
    const navIds = [...PRIMARY_NAV, ...MORE_NAV].map(n => n.id);

    it('REGRESSION GUARD: every POS screen is reachable in the new bar, exactly once', () => {
        expect(tabIds.length).toBe(11);
        expect([...navIds].sort()).toEqual([...tabIds].sort());
        expect(new Set(navIds).size).toBe(navIds.length);
    });
    it('the four service screens are one tap away', () => {
        expect(PRIMARY_NAV.map(n => n.id)).toEqual(['order-entry', 'queue', 'tables', 'kitchen']);
    });
    it('More takes the name of the screen you are on', () => {
        expect(navState('reports')).toEqual({ activePrimary: null, moreActive: true, moreLabel: 'Reports' });
        expect(navState('queue')).toEqual({ activePrimary: 'queue', moreActive: false, moreLabel: 'More' });
    });
});

describe('the new header keeps every classic function', () => {
    const dash = strip(read('pages/POSDashboard.jsx'));
    const use = dash.slice(dash.indexOf('<POSHeaderV2'), dash.indexOf('/>', dash.indexOf('clock={<POSClock />}')));
    const header = strip(read('components/pos/POSHeaderV2.jsx'));
    const FUNCTIONS = {
        orderType: /onOrderType=\{setOrderType\}/, tabs: /onTab=\{setActiveTab\}/, offline: /isOnline=\{isOnline\}/,
        syncing: /isSyncing=\{isSyncing\}/, toSync: /pendingCount=\{pendingCount\}/, menuAge: /menuAge=/,
        queueBadge: /pendingOnlineCount=\{pendingOnlineCount\}/, cart: /cartTotal=\{cartTotal\}/, theme: /onToggleTheme=\{toggleTheme\}/,
        switchTill: /onSwitchTill=\{\(\) => setPosNumber\(null\)\}/, customerDisplay: /CustomerDisplay/, kiosk: /KioskDashboard/,
        staff: /onSwitchStaff=\{\(\) => setShowStaffLogin\(true\)\}/, signOut: /base44\.auth\.logout\(\)/,
        printer: /<QZTrayStatusBadge/, clock: /<POSClock/, classic: /onClassicDesign=\{\(\) => writeNewDesign\(false\)\}/,
    };
    it('REGRESSION GUARD: the dashboard passes all 17 of them', () => {
        const missing = Object.entries(FUNCTIONS).filter(([, re]) => !re.test(use)).map(([k]) => k);
        expect(missing).toEqual([]);
    });
    it('and the header uses each prop it is given', () => {
        for (const p of ['onOrderType', 'onTab', 'onToggleTheme', 'onSwitchTill', 'onCustomerDisplay', 'onKiosk', 'onSwitchStaff', 'onSignOut', 'onClassicDesign', 'printerStatus', 'clock', 'menuAge', 'pendingOnlineCount', 'cartTotal']) {
            expect(header.split(p).length - 1, p).toBeGreaterThanOrEqual(2);   // destructured + used
        }
    });
    it('switch off = the classic header and tab bar, untouched', () => {
        const classic = dash.slice(dash.indexOf(') : (<>'), dash.indexOf('</>)}'));
        expect(classic).toMatch(/\{TABS\.map\(tab => \{/);
        expect(classic).toMatch(/<QZTrayStatusBadge/);
        expect(classic).toMatch(/aria-label="Sign out"/);
    });
});

describe('the new design reads clearly', () => {
    const css = read('index.css');
    const tokens = (theme) => Object.fromEntries([...css.slice(css.indexOf(`[data-pos-v2="${theme}"]`)).split('}')[0]
        .matchAll(/--pos-([a-z]+): (\d+) (\d+) (\d+);/g)].map(m => [m[1], [+m[2], +m[3], +m[4]]]));
    const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    for (const theme of ['light', 'dark']) {
        it(`${theme}: body and secondary text pass 4.5:1 on every surface`, () => {
            const t = tokens(theme);
            for (const bg of ['ground', 'surface', 'raised']) {
                expect(ratio(t.text, t[bg]), `text on ${bg}`).toBeGreaterThanOrEqual(4.5);
                expect(ratio(t.muted, t[bg]), `muted on ${bg}`).toBeGreaterThanOrEqual(4.5);
            }
        });
    }
    it('small helpers', () => {
        expect(staffInitials('Sam Patel')).toBe('SP');
        expect(staffInitials('  cher ')).toBe('C');
        expect(tillStatus({ isOnline: false, pendingCount: 3 }).text).toBe('Offline \u00b7 3 to sync');
        expect(tillStatus({ isOnline: true, isSyncing: true }).tone).toBe('sync');
    });
});

import { POS_PALETTES } from '../posThemes.js';

describe('stage 2: the sales screen', () => {
    const oe = read('components/pos/POSOrderEntry.jsx');
    const keysOf = (src, start) => {
        const a = src.indexOf(start); const b = src.indexOf('};', a);
        return [...src.slice(a, b).matchAll(/^\s+([a-zA-Z]+):\s/gm)].map(m => m[1]).sort();
    };
    it('REGRESSION GUARD: the new theme styles every part the classic one does', () => {
        const classic = keysOf(oe, 'const tClassic = {');
        const v2 = keysOf(oe, 'export const T_V2 = {');
        expect(classic.length).toBeGreaterThan(15);
        expect(v2).toEqual(classic);
    });
    it('switch on = the new theme; off = classic, untouched', () => {
        expect(strip(oe)).toMatch(/const t = newDesign \? T_V2 : tClassic;/);
        expect(strip(read('pages/POSDashboard.jsx'))).toMatch(/<POSOrderEntry[\s\S]{0,1500}newDesign=\{newDesign\}/);
    });

    const rgb = (s) => s.split(' ').map(Number);
    const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const WHITE = [255, 255, 255], LIGHT_GROUND = [243, 242, 239], DARK_SURFACE = [26, 29, 34], DARK_TILE = [34, 38, 45];

    for (const [key, pal] of Object.entries(POS_PALETTES)) {
        it(`${key}: buttons, prices and accent text pass 4.5:1 after the remap`, () => {
            const r = pal.ramp;
            expect(ratio(WHITE, rgb(r[700])), 'white on filled button').toBeGreaterThanOrEqual(4.5);
            expect(ratio(rgb(r[800]), WHITE), 'price on white tile').toBeGreaterThanOrEqual(4.5);
            expect(ratio(rgb(r[800]), LIGHT_GROUND), 'accent text on light ground').toBeGreaterThanOrEqual(4.5);
            expect(ratio(rgb(r[400]), DARK_SURFACE), 'accent text on dark').toBeGreaterThanOrEqual(4.5);
            expect(ratio(rgb(r[400]), DARK_TILE), 'accent text on dark tile').toBeGreaterThanOrEqual(4.5);
        });
    }
    it('the remap is scoped to the new design, and covers fills, hovers and text', () => {
        const css = read('index.css');
        expect(css).toMatch(/\[data-pos-v2\] \.bg-accent-500 \{ background-color: rgb\(var\(--pos-accent-700/);
        expect(css).toMatch(/\[data-pos-v2\] \.hover\\:bg-accent-600:hover \{/);
        expect(css).toMatch(/\[data-pos-v2="light"\] \.text-accent-400 \{ color: rgb\(var\(--pos-accent-800/);
        expect(css).toMatch(/\[data-pos-v2="dark"\] \.text-accent-500 \{ color: rgb\(var\(--pos-accent-400/);
        expect(css).not.toMatch(/^\.bg-accent-500 \{/m);            // never unscoped
    });
});

describe('stage 2b: every screen and dialog in the new palette', () => {
    const css = read('index.css');
    const posFiles = [];
    (function walk(d) {
        for (const e of fs.readdirSync(new URL(`../../${d}`, import.meta.url), { withFileTypes: true })) {
            const p = `${d}/${e.name}`;
            if (e.isDirectory()) walk(p); else if (/\.jsx?$/.test(e.name)) posFiles.push(p);
        }
    })('components/pos');
    posFiles.push('pages/POSDashboard.jsx');

    it('REGRESSION GUARD: every hard-coded dark surface in the POS maps to a token', () => {
        const hexes = new Set();
        for (const f of posFiles) for (const m of read(f).matchAll(/bg-\[#([0-9a-fA-F]{6})\]/g)) hexes.add(m[1].toLowerCase());
        const unmapped = [...hexes].filter(h => !css.includes(`[data-pos-v2="dark"] .bg-\\[\\#${h}\\]`));
        expect(hexes.size).toBeGreaterThan(0);
        expect(unmapped).toEqual([]);
    });
    it('greys that fail contrast read as the secondary-text token', () => {
        expect(css).toMatch(/\[data-pos-v2="light"\] \.text-gray-400, \[data-pos-v2="light"\] \.text-gray-500 \{ color: rgb\(var\(--pos-muted\)\); \}/);
        expect(css).toMatch(/\[data-pos-v2="dark"\] \.text-gray-500, \[data-pos-v2="dark"\] \.text-gray-600 \{ color: rgb\(var\(--pos-muted\)\); \}/);
    });
    it('REGRESSION GUARD: dialogs get the design - the page is marked, and unmarked on close', () => {
        const d = strip(read('pages/POSDashboard.jsx'));
        const eff = d.slice(d.indexOf("const html = document.documentElement;"), d.indexOf('}, [newDesign, isDark]);'));
        expect(eff).toMatch(/if \(newDesign\) html\.setAttribute\('data-pos-v2', isDark \? 'dark' : 'light'\);/);
        expect(eff).toMatch(/else html\.removeAttribute\('data-pos-v2'\);/);
        expect(eff).toMatch(/return \(\) => html\.removeAttribute\('data-pos-v2'\);/);
    });
});

describe('stage 3: the option sheet', () => {
    const sheet = read('components/pos/POSItemCustomization.jsx');
    const css = read('index.css');
    it('REGRESSION GUARD: every choice row is tagged, so none is left small and grey', () => {
        const rows = (sheet.match(/className=\{`[^`]*flex items-center space-x-2 p-2/g) || []);
        expect(rows.length).toBe(5);
        expect(rows.every(r => r.includes('pos-choice'))).toBe(true);
        expect(sheet).toMatch(/className=\{`pos-sheet /);
        expect((sheet.match(/pos-sheet-cta/g) || []).length).toBe(2);       // Cancel and Add
    });
    it('a chosen option is visibly chosen: the controls really report data-state', () => {
        expect(read('components/ui/checkbox.jsx')).toMatch(/@radix-ui\/react-checkbox/);
        expect(read('components/ui/radio-group.jsx')).toMatch(/@radix-ui\/react-radio-group/);
        expect(css).toMatch(/\[data-pos-v2\] \.pos-choice:has\(\[data-state="checked"\]\) \{/);
    });
    it('choices are at least 56px, the buttons too', () => {
        expect(css).toMatch(/\[data-pos-v2\] \.pos-choice \{\s*min-height: 56px;/);
        expect(css).toMatch(/\[data-pos-v2\] \.pos-sheet-cta \{ height: 56px;/);
    });
    it('classic sheet unchanged: no style for the tags outside the new design', () => {
        const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(r => r.trim()).filter(r => /\.pos-(choice|sheet)/.test(r));
        expect(rules.length).toBeGreaterThan(3);
        expect(rules.every(r => r.split('{')[0].split(',').every(sel => sel.includes('[data-pos-v2'))) ).toBe(true);
    });
});

describe('stage 4: taking payment', () => {
    const keypad = read('components/pos/NumericKeypad.jsx');
    const pay = read('components/pos/POSPayment.jsx');
    const css = read('index.css');
    it('REGRESSION GUARD: every fixed-height keypad key is a 64px key', () => {
        const buttons = [...keypad.matchAll(/<Button[\s\S]*?className=(\{`[^`]*`\}|"[^"]*")/g)].map(m => m[1]);
        const fixed = buttons.filter(c => /\bh-12\b/.test(c));
        expect(fixed.length).toBeGreaterThanOrEqual(7);
        expect(fixed.filter(c => !c.includes('pos-key'))).toEqual([]);
        expect(keypad).toMatch(/className="pos-keypad grid/);
        expect(keypad).toMatch(/pos-key-display/);
    });
    it('quick cash (both rows) and the tender selector are tagged', () => {
        expect((pay.match(/pos-quick-cash/g) || []).length).toBe(2);
        expect(pay).toMatch(/className=\{`pos-tender /);
    });
    it('sizes: 64px keys 8px apart, 56px quick cash and tender', () => {
        expect(css).toMatch(/\[data-pos-v2\] \.pos-key \{ height: 64px;/);
        expect(css).toMatch(/\[data-pos-v2\] \.pos-keypad \{ gap: 8px; \}/);
        expect(css).toMatch(/\[data-pos-v2\] \.pos-quick-cash \{ height: 56px;/);
        expect(css).toMatch(/\[data-pos-v2\] \.pos-tender \{ height: 56px;/);
    });
    it('classic payment screen unchanged: every rule for these tags is inside the new design', () => {
        const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(r => r.trim()).filter(r => /\.pos-(key|quick-cash|tender)/.test(r));
        expect(rules.length).toBeGreaterThanOrEqual(6);
        expect(rules.every(r => r.split('{')[0].split(',').every(sel => sel.includes('[data-pos-v2')))).toBe(true);
    });
});

describe('stage 5: service screens', () => {
    const queue = read('components/pos/POSOrderQueue.jsx');
    const kds = read('components/kds/KitchenDisplaySystem.jsx');
    const card = read('components/kds/KDSOrderCard.jsx');
    const css = read('index.css');
    it('REGRESSION GUARD: every 32px queue button is a 48px action', () => {
        const small = [...queue.matchAll(/<Button[\s\S]*?className="([^"]*\bh-8\b[^"]*)"/g)].map(m => m[1]);
        expect(small.length).toBe(4);
        expect(small.filter(c => !c.includes('pos-action'))).toEqual([]);
    });
    it('kitchen: bump is an action; header icons and the chevron are 48px targets with names', () => {
        expect(card).toMatch(/className=\{`pos-action w-full font-bold text-base h-11/);
        const icons = [...kds.matchAll(/<Button variant="ghost" size="icon"[\s\S]*?>/g)].map(m => m[0]);
        expect(icons.length).toBe(4);
        for (const b of icons) { expect(b).toMatch(/pos-icon-btn/); expect(b).toMatch(/aria-label=/); }
        expect(card).toMatch(/aria-expanded=\{expanded\}[\s\S]{0,80}className="pos-icon-btn/);
    });
    const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]
        .map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
    const onWhite = (hex) => 1.05 / (lum(hex) + 0.05);
    it('white text on the status colours passes 4.5:1, and hover only ever goes darker', () => {
        const fill = (cls) => (css.match(new RegExp(`\\[data-pos-v2\\] \\.${cls} \\{ background-color: (#[0-9a-f]{6}); \\}`)) || [])[1];
        for (const c of ['bg-yellow-600', 'bg-green-600', 'bg-emerald-600']) {
            const hex = fill(c);
            expect(hex, c).toBeTruthy();
            expect(onWhite(hex), c).toBeGreaterThanOrEqual(4.5);
        }
        expect(onWhite('#854d0e')).toBeGreaterThan(onWhite(fill('bg-yellow-600')));
        expect(onWhite('#166534')).toBeGreaterThan(onWhite(fill('bg-green-600')));
    });
    it('only inside the new design (the standalone Kitchen Display page is untouched)', () => {
        const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(r => r.trim())
            .filter(r => /\.pos-(action|icon-btn)|\.bg-(yellow|green|emerald)-600|bg-(yellow|green|emerald)-[57]00:hover/.test(r));
        expect(rules.length).toBeGreaterThanOrEqual(8);
        expect(rules.every(r => r.split('{')[0].split(',').every(sel => sel.includes('[data-pos-v2')))).toBe(true);
    });
});
