/**
 * POS permission catalogue.
 *
 * These keys are FIXED in code — an admin chooses which roles hold which
 * permissions, but cannot invent new ones. That matters because every key is
 * checked by name in a backend function; a user-defined key would silently
 * never be enforced anywhere.
 *
 * Enforcement is server-side, from the staff session token. The UI hides
 * actions a role lacks, but hiding is a convenience, never the control.
 *
 * When a staff member attempts something their role lacks, the POS asks for an
 * authorising staff number + PIN. If that person holds the permission the action
 * proceeds and BOTH identities are recorded — who acted and who authorised.
 */

export const PERMISSIONS = {
    // ── Selling ──────────────────────────────────────────────────────────────
    ORDER_CREATE:        'order.create',
    ORDER_EDIT:          'order.edit',
    ORDER_VOID:          'order.void',
    PAYMENT_TAKE:        'payment.take',
    PAYMENT_REFUND:      'payment.refund',

    // ── Money off ────────────────────────────────────────────────────────────
    DISCOUNT_APPLY:      'discount.apply',
    DISCOUNT_OVER_LIMIT: 'discount.over_limit',
    COUPON_APPLY:        'coupon.apply',

    // ── Cash handling ────────────────────────────────────────────────────────
    DRAWER_NO_SALE:      'drawer.no_sale',

    // ── Tables ───────────────────────────────────────────────────────────────
    TABLE_MOVE:          'table.move',
    TABLE_MERGE:         'table.merge',

    // ── Back office ──────────────────────────────────────────────────────────
    REPORTS_VIEW:        'reports.view',
    EOD_RUN:             'eod.run',
    STAFF_MANAGE:        'staff.manage',
    SETTINGS_MANAGE:     'settings.manage',
};

/**
 * Grouped for the settings screen, with plain-language labels. The description
 * is what an owner reads when deciding whether a role should hold it, so it
 * describes the consequence rather than the mechanism.
 */
export const PERMISSION_GROUPS = [
    {
        group: 'Selling',
        items: [
            { key: PERMISSIONS.ORDER_CREATE, label: 'Take orders', desc: 'Ring items into a sale' },
            { key: PERMISSIONS.PAYMENT_TAKE, label: 'Take payment', desc: 'Complete a sale and open the drawer' },
            { key: PERMISSIONS.ORDER_EDIT, label: 'Edit an order', desc: 'Change items after the order is placed' },
            { key: PERMISSIONS.ORDER_VOID, label: 'Void an order', desc: 'Cancel an order entirely' },
            { key: PERMISSIONS.PAYMENT_REFUND, label: 'Refund', desc: 'Return money to a customer' },
        ],
    },
    {
        group: 'Discounts',
        items: [
            { key: PERMISSIONS.DISCOUNT_APPLY, label: 'Apply a discount', desc: 'Up to the manager limit' },
            { key: PERMISSIONS.DISCOUNT_OVER_LIMIT, label: 'Discount above the limit', desc: 'Exceed the 20% / £20 manager cap' },
            { key: PERMISSIONS.COUPON_APPLY, label: 'Apply a coupon', desc: 'Redeem a promotional code' },
        ],
    },
    {
        group: 'Cash',
        items: [
            { key: PERMISSIONS.DRAWER_NO_SALE, label: 'No Sale (open drawer)', desc: 'Open the cash drawer without a sale' },
        ],
    },
    {
        group: 'Tables',
        items: [
            { key: PERMISSIONS.TABLE_MOVE, label: 'Move a table order', desc: 'Transfer an order to another table' },
            { key: PERMISSIONS.TABLE_MERGE, label: 'Merge / split tables', desc: 'Combine or separate tables' },
        ],
    },
    {
        group: 'Back office',
        items: [
            { key: PERMISSIONS.REPORTS_VIEW, label: 'View reports', desc: 'Sales figures and analytics' },
            { key: PERMISSIONS.EOD_RUN, label: 'Run End of Day', desc: 'Close the day and print the Z-report' },
            { key: PERMISSIONS.STAFF_MANAGE, label: 'Manage staff', desc: 'Add, edit and remove staff members' },
            { key: PERMISSIONS.SETTINGS_MANAGE, label: 'Change POS settings', desc: 'Printers, theme, quick sale, permissions' },
        ],
    },
];

/**
 * Sensible starting point for a restaurant that has never configured this.
 * Deliberately conservative: anything that moves money away from the business
 * (voids, refunds, over-limit discounts) starts with managers only.
 */
export const DEFAULT_ROLE_PERMISSIONS = {
    waiter: [
        PERMISSIONS.ORDER_CREATE,
        PERMISSIONS.TABLE_MOVE,
    ],
    cashier: [
        PERMISSIONS.ORDER_CREATE,
        PERMISSIONS.PAYMENT_TAKE,
        PERMISSIONS.ORDER_EDIT,
        PERMISSIONS.DISCOUNT_APPLY,
        PERMISSIONS.COUPON_APPLY,
        PERMISSIONS.DRAWER_NO_SALE,
        PERMISSIONS.TABLE_MOVE,
    ],
    kitchen_staff: [],
    manager: Object.values(PERMISSIONS),
};

export const ROLE_LABELS = {
    waiter: 'Waiter',
    cashier: 'Cashier',
    kitchen_staff: 'Kitchen Staff',
    manager: 'Manager',
};

/** Roles an admin can configure, in display order. */
export const CONFIGURABLE_ROLES = ['waiter', 'cashier', 'kitchen_staff', 'manager'];

/**
 * Does this role hold this permission?
 * @param {object} rolePermissions restaurant.role_permissions, may be undefined
 * @param {string} role            staff member's role
 * @param {string} permission      a PERMISSIONS value
 */
export function roleHasPermission(rolePermissions, role, permission) {
    if (!role || !permission) return false;
    const map = (rolePermissions && Object.keys(rolePermissions).length > 0)
        ? rolePermissions
        : DEFAULT_ROLE_PERMISSIONS;
    const granted = map[role];
    return Array.isArray(granted) && granted.includes(permission);
}
