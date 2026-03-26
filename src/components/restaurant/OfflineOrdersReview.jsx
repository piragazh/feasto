import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, WifiOff, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';

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
    const [filterStatus, setFilterStatus] = useState('flagged'); // 'flagged' | 'all_offline'

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

    const flaggedCount = offlineOrders.filter(o => o.needs_review).length;
    const totalOfflineCount = offlineOrders.length;

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
                            {filterStatus === 'flagged'
                                ? 'No offline orders flagged for review'
                                : 'No offline orders'}
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <WifiOff className="h-4 w-4 text-amber-500" />
                        Offline Orders
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button
                            variant={filterStatus === 'flagged' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('flagged')}
                        >
                            {flaggedCount > 0 && (
                                <span className="inline-block h-2 w-2 bg-red-500 rounded-full mr-2" />
                            )}
                            Flagged ({flaggedCount})
                        </Button>
                        <Button
                            variant={filterStatus === 'all_offline' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('all_offline')}
                        >
                            All Offline ({totalOfflineCount})
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {offlineOrders.map(order => (
                        <div
                            key={order.id}
                            className={`border rounded-lg p-3 ${
                                order.needs_review
                                    ? 'bg-yellow-50 border-yellow-300'
                                    : 'bg-gray-50 border-gray-200'
                            }`}
                        >
                            {/* Header: Order number + flagged badge */}
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <p className="font-semibold text-sm text-gray-900">
                                        Order {order.order_number || order.id.slice(-8)}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                        £{order.total.toFixed(2)} · {order.items?.length || 0} items
                                    </p>
                                </div>
                                {order.needs_review && (
                                    <Badge className="bg-yellow-200 text-yellow-900 text-xs">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        Needs Review
                                    </Badge>
                                )}
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

                            {/* Timestamps */}
                            <div className="flex gap-3 text-xs text-gray-600 border-t border-gray-200 pt-2">
                                <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-gray-500" />
                                    <span>Created: {formatTime(order.offline_created_at)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-gray-500" />
                                    <span>Synced: {formatTime(order.offline_synced_at)}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}