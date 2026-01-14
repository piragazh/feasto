import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrendingUp, DollarSign, Gift, Percent, Search, Power, Ban, AlertTriangle } from 'lucide-react';
import { format, isAfter, isBefore, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function PromotionOversight() {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRestaurant, setFilterRestaurant] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedPromotion, setSelectedPromotion] = useState(null);
    const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, promotion: null });
    const queryClient = useQueryClient();

    const { data: promotions = [], isLoading } = useQuery({
        queryKey: ['all-promotions'],
        queryFn: async () => {
            const promos = await base44.asServiceRole.entities.Promotion.list();
            console.log('Loaded promotions:', promos);
            return promos.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        },
        refetchInterval: 30000,
    });

    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants-list'],
        queryFn: () => base44.asServiceRole.entities.Restaurant.list(),
    });

    const toggleActiveMutation = useMutation({
        mutationFn: ({ id, is_active }) => 
            base44.asServiceRole.entities.Promotion.update(id, { is_active }),
        onSuccess: () => {
            queryClient.invalidateQueries(['all-promotions']);
            toast.success('Promotion status updated');
            setConfirmDialog({ open: false, action: null, promotion: null });
        },
    });

    const getPromotionStatus = (promotion) => {
        const now = new Date();
        const start = new Date(promotion.start_date);
        const end = new Date(promotion.end_date);

        if (!promotion.is_active) return { label: 'Disabled', color: 'bg-gray-100 text-gray-700', icon: Ban };
        if (isAfter(now, end)) return { label: 'Expired', color: 'bg-red-100 text-red-700', icon: AlertTriangle };
        if (promotion.usage_limit && promotion.usage_count >= promotion.usage_limit) {
            return { label: 'Limit Reached', color: 'bg-orange-100 text-orange-700', icon: AlertTriangle };
        }
        if (isBefore(now, start)) return { label: 'Scheduled', color: 'bg-blue-100 text-blue-700', icon: TrendingUp };
        if (isWithinInterval(now, { start, end })) {
            return { label: 'Active', color: 'bg-green-100 text-green-700', icon: TrendingUp };
        }
        return { label: 'Inactive', color: 'bg-gray-100 text-gray-700', icon: Ban };
    };

    const getRestaurantName = (restaurantId) => {
        const restaurant = restaurants.find(r => r.id === restaurantId);
        return restaurant?.name || 'Unknown Restaurant';
    };

    const filteredPromotions = promotions.filter(promotion => {
        const matchesSearch = !searchQuery || 
            promotion.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            promotion.promotion_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            getRestaurantName(promotion.restaurant_id).toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesRestaurant = filterRestaurant === 'all' || promotion.restaurant_id === filterRestaurant;
        
        const status = getPromotionStatus(promotion);
        const matchesStatus = filterStatus === 'all' || 
            (filterStatus === 'active' && status.label === 'Active') ||
            (filterStatus === 'scheduled' && status.label === 'Scheduled') ||
            (filterStatus === 'expired' && status.label === 'Expired') ||
            (filterStatus === 'disabled' && status.label === 'Disabled');

        return matchesSearch && matchesRestaurant && matchesStatus;
    });

    const stats = {
        total: promotions.length,
        active: promotions.filter(p => getPromotionStatus(p).label === 'Active').length,
        totalRevenue: promotions.reduce((sum, p) => sum + (p.total_revenue_generated || 0), 0),
        totalDiscounts: promotions.reduce((sum, p) => sum + (p.total_discount_given || 0), 0),
    };

    const handleConfirmAction = (action, promotion) => {
        setConfirmDialog({ open: true, action, promotion });
    };

    const handleExecuteAction = () => {
        const { action, promotion } = confirmDialog;
        if (action === 'toggle') {
            toggleActiveMutation.mutate({ 
                id: promotion.id, 
                is_active: !promotion.is_active 
            });
        }
    };

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Promotions</p>
                                <p className="text-2xl font-bold">{stats.total}</p>
                            </div>
                            <Gift className="h-8 w-8 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Active Now</p>
                                <p className="text-2xl font-bold">{stats.active}</p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Revenue</p>
                                <p className="text-2xl font-bold">£{stats.totalRevenue.toFixed(2)}</p>
                            </div>
                            <DollarSign className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Discounts Given</p>
                                <p className="text-2xl font-bold">£{stats.totalDiscounts.toFixed(2)}</p>
                            </div>
                            <Percent className="h-8 w-8 text-orange-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search promotions..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={filterRestaurant} onValueChange={setFilterRestaurant}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Restaurants" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Restaurants</SelectItem>
                                {restaurants.map(restaurant => (
                                    <SelectItem key={restaurant.id} value={restaurant.id}>
                                        {restaurant.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="scheduled">Scheduled</SelectItem>
                                <SelectItem value="expired">Expired</SelectItem>
                                <SelectItem value="disabled">Disabled</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Promotions List */}
            <Card>
                <CardHeader>
                    <CardTitle>All Platform Promotions ({filteredPromotions.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                       <p className="text-center text-gray-500 py-8">Loading promotions...</p>
                    ) : promotions.length === 0 ? (
                       <div className="text-center py-12">
                           <Gift className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                           <h3 className="text-xl font-semibold text-gray-700 mb-2">No Promotions in System</h3>
                           <p className="text-gray-500">No promotions have been created yet</p>
                       </div>
                    ) : filteredPromotions.length === 0 ? (
                        <div className="text-center py-12">
                            <Gift className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">No Promotions Found</h3>
                            <p className="text-gray-500">Try adjusting your filters</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredPromotions.map(promotion => {
                                const status = getPromotionStatus(promotion);
                                const StatusIcon = status.icon;
                                
                                return (
                                    <div key={promotion.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h3 className="font-semibold text-lg">{promotion.name}</h3>
                                                    <Badge className={status.color}>
                                                        <StatusIcon className="h-3 w-3 mr-1" />
                                                        {status.label}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-gray-600 mb-2">
                                                    <span className="font-medium">Restaurant:</span> {getRestaurantName(promotion.restaurant_id)}
                                                </p>
                                                {promotion.description && (
                                                    <p className="text-sm text-gray-500 mb-2">{promotion.description}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mb-3">
                                            <div>
                                                <p className="text-gray-500">Type</p>
                                                <p className="font-medium capitalize">
                                                    {promotion.promotion_type.replace(/_/g, ' ')}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">Discount</p>
                                                <p className="font-medium">
                                                    {promotion.promotion_type === 'percentage_off' 
                                                        ? `${promotion.discount_value}%`
                                                        : promotion.promotion_type === 'buy_one_get_one' ? 'BOGO'
                                                        : promotion.promotion_type === 'free_delivery' ? 'Free'
                                                        : `£${promotion.discount_value}`}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">Period</p>
                                                <p className="font-medium">
                                                    {format(new Date(promotion.start_date), 'MMM d')} - {format(new Date(promotion.end_date), 'MMM d')}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">Usage</p>
                                                <p className="font-medium">
                                                    {promotion.usage_count || 0}
                                                    {promotion.usage_limit ? ` / ${promotion.usage_limit}` : ''}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">Revenue</p>
                                                <p className="font-medium text-green-600">
                                                    £{(promotion.total_revenue_generated || 0).toFixed(2)}
                                                </p>
                                            </div>
                                        </div>

                                        {promotion.promotion_code && (
                                            <div className="mb-3 pt-3 border-t">
                                                <p className="text-sm text-gray-600">
                                                    Promo Code: <span className="font-mono font-bold text-orange-600">{promotion.promotion_code}</span>
                                                </p>
                                            </div>
                                        )}

                                        <div className="flex gap-2 pt-3 border-t">
                                            <Button
                                                size="sm"
                                                variant={promotion.is_active ? "destructive" : "default"}
                                                onClick={() => handleConfirmAction('toggle', promotion)}
                                            >
                                                {promotion.is_active ? (
                                                    <>
                                                        <Ban className="h-4 w-4 mr-2" />
                                                        Disable
                                                    </>
                                                ) : (
                                                    <>
                                                        <Power className="h-4 w-4 mr-2" />
                                                        Enable
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Confirmation Dialog */}
            <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, action: null, promotion: null })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {confirmDialog.action === 'toggle' && confirmDialog.promotion?.is_active
                                ? 'Disable Promotion'
                                : 'Enable Promotion'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-gray-600">
                            Are you sure you want to {confirmDialog.promotion?.is_active ? 'disable' : 'enable'} the promotion "{confirmDialog.promotion?.name}"?
                        </p>
                        {confirmDialog.promotion?.is_active && (
                            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <p className="text-sm text-yellow-800">
                                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                                    This will prevent customers from using this promotion code.
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmDialog({ open: false, action: null, promotion: null })}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleExecuteAction}
                            disabled={toggleActiveMutation.isPending}
                            className={confirmDialog.promotion?.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
                        >
                            {toggleActiveMutation.isPending ? 'Processing...' : 'Confirm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}