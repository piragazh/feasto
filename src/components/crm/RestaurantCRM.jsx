import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, Users, Filter, Send, Settings } from 'lucide-react';
import CRMOverview from './CRMOverview';
import CRMCustomers from './CRMCustomers';
import CRMSegments from './CRMSegments';
import CRMCampaigns from './CRMCampaigns';
import CRMSettingsPanel from './CRMSettingsPanel';

/**
 * Restaurant CRM — customers, segments, campaigns and marketing settings for one restaurant.
 * All data comes from the crmApi backend function (see crmClient.js).
 */
export default function RestaurantCRM({ restaurantId, restaurantName }) {
    const [tab, setTab] = useState('overview');
    const [campaignDraft, setCampaignDraft] = useState(null);

    // "Start a campaign" from anywhere opens the composer pre-filled with that audience.
    const startCampaign = (segment_key, segment_name) => {
        setCampaignDraft({ segment_key, segment_name, nonce: Date.now() });
        setTab('campaigns');
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Customers & marketing</h2>
                <p className="text-sm text-gray-500">Everyone who has ordered from {restaurantName}, and the offers you send them.</p>
            </div>
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex w-full overflow-x-auto justify-start">
                    <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="h-4 w-4" />Overview</TabsTrigger>
                    <TabsTrigger value="customers" className="gap-1.5"><Users className="h-4 w-4" />Customers</TabsTrigger>
                    <TabsTrigger value="segments" className="gap-1.5"><Filter className="h-4 w-4" />Segments</TabsTrigger>
                    <TabsTrigger value="campaigns" className="gap-1.5"><Send className="h-4 w-4" />Campaigns</TabsTrigger>
                    <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-4 w-4" />Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-4">
                    <CRMOverview restaurantId={restaurantId} onStartCampaign={startCampaign} onOpenCustomers={() => setTab('customers')} />
                </TabsContent>
                <TabsContent value="customers" className="mt-4">
                    <CRMCustomers restaurantId={restaurantId} />
                </TabsContent>
                <TabsContent value="segments" className="mt-4">
                    <CRMSegments restaurantId={restaurantId} onStartCampaign={startCampaign} />
                </TabsContent>
                <TabsContent value="campaigns" className="mt-4">
                    <CRMCampaigns restaurantId={restaurantId} restaurantName={restaurantName} draft={campaignDraft} onDraftConsumed={() => setCampaignDraft(null)} />
                </TabsContent>
                <TabsContent value="settings" className="mt-4">
                    <CRMSettingsPanel restaurantId={restaurantId} restaurantName={restaurantName} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
