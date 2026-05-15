import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Calendar, Zap, Users, Clock, CheckCircle2, Loader2, MessageSquare, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import WinBackAutomationSettings from './WinBackAutomationSettings';

export default function WinBackCampaignWorkflow({ restaurantId, restaurantName }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [inactivityDays, setInactivityDays] = useState(30);
    const [couponDiscount, setCouponDiscount] = useState(15);
    const [couponType, setCouponType] = useState('percentage');
    const [campaignMessage, setCampaignMessage] = useState('');
    const [scheduling, setScheduling] = useState(false);

    const { data: orders = [] } = useQuery({
        queryKey: ['winback-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 1000),
    });

    // Calculate inactive customers
    const inactiveCustomers = useMemo(() => {
        const customerMap = {};
        const now = new Date();
        const thresholdDays = inactivityDays;

        orders.forEach(order => {
            const key = order.phone || order.created_by || `unknown_${order.id}`;
            if (!customerMap[key]) {
                customerMap[key] = {
                    phone: order.phone,
                    email: order.created_by || order.guest_email,
                    name: order.guest_name,
                    lastOrderDate: order.created_date,
                    totalSpent: 0,
                    orderCount: 0
                };
            }
            if (order.created_date > customerMap[key].lastOrderDate) {
                customerMap[key].lastOrderDate = order.created_date;
            }
            customerMap[key].totalSpent += order.total || 0;
            customerMap[key].orderCount += 1;
        });

        return Object.values(customerMap).filter(customer => {
            if (!customer.phone && !customer.email) return false;
            const daysSinceLast = (now - new Date(customer.lastOrderDate)) / (1000 * 60 * 60 * 24);
            return daysSinceLast >= thresholdDays && customer.orderCount > 0;
        });
    }, [orders, inactivityDays]);

    const scheduleCampaignMutation = useMutation({
        mutationFn: async () => {
            if (!campaignMessage.trim()) {
                throw new Error('Please write a campaign message');
            }
            
            setScheduling(true);
            const result = await base44.functions.invoke('scheduleWinBackCampaign', {
                restaurantId,
                restaurantName,
                inactivityDays,
                customers: inactiveCustomers,
                coupon: {
                    discount_type: couponType,
                    discount_value: parseFloat(couponDiscount),
                    restaurant_id: restaurantId
                },
                message: campaignMessage
            });
            return result;
        },
        onSuccess: (data) => {
            toast.success(`✅ Campaign scheduled! Generated ${data.data?.couponCount || 0} coupons and queued ${data.data?.customerCount || 0} messages`);
            setShowDialog(false);
            setCampaignMessage('');
            queryClient.invalidateQueries(['campaigns']);
        },
        onError: (error) => {
            toast.error('Failed to schedule campaign: ' + error.message);
        },
        onSettled: () => {
            setScheduling(false);
        }
    });

    return (
        <div className="space-y-6">
        <Tabs defaultValue="automation">
            <TabsList className="w-full">
                <TabsTrigger value="automation" className="flex-1 flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    Automated Engine
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex-1 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    One-Off Campaign
                </TabsTrigger>
            </TabsList>

            <TabsContent value="automation" className="mt-4">
                <WinBackAutomationSettings restaurantId={restaurantId} restaurantName={restaurantName} />
            </TabsContent>

            <TabsContent value="manual" className="mt-4">
            {/* Overview Card */}
            <Card className="border-l-4 border-l-red-500">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        Win-Back Campaign Automation
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Automatically identify inactive customers and send them personalized WhatsApp messages with a unique coupon code to re-engage them.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center gap-2 mb-1">
                                <Users className="h-4 w-4 text-blue-600" />
                                <span className="text-sm font-semibold text-blue-900">Inactive Customers</span>
                            </div>
                            <p className="text-2xl font-bold text-blue-700">{inactiveCustomers.length}</p>
                            <p className="text-xs text-blue-600 mt-1">Not ordered in {inactivityDays}+ days</p>
                        </div>

                        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center gap-2 mb-1">
                                <MessageSquare className="h-4 w-4 text-green-600" />
                                <span className="text-sm font-semibold text-green-900">Reachable via Phone</span>
                            </div>
                            <p className="text-2xl font-bold text-green-700">{inactiveCustomers.filter(c => c.phone).length}</p>
                            <p className="text-xs text-green-600 mt-1">For WhatsApp delivery</p>
                        </div>

                        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                            <div className="flex items-center gap-2 mb-1">
                                <Zap className="h-4 w-4 text-purple-600" />
                                <span className="text-sm font-semibold text-purple-900">Total Lost Revenue</span>
                            </div>
                            <p className="text-2xl font-bold text-purple-700">£{inactiveCustomers.reduce((sum, c) => sum + c.totalSpent, 0).toFixed(2)}</p>
                            <p className="text-xs text-purple-600 mt-1">Previous spending value</p>
                        </div>
                    </div>

                    <Button
                        onClick={() => setShowDialog(true)}
                        className="w-full bg-red-600 hover:bg-red-700 text-white"
                        disabled={inactiveCustomers.length === 0}
                    >
                        <Zap className="h-4 w-4 mr-2" />
                        Launch Win-Back Campaign
                    </Button>
                </CardContent>
            </Card>

            {/* Setup Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-red-500" />
                            Configure Win-Back Campaign
                        </DialogTitle>
                        <DialogDescription>
                            Create personalized coupons and schedule WhatsApp messages to {inactiveCustomers.length} inactive customers
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        {/* Inactivity Threshold */}
                        <div className="border rounded-lg p-4 bg-blue-50">
                            <Label className="flex items-center gap-2 mb-2">
                                <Calendar className="h-4 w-4 text-blue-600" />
                                <span className="font-semibold">Inactivity Threshold</span>
                            </Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min="7"
                                    max="180"
                                    step="1"
                                    value={inactivityDays}
                                    onChange={(e) => setInactivityDays(parseInt(e.target.value))}
                                    className="w-24"
                                />
                                <span className="text-sm text-gray-600">days without ordering</span>
                            </div>
                            <p className="text-xs text-blue-600 mt-2">
                                Targets customers who haven't placed an order in {inactivityDays}+ days
                            </p>
                        </div>

                        {/* Coupon Configuration */}
                        <div className="border rounded-lg p-4 bg-orange-50">
                            <Label className="font-semibold mb-3 block">Personalized Coupon</Label>
                            <div className="space-y-3">
                                <div>
                                    <Label className="text-xs mb-1 block">Discount Type</Label>
                                    <Select value={couponType} onValueChange={setCouponType}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="percentage">% Discount</SelectItem>
                                            <SelectItem value="fixed">Fixed Amount Off</SelectItem>
                                            <SelectItem value="free_delivery">Free Delivery</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {couponType !== 'free_delivery' && (
                                    <div>
                                        <Label className="text-xs mb-1 block">
                                            {couponType === 'percentage' ? 'Discount %' : 'Amount Off (£)'}
                                        </Label>
                                        <Input
                                            type="number"
                                            min={couponType === 'percentage' ? 1 : 0.01}
                                            step={couponType === 'percentage' ? 1 : 0.01}
                                            value={couponDiscount}
                                            onChange={(e) => setCouponDiscount(e.target.value)}
                                            className="w-32"
                                        />
                                    </div>
                                )}

                                <p className="text-xs text-orange-700 mt-2">
                                    ✓ Unique codes will be generated for each customer
                                </p>
                            </div>
                        </div>

                        {/* Campaign Message */}
                        <div className="border rounded-lg p-4">
                            <Label className="font-semibold mb-2 block">WhatsApp Message Template</Label>
                            <Textarea
                                placeholder="Hi [NAME],\n\nWe miss you! 😊 It's been [DAYS] days since your last order.\n\nAs a special thank you, here's a [DISCOUNT] coupon just for you:\n\nCode: [COUPON_CODE]\n\nOrder now and enjoy [OFFER]!\n\n[RESTAURANT_LINK]"
                                value={campaignMessage}
                                onChange={(e) => setCampaignMessage(e.target.value)}
                                rows={7}
                                className="text-sm"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                Available placeholders: [NAME], [DAYS], [DISCOUNT], [COUPON_CODE], [OFFER], [RESTAURANT_LINK]
                            </p>
                        </div>

                        {/* Preview */}
                        {inactiveCustomers.length > 0 && (
                            <div className="border rounded-lg p-4 bg-gray-50">
                                <p className="text-xs font-semibold text-gray-600 mb-2">Preview (First Customer):</p>
                                <div className="bg-white p-3 rounded border border-gray-200 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                                    {campaignMessage
                                        .replace('[NAME]', inactiveCustomers[0].name || 'Customer')
                                        .replace('[DAYS]', inactivityDays)
                                        .replace('[DISCOUNT]', couponType === 'percentage' ? `${couponDiscount}%` : `£${couponDiscount}`)
                                        .replace('[COUPON_CODE]', 'WINBACK-XXX')
                                        .replace('[OFFER]', couponType === 'percentage' ? `${couponDiscount}% off` : `£${couponDiscount} off`)
                                        .replace('[RESTAURANT_LINK]', restaurantName)}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1">
                                Cancel
                            </Button>
                            <Button
                                onClick={() => scheduleCampaignMutation.mutate()}
                                disabled={scheduling || !campaignMessage.trim() || inactiveCustomers.length === 0}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                            >
                                {scheduling ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Scheduling...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="h-4 w-4 mr-2" />
                                        Launch Campaign
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Inactive Customers List */}
            {inactiveCustomers.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Inactive Customers ({inactiveCustomers.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                            {inactiveCustomers.slice(0, 10).map((customer, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                                    <div className="flex-1">
                                        <p className="font-semibold">{customer.name || customer.phone || 'Unknown'}</p>
                                        <p className="text-xs text-gray-500">{customer.phone || customer.email}</p>
                                    </div>
                                    <div className="text-right">
                                        <Badge variant="outline" className="text-xs">
                                            {Math.ceil((new Date() - new Date(customer.lastOrderDate)) / (1000 * 60 * 60 * 24))} days ago
                                        </Badge>
                                        <p className="text-xs text-gray-600 mt-1">£{customer.totalSpent.toFixed(2)}</p>
                                    </div>
                                </div>
                            ))}
                            {inactiveCustomers.length > 10 && (
                                <p className="text-xs text-gray-500 text-center py-2">
                                    ... and {inactiveCustomers.length - 10} more
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
            </TabsContent>
        </Tabs>
        </div>
    );
}