import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Monitor, Printer } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { createPageUrl } from '@/utils';
import BluetoothPrinterManager from './BluetoothPrinterManager';

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
                <CardContent className="space-y-4">
                    <Button 
                        onClick={() => window.location.href = createPageUrl('POSDashboard') + `?restaurantId=${restaurantId}`}
                        className="w-full bg-orange-500 hover:bg-orange-600"
                    >
                        <Monitor className="h-4 w-4 mr-2" />
                        Open POS Terminal
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Printer className="h-5 w-5" />
                        Receipt Printer
                    </CardTitle>
                    <CardDescription>
                        Configure Bluetooth receipt printer and settings
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <BluetoothPrinterManager restaurantId={restaurantId} />
                </CardContent>
            </Card>
        </div>
    );
}