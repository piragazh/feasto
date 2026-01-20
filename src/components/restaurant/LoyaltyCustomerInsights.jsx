import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tantml:react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Award, Mail, MessageSquare, Star, TrendingUp, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function LoyaltyCustomerInsights({ restaurantId }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCustomers, setSelectedCustomers] = useState([]);
    const [isPromotionDialogOpen, setIsPromotionDialogOpen] = useState(false);
    const [promotionMessage, setPromotionMessage] = useState('');
    const [promotionSubject, setPromotionSubject] = useState('');
    const queryClient = useQueryClient();

    const { data: loyaltyPoints = [] } = useQuery({
        queryKey: ['loyalty-points', restaurantId],
        queryFn: () => base44.entities.LoyaltyPoints.filter({ restaurant_id: restaurantId }),
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['customer-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: { $in: ['delivered', 'collected'] }
        }),
    });

    const sendPromotionMutation = useMutation({
        mutationFn: async ({ customerEmails, subject, message, sendVia }) => {
            const results = [];
            for (const email of customerEmails) {
                try {
                    if (sendVia === 'email' || sendVia === 'both') {
                        await base44.integrations.Core.SendEmail({
                            to: email,
                            subject: subject,
                            body: message
                        });
                    }
                    
                    if (sendVia === 'sms' || sendVia === 'both') {
                        const customer = customerData.find(c => c.email === email);
                        if (customer?.phone) {
                            await base44.functions.invoke('sendSMS', {
                                to: customer.phone,
                                message: message
                            });
                        }
                    }
                    results.push({ email, success: true });
                } catch (error) {
                    results.push({ email, success: false });
                }
            }
            return results;
        },
        onSuccess: (results) => {
            const successCount = results.filter(r => r.success).length;
            toast.success(`Promotion sent to ${successCount} customers`);
            setIsPromotionDialogOpen(false);
            setSelectedCustomers([]);
            setPromotionMessage('');
            setPromotionSubject('');
        },
    });

    // Calculate customer metrics
    const customerData = loyaltyPoints.map(lp => {
        const customerOrders = orders.filter(o => o.created_by === lp.customer_email);
        const totalSpent = customerOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const lastOrder = customerOrders.length > 0 
            ? customerOrders.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
            : null;

        let tier = 'Bronze';
        if (lp.points >= 500) tier = 'Gold';
        else if (lp.points >= 200) tier = 'Silver';

        return {
            email: lp.customer_email,
            points: lp.points,
            totalOrders: customerOrders.length,
            totalSpent,
            tier,
            lastOrderDate: lastOrder?.created_date,
            phone: lastOrder?.phone
        };
    }).sort((a, b) => b.points - a.points);

    const filteredCustomers = customerData.filter(c => 
        c.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getTierColor = (tier) => {
        switch (tier) {
            case 'Gold': return 'bg-yellow-500';
            case 'Silver': return 'bg-gray-400';
            default: return 'bg-orange-600';
        }
    };

    const handleSelectAll = (checked) => {
        setSelectedCustomers(checked ? filteredCustomers.map(c => c.email) : []);
    };

    const handleSendPromotion = (sendVia) => {
        if (!promotionMessage || selectedCustomers.length === 0) {
            toast.error('Please select customers and write a message');
            return;
        }
        
        sendPromotionMutation.mutate({
            customerEmails: selectedCustomers,
            subject: promotionSubject || 'Special Offer from Your Favorite Restaurant',
            message: promotionMessage,
            sendVia
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold mb-2">Loyalty Customer Insights</h2>
                <p className="text-sm text-gray-500">Track and engage with your loyalty program members</p>
            </div>

            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Award className="h-4 w-4 text-yellow-500" />
                            Gold Members
                        </div>
                        <div className="text-2xl font-bold">
                            {customerData.filter(c => c.tier === 'Gold').length}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Award className="h-4 w-4 text-gray-400" />
                            Silver Members
                        </div>
                        <div className="text-2xl font-bold">
                            {customerData.filter(c => c.tier === 'Silver').length}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Award className="h-4 w-4 text-orange-600" />
                            Bronze Members
                        </div>
                        <div className="text-2xl font-bold">
                            {customerData.filter(c => c.tier === 'Bronze').length}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <TrendingUp className="h-4 w-4" />
                            Avg Points
                        </div>
                        <div className="text-2xl font-bold">
                            {Math.round(customerData.reduce((sum, c) => sum + c.points, 0) / (customerData.length || 1))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Customer List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Loyalty Members</CardTitle>
                        {selectedCustomers.length > 0 && (
                            <Button 
                                onClick={() => setIsPromotionDialogOpen(true)}
                                className="bg-orange-500 hover:bg-orange-600"
                            >
                                <Send className="h-4 w-4 mr-2" />
                                Send Promotion ({selectedCustomers.length})
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search by email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                                onChange={(e) => handleSelectAll(e.target.checked)}
                                className="rounded"
                            />
                            <span className="text-sm text-gray-600">Select All</span>
                        </div>

                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {filteredCustomers.map((customer) => (
                                <div
                                    key={customer.email}
                                    className={`flex items-center gap-3 p-3 border rounded-lg ${
                                        selectedCustomers.includes(customer.email) ? 'ring-2 ring-orange-500 bg-orange-50' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedCustomers.includes(customer.email)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedCustomers([...selectedCustomers, customer.email]);
                                            } else {
                                                setSelectedCustomers(selectedCustomers.filter(email => email !== customer.email));
                                            }
                                        }}
                                        className="rounded"
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium">{customer.email}</span>
                                            <Badge className={getTierColor(customer.tier)}>
                                                {customer.tier}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-gray-500">
                                            <span>{customer.points} points</span>
                                            <span>•</span>
                                            <span>{customer.totalOrders} orders</span>
                                            <span>•</span>
                                            <span>£{customer.totalSpent.toFixed(2)} spent</span>
                                            {customer.lastOrderDate && (
                                                <>
                                                    <span>•</span>
                                                    <span>Last: {format(new Date(customer.lastOrderDate), 'MMM d')}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Send Promotion Dialog */}
            <Dialog open={isPromotionDialogOpen} onOpenChange={setIsPromotionDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Send Targeted Promotion</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-500 mb-2">
                                Sending to {selectedCustomers.length} customer{selectedCustomers.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Email Subject</label>
                            <Input
                                value={promotionSubject}
                                onChange={(e) => setPromotionSubject(e.target.value)}
                                placeholder="Special offer just for you!"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Message</label>
                            <Textarea
                                value={promotionMessage}
                                onChange={(e) => setPromotionMessage(e.target.value)}
                                placeholder="Write your promotional message here..."
                                rows={6}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPromotionDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={() => handleSendPromotion('email')}
                            className="bg-blue-500 hover:bg-blue-600"
                        >
                            <Mail className="h-4 w-4 mr-2" />
                            Send via Email
                        </Button>
                        <Button 
                            onClick={() => handleSendPromotion('sms')}
                            className="bg-green-500 hover:bg-green-600"
                        >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Send via SMS
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}