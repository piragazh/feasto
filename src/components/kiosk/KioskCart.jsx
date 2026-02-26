import React, { useState } from 'react';
import { ArrowLeft, Trash2, Plus, Minus, ShoppingCart, X, Pencil } from 'lucide-react';
import KioskItemModal from './KioskItemModal';

export default function KioskCart({
    cart, cartTotal, orderType, restaurant,
    onUpdateQuantity, onRemoveItem, onBack, onCheckout, onClearCart,
    onEditItem
}) {
    const [editingItem, setEditingItem] = useState(null);
    const orderTypeLabel = orderType === 'dine_in' ? 'Eat In' : 'Takeaway';

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col">
            {/* Header */}
            <div className="bg-gray-900 border-b border-white/[0.06] px-6 py-4 flex items-center gap-4">
                <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors">
                    <ArrowLeft className="h-5 w-5 text-white" />
                </button>
                <div className="flex-1">
                    <h1 className="text-white font-bold text-2xl">Your Order</h1>
                    <p className="text-gray-400 text-sm">{orderTypeLabel} · {restaurant.name}</p>
                </div>
                {cart.length > 0 && (
                    <button onClick={onClearCart} className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm font-medium px-4 py-2 rounded-xl hover:bg-red-500/10 transition-colors">
                        <Trash2 className="h-4 w-4" />
                        Clear All
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full px-6 py-6">
                {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-24 text-center">
                        <ShoppingCart className="h-16 w-16 text-gray-700 mb-4" />
                        <p className="text-gray-400 text-xl font-semibold mb-2">Your order is empty</p>
                        <p className="text-gray-600 text-sm mb-8">Go back and add some items</p>
                        <button
                            onClick={onBack}
                            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-2xl transition-colors"
                        >
                            Browse Menu
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {cart.map(item => (
                            <div key={item.cartId} className="bg-gray-900 border border-white/[0.06] rounded-2xl p-5 flex items-start gap-4">
                                {item.image_url && (
                                    <img src={item.image_url} alt={item.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="text-white font-semibold text-base">{item.name}</h3>
                                        <button
                                            onClick={() => onRemoveItem(item.cartId)}
                                            className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition-colors flex-shrink-0"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                    {item.customizations && Object.keys(item.customizations).length > 0 && (
                                        <div className="mt-1 space-y-0.5">
                                            {Object.entries(item.customizations).map(([key, val]) => (
                                                <p key={key} className="text-gray-500 text-xs truncate">
                                                    {key}: {Array.isArray(val) ? val.join(', ') : val}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                    {item.customization_options?.length > 0 && (
                                        <button
                                            onClick={() => setEditingItem(item)}
                                            className="mt-2 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                        >
                                            <Pencil className="h-3 w-3" />
                                            Edit customizations
                                        </button>
                                    )}
                                    <div className="flex items-center justify-between mt-3">
                                        <span className="text-orange-400 font-bold text-base">£{(item.price * item.quantity).toFixed(2)}</span>
                                        <div className="flex items-center gap-2 bg-gray-800 rounded-xl p-1">
                                            <button
                                                onClick={() => onUpdateQuantity(item.cartId, item.quantity - 1)}
                                                className="w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
                                            >
                                                <Minus className="h-4 w-4 text-white" />
                                            </button>
                                            <span className="text-white font-bold w-6 text-center">{item.quantity}</span>
                                            <button
                                                onClick={() => onUpdateQuantity(item.cartId, item.quantity + 1)}
                                                className="w-9 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 flex items-center justify-center transition-colors"
                                            >
                                                <Plus className="h-4 w-4 text-white" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Order Summary */}
                        <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-5 mt-4">
                            <h3 className="text-white font-bold text-base mb-4">Order Summary</h3>
                            <div className="space-y-2">
                                {cart.map(item => (
                                    <div key={item.cartId} className="flex justify-between text-sm">
                                        <span className="text-gray-400">{item.name} × {item.quantity}</span>
                                        <span className="text-gray-300">£{(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                                <div className="border-t border-white/[0.06] pt-3 mt-3 flex justify-between">
                                    <span className="text-white font-bold text-lg">Total</span>
                                    <span className="text-orange-400 font-black text-xl">£{cartTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {editingItem && (
                <KioskItemModal
                    item={editingItem}
                    initialCustomizations={editingItem.customizations}
                    initialItemQuantities={editingItem.itemQuantities}
                    initialQuantity={editingItem.quantity}
                    onClose={() => setEditingItem(null)}
                    onAdd={(updated) => {
                        onEditItem(editingItem.cartId, updated);
                        setEditingItem(null);
                    }}
                />
            )}

            {/* Footer */}
            {cart.length > 0 && (
                <div className="bg-gray-900 border-t border-white/[0.06] px-6 py-5 max-w-2xl mx-auto w-full">
                    <button
                        onClick={onCheckout}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-5 rounded-2xl text-xl transition-all active:scale-[0.98] shadow-lg shadow-orange-500/30 flex items-center justify-between px-6"
                    >
                        <span>Proceed to Payment</span>
                        <span>£{cartTotal.toFixed(2)}</span>
                    </button>
                </div>
            )}
        </div>
    );
}