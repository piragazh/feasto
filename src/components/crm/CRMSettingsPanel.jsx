import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { crm } from './crmClient';

export default function CRMSettingsPanel({ restaurantId, restaurantName }) {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({ queryKey: ['crm-settings', restaurantId], queryFn: () => crm(restaurantId, 'settings_get') });
    const [s, setS] = useState(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (data?.settings) setS(data.settings); }, [data]);
    const set = (patch) => setS(prev => ({ ...prev, ...patch }));

    if (isLoading || !s) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;

    const save = async () => {
        setSaving(true);
        try { await crm(restaurantId, 'settings_save', { settings: s }); toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['crm-settings', restaurantId] }); }
        catch (e) { toast.error(e.message); } finally { setSaving(false); }
    };
    const Provider = ({ ok, label }) => (
        <div className="flex items-center gap-2 text-sm">{ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-gray-400" />}{label}{!ok && <span className="text-gray-500">— not set up</span>}</div>
    );

    return (
        <div className="grid lg:grid-cols-2 gap-4">
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">How messages look</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <div><Label>Sender name</Label><Input value={s.sender_name || ''} onChange={e => set({ sender_name: e.target.value })} placeholder={restaurantName} /><p className="text-xs text-gray-500 mt-1">Starts every SMS and heads every email.</p></div>
                    <div><Label>Email "from" name</Label><Input value={s.email_from_name || ''} onChange={e => set({ email_from_name: e.target.value })} placeholder={restaurantName} /></div>
                    <div><Label>Reply-to email</Label><Input value={s.reply_to || ''} onChange={e => set({ reply_to: e.target.value })} placeholder="owner@yourrestaurant.co.uk" /></div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">SMS</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <Provider ok={data.providers.httpsms} label="httpSMS (Android phone gateway)" />
                    <Provider ok={data.providers.twilio} label="Twilio" />
                    <div>
                        <Label>Default route</Label>
                        <Select value={s.default_sms_provider} onValueChange={(v) => set({ default_sms_provider: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">Automatic — httpSMS, Twilio if it fails</SelectItem>
                                <SelectItem value="httpsms">httpSMS only</SelectItem>
                                <SelectItem value="twilio">Twilio only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><Label>Cost per SMS — httpSMS (p)</Label><Input type="number" step="0.1" value={s.sms_cost_pence?.httpsms ?? 0} onChange={e => set({ sms_cost_pence: { ...s.sms_cost_pence, httpsms: e.target.value } })} /></div>
                        <div><Label>Cost per SMS — Twilio (p)</Label><Input type="number" step="0.1" value={s.sms_cost_pence?.twilio ?? 4} onChange={e => set({ sms_cost_pence: { ...s.sms_cost_pence, twilio: e.target.value } })} /></div>
                    </div>
                    <div><Label>Monthly SMS budget (£, 0 = no limit)</Label><Input type="number" value={(s.monthly_budget_pence || 0) / 100} onChange={e => set({ monthly_budget_pence: Math.round(Number(e.target.value) * 100) })} /><p className="text-xs text-gray-500 mt-1">A campaign pauses itself if the next message would go over.</p></div>
                </CardContent>
            </Card>

            <Card className="lg:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-base">Respecting customers</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-4 gap-3">
                    <div><Label>Quiet from</Label><Input type="time" value={s.quiet_hours_start} onChange={e => set({ quiet_hours_start: e.target.value })} /></div>
                    <div><Label>Until</Label><Input type="time" value={s.quiet_hours_end} onChange={e => set({ quiet_hours_end: e.target.value })} /></div>
                    <div><Label>Max offers per customer / week</Label><Input type="number" min="1" max="7" value={s.max_marketing_per_week} onChange={e => set({ max_marketing_per_week: e.target.value })} /></div>
                    <div><Label>Count an order as from a message within (days)</Label><Input type="number" min="1" max="30" value={s.attribution_days} onChange={e => set({ attribution_days: e.target.value })} /></div>
                </CardContent>
            </Card>

            <div className="lg:col-span-2 flex justify-end">
                <Button className="bg-orange-500 hover:bg-orange-600" disabled={saving} onClick={save}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save settings</Button>
            </div>
        </div>
    );
}
