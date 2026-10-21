import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LayoutDashboard, Users, Store, CheckSquare, ShieldCheck, Radio } from 'lucide-react';
import RestaurantCRM from '../RestaurantCRM';
import AdminOverview from './AdminOverview';
import AdminContacts from './AdminContacts';
import AdminApprovals from './AdminApprovals';
import AdminCompliance from './AdminCompliance';
import AdminChannels from './AdminChannels';

/** Super Admin CRM — every restaurant's customers and marketing in one place. */
export default function SuperAdminCRM() {
    const [tab, setTab] = useState('overview');
    const [restaurantId, setRestaurantId] = useState('');
    const { data: restaurants = [] } = useQuery({
        queryKey: ['crm-admin-restaurants'],
        queryFn: () => base44.entities.Restaurant.list('name', 500),
    });
    const restaurant = restaurants.find(r => r.id === restaurantId);
    const openRestaurant = (id) => { setRestaurantId(id); setTab('restaurant'); };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Customer CRM</h2>
                <p className="text-sm text-gray-500">Every restaurant's customers, consent and marketing in one place.</p>
            </div>
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex w-full overflow-x-auto justify-start">
                    <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="h-4 w-4" />Overview</TabsTrigger>
                    <TabsTrigger value="contacts" className="gap-1.5"><Users className="h-4 w-4" />All customers</TabsTrigger>
                    <TabsTrigger value="restaurant" className="gap-1.5"><Store className="h-4 w-4" />Restaurant CRM</TabsTrigger>
                    <TabsTrigger value="approvals" className="gap-1.5"><CheckSquare className="h-4 w-4" />Approvals</TabsTrigger>
                    <TabsTrigger value="compliance" className="gap-1.5"><ShieldCheck className="h-4 w-4" />Compliance</TabsTrigger>
                    <TabsTrigger value="channels" className="gap-1.5"><Radio className="h-4 w-4" />Channels & costs</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-4"><AdminOverview onOpenRestaurant={openRestaurant} onOpenApprovals={() => setTab('approvals')} /></TabsContent>
                <TabsContent value="contacts" className="mt-4"><AdminContacts restaurants={restaurants} /></TabsContent>
                <TabsContent value="restaurant" className="mt-4 space-y-4">
                    <Select value={restaurantId} onValueChange={setRestaurantId}>
                        <SelectTrigger className="max-w-sm"><SelectValue placeholder="Choose a restaurant" /></SelectTrigger>
                        <SelectContent>{restaurants.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {restaurant ? (
                        <div className="rounded-xl border border-purple-200 p-4">
                            <p className="text-xs text-purple-700 mb-3">You're using {restaurant.name}'s CRM as Super Admin. Campaigns you send here are recorded as sent on their behalf.</p>
                            <RestaurantCRM key={restaurant.id} restaurantId={restaurant.id} restaurantName={restaurant.name} />
                        </div>
                    ) : <p className="text-sm text-gray-500">Pick a restaurant to see its CRM exactly as the owner does.</p>}
                </TabsContent>
                <TabsContent value="approvals" className="mt-4"><AdminApprovals /></TabsContent>
                <TabsContent value="compliance" className="mt-4"><AdminCompliance /></TabsContent>
                <TabsContent value="channels" className="mt-4"><AdminChannels /></TabsContent>
            </Tabs>
        </div>
    );
}
