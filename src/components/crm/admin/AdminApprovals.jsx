import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { crmAdmin } from './adminClient';
import { crm } from '../crmClient';

function Rules() {
    const qc = useQueryClient();
    const { data } = useQuery({ queryKey: ['crm-admin-platform-settings'], queryFn: () => crmAdmin('platform_settings_get') });
    const [firstN, setFirstN] = useState(0);
    const [overPounds, setOverPounds] = useState(0);
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (data) { setFirstN(data.approval_first_n); setOverPounds(data.approval_over_pence / 100); } }, [data]);
    const save = async () => {
        setSaving(true);
        try { await crmAdmin('platform_settings_save', { approval_first_n: firstN, approval_over_pence: Math.round(Number(overPounds) * 100) }); toast.success('Approval rules saved'); qc.invalidateQueries({ queryKey: ['crm-admin-platform-settings'] }); }
        catch (e) { toast.error(e.message); } finally { setSaving(false); }
    };
    return (
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">When does a restaurant's campaign need your approval?</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3 items-end">
                <div><Label>Their first N campaigns (0 = never)</Label><Input type="number" min="0" value={firstN} onChange={e => setFirstN(e.target.value)} /></div>
                <div><Label>SMS campaigns costing more than £ (0 = never)</Label><Input type="number" min="0" value={overPounds} onChange={e => setOverPounds(e.target.value)} /></div>
                <Button className="bg-orange-500 hover:bg-orange-600" disabled={saving} onClick={save}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save rules</Button>
                <p className="md:col-span-3 text-xs text-gray-500">Automations never need approval. Campaigns you send yourself never need approval.</p>
            </CardContent>
        </Card>
    );
}

export default function AdminApprovals() {
    const qc = useQueryClient();
    const [busy, setBusy] = useState(null);
    const { data, isLoading, error } = useQuery({ queryKey: ['crm-admin-approvals'], queryFn: () => crmAdmin('approvals_list') });
    const refresh = () => { qc.invalidateQueries({ queryKey: ['crm-admin-approvals'] }); qc.invalidateQueries({ queryKey: ['crm-admin-overview'] }); };

    const approve = async (c) => {
        if (!window.confirm(`Approve and send "${c.name}" for ${c.restaurant}?`)) return;
        setBusy(c.id);
        try { const r = await crm(c.restaurant_id, 'campaign_send', { campaign_id: c.id }); toast.success(r.scheduled_for ? 'Approved and scheduled' : `Approved — sending to ${r.queued}`); refresh(); }
        catch (e) { toast.error(e.message); } finally { setBusy(null); }
    };
    const reject = async (c) => {
        const reason = window.prompt('Why? The restaurant will see this and the campaign goes back to draft.');
        if (!reason) return;
        setBusy(c.id);
        try { await crmAdmin('campaign_reject', { campaign_id: c.id, reason }); toast.success('Sent back to draft'); refresh(); }
        catch (e) { toast.error(e.message); } finally { setBusy(null); }
    };

    return (
        <div className="space-y-4">
            <Rules />
            {isLoading ? <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
                : error ? <p className="text-sm text-red-600">{error.message}</p>
                    : !data.campaigns.length ? <p className="text-sm text-gray-500 text-center py-8">Nothing waiting for approval.</p>
                        : data.campaigns.map(c => (
                            <Card key={c.id}>
                                <CardContent className="p-4 space-y-2">
                                    <div className="flex justify-between gap-3">
                                        <div>
                                            <div className="font-semibold">{c.name} <span className="text-gray-500 font-normal">· {c.restaurant}</span></div>
                                            <div className="text-xs text-gray-500">{c.channel.toUpperCase()} · {c.segment_name} · by {c.created_by} · {c.reason}</div>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => reject(c)}><X className="h-4 w-4 mr-1" />Reject</Button>
                                            <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={busy === c.id} onClick={() => approve(c)}>{busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" />Approve</>}</Button>
                                        </div>
                                    </div>
                                    {c.subject && <div className="text-sm"><span className="text-gray-500">Subject:</span> {c.subject}</div>}
                                    <div className="rounded-lg bg-gray-50 p-3 text-sm whitespace-pre-line">{c.body}</div>
                                    {c.coupon_mode !== 'none' && <div className="text-xs text-gray-600">Offer: {c.coupon_mode === 'shared' ? c.coupon_code : `unique ${c.coupon_config?.discount_type === 'fixed' ? '£' : ''}${c.coupon_config?.discount_value}${c.coupon_config?.discount_type === 'percentage' ? '%' : ''} off codes`}</div>}
                                </CardContent>
                            </Card>
                        ))}
        </div>
    );
}
