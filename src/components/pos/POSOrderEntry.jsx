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
     const [optimisticCart, setOptimisticCart] = useState(cart);

     React.useEffect(() => {
         setOptimisticCart(cart);
     }, [cart]);

     const handleQuantityChange = (itemId, newQuantity) => {
         // Optimistic update
         setOptimisticCart(prev => 
             prev.map(item => 
                 item.id === itemId 
                     ? { ...item, quantity: newQuantity }
                     : item
             )
         );
         // Actual update
         onUpdateQuantity(itemId, newQuantity);
     };

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
                onBackToCart={() => setShowPayment(false)}
            />
        );
     }

     return (
        <div className="flex flex-col h-[calc(100vh-200px)]">
            {/* Main 3-Column Layout */}
            <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden pb-4">
                {/* Left: Categories/Menu */}
                <div className="col-span-2 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-700">
                        <h2 className="text-white font-bold text-lg mb-3">Categories</h2>
                        <div className="flex flex-col gap-2">
                            <Button
                                variant={!selectedCategory ? "default" : "outline"}
                                onClick={() => setSelectedCategory('')}
                                className={`w-full justify-start text-base h-12 px-4 font-bold ${!selectedCategory ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'}`}
                            >
                                All Items
                            </Button>
                            {categories.map(cat => (
                                <Button
                                    key={cat}
                                    variant={selectedCategory === cat ? "default" : "outline"}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`w-full justify-start text-base h-12 px-4 font-bold ${selectedCategory === cat ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'}`}
                                >
                                    {cat}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Middle: Items Grid */}
                <div className="col-span-7 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-700">
                        <Input
                            type="text"
                            placeholder="Search items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 text-lg h-12 px-4"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {filteredItems.map(item => (
                            <div
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className="bg-gray-700 border border-gray-600 rounded-lg p-3 hover:border-orange-500 hover:shadow-lg transition-all cursor-pointer group flex flex-col"
                            >
                                <div className="w-full aspect-square bg-gray-600 rounded-lg overflow-hidden mb-2">
                                    {item.image_url ? (
                                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-gray-500 flex items-center justify-center">
                                            <ShoppingCart className="h-8 w-8 text-gray-400" />
                                        </div>
                                    )}
                                </div>
                                <h3 className="font-bold text-white text-sm line-clamp-2 group-hover:text-orange-400 transition-colors mb-1">{item.name}</h3>
                                <p className="text-orange-400 font-bold text-lg mt-auto">£{item.price.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Cart */}
                <div className="col-span-3 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-700">
                        <h2 className="text-white font-bold text-lg">Cart</h2>
                        {orderType === 'dine_in' && selectedTable && (
                            <div className="bg-gray-700 p-2 rounded mt-2 text-center">
                                <p className="text-gray-400 text-xs">Table: <span className="text-white font-bold">{selectedTable.table_number}</span></p>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {optimisticCart.length === 0 ? (
                            <p className="text-gray-400 text-center py-8 text-sm">No items in cart</p>
                        ) : (
                            optimisticCart.map(item => (
                                <div key={item.id} className="bg-gray-700 p-2 rounded border border-gray-600">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1 pr-2">
                                            <p className="text-white font-semibold text-xs leading-tight">{item.name}</p>
                                            {item.customizations && Object.keys(item.customizations).length > 0 && (
                                                <div className="text-gray-300 text-[9px] mt-0.5 space-y-0.5 max-h-10 overflow-hidden">
                                                    {Object.entries(item.customizations).map(([key, value]) => (
                                                        <p key={key} className="line-clamp-1 truncate">
                                                            {key}: {Array.isArray(value) ? value.join(', ') : value}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                            <p className="text-orange-400 text-sm mt-1 font-bold">£{item.price.toFixed(2)}</p>
                                        </div>
                                        <Button
                                            onClick={() => onRemoveItem(item.id)}
                                            className="text-red-400 hover:text-red-500 bg-red-500/10 hover:bg-red-500/20 h-8 w-8 rounded-full transition-all p-0 flex items-center justify-center"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                            className="h-9 w-9 p-0 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded flex items-center justify-center"
                                        >
                                            <Minus className="h-4 w-4" />
                                        </Button>
                                        <span className="text-white font-bold text-base flex-1 text-center">{item.quantity}</span>
                                        <Button
                                            onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                            className="h-9 w-9 p-0 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded flex items-center justify-center"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="border-t border-gray-700 p-3 space-y-2">
                        <div className="bg-gray-700 p-2 rounded">
                            <p className="text-gray-400 text-xs">Total</p>
                            <p className="text-white text-2xl font-bold">£{cartTotal.toFixed(2)}</p>
                        </div>
                        <Button
                            onClick={() => setShowPayment(true)}
                            disabled={optimisticCart.length === 0}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-14 text-lg disabled:opacity-50"
                        >
                            <ShoppingCart className="h-5 w-5 mr-2" />
                            Proceed to Payment
                        </Button>
                        <Button
                            onClick={onClearCart}
                            disabled={optimisticCart.length === 0}
                            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold h-12 text-base disabled:opacity-50"
                        >
                            <Trash2 className="h-5 w-5 mr-2" />
                            Clear Cart
                        </Button>
                    </div>
                </div>
            </div>

            {/* Bottom: Sticky Function Buttons */}
            <div className="grid grid-cols-4 gap-3 pt-3 border-t border-gray-700">
                <Button className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold text-base border border-gray-600">
                    Function 1
                </Button>
                <Button className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold text-base border border-gray-600">
                    Function 2
                </Button>
                <Button className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold text-base border border-gray-600">
                    Function 3
                </Button>
                <Button className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold text-base border border-gray-600">
                    Function 4
                </Button>
                <Button className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold text-base border border-gray-600">
                    Function 5
                </Button>
                <Button className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold text-base border border-gray-600">
                    Function 6
                </Button>
                <Button className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold text-base border border-gray-600">
                    Function 7
                </Button>
                <Button className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold text-base border border-gray-600">
                    Function 8
                </Button>
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