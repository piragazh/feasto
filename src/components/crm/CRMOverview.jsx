import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Users, Repeat, PoundSterling, Smartphone, Mail, MessageCircle, Sparkles, ArrowRight } from 'lucide-react';
import { crm, money, pence, STAGE } from './crmClient';

function Stat({ icon: Icon, label, value, hint }) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center gap-2 text-gray-500 text-xs font-medium"><Icon className="h-4 w-4" />{label}</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
                {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
            </CardContent>
        </Card>
    );
}

export default function CRMOverview({ restaurantId, onStartCampaign, onOpenCustomers }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['crm-dashboard', restaurantId],
        queryFn: () => crm(restaurantId, 'dashboard'),
        enabled: !!restaurantId,
    });

    if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
    if (error) return <p className="text-sm text-red-600">{error.message}</p>;

    const stageOrder = ['new', 'active', 'at_risk', 'lapsed'];
    const total = data.customers || 0;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat icon={Users} label="Customers" value={total} hint={`${data.vip} VIP`} />
                <Stat icon={Repeat} label="Repeat rate" value={`${data.repeat_rate}%`} hint="ordered more than once" />
                <Stat icon={PoundSterling} label="Lifetime spend" value={money(data.total_spend)} />
                <Stat icon={Sparkles} label="CRM revenue this month" value={money(data.month.revenue)} hint={`${data.month.sent} sent · ${pence(data.month.cost_pence)} cost`} />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Where your customers are</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {stageOrder.map(s => {
                            const n = data.stages?.[s] || 0;
                            const pct = total ? Math.round(n / total * 100) : 0;
                            return (
                                <div key={s}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAGE[s].className}`}>{STAGE[s].label}</span>
                                        <span className="text-gray-600">{n} · {pct}%</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-orange-400" style={{ width: `${pct}%` }} /></div>
                                </div>
                            );
                        })}
                        <Button variant="ghost" size="sm" className="px-0 text-orange-600" onClick={onOpenCustomers}>See all customers <ArrowRight className="h-4 w-4 ml-1" /></Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Who you can message</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {[
                            { ch: 'sms', label: 'SMS', icon: Smartphone },
                            { ch: 'email', label: 'Email', icon: Mail },
                            { ch: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
                        ].map(({ ch, label, icon: Icon }) => (
                            <div key={ch} className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2 text-gray-700"><Icon className="h-4 w-4 text-gray-400" />{label}</span>
                                <span className="font-semibold">{data.consent?.[ch] || 0} <span className="font-normal text-gray-500">of {total}</span></span>
                            </div>
                        ))}
                        <p className="text-xs text-gray-500 pt-1">
                            Only customers who agreed to offers on a channel can be messaged on it. New online orders ask at checkout; phone orders ask at the till.
                        </p>
                    </CardContent>
                </Card>
            </div>

            {data.suggestions?.length > 0 && (
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Suggested next steps</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        {data.suggestions.map(s => (
                            <div key={s.segment_key} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-orange-50">
                                <span className="text-sm text-gray-800">{s.text}</span>
                                <Button size="sm" className="bg-orange-500 hover:bg-orange-600 shrink-0" onClick={() => onStartCampaign(s.segment_key)}>Start campaign</Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
