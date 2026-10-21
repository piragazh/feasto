import { base44 } from '@/api/base44Client';

export async function crmAdmin(action, payload = {}) {
    try {
        const res = await base44.functions.invoke('crmAdminApi', { action, ...payload });
        const data = res?.data ?? res;
        if (data?.error) throw new Error(data.error);
        return data;
    } catch (e) {
        throw new Error(e?.response?.data?.error || e?.data?.error || e?.message || 'Something went wrong');
    }
}
