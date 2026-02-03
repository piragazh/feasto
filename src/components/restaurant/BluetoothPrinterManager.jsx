import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Bluetooth, Printer, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { printerService } from './PrinterService';

export default function BluetoothPrinterManager({ selectedPrinter, onPrinterSelect }) {
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectedDevice, setConnectedDevice] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');

    useEffect(() => {
        // Auto-connect on mount if printer is configured
        if (selectedPrinter?.id) {
            setConnectedDevice({ name: selectedPrinter.name });
            
            // Try to reconnect silently
            if (!printerService.isConnected()) {
                printerService.connect(selectedPrinter, true)
                    .then(() => {
                        setConnectionStatus('connected');
                    })
                    .catch(() => {
                        setConnectionStatus('error');
                    });
            } else {
                setConnectionStatus('connected');
            }
        }

        // Monitor connection status every 10 seconds
        const interval = setInterval(() => {
            if (selectedPrinter?.id) {
                const isConnected = printerService.isConnected();
                setConnectionStatus(isConnected ? 'connected' : 'disconnected');
            }
        }, 10000);

        return () => clearInterval(interval);
    }, [selectedPrinter]);

    const scanForPrinters = async () => {
        if (!navigator.bluetooth) {
            toast.error('Bluetooth not supported on this browser. Use Chrome or Edge.');
            return;
        }

        setIsConnecting(true);
        try {
            console.log('🔍 Scanning for Bluetooth printers...');
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
                    '0000fff0-0000-1000-8000-00805f9b34fb',
                    '0000ffe0-0000-1000-8000-00805f9b34fb', // Sunmi
                    '00001101-0000-1000-8000-00805f9b34fb'  // SPP
                ]
            });

            console.log('✅ Device selected:', device.name, device.id);

            // Store printer info
            const printerInfo = {
                id: device.id,
                name: device.name,
                connectedAt: new Date().toISOString()
            };

            setConnectedDevice(device);
            onPrinterSelect(printerInfo);
            toast.success(`Printer "${device.name}" connected successfully!`);
        } catch (error) {
            console.error('❌ Connection error:', error);
            if (error.name === 'NotFoundError') {
                toast.error('No printer found. Make sure your printer is on and in pairing mode.');
            } else if (error.name === 'NotSupportedError') {
                toast.error('This feature requires HTTPS. Make sure you are using a secure connection.');
            } else {
                toast.error('Failed to connect to printer: ' + error.message);
            }
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnectPrinter = () => {
        printerService.disconnect();
        setConnectedDevice(null);
        setConnectionStatus('disconnected');
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
                <Card className={`p-4 ${
                    connectionStatus === 'connected' ? 'bg-green-50 border-green-200' :
                    connectionStatus === 'error' ? 'bg-red-50 border-red-200' :
                    'bg-yellow-50 border-yellow-200'
                }`}>
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center relative ${
                                connectionStatus === 'connected' ? 'bg-green-500' :
                                connectionStatus === 'error' ? 'bg-red-500' :
                                'bg-yellow-500'
                            }`}>
                                {connectionStatus === 'connected' ? (
                                    <>
                                        <CheckCircle className="h-5 w-5 text-white" />
                                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                                    </>
                                ) : connectionStatus === 'error' ? (
                                    <AlertCircle className="h-5 w-5 text-white" />
                                ) : (
                                    <Bluetooth className="h-5 w-5 text-white animate-pulse" />
                                )}
                            </div>
                            <div>
                                <p className={`font-semibold ${
                                    connectionStatus === 'connected' ? 'text-green-900' :
                                    connectionStatus === 'error' ? 'text-red-900' :
                                    'text-yellow-900'
                                }`}>
                                    {connectionStatus === 'connected' ? '✓ Connected' :
                                     connectionStatus === 'error' ? '✗ Connection Error' :
                                     '↻ Reconnecting...'}
                                </p>
                                <p className={`text-sm mt-1 ${
                                    connectionStatus === 'connected' ? 'text-green-700' :
                                    connectionStatus === 'error' ? 'text-red-700' :
                                    'text-yellow-700'
                                }`}>
                                    {connectedDevice?.name || selectedPrinter?.name || 'Printer'}
                                </p>
                                {selectedPrinter?.connectedAt && (
                                    <p className="text-xs text-gray-600 mt-1">
                                        First paired: {new Date(selectedPrinter.connectedAt).toLocaleDateString()}
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