import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, WifiOff, CheckCircle2, Clock, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import OfflineOrderReviewAction from './OfflineOrderReviewAction';
import OfflineReviewHealthIndicator from './OfflineReviewHealthIndicator';
import OfflineReviewAnalytics from './OfflineReviewAnalytics';
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";

/**
 * Offline Orders Review
 * 
 * Displays offline-created orders requiring manager review:
 * - Orders flagged during sync validation (needs_review=true)
 * - Shows sync_validation_notes explaining what was flagged
 * - Timestamps: offline_created_at, offline_synced_at
 * - Allow manager to acknowledge/archive flagged orders
 */
export default function OfflineOrdersReview({ restaurantId }) {
    const [filterStatus, setFilterStatus] = useState('flagged'); // 'flagged' | 'unresolved' | 'all_offline'

    const { data: offlineOrders = [], isLoading, refetch } = useQuery({
        queryKey: ['offline-orders', restaurantId, filterStatus],
        queryFn: async () => {
            if (filterStatus === 'flagged') {
                // Get orders that were offline-created AND flagged for review
                return await base44.entities.Order.filter({
                    restaurant_id: restaurantId,
                    offline_created: true,
                    needs_review: true,
                });
            } else if (filterStatus === 'unresolved') {
                // Get flagged orders that are NOT yet reviewed (status = 'new')
                const flagged = await base44.entities.Order.filter({
                    restaurant_id: restaurantId,
                    offline_created: true,
                    needs_review: true,
                });
                return flagged.filter(o => !o.offline_review_status || o.offline_review_status === 'new');
            } else {
                // Get all offline-created orders
                return await base44.entities.Order.filter({
                    restaurant_id: restaurantId,
                    offline_created: true,
                });
            }
        },
        enabled: !!restaurantId,
        refetchInterval: 30000,
    });

    const formatTime = (isoStr) => {
        if (!isoStr) return '—';
        const d = new Date(isoStr);
        return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getReviewAge = (isoStr) => {
        if (!isoStr) return null;
        const d = new Date(isoStr);
        const now = new Date();
        const minutes = Math.floor((now.getTime() - d.getTime()) / (1000 * 60));
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    const isOverdue = (order) => {
        if (!order.offline_synced_at || order.offline_review_status !== 'new') return false;
        const hours = (new Date().getTime() - new Date(order.offline_synced_at).getTime()) / (1000 * 60 * 60);
        return hours > 4;
    };

    const flaggedCount = offlineOrders.filter(o => o.needs_review).length;
    const unresolvedCount = offlineOrders.filter(o => o.needs_review && (!o.offline_review_status || o.offline_review_status === 'new')).length;
    const totalOfflineCount = offlineOrders.filter(o => !o.filterStatus || o.filterStatus === 'all_offline').length;

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <WifiOff className="h-4 w-4 text-amber-500" />
                        Offline Orders
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-6">
                        <div className="w-8 h-8 border-4 border-gray-300 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-gray-600 text-sm">Loading offline orders...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (offlineOrders.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <WifiOff className="h-4 w-4 text-gray-400" />
                        Offline Orders
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-6">
                        <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-3" />
                        <p className="text-gray-600 text-sm">
                            {filterStatus === 'unresolved'
                                ? 'No pending reviews'
                                : filterStatus === 'flagged'
                                ? 'No offline orders flagged for review'
                                : 'No offline orders'}
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <OfflineReviewHealthIndicator orders={offlineOrders} />
            
            {/* Analytics tab */}
            <Tabs defaultValue="orders" className="w-full">
                <div className="flex gap-2 mb-4">
                    <TabsTrigger value="orders" className="gap-2">Orders</TabsTrigger>
                    <TabsTrigger value="analytics" className="gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Analysis
                    </TabsTrigger>
                </div>

                <TabsContent value="orders">
            <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <WifiOff className="h-4 w-4 text-amber-500" />
                        Offline Orders
                    </CardTitle>
                    <div className="flex gap-2 flex-wrap">
                        <Button
                            variant={filterStatus === 'unresolved' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('unresolved')}
                            className={unresolvedCount > 0 ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : ''}
                        >
                            {unresolvedCount > 0 && (
                                <span className="inline-block h-2 w-2 bg-red-500 rounded-full mr-2 animate-pulse" />
                            )}
                            Pending Review ({unresolvedCount})
                        </Button>
                        <Button
                            variant={filterStatus === 'flagged' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('flagged')}
                        >
                            All Flagged ({flaggedCount})
                        </Button>
                        <Button
                            variant={filterStatus === 'all_offline' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('all_offline')}
                        >
                            All Offline
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {offlineOrders
                        .sort((a, b) => {
                            // Sort by: overdue first, then by sync time (newer first)
                            const aOverdue = isOverdue(a) ? 0 : 1;
                            const bOverdue = isOverdue(b) ? 0 : 1;
                            if (aOverdue !== bOverdue) return aOverdue - bOverdue;
                            const aTime = new Date(a.offline_synced_at || 0).getTime();
                            const bTime = new Date(b.offline_synced_at || 0).getTime();
                            return bTime - aTime;
                        })
                        .map(order => (
                        <div
                            key={order.id}
                            className={`border rounded-lg p-3 transition-all ${
                                isOverdue(order)
                                    ? 'bg-red-50 border-red-400 ring-1 ring-red-200'
                                    : order.offline_review_status === 'escalated'
                                    ? 'bg-orange-50 border-orange-300'
                                    : order.needs_review
                                    ? 'bg-yellow-50 border-yellow-300'
                                    : 'bg-gray-50 border-gray-200'
                            }`}
                        >
                            {/* Header: Order number + badges */}
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <p className="font-semibold text-sm text-gray-900">
                                        Order {order.order_number || order.id.slice(-8)}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                        £{order.total.toFixed(2)} · {order.items?.length || 0} items
                                    </p>
                                </div>
                                <div className="flex gap-1.5">
                                    {isOverdue(order) && (
                                        <Badge className="bg-red-500 text-white text-xs animate-pulse">
                                            <AlertCircle className="h-3 w-3 mr-1" />
                                            OVERDUE
                                        </Badge>
                                    )}
                                    {order.needs_review && (
                                        <Badge className={`text-xs ${
                                            isOverdue(order) ? 'bg-red-200 text-red-900' : 'bg-yellow-200 text-yellow-900'
                                        }`}>
                                            <AlertCircle className="h-3 w-3 mr-1" />
                                            Needs Review
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            {/* Validation notes */}
                            {order.sync_validation_notes && (
                                <div className={`text-xs mb-2 p-2 rounded ${
                                    order.needs_review
                                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                                        : 'bg-gray-100 text-gray-700 border border-gray-200'
                                }`}>
                                    <p className="font-medium mb-0.5">Sync validation notes:</p>
                                    <p className="italic">{order.sync_validation_notes}</p>
                                </div>
                            )}

                            {/* Discount/Coupon info */}
                            {(order.discount > 0 || order.coupon_code) && (
                                <div className="text-xs text-gray-700 mb-2 space-y-0.5">
                                    {order.discount > 0 && (
                                        <p>
                                            <span className="font-medium">Manual discount:</span> £{order.discount.toFixed(2)}
                                            {order.discount_reason_code && (
                                                <span className="text-gray-600"> ({order.discount_reason_code.replace(/_/g, ' ')})</span>
                                            )}
                                        </p>
                                    )}
                                    {order.coupon_code && (
                                        <p>
                                            <span className="font-medium">Coupon:</span> {order.coupon_code}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Timestamps + Review Age */}
                            <div className="flex gap-3 text-xs text-gray-600 border-t border-gray-200 pt-2 mb-2 flex-wrap">
                                <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-gray-500" />
                                    <span>Created: {formatTime(order.offline_created_at)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-gray-500" />
                                    <span>Synced: {formatTime(order.offline_synced_at)}</span>
                                </div>
                                {!order.offline_review_status && (
                                    <div className={`flex items-center gap-1 font-medium ${isOverdue(order) ? 'text-red-600' : 'text-gray-600'}`}>
                                        <span>Pending: {getReviewAge(order.offline_synced_at)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Review status */}
                            {order.needs_review && (
                                <div className="pt-2 space-y-2 border-t border-gray-200">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-gray-700">Review Status:</span>
                                        <Badge className={`text-xs ${
                                            order.offline_review_status === 'acknowledged'
                                                ? 'bg-blue-100 text-blue-800'
                                                : order.offline_review_status === 'resolved'
                                                ? 'bg-green-100 text-green-800'
                                                : order.offline_review_status === 'escalated'
                                                ? 'bg-orange-100 text-orange-800'
                                                : 'bg-red-100 text-red-800'
                                        }`}>
                                            {order.offline_review_status || 'new'}
                                        </Badge>
                                    </div>
                                    {order.offline_review_by && (
                                        <div className="text-xs text-gray-600 space-y-1">
                                            <p>Reviewed by {order.offline_review_by.split('@')[0]} on {formatTime(order.offline_review_at)}</p>
                                            {order.offline_review_reason_code && (
                                                <p className="text-gray-700 font-medium bg-gray-50 px-2 py-1 rounded inline-block">
                                                    {order.offline_review_reason_code.split('_').join(' ')}
                                                </p>
                                            )}
                                            {order.offline_review_notes && (
                                                <p className="mt-1 italic text-gray-500">Note: {order.offline_review_notes}</p>
                                            )}
                                        </div>
                                    )}
                                    {(!order.offline_review_status || order.offline_review_status === 'new') && (
                                        <OfflineOrderReviewAction
                                            order={order}
                                            restaurantId={restaurantId}
                                            onReviewComplete={() => refetch()}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
                </TabsContent>

                <TabsContent value="analytics">
                    <OfflineReviewAnalytics orders={offlineOrders} />
                </TabsContent>
            </Tabs>
        </>
    );
}