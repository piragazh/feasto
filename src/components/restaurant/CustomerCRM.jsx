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
import { Users, TrendingUp, DollarSign, Mail, Search, Filter, Send, Star, Percent, Calendar, Leaf } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function CustomerCRM({ restaurantId }) {
    const [selectedSegment, setSelectedSegment] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [messageDialog, setMessageDialog] = useState(false);
    const [messageContent, setMessageContent] = useState('');
    const [targetSegment, setTargetSegment] = useState(null);
    const [offerType, setOfferType] = useState('message');
    const [discountValue, setDiscountValue] = useState('');
    const [offerTitle, setOfferTitle] = useState('');
    const [advancedFilters, setAdvancedFilters] = useState({
        orderFrequency: 'all',
        spendingLevel: 'all',
        dietaryPreference: 'all',
        lastOrderDays: 'all'
    });
    const queryClient = useQueryClient();

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['crm-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 1000),
    });

    const { data: reviews = [] } = useQuery({
        queryKey: ['crm-reviews', restaurantId],
        queryFn: () => base44.entities.Review.filter({ restaurant_id: restaurantId }),
    });

    const { data: menuItems = [] } = useQuery({
        queryKey: ['crm-menu', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
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
            
            // Track favorite items and dietary preferences
            order.items?.forEach(item => {
                customerData[email].favoriteItems[item.name] = 
                    (customerData[email].favoriteItems[item.name] || 0) + item.quantity;
                
                // Detect dietary preferences from ordered items
                const menuItem = menuItems.find(m => m.name === item.name);
                if (menuItem) {
                    if (menuItem.is_vegetarian) {
                        customerData[email].vegetarianOrders = (customerData[email].vegetarianOrders || 0) + 1;
                    }
                    if (menuItem.is_spicy) {
                        customerData[email].spicyOrders = (customerData[email].spicyOrders || 0) + 1;
                    }
                }
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
            
            customer.daysSinceLast = daysSinceLast;
            
            customer.avgRating = customer.reviews.length > 0
                ? customer.reviews.reduce((sum, r) => sum + r.rating, 0) / customer.reviews.length
                : null;
            
            // Detect dietary preferences
            const totalOrders = customer.orderCount;
            const vegPercent = (customer.vegetarianOrders || 0) / totalOrders;
            const spicyPercent = (customer.spicyOrders || 0) / totalOrders;
            
            if (vegPercent >= 0.7) {
                customer.dietaryPreference = 'vegetarian';
            } else if (spicyPercent >= 0.6) {
                customer.dietaryPreference = 'spicy';
            } else {
                customer.dietaryPreference = 'none';
            }
            
            // Determine spending level
            if (customer.totalSpent >= 300) {
                customer.spendingLevel = 'high';
            } else if (customer.totalSpent >= 100) {
                customer.spendingLevel = 'medium';
            } else {
                customer.spendingLevel = 'low';
            }
            
            // Determine order frequency
            const avgDaysBetweenOrders = daysSinceFirst / customer.orderCount;
            if (avgDaysBetweenOrders <= 14) {
                customer.orderFrequency = 'frequent';
            } else if (avgDaysBetweenOrders <= 30) {
                customer.orderFrequency = 'regular';
            } else {
                customer.orderFrequency = 'occasional';
            }
            
            // Loyalty status based on multiple factors
            if (customer.orderCount >= 15 && customer.totalSpent >= 300) {
                customer.loyaltyStatus = 'platinum';
            } else if (customer.orderCount >= 10 && customer.totalSpent >= 200) {
                customer.loyaltyStatus = 'gold';
            } else if (customer.orderCount >= 5 && customer.totalSpent >= 100) {
                customer.loyaltyStatus = 'silver';
            } else {
                customer.loyaltyStatus = 'bronze';
            }
            
            // Determine segment
            if (customer.loyaltyStatus === 'platinum' || customer.loyaltyStatus === 'gold') {
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
            
            // Advanced filters
            const matchesFrequency = advancedFilters.orderFrequency === 'all' || customer.orderFrequency === advancedFilters.orderFrequency;
            const matchesSpending = advancedFilters.spendingLevel === 'all' || customer.spendingLevel === advancedFilters.spendingLevel;
            const matchesDietary = advancedFilters.dietaryPreference === 'all' || customer.dietaryPreference === advancedFilters.dietaryPreference;
            
            const matchesLastOrder = (() => {
                if (advancedFilters.lastOrderDays === 'all') return true;
                const days = parseInt(advancedFilters.lastOrderDays);
                return customer.daysSinceLast <= days;
            })();
            
            return matchesSegment && matchesSearch && matchesFrequency && matchesSpending && matchesDietary && matchesLastOrder;
        }).sort((a, b) => b.totalSpent - a.totalSpent);
    }, [customerAnalytics.customers, selectedSegment, searchQuery, advancedFilters]);

    const sendMessageMutation = useMutation({
        mutationFn: async ({ emails, message, offerData }) => {
            // In production, this would send actual emails via the SendEmail integration
            const subject = offerData?.title || `Special Offer from Restaurant`;
            let body = message;
            
            if (offerData?.type === 'discount') {
                body = `${offerData.title}\n\n${message}\n\nDiscount: ${offerData.value}% off\n\nUse this offer on your next order!`;
            } else if (offerData?.type === 'freeDelivery') {
                body = `${offerData.title}\n\n${message}\n\nEnjoy FREE DELIVERY on your next order!`;
            }
            
            const promises = emails.map(email => 
                base44.integrations.Core.SendEmail({
                    to: email,
                    subject,
                    body
                })
            );
            await Promise.all(promises);
        },
        onSuccess: () => {
            toast.success('Promotional offers sent successfully!');
            setMessageDialog(false);
            setMessageContent('');
            setTargetSegment(null);
            setOfferType('message');
            setDiscountValue('');
            setOfferTitle('');
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
        
        if (offerType !== 'message' && !offerTitle.trim()) {
            toast.error('Please enter an offer title');
            return;
        }
        
        if (offerType === 'discount' && (!discountValue || discountValue <= 0)) {
            toast.error('Please enter a valid discount percentage');
            return;
        }
        
        const offerData = offerType === 'message' ? null : {
            type: offerType,
            title: offerTitle,
            value: discountValue
        };
        
        sendMessageMutation.mutate({
            emails: targetSegment.emails,
            message: messageContent,
            offerData
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
                <CardContent className="pt-6 space-y-4">
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
                    
                    {/* Advanced Filters */}
                    <div className="border-t pt-4">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Filter className="h-4 w-4" />
                            Advanced Filters
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <Label className="text-xs">Order Frequency</Label>
                                <Select value={advancedFilters.orderFrequency} onValueChange={(v) => setAdvancedFilters({...advancedFilters, orderFrequency: v})}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="frequent">Frequent (≤2 weeks)</SelectItem>
                                        <SelectItem value="regular">Regular (2-4 weeks)</SelectItem>
                                        <SelectItem value="occasional">Occasional (>1 month)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div>
                                <Label className="text-xs">Spending Level</Label>
                                <Select value={advancedFilters.spendingLevel} onValueChange={(v) => setAdvancedFilters({...advancedFilters, spendingLevel: v})}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="high">High (≥£300)</SelectItem>
                                        <SelectItem value="medium">Medium (£100-300)</SelectItem>
                                        <SelectItem value="low">Low (<£100)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div>
                                <Label className="text-xs flex items-center gap-1">
                                    <Leaf className="h-3 w-3" />
                                    Dietary Preference
                                </Label>
                                <Select value={advancedFilters.dietaryPreference} onValueChange={(v) => setAdvancedFilters({...advancedFilters, dietaryPreference: v})}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="vegetarian">Vegetarian</SelectItem>
                                        <SelectItem value="spicy">Spicy Food</SelectItem>
                                        <SelectItem value="none">No Preference</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div>
                                <Label className="text-xs flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Last Order
                                </Label>
                                <Select value={advancedFilters.lastOrderDays} onValueChange={(v) => setAdvancedFilters({...advancedFilters, lastOrderDays: v})}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Time</SelectItem>
                                        <SelectItem value="7">Last 7 days</SelectItem>
                                        <SelectItem value="30">Last 30 days</SelectItem>
                                        <SelectItem value="60">Last 60 days</SelectItem>
                                        <SelectItem value="90">Last 90 days</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
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
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                                               <div>
                                                   <p className="text-gray-500">Orders</p>
                                                   <p className="font-semibold">{customer.orderCount}</p>
                                               </div>
                                               <div>
                                                   <p className="text-gray-500">Total Spent</p>
                                                   <p className="font-semibold text-green-600">£{customer.totalSpent.toFixed(2)}</p>
                                               </div>
                                               <div>
                                                   <p className="text-gray-500">Loyalty</p>
                                                   <Badge variant="outline" className="text-xs">
                                                       {customer.loyaltyStatus}
                                                   </Badge>
                                               </div>
                                               <div>
                                                   <p className="text-gray-500">Diet Pref</p>
                                                   <p className="font-semibold text-xs">{customer.dietaryPreference === 'none' ? '-' : customer.dietaryPreference}</p>
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
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Send Targeted Promotional Offer</DialogTitle>
                        <DialogDescription>
                            {targetSegment && `Sending to ${targetSegment.count} customers in ${
                                targetSegment.segment === 'all' ? 'all segments' : segmentConfig[targetSegment.segment]?.label
                            }`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Offer Type</Label>
                            <Select value={offerType} onValueChange={setOfferType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="message">Message Only</SelectItem>
                                    <SelectItem value="discount">
                                        <div className="flex items-center gap-2">
                                            <Percent className="h-4 w-4" />
                                            Percentage Discount
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="freeDelivery">
                                        <div className="flex items-center gap-2">
                                            🚚 Free Delivery
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {offerType !== 'message' && (
                            <>
                                <div>
                                    <Label>Offer Title</Label>
                                    <Input
                                        placeholder="e.g., Special Weekend Offer!"
                                        value={offerTitle}
                                        onChange={(e) => setOfferTitle(e.target.value)}
                                    />
                                </div>
                                
                                {offerType === 'discount' && (
                                    <div>
                                        <Label>Discount Percentage</Label>
                                        <Input
                                            type="number"
                                            placeholder="e.g., 15"
                                            value={discountValue}
                                            onChange={(e) => setDiscountValue(e.target.value)}
                                            min="0"
                                            max="100"
                                        />
                                    </div>
                                )}
                            </>
                        )}
                        
                        <div>
                            <Label>Message</Label>
                            <Textarea
                                placeholder="Enter your promotional message..."
                                value={messageContent}
                                onChange={(e) => setMessageContent(e.target.value)}
                                rows={6}
                            />
                        </div>
                        
                        {offerType !== 'message' && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-sm font-semibold text-blue-900 mb-1">Preview:</p>
                                <p className="text-xs text-blue-700">
                                    {offerTitle || 'Offer Title'} - {offerType === 'discount' ? `${discountValue || '0'}% off` : 'Free Delivery'}
                                </p>
                            </div>
                        )}
                        
                        <div className="flex gap-2">
                            <Button onClick={() => setMessageDialog(false)} variant="outline" className="flex-1">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSendMessage}
                                disabled={sendMessageMutation.isPending}
                                className="flex-1 bg-orange-500 hover:bg-orange-600"
                            >
                                <Send className="h-4 w-4 mr-2" />
                                {sendMessageMutation.isPending ? 'Sending...' : 'Send Offer'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}