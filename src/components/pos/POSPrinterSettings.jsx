import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Printer, Bluetooth, Usb, Wifi, Save, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import BluetoothPrinterManager from '@/components/restaurant/BluetoothPrinterManager';
import { printerService } from '@/components/restaurant/PrinterService';

export default function POSPrinterSettings({ restaurantId }) {
    const queryClient = useQueryClient();

    const { data: restaurant, isLoading } = useQuery({
        queryKey: ['restaurant-pos-printer', restaurantId],
        queryFn: async () => {
            const [r] = await base44.entities.Restaurant.filter({ id: restaurantId });
            return r;
        },
    });

    const [printerConfig, setPrinterConfig] = useState({
        printer_type: 'bluetooth', // bluetooth | usb | network
        printer_width: '80mm',
        font_size: 'medium',
        template: 'standard',
        header_text: '',
        footer_text: '',
        show_logo: true,
        show_order_number: true,
        show_customer_details: true,
        auto_print: false,
        command_set: 'esc_pos',
        // Network printer fields
        network_ip: '',
        network_port: '9100',
        // USB printer
        usb_vendor_id: '',
        usb_product_id: '',
    });

    useEffect(() => {
        if (restaurant?.printer_config) {
            setPrinterConfig(prev => ({ ...prev, ...restaurant.printer_config }));
        }
    }, [restaurant]);

    const mutation = useMutation({
        mutationFn: (data) => base44.entities.Restaurant.update(restaurantId, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-pos-printer', restaurantId]);
            toast.success('Printer settings saved');
        },
        onError: () => toast.error('Failed to save settings'),
    });

    const handleSave = () => {
        mutation.mutate({ printer_config: printerConfig });
    };

    const handleBluetoothPrinterSelect = (printer) => {
        const updated = { ...printerConfig, bluetooth_printer: printer, printer_type: 'bluetooth' };
        setPrinterConfig(updated);
        mutation.mutate({ printer_config: updated });
    };

    const testNetworkPrinter = async () => {
        if (!printerConfig.network_ip) {
            toast.error('Please enter the printer IP address first');
            return;
        }
        toast.info(`Attempting to reach ${printerConfig.network_ip}:${printerConfig.network_port}...`);
        // In-browser we can't directly open a TCP socket, so just inform the user
        toast.info('Network printer test must be done from the POS terminal. Save settings and use the "Test Print" button in the POS.');
    };

    if (isLoading) return <div className="text-center py-8 text-gray-500">Loading...</div>;

    const currentType = printerConfig.printer_type || 'bluetooth';

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Printer className="h-5 w-5" />
                    Receipt Printer
                </CardTitle>
                <CardDescription>
                    Configure your POS receipt printer — Bluetooth, USB, or Network (LAN/WiFi)
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* Printer Type Selector */}
                <div>
                    <Label className="mb-2 block">Printer Connection Type</Label>
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { value: 'bluetooth', label: 'Bluetooth', icon: Bluetooth },
                            { value: 'usb', label: 'USB', icon: Usb },
                            { value: 'network', label: 'Network / LAN', icon: Wifi },
                        ].map(({ value, label, icon: Icon }) => (
                            <button
                                key={value}
                                onClick={() => setPrinterConfig({ ...printerConfig, printer_type: value })}
                                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                                    currentType === value
                                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                }`}
                            >
                                <Icon className="h-6 w-6" />
                                <span className="text-sm font-medium">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Bluetooth */}
                {currentType === 'bluetooth' && (
                    <div className="space-y-3">
                        <BluetoothPrinterManager
                            selectedPrinter={printerConfig.bluetooth_printer}
                            onPrinterSelect={handleBluetoothPrinterSelect}
                            restaurantId={restaurantId}
                        />
                    </div>
                )}

                {/* USB */}
                {currentType === 'usb' && (
                    <div className="space-y-4">
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
                            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-800">
                                <p className="font-medium mb-1">USB Printer Setup</p>
                                <p>USB printing requires the printer to be connected to the device running the POS browser. Chrome/Edge supports USB printing via WebUSB. Enter the Vendor and Product IDs from your printer specs or Device Manager.</p>
                            </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <Label>Vendor ID (hex)</Label>
                                <Input
                                    placeholder="e.g., 0x04b8 (Epson)"
                                    value={printerConfig.usb_vendor_id || ''}
                                    onChange={(e) => setPrinterConfig({ ...printerConfig, usb_vendor_id: e.target.value })}
                                    className="mt-1 font-mono"
                                />
                            </div>
                            <div>
                                <Label>Product ID (hex)</Label>
                                <Input
                                    placeholder="e.g., 0x0202"
                                    value={printerConfig.usb_product_id || ''}
                                    onChange={(e) => setPrinterConfig({ ...printerConfig, usb_product_id: e.target.value })}
                                    className="mt-1 font-mono"
                                />
                            </div>
                        </div>
                        <div className="bg-gray-50 border rounded-lg p-3 text-sm text-gray-600 space-y-1">
                            <p className="font-medium text-gray-800">Common Vendor IDs:</p>
                            <p>• Epson: <code className="bg-gray-200 px-1 rounded">0x04b8</code></p>
                            <p>• Star Micronics: <code className="bg-gray-200 px-1 rounded">0x0519</code></p>
                            <p>• Citizen: <code className="bg-gray-200 px-1 rounded">0x1d90</code></p>
                            <p>• Bixolon: <code className="bg-gray-200 px-1 rounded">0x1504</code></p>
                        </div>
                    </div>
                )}

                {/* Network */}
                {currentType === 'network' && (
                    <div className="space-y-4">
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
                            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-800">
                                <p className="font-medium mb-1">Network / LAN Printer Setup</p>
                                <p>Connect to a thermal printer on your local network via its IP address. Most thermal printers use port <strong>9100</strong>. Make sure the printer is on the same WiFi/LAN as the POS device.</p>
                            </div>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <Label>Printer IP Address</Label>
                                <Input
                                    placeholder="e.g., 192.168.1.100"
                                    value={printerConfig.network_ip || ''}
                                    onChange={(e) => setPrinterConfig({ ...printerConfig, network_ip: e.target.value })}
                                    className="mt-1 font-mono"
                                />
                            </div>
                            <div>
                                <Label>Port</Label>
                                <Input
                                    placeholder="9100"
                                    value={printerConfig.network_port || '9100'}
                                    onChange={(e) => setPrinterConfig({ ...printerConfig, network_port: e.target.value })}
                                    className="mt-1 font-mono"
                                />
                            </div>
                        </div>
                        <Button variant="outline" onClick={testNetworkPrinter} className="w-full">
                            <Wifi className="h-4 w-4 mr-2" />
                            Test Network Connection
                        </Button>
                    </div>
                )}

                {/* Shared printer settings */}
                <div className="border-t pt-5 space-y-4">
                    <h4 className="font-semibold text-gray-800">Printer Settings</h4>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <Label>Paper Width</Label>
                            <select
                                value={printerConfig.printer_width || '80mm'}
                                onChange={(e) => setPrinterConfig({ ...printerConfig, printer_width: e.target.value })}
                                className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                            >
                                <option value="58mm">58mm (narrow)</option>
                                <option value="80mm">80mm (standard)</option>
                            </select>
                        </div>
                        <div>
                            <Label>Command Set</Label>
                            <select
                                value={printerConfig.command_set || 'esc_pos'}
                                onChange={(e) => setPrinterConfig({ ...printerConfig, command_set: e.target.value })}
                                className="w-full h-10 mt-1 px-3 rounded-md border border-input bg-transparent text-sm"
                            >
                                <option value="esc_pos">ESC/POS (Epson, most printers)</option>
                                <option value="esc_pos_star">ESC/POS Star</option>
                                <option value="esc_bixolon">Bixolon</option>
                                <option value="epson_tm">Epson TM Series</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <Label>Header Text</Label>
                        <Input
                            placeholder="e.g., Thank you for your order!"
                            value={printerConfig.header_text || ''}
                            onChange={(e) => setPrinterConfig({ ...printerConfig, header_text: e.target.value })}
                            className="mt-1"
                        />
                    </div>
                    <div>
                        <Label>Footer Text</Label>
                        <Input
                            placeholder="e.g., See you soon! Visit us at example.com"
                            value={printerConfig.footer_text || ''}
                            onChange={(e) => setPrinterConfig({ ...printerConfig, footer_text: e.target.value })}
                            className="mt-1"
                        />
                    </div>

                    <div className="space-y-3">
                        {[
                            { key: 'auto_print', label: 'Auto Print', desc: 'Automatically print receipt when order is placed' },
                            { key: 'show_logo', label: 'Show Logo', desc: 'Print restaurant logo on receipt' },
                            { key: 'show_order_number', label: 'Show Order Number', desc: 'Include order number on receipt' },
                            { key: 'show_customer_details', label: 'Show Customer Details', desc: 'Include customer name and phone on receipt' },
                        ].map(({ key, label, desc }) => (
                            <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <p className="font-medium">{label}</p>
                                    <p className="text-sm text-gray-500">{desc}</p>
                                </div>
                                <Switch
                                    checked={printerConfig[key] !== false}
                                    onCheckedChange={(v) => setPrinterConfig({ ...printerConfig, [key]: v })}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <Button onClick={handleSave} disabled={mutation.isPending} className="w-full">
                    <Save className="h-4 w-4 mr-2" />
                    Save Printer Settings
                </Button>
            </CardContent>
        </Card>
    );
}