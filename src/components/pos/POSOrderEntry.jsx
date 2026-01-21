import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';

export default function POSOrderEntry({ restaurantId, cart, onAddItem, onRemoveItem, onUpdateQuantity, onClearCart, cartTotal }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');

    const { data: menuItems = [] } = useQuery({
        queryKey: ['pos-menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true }),
        enabled: !!restaurantId,
    });

    const categories = [...new Set(menuItems.map(item => item.category).filter(Boolean))];
    
    const filteredItems = menuItems.filter(item => {
        const matchesCategory = !selectedCategory || item.category === selectedCategory;
        const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const handleCompleteOrder = async () => {
        if (cart.length === 0) {
            toast.error('Cart is empty');
            return;
        }

        try {
            const order = await base44.entities.Order.create({
                restaurant_id: restaurantId,
                items: cart.map(item => ({
                    menu_item_id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity
                })),
                subtotal: cartTotal,
                delivery_fee: 0,
                discount: 0,
                total: cartTotal,
                status: 'pending',
                order_type: 'collection',
                payment_method: 'cash'
            });

            toast.success(`Order #${order.id.slice(0, 8)} created!`);
            onClearCart();
        } catch (error) {
            toast.error('Failed to create order');
        }
    };

    return (
        <div className="grid grid-cols-3 gap-4 h-[calc(100vh-200px)]">
            {/* Menu Section */}
            <div className="col-span-2 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-700">
                    <Input
                        type="text"
                        placeholder="Search items..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 mb-3"
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant={!selectedCategory ? "default" : "outline"}
                            onClick={() => setSelectedCategory('')}
                            className="text-base h-11 px-4 bg-orange-500 hover:bg-orange-600"
                        >
                            All
                        </Button>
                        {categories.map(cat => (
                            <Button
                                key={cat}
                                variant={selectedCategory === cat ? "default" : "outline"}
                                onClick={() => setSelectedCategory(cat)}
                                className={`text-base h-11 px-4 ${selectedCategory === cat ? 'bg-orange-500' : 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'}`}
                            >
                                {cat}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 grid grid-cols-4 gap-2">
                    {filteredItems.map(item => (
                        <Card
                            key={item.id}
                            onClick={() => onAddItem(item)}
                            className="cursor-pointer bg-gray-700 border-gray-600 hover:border-orange-500 hover:shadow-lg transition-all"
                        >
                            <CardContent className="p-1 flex gap-2">
                                <div className="bg-gray-600 rounded w-12 h-12 flex-shrink-0">
                                    {item.image_url && (
                                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover rounded" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-white text-xs line-clamp-1">{item.name}</h3>
                                    <p className="text-orange-400 font-bold text-xs">£{item.price.toFixed(2)}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Cart Section */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-700">
                    <h2 className="text-white font-bold text-lg">Cart</h2>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {cart.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No items in cart</p>
                    ) : (
                        cart.map(item => (
                            <div key={item.id} className="bg-gray-700 p-3 rounded border border-gray-600">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-white font-semibold text-sm">{item.name}</p>
                                        <p className="text-orange-400 text-sm">£{item.price.toFixed(2)}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onRemoveItem(item.id)}
                                        className="text-red-400 hover:text-red-300 h-8 w-8"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="flex items-center justify-between bg-gray-600 rounded p-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                                        className="h-6 w-6 text-white"
                                    >
                                        <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="text-white font-bold">{item.quantity}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                                        className="h-6 w-6 text-white"
                                    >
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="border-t border-gray-700 p-4 space-y-3">
                    <div className="bg-gray-700 p-3 rounded">
                        <p className="text-gray-400 text-sm mb-1">Total</p>
                        <p className="text-white text-3xl font-bold">£{cartTotal.toFixed(2)}</p>
                    </div>
                    <Button
                        onClick={handleCompleteOrder}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-12"
                    >
                        Complete Order
                    </Button>
                    <Button
                        onClick={onClearCart}
                        variant="outline"
                        className="w-full bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                    >
                        Clear
                    </Button>
                </div>
            </div>
        </div>
    );
}