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
