import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Shown on an order card when Uber Eats was NOT told about a status change.
 *
 * uberEatsPushStatus records the failure on the order (uber_push_error), but
 * until now no screen showed it. That matters most for "accepted": the kitchen
 * is cooking an order Uber still thinks nobody has answered, and Uber cancels
 * it after about 11 minutes. Staff need to see that on the ticket itself.
 *
 * Two states:
 *   retrying   a retry is still scheduled (uber_push_pending)  - amber
 *   stopped    retries ran out, or Uber rejected the request   - red
 *
 * "Retry now" calls the push with force, which skips the back-off and the
 * gave-up flag. It re-sends the order's CURRENT status, nothing else.
 *
 * Used by the POS queue (dark) and the dashboard's live orders (light); it sits
 * in the POS folder so it is held to the posDesign.js rules.
 */

/** What Uber is missing, in staff words. The error is stored as "<action>: <detail>". */
const MISSING = {
    accept: 'Uber Eats doesn’t know this order was accepted',
    deny: 'Uber Eats doesn’t know this order was rejected',
    ready: 'Uber Eats doesn’t know this order is ready',
    cancel: 'Uber Eats doesn’t know this order was cancelled',
};
const DONE = {
    accept: 'Uber Eats now knows the order is accepted',
    deny: 'Uber Eats now knows the order was rejected',
    ready: 'Uber Eats now knows the order is ready',
    cancel: 'Uber Eats now knows the order was cancelled',
};

export function hasUberPushProblem(order) {
    return order?.third_party_platform === 'uber_eats' && Boolean(order?.uber_push_error);
}

export default function UberPushWarning({ order, onRetried, isDark = false }) {
    const [retrying, setRetrying] = useState(false);
    if (!hasUberPushProblem(order)) return null;

    const action = String(order.uber_push_error).split(':')[0].trim();
    const stillRetrying = Boolean(order.uber_push_pending);
    const headline = MISSING[action] || 'Uber Eats wasn’t updated about this order';
    const detail = stillRetrying
        ? 'Trying again automatically.'
        : action === 'accept'
            ? 'Automatic retries stopped. Retry, or accept it on the Uber tablet before Uber cancels it.'
            : 'Automatic retries stopped. Retry, or update it on the Uber tablet.';

    const tone = stillRetrying
        ? (isDark ? 'bg-amber-500/10 border-amber-500/40 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-900')
        : (isDark ? 'bg-red-500/10 border-red-500/50 text-red-200' : 'bg-red-50 border-red-300 text-red-900');
    const button = stillRetrying
        ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
        : 'bg-red-600 hover:bg-red-700 active:bg-red-800';

    const retry = async () => {
        setRetrying(true);
        try {
            const result = await base44.functions.invoke('uberEatsPushStatus', { orderId: order.id, force: true });
            const data = result?.data || {};
            if (data.pushed || data.skipped) {
                // "skipped" here means there was nothing left to send - Uber is up to date.
                toast.success(DONE[data.action] || 'Uber Eats is up to date');
            } else {
                toast.error('Uber Eats still couldn’t be updated. Use the Uber tablet for this order.');
            }
        } catch (e) {
            // The push answers 502 when Uber refuses or cannot be reached.
            const stopped = e?.response?.data?.gave_up;
            toast.error(stopped
                ? 'Uber Eats refused the update. Use the Uber tablet for this order.'
                : 'Uber Eats still can’t be reached. Use the Uber tablet if this order is urgent.',
                { duration: 6000 });
        } finally {
            setRetrying(false);
            if (typeof onRetried === 'function') onRetried();
        }
    };

    return (
        <div role="alert" className={`rounded-xl border p-3 mb-3 ${tone}`}>
            <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{headline}</p>
                    <p className="text-xs leading-snug mt-0.5">{detail}</p>
                </div>
            </div>
            <Button
                onClick={retry}
                disabled={retrying}
                className={`w-full h-11 rounded-xl text-white text-sm font-semibold mt-2 ${button}`}
            >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? 'Telling Uber…' : 'Retry now'}
            </Button>
        </div>
    );
}
