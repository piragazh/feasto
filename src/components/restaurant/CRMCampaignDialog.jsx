import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Mail, MessageSquare, Send, Wand2, Loader2, Smartphone, Eye, ChevronDown, ChevronUp, Tag, X, Check, ImagePlus, Sparkles, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

const AI_TEMPLATES = [
    { label: 'Win-Back',         goal: 'win_back',  prompt: 'Write a warm, friendly re-engagement promotion to win back a customer who has not ordered in 60+ days. Include a sense of urgency and a special offer.' },
    { label: 'VIP Reward',       goal: 'vip_reward', prompt: 'Write an exclusive, premium-feeling loyalty reward message for a top-spending VIP customer. Make them feel special and valued.' },
    { label: 'Welcome',          goal: 'welcome',   prompt: 'Write a warm welcome message for a first-time customer with an introductory discount offer.' },
    { label: 'Weekend Special',  goal: 'weekend',   prompt: 'Write an exciting weekend food promotion encouraging ordering this weekend. Be energetic and fun.' },
    { label: 'Seasonal Offer',   goal: 'seasonal',  prompt: 'Write a seasonal promotional message for a restaurant. Be festive and relevant to the current season.' },
    { label: 'Upsell Bundle',    goal: 'upsell',    prompt: 'Write a promotional message about a food bundle deal — encouraging customers to add sides, drinks or desserts to their order.' },
];

// Beautiful, modern HTML email template
function buildHtmlEmail({ restaurantName, restaurantLogo, textBody, subject, coupon, heroImageUrl }) {
    const couponBlock = coupon
        ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td align="center">
              <table cellpadding="0" cellspacing="0" style="border:3px dashed #f97316;border-radius:12px;background:#fff7ed;max-width:320px;width:100%;">
                <tr><td style="padding:20px 28px;text-align:center;">
                  <div style="font-size:11px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Your Exclusive Code</div>
                  <div style="font-size:32px;font-weight:900;letter-spacing:6px;color:#ea580c;font-family:'Courier New',monospace;background:#fff;border:2px solid #fed7aa;border-radius:8px;padding:12px 24px;display:inline-block;">${coupon.code}</div>
                  ${coupon.discount_type === 'percentage' ? `<div style="font-size:14px;color:#c2410c;font-weight:600;margin-top:10px;">${coupon.discount_value}% OFF your next order</div>` : ''}
                  ${coupon.discount_type === 'fixed' ? `<div style="font-size:14px;color:#c2410c;font-weight:600;margin-top:10px;">£${coupon.discount_value} OFF your next order</div>` : ''}
                  ${coupon.discount_type === 'free_delivery' ? `<div style="font-size:14px;color:#c2410c;font-weight:600;margin-top:10px;">🚚 FREE DELIVERY on your next order</div>` : ''}
                  ${coupon.discount_type === 'free_item' ? `<div style="font-size:14px;color:#c2410c;font-weight:600;margin-top:10px;">🎁 FREE ITEM with your next order</div>` : ''}
                  ${coupon.discount_type === 'buy_one_get_one' ? `<div style="font-size:14px;color:#c2410c;font-weight:600;margin-top:10px;">🛍️ Buy One Get One FREE</div>` : ''}
                  ${coupon.minimum_order ? `<div style="font-size:11px;color:#9a3412;margin-top:6px;">Min. order: £${coupon.minimum_order}</div>` : ''}
                  ${coupon.valid_until ? `<div style="font-size:11px;color:#9a3412;margin-top:4px;">Valid until: ${coupon.valid_until}</div>` : ''}
                </td></tr>
              </table>
            </td></tr>
          </table>`
        : '';

    const heroBlock = heroImageUrl
        ? `<tr><td style="padding:0;">
            <img src="${heroImageUrl}" alt="${restaurantName} food" width="600" style="width:100%;max-width:600px;display:block;border-radius:0;" />
          </td></tr>`
        : '';

    const logoBlock = restaurantLogo
        ? `<img src="${restaurantLogo}" alt="${restaurantName}" style="width:60px;height:60px;border-radius:12px;object-fit:cover;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto;" />`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject || restaurantName}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:32px 40px;text-align:center;">
          ${logoBlock}
          <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">${restaurantName}</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${subject || 'A special message for you'}</p>
        </td></tr>

        <!-- Hero Image (if set) -->
        ${heroBlock}

        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          ${couponBlock}
          <div style="color:#374151;font-size:16px;line-height:1.7;white-space:pre-line;">${textBody}</div>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;">
            <tr><td align="center">
              <a href="#" style="background:#f97316;color:#ffffff;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;letter-spacing:0.3px;">🍽️ Order Now</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;"><div style="height:1px;background:#e5e7eb;"></div></td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:24px 40px;text-align:center;">
          <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Thank you for being a valued customer of <strong>${restaurantName}</strong>.</p>
          <p style="margin:0;color:#9ca3af;font-size:11px;">You're receiving this because you've ordered with us. <a href="#" style="color:#f97316;">Unsubscribe</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default function CRMCampaignDialog({ open, onClose, targetSegment, segmentConfig, restaurantName, restaurantId, restaurantLogo }) {
    const [channel, setChannel] = useState('email');
    const [subject, setSubject] = useState('');
    const [textBody, setTextBody] = useState('');
    const [selectedCouponId, setSelectedCouponId] = useState('none');
    const [heroImageUrl, setHeroImageUrl] = useState('');
    const [imageGenLoading, setImageGenLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [sending, setSending] = useState(false);
    const [preview, setPreview] = useState(false);
    const [showCouponPicker, setShowCouponPicker] = useState(false);

    // Fetch coupons for this restaurant (restaurant-specific + platform-wide)
    const { data: allCoupons = [] } = useQuery({
        queryKey: ['crm-coupons', restaurantId],
        queryFn: async () => {
            const [restaurantCoupons, platformCoupons] = await Promise.all([
                base44.entities.Coupon.filter({ restaurant_id: restaurantId, is_active: true }),
                base44.entities.Coupon.filter({ is_active: true }),
            ]);
            // Merge, deduplicate by id, filter only active
            const map = {};
            [...restaurantCoupons, ...platformCoupons].forEach(c => { map[c.id] = c; });
            return Object.values(map).filter(c => c.is_active);
        },
        enabled: !!restaurantId && open,
    });

    const selectedCoupon = allCoupons.find(c => c.id === selectedCouponId) || null;

    const segmentLabel = targetSegment?.segment === 'all'
        ? 'All Customers'
        : segmentConfig[targetSegment?.segment]?.label || '';

    const recipientCount = targetSegment?.count || 0;
    const emailRecipients = targetSegment?.recipients?.filter(r => r.email?.includes('@'))?.length || 0;
    const smsRecipients = targetSegment?.recipients?.filter(r => r.phone)?.length || 0;

    const couponDescription = (c) => {
        if (!c) return '';
        if (c.discount_type === 'percentage') return `${c.discount_value}% off`;
        if (c.discount_type === 'fixed') return `£${c.discount_value} off`;
        if (c.discount_type === 'free_delivery') return 'Free delivery';
        if (c.discount_type === 'free_item') return 'Free item';
        if (c.discount_type === 'buy_one_get_one') return 'Buy 1 Get 1';
        return '';
    };

    const generatePromoImage = async () => {
        setImageGenLoading(true);
        try {
            const couponText = selectedCoupon ? `with a bold "${couponDescription(selectedCoupon)}" offer badge` : '';
            const prompt = `A stunning, professional food promotion marketing image for a restaurant called "${restaurantName}". 
Vibrant, appetising food photography style. Warm orange and white colour palette. 
Show delicious plated food in the foreground ${couponText}. 
Clean modern layout, high contrast, suitable as an email hero banner. 
Photorealistic, mouth-watering, commercial food photography quality. 16:9 aspect ratio.`;

            const result = await base44.integrations.Core.GenerateImage({ prompt });
            if (result?.url) {
                setHeroImageUrl(result.url);
                toast.success('Promotion image generated!');
            }
        } catch (e) {
            toast.error('Failed to generate image');
        } finally {
            setImageGenLoading(false);
        }
    };

    const generateWithAI = async (templateGoal) => {
        setAiLoading(true);
        setSelectedTemplate(templateGoal);
        try {
            const templateConfig = AI_TEMPLATES.find(t => t.goal === templateGoal);
            const basePrompt = templateConfig?.prompt || 'Write a general promotional message.';
            const couponInfo = selectedCoupon
                ? `\nInclude this coupon code prominently: "${selectedCoupon.code}" (${couponDescription(selectedCoupon)}). Mention the code by name in the message.`
                : '';

            const prompt = `You are a marketing copywriter for a restaurant called "${restaurantName}".

${basePrompt}${couponInfo}

Channel: ${channel === 'email' ? 'Email' : channel === 'sms' ? 'SMS (max 160 chars)' : 'WhatsApp message'}
Customer segment: ${segmentLabel}

${channel === 'email' ? `Return JSON with:
- subject: a compelling, concise email subject line (max 60 chars, include an emoji)
- body: full email body text (professional yet warm, ~120-150 words, DO NOT include HTML tags, plain text only)` : `Return JSON with:
- body: the message text only (${channel === 'sms' ? 'max 160 chars, mention coupon code if provided' : 'friendly WhatsApp tone, max 280 chars, mention coupon code if provided'})`}

Make it personal, action-oriented, and exciting. Use natural line breaks.`;

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

    const builtEmail = buildHtmlEmail({
        restaurantName,
        restaurantLogo,
        textBody,
        subject,
        coupon: selectedCoupon,
        heroImageUrl: heroImageUrl.trim() || null,
    });

    const handleSend = async () => {
        if (!textBody.trim()) { toast.error('Please write a message'); return; }
        if (channel === 'email' && !subject.trim()) { toast.error('Please add an email subject'); return; }

        setSending(true);
        try {
            const recipients = targetSegment?.recipients || [];
            const result = await base44.functions.invoke('sendCRMCampaignWithOptOut', {
                channel,
                recipients,
                subject,
                htmlBody: channel === 'email' ? builtEmail : undefined,
                textBody,
                restaurant_id: restaurantId,
            });

            const sent = result.data?.sent || 0;
            const failed = result.data?.failed || 0;
            const skipped = result.data?.skipped || 0;
            toast.success(`✅ Sent to ${sent} customers${failed > 0 ? `, ${failed} failed` : ''}${skipped > 0 ? `, ${skipped} opted out` : ''}`);
            handleClose();
        } catch (e) {
            toast.error('Failed to send campaign: ' + e.message);
        } finally {
            setSending(false);
        }
    };

    const handleReset = () => {
        setSubject('');
        setTextBody('');
        setSelectedCouponId('none');
        setHeroImageUrl('');
        setPreview(false);
        setSelectedTemplate('');
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5 text-orange-500" />
                        Send Campaign
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap gap-2 items-center">
                        <span className="font-semibold text-gray-700">{segmentLabel}</span>
                        <span className="text-gray-400">·</span>
                        <span>{recipientCount} customers</span>
                        {channel === 'email' && <Badge variant="outline" className="text-blue-600">{emailRecipients} emails</Badge>}
                        {(channel === 'sms' || channel === 'whatsapp') && <Badge variant="outline" className="text-green-600">{smsRecipients} phone numbers</Badge>}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    {/* Channel Selector */}
                    <div>
                        <Label className="mb-2 block text-sm font-semibold">Channel</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { key: 'email', label: 'Email', icon: Mail, count: emailRecipients },
                                { key: 'sms', label: 'SMS', icon: Smartphone, count: smsRecipients },
                                { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, count: smsRecipients },
                            ].map(ch => (
                                <button
                                    key={ch.key}
                                    onClick={() => setChannel(ch.key)}
                                    className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                                        channel === ch.key
                                            ? 'border-orange-500 bg-orange-50 text-orange-600'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-500'
                                    }`}
                                >
                                    <ch.icon className="h-5 w-5" />
                                    <span>{ch.label}</span>
                                    <span className="text-xs font-normal opacity-70">{ch.count} recipients</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Coupon Picker */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-semibold flex items-center gap-1">
                                <Tag className="h-4 w-4 text-orange-500" />
                                Attach Coupon Code
                            </Label>
                            <span className="text-xs text-gray-400">{allCoupons.length} available</span>
                        </div>

                        {selectedCoupon ? (
                            <div className="flex items-center gap-3 p-3 bg-orange-50 border-2 border-orange-300 rounded-xl">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-orange-700 text-lg tracking-widest">{selectedCoupon.code}</span>
                                        <Badge className="bg-orange-100 text-orange-700 text-xs">{couponDescription(selectedCoupon)}</Badge>
                                    </div>
                                    {selectedCoupon.description && <p className="text-xs text-orange-600 mt-0.5">{selectedCoupon.description}</p>}
                                    <div className="flex gap-3 mt-1 text-xs text-orange-500">
                                        {selectedCoupon.minimum_order && <span>Min: £{selectedCoupon.minimum_order}</span>}
                                        {selectedCoupon.valid_until && <span>Until: {selectedCoupon.valid_until}</span>}
                                        {selectedCoupon.usage_limit && <span>Limit: {selectedCoupon.usage_limit} uses</span>}
                                    </div>
                                </div>
                                <button onClick={() => setSelectedCouponId('none')} className="text-orange-400 hover:text-orange-600">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowCouponPicker(!showCouponPicker)}
                                className="w-full flex items-center justify-between p-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-orange-300 hover:text-orange-500 transition-all text-sm"
                            >
                                <span className="flex items-center gap-2">
                                    <Tag className="h-4 w-4" />
                                    Click to attach a coupon (optional)
                                </span>
                                <ChevronDown className={`h-4 w-4 transition-transform ${showCouponPicker ? 'rotate-180' : ''}`} />
                            </button>
                        )}

                        {showCouponPicker && !selectedCoupon && (
                            <div className="mt-2 border rounded-xl overflow-hidden bg-white shadow-lg max-h-48 overflow-y-auto">
                                {allCoupons.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-gray-400">No active coupons found</div>
                                ) : (
                                    allCoupons.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => { setSelectedCouponId(c.id); setShowCouponPicker(false); }}
                                            className="w-full flex items-center gap-3 p-3 hover:bg-orange-50 border-b last:border-b-0 text-left transition-colors"
                                        >
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-gray-800 tracking-wider">{c.code}</span>
                                                    <Badge variant="outline" className="text-xs">{couponDescription(c)}</Badge>
                                                </div>
                                                {c.description && <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>}
                                            </div>
                                            <Check className="h-4 w-4 text-orange-500 opacity-0 group-hover:opacity-100" />
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Hero Image (email only) */}
                    {channel === 'email' && (
                        <div>
                            <Label className="text-sm font-semibold mb-2 block flex items-center gap-1">
                                <ImagePlus className="h-4 w-4 text-orange-500" />
                                Promotion Image <span className="font-normal text-gray-400">(optional)</span>
                            </Label>

                            {/* AI Generate button */}
                            <button
                                onClick={generatePromoImage}
                                disabled={imageGenLoading}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 hover:border-purple-400 hover:bg-purple-100 transition-all text-sm font-semibold disabled:opacity-60 mb-2"
                            >
                                {imageGenLoading
                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating image with AI...</>
                                    : <><Sparkles className="h-4 w-4" /> Generate Promotion Image with AI</>
                                }
                            </button>

                            {/* Generated / manual preview */}
                            {heroImageUrl ? (
                                <div className="relative rounded-xl overflow-hidden border-2 border-gray-200">
                                    <img src={heroImageUrl} alt="Hero" className="w-full h-40 object-cover" />
                                    <div className="absolute top-2 right-2 flex gap-1">
                                        <button
                                            onClick={generatePromoImage}
                                            disabled={imageGenLoading}
                                            title="Regenerate"
                                            className="bg-white/90 hover:bg-white rounded-lg p-1.5 shadow text-purple-600 disabled:opacity-50"
                                        >
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => setHeroImageUrl('')}
                                            title="Remove"
                                            className="bg-white/90 hover:bg-white rounded-lg p-1.5 shadow text-red-500"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <Input
                                    placeholder="Or paste an image URL manually..."
                                    value={heroImageUrl}
                                    onChange={e => setHeroImageUrl(e.target.value)}
                                    className="text-sm"
                                />
                            )}
                        </div>
                    )}

                    {/* AI Template Generator */}
                    <div className="border rounded-xl p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
                        <div className="flex items-center gap-2 mb-3">
                            <Wand2 className="h-4 w-4 text-purple-600" />
                            <span className="font-semibold text-purple-800 text-sm">AI Template Generator</span>
                            {selectedCoupon && <Badge className="bg-purple-100 text-purple-700 text-xs">Will include {selectedCoupon.code}</Badge>}
                            {aiLoading && <Loader2 className="h-4 w-4 animate-spin text-purple-600 ml-auto" />}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {AI_TEMPLATES.map(t => (
                                <button
                                    key={t.goal}
                                    onClick={() => generateWithAI(t.goal)}
                                    disabled={aiLoading}
                                    className={`text-xs px-3 py-2 rounded-lg border font-medium transition-all ${
                                        selectedTemplate === t.goal && aiLoading
                                            ? 'bg-purple-600 text-white border-purple-600'
                                            : selectedTemplate === t.goal && !aiLoading
                                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                                            : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
                                    } disabled:opacity-50`}
                                >
                                    {aiLoading && selectedTemplate === t.goal ? (
                                        <span className="flex items-center gap-1 justify-center">
                                            <Loader2 className="h-3 w-3 animate-spin" /> Generating...
                                        </span>
                                    ) : t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Email Subject */}
                    {channel === 'email' && (
                        <div>
                            <Label className="text-sm font-semibold">Subject Line</Label>
                            <Input
                                placeholder="e.g. 🎁 A special treat from us — just for you!"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                    )}

                    {/* Message Body */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <Label className="text-sm font-semibold">Message Body</Label>
                            {(channel === 'sms' || channel === 'whatsapp') && (
                                <span className={`text-xs ${textBody.length > 160 && channel === 'sms' ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                                    {textBody.length}{channel === 'sms' ? '/160' : ''} chars
                                </span>
                            )}
                        </div>
                        <Textarea
                            placeholder={
                                channel === 'email'
                                    ? 'Write your email body here. The coupon code, offer banner, and branding are added automatically...'
                                    : channel === 'sms'
                                    ? 'Write your SMS (max 160 chars). Coupon code will be appended...'
                                    : 'Write your WhatsApp message. Coupon code will be appended...'
                            }
                            value={textBody}
                            onChange={e => setTextBody(e.target.value)}
                            rows={6}
                            className="resize-none"
                        />
                        {selectedCoupon && (channel === 'sms' || channel === 'whatsapp') && (
                            <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                Coupon code <strong>{selectedCoupon.code}</strong> will be appended to the message automatically
                            </p>
                        )}
                    </div>

                    {/* Email Preview */}
                    {channel === 'email' && textBody && (
                        <div>
                            <button
                                onClick={() => setPreview(!preview)}
                                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                <Eye className="h-4 w-4" />
                                {preview ? 'Hide' : 'Preview'} Email
                                {preview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {preview && (
                                <div className="mt-2 border-2 border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                    <div className="bg-gray-100 px-3 py-1.5 flex items-center gap-2 border-b">
                                        <div className="flex gap-1">
                                            <div className="w-3 h-3 rounded-full bg-red-400" />
                                            <div className="w-3 h-3 rounded-full bg-yellow-400" />
                                            <div className="w-3 h-3 rounded-full bg-green-400" />
                                        </div>
                                        <span className="text-xs text-gray-500 flex-1 text-center">Email Preview</span>
                                    </div>
                                    <iframe
                                        srcDoc={builtEmail}
                                        style={{ width: '100%', height: 480, border: 'none' }}
                                        title="Email Preview"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Summary */}
                    {textBody && (
                        <div className="bg-gray-50 rounded-xl p-3 border text-xs text-gray-600 space-y-1">
                            <div className="font-semibold text-gray-700 mb-1">Campaign Summary</div>
                            <div className="flex justify-between"><span>Channel:</span><span className="font-medium capitalize">{channel}</span></div>
                            <div className="flex justify-between"><span>Recipients:</span><span className="font-medium">{channel === 'email' ? emailRecipients : smsRecipients}</span></div>
                            {selectedCoupon && <div className="flex justify-between"><span>Coupon:</span><span className="font-mono font-bold text-orange-600">{selectedCoupon.code}</span></div>}
                            {channel === 'email' && subject && <div className="flex justify-between"><span>Subject:</span><span className="font-medium truncate max-w-[200px]">{subject}</span></div>}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <Button variant="outline" onClick={handleClose} className="flex-1">Cancel</Button>
                        <Button
                            onClick={handleSend}
                            disabled={sending || aiLoading || imageGenLoading || !textBody.trim()}
                            className="flex-2 bg-orange-500 hover:bg-orange-600 text-white px-8"
                        >
                            {sending
                                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...</>
                                : <><Send className="h-4 w-4 mr-2" /> Send via {channel === 'email' ? 'Email' : channel === 'sms' ? 'SMS' : 'WhatsApp'}</>
                            }
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}