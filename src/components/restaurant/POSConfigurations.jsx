import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Monitor, PlusCircle, LayoutGrid, Layout } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { createPageUrl } from '@/utils';
import CustomItemsManager from './CustomItemsManager';
import TableManagement from './TableManagement';
import POSLayoutSelector from '../pos/POSLayoutSelector';
import PhoneOrderSettings from '../pos/PhoneOrderSettings';
import POSCardTerminalSettings from '../pos/POSCardTerminalSettings';
import POSCustomizationLayoutSelector from '../pos/POSCustomizationLayoutSelector';

export default function POSConfigurations({ restaurantId }) {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Monitor className="h-5 w-5" />
                        Point of Sale System
                    </CardTitle>
                    <CardDescription>
                        Access and configure your restaurant's POS terminal
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        onClick={() => window.location.href = createPageUrl('POSDashboard') + `?restaurantId=${restaurantId}`}
                        className="w-full bg-orange-500 hover:bg-orange-600"
                    >
                        <Monitor className="h-4 w-4 mr-2" />
                        Open POS Terminal
                    </Button>
                </CardContent>
            </Card>

            <POSCardTerminalSettings restaurantId={restaurantId} />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <PlusCircle className="h-5 w-5" />
                        Custom Items
                    </CardTitle>
                    <CardDescription>
                        Create quick-add items like delivery charge, bag fee, etc.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <CustomItemsManager restaurantId={restaurantId} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Layout className="h-5 w-5" />
                        POS Screen Layout
                    </CardTitle>
                    <CardDescription>
                        Choose how the POS order entry screen is arranged for your staff.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <POSLayoutSelector restaurantId={restaurantId} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <LayoutGrid className="h-5 w-5" />
                        Item Customisation Style
                    </CardTitle>
                    <CardDescription>
                        Choose how item customisation options are shown when adding items to the cart.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <POSCustomizationLayoutSelector restaurantId={restaurantId} />
                </CardContent>
            </Card>

            <PhoneOrderSettings restaurantId={restaurantId} />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <LayoutGrid className="h-5 w-5" />
                        Table Layout Designer
                    </CardTitle>
                    <CardDescription>
                        Add, configure and visually position tables on your floor plan. Changes reflect instantly in the POS terminal.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <TableManagement restaurantId={restaurantId} />
                </CardContent>
            </Card>
        </div>
    );
}