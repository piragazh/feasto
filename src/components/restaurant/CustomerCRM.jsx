import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Users, TrendingUp, DollarSign, Mail, Search, Filter, Send, Star } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function CustomerCRM({ restaurantId }) {
    const [selectedSegment, setSelectedSegment] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [messageDialog, setMessageDialog] = useState(false);
    const [messageContent, setMessageContent] = useState('');
    const [targetSegment, setTargetSegment] = useState(null);
    const queryClient = useQueryClient();

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['crm-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 1000),
    });

    const { data: reviews = [] } = useQuery({
        queryKey: ['crm-reviews', restaurantId],
        queryFn: () => base44.entities.Review.filter({ restaurant_id: restaurantId }),
    });

    // Analyze customer data
    const customerAnalytics = useMemo(() => {
        const customerData = {};
        
        orders.forEach(order => {
            const email = order.created_by;
            if (!customerData[email]) {
                customerData[email] = {
                    email,
                    orders: [],
                    totalSpent: 0,
                    avgOrderValue: 0,
                    firstOrder: order.created_date,
                    lastOrder: order.created_date,
                    favoriteItems: {},
                    reviews: []
                };
            }
            
            customerData[email].orders.push(order);
            customerData[email].totalSpent += order.total || 0;
            customerData[email].lastOrder = order.created_date;
            
            // Track favorite items
            order.items?.forEach(item => {
                customerData[email].favoriteItems[item.name] = 
                    (customerData[email].favoriteItems[item.name] || 0) + item.quantity;
            });
        });

        // Add reviews
        reviews.forEach(review => {
            const email = review.created_by;
            if (customerData[email]) {
                customerData[email].reviews.push(review);
            }
        });

        // Calculate segments
        const customers = Object.values(customerData).map(customer => {
            customer.orderCount = customer.orders.length;
            customer.avgOrderValue = customer.totalSpent / customer.orderCount;
            
            const daysSinceFirst = (new Date() - new Date(customer.firstOrder)) / (1000 * 60 * 60 * 24);
            const daysSinceLast = (new Date() - new Date(customer.lastOrder)) / (1000 * 60 * 60 * 24);
            
            customer.avgRating = customer.reviews.length > 0
                ? customer.reviews.reduce((sum, r) => sum + r.rating, 0) / customer.reviews.length
                : null;
            
            // Determine segment
            if (customer.orderCount >= 10 && customer.totalSpent >= 200) {
                customer.segment = 'vip';
            } else if (customer.orderCount >= 5) {
                customer.segment = 'frequent';
            } else if (daysSinceFirst <= 30) {
                customer.segment = 'new';
            } else if (daysSinceLast >= 60) {
                customer.segment = 'at_risk';
            } else {
                customer.segment = 'regular';
            }
            
            // Top item
            const topItem = Object.entries(customer.favoriteItems)
                .sort((a, b) => b[1] - a[1])[0];
            customer.favoriteItem = topItem ? topItem[0] : 'N/A';
            
            return customer;
        });

        // Segment stats
        const segments = {
            all: customers.length,
            vip: customers.filter(c => c.segment === 'vip').length,
            frequent: customers.filter(c => c.segment === 'frequent').length,
            new: customers.filter(c => c.segment === 'new').length,
            at_risk: customers.filter(c => c.segment === 'at_risk').length,
            regular: customers.filter(c => c.segment === 'regular').length,
        };

        return { customers, segments };
    }, [orders, reviews]);

    const filteredCustomers = useMemo(() => {
        return customerAnalytics.customers.filter(customer => {
            const matchesSegment = selectedSegment === 'all' || customer.segment === selectedSegment;
            const matchesSearch = !searchQuery || customer.email.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesSegment && matchesSearch;
        }).sort((a, b) => b.totalSpent - a.totalSpent);
    }, [customerAnalytics.customers, selectedSegment, searchQuery]);

    const sendMessageMutation = useMutation({
        mutationFn: async ({ emails, message }) => {
            // In production, this would send actual emails via the SendEmail integration
            const promises = emails.map(email => 
                base44.integrations.Core.SendEmail({
                    to: email,
                    subject: `Special Offer from ${restaurantId}`,
                    body: message
                })
            );
            await Promise.all(promises);
        },
        onSuccess: () => {
            toast.success('Messages sent successfully!');
            setMessageDialog(false);
            setMessageContent('');
            setTargetSegment(null);
        },
    });

    const handleSendToSegment = (segment) => {
        const customers = customerAnalytics.customers.filter(c => 
            segment === 'all' ? true : c.segment === segment
        );
        setTargetSegment({ segment, count: customers.length, emails: customers.map(c => c.email) });
        setMessageDialog(true);
    };

    const handleSendMessage = () => {
        if (!messageContent.trim()) {
            toast.error('Please enter a message');
            return;
        }
        sendMessageMutation.mutate({
            emails: targetSegment.emails,
            message: messageContent
        });
    };

    const segmentConfig = {
        vip: { label: 'VIP Customers', color: 'bg-purple-100 text-purple-700', icon: Star },
        frequent: { label: 'Frequent Buyers', color: 'bg-blue-100 text-blue-700', icon: TrendingUp },
        new: { label: 'New Customers', color: 'bg-green-100 text-green-700', icon: Users },
        at_risk: { label: 'At Risk', color: 'bg-red-100 text-red-700', icon: Filter },
        regular: { label: 'Regular', color: 'bg-gray-100 text-gray-700', icon: Users },
    };

    if (isLoading) {
        return <div className="text-center py-8">Loading customer data...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Customers</p>
                                <p className="text-2xl font-bold">{customerAnalytics.segments.all}</p>
                            </div>
                            <Users className="h-8 w-8 text-gray-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">VIP Customers</p>
                                <p className="text-2xl font-bold">{customerAnalytics.segments.vip}</p>
                            </div>
                            <Star className="h-8 w-8 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">New This Month</p>
                                <p className="text-2xl font-bold">{customerAnalytics.segments.new}</p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">At Risk</p>
                                <p className="text-2xl font-bold">{customerAnalytics.segments.at_risk}</p>
                            </div>
                            <Filter className="h-8 w-8 text-red-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Segment Filters & Search */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search customers by email..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Button
                                variant={selectedSegment === 'all' ? 'default' : 'outline'}
                                onClick={() => setSelectedSegment('all')}
                                size="sm"
                            >
                                All ({customerAnalytics.segments.all})
                            </Button>
                            {Object.entries(segmentConfig).map(([key, config]) => (
                                <Button
                                    key={key}
                                    variant={selectedSegment === key ? 'default' : 'outline'}
                                    onClick={() => setSelectedSegment(key)}
                                    size="sm"
                                >
                                    {config.label} ({customerAnalytics.segments[key]})
                                </Button>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Targeted Communication */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Targeted Communication
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <Button
                            onClick={() => handleSendToSegment('all')}
                            variant="outline"
                            className="justify-start"
                        >
                            <Mail className="h-4 w-4 mr-2" />
                            Message All Customers
                        </Button>
                        {Object.entries(segmentConfig).map(([key, config]) => (
                            <Button
                                key={key}
                                onClick={() => handleSendToSegment(key)}
                                variant="outline"
                                className="justify-start"
                                disabled={customerAnalytics.segments[key] === 0}
                            >
                                <Mail className="h-4 w-4 mr-2" />
                                {config.label} ({customerAnalytics.segments[key]})
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Customer List */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        Customer Details ({filteredCustomers.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[500px]">
                        <div className="space-y-3">
                            {filteredCustomers.map((customer) => {
                                const config = segmentConfig[customer.segment];
                                return (
                                    <Card key={customer.email} className="cursor-pointer hover:shadow-md transition-shadow">
                                        <CardContent className="pt-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="font-semibold text-gray-900">{customer.email}</p>
                                                        <Badge className={config.color}>
                                                            {config.label}
                                                        </Badge>
                                                    </div>
                                                    {customer.avgRating && (
                                                        <div className="flex items-center gap-1 text-sm text-gray-600">
                                                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                                            {customer.avgRating.toFixed(1)} avg rating
                                                        </div>
                                                    )}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setSelectedCustomer(customer)}
                                                >
                                                    View Details
                                                </Button>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                <div>
                                                    <p className="text-gray-500">Orders</p>
                                                    <p className="font-semibold">{customer.orderCount}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-500">Total Spent</p>
                                                    <p className="font-semibold text-green-600">£{customer.totalSpent.toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-500">Avg Order</p>
                                                    <p className="font-semibold">£{customer.avgOrderValue.toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-500">Favorite</p>
                                                    <p className="font-semibold text-xs truncate">{customer.favoriteItem}</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* Customer Detail Dialog */}
            <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Customer Details</DialogTitle>
                        <DialogDescription>{selectedCustomer?.email}</DialogDescription>
                    </DialogHeader>
                    {selectedCustomer && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <Card>
                                    <CardContent className="pt-4">
                                        <p className="text-sm text-gray-600">Total Orders</p>
                                        <p className="text-2xl font-bold">{selectedCustomer.orderCount}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4">
                                        <p className="text-sm text-gray-600">Total Spent</p>
                                        <p className="text-2xl font-bold text-green-600">
                                            £{selectedCustomer.totalSpent.toFixed(2)}
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">Order History</h4>
                                <ScrollArea className="h-64 border rounded-lg p-4">
                                    <div className="space-y-2">
                                        {selectedCustomer.orders.map((order) => (
                                            <div key={order.id} className="flex justify-between items-center text-sm border-b pb-2">
                                                <div>
                                                    <p className="font-medium">Order #{order.id.slice(-6)}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {format(new Date(order.created_date), 'MMM d, yyyy')}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-semibold">£{order.total.toFixed(2)}</p>
                                                    <Badge variant="outline" className="text-xs">
                                                        {order.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>

                            {selectedCustomer.reviews.length > 0 && (
                                <div>
                                    <h4 className="font-semibold mb-2">Reviews</h4>
                                    <div className="space-y-2">
                                        {selectedCustomer.reviews.map((review) => (
                                            <Card key={review.id}>
                                                <CardContent className="pt-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Star
                                                                key={i}
                                                                className={`h-4 w-4 ${
                                                                    i < review.rating
                                                                        ? 'fill-yellow-400 text-yellow-400'
                                                                        : 'text-gray-300'
                                                                }`}
                                                            />
                                                        ))}
                                                    </div>
                                                    {review.review_text && (
                                                        <p className="text-sm text-gray-700">{review.review_text}</p>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Message Dialog */}
            <Dialog open={messageDialog} onOpenChange={setMessageDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Send Targeted Message</DialogTitle>
                        <DialogDescription>
                            {targetSegment && `Sending to ${targetSegment.count} customers in ${
                                targetSegment.segment === 'all' ? 'all segments' : segmentConfig[targetSegment.segment]?.label
                            }`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Textarea
                            placeholder="Enter your promotional message..."
                            value={messageContent}
                            onChange={(e) => setMessageContent(e.target.value)}
                            rows={6}
                        />
                        <div className="flex gap-2">
                            <Button onClick={() => setMessageDialog(false)} variant="outline" className="flex-1">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSendMessage}
                                disabled={sendMessageMutation.isPending}
                                className="flex-1"
                            >
                                <Send className="h-4 w-4 mr-2" />
                                Send Messages
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}