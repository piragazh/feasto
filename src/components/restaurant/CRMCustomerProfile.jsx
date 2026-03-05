import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, Mail, Phone, MapPin, ShoppingBag, TrendingUp, Wand2, Send, Loader2, Package, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const loyaltyColors = {
    platinum: 'bg-purple-100 text-purple-800 border-purple-300',
    gold: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    silver: 'bg-gray-100 text-gray-800 border-gray-300',
    bronze: 'bg-orange-100 text-orange-800 border-orange-300',
};

const statusColors = {
    delivered: 'bg-green-100 text-green-700',
    collected: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    refunded: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    preparing: 'bg-orange-100 text-orange-700',
};

export default function CRMCustomerProfile({ customer, onClose, restaurantName }) {
    const [offerType, setOfferType] = useState('message');
    const [offerTitle, setOfferTitle] = useState('');
    const [discountValue, setDiscountValue] = useState('');
    const [messageContent, setMessageContent] = useState('');
    const [generatingAI, setGeneratingAI] = useState(false);
    const [sending, setSending] = useState(false);

    const topItems = Object.entries(customer.favoriteItems || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const generateAIMessage = async () => {
        setGeneratingAI(true);
        try {
            const customerSummary = `
Customer email: ${customer.email}
Total orders: ${customer.orderCount}
Total spent: £${customer.totalSpent.toFixed(2)}
Avg order value: £${customer.avgOrderValue.toFixed(2)}
Loyalty status: ${customer.loyaltyStatus}
Segment: ${customer.segment}
Dietary preference: ${customer.dietaryPreference}
Favourite items: ${Object.entries(customer.favoriteItems || {}).slice(0, 3).map(([name, qty]) => `${name} (ordered ${qty}x)`).join(', ')}
Days since last order: ${Math.round(customer.daysSinceLast)}
Order frequency: ${customer.orderFrequency}
`;
            const offerContext = offerType === 'discount'
                ? `The offer includes a ${discountValue || 'X'}% discount.`
                : offerType === 'freeDelivery'
                ? 'The offer includes free delivery.'
                : 'This is a general re-engagement or appreciation message.';

            const result = await base44.integrations.Core.InvokeLLM({
                prompt: `You are a marketing expert for a restaurant called "${restaurantName}". Write a short, warm, personalised promotional email message (2-3 sentences max) for this customer. ${offerContext}\n\nCustomer profile:\n${customerSummary}\n\nTips: Mention their favourite food or loyalty. Be friendly and personal. Do NOT include subject line, just the message body.`,
            });
            setMessageContent(result);
        } catch (e) {
            toast.error('Failed to generate message');
        } finally {
            setGeneratingAI(false);
        }
    };

    const handleSend = async () => {
        if (!messageContent.trim()) {
            toast.error('Please enter a message');
            return;
        }
        if (offerType !== 'message' && !offerTitle.trim()) {
            toast.error('Please enter an offer title');
            return;
        }
        if (offerType === 'discount' && (!discountValue || Number(discountValue) <= 0)) {
            toast.error('Please enter a valid discount percentage');
            return;
        }

        setSending(true);
        try {
            let subject = offerTitle || `A message from ${restaurantName}`;
            let body = messageContent;

            if (offerType === 'discount') {
                body = `${offerTitle}\n\n${messageContent}\n\nYour exclusive discount: ${discountValue}% off your next order!`;
            } else if (offerType === 'freeDelivery') {
                body = `${offerTitle}\n\n${messageContent}\n\nEnjoy FREE DELIVERY on your next order!`;
            }

            await base44.integrations.Core.SendEmail({ to: customer.email, subject, body });
            toast.success('Offer sent successfully!');
            setMessageContent('');
            setOfferTitle('');
            setDiscountValue('');
            setOfferType('message');
        } catch (e) {
            toast.error('Failed to send offer');
        } finally {
            setSending(false);
        }
    };

    const quickTemplates = [
        {
            label: "We miss you!",
            text: `Hi! We haven't seen you in a while and we miss you at ${restaurantName}. Come back and enjoy your favourites – we'd love to see you again!`,
        },
        {
            label: "Thank you, loyal customer!",
            text: `Thank you so much for your continued loyalty to ${restaurantName}! We truly appreciate every order you place with us. As a valued customer, we'd love to show our appreciation.`,
        },
        {
            label: "Try something new",
            text: `Hi! We've added exciting new dishes to our menu at ${restaurantName}. Why not try something different on your next order? We think you'll love it!`,
        },
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-lg text-gray-900">
                            {customer.guestName || customer.email}
                        </p>
                        <Badge className={`${loyaltyColors[customer.loyaltyStatus]} border text-xs`}>
                            {customer.loyaltyStatus?.toUpperCase()}
                        </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{customer.email}</span>
                        {customer.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>}
                        {customer.lastAddress && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{customer.lastAddress}</span>}
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Orders</p>
                    <p className="text-xl font-bold">{customer.orderCount}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Total Spent</p>
                    <p className="text-xl font-bold text-green-700">£{customer.totalSpent.toFixed(2)}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Avg Order</p>
                    <p className="text-xl font-bold text-blue-700">£{customer.avgOrderValue.toFixed(2)}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Last Order</p>
                    <p className="text-xl font-bold text-orange-700">{Math.round(customer.daysSinceLast)}d ago</p>
                </div>
            </div>

            <Tabs defaultValue="history">
                <TabsList className="w-full">
                    <TabsTrigger value="history" className="flex-1">Order History</TabsTrigger>
                    <TabsTrigger value="preferences" className="flex-1">Preferences</TabsTrigger>
                    <TabsTrigger value="offer" className="flex-1">Send Offer</TabsTrigger>
                </TabsList>

                {/* Order History */}
                <TabsContent value="history">
                    <ScrollArea className="h-72 border rounded-lg">
                        <div className="p-3 space-y-2">
                            {customer.orders.slice().sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).map((order) => (
                                <div key={order.id} className="border rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <ShoppingBag className="h-4 w-4 text-gray-400" />
                                            <span className="font-semibold text-sm">#{order.id.slice(-6)}</span>
                                            <Badge className={`text-xs ${statusColors[order.status] || 'bg-gray-100 text-gray-700'}`}>
                                                {order.status}
                                            </Badge>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-sm">£{(order.total || 0).toFixed(2)}</p>
                                            <p className="text-xs text-gray-400">{order.created_date ? format(new Date(order.created_date), 'dd MMM yyyy') : '—'}</p>
                                        </div>
                                    </div>
                                    {order.items && order.items.length > 0 && (
                                        <div className="text-xs text-gray-500">
                                            {order.items.map((item, i) => (
                                                <span key={i}>{item.quantity}× {item.name}{i < order.items.length - 1 ? ', ' : ''}</span>
                                            ))}
                                        </div>
                                    )}
                                    {order.notes && (
                                        <p className="text-xs text-gray-400 mt-1 italic">Notes: {order.notes}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </TabsContent>

                {/* Preferences */}
                <TabsContent value="preferences">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="border rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1">Order Frequency</p>
                                <p className="font-semibold capitalize">{customer.orderFrequency}</p>
                            </div>
                            <div className="border rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1">Spending Level</p>
                                <p className="font-semibold capitalize">{customer.spendingLevel}</p>
                            </div>
                            <div className="border rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1">Dietary Preference</p>
                                <p className="font-semibold capitalize">
                                    {customer.dietaryPreference === 'none' ? 'No preference' : customer.dietaryPreference}
                                </p>
                            </div>
                            <div className="border rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1">Avg Rating Given</p>
                                <p className="font-semibold">
                                    {customer.avgRating ? (
                                        <span className="flex items-center gap-1">
                                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                            {customer.avgRating.toFixed(1)}
                                        </span>
                                    ) : 'No reviews'}
                                </p>
                            </div>
                        </div>

                        {topItems.length > 0 && (
                            <div>
                                <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                                    <Package className="h-4 w-4" />
                                    Favourite Items
                                </p>
                                <div className="space-y-2">
                                    {topItems.map(([name, qty], i) => (
                                        <div key={name} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
                                            <span className="flex items-center gap-2">
                                                <span className="text-gray-400 text-xs w-4">#{i + 1}</span>
                                                {name}
                                            </span>
                                            <Badge variant="outline">{qty}× ordered</Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {customer.reviews.length > 0 && (
                            <div>
                                <p className="text-sm font-semibold mb-2">Reviews Left</p>
                                <div className="space-y-2">
                                    {customer.reviews.map(review => (
                                        <div key={review.id} className="border rounded-lg p-3">
                                            <div className="flex gap-0.5 mb-1">
                                                {[...Array(5)].map((_, i) => (
                                                    <Star key={i} className={`h-3 w-3 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />
                                                ))}
                                            </div>
                                            {review.review_text && <p className="text-xs text-gray-600">{review.review_text}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* Send Offer */}
                <TabsContent value="offer">
                    <div className="space-y-4">
                        {/* Quick Templates */}
                        <div>
                            <p className="text-xs font-semibold text-gray-600 mb-2">Quick Templates</p>
                            <div className="flex flex-wrap gap-2">
                                {quickTemplates.map(t => (
                                    <Button
                                        key={t.label}
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setMessageContent(t.text)}
                                        className="text-xs h-7"
                                    >
                                        {t.label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <Label className="text-xs">Offer Type</Label>
                            <Select value={offerType} onValueChange={setOfferType}>
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="message">Message Only</SelectItem>
                                    <SelectItem value="discount">% Discount</SelectItem>
                                    <SelectItem value="freeDelivery">Free Delivery</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {offerType !== 'message' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Offer Title</Label>
                                    <Input placeholder="e.g., Weekend Special!" value={offerTitle} onChange={e => setOfferTitle(e.target.value)} className="h-9" />
                                </div>
                                {offerType === 'discount' && (
                                    <div>
                                        <Label className="text-xs">Discount %</Label>
                                        <Input type="number" placeholder="e.g., 15" value={discountValue} onChange={e => setDiscountValue(e.target.value)} min="1" max="100" className="h-9" />
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <Label className="text-xs">Message</Label>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={generateAIMessage}
                                    disabled={generatingAI}
                                    className="h-6 text-xs gap-1 text-purple-700 border-purple-300 hover:bg-purple-50"
                                >
                                    {generatingAI ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                                    AI Generate
                                </Button>
                            </div>
                            <Textarea
                                placeholder="Write a personalised message..."
                                value={messageContent}
                                onChange={e => setMessageContent(e.target.value)}
                                rows={4}
                            />
                        </div>

                        <Button
                            onClick={handleSend}
                            disabled={sending}
                            className="w-full bg-orange-500 hover:bg-orange-600"
                        >
                            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                            {sending ? 'Sending...' : `Send to ${customer.email}`}
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}