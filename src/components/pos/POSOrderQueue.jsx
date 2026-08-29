import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Split, Percent, Search, Ban } from 'lucide-react';
import { toast } from 'sonner';
import OrderSearch from './OrderSearch';
import OrderEditDialog from './OrderEditDialog';
import BillSplitDialog from './BillSplitDialog';
import ApplyPromotionDialog from './ApplyPromotionDialog';
import VoidOrderDialog from './VoidOrderDialog';

export default function POSOrderQueue({ restaurantId, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const t = {
        bg:         isDark ? 'bg-[#151720]'               : 'bg-white',
        border:     isDark ? 'border-gray-700'             : 'border-gray-200',
        colHeader:  isDark ? 'bg-gray-700/50'              : 'bg-gray-100',
        card:       isDark ? 'bg-[#1a1d27] border-white/[0.06]' : 'bg-white border-gray-200',
        text:       isDark ? 'text-white'                  : 'text-gray-900',
        textMuted:  isDark ? 'text-gray-400'               : 'text-gray-500',
        textSub:    isDark ? 'text-gray-300'               : 'text-gray-600',
        emptyText:  isDark ? 'text-gray-400'               : 'text-gray-400',
        clearBtn:   isDark ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200',
    };

    const [searchResults, setSearchResults] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);
    const [splittingOrder, setSplittingOrder] = useState(null);
    const [applyingPromo, setApplyingPromo] = useState(null);
    const [voidingOrder, setVoidingOrder] = useState(null);

    const { data: orders = [], refetch, isLoading } = useQuery({
        queryKey: ['pos-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId, status: { $in: ['pending', 'confirmed', 'preparing', 'ready_for_collection', 'out_for_delivery'] } }, '-created_date', 100),
        enabled: !!restaurantId,
        refetchInterval: 5000,
    });

    const statusGroups = {
        pending: orders.filter(o => o.status === 'pending'),
        confirmed: orders.filter(o => o.status === 'confirmed'),
        preparing: orders.filter(o => o.status === 'preparing'),
        ready: orders.filter(o => o.status === 'ready_for_collection'),
        out_for_delivery: orders.filter(o => o.status === 'out_for_delivery'),
    };

    const updateOrderStatus = async (orderId, newStatus) => {
        try {
            // SECURITY: Route card order cancellations through rejectOrderWithRefund
            const order = orders.find(o => o.id === orderId);
            if (newStatus === 'cancelled' && order?.payment_method === 'card' && order?.payment_intent_id) {
                // Use refund workflow for card payments
                const result = await base44.functions.invoke('rejectOrderWithRefund', {
                    order_id: orderId,
                    rejection_reason: 'Cancelled by staff (POS)',
                });
                if (result?.data?.success) {
                    const msg = result.data.refunded 
                        ? `Order cancelled and refunded (ID: ${result.data.refund_id})`
                        : 'Order cancelled. Refund pending manual review.';
                    toast.success(msg);
                } else {
                    toast.error(result?.data?.message || 'Failed to cancel order');
                }
            } else {
                // Non-card or non-cancelled: use regular status update
                await base44.entities.Order.update(orderId, { status: newStatus });
                toast.success('Order status updated');
            }
            refetch();
        } catch (error) {
            console.error('Failed to update order:', error);
            toast.error('Failed to update order');
        }
    };

    const handleSearch = (query) => {
        const results = orders.filter(order => 
            order.id.toLowerCase().includes(query.toLowerCase()) ||
            order.notes?.toLowerCase().includes(query.toLowerCase())
        );
        setSearchResults(results.length > 0 ? results : []);
    };

    // Apply a server-validated coupon to an existing order
    const handleApplyCouponToOrder = async (couponResult) => {
        const order = applyingPromo;
        if (!order || !couponResult?.valid) return;

        try {
            const existingCodes = Array.isArray(order.coupon_codes) ? [...order.coupon_codes] : (order.coupon_code ? [order.coupon_code] : []);
            // Avoid duplicates
            if (!existingCodes.includes(couponResult.coupon_code)) {
                existingCodes.push(couponResult.coupon_code);
            }
            const newCodes = existingCodes.slice(0, 3); // max 3

            const newDiscount = (order.discount || 0) + couponResult.discount_amount;
            const newTotal = Math.max(0, (order.total || 0) - couponResult.discount_amount);

            await base44.entities.Order.update(order.id, {
                coupon_codes: newCodes,
                coupon_code: newCodes[0], // legacy compat
                discount: parseFloat(newDiscount.toFixed(2)),
                total: parseFloat(newTotal.toFixed(2)),
            });

            toast.success(`Coupon ${couponResult.coupon_code} applied — £${couponResult.discount_amount.toFixed(2)} off`);
            setApplyingPromo(null);
            refetch();
        } catch (err) {
            console.error('[POSOrderQueue] Failed to apply coupon to order:', err);
            toast.error(err?.message || 'Failed to apply coupon to order');
        }
    };

    const StatusBadge = ({ status }) => {
        const styles = {
            pending: 'bg-red-500',
            confirmed: 'bg-yellow-500',
            preparing: 'bg-blue-500',
            ready_for_collection: 'bg-green-500',
        };
        return <Badge className={styles[status] || 'bg-gray-500'}>{status}</Badge>;
    };

    const displayOrders = searchResults !== null ? { search: searchResults } : statusGroups;

    // Explicit first-load state. Without it the queue renders as five empty
    // columns while data is in flight, which reads as "no orders" during service
    // and leads staff to re-tap or assume the till has lost the order.
    if (isLoading && orders.length === 0) {
        return (
            <div className="grid gap-4 grid-cols-4">
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`${t.bg} rounded-xl border ${t.border} p-4`}>
                        <div className={`h-8 rounded-lg mb-4 animate-pulse ${t.colHeader}`} />
                        <div className="space-y-2">
                            {[0, 1].map(j => (
                                <div key={j} className={`h-24 rounded-lg animate-pulse ${t.colHeader} opacity-60`} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // Grid is 5 columns now that Out for Delivery exists as its own group.
    return (
        <div>
            <OrderSearch onSearch={handleSearch} />

            {searchResults !== null && (
                <Button
                    onClick={() => setSearchResults(null)}
                    variant="outline"
                    className={`mb-4 border ${t.clearBtn}`}
                >
                    Clear Search
                </Button>
            )}

            <div className={`grid gap-4 ${searchResults !== null ? 'grid-cols-1' : 'grid-cols-2 xl:grid-cols-5'}`}>
                {Object.entries(displayOrders).map(([status, statusOrders]) => (
                <div key={status} className={`${t.bg} rounded-xl border ${t.border} p-4`}>
                    <h3 className={`${t.text} font-bold mb-4 capitalize text-center p-2 ${t.colHeader} rounded-lg text-sm`}>
                        {status.replace('_', ' ')} ({statusOrders.length})
                    </h3>
                    <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                        {statusOrders.length === 0 ? (
                            <p className={`${t.emptyText} text-center text-sm py-4`}>No orders</p>
                        ) : (
                            statusOrders.map(order => (
                                <Card key={order.id} className={`${t.card} border`}>
                                    <CardContent className="p-3">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className={`${t.text} font-bold`}>#{order.id.slice(0, 8)}</p>
                                                <p className={`${t.textMuted} text-xs`}>{new Date(order.created_date).toLocaleTimeString()}</p>
                                            </div>
                                            <StatusBadge status={order.status} />
                                        </div>
                                        
                                        <div className={`mb-3 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'} pt-2`}>
                                            {order.items.map((item, idx) => (
                                                <p key={idx} className={`${t.textSub} text-sm`}>
                                                    {item.quantity}x {item.name}
                                                </p>
                                            ))}
                                        </div>

                                        <p className="text-orange-500 font-bold mb-3">£{order.total.toFixed(2)}</p>

                                        <div className="space-y-2 flex flex-col gap-1 mb-3">
                                            <div className="grid grid-cols-3 gap-1">
                                                <Button
                                                    onClick={() => setEditingOrder(order)}
                                                    size="sm"
                                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7"
                                                    title="Edit items, add/remove, change quantities"
                                                >
                                                    <Edit2 className="h-3 w-3 mr-1" />
                                                    Edit
                                                </Button>
                                                <Button
                                                    onClick={() => setSplittingOrder(order)}
                                                    size="sm"
                                                    className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-7"
                                                    title="Split bill between customers"
                                                >
                                                    <Split className="h-3 w-3 mr-1" />
                                                    Split
                                                </Button>
                                                <Button
                                                    onClick={() => setApplyingPromo(order)}
                                                    size="sm"
                                                    className="bg-green-600 hover:bg-green-700 text-white text-xs h-7"
                                                    title="Apply discount or promotion"
                                                >
                                                    <Percent className="h-3 w-3 mr-1" />
                                                    Promo
                                                </Button>
                                            </div>
                                            <Button
                                                onClick={() => setVoidingOrder(order)}
                                                size="sm"
                                                className="w-full bg-red-600/90 hover:bg-red-600 text-white text-xs h-7"
                                                title="Void / cancel this order"
                                            >
                                                <Ban className="h-3 w-3 mr-1" />
                                                Void
                                            </Button>
                                        </div>

                                        <div className="space-y-1 flex flex-col gap-1">
                                            {status === 'pending' && (
                                                <Button
                                                    onClick={() => updateOrderStatus(order.id, 'confirmed')}
                                                    className="w-full bg-yellow-600 hover:bg-yellow-700 text-white text-xs h-8"
                                                >
                                                    Confirm
                                                </Button>
                                            )}
                                            {status === 'confirmed' && (
                                                <Button
                                                    onClick={() => updateOrderStatus(order.id, 'preparing')}
                                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
                                                >
                                                    Start Preparing
                                                </Button>
                                            )}
                                            {status === 'preparing' && (
                                                <Button
                                                    onClick={() => updateOrderStatus(order.id, order.order_type === 'delivery' ? 'out_for_delivery' : 'ready_for_collection')}
                                                    className="w-full bg-green-600 hover:bg-green-700 text-white text-xs h-8"
                                                >
                                                    {order.order_type === 'delivery' ? 'Send Out' : 'Mark Ready'}
                                                </Button>
                                            )}
                                            {/* Final step - without this the order stays in the queue forever.
                                                Delivery orders complete as 'delivered', everything else as
                                                'collected'; both are terminal so the order leaves the queue. */}
                                            {(status === 'ready' || status === 'out_for_delivery') && (
                                                <Button
                                                    onClick={() => updateOrderStatus(order.id, order.order_type === 'delivery' ? 'delivered' : 'collected')}
                                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                                                >
                                                    {order.order_type === 'delivery' ? 'Mark Delivered' : 'Mark Collected'}
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </div>
                ))}
                </div>

                {editingOrder && (
                <OrderEditDialog
                    order={editingOrder}
                    open={!!editingOrder}
                    onClose={() => setEditingOrder(null)}
                    onUpdate={refetch}
                    restaurantId={restaurantId}
                />
                )}

                {splittingOrder && (
                <BillSplitDialog
                    order={splittingOrder}
                    open={!!splittingOrder}
                    onClose={() => setSplittingOrder(null)}
                    onUpdate={refetch}
                    posTheme={posTheme}
                />
                )}

                {applyingPromo && (
                <ApplyPromotionDialog
                    open={!!applyingPromo}
                    onClose={() => setApplyingPromo(null)}
                    onApplyCoupon={handleApplyCouponToOrder}
                    restaurantId={restaurantId}
                    cartSubtotal={applyingPromo?.subtotal || applyingPromo?.total || 0}
                    customerPhone={applyingPromo?.customer_phone || applyingPromo?.phone || null}
                    customerEmail={applyingPromo?.customer_email || null}
                    hasManualDiscount={!!applyingPromo?.discount && !applyingPromo?.coupon_codes?.length && !applyingPromo?.coupon_code}
                    appliedCouponCount={Array.isArray(applyingPromo?.coupon_codes) ? applyingPromo.coupon_codes.length : (applyingPromo?.coupon_code ? 1 : 0)}
                    posTheme={posTheme}
                />
                )}

                {voidingOrder && (
                <VoidOrderDialog
                    order={voidingOrder}
                    open={!!voidingOrder}
                    onClose={() => setVoidingOrder(null)}
                    onUpdate={refetch}
                    isDark={isDark}
                />
                )}
                </div>
                );
                }