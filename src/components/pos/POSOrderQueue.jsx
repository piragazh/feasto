import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Split, Percent, Search } from 'lucide-react';
import { toast } from 'sonner';
import OrderSearch from './OrderSearch';
import OrderEditDialog from './OrderEditDialog';
import BillSplitDialog from './BillSplitDialog';
import ApplyPromotionDialog from './ApplyPromotionDialog';

export default function POSOrderQueue({ restaurantId }) {
    const [searchResults, setSearchResults] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);
    const [splittingOrder, setSplittingOrder] = useState(null);
    const [applyingPromo, setApplyingPromo] = useState(null);

    const { data: orders = [], refetch } = useQuery({
        queryKey: ['pos-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
        refetchInterval: 5000,
    });

    const statusGroups = {
        pending: orders.filter(o => o.status === 'pending'),
        confirmed: orders.filter(o => o.status === 'confirmed'),
        preparing: orders.filter(o => o.status === 'preparing'),
        ready: orders.filter(o => o.status === 'ready_for_collection'),
    };

    const updateOrderStatus = async (orderId, newStatus) => {
        try {
            await base44.entities.Order.update(orderId, { status: newStatus });
            refetch();
            toast.success('Order status updated');
        } catch (error) {
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

    return (
        <div>
            <OrderSearch onSearch={handleSearch} />

            {searchResults !== null && (
                <Button
                    onClick={() => setSearchResults(null)}
                    variant="outline"
                    className="mb-4 bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                >
                    Clear Search
                </Button>
            )}

            <div className={`grid gap-4 ${searchResults !== null ? 'grid-cols-1' : 'grid-cols-4'}`}>
                {Object.entries(displayOrders).map(([status, statusOrders]) => (
                <div key={status} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                    <h3 className="text-white font-bold mb-4 capitalize text-center p-2 bg-gray-700 rounded">
                        {status.replace('_', ' ')} ({statusOrders.length})
                    </h3>
                    <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                        {statusOrders.length === 0 ? (
                            <p className="text-gray-400 text-center text-sm py-4">No orders</p>
                        ) : (
                            statusOrders.map(order => (
                                <Card key={order.id} className="bg-gray-700 border-gray-600">
                                    <CardContent className="p-3">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="text-white font-bold">#{order.id.slice(0, 8)}</p>
                                                <p className="text-gray-400 text-xs">{new Date(order.created_date).toLocaleTimeString()}</p>
                                            </div>
                                            <StatusBadge status={order.status} />
                                        </div>
                                        
                                        <div className="mb-3 border-t border-gray-600 pt-2">
                                            {order.items.map((item, idx) => (
                                                <p key={idx} className="text-gray-300 text-sm">
                                                    {item.quantity}x {item.name}
                                                </p>
                                            ))}
                                        </div>

                                        <p className="text-orange-400 font-bold mb-3">£{order.total.toFixed(2)}</p>

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
                                                    onClick={() => updateOrderStatus(order.id, 'ready_for_collection')}
                                                    className="w-full bg-green-600 hover:bg-green-700 text-white text-xs h-8"
                                                >
                                                    Mark Ready
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

            {/* Edit Dialog */}
            {editingOrder && (
                <OrderEditDialog
                    order={editingOrder}
                    open={!!editingOrder}
                    onClose={() => setEditingOrder(null)}
                    onUpdate={refetch}
                    restaurantId={restaurantId}
                />
            )}

            {/* Bill Split Dialog */}
            {splittingOrder && (
                <BillSplitDialog
                    order={splittingOrder}
                    open={!!splittingOrder}
                    onClose={() => setSplittingOrder(null)}
                    onUpdate={refetch}
                />
            )}

            {/* Promotion Dialog */}
            {applyingPromo && (
                <ApplyPromotionDialog
                    order={applyingPromo}
                    open={!!applyingPromo}
                    onClose={() => setApplyingPromo(null)}
                    onUpdate={refetch}
                    restaurantId={restaurantId}
                />
            )}
            </div>
            );
            }