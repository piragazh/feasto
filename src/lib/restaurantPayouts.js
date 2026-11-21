import { base44 } from '@/api/base44Client';

// A restaurant's own payout data. Goes through finance-operations, which lets admins
// and active managers of that restaurant (RestaurantManager) call the my_* actions;
// the Payout table itself is admin-read-only.
async function call(action, payload) {
    const res = await base44.functions.invoke('finance-operations', { action, ...payload })
        .catch((e) => { throw new Error(e?.response?.data?.error || e?.message || 'Request failed'); });
    const data = res?.data ?? res;
    if (!data?.success) throw new Error(data?.error || 'Request failed');
    return data;
}

/** Statements, newest first (drafts and voided ones are left out). */
export async function fetchRestaurantPayouts(restaurantId) {
    return (await call('my_payouts', { restaurant_id: restaurantId })).payouts || [];
}

/** What the next payout would be if it were made today (orders up to yesterday), or null. */
export async function fetchRestaurantBalance(restaurantId) {
    return (await call('my_balance', { restaurant_id: restaurantId })).balance || null;
}

/** Download the order-by-order lines behind one statement as a CSV file. */
export async function downloadStatementCsv(restaurantId, payout) {
    const data = await call('my_statement', { restaurant_id: restaurantId, payout_id: payout.id });
    const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [['Line', 'Order', 'Date', 'Type', 'Payment', 'Status', 'Order total', 'Refund', 'Refund paid by', 'Description', 'Amount']];
    for (const l of data.lines) {
        rows.push([l.kind === 'order' ? 'Order' : 'Refund on earlier order', l.order_number, new Date(l.date).toLocaleString('en-GB'), l.order_type, l.payment_method, l.status, l.total.toFixed(2), l.refund_amount ? l.refund_amount.toFixed(2) : '', l.refund_paid_by, '', '']);
    }
    for (const a of data.adjustments) {
        rows.push(['Adjustment', '', new Date(a.date).toLocaleString('en-GB'), a.type.replace(/_/g, ' '), '', '', '', '', '', a.description, a.amount.toFixed(2)]);
    }
    const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MealDrop-statement-${(payout.period_start || '').slice(0, 10)}-to-${(payout.period_end || '').slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
