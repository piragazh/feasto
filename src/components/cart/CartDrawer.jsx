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

    const handleQuantityChange = (itemId, newQuantity, customizationKey = null) => {
        // Optimistic update — use customization key for precise matching
        setOptimisticCart(prev => 
            prev.map((item, idx) => {
                const itemKey = `${item.menu_item_id}_${customizationKey || JSON.stringify({ customizations: item.customizations || {}, itemQuantities: item.itemQuantities || {} })}`;
                const compareKey = `${itemId}_${customizationKey || JSON.stringify({ customizations: {}, itemQuantities: {} })}`;
                return itemKey === compareKey
                    ? { ...item, quantity: newQuantity }
                    : item;
            })
        );
        // Actual update
        updateQuantity(itemId, newQuantity, customizationKey);
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
            <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 bg-white">
                {/* Modern Header */}
                <SheetHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-br from-white to-gray-50">
                    <div className="flex items-center gap-2">
                        {restaurantId && (
                            <Link to={createPageUrl('Restaurant') + `?id=${restaurantId}`}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full hover:bg-orange-100 text-gray-700"
                                    onClick={() => onOpenChange(false)}
                                >
                                    <ArrowLeft className="h-5 w-5" />
                                </Button>
                            </Link>
                        )}
                        <div className="flex-1">
                            <SheetTitle className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <ShoppingBag className="h-6 w-6 text-orange-500" />
                                Order
                            </SheetTitle>
                            {restaurantName && (
                                <p className="text-sm text-gray-600 font-medium mt-1">from <span className="font-semibold text-gray-900">{restaurantName}</span></p>
                            )}
                        </div>
                        {cart.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearCart}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-9"
                            >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Clear
                            </Button>
                        )}
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
                    <div className="px-6 pt-4 pb-3 bg-gradient-to-br from-gray-50 to-white border-b">
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Order type</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onOrderTypeChange('delivery')}
                                className={`flex-1 py-3 px-3 rounded-xl font-bold text-sm transition-all ${
                                    orderType === 'delivery'
                                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                                        : 'bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200'
                                }`}
                            >
                                🚚 Delivery
                            </button>
                            <button
                                onClick={() => onOrderTypeChange('collection')}
                                className={`flex-1 py-3 px-3 rounded-xl font-bold text-sm transition-all ${
                                    orderType === 'collection'
                                        ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                                        : 'bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200'
                                }`}
                            >
                                🏪 Collection<br/><span className="text-xs font-semibold">FREE</span>
                            </button>
                        </div>
                    </div>
                )}
                
                <div className="flex-1 overflow-y-auto p-6">
                {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-12">
                            <div className="w-24 h-24 bg-gradient-to-br from-orange-100 to-orange-50 rounded-full flex items-center justify-center mb-6">
                                <ShoppingBag className="h-12 w-12 text-orange-400" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-2 text-lg">Your cart is empty</h3>
                            <p className="text-gray-600 text-sm">Add items from a restaurant to get started</p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            <div className="space-y-3">
                                {optimisticCart.map((item) => (
                                    <motion.div
                                        key={item.menu_item_id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -100 }}
                                        className="flex gap-3 p-4 bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-100 hover:border-orange-200 hover:shadow-md transition-all"
                                    >
                                        {item.image_url && (
                                            <img
                                                src={item.image_url}
                                                alt={item.name}
                                                className="w-16 h-16 rounded-lg object-cover"
                                                loading="lazy"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-gray-900 text-sm">{item.name}</h4>
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
                                            <p className="text-orange-600 font-bold text-sm">£{(item.price * item.quantity).toFixed(2)}</p>
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
                                                     onClick={() => {
                                                         const customizationKey = (item.customizations || item.itemQuantities) 
                                                             ? JSON.stringify({
                                                                 customizations: item.customizations || {},
                                                                 itemQuantities: item.itemQuantities || {}
                                                             })
                                                             : null;
                                                         handleQuantityChange(item.menu_item_id, item.quantity - 1, customizationKey);
                                                     }}
                                                    aria-label={`Decrease quantity of ${item.name}`}
                                                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
                                                >
                                                    <Minus className="h-3 w-3" aria-hidden="true" />
                                                </button>
                                                <span className="w-6 text-center font-medium text-sm" aria-live="polite" aria-atomic="true">{item.quantity}</span>
                                                <button
                                                    onClick={() => {
                                                        const customizationKey = (item.customizations || item.itemQuantities) 
                                                            ? JSON.stringify({
                                                                customizations: item.customizations || {},
                                                                itemQuantities: item.itemQuantities || {}
                                                            })
                                                            : null;
                                                        handleQuantityChange(item.menu_item_id, item.quantity + 1, customizationKey);
                                                    }}
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
                    <div className="border-t border-gray-200 p-6 bg-gradient-to-br from-white to-gray-50 space-y-5">
                        {/* Price Breakdown */}
                        <div className="space-y-3">
                            <div className="flex justify-between text-gray-700">
                                <span className="font-medium">Subtotal</span>
                                <span className="font-semibold">£{subtotal.toFixed(2)}</span>
                            </div>
                            {orderType === 'delivery' && (
                                <div className="flex justify-between text-gray-700">
                                    <span className="font-medium">
                                        Delivery Fee
                                        {activeTierLabel && <span className="text-xs text-orange-600 ml-1">({activeTierLabel})</span>}
                                    </span>
                                    <span className="font-semibold">{deliveryFee === 0 ? '🎉 FREE' : `£${deliveryFee.toFixed(2)}`}</span>
                                </div>
                            )}
                            {orderType === 'collection' && (
                                <div className="flex justify-between text-green-700 font-bold">
                                    <span>🏪 Collection Savings</span>
                                    <span>🎉 FREE</span>
                                </div>
                            )}
                        </div>

                        {/* Delivery Incentive - Highlighted */}
                        {orderType === 'delivery' && tiered?.enabled && subtotal < tiered.lower_minimum && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-3 text-center"
                            >
                                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Special Offer</p>
                                <p className="text-sm font-bold text-amber-900">
                                    Add £{(tiered.lower_minimum - subtotal).toFixed(2)} more
                                </p>
                                <p className="text-xs text-amber-800 mt-1">for just £{(tiered.lower_minimum_fee ?? 0).toFixed(2)} delivery!</p>
                            </motion.div>
                        )}

                        {orderType === 'delivery' && tiered?.enabled && subtotal >= tiered.lower_minimum && subtotal < (restaurant?.minimum_order || Infinity) && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-3 text-center"
                            >
                                <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">You're Almost There!</p>
                                <p className="text-sm font-bold text-green-900">
                                    Add £{((restaurant?.minimum_order || 0) - subtotal).toFixed(2)} more
                                </p>
                                <p className="text-xs text-green-800 mt-1">for 🎉 Free Delivery!</p>
                            </motion.div>
                        )}

                        {/* Total */}
                        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-4 text-white text-center">
                            <p className="text-xs font-bold uppercase tracking-wider opacity-90 mb-1">Order Total</p>
                            <p className="text-3xl font-bold">£{total.toFixed(2)}</p>
                        </div>

                        {minimumOrder > 0 && subtotal < minimumOrder && (
                            <div className="text-xs text-center text-red-600 font-medium">
                                Minimum order: £{minimumOrder.toFixed(2)}
                            </div>
                        )}

                        <Button 
                            onClick={() => {
                                if (onProceedToCheckout) {
                                    onProceedToCheckout();
                                }
                            }}
                            disabled={subtotal < minimumOrder}
                            className="w-full h-14 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-xl text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {orderType === 'collection' ? '📋 Finalize Collection' : '🛒 Proceed to Checkout'}
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}