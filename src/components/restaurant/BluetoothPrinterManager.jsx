import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Bluetooth, Printer, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function BluetoothPrinterManager({ selectedPrinter, onPrinterSelect }) {
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectedDevice, setConnectedDevice] = useState(null);

    useEffect(() => {
        // Try to reconnect to saved printer on mount
        if (selectedPrinter?.deviceId) {
            reconnectPrinter();
        }
    }, []);

    const reconnectPrinter = async () => {
        try {
            const devices = await navigator.bluetooth.getDevices();
            const savedDevice = devices.find(d => d.id === selectedPrinter.deviceId);
            if (savedDevice) {
                setConnectedDevice(savedDevice);
            }
        } catch (error) {
            console.log('Could not reconnect to saved printer');
        }
    };

    const scanForPrinters = async () => {
        if (!navigator.bluetooth) {
            toast.error('Bluetooth not supported on this browser. Use Chrome or Edge.');
            return;
        }

        setIsConnecting(true);
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Thermal printer service
                ],
                optionalServices: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] // Additional printer services
            });

            // Store printer info
            const printerInfo = {
                deviceId: device.id,
                deviceName: device.name,
                connectedAt: new Date().toISOString()
            };

            setConnectedDevice(device);
            onPrinterSelect(printerInfo);
            toast.success(`Printer "${device.name}" connected successfully!`);
        } catch (error) {
            if (error.name === 'NotFoundError') {
                toast.error('No printer found. Make sure your printer is on and in pairing mode.');
            } else {
                toast.error('Failed to connect to printer: ' + error.message);
            }
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnectPrinter = () => {
        setConnectedDevice(null);
        onPrinterSelect(null);
        toast.success('Printer disconnected');
    };

    return (
        <div className="space-y-4">
            <div>
                <Label className="text-base font-semibold mb-2 block">Bluetooth Printer</Label>
                <p className="text-sm text-gray-600 mb-4">
                    Connect to a Bluetooth thermal printer for automatic receipt printing
                </p>
            </div>

            {connectedDevice || selectedPrinter ? (
                <Card className="p-4 bg-green-50 border-green-200">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                                <CheckCircle className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="font-semibold text-green-900">
                                    {connectedDevice?.name || selectedPrinter?.deviceName || 'Printer Connected'}
                                </p>
                                <p className="text-sm text-green-700 mt-1">
                                    Ready to print receipts
                                </p>
                                {selectedPrinter?.connectedAt && (
                                    <p className="text-xs text-green-600 mt-1">
                                        Connected: {new Date(selectedPrinter.connectedAt).toLocaleDateString()}
                                    </p>
                                )}
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={disconnectPrinter}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                            Disconnect
                        </Button>
                    </div>
                </Card>
            ) : (
                <Card className="p-4 bg-gray-50 border-gray-200">
                    <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 bg-gray-300 rounded-lg flex items-center justify-center">
                            <AlertCircle className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                            <p className="font-semibold text-gray-900">No Printer Connected</p>
                            <p className="text-sm text-gray-600 mt-1">
                                Connect a Bluetooth thermal printer to enable printing
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={scanForPrinters}
                        disabled={isConnecting}
                        className="w-full"
                    >
                        {isConnecting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                Scanning...
                            </>
                        ) : (
                            <>
                                <Bluetooth className="h-4 w-4 mr-2" />
                                Scan for Printers
                            </>
                        )}
                    </Button>
                </Card>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                    <Printer className="h-4 w-4" />
                    Setup Instructions
                </h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Turn on your Bluetooth thermal printer</li>
                    <li>Put the printer in pairing mode (check manual)</li>
                    <li>Click "Scan for Printers" button above</li>
                    <li>Select your printer from the list</li>
                    <li>Enable "Auto Print" to print receipts automatically</li>
                </ol>
            </div>
        </div>
    );
}