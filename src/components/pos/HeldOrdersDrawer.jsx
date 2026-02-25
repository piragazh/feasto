import React from 'react';
import { X, ShoppingCart, RotateCcw, Trash2, Clock } from 'lucide-react';

export default function HeldOrdersDrawer({ open, onClose, heldOrders, onRecall, onDelete, isDark, t }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Drawer */}
            <div className={`w-80 ${isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200'} border-l flex flex-col shadow-2xl`}>
                {/* Header */}
                <div className={`px-4 py-4 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'} flex items-center justify-between flex-shrink-0`}>
                    <div>
                        <h2 className={`${t.text} font-bold text-base`}>Held Orders</h2>
                        <p className={`${t.textMuted} text-xs mt-0.5`}>{heldOrders.length} order{heldOrders.length !== 1 ? 's' : ''} on hold</p>
                    </div>
                    <button onClick={onClose} className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'} transition-colors`}>
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Orders list */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
                    {heldOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-center">
                            <ShoppingCart className={`h-10 w-10 ${t.emptyIcon} mb-3`} />
                            <p className={`${t.emptyText} text-sm font-medium`}>No held orders</p>
                            <p className={`${t.emptySub} text-xs mt-1`}>Hold the current cart to park it here</p>
                        </div>
                    ) : (
                        heldOrders.map((held) => (
                            <div key={held.id} className={`${isDark ? 'bg-[#1a1d27] border-white/[0.06]' : 'bg-gray-50 border-gray-200'} border rounded-xl p-3`}>
                                {/* Label + time */}
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1 min-w-0">
                                        <p className={`${t.text} font-bold text-sm truncate`}>
                                            {held.label || `Order #${held.id.slice(-4).toUpperCase()}`}
                                        </p>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <Clock className={`h-3 w-3 ${t.textSub}`} />
                                            <p className={`${t.textSub} text-[10px]`}>{formatTime(held.heldAt)}</p>
                                        </div>
                                    </div>
                                    <span className={`text-xs font-bold text-orange-500 ml-2 flex-shrink-0`}>
                                        £{held.total.toFixed(2)}
                                    </span>
                                </div>

                                {/* Items preview */}
                                <div className={`${t.textMuted} text-[10px] mb-3 space-y-0.5`}>
                                    {held.items.slice(0, 3).map((item, idx) => (
                                        <p key={idx} className="truncate">
                                            {item.quantity}× {item.name}
                                        </p>
                                    ))}
                                    {held.items.length > 3 && (
                                        <p className={t.textSub}>+{held.items.length - 3} more items</p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { onRecall(held); onClose(); }}
                                        className="flex-1 h-8 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                        Recall
                                    </button>
                                    <button
                                        onClick={() => onDelete(held.id)}
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-red-50 hover:bg-red-100'} text-red-400 transition-colors`}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function formatTime(ts) {
    const date = new Date(ts);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}