import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Link2, Copy, ExternalLink, Bot, Unplug, AlertTriangle } from 'lucide-react';
import { waAdmin, runEmbeddedSignup, waLink } from './whatsappApi';

export default function WhatsAppConnectionPanel({ restaurant, config, channel, onChanged }) {
    const [connecting, setConnecting] = useState(false);
    const [coexistence, setCoexistence] = useState(false);
    const [welcome, setWelcome] = useState(channel?.welcome_message || '');
    const [saving, setSaving] = useState(false);
    const [manual, setManual] = useState({ waba_id: '', phone_number_id: '', access_token: '' });
    const [showManual, setShowManual] = useState(false);

    useEffect(() => { setWelcome(channel?.welcome_message || ''); }, [channel?.id, channel?.welcome_message]);

    const connected = channel?.status === 'connected';
    const link = waLink(channel?.display_phone_number);

    const connect = async () => {
        if (!config?.app_id || !config?.config_id) {
            toast.error('WhatsApp app settings are missing. Ask MealDrop support to finish setup.');
            return;
        }
        setConnecting(true);
        try {
            const session = await runEmbeddedSignup({
                appId: config.app_id, configId: config.config_id, version: config.graph_version, coexistence,
            });
            const res = await waAdmin('complete_signup', { restaurant_id: restaurant.id, ...session });
            if (res.warning) toast.warning(res.warning);
            toast.success(`WhatsApp connected: ${res.channel.display_phone_number}`);
            onChanged();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setConnecting(false);
        }
    };

    const connectManual = async () => {
        setConnecting(true);
        try {
            const res = await waAdmin('connect_manual', { restaurant_id: restaurant.id, ...manual });
            toast.success(`Connected ${res.channel.display_phone_number}`);
            setManual({ waba_id: '', phone_number_id: '', access_token: '' });
            onChanged();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setConnecting(false);
        }
    };

    const update = async (patch) => {
        setSaving(true);
        try {
            await waAdmin('update_channel', { channel_id: channel.id, ...patch });
            toast.success('Saved');
            onChanged();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    const disconnect = async () => {
        if (!window.confirm('Disconnect this WhatsApp number? Customers will stop getting replies.')) return;
        try {
            await waAdmin('disconnect', { channel_id: channel.id });
            toast.success('Disconnected');
            onChanged();
        } catch (e) {
            toast.error(e.message);
        }
    };

    const copy = (text) => {
        navigator.clipboard?.writeText(text).then(() => toast.success('Copied'), () => {});
    };

    return (
        <div className="space-y-4">
            {/* Status */}
            <div className="bg-white border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">WhatsApp number</p>
                        {connected ? (
                            <>
                                <p className="text-xl font-bold text-gray-900 mt-1">{channel.display_phone_number}</p>
                                <p className="text-sm text-gray-500">{channel.verified_name}{channel.coexistence ? ' · also on WhatsApp Business app' : ''}</p>
                            </>
                        ) : (
                            <p className="text-sm text-gray-600 mt-1">Not connected. Connect {restaurant.name}'s own number so customers can order by WhatsApp.</p>
                        )}
                    </div>
                    <Badge className={connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>
                        {connected ? 'Connected' : channel?.status === 'disconnected' ? 'Disconnected' : 'Not connected'}
                    </Badge>
                </div>

                {connected && link && (
                    <div className="mt-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                        <Link2 className="h-4 w-4 text-green-700 shrink-0" />
                        <span className="text-sm text-green-900 truncate flex-1">{link}</span>
                        <Button size="sm" variant="ghost" onClick={() => copy(link)} aria-label="Copy link"><Copy className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" asChild><a href={link} target="_blank" rel="noreferrer" aria-label="Open link"><ExternalLink className="h-4 w-4" /></a></Button>
                    </div>
                )}
                {connected && (
                    <p className="text-xs text-gray-500 mt-2">Put this link on your website, menus, flyers and a QR code at the counter.</p>
                )}

                {!connected && (
                    <div className="mt-4 space-y-3">
                        {config && !config.ready && (
                            <div className="flex gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>The MealDrop WhatsApp app isn't fully configured yet (app ID, secret, signup config, verify token).</span>
                            </div>
                        )}
                        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                            <Checkbox checked={coexistence} onCheckedChange={(v) => setCoexistence(!!v)} className="mt-0.5" />
                            <span>This number is already on the <b>WhatsApp Business app</b> and we want to keep using the app on our phone.</span>
                        </label>
                        <Button onClick={connect} disabled={connecting} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                            {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Connect WhatsApp
                        </Button>
                        <p className="text-xs text-gray-500">
                            You'll log in with Facebook, choose or create the business, and verify the restaurant's number by SMS or call.
                            WhatsApp charges for messaging are billed to the restaurant's own Meta account.
                        </p>
                    </div>
                )}
            </div>

            {/* Settings */}
            {connected && (
                <div className="bg-white border rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <Bot className="h-5 w-5 text-green-600 mt-0.5" />
                            <div>
                                <Label className="text-sm font-semibold">AI ordering assistant</Label>
                                <p className="text-xs text-gray-500">Answers customers and takes orders. When off, every message waits in the inbox for staff.</p>
                            </div>
                        </div>
                        <Switch checked={channel.ai_enabled !== false} disabled={saving} onCheckedChange={(v) => update({ ai_enabled: v })} />
                    </div>
                    <div>
                        <Label className="text-sm font-semibold">Welcome message</Label>
                        <Textarea
                            className="mt-1.5" rows={3} maxLength={900} value={welcome}
                            onChange={(e) => setWelcome(e.target.value)}
                            placeholder={`Hi! 👋 Welcome to ${restaurant.name}. Tell me what you'd like, or browse the menu.`}
                        />
                        <div className="flex justify-end mt-2">
                            <Button size="sm" variant="outline" disabled={saving || welcome === (channel.welcome_message || '')} onClick={() => update({ welcome_message: welcome })}>
                                Save message
                            </Button>
                        </div>
                    </div>
                    <div className="pt-2 border-t flex justify-end">
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={disconnect}>
                            <Unplug className="h-4 w-4 mr-1.5" /> Disconnect number
                        </Button>
                    </div>
                </div>
            )}

            {/* Admin-only: platform setup + manual connection for testing */}
            {config?.is_admin && (
                <div className="bg-gray-50 border border-dashed rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Platform setup (admins only)</p>
                    <div className="text-sm text-gray-700">
                        Webhook URL for the Meta app:
                        <div className="flex items-center gap-2 mt-1">
                            <code className="text-xs bg-white border rounded px-2 py-1 truncate flex-1">{config.webhook_url}</code>
                            <Button size="sm" variant="ghost" onClick={() => copy(config.webhook_url)} aria-label="Copy webhook URL"><Copy className="h-4 w-4" /></Button>
                        </div>
                    </div>
                    <button type="button" className="text-sm text-green-700 underline" onClick={() => setShowManual((v) => !v)}>
                        {showManual ? 'Hide' : 'Connect a number manually'} (test number or system-user token)
                    </button>
                    {showManual && (
                        <div className="grid gap-2">
                            <Input placeholder="WhatsApp Business Account ID" value={manual.waba_id} onChange={(e) => setManual({ ...manual, waba_id: e.target.value.trim() })} />
                            <Input placeholder="Phone number ID" value={manual.phone_number_id} onChange={(e) => setManual({ ...manual, phone_number_id: e.target.value.trim() })} />
                            <Input type="password" placeholder="Access token" value={manual.access_token} onChange={(e) => setManual({ ...manual, access_token: e.target.value.trim() })} />
                            <Button size="sm" onClick={connectManual} disabled={connecting || !manual.phone_number_id || !manual.access_token}>Connect</Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
