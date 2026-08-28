import React from 'react';

export default function POSCategoryPanel({ categories, selectedCategory, onSelect, t }) {
    return (
        <div className={`col-span-1 md:col-span-2 ${t.panel} border rounded-2xl overflow-hidden flex flex-col`}>
            <div className={`px-4 py-3 border-b ${t.panelHead} flex-shrink-0`}>
                <h2 className={`${t.textMuted} text-xs font-semibold uppercase tracking-wider`}>Categories</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
                {[{ id: '', label: 'All Items' }, ...categories.map(c => ({ id: c, label: c }))].map(({ id, label }) => (
                    <button
                        key={id}
                        onClick={() => onSelect(id)}
                        className={`w-full text-left px-3 min-h-[48px] py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] leading-snug ${
                            selectedCategory === id
                                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                : t.catBtn
                        }`}
                        title={label}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}