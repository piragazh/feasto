import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CartPromotions from './CartPromotions';
import CartQuickAddContainer from './CartQuickAddContainer';

export default function CartDrawer({ open, onOpenChange, cart, updateQuantity, removeFromCart, clearCart, restaurantName, restaurantId, orderType = 'delivery', onOrderTypeChange, onProceedToCheckout, collectionEnabled = false, restaurant = null, onPromotionApply = null, onAddItem = null }) {

    const [optimisticCart, setOptimisticCart] = React.useState(cart);

    React.useEffect(() => {
        setOptimisticCart(cart);
    }, [cart]);

    const handleQuantityChange = (itemId, newQuantity) => {
        // Optimistic update
        setOptimisticCart(prev => 
            prev.map(item => 
                item.menu_item_id === itemId 
                    ? { ...item, quantity: newQuantity }
                    : item
            )
        );
        // Actual update
        updateQuantity(itemId, newQuantity);
    };

    const subtotal = optimisticCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Tiered delivery logic
    const tiered = restaurant?.tiered_delivery;
    const standardFee = restaurant?.delivery_fee ?? 0;
    const standardMinimum = restaurant?.minimum_order ?? 0;

    let deliveryFee = orderType === 'collection' ? 0 : standardFee;
    // Only enforce minimum in cart drawer when tiered pricing is active.
    // When tiered is off, the real minimum comes from the delivery zone (checked at checkout).
    let minimumOrder = 0;
    let activeTierLabel = null;

    if (orderType === 'delivery' && tiered?.enabled && (tiered.lower_minimum ?? 0) > 0) {
        const lowerMin = tiered.lower_minimum;
        const lowerFee = tiered.lower_minimum_fee ?? 0;
        if (subtotal < lowerMin) {
            // Below tiered minimum — block checkout
            minimumOrder = lowerMin;
        } else if (subtotal < standardMinimum) {
            // In tiered range — allow checkout with tiered fee, don't block
            deliveryFee = lowerFee;
            minimumOrder = 0;
            activeTierLabel = `£${lowerFee.toFixed(2)} delivery fee`;
        }
    }

    const total = subtotal + deliveryFee;

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
                <CartQuickAddContainer 
                    restaurantId={restaurantId}
                    onAddToCart={onAddItem}
                    onClose={() => onOpenChange(false)}
                />

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
                                {optimisticCart.map((item) => (
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
                                            {item.customizations && Object.keys(item.customizations).length > 0 && (
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {Object.entries(item.customizations)
                                                        .filter(([key]) => !key.includes('meal_customizations'))
                                                        .map(([key, val]) => {
                                                            // Skip empty values
                                                            if (!val || (Array.isArray(val) && val.length === 0)) return null;
                                                            
                                                            // Handle nested objects with 'selection' property
                                                            if (typeof val === 'object' && !Array.isArray(val)) {
                                                                if (val && 'selection' in val) {
                                                                    return (
                                                                        <div key={key}>
                                                                            {key}: {String(val.selection || '')}
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            }
                                                            
                                                            const displayValue = Array.isArray(val) ? val.join(', ') : String(val);
                                                            return (
                                                                <div key={key}>
                                                                    {key}: {displayValue}
                                                                </div>
                                                            );
                                                        })
                                                        .filter(Boolean)
                                                    }
                                                </div>
                                            )}
                                            <p className="text-orange-500 font-semibold">£{(item.price * item.quantity).toFixed(2)}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <button
                                                onClick={() => {
                                                    const customizationKey = item.customizations || item.itemQuantities 
                                                        ? JSON.stringify({
                                                            customizations: item.customizations || {},
                                                            itemQuantities: item.itemQuantities || {}
                                                        })
                                                        : null;
                                                    removeFromCart(item.menu_item_id, customizationKey);
                                                }}
                                                aria-label={`Remove ${item.name} from cart`}
                                                className="text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                            <div className="flex items-center gap-2 bg-white rounded-full border px-1" role="group" aria-label={`Quantity for ${item.name}`}>
                                                <button
                                                    onClick={() => handleQuantityChange(item.menu_item_id, item.quantity - 1)}
                                                    aria-label={`Decrease quantity of ${item.name}`}
                                                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
                                                >
                                                    <Minus className="h-3 w-3" aria-hidden="true" />
                                                </button>
                                                <span className="w-6 text-center font-medium text-sm" aria-live="polite" aria-atomic="true">{item.quantity}</span>
                                                <button
                                                    onClick={() => handleQuantityChange(item.menu_item_id, item.quantity + 1)}
                                                    aria-label={`Increase quantity of ${item.name}`}
                                                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
                                                >
                                                    <Plus className="h-3 w-3" aria-hidden="true" />
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
                                    <span>
                                        Delivery Fee
                                        {activeTierLabel && <span className="text-xs text-amber-600 ml-1">({activeTierLabel})</span>}
                                    </span>
                                    <span>{deliveryFee === 0 ? 'FREE' : `£${deliveryFee.toFixed(2)}`}</span>
                                </div>
                            )}
                            {orderType === 'collection' && (
                                <div className="flex justify-between text-green-600 font-medium">
                                    <span>🏪 Collection Savings</span>
                                    <span>FREE</span>
                                </div>
                            )}
                            {/* Tiered delivery hint */}
                            {orderType === 'delivery' && tiered?.enabled && subtotal < tiered.lower_minimum && (
                                <div className="text-xs text-amber-600 bg-amber-50 rounded p-2">
                                    Add £{(tiered.lower_minimum - subtotal).toFixed(2)} more to qualify for £{(tiered.lower_minimum_fee ?? 0).toFixed(2)} delivery fee
                                </div>
                            )}
                            {orderType === 'delivery' && tiered?.enabled && subtotal >= tiered.lower_minimum && subtotal < (restaurant?.minimum_order || Infinity) && (
                                <div className="text-xs text-green-600 bg-green-50 rounded p-2">
                                    Add £{((restaurant?.minimum_order || 0) - subtotal).toFixed(2)} more for free delivery
                                </div>
                            )}
                            <div className="flex justify-between font-semibold text-lg pt-3 border-t">
                                <span>Total</span>
                                <span>£{total.toFixed(2)}</span>
                            </div>
                            {minimumOrder > 0 && subtotal < minimumOrder && (
                                <div className="text-xs text-red-500 pt-1">
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
                            disabled={subtotal < minimumOrder}
                            className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-lg disabled:opacity-50"
                        >
                            {orderType === 'collection' ? 'Schedule Collection' : 'Go to Checkout'}
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}