import React, { useState, useCallback } from 'react';
import ManagerOverrideDialog from '@/components/pos/ManagerOverrideDialog';
import { roleHasPermission } from '@/lib/posPermissions';

/**
 * Permission gate for POS actions.
 *
 * Usage:
 *   const { guard, overrideDialog } = usePermissionGate({ restaurant, activeStaffMember });
 *   ...
 *   <Button onClick={() => guard(PERMISSIONS.ORDER_VOID, () => setVoidingOrder(order), {
 *       label: 'void an order', orderId: order.id, amount: order.total,
 *   })}>Void</Button>
 *   ...
 *   {overrideDialog}
 *
 * If the current staff member holds the permission, the action runs immediately.
 * If not, the manager override prompt appears; on a valid authorisation the
 * action runs and the override is recorded server-side against both people.
 *
 * WHY THE ACTION STILL RUNS
 *   Hard-blocking a waiter mid-service doesn't stop the discount happening — it
 *   makes staff borrow a manager's PIN, which destroys attribution entirely and
 *   leaves you worse off than no permissions at all. Giving the action a
 *   supervised path keeps the audit trail honest.
 *
 * WHY THIS IS NOT THE CONTROL
 *   This is UI convenience. The real enforcement is server-side: the backend
 *   reads the acting staff member from the signed session token and checks the
 *   permission itself. Anything relying on this hook alone would be bypassable
 *   by calling the function directly.
 */
export default function usePermissionGate({ restaurant, activeStaffMember, terminal }) {
    const [pending, setPending] = useState(null);   // { permission, label, run, orderId, amount }

    const guard = useCallback((permission, run, opts = {}) => {
        // No staff member signed in (e.g. "Continue as manager") - the till itself
        // is authenticated, so allow and let the server decide.
        if (!activeStaffMember) { run(); return; }

        const allowed = roleHasPermission(
            restaurant?.role_permissions,
            activeStaffMember.role,
            permission,
        );

        if (allowed) { run(); return; }

        setPending({
            permission,
            label: opts.label || 'do that',
            run,
            orderId: opts.orderId,
            amount: opts.amount,
            context: opts.context,
        });
    }, [restaurant?.role_permissions, activeStaffMember]);

    const overrideDialog = pending ? (
        <ManagerOverrideDialog
            open
            permission={pending.permission}
            permissionLabel={pending.label}
            restaurantId={restaurant?.id}
            actingStaff={activeStaffMember}
            orderId={pending.orderId}
            amount={pending.amount}
            context={pending.context || `${activeStaffMember?.full_name} requested: ${pending.label}`}
            terminal={terminal}
            onClose={() => setPending(null)}
            onAuthorized={(overrideToken, approver) => {
                const action = pending.run;
                setPending(null);
                // Hand the override token to the action so the backend can verify
                // the approval rather than taking the client's word for it.
                action(overrideToken, approver);
            }}
        />
    ) : null;

    return { guard, overrideDialog };
}
