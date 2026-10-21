import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { crmAdmin } from './adminClient';
import { money, pence } from '../crmClient';

const Ok = ({ ok, children }) => (
    <div className="flex items-start gap-2 text-sm">{ok ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" /> : <XCircle className="h-4 w-4 text-gray-400 mt-0.5" />}<div>{children}</div></div>
);

export default function AdminChannels() {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const { data, isLoading, error } = useQuery({ queryKey: ['crm-admin-costs', month], queryFn: () => crmAdmin('costs', { month }) });
    if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
    if (error) return <p className="text-sm text-red-600">{error.message}</p>;
    const p = data.providers;
    const total = data.restaurants.reduce((s, r) => s + r.cost_pence, 0);
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Providers</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-3">
                    <Ok ok={p.httpsms.configured}>httpSMS (Android phone gateway)</Ok>
                    <Ok ok={p.twilio.configured}>Twilio{p.twilio.balance ? ` — balance ${p.twilio.balance}` : ''}</Ok>
                    <Ok ok={p.email.configured}>Email — {p.email.note}</Ok>
                    <Ok ok={p.whatsapp.numbers.some(n => n.status === 'connected')}>
                        WhatsApp — {p.whatsapp.numbers.length ? p.whatsapp.numbers.map(n => `${n.restaurant}: ${n.number || '—'} (${n.status})`).join(', ') : 'no restaurant numbers connected'}
                        <div className="text-xs text-gray-500">{p.whatsapp.marketing_templates.length} marketing template{p.whatsapp.marketing_templates.length === 1 ? '' : 's'}</div>
                    </Ok>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Messages and cost by restaurant</CardTitle>
                    <Input type="month" className="w-44 h-8" value={month} onChange={e => setMonth(e.target.value)} />
                </CardHeader>
                <CardContent className="p-0">
                    {!data.restaurants.length ? <p className="text-sm text-gray-500 text-center py-8">No marketing messages in {month}.</p> : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                                    <th className="text-left px-4 py-2">Restaurant</th><th className="text-right px-2">SMS httpSMS</th><th className="text-right px-2">SMS Twilio</th>
                                    <th className="text-right px-2">Email</th><th className="text-right px-2">WhatsApp</th><th className="text-right px-2">Cost</th><th className="text-right px-4">Revenue</th>
                                </tr></thead>
                                <tbody className="divide-y">
                                    {data.restaurants.map(r => (
                                        <tr key={r.restaurant_id}>
                                            <td className="px-4 py-2 font-medium">{r.name}</td><td className="text-right px-2">{r.sms_httpsms}</td><td className="text-right px-2">{r.sms_twilio}</td>
                                            <td className="text-right px-2">{r.email}</td><td className="text-right px-2">{r.whatsapp}</td><td className="text-right px-2">{pence(r.cost_pence)}</td><td className="text-right px-4">{money(r.revenue)}</td>
                                        </tr>
                                    ))}
                                    <tr className="font-semibold bg-gray-50"><td className="px-4 py-2">Total</td><td colSpan={4} /><td className="text-right px-2">{pence(total)}</td><td /></tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {data.failures.total > 0 && (
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Failed sends ({data.failures.total})</CardTitle></CardHeader>
                    <CardContent className="text-xs space-y-1">
                        {data.failures.sample.map((f, i) => <div key={i}>{f.restaurant} · {f.channel}{f.provider ? `/${f.provider}` : ''} · <span className="text-red-600">{f.error}</span></div>)}
                    </CardContent>
                </Card>
            )}
            <p className="text-xs text-gray-500">Costs use each restaurant's per-SMS rates from its CRM settings. Use this table to recharge restaurants for messaging.</p>
        </div>
    );
}
