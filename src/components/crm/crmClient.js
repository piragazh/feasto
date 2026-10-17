import { base44 } from '@/api/base44Client';

// Every CRM read and write goes through the crmApi backend function, which checks the caller
// manages this restaurant. CRM entities are not readable from the browser directly.
export async function crm(restaurantId, action, payload = {}) {
    try {
        const res = await base44.functions.invoke('crmApi', { action, restaurant_id: restaurantId, ...payload });
        const data = res?.data ?? res;
        if (data?.error) throw new Error(data.error);
        return data;
    } catch (e) {
        const msg = e?.response?.data?.error || e?.data?.error || e?.message || 'Something went wrong';
        throw new Error(msg);
    }
}

export const STAGE = {
    new: { label: 'New', className: 'bg-blue-100 text-blue-700' },
    active: { label: 'Active', className: 'bg-green-100 text-green-700' },
    at_risk: { label: 'At risk', className: 'bg-amber-100 text-amber-800' },
    lapsed: { label: 'Lapsed', className: 'bg-red-100 text-red-700' },
    prospect: { label: 'No orders yet', className: 'bg-gray-100 text-gray-600' },
};

export const SKIP_REASON = {
    no_consent: 'No consent for this channel',
    no_contact: 'No phone/email',
    suppressed: 'Opted out',
    marketplace: 'Marketplace customer',
    frequency_cap: 'Weekly limit reached',
    budget: 'Monthly budget reached',
    cancelled: 'Campaign cancelled',
};

export const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;
export const pence = (p) => `£${((Number(p) || 0) / 100).toFixed(2)}`;
export const shortDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const daysAgo = (d) => {
    if (!d) return '—';
    const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
};
