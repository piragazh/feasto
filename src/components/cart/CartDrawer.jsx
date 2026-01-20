import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CartPromotions from './CartPromotions';
import CartQuickAddSection from './CartQuickAddSection';

export default function CartDrawer({ open, onOpenChange, cart, updateQuantity, removeFromCart, clearCart, restaurantName, restaurantId, orderType = 'delivery', onOrderTypeChange, onProceedToCheckout, collectionEnabled = false, restaurant = null, onPromotionApply = null }) {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = orderType === 'collection' ? 0 : (restaurant?.delivery_fee ?? 2.99);
    
    // Calculate small order surcharge (only for delivery orders)
    const minimumOrder = restaurant?.minimum_order || 0;
    const smallOrderSurcharge = orderType === 'delivery' && minimumOrder > 0 && subtotal < minimumOrder 
        ? (minimumOrder - subtotal) 
        : 0;
    
    const total = subtotal + deliveryFee + smallOrderSurcharge;

    const handleClearCart = () => {
        if (confirm('Clear all items from cart?')) {
            clearCart();
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
                <SheetHeader className="p-6 border-b">
                    <div className="flex items-center gap-3">
                        {restaurantId && (
                            <Link to={createPageUrl('Restaurant') + `?id=${restaurantId}`}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full hover:bg-gray-100"
                                    onClick={() => onOpenChange(false)}
                                >
                                    <ArrowLeft className="h-5 w-5" />
                                </Button>
                            </Link>
                        )}
                        <div className="flex-1 flex items-center justify-between">
                            <div>
                                <SheetTitle className="flex items-center gap-2">
                                    <ShoppingBag className="h-5 w-5" />
                                    Your Order
                                </SheetTitle>
                                {restaurantName && (
                                    <p className="text-sm text-gray-500">from {restaurantName}</p>
                                )}
                            </div>
                            {cart.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearCart}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Clear All
                                </Button>
                            )}
                        </div>
                    </div>
                </SheetHeader>

                {/* Quick Add Section */}
                {restaurantId && (
                    <QuickAddSection restaurantId={restaurantId} currentCart={cart} onItemClick={(item) => {
                        // Route to MenuItemCard click handler
                        if (item.customization_options?.length > 0) {
                            // Has customizations - would need modal
                            // For now, add directly
                            const existing = cart.find(i => i.menu_item_id === item.id && !i.customizations);
                            if (existing) {
                                updateQuantity(existing.menu_item_id, existing.quantity + 1);
                            } else {
                                const newItem = {
                                    menu_item_id: item.id,
                                    name: item.name,
                                    price: item.price,
                                    quantity: 1,
                                    image_url: item.image_url
                                };
                                // setCart would need to be passed, use a callback instead
                            }
                        }
                    }} />
                )}

                {/* Promotions Section */}
                {cart.length > 0 && restaurantId && (
                    <CartPromotions restaurantId={restaurantId} subtotal={subtotal} onPromotionApply={onPromotionApply} />
                )}

                {/* Order Type Selector */}
                {cart.length > 0 && onOrderTypeChange && collectionEnabled && (
                    <div className="px-6 pt-4 pb-2 bg-gray-50 border-b">
                        <div className="flex gap-2">
                            <button
                                onClick={() => onOrderTypeChange('delivery')}
                                className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all ${
                                    orderType === 'delivery'
                                        ? 'bg-orange-500 text-white shadow-sm'
                                        : 'bg-white text-gray-700 hover:bg-gray-100 border'
                                }`}
                            >
                                🚚 Delivery
                            </button>
                            <button
                                onClick={() => onOrderTypeChange('collection')}
                                className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all ${
                                    orderType === 'collection'
                                        ? 'bg-orange-500 text-white shadow-sm'
                                        : 'bg-white text-gray-700 hover:bg-gray-100 border'
                                }`}
                            >
                                🏪 Collection <span className="text-xs">FREE</span>
                            </button>
                        </div>
                    </div>
                )}
                
                <div className="flex-1 overflow-y-auto p-6">
                    {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <ShoppingBag className="h-10 w-10 text-gray-400" />
                            </div>
                            <h3 className="font-medium text-gray-900 mb-2">Your cart is empty</h3>
                            <p className="text-gray-500 text-sm">Add items from a restaurant to get started</p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            <div className="space-y-4">
                                {cart.map((item) => (
                                    <motion.div
                                        key={item.menu_item_id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -100 }}
                                        className="flex gap-4 p-4 bg-gray-50 rounded-xl"
                                    >
                                        {item.image_url && (
                                            <img
                                                src={item.image_url}
                                                alt={item.name}
                                                className="w-16 h-16 rounded-lg object-cover"
                                                loading="lazy"
                                            />
                                        )}
                                        <div className="flex-1">
                                            <h4 className="font-medium text-gray-900">{item.name}</h4>
                                            {item.is_category_deal && item.selected_items && (
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {item.selected_items.map(si => si.name).join(', ')}
                                                </p>
                                            )}
                                            <p className="text-orange-500 font-semibold">£{(item.price * item.quantity).toFixed(2)}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <button
                                                onClick={() => removeFromCart(item.menu_item_id)}
                                                className="text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                            <div className="flex items-center gap-2 bg-white rounded-full border px-1">
                                                <button
                                                    onClick={() => updateQuantity(item.menu_item_id, item.quantity - 1)}
                                                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </button>
                                                <span className="w-6 text-center font-medium text-sm">{item.quantity}</span>
                                                <button
                                                    onClick={() => updateQuantity(item.menu_item_id, item.quantity + 1)}
                                                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </AnimatePresence>
                    )}
                </div>
                
                {cart.length > 0 && (
                    <div className="border-t p-6 bg-white">
                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-gray-600">
                                <span>Subtotal</span>
                                <span>£{subtotal.toFixed(2)}</span>
                            </div>
                            {orderType === 'delivery' && (
                                <div className="flex justify-between text-gray-600">
                                    <span>Delivery Fee</span>
                                    <span>£{deliveryFee.toFixed(2)}</span>
                                </div>
                            )}
                            {orderType === 'collection' && (
                                <div className="flex justify-between text-green-600 font-medium">
                                    <span>🏪 Collection Savings</span>
                                    <span>FREE</span>
                                </div>
                            )}
                            {smallOrderSurcharge > 0 && (
                                <div className="flex justify-between text-orange-600">
                                    <span>Small Order Fee</span>
                                    <span>£{smallOrderSurcharge.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-semibold text-lg pt-3 border-t">
                                <span>Total</span>
                                <span>£{total.toFixed(2)}</span>
                            </div>
                            {smallOrderSurcharge > 0 && (
                                <div className="text-xs text-gray-500 pt-1">
                                    * Minimum order: £{minimumOrder.toFixed(2)}
                                </div>
                            )}
                        </div>
                        <Button 
                            onClick={() => {
                                if (onProceedToCheckout) {
                                    onProceedToCheckout();
                                }
                            }}
                            className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-lg"
                        >
                            {orderType === 'collection' ? 'Schedule Collection' : 'Go to Checkout'}
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}