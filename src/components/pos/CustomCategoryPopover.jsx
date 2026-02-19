import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, ChevronUp } from 'lucide-react';

/**
 * A button that, when clicked, expands a panel above it showing items in the category.
 * Clicking an item adds it directly to the cart.
 */
export default function CustomCategoryPopover({ label, items, color, onAddItem }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            {/* Popup panel */}
            {open && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpen(false)}
                    />
                    {/* Panel */}
                    <div className="absolute bottom-full left-0 mb-2 z-20 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-3 min-w-[180px] max-w-[260px]">
                        <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 px-1">
                            {label || 'Custom Items'}
                        </p>
                        <div className="space-y-1.5 max-h-64 overflow-y-auto">
                            {items.map((item, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        onAddItem({
                                            ...item,
                                            id: `custom-${item.name}-${Date.now()}`,
                                            menu_item_id: `custom-${item.name}-${Date.now()}`,
                                            quantity: 1,
                                            customizations: {},
                                            isCustomItem: true
                                        });
                                        setOpen(false);
                                    }}
                                    className="w-full flex items-center justify-between gap-2 bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-2 text-left transition-colors group"
                                >
                                    <span className="text-white text-sm font-medium truncate">{item.name}</span>
                                    <span className="text-orange-400 text-sm font-bold flex-shrink-0">
                                        £{typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div className="mt-2 flex justify-end">
                            <ChevronUp className="h-3 w-3 text-gray-500" />
                        </div>
                    </div>
                </>
            )}

            {/* Trigger button */}
            <Button
                onClick={() => setOpen(v => !v)}
                className={`h-14 px-3 ${color} text-white font-semibold text-[11px] border rounded-lg flex flex-col items-center justify-center gap-0.5 shadow-lg transition-all hover:scale-105 min-w-[64px] max-w-[90px] ${open ? 'ring-2 ring-white/30' : ''}`}
                title={label}
            >
                <PlusCircle className="h-4 w-4 flex-shrink-0" />
                <span className="truncate w-full text-center leading-tight">{label || 'Items'}</span>
                <span className="text-[9px] opacity-70">{items.length} item{items.length !== 1 ? 's' : ''}</span>
            </Button>
        </div>
    );
}