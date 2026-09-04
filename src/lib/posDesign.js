/**
 * POS design scale.
 *
 * The POS had grown six different corner radii (rounded-md through rounded-3xl)
 * and twelve text sizes, including arbitrary values like text-[9px] and
 * text-[13px]. Individually each choice looked fine; together they read as
 * inconsistent, which is most of what separates a professional-looking terminal
 * from one that looks assembled piecemeal.
 *
 * This is the single scale to build against. It is deliberately small - a
 * restricted palette of sizes is what makes an interface look designed.
 *
 * TYPOGRAPHY — four roles, nothing between them:
 *   money      the figure being scanned (totals, prices)
 *   primary    item names, button labels, anything read normally
 *   secondary  supporting detail (customizations, timestamps)
 *   micro      badges and counters only - never body copy
 *
 * Nothing below 11px. Anything smaller is unreadable at arm's length on a
 * counter-mounted screen, which is the actual viewing distance.
 *
 * RADIUS — three steps:
 *   control    buttons, inputs, chips
 *   panel      cards and surfaces
 *   modal      dialogs and overlays
 *
 * TOUCH — 44px minimum for anything tappable (WCAG 2.5.5 / Apple HIG).
 * Destructive or high-frequency controls get 48px.
 */

export const POS_TEXT = {
    moneyLarge:  'text-4xl font-bold tabular-nums leading-none',
    money:       'text-xl font-bold tabular-nums leading-none',
    moneySmall:  'text-base font-bold tabular-nums leading-none',
    primary:     'text-sm font-medium leading-snug',
    primaryBold: 'text-sm font-semibold leading-snug',
    secondary:   'text-xs leading-snug',
    micro:       'text-[11px] font-bold leading-none',
};

export const POS_RADIUS = {
    control: 'rounded-xl',
    panel:   'rounded-2xl',
    modal:   'rounded-2xl',
    pill:    'rounded-full',
};

export const POS_TOUCH = {
    /** Standard tappable control. */
    control:     'h-11',            // 44px
    /** High-frequency or destructive - deserves extra margin for error. */
    controlLarge:'h-12',            // 48px
    /** Primary action at the end of a flow. */
    primary:     'h-16 text-lg font-bold',
};

/** Consistent focus ring for keyboard and accessibility. */
export const POS_FOCUS =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

/**
 * Transition used across interactive surfaces. Short enough to feel instant on
 * a till - anything above ~150ms reads as lag when tapping quickly.
 */
export const POS_TRANSITION = 'transition-all duration-150';
