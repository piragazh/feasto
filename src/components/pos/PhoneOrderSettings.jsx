import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Phone, Usb, Wifi, Save, Info } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

export default function PhoneOrderSettings({ restaurantId }) {
    const storageKey = `pos_phone_settings_${restaurantId}`;

    const [settings, setSettings] = useState({
        cid_enabled: false,
        cid_type: 'usb', // 'usb' | 'voip'
        cid_baud: 9600,
        voip_webhook_url: '',
    });
    const [serialSupported] = useState('serial' in navigator);

    useEffect(() => {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            try { setSettings(JSON.parse(stored)); } catch {}
        }
    }, [storageKey]);

    const save = () => {
        localStorage.setItem(storageKey, JSON.stringify(settings));
        toast.success('Phone order settings saved');
    };

    const requestSerialPort = async () => {
        if (!serialSupported) {
            toast.error('Web Serial API not supported in this browser. Use Chrome or Edge.');
            return;
        }
        try {
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: settings.cid_baud });
            toast.success('CID device connected! You may now close this modal.');
        } catch (e) {
            if (e.name !== 'NotFoundError') toast.error(`Could not connect: ${e.message}`);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Phone Order (CID / VoIP) Settings
                </CardTitle>
                <CardDescription>
                    Configure caller ID integration so incoming phone numbers are automatically detected and customers are looked up.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* Enable CID */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-semibold">Enable Caller ID (CID)</p>
                        <p className="text-xs text-gray-500">Automatically detect incoming calls and look up customers</p>
                    </div>
                    <button
                        onClick={() => setSettings(s => ({ ...s, cid_enabled: !s.cid_enabled }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.cid_enabled ? 'bg-orange-500' : 'bg-gray-200'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.cid_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {settings.cid_enabled && (
                    <>
                        {/* CID Type */}
                        <div>
                            <p className="text-sm font-semibold mb-2">CID Integration Type</p>
                            <div className="flex gap-3">
                                {[
                                    { id: 'usb', label: 'USB CID Modem', icon: Usb, desc: 'Hardware USB caller ID device' },
                                    { id: 'voip', label: 'VoIP Webhook', icon: Wifi, desc: 'VoIP phone system webhook' },
                                ].map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setSettings(s => ({ ...s, cid_type: opt.id }))}
                                        className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-colors ${
                                            settings.cid_type === opt.id
                                                ? 'border-orange-400 bg-orange-50 text-orange-700'
                                                : 'border-gray-200 text-gray-600 hover:border-orange-200'
                                        }`}
                                    >
                                        <opt.icon className="h-5 w-5" />
                                        {opt.label}
                                        <span className="font-normal text-gray-400">{opt.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* USB CID config */}
                        {settings.cid_type === 'usb' && (
                            <div className="space-y-3 rounded-xl border p-3 bg-gray-50">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Baud Rate</label>
                                    <select
                                        value={settings.cid_baud}
                                        onChange={e => setSettings(s => ({ ...s, cid_baud: Number(e.target.value) }))}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                                    >
                                        {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                    <p className="text-xs text-gray-400 mt-1">Most USB CID devices use 9600 baud</p>
                                </div>
                                <div className={`flex items-start gap-2 text-xs p-2 rounded-lg ${serialSupported ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                                    <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                    {serialSupported
                                        ? 'Web Serial is supported. Click below to pair your CID modem.'
                                        : 'Web Serial API not available. Please use Google Chrome or Microsoft Edge.'}
                                </div>
                                {serialSupported && (
                                    <Button size="sm" variant="outline" onClick={requestSerialPort} className="w-full">
                                        <Usb className="h-4 w-4 mr-2" /> Pair USB CID Device
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* VoIP Webhook config */}
                        {settings.cid_type === 'voip' && (
                            <div className="space-y-3 rounded-xl border p-3 bg-gray-50">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">VoIP Webhook Poll URL</label>
                                    <input
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                        placeholder="https://your-voip-system.com/api/incoming-call"
                                        value={settings.voip_webhook_url}
                                        onChange={e => setSettings(s => ({ ...s, voip_webhook_url: e.target.value }))}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        The POS will poll this URL every 3 seconds. It should return: <code className="bg-gray-100 px-1 rounded">{'{"incoming_call": true, "phone": "07xxx..."}'}</code>
                                    </p>
                                </div>
                                <div className="flex items-start gap-2 text-xs bg-blue-50 text-blue-700 p-2 rounded-lg">
                                    <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                    Configure your VoIP system (3CX, FreePBX, etc.) to expose an API endpoint with the caller's number. The POS will auto-detect incoming calls and look up the customer.
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Manual fallback note */}
                <div className="flex items-start gap-2 text-xs bg-gray-50 text-gray-500 p-3 rounded-xl border">
                    <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    Even without CID, staff can always manually search customers by phone number or postcode directly in the Phone Order panel on the POS terminal.
                </div>

                <Button onClick={save} className="w-full bg-orange-500 hover:bg-orange-600">
                    <Save className="h-4 w-4 mr-2" /> Save Settings
                </Button>
            </CardContent>
        </Card>
    );
}