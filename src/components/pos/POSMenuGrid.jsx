import React from 'react';
import { Input } from "@/components/ui/input";
import { ShoppingCart } from 'lucide-react';

export default function POSMenuGrid({ filteredItems, searchQuery, onSearchChange, onSearchFocus, onItemClick, t }) {
    return (
        <div className={`col-span-1 md:col-span-7 ${t.panel} border rounded-2xl overflow-hidden flex flex-col`}>
            <div className={`p-3 border-b ${t.panelHead} flex-shrink-0`}>
                <div className="relative">
                    <ShoppingCart className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${t.textSub}`} />
                    <Input
                        type="text"
                        placeholder="Search menu items..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onFocus={onSearchFocus}
                        className={`${t.searchBg} h-11 pl-9 rounded-xl focus:ring-0`}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-[180px]">
                {filteredItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => onItemClick(item)}
                        className={`${t.itemCard} border rounded-2xl overflow-hidden transition-all group text-left hover:shadow-lg active:scale-[0.97] flex flex-col h-full`}
                    >
                        <div className={`h-24 flex-shrink-0 w-full ${t.itemImg} overflow-hidden`}>
                            {item.image_url ? (
                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <ShoppingCart className={`h-8 w-8 ${t.textSub}`} />
                                </div>
                            )}
                        </div>
                        <div className="p-2.5 flex flex-col flex-1 min-h-0">
                            <h3 className={`font-semibold text-xs line-clamp-2 leading-snug mb-1 transition-colors ${t.itemName}`}>{item.name}</h3>
                            <p className="text-orange-500 font-bold text-sm mt-auto">£{item.price.toFixed(2)}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}