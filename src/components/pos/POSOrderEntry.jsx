import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Minus, ShoppingCart, X } from 'lucide-react';
import { toast } from 'sonner';
import POSItemCustomization from './POSItemCustomization';
import POSPayment from './POSPayment';

export default function POSOrderEntry({ restaurantId, cart, onAddItem, onRemoveItem, onUpdateQuantity, onClearCart, cartTotal, orderType, setOrderType }) {
     const [searchQuery, setSearchQuery] = useState('');
     const [selectedCategory, setSelectedCategory] = useState('');
     const [customizationOpen, setCustomizationOpen] = useState(false);
     const [selectedItem, setSelectedItem] = useState(null);
     const [selectedTable, setSelectedTable] = useState(null);
     const [showPayment, setShowPayment] = useState(false);

    const { data: menuItems = [] } = useQuery({
        queryKey: ['pos-menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true }),
        enabled: !!restaurantId,
    });

    const { data: tables = [] } = useQuery({
        queryKey: ['pos-tables', restaurantId],
        queryFn: () => base44.entities.RestaurantTable.filter({ restaurant_id: restaurantId, is_active: true }),
        enabled: !!restaurantId,
    });

    const categories = [...new Set(menuItems.map(item => item.category).filter(Boolean))];
    
    const filteredItems = menuItems.filter(item => {
        const matchesCategory = !selectedCategory || item.category === selectedCategory;
        const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const handleItemClick = (item) => {
         if (item.customization_options?.length) {
             setSelectedItem(item);
             setCustomizationOpen(true);
         } else {
             onAddItem(item);
         }
     };

     const handleCustomizationConfirm = (itemWithCustomizations) => {
         onAddItem(itemWithCustomizations);
         setCustomizationOpen(false);
         setSelectedItem(null);
     };

     const handlePaymentComplete = async () => {
         if (cart.length === 0) {
             toast.error('Cart is empty');
             return;
         }

         if (orderType === 'dine_in' && !selectedTable) {
             toast.error('Please select a table for dine-in order');
             return;
         }

         try {
             const orderData = {
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
                 status: orderType === 'takeaway' ? 'confirmed' : 'pending',
                 order_type: orderType,
                 payment_method: 'cash'
             };

             if (orderType === 'dine_in') {
                 orderData.table_id = selectedTable.id;
                 orderData.table_number = selectedTable.table_number;
             }

             await base44.entities.Order.create(orderData);

             toast.success('Order created successfully!');
             onClearCart();
             setShowPayment(false);
             setSelectedTable(null);
             setOrderType('collection');
         } catch (error) {
             toast.error('Failed to create order');
         }
     };

     if (showPayment && cart.length > 0) {
        return (
            <POSPayment 
                cart={cart} 
                cartTotal={cartTotal} 
                onPaymentComplete={handlePaymentComplete}
            />
        );
     }

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
                        className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 mb-3 text-lg h-14 px-4"
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant={!selectedCategory ? "default" : "outline"}
                            onClick={() => setSelectedCategory('')}
                            className="text-lg h-14 px-6 bg-orange-500 hover:bg-orange-600 font-bold"
                        >
                            All
                        </Button>
                        {categories.map(cat => (
                            <Button
                                key={cat}
                                variant={selectedCategory === cat ? "default" : "outline"}
                                onClick={() => setSelectedCategory(cat)}
                                className={`text-lg h-14 px-6 font-bold ${selectedCategory === cat ? 'bg-orange-500' : 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'}`}
                            >
                                {cat}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2">
                    {filteredItems.map(item => (
                        <div
                            key={item.id}
                            onClick={() => handleItemClick(item)}
                            className="flex items-center gap-2 p-2 bg-gray-700 border border-gray-600 rounded hover:border-orange-500 hover:shadow-md transition-all cursor-pointer group"
                        >
                            <div className="w-12 h-12 flex-shrink-0 bg-gray-600 rounded overflow-hidden">
                                {item.image_url ? (
                                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-gray-500 flex items-center justify-center">
                                        <ShoppingCart className="h-5 w-5 text-gray-400" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-white text-sm line-clamp-1 group-hover:text-orange-400 transition-colors">{item.name}</h3>
                                <p className="text-orange-400 font-bold text-base">£{item.price.toFixed(2)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Cart Section */}
             <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
                 <div className="p-4 border-b border-gray-700">
                     <h2 className="text-white font-bold text-lg">Cart</h2>
                     {orderType === 'dine_in' && selectedTable && (
                         <div className="bg-gray-700 p-2 rounded mt-2 text-center">
                             <p className="text-gray-400 text-xs">Table: <span className="text-white font-bold">{selectedTable.table_number}</span></p>
                         </div>
                     )}
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
                                        onClick={() => onRemoveItem(item.id)}
                                        className="text-red-400 hover:text-red-500 bg-red-500/10 hover:bg-red-500/20 h-12 w-12 rounded-full transition-all font-bold"
                                    >
                                        <X className="h-6 w-6" />
                                    </Button>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <Button
                                        onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                                        className="h-12 px-3 bg-gray-600 hover:bg-gray-700 text-white font-bold text-lg rounded"
                                    >
                                        <Minus className="h-5 w-5" />
                                    </Button>
                                    <span className="text-white font-bold text-lg flex-1 text-center min-w-12">{item.quantity}</span>
                                    <Button
                                        onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                                        className="h-12 px-3 bg-gray-600 hover:bg-gray-700 text-white font-bold text-lg rounded"
                                    >
                                        <Plus className="h-5 w-5" />
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
                        onClick={() => setShowPayment(true)}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-16 text-xl"
                    >
                        Proceed to Payment
                    </Button>
                    <Button
                        onClick={onClearCart}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold h-14 text-lg"
                    >
                        Clear Cart
                    </Button>
                </div>
            </div>

            {selectedItem && (
                <POSItemCustomization
                    item={selectedItem}
                    open={customizationOpen}
                    onClose={() => {
                        setCustomizationOpen(false);
                        setSelectedItem(null);
                    }}
                    onConfirm={handleCustomizationConfirm}
                />
            )}
        </div>
    );
}