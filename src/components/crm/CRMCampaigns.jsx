import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2, Plus, Smartphone, Mail, Pause, Play, XCircle, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { crm, money, pence, shortDate, SKIP_REASON } from './crmClient';
import CampaignComposer from './CampaignComposer';

const STATUS = {
    draft: 'bg-gray-100 text-gray-700', pending_approval: 'bg-purple-100 text-purple-700', scheduled: 'bg-blue-100 text-blue-700', sending: 'bg-amber-100 text-amber-800',
    sent: 'bg-green-100 text-green-700', paused: 'bg-orange-100 text-orange-700', cancelled: 'bg-red-100 text-red-700',
};
const JOB_STATUS = {
    queued: 'Waiting', sending: 'Sending', sent: 'Sent', delivered: 'Delivered', failed: 'Failed', uncertain: 'Sent (unconfirmed)',
    skipped: 'Not sent', holdout: 'Control group', converted: 'Ordered',
};

function Report({ restaurantId, campaignId, onClose }) {
    const qc = useQueryClient();
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['crm-campaign', restaurantId, campaignId],
        queryFn: () => crm(restaurantId, 'campaign_get', { campaign_id: campaignId }),
        enabled: !!campaignId,
        // react-query v4 passes the data, v5 the query: handle both.
        refetchInterval: (q) => { const d = q?.state ? q.state.data : q; return ['sending', 'scheduled'].includes(d?.campaign?.status) ? 15000 : false; },
    });
    const act = async (action, msg) => {
        try { await crm(restaurantId, action, { campaign_id: campaignId }); toast.success(msg); refetch(); qc.invalidateQueries({ queryKey: ['crm-campaigns', restaurantId] }); }
        catch (e) { toast.error(e.message); }
    };
    const c = data?.campaign, r = data?.report;
    return (
        <Sheet open={!!campaignId} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
                {isLoading || !c ? <div className="py-24 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div> : (
                    <div className="space-y-5">
                        <SheetHeader>
                            <SheetTitle>{c.name}</SheetTitle>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS[c.status]}`}>{c.status}</span>
                                <span>{c.channel.toUpperCase()}{c.channel === 'sms' ? ` · ${c.sms_provider}` : ''}</span>
                                <span>· {c.segment_name}</span>
                                <span>· {c.sent_at ? `sent ${shortDate(c.sent_at)}` : c.schedule_at ? `scheduled ${new Date(c.schedule_at).toLocaleString('en-GB')}` : 'not sent'}</span>
                                <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></Button>
                            </div>
                        </SheetHeader>

                        <div className="flex gap-2">
                            {['sending', 'scheduled'].includes(c.status) && <Button size="sm" variant="outline" onClick={() => act('campaign_pause', 'Paused')}><Pause className="h-4 w-4 mr-1" />Pause</Button>}
                            {c.status === 'paused' && <Button size="sm" variant="outline" onClick={() => act('campaign_resume', 'Resumed')}><Play className="h-4 w-4 mr-1" />Resume</Button>}
                            {['sending', 'scheduled', 'paused'].includes(c.status) && <Button size="sm" variant="outline" className="text-red-600" onClick={() => window.confirm('Cancel the rest of this campaign?') && act('campaign_cancel', 'Cancelled')}><XCircle className="h-4 w-4 mr-1" />Cancel</Button>}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {[
                                ['Audience', r.audience], ['Sent', r.sent], ['Delivered', r.delivered],
                                ['Ordered', r.converted], ['Revenue', money(r.revenue)], ['Cost', pence(r.cost_pence)],
                            ].map(([k, v]) => <div key={k} className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">{k}</div><div className="text-lg font-bold">{v}</div></div>)}
                        </div>
                        {r.cost_pence > 0 && r.revenue > 0 && <p className="text-sm text-gray-700">£{(r.revenue / (r.cost_pence / 100)).toFixed(0)} of orders for every £1 spent.</p>}
                        {data.lift && (
                            <div className="rounded-lg border p-3 text-sm">
                                <div className="font-semibold mb-1">Real effect (vs control group)</div>
                                {data.lift.recipients_order_rate}% of recipients ordered again vs {data.lift.holdout_order_rate}% of the control group — <b>{data.lift.lift_points > 0 ? '+' : ''}{data.lift.lift_points} points</b>.
                            </div>
                        )}
                        {(r.skipped_total > 0 || r.failed > 0 || r.queued > 0) && (
                            <div className="text-sm space-y-0.5">
                                {r.queued > 0 && <div>{r.queued} waiting to send</div>}
                                {r.failed > 0 && <div className="text-red-600">{r.failed} failed</div>}
                                {r.uncertain > 0 && <div className="text-amber-700">{r.uncertain} sent but not yet confirmed</div>}
                                {Object.entries(r.skipped || {}).map(([k, n]) => <div key={k} className="text-gray-600">{n} not sent — {SKIP_REASON[k] || k}</div>)}
                                {r.holdout > 0 && <div className="text-gray-600">{r.holdout} held back as control group</div>}
                            </div>
                        )}

                        <div>
                            <h4 className="text-sm font-semibold mb-2">Recipients</h4>
                            <div className="divide-y rounded-lg border max-h-96 overflow-y-auto">
                                {data.recipients.map(j => (
                                    <div key={j.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                        <span className="font-mono text-xs">{j.to || '—'}</span>
                                        <span className="text-xs text-right">
                                            {JOB_STATUS[j.status] || j.status}
                                            {j.skip_reason ? ` · ${SKIP_REASON[j.skip_reason] || j.skip_reason}` : ''}
                                            {j.converted_total ? ` · ${money(j.converted_total)}` : ''}
                                            {j.error ? <span className="block text-red-600">{j.error}</span> : null}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

export default function CRMCampaigns({ restaurantId, restaurantName, draft, onDraftConsumed }) {
    const qc = useQueryClient();
    const [composer, setComposer] = useState(null);
    const [reportId, setReportId] = useState(null);
    const { data, isLoading, error } = useQuery({
        queryKey: ['crm-campaigns', restaurantId],
        queryFn: () => crm(restaurantId, 'campaigns_list'),
        refetchInterval: 30000,
    });

    useEffect(() => {
        if (draft) { setComposer({ segment_key: draft.segment_key, segment_name: draft.segment_name || '' }); onDraftConsumed?.(); }
    }, [draft?.nonce]);

    const openDraft = async (id) => {
        try {
            const d = await crm(restaurantId, 'campaign_get', { campaign_id: id });
            setComposer({ ...d.campaign, coupon_config: d.campaign.coupon_config || undefined, schedule_at: d.campaign.schedule_at ? d.campaign.schedule_at.slice(0, 16) : '' });
        } catch (e) { toast.error(e.message); }
    };
    const removeDraft = async (id) => {
        if (!window.confirm('Delete this draft?')) return;
        try { await crm(restaurantId, 'campaign_delete', { campaign_id: id }); qc.invalidateQueries({ queryKey: ['crm-campaigns', restaurantId] }); }
        catch (e) { toast.error(e.message); }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">One-off offers to a segment, by SMS or email.</p>
                <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setComposer({})}><Plus className="h-4 w-4 mr-1" />New campaign</Button>
            </div>
            {error && <p className="text-sm text-red-600">{error.message}</p>}
            <Card>
                <CardContent className="p-0">
                    {isLoading ? <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
                        : !data?.campaigns?.length ? <p className="text-sm text-gray-500 text-center py-12">No campaigns yet.</p>
                            : (
                                <div className="divide-y">
                                    {data.campaigns.map(c => (
                                        <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                            <button className="text-left min-w-0 flex-1" onClick={() => (c.status === 'draft' ? openDraft(c.id) : setReportId(c.id))}>
                                                <div className="font-medium text-gray-900 flex items-center gap-2 truncate">
                                                    {c.channel === 'sms' ? <Smartphone className="h-4 w-4 text-gray-400 shrink-0" /> : <Mail className="h-4 w-4 text-gray-400 shrink-0" />}{c.name}
                                                </div>
                                                <div className="text-xs text-gray-500">{c.segment_name || '—'} · {c.sent_at ? shortDate(c.sent_at) : c.schedule_at ? `scheduled ${shortDate(c.schedule_at)}` : `created ${shortDate(c.created_date)}`}</div>
                                            </button>
                                            <div className="flex items-center gap-3 shrink-0">
                                                {c.status !== 'draft' && <div className="text-right text-xs text-gray-600 hidden sm:block">{c.stats?.sent ?? 0} sent · {c.stats?.converted ?? 0} ordered · {money(c.stats?.revenue)}</div>}
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS[c.status]}`}>{c.status}</span>
                                                {c.status === 'draft' && <>
                                                    <Button variant="ghost" size="icon" onClick={() => openDraft(c.id)}><Pencil className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => removeDraft(c.id)}><Trash2 className="h-4 w-4 text-gray-400" /></Button>
                                                </>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                </CardContent>
            </Card>

            {composer && (
                <CampaignComposer restaurantId={restaurantId} restaurantName={restaurantName} initial={composer}
                    onClose={(sentId) => { setComposer(null); if (sentId) setReportId(sentId); }} />
            )}
            <Report restaurantId={restaurantId} campaignId={reportId} onClose={() => setReportId(null)} />
        </div>
    );
}
