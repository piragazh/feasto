import React from 'react';
import { POS_RADIUS, POS_TEXT, POS_FOCUS, POS_TRANSITION } from '@/lib/posDesign';

/**
 * Category rail.
 *
 * Visual notes:
 *  - The selected category carries a left accent bar rather than only a fill.
 *    A solid fill alone is easy to lose against a busy menu grid; a hard edge on
 *    the leading side reads instantly in peripheral vision, which is how staff
 *    actually track where they are.
 *  - An item count per category gives staff a sense of what's behind each tap
 *    before making it.
 *  - Capitalised labels: categories are often entered lowercase ("test1",
 *    "spirits") and looked unfinished next to the rest of the UI.
 */
export default function POSCategoryPanel({ categories, selectedCategory, onSelect, t, itemCounts = {} }) {
    const entries = [
        { id: '', label: 'All Items', count: itemCounts.__all },
        ...categories.map(c => ({ id: c, label: c, count: itemCounts[c] })),
    ];

    return (
        <div className={`col-span-1 md:col-span-2 ${t.panel} border ${POS_RADIUS.panel} overflow-hidden flex flex-col`}>
            <div className={`px-4 py-3 border-b ${t.panelHead} flex-shrink-0`}>
                <h2 className={`${t.textMuted} text-xs font-semibold uppercase tracking-wider`}>Categories</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
                {entries.map(({ id, label, count }) => {
                    const active = selectedCategory === id;
                    return (
                        <button
                            key={id || '__all'}
                            onClick={() => onSelect(id)}
                            aria-pressed={active}
                            title={label}
                            className={`relative w-full text-left pl-4 pr-3 min-h-[48px] py-2.5 ${POS_RADIUS.control} ${POS_TEXT.primaryBold} ${POS_TRANSITION} ${POS_FOCUS} active:scale-[0.98] flex items-center justify-between gap-2 ${
                                active
                                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                                    : t.catBtn
                            }`}
                        >
                            {/* Leading accent bar on the active item - readable at a
                                glance without relying on fill colour alone. */}
                            {active && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-white/90" />
                            )}
                            <span className="capitalize truncate">{label}</span>
                            {count > 0 && (
                                <span
                                    className={`${POS_TEXT.micro} px-1.5 py-1 rounded-md flex-shrink-0 tabular-nums ${
                                        active ? 'bg-white/20 text-white' : t.catCount
                                    }`}
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
