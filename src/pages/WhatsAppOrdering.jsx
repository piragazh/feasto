import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, MessageCircle } from 'lucide-react';
import WhatsAppConnectionPanel from '@/components/whatsapp/WhatsAppConnectionPanel';
import WhatsAppInbox from '@/components/whatsapp/WhatsAppInbox';
import { waAdmin } from '@/components/whatsapp/whatsappApi';

/**
 * WhatsApp Ordering module.
 * Admins pick any restaurant (or arrive with ?restaurantId=); managers see their own.
 */
export default function WhatsAppOrdering() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [restaurants, setRestaurants] = useState([]);
    const [restaurantId, setRestaurantId] = useState(null);
    const [config, setConfig] = useState(null);
    const [channel, setChannel] = useState(null);
    const [denied, setDenied] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const user = await base44.auth.me();
                let list = [];
                if (user.role === 'admin') {
                    list = await base44.entities.Restaurant.list('name', 500);
                } else {
                    const managers = await base44.entities.RestaurantManager.filter({ user_email: user.email, is_active: true });
                    const ids = [...new Set(managers.flatMap((m) => m.restaurant_ids || []))];
                    list = (await Promise.all(ids.map((id) => base44.entities.Restaurant.filter({ id }))))
                        .flat().filter(Boolean);
                }
                if (!list.length) { setDenied(true); return; }
                setRestaurants(list);
                const wanted = new URLSearchParams(window.location.search).get('restaurantId');
                setRestaurantId(list.find((r) => r.id === wanted)?.id || list[0].id);
                setConfig(await waAdmin('config'));
            } catch {
                setDenied(true);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const loadChannel = useCallback(async () => {
        if (!restaurantId) return;
        try {
            const res = await waAdmin('list_channels', { restaurant_id: restaurantId });
            const rows = res.channels || [];
            setChannel(rows.find((c) => c.status === 'connected') || rows[0] || null);
        } catch {
            setChannel(null);
        }
    }, [restaurantId]);

    useEffect(() => { setChannel(null); loadChannel(); }, [loadChannel]);

    const restaurant = restaurants.find((r) => r.id === restaurantId);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-green-600" />
            </div>
        );
    }

    if (denied || !restaurant) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="text-center max-w-sm">
                    <MessageCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-700 font-medium">You don't have access to WhatsApp ordering.</p>
                    <Button variant="outline" className="mt-4" onClick={() => navigate(createPageUrl('Home'))}>Go home</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
                <div className="flex items-center gap-3 flex-wrap">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-lg bg-green-600 flex items-center justify-center">
                            <MessageCircle className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">WhatsApp Ordering</h1>
                            <p className="text-xs text-gray-500">Customers order by messaging the restaurant's own number</p>
                        </div>
                    </div>
                    {restaurants.length > 1 && (
                        <div className="ml-auto w-full sm:w-64">
                            <Select value={restaurantId} onValueChange={setRestaurantId}>
                                <SelectTrigger><SelectValue placeholder="Choose restaurant" /></SelectTrigger>
                                <SelectContent>
                                    {restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <Tabs defaultValue={channel?.status === 'connected' ? 'inbox' : 'setup'} key={`${restaurantId}-${channel?.status === 'connected'}`}>
                    <TabsList>
                        <TabsTrigger value="inbox" disabled={channel?.status !== 'connected'}>Inbox</TabsTrigger>
                        <TabsTrigger value="setup">Setup</TabsTrigger>
                    </TabsList>
                    <TabsContent value="inbox" className="mt-4">
                        {channel?.status === 'connected' && <WhatsAppInbox restaurant={restaurant} />}
                    </TabsContent>
                    <TabsContent value="setup" className="mt-4 max-w-2xl">
                        <WhatsAppConnectionPanel restaurant={restaurant} config={config} channel={channel} onChanged={loadChannel} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
