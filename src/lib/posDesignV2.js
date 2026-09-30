/**
 * src/lib/posDesignV2.js - the new POS design (Square / Toast standard).
 *
 * Rolled out BEHIND A PER-TILL SWITCH: it is stored on the device, so each
 * till opts in on its own and can go back to the classic design at once. Off
 * by default - nothing changes for a restaurant until someone turns it on.
 *
 * Stage 1 (this file's first use): the design tokens and the app shell - top
 * bar and navigation. Every function of the classic header keeps a home; see
 * POSHeaderV2.jsx. Pure, so the rules are unit tested.
 */

export const NEW_DESIGN_KEY = 'mealdrop.pos.newDesign';
export const NEW_DESIGN_EVENT = 'mealdrop:pos-design-changed';

/** Is the new design on for this till? Any storage error means "classic". */
export function readNewDesign(storage = globalThis.localStorage) {
    try { return storage?.getItem(NEW_DESIGN_KEY) === '1'; } catch { return false; }
}

/** Turn it on or off for this till; tells any open POS screen to switch. */
export function writeNewDesign(on, storage = globalThis.localStorage, target = globalThis.window) {
    try {
        if (on) storage?.setItem(NEW_DESIGN_KEY, '1');
        else storage?.removeItem(NEW_DESIGN_KEY);
    } catch { /* private mode / full storage: stays as it was */ }
    try { target?.dispatchEvent?.(new CustomEvent(NEW_DESIGN_EVENT, { detail: { on: !!on } })); } catch { /* no DOM */ }
    return readNewDesign(storage);
}

/**
 * The top bar's navigation. The four sections used all service long are
 * one tap away; the rest sit under More. Ids are POSDashboard's tab ids, so
 * no screen changes - only how you reach it.
 */
export const PRIMARY_NAV = [
    { id: 'order-entry', label: 'Sales' },
    { id: 'queue', label: 'Orders' },
    { id: 'tables', label: 'Tables' },
    { id: 'kitchen', label: 'Kitchen' },
];
export const MORE_NAV = [
    { id: 'waitlist', label: 'Waitlist' },
    { id: 'payment', label: 'Payment' },
    { id: 'history', label: 'History' },
    { id: 'reports', label: 'Reports' },
    { id: 'eod', label: 'End of Day' },
    { id: 'staff', label: 'Staff' },
    { id: 'settings', label: 'Settings' },
];

/**
 * What the bar shows for the current tab: which primary button is active, and
 * when the current screen lives under More, More takes that screen's name so
 * staff can see where they are ("Reports", not "More").
 */
export function navState(activeTab) {
    const primary = PRIMARY_NAV.find(n => n.id === activeTab);
    const inMore = MORE_NAV.find(n => n.id === activeTab);
    return {
        activePrimary: primary ? primary.id : null,
        moreActive: !!inMore,
        moreLabel: inMore ? inMore.label : 'More',
    };
}

/** Initials for the staff chip: "Sam Patel" -> "SP", "cher" -> "C". */
export function staffInitials(fullName) {
    return String(fullName || '').trim().split(/\s+/).filter(Boolean)
        .map(w => w[0].toUpperCase()).slice(0, 2).join('');
}

/**
 * The status line under the restaurant name. Offline must never read as
 * fine: it names how many sales are waiting to sync.
 */
export function tillStatus({ isOnline, isSyncing, pendingCount = 0 }) {
    if (isSyncing) return { tone: 'sync', text: 'Syncing\u2026' };
    if (!isOnline) return { tone: 'offline', text: pendingCount > 0 ? `Offline \u00b7 ${pendingCount} to sync` : 'Offline' };
    return { tone: 'online', text: 'Online' };
}
