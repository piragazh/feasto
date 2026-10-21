import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2, Search, Download, Trash2, ChevronLeft, ChevronRight, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { crmAdmin } from './adminClient';
import { money, shortDate, daysAgo, STAGE } from '../crmClient';

function ContactDrawer({ contactId, onClose }) {
    const qc = useQueryClient();
    const [busy, setBusy] = useState(false);
    const { data, isLoading, error } = useQuery({ queryKey: ['crm-admin-contact', contactId], queryFn: () => crmAdmin('contact_get', { contact_id: contactId }), enabled: !!contactId });

    const exportSar = async () => {
        setBusy(true);
        try {
            const d = await crmAdmin('sar_export', { contact_id: contactId });
            const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `subject-access-${(d.person?.name || 'customer').replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e) { toast.error(e.message); } finally { setBusy(false); }
    };
    const erase = async () => {
        const typed = window.prompt('This permanently removes this person\'s name, phone, email and addresses from every restaurant, and blocks all marketing to them. Orders keep their amounts for accounting. Type ERASE to confirm.');
        if (typed !== 'ERASE') return;
        setBusy(true);
        try {
            const r = await crmAdmin('erase', { contact_id: contactId, confirm: 'ERASE' });
            toast.success(`Erased from ${r.profiles} restaurant${r.profiles === 1 ? '' : 's'} and ${r.orders} orders`);
            qc.invalidateQueries({ queryKey: ['crm-admin-contacts'] });
            onClose();
        } catch (e) { toast.error(e.message); } finally { setBusy(false); }
    };

    return (
        <Sheet open={!!contactId} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
                {isLoading || !data ? <div className="py-24 flex justify-center">{error ? <p className="text-sm text-red-600">{error.message}</p> : <Loader2 className="h-6 w-6 animate-spin text-orange-500" />}</div> : (
                    <div className="space-y-5">
                        <SheetHeader>
                            <SheetTitle>{data.contact.name || 'Customer'}</SheetTitle>
                            <div className="text-sm text-gray-600">{data.contact.phone?.replace(/^\+44/, '0') || '—'} · {data.contact.email || 'no email'}</div>
                        </SheetHeader>
                        {Object.keys(data.suppressed).length > 0 && (
                            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Opted out: {Object.entries(data.suppressed).map(([ch, s]) => `${ch} (${s.reason})`).join(', ')}</div>
                        )}
                        <div>
                            <h4 className="text-sm font-semibold mb-2">Restaurants</h4>
                            <div className="space-y-2">
                                {data.profiles.map(p => (
                                    <div key={p.id} className="rounded-lg border p-3 text-sm">
                                        <div className="flex justify-between font-medium"><span>{p.restaurant}{p.is_vip && <Crown className="inline h-3.5 w-3.5 text-amber-500 ml-1" />}</span><span>{money(p.spend)}</span></div>
                                        <div className="text-xs text-gray-500">{p.orders} orders · last {daysAgo(p.last_order_at)} · <span className={`px-1.5 rounded ${STAGE[p.stage]?.className}`}>{STAGE[p.stage]?.label}</span></div>
                                        <div className="text-xs mt-1">Offers: SMS {p.consent.sms ? '✓' : '✗'} · Email {p.consent.email ? '✓' : '✗'} · WhatsApp {p.consent.whatsapp ? '✓' : '✗'}{!p.marketing_eligible ? ' · marketplace only' : ''}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {data.consent_history.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold mb-1">Consent history</h4>
                                <div className="text-xs text-gray-600 space-y-0.5">
                                    {data.consent_history.slice(0, 12).map((r, i) => <div key={i}>{shortDate(r.at)} · {r.restaurant} · {r.channel} {r.action === 'grant' ? 'agreed' : 'opted out'} · {r.method}</div>)}
                                </div>
                            </div>
                        )}
                        {data.messages.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold mb-1">Marketing messages</h4>
                                <div className="text-xs text-gray-600 space-y-0.5">
                                    {data.messages.slice(0, 12).map((m, i) => <div key={i}>{shortDate(m.sent_at)} · {m.restaurant} · {m.channel} · {m.status}</div>)}
                                </div>
                            </div>
                        )}
                        <div className="flex gap-2 pt-2 border-t">
                            <Button variant="outline" size="sm" disabled={busy} onClick={exportSar}><Download className="h-4 w-4 mr-1" />Export their data</Button>
                            <Button variant="outline" size="sm" className="text-red-600" disabled={busy} onClick={erase}><Trash2 className="h-4 w-4 mr-1" />Erase</Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

export default function AdminContacts({ restaurants }) {
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const [restaurantId, setRestaurantId] = useState('all');
    const [page, setPage] = useState(1);
    const [openId, setOpenId] = useState(null);
    useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
    useEffect(() => { setPage(1); }, [q, restaurantId]);

    const params = { search: q, restaurant_id: restaurantId === 'all' ? undefined : restaurantId, page, page_size: 25 };
    const { data, isLoading, error } = useQuery({
        queryKey: ['crm-admin-contacts', params],
        queryFn: () => crmAdmin('contacts_list', params),
        placeholderData: (prev) => prev,
    });
    const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

    return (
        <div className="space-y-3">
            <div className="flex flex-col md:flex-row gap-2">
                <div className="relative flex-1">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input className="pl-9" placeholder="Search name, phone or email across every restaurant" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select value={restaurantId} onValueChange={setRestaurantId}>
                    <SelectTrigger className="md:w-60"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All restaurants</SelectItem>
                        {restaurants.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            {error && <p className="text-sm text-red-600">{error.message}</p>}
            <Card><CardContent className="p-0">
                {isLoading ? <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div> : (
                    <div className="divide-y">
                        {(data?.contacts || []).map(c => (
                            <button key={c.id} onClick={() => setOpenId(c.id)} className="w-full text-left px-4 py-3 hover:bg-orange-50/50 grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                                <div className="md:col-span-4 min-w-0">
                                    <div className="font-medium truncate">{c.anonymised ? 'Erased customer' : c.name}</div>
                                    <div className="text-xs text-gray-500 truncate">{c.phone || c.email || '—'}</div>
                                </div>
                                <div className="md:col-span-4 flex flex-wrap gap-1">{c.restaurants.map(r => <Badge key={r.id} variant="secondary" className="text-[11px]">{r.name}</Badge>)}</div>
                                <div className="md:col-span-1 text-sm md:text-right">{c.orders}</div>
                                <div className="md:col-span-2 text-sm md:text-right font-medium">{money(c.spend)}</div>
                                <div className="md:col-span-1 text-xs text-gray-500">{daysAgo(c.last_order_at)}</div>
                            </button>
                        ))}
                    </div>
                )}
            </CardContent></Card>
            {data && data.total > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{data.total} people</span>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                        <span>{page} / {pages}</span>
                        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            )}
            <ContactDrawer contactId={openId} onClose={() => setOpenId(null)} />
        </div>
    );
}
