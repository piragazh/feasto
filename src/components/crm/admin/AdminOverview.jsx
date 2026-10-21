import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { crmAdmin } from './adminClient';
import { money, pence } from '../crmClient';

const Stat = ({ label, value, hint }) => (
    <Card><CardContent className="p-4"><div className="text-xs text-gray-500">{label}</div><div className="text-2xl font-bold">{value}</div>{hint && <div className="text-xs text-gray-500">{hint}</div>}</CardContent></Card>
);

export default function AdminOverview({ onOpenRestaurant, onOpenApprovals }) {
    const { data, isLoading, error } = useQuery({ queryKey: ['crm-admin-overview'], queryFn: () => crmAdmin('overview') });
    if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
    if (error) return <p className="text-sm text-red-600">{error.message}</p>;
    const t = data.totals;
    return (
        <div className="space-y-4">
            {t.pending_approvals > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm">
                    <span>{t.pending_approvals} campaign{t.pending_approvals > 1 ? 's are' : ' is'} waiting for your approval</span>
                    <Button size="sm" variant="outline" onClick={onOpenApprovals}>Review</Button>
                </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="People" value={t.contacts} hint={`${t.profiles} restaurant relationships`} />
                <Stat label="Marketable" value={`${t.consent.sms} SMS · ${t.consent.email} email`} hint={`${t.consent.whatsapp} WhatsApp · ${t.suppressed} opted out`} />
                <Stat label="Sent this month" value={t.sent} hint={`${pence(t.cost_pence)} cost · ${t.automations_on} automations on`} />
                <Stat label="Revenue from messages" value={money(t.revenue)} hint={`${t.converted} orders`} />
            </div>
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Restaurants</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                        <div className="col-span-3">Restaurant</div><div className="col-span-1 text-right">Customers</div><div className="col-span-2 text-right">Marketable</div>
                        <div className="col-span-1 text-right">At risk</div><div className="col-span-1 text-right">Sent</div><div className="col-span-2 text-right">Revenue / cost</div><div className="col-span-2" />
                    </div>
                    <div className="divide-y">
                        {data.restaurants.map(r => (
                            <div key={r.restaurant_id} className="grid grid-cols-2 md:grid-cols-12 gap-2 px-4 py-3 text-sm items-center">
                                <div className="md:col-span-3 font-medium">{r.name}</div>
                                <div className="md:col-span-1 md:text-right">{r.customers}</div>
                                <div className="md:col-span-2 md:text-right">{r.marketable} ({r.customers ? Math.round(r.marketable / r.customers * 100) : 0}%)</div>
                                <div className="md:col-span-1 md:text-right">{r.at_risk}</div>
                                <div className="md:col-span-1 md:text-right">{r.sent}</div>
                                <div className="md:col-span-2 md:text-right">{money(r.revenue)} / {pence(r.cost_pence)}</div>
                                <div className="md:col-span-2 text-right"><Button size="sm" variant="outline" onClick={() => onOpenRestaurant(r.restaurant_id)}>Open CRM</Button></div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
