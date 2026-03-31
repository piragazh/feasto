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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, TrendingUp, DollarSign, Mail, Search, Filter, Send, Star, Percent, Calendar, Leaf, Phone, MapPin, Wand2, Loader2, ChevronRight, MessageSquare, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import CRMCustomerProfile from './CRMCustomerProfile';
import CRMCampaignDialog from './CRMCampaignDialog';
import WinBackCampaignWorkflow from './WinBackCampaignWorkflow';

export default function CustomerCRM({ restaurantId, restaurantName = 'Our Restaurant' }) {
    const [selectedSegment, setSelectedSegment] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [campaignDialog, setCampaignDialog] = useState(false);
    const [targetSegment, setTargetSegment] = useState(null);
    const [activeTab, setActiveTab] = useState('segments');
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
        
        // Orders come sorted by -created_date so first encountered = most recent
        // Group primarily by phone number, fall back to email, then unique order ID
        orders.forEach(order => {
            const phone = order.phone;
            const email = order.created_by || order.guest_email;
            const key = phone || email || `unknown_${order.id}`;

            if (!customerData[key]) {
                customerData[key] = {
                    email: email || '',
                    guestName: order.guest_name || null,
                    phone: phone || null,
                    lastAddress: order.delivery_address || null,
                    orders: [],
                    totalSpent: 0,
                    avgOrderValue: 0,
                    firstOrder: order.created_date,
                    lastOrder: order.created_date,
                    favoriteItems: {},
                    reviews: []
                };
            }

            // Keep most recent contact details (first encounter is most recent due to sort order)
            if (order.phone && !customerData[key].phone) customerData[key].phone = order.phone;
            if (order.delivery_address && !customerData[key].lastAddress) customerData[key].lastAddress = order.delivery_address;
            if (order.guest_name && !customerData[key].guestName) customerData[key].guestName = order.guest_name;
            if (email && !customerData[key].email) customerData[key].email = email;

            customerData[key].orders.push(order);
            customerData[key].totalSpent += order.total || 0;
            // firstOrder = earliest date, so take the minimum
            if (order.created_date < customerData[key].firstOrder) {
                customerData[key].firstOrder = order.created_date;
            }
            // lastOrder = most recent, keep the maximum
            if (order.created_date > customerData[key].lastOrder) {
                customerData[key].lastOrder = order.created_date;
            }
            
            // Track favorite items and dietary preferences
            order.items?.forEach(item => {
                customerData[key].favoriteItems[item.name] = 
                    (customerData[key].favoriteItems[item.name] || 0) + item.quantity;
                
                // Detect dietary preferences from ordered items
                const menuItem = menuItems.find(m => m.name === item.name);
                if (menuItem) {
                    if (menuItem.is_vegetarian) {
                        customerData[key].vegetarianOrders = (customerData[key].vegetarianOrders || 0) + 1;
                    }
                    if (menuItem.is_spicy) {
                        customerData[key].spicyOrders = (customerData[key].spicyOrders || 0) + 1;
                    }
                }
            });
        });

        // Add reviews — try to match by phone first, then email
        reviews.forEach(review => {
            const reviewEmail = review.created_by || review.customer_email;
            // Find the customer key: prefer phone match, then email match
            const matchedKey = Object.keys(customerData).find(key => {
                const c = customerData[key];
                return (reviewEmail && c.email === reviewEmail);
            });
            if (matchedKey) {
                customerData[matchedKey].reviews.push(review);
            }
        });

        // Calculate segments
        const customers = Object.values(customerData).map(customer => {
            customer.orderCount = customer.orders.length;
            customer.avgOrderValue = customer.orderCount > 0 ? customer.totalSpent / customer.orderCount : 0;

            const daysSinceFirst = customer.firstOrder
                ? (new Date() - new Date(customer.firstOrder)) / (1000 * 60 * 60 * 24)
                : 0;
            const daysSinceLast = customer.lastOrder
                ? (new Date() - new Date(customer.lastOrder)) / (1000 * 60 * 60 * 24)
                : 0;
            
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
            const avgDaysBetweenOrders = customer.orderCount > 1 ? daysSinceFirst / customer.orderCount : daysSinceFirst;
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
            const lq = searchQuery.toLowerCase();
            const matchesSearch = !searchQuery ||
                (customer.email && customer.email.toLowerCase().includes(lq)) ||
                (customer.guestName && customer.guestName.toLowerCase().includes(lq)) ||
                (customer.phone && customer.phone.includes(searchQuery));
            
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

    const handleSendToSegment = (segment) => {
        const customers = customerAnalytics.customers.filter(c =>
            segment === 'all' ? true : c.segment === segment
        );
        setTargetSegment({
            segment,
            count: customers.length,
            recipients: customers.map(c => ({ email: c.email, phone: c.phone, name: c.guestName }))
        });
        setCampaignDialog(true);
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
            {/* Tab Navigation */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="segments">Customer Segments</TabsTrigger>
                    <TabsTrigger value="winback">Win-Back Campaign</TabsTrigger>
                </TabsList>

                <TabsContent value="segments" className="space-y-6">
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
                                   placeholder="Search by name, email or phone..."
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
                                        <SelectItem value="occasional">{"Occasional (>1 month)"}</SelectItem>
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
                                        <SelectItem value="low">Low (&lt;£100)</SelectItem>
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
                        <Send className="h-5 w-5" />
                        Campaigns — Email · SMS · WhatsApp
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <Button
                            onClick={() => handleSendToSegment('all')}
                            variant="outline"
                            className="justify-start"
                        >
                            <Send className="h-4 w-4 mr-2 text-orange-500" />
                            Campaign — All Customers
                        </Button>
                        {Object.entries(segmentConfig).map(([key, config]) => (
                            <Button
                                key={key}
                                onClick={() => handleSendToSegment(key)}
                                variant="outline"
                                className="justify-start"
                                disabled={customerAnalytics.segments[key] === 0}
                            >
                                <Send className="h-4 w-4 mr-2 text-orange-500" />
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
                                    <Card key={customer.phone || customer.email} className="cursor-pointer hover:shadow-md transition-shadow">
                                        <CardContent className="pt-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <p className="font-semibold text-gray-900">
                                                               {customer.guestName || customer.phone || customer.email}
                                                            </p>
                                                        <Badge className={config.color}>{config.label}</Badge>
                                                    </div>
                                                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                                                        {customer.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{customer.email}</span>}
                                                        {customer.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>}
                                                    </div>
                                                    {customer.avgRating && (
                                                        <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
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
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Customer Profile</DialogTitle>
                        <DialogDescription>{selectedCustomer?.guestName || selectedCustomer?.phone || selectedCustomer?.email}</DialogDescription>
                    </DialogHeader>
                    {selectedCustomer && (
                        <CRMCustomerProfile
                            customer={selectedCustomer}
                            onClose={() => setSelectedCustomer(null)}
                            restaurantName={restaurantName}
                        />
                    )}
                </DialogContent>
            </Dialog>

                    {/* Campaign Dialog */}
                    <CRMCampaignDialog
                        open={campaignDialog}
                        onClose={() => setCampaignDialog(false)}
                        targetSegment={targetSegment}
                        segmentConfig={segmentConfig}
                        restaurantName={restaurantName}
                        restaurantId={restaurantId}
                    />
                </TabsContent>

                <TabsContent value="winback">
                    <WinBackCampaignWorkflow
                        restaurantId={restaurantId}
                        restaurantName={restaurantName}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}