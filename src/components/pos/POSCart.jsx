import React from 'react';
import { Trash2, Plus, Minus, ShoppingCart, X, Users } from 'lucide-react';
import POSDiscountPanel from './POSDiscountPanel';

export default function POSCart({
    t, isDark, optimisticCart, cartTotal, orderType,
    selectedTable, tables,
    onRemoveItem, onUpdateQuantity, onClearCart,
    onSelectTable, onAddToTable, onCharge,
    isAddingToTable,
    discount, onApplyDiscount, onRemoveDiscount,
}) {
    const cartSubtotal = optimisticCart.reduce((s, i) => s + i.price * i.quantity, 0);
    const discountedTotal = discount ? Math.max(0, cartSubtotal - discount.amount) : cartSubtotal;
    return (
        <div className={`col-span-1 md:col-span-3 ${t.panel} border rounded-2xl overflow-hidden flex flex-col`}>
            <div className={`px-4 py-3 border-b ${t.panelHead} flex-shrink-0 flex items-center justify-between`}>
                <h2 className={`${t.text} font-bold text-base`}>Order</h2>
                {orderType === 'dine_in' && selectedTable && (
                    <span className="text-xs bg-orange-500/20 text-orange-500 border border-orange-500/30 px-2 py-0.5 rounded-lg font-medium">
                        {selectedTable.table_number}
                    </span>
                )}
            </div>

            <div className="h-0 flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-hide">
                {optimisticCart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                        <ShoppingCart className={`h-10 w-10 ${t.emptyIcon} mb-3`} />
                        <p className={`${t.emptyText} text-sm font-medium`}>Cart is empty</p>
                        <p className={`${t.emptySub} text-xs mt-1`}>Tap items to add them</p>
                    </div>
                ) : (
                    optimisticCart.map(item => (
                        <div key={item.id} className={`${t.cartItem} rounded-xl border p-2.5`}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 pr-2 min-w-0">
                                    <p className={`${t.text} font-semibold text-xs leading-tight truncate`}>{item.name}</p>
                                    {item.customizations && Object.keys(item.customizations).length > 0 && (
                                        <div className={`${t.textSub} text-[9px] mt-0.5 space-y-0.5`}>
                                            {Object.entries(item.customizations).slice(0, 2).map(([key, value]) => (
                                                <p key={key} className="truncate">{key}: {Array.isArray(value) ? value.join(', ') : value}</p>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-orange-500 text-xs mt-1 font-bold">£{(item.price * item.quantity).toFixed(2)}</p>
                                </div>
                                <button
                                    onClick={() => onRemoveItem(item.id)}
                                    className="w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors flex-shrink-0"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                                    className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${t.qtyMinus}`}
                                >
                                    <Minus className="h-3 w-3" />
                                </button>
                                <span className={`${t.text} font-bold text-sm flex-1 text-center`}>{item.quantity}</span>
                                <button
                                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                                    className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${t.qtyPlus}`}
                                >
                                    <Plus className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className={`border-t ${t.panelHead} p-3 space-y-2`}>
                <div className="flex items-center justify-between px-1">
                    <span className={`${t.textMuted} text-sm font-medium`}>Total</span>
                    <span className={`${t.text} text-2xl font-bold`}>£{cartTotal.toFixed(2)}</span>
                </div>

                {orderType === 'dine_in' ? (
                    <>
                        {!selectedTable ? (
                            <button
                                onClick={onSelectTable}
                                disabled={tables.length === 0}
                                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold h-12 rounded-xl text-sm transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
                            >
                                <Users className="h-4 w-4" />
                                Select Table ({tables.length})
                            </button>
                        ) : (
                            <>
                                <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-2.5 text-center">
                                    <p className="text-orange-400 text-[10px] font-medium uppercase tracking-wide">Selected</p>
                                    <p className={`${t.text} font-bold text-base`}>{selectedTable.table_number}</p>
                                </div>
                                <button
                                    onClick={onAddToTable}
                                    disabled={optimisticCart.length === 0 || isAddingToTable}
                                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold h-12 rounded-xl text-sm transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
                                >
                                    <ShoppingCart className="h-4 w-4" />
                                    {isAddingToTable ? 'Adding...' : 'Send to Table'}
                                </button>
                                <button
                                    onClick={() => onSelectTable(null)}
                                    className={`w-full ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} font-semibold h-9 rounded-xl text-xs transition-colors`}
                                >
                                    Change Table
                                </button>
                            </>
                        )}
                        <button
                            onClick={onClearCart}
                            disabled={optimisticCart.length === 0}
                            className="w-full bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 font-semibold h-9 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            Clear
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={onCharge}
                            disabled={optimisticCart.length === 0}
                            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold h-12 rounded-xl text-sm transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
                        >
                            <ShoppingCart className="h-4 w-4" />
                            Charge · £{cartTotal.toFixed(2)}
                        </button>
                        <button
                            onClick={onClearCart}
                            disabled={optimisticCart.length === 0}
                            className="w-full bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 font-semibold h-9 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            Clear Cart
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}