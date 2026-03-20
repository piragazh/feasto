import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Mail, MessageSquare, Send, Wand2, Loader2, Percent, Smartphone, Eye, ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';

const AI_TEMPLATES = [
    { label: 'Win-Back', goal: 'win_back', prompt: 'Write a warm, friendly re-engagement promotion to win back a customer who has not ordered in 60+ days. Include a sense of urgency and a special offer.' },
    { label: 'VIP Loyalty Reward', goal: 'vip_reward', prompt: 'Write an exclusive, premium-feeling loyalty reward message for a top-spending VIP customer. Make them feel special.' },
    { label: 'New Customer Welcome', goal: 'welcome', prompt: 'Write a warm welcome message for a new customer with their first discount offer.' },
    { label: 'Weekend Special', goal: 'weekend', prompt: 'Write an exciting weekend food promotion encouraging ordering this weekend. Be energetic and fun.' },
    { label: 'Seasonal Offer', goal: 'seasonal', prompt: 'Write a seasonal promotional message for a restaurant. Be festive and relevant to the current season.' },
    { label: 'Upsell Bundle', goal: 'upsell', prompt: 'Write a promotional message about a food bundle deal — encouraging customers to add sides, drinks or desserts to their order.' },
];

export default function CRMCampaignDialog({ open, onClose, targetSegment, segmentConfig, restaurantName, coupon }) {
    const [channel, setChannel] = useState('email');
    const [offerType, setOfferType] = useState(() => {
        if (!coupon) return 'message';
        if (coupon.discount_type === 'percentage') return 'discount';
        if (coupon.discount_type === 'free_delivery') return 'freeDelivery';
        if (coupon.discount_type === 'free_item') return 'freeItem';
        if (coupon.discount_type === 'buy_one_get_one') return 'bogo';
        if (coupon.discount_type === 'fixed') return 'fixedDiscount';
        return 'message';
    });
    const [subject, setSubject] = useState('');
    const [textBody, setTextBody] = useState('');
    const [discountValue, setDiscountValue] = useState(coupon?.discount_value?.toString() || '');
    const [aiLoading, setAiLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [sending, setSending] = useState(false);
    const [preview, setPreview] = useState(false);

    const segmentLabel = targetSegment?.segment === 'all'
        ? 'All Customers'
        : segmentConfig[targetSegment?.segment]?.label || '';

    const recipientCount = targetSegment?.count || 0;
    const emailRecipients = targetSegment?.recipients?.filter(r => r.email?.includes('@'))?.length || 0;
    const smsRecipients = targetSegment?.recipients?.filter(r => r.phone)?.length || 0;

    const generateWithAI = async (templateGoal) => {
        setAiLoading(true);
        try {
            const templateConfig = AI_TEMPLATES.find(t => t.goal === templateGoal);
            const basePrompt = templateConfig?.prompt || 'Write a general promotional message.';

            const prompt = `You are a marketing copywriter for a restaurant called "${restaurantName}".

${basePrompt}

Channel: ${channel === 'email' ? 'Email' : channel === 'sms' ? 'SMS (max 160 chars)' : 'WhatsApp message'}
Offer type: ${offerType === 'discount' ? `${discountValue}% discount` : offerType === 'freeDelivery' ? 'Free delivery' : 'No specific offer'}
Segment: ${segmentLabel}

${channel === 'email' ? `Return JSON with fields:
- subject: compelling email subject line
- body: full email body (plain text, professional, warm, ~150 words)` : `Return JSON with fields:
- body: the message text (${channel === 'sms' ? 'concise, max 160 chars' : 'friendly WhatsApp tone, max 300 chars'})`}

Make it personal, action-oriented, and on-brand.`;

            const result = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: {
                    type: 'object',
                    properties: {
                        subject: { type: 'string' },
                        body: { type: 'string' },
                    }
                }
            });

            if (result.subject) setSubject(result.subject);
            if (result.body) setTextBody(result.body);
            toast.success('AI template generated!');
        } catch (e) {
            toast.error('Failed to generate template');
        } finally {
            setAiLoading(false);
        }
    };

    const buildHtmlEmail = () => {
        const couponBadge = coupon
            ? `<div style="border:2px dashed #f97316;border-radius:8px;padding:12px;text-align:center;margin:16px 0;background:#fff7ed;">
                 <div style="font-size:12px;color:#9a3412;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Use Code</div>
                 <div style="font-size:26px;font-weight:900;letter-spacing:4px;color:#ea580c;font-family:monospace;">${coupon.code}</div>
               </div>`
            : '';
        const offerBanner = offerType === 'discount'
            ? `<div style="background:#f97316;color:white;padding:16px;text-align:center;font-size:22px;font-weight:bold;border-radius:8px;margin:16px 0;">${discountValue}% OFF your next order!</div>`
            : offerType === 'fixedDiscount'
            ? `<div style="background:#f97316;color:white;padding:16px;text-align:center;font-size:22px;font-weight:bold;border-radius:8px;margin:16px 0;">£${discountValue} OFF your next order!</div>`
            : offerType === 'freeDelivery'
            ? `<div style="background:#10b981;color:white;padding:16px;text-align:center;font-size:22px;font-weight:bold;border-radius:8px;margin:16px 0;">🚚 FREE DELIVERY on your next order!</div>`
            : offerType === 'freeItem'
            ? `<div style="background:#ec4899;color:white;padding:16px;text-align:center;font-size:22px;font-weight:bold;border-radius:8px;margin:16px 0;">🎁 FREE ITEM with your next order!</div>`
            : offerType === 'bogo'
            ? `<div style="background:#7c3aed;color:white;padding:16px;text-align:center;font-size:22px;font-weight:bold;border-radius:8px;margin:16px 0;">🛍️ BUY ONE GET ONE FREE!</div>`
            : '';

        return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <tr><td style="background:#f97316;padding:28px;text-align:center;">
        <h1 style="margin:0;color:white;font-size:24px;">${restaurantName}</h1>
      </td></tr>
      <tr><td style="padding:32px;">
        ${offerBanner}
        <div style="color:#333;font-size:15px;line-height:1.6;white-space:pre-line;">${textBody}</div>
        <div style="margin-top:28px;text-align:center;">
          <a href="#" style="background:#f97316;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">Order Now →</a>
        </div>
      </td></tr>
      <tr><td style="background:#f5f5f5;padding:16px;text-align:center;color:#999;font-size:12px;">
        © ${new Date().getFullYear()} ${restaurantName}. You're receiving this because you've ordered with us.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
    };

    const handleSend = async () => {
        if (!textBody.trim()) { toast.error('Please write a message'); return; }
        if (channel === 'email' && !subject.trim()) { toast.error('Please add an email subject'); return; }

        setSending(true);
        try {
            const recipients = targetSegment?.recipients || [];
            const result = await base44.functions.invoke('sendCRMCampaign', {
                channel,
                recipients,
                subject,
                htmlBody: channel === 'email' ? buildHtmlEmail() : undefined,
                textBody,
            });

            toast.success(`✅ Sent to ${result.data?.sent || 0} customers${result.data?.failed > 0 ? `, ${result.data.failed} failed` : ''}`);
            onClose();
        } catch (e) {
            toast.error('Failed to send campaign: ' + e.message);
        } finally {
            setSending(false);
        }
    };

    const channelIcon = { email: Mail, sms: Smartphone, whatsapp: MessageSquare };
    const ChannelIcon = channelIcon[channel] || Mail;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5 text-orange-500" />
                        Send Campaign
                    </DialogTitle>
                    <DialogDescription>
                        {segmentLabel} · <span className="font-semibold">{recipientCount}</span> customers
                        {channel === 'email' && <> · <span className="text-blue-600">{emailRecipients} emails</span></>}
                        {(channel === 'sms' || channel === 'whatsapp') && <> · <span className="text-green-600">{smsRecipients} phone numbers</span></>}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    {/* Channel Selector */}
                    <div>
                        <Label className="mb-2 block">Channel</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { key: 'email', label: 'Email', icon: Mail, color: 'text-blue-600' },
                                { key: 'sms', label: 'SMS', icon: Smartphone, color: 'text-green-600' },
                                { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-600' },
                            ].map(ch => (
                                <button
                                    key={ch.key}
                                    onClick={() => setChannel(ch.key)}
                                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                                        channel === ch.key
                                            ? 'border-orange-500 bg-orange-50 text-orange-600'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                    }`}
                                >
                                    <ch.icon className={`h-4 w-4 ${channel === ch.key ? 'text-orange-500' : ch.color}`} />
                                    {ch.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Offer Type */}
                    {coupon && (
                        <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                            <Tag className="h-4 w-4 text-orange-500 flex-shrink-0" />
                            <span className="text-orange-700 font-medium">Promoting coupon: <span className="font-mono font-bold">{coupon.code}</span></span>
                        </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { key: 'message', label: '💬 Message Only' },
                            { key: 'discount', label: '% Discount' },
                            { key: 'fixedDiscount', label: '£ Off' },
                            { key: 'freeDelivery', label: '🚚 Free Delivery' },
                            { key: 'freeItem', label: '🎁 Free Item' },
                            { key: 'bogo', label: 'Buy 1 Get 1' },
                        ].map(o => (
                            <button
                                key={o.key}
                                onClick={() => setOfferType(o.key)}
                                className={`p-2 rounded-lg border text-xs font-semibold transition-all ${
                                    offerType === o.key ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-600'
                                }`}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>

                    {offerType === 'discount' && (
                        <div>
                            <Label>Discount %</Label>
                            <Input
                                type="number" min="1" max="100"
                                placeholder="e.g. 20"
                                value={discountValue}
                                onChange={e => setDiscountValue(e.target.value)}
                                className="mt-1 w-40"
                            />
                        </div>
                    )}
                    {offerType === 'fixedDiscount' && (
                        <div>
                            <Label>Amount Off (£)</Label>
                            <Input
                                type="number" min="0" step="0.01"
                                placeholder="e.g. 5.00"
                                value={discountValue}
                                onChange={e => setDiscountValue(e.target.value)}
                                className="mt-1 w-40"
                            />
                        </div>
                    )}

                    {/* AI Template Generator */}
                    <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
                        <div className="flex items-center gap-2 mb-3">
                            <Wand2 className="h-4 w-4 text-purple-600" />
                            <span className="font-semibold text-purple-800 text-sm">AI Template Generator</span>
                            {aiLoading && <Loader2 className="h-4 w-4 animate-spin text-purple-600" />}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {AI_TEMPLATES.map(t => (
                                <button
                                    key={t.goal}
                                    onClick={() => { setSelectedTemplate(t.goal); generateWithAI(t.goal); }}
                                    disabled={aiLoading}
                                    className={`text-xs px-3 py-2 rounded-lg border font-medium transition-all ${
                                        selectedTemplate === t.goal
                                            ? 'bg-purple-600 text-white border-purple-600'
                                            : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-100'
                                    }`}
                                >
                                    {aiLoading && selectedTemplate === t.goal ? (
                                        <span className="flex items-center gap-1 justify-center"><Loader2 className="h-3 w-3 animate-spin" /> Generating...</span>
                                    ) : t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Email Subject */}
                    {channel === 'email' && (
                        <div>
                            <Label>Subject Line</Label>
                            <Input
                                placeholder="e.g. A special offer just for you 🎁"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                    )}

                    {/* Message Body */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <Label>Message</Label>
                            {(channel === 'sms' || channel === 'whatsapp') && (
                                <span className={`text-xs ${textBody.length > 160 && channel === 'sms' ? 'text-red-500' : 'text-gray-400'}`}>
                                    {textBody.length}{channel === 'sms' ? '/160' : ''} chars
                                </span>
                            )}
                        </div>
                        <Textarea
                            placeholder={
                                channel === 'email'
                                    ? 'Write your email body here...'
                                    : channel === 'sms'
                                    ? 'Write your SMS message (max 160 chars)...'
                                    : 'Write your WhatsApp message...'
                            }
                            value={textBody}
                            onChange={e => setTextBody(e.target.value)}
                            rows={6}
                        />
                    </div>

                    {/* Email Preview */}
                    {channel === 'email' && textBody && (
                        <div>
                            <button
                                onClick={() => setPreview(!preview)}
                                className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                            >
                                <Eye className="h-4 w-4" />
                                {preview ? 'Hide' : 'Preview'} Email
                                {preview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {preview && (
                                <div className="mt-2 border rounded-lg overflow-hidden" style={{ maxHeight: 400 }}>
                                    <iframe
                                        srcDoc={buildHtmlEmail()}
                                        style={{ width: '100%', height: 400, border: 'none' }}
                                        title="Email Preview"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
                        <Button
                            onClick={handleSend}
                            disabled={sending || aiLoading}
                            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                        >
                            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ChannelIcon className="h-4 w-4 mr-2" />}
                            {sending ? 'Sending...' : `Send via ${channel === 'email' ? 'Email' : channel === 'sms' ? 'SMS' : 'WhatsApp'}`}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}