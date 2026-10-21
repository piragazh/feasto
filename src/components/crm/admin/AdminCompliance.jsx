import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { crmAdmin } from './adminClient';
import { shortDate } from '../crmClient';

const REASON = {
    unsubscribe_link: 'Unsubscribe link', stop_reply: 'Replied STOP', carrier_opt_out: 'Twilio STOP', hard_bounce: 'Bounced',
    complaint: 'Spam complaint', admin: 'Super Admin', migrated_user_flag: 'Old account setting', erased: 'Erased',
};
const METHOD = {
    checkout_tickbox: 'Checkout tickbox', soft_opt_in: 'Checkout (pre-ticked)', pos_verbal: 'Asked at till', staff_manual: 'Staff',
    unsubscribe_link: 'Unsubscribe link', stop_reply: 'STOP reply', whatsapp_optin: 'WhatsApp opt-in', admin: 'Admin / owner decision', import: 'Import',
};

export default function AdminCompliance() {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [method, setMethod] = useState('all');
    const [addValue, setAddValue] = useState('');
    const [addNote, setAddNote] = useState('');
    const [busy, setBusy] = useState(false);

    const sup = useQuery({ queryKey: ['crm-admin-supp', query], queryFn: () => crmAdmin('suppressions_list', { search: query }) });
    const log = useQuery({ queryKey: ['crm-admin-consent', method], queryFn: () => crmAdmin('consent_log', method === 'all' ? {} : { method }) });

    const add = async () => {
        setBusy(true);
        try {
            const r = await crmAdmin('suppression_add', { value: addValue, note: addNote });
            toast.success(`Opted out of ${r.channels.join(', ')} everywhere`);
            setAddValue(''); setAddNote('');
            qc.invalidateQueries({ queryKey: ['crm-admin-supp'] }); qc.invalidateQueries({ queryKey: ['crm-admin-consent'] });
        } catch (e) { toast.error(e.message); } finally { setBusy(false); }
    };
    const remove = async (s) => {
        if (!window.confirm(`Remove this opt-out for ${s.hint}? They could receive offers again if they have consent.`)) return;
        try { await crmAdmin('suppression_remove', { suppression_id: s.id }); qc.invalidateQueries({ queryKey: ['crm-admin-supp'] }); }
        catch (e) { toast.error(e.message); }
    };

    return (
        <div className="grid lg:grid-cols-2 gap-4">
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Do-not-market list</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setQuery(search); }}>
                        <div className="relative flex-1">
                            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <Input className="pl-9" placeholder="Check a phone number or email" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <Button type="submit" variant="outline">Check</Button>
                    </form>
                    {query && !sup.isLoading && !sup.data?.suppressions?.length && <p className="text-sm text-green-700">Not opted out.</p>}
                    <div className="divide-y rounded-lg border max-h-80 overflow-y-auto">
                        {sup.isLoading ? <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : (sup.data?.suppressions || []).map(s => (
                            <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                <span className="font-mono text-xs">{s.hint}</span>
                                <span className="text-xs text-gray-600 text-right">{s.channel} · {REASON[s.reason] || s.reason}{s.restaurant ? ` · ${s.restaurant}` : ''} · {shortDate(s.at)}
                                    {s.reason === 'admin' && <button className="ml-2 align-middle" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5 text-gray-400" /></button>}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-2 pt-2 border-t">
                        <div className="text-sm font-medium">Opt someone out everywhere</div>
                        <Input placeholder="Phone or email" value={addValue} onChange={e => setAddValue(e.target.value)} />
                        <Input placeholder="Note, e.g. asked by phone 21 Oct" value={addNote} onChange={e => setAddNote(e.target.value)} />
                        <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={busy || !addValue.trim()} onClick={add}>Opt out</Button>
                    </div>
                    <p className="text-xs text-gray-500">Stored as one-way fingerprints, so the list itself holds no readable phone numbers or emails. Opt-outs made by customers can only be undone by the customer opting in again.</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Consent log</CardTitle>
                    <Select value={method} onValueChange={setMethod}>
                        <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {Object.entries(METHOD).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <div className="divide-y max-h-[30rem] overflow-y-auto">
                        {log.isLoading ? <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : (log.data?.records || []).map((r, i) => (
                            <div key={i} className="py-2 text-xs">
                                <div className="flex justify-between"><span className="font-medium">{r.customer} · {r.restaurant}</span><span className="text-gray-500">{shortDate(r.at)}</span></div>
                                <div className={r.action === 'grant' ? 'text-green-700' : 'text-red-600'}>{r.channel.toUpperCase()} {r.action === 'grant' ? 'agreed' : 'opted out'} · {METHOD[r.method] || r.method}{r.captured_by ? ` · ${r.captured_by}` : ''}</div>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Subject access requests and erasure: open the person in All customers.</p>
                </CardContent>
            </Card>
        </div>
    );
}
