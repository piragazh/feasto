import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Clock, Tag, MessageSquare, CheckCircle2, AlertCircle, Loader2, Play, Settings, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const DEFAULT_TEMPLATE = `Hi [NAME] 👋\n\nWe miss you! It's been [DAYS] days since your last order.\n\nHere's a special offer just for you 🎁\nUse code [COUPON_CODE] for [DISCOUNT] off your next order!\n\nValid for 14 days only. Don't miss out!`;

export default function WinBackAutomationSettings({ restaurantId, restaurantName }) {
    const queryClient = useQueryClient();

    const { data: configs = [], isLoading } = useQuery({
        queryKey: ['winback-automation', restaurantId],
        queryFn: () => base44.entities.WinBackAutomation.filter({ restaurant_id: restaurantId }),
    });

    const config = configs[0] || null;

    const [form, setForm] = useState({
        is_enabled: false,
        inactivity_days: 60,
        coupon_type: 'percentage',
        coupon_value: 15,
        coupon_validity_days: 14,
        channel: 'whatsapp',
        message_template: DEFAULT_TEMPLATE,
        email_subject: 'We Miss You — Here\'s a Special Offer 🎁',
    });

    // Sync form when config loads
    useEffect(() => {
        if (config) {
            setForm({
                is_enabled: config.is_enabled ?? false,
                inactivity_days: config.inactivity_days ?? 60,
                coupon_type: config.coupon_type ?? 'percentage',
                coupon_value: config.coupon_value ?? 15,
                coupon_validity_days: config.coupon_validity_days ?? 14,
                channel: config.channel ?? 'whatsapp',
                message_template: config.message_template || DEFAULT_TEMPLATE,
                email_subject: config.email_subject || 'We Miss You — Here\'s a Special Offer 🎁',
            });
        }
    }, [config]);

    const saveMutation = useMutation({
        mutationFn: async (data) => {
            if (config) {
                return base44.entities.WinBackAutomation.update(config.id, data);
            } else {
                return base44.entities.WinBackAutomation.create({ ...data, restaurant_id: restaurantId });
            }
        },
        onSuccess: () => {
            toast.success('Automation settings saved');
            queryClient.invalidateQueries(['winback-automation', restaurantId]);
        },
        onError: (e) => toast.error('Failed to save: ' + e.message),
    });

    const runNowMutation = useMutation({
        mutationFn: async () => {
            const resp = await base44.functions.invoke('autoWinBackCampaign', { restaurant_id: restaurantId });
            return resp.data;
        },
        onSuccess: (data) => {
            const s = data?.summary?.[0] || {};
            toast.success(`Run complete — sent ${s.sent ?? 0}, skipped ${s.skipped ?? 0}`);
            queryClient.invalidateQueries(['winback-automation', restaurantId]);
        },
        onError: (e) => toast.error('Run failed: ' + e.message),
    });

    const resetContactedMutation = useMutation({
        mutationFn: async () => {
            if (!config) return;
            return base44.entities.WinBackAutomation.update(config.id, { contacted_customer_keys: [] });
        },
        onSuccess: () => {
            toast.success('Contacted list cleared — all eligible customers will be included next run');
            queryClient.invalidateQueries(['winback-automation', restaurantId]);
        },
        onError: (e) => toast.error('Failed: ' + e.message),
    });

    const handleToggle = (enabled) => {
        const updated = { ...form, is_enabled: enabled };
        setForm(updated);
        saveMutation.mutate(updated);
    };

    const handleSave = () => saveMutation.mutate(form);

    const previewMessage = form.message_template
        .replace(/\[NAME\]/g, 'Alex')
        .replace(/\[DAYS\]/g, form.inactivity_days)
        .replace(/\[DISCOUNT\]/g, form.coupon_type === 'percentage' ? `${form.coupon_value}%` : `£${form.coupon_value}`)
        .replace(/\[COUPON_CODE\]/g, 'WB-XXXXXX')
        .replace(/\[OFFER\]/g, form.coupon_type === 'percentage' ? `${form.coupon_value}% off` : `£${form.coupon_value} off`)
        .replace(/\[RESTAURANT_LINK\]/g, restaurantName);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Status header */}
            <Card className={`border-l-4 ${form.is_enabled ? 'border-l-green-500' : 'border-l-gray-300'}`}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Zap className={`h-5 w-5 ${form.is_enabled ? 'text-green-500' : 'text-gray-400'}`} />
                            Automated Win-Back Engine
                        </CardTitle>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">{form.is_enabled ? 'Active' : 'Paused'}</span>
                            <Switch
                                checked={form.is_enabled}
                                onCheckedChange={handleToggle}
                                disabled={saveMutation.isPending}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <p className="text-sm text-gray-600 mb-4">
                        Automatically identifies customers who haven't ordered in <strong>{form.inactivity_days} days</strong> and sends them a personalised "We Miss You" message with a unique one-time coupon — runs daily at 10am.
                    </p>

                    {/* Last run stats */}
                    {config?.last_run_at && (
                        <div className="flex flex-wrap gap-3 mb-4">
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border">
                                <Clock className="h-3.5 w-3.5" />
                                Last run: {format(new Date(config.last_run_at), 'dd MMM yyyy, HH:mm')}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {config.last_run_sent} sent
                            </div>
                            {config.last_run_skipped > 0 && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    {config.last_run_skipped} opted out
                                </div>
                            )}
                            <div className="flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 px-3 py-1.5 rounded-full border border-purple-200">
                                <MessageSquare className="h-3.5 w-3.5" />
                                {config.total_sent_all_time || 0} all-time
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => runNowMutation.mutate()}
                            disabled={runNowMutation.isPending || !config}
                            className="text-xs"
                        >
                            {runNowMutation.isPending ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Running...</>
                            ) : (
                                <><Play className="h-3.5 w-3.5 mr-1.5" />Run Now</>
                            )}
                        </Button>
                        {config?.contacted_customer_keys?.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resetContactedMutation.mutate()}
                                disabled={resetContactedMutation.isPending}
                                className="text-xs text-orange-600 border-orange-200 hover:bg-orange-50"
                            >
                                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                Reset Contacted List ({config.contacted_customer_keys.length})
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Configuration */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Settings className="h-4 w-4" />
                        Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* Trigger */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                                Inactivity Threshold (days)
                            </Label>
                            <Input
                                type="number" min={7} max={365}
                                value={form.inactivity_days}
                                onChange={e => setForm(f => ({ ...f, inactivity_days: parseInt(e.target.value) || 60 }))}
                            />
                            <p className="text-xs text-gray-500 mt-1">Recommended: 60 days for "At Risk"</p>
                        </div>
                        <div>
                            <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                                Delivery Channel
                            </Label>
                            <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                    <SelectItem value="sms">SMS</SelectItem>
                                    <SelectItem value="email">Email</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Coupon */}
                    <div className="border rounded-lg p-4 bg-orange-50 space-y-3">
                        <Label className="flex items-center gap-2 text-sm font-semibold">
                            <Tag className="h-4 w-4 text-orange-500" />
                            One-Time Win-Back Coupon
                        </Label>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <Label className="text-xs mb-1 block">Type</Label>
                                <Select value={form.coupon_type} onValueChange={v => setForm(f => ({ ...f, coupon_type: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="percentage">% Off</SelectItem>
                                        <SelectItem value="fixed">£ Off</SelectItem>
                                        <SelectItem value="free_delivery">Free Delivery</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.coupon_type !== 'free_delivery' && (
                                <div>
                                    <Label className="text-xs mb-1 block">
                                        {form.coupon_type === 'percentage' ? 'Discount %' : 'Amount (£)'}
                                    </Label>
                                    <Input
                                        type="number" min={1}
                                        value={form.coupon_value}
                                        onChange={e => setForm(f => ({ ...f, coupon_value: parseFloat(e.target.value) || 0 }))}
                                    />
                                </div>
                            )}
                            <div>
                                <Label className="text-xs mb-1 block">Valid for (days)</Label>
                                <Input
                                    type="number" min={1} max={90}
                                    value={form.coupon_validity_days}
                                    onChange={e => setForm(f => ({ ...f, coupon_validity_days: parseInt(e.target.value) || 14 }))}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-orange-700">
                            ✓ A unique, single-use coupon is auto-generated for each customer
                        </p>
                    </div>

                    {/* Email subject (only for email channel) */}
                    {form.channel === 'email' && (
                        <div>
                            <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">Email Subject</Label>
                            <Input
                                value={form.email_subject}
                                onChange={e => setForm(f => ({ ...f, email_subject: e.target.value }))}
                                placeholder="We Miss You — Here's a Special Offer 🎁"
                            />
                        </div>
                    )}

                    {/* Message Template */}
                    <div>
                        <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">Message Template</Label>
                        <Textarea
                            value={form.message_template}
                            onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                            rows={6}
                            className="text-sm font-mono"
                        />
                        <p className="text-xs text-gray-500 mt-1.5">
                            Placeholders: <code className="bg-gray-100 px-1 rounded">[NAME]</code>{' '}
                            <code className="bg-gray-100 px-1 rounded">[DAYS]</code>{' '}
                            <code className="bg-gray-100 px-1 rounded">[DISCOUNT]</code>{' '}
                            <code className="bg-gray-100 px-1 rounded">[COUPON_CODE]</code>{' '}
                            <code className="bg-gray-100 px-1 rounded">[OFFER]</code>
                        </p>
                    </div>

                    {/* Preview */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Preview (for "Alex", {form.inactivity_days} days inactive)</p>
                        <div className="bg-white border rounded p-3 text-sm whitespace-pre-wrap text-gray-700 max-h-40 overflow-y-auto">
                            {previewMessage}
                        </div>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={saveMutation.isPending}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    >
                        {saveMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
                        ) : (
                            'Save Automation Settings'
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}