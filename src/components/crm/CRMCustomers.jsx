import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Crown, Smartphone, Mail, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { crm, money, daysAgo, STAGE } from './crmClient';
import CustomerDrawer from './CustomerDrawer';

export default function CRMCustomers({ restaurantId }) {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [stage, setStage] = useState('all');
    const [consent, setConsent] = useState('any');
    const [sort, setSort] = useState('last_order');
    const [page, setPage] = useState(1);
    const [openId, setOpenId] = useState(null);

    useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
    useEffect(() => { setPage(1); }, [debounced, stage, consent, sort]);

    const filters = {
        search: debounced,
        stage: stage === 'all' || stage === 'vip' ? undefined : stage,
        vip: stage === 'vip' || undefined,
        consent_channel: consent === 'any' ? undefined : consent,
        sort, page, page_size: 25,
    };
    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: ['crm-customers', restaurantId, filters],
        queryFn: () => crm(restaurantId, 'customers_list', filters),
        keepPreviousData: true,
    });

    const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

    return (
        <div className="space-y-3">
            <div className="flex flex-col md:flex-row gap-2">
                <div className="relative flex-1">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input className="pl-9" placeholder="Search name, phone, email or postcode" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select value={stage} onValueChange={setStage}>
                    <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All stages</SelectItem>
                        <SelectItem value="vip">VIP</SelectItem>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="at_risk">At risk</SelectItem>
                        <SelectItem value="lapsed">Lapsed</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={consent} onValueChange={setConsent}>
                    <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any">Any consent</SelectItem>
                        <SelectItem value="sms">Agreed to SMS</SelectItem>
                        <SelectItem value="email">Agreed to email</SelectItem>
                        <SelectItem value="whatsapp">Agreed to WhatsApp</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="last_order">Last order</SelectItem>
                        <SelectItem value="spend">Total spend</SelectItem>
                        <SelectItem value="orders">Most orders</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {error && <p className="text-sm text-red-600">{error.message}</p>}

            <Card>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
                    ) : !data?.customers?.length ? (
                        <p className="text-sm text-gray-500 text-center py-12">No customers match.</p>
                    ) : (
                        <div className="divide-y">
                            <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                                <div className="col-span-4">Customer</div><div className="col-span-2">Stage</div>
                                <div className="col-span-1 text-right">Orders</div><div className="col-span-2 text-right">Spend</div>
                                <div className="col-span-2">Last order</div><div className="col-span-1">Offers</div>
                            </div>
                            {data.customers.map(c => (
                                <button key={c.id} onClick={() => setOpenId(c.id)} className="w-full text-left grid grid-cols-2 md:grid-cols-12 gap-2 px-4 py-3 hover:bg-orange-50/50 transition-colors items-center">
                                    <div className="md:col-span-4 min-w-0">
                                        <div className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                                            {c.name}{c.is_vip && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                                        </div>
                                        <div className="text-xs text-gray-500 truncate">{c.phone || c.email || '—'}</div>
                                    </div>
                                    <div className="md:col-span-2 text-right md:text-left">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAGE[c.stage]?.className || ''}`}>{STAGE[c.stage]?.label || c.stage}</span>
                                    </div>
                                    <div className="md:col-span-1 md:text-right text-sm text-gray-700">{c.order_count}<span className="md:hidden text-gray-400"> orders</span></div>
                                    <div className="md:col-span-2 text-right text-sm font-medium">{money(c.total_spend)}</div>
                                    <div className="md:col-span-2 text-xs text-gray-500">{daysAgo(c.last_order_at)}</div>
                                    <div className="md:col-span-1 flex gap-1 justify-end md:justify-start">
                                        <Smartphone className={`h-3.5 w-3.5 ${c.consent.sms ? 'text-green-600' : 'text-gray-300'}`} />
                                        <Mail className={`h-3.5 w-3.5 ${c.consent.email ? 'text-green-600' : 'text-gray-300'}`} />
                                        <MessageCircle className={`h-3.5 w-3.5 ${c.consent.whatsapp ? 'text-green-600' : 'text-gray-300'}`} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {data && data.total > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{data.total} customers {isFetching && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</span>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                        <span>{page} / {pages}</span>
                        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            )}

            <CustomerDrawer restaurantId={restaurantId} profileId={openId} onClose={() => setOpenId(null)} />
        </div>
    );
}
