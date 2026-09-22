import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { toMinutes } from '@/lib/pos-schedule-logic';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Editor for a list of time windows.
 *
 * Used twice on a menu item: once for WHEN it can be ordered (availability) and
 * once for timed PRICES (happy hour). Same shape, so one component.
 *
 * Validation is shown inline, not on save, because the common mistakes are easy
 * to make and easy to miss:
 *  - an end time earlier than the start looks like a typo but is how a late
 *    menu crossing midnight is expressed, so it is explained, not rejected
 *  - a timed price at or above the normal price does nothing - the server only
 *    ever lets a timed price LOWER a price - so the owner is told why
 *
 * All times are the restaurant's local time; the note says so, because an owner
 * setting "17:00" should never have to think about BST.
 */
export default function ScheduleWindowsEditor({ value = [], onChange, withPrice = false, basePrice = null, emptyHint }) {
    const windows = Array.isArray(value) ? value : [];

    const update = (i, patch) => onChange(windows.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
    const remove = (i) => onChange(windows.filter((_, idx) => idx !== i));
    const add = () => onChange([
        ...windows,
        { days: [1, 2, 3, 4, 5], start: '17:00', end: '19:00', ...(withPrice ? { price: '', label: 'Happy Hour' } : {}) },
    ]);

    const toggleDay = (i, d) => {
        const days = windows[i].days || [];
        update(i, { days: days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort() });
    };

    return (
        <div className="space-y-2">
            {windows.length === 0 && (
                <p className="text-xs text-gray-500">{emptyHint}</p>
            )}

            {windows.map((w, i) => {
                const start = toMinutes(w.start);
                const end = toMinutes(w.end);
                const badTime = start === null || end === null;
                const overnight = !badTime && start > end;
                const price = Number(w.price);
                const priceIneffective = withPrice && basePrice != null && w.price !== '' && Number.isFinite(price) && price >= Number(basePrice);

                return (
                    <div key={i} className="p-3 border border-gray-200 rounded-xl bg-gray-50 space-y-2">
                        <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
                            {DAY_LABELS.map((lbl, d) => {
                                const on = (w.days || []).includes(d);
                                return (
                                    <button
                                        key={d}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => toggleDay(i, d)}
                                        className={`h-9 px-2.5 rounded-lg text-xs font-semibold border ${
                                            on ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200'
                                        }`}
                                    >
                                        {lbl}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap items-end gap-2">
                            <div>
                                <Label className="text-xs">From</Label>
                                <Input type="time" value={w.start || ''} onChange={e => update(i, { start: e.target.value })} className="h-10 w-28" />
                            </div>
                            <div>
                                <Label className="text-xs">Until</Label>
                                <Input type="time" value={w.end || ''} onChange={e => update(i, { end: e.target.value })} className="h-10 w-28" />
                            </div>
                            {withPrice && (
                                <>
                                    <div>
                                        <Label className="text-xs">Price (£)</Label>
                                        <Input
                                            type="number" step="0.01" min="0"
                                            value={w.price ?? ''}
                                            onChange={e => update(i, { price: e.target.value === '' ? '' : Number(e.target.value) })}
                                            className="h-10 w-24"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-[120px]">
                                        <Label className="text-xs">Label on till</Label>
                                        <Input value={w.label || ''} onChange={e => update(i, { label: e.target.value })} className="h-10" placeholder="Happy Hour" />
                                    </div>
                                </>
                            )}
                            <Button type="button" variant="outline" onClick={() => remove(i)}
                                aria-label="Remove this time window"
                                className="h-10 w-10 p-0 text-red-600 border-red-200 hover:bg-red-50">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>

                        {badTime && (
                            <p className="text-xs text-red-600">Enter both times — this window will be ignored until you do.</p>
                        )}
                        {overnight && (
                            <p className="text-xs text-blue-700">
                                Crosses midnight &mdash; runs until {w.end} the next morning.
                                After midnight it still counts as the previous day&rsquo;s window.
                            </p>
                        )}
                        {(w.days || []).length === 0 && (
                            <p className="text-xs text-gray-500">No days selected &mdash; applies every day.</p>
                        )}
                        {priceIneffective && (
                            <p className="text-xs text-amber-700">
                                This isn&rsquo;t lower than the normal price (£{Number(basePrice).toFixed(2)}), so it won&rsquo;t
                                apply. Timed prices can only reduce a price.
                            </p>
                        )}
                    </div>
                );
            })}

            <Button type="button" variant="outline" onClick={add} className="h-10">
                <Plus className="h-4 w-4 mr-1.5" /> Add time window
            </Button>
            <p className="text-[11px] text-gray-400">Times are your restaurant&rsquo;s local time, including British Summer Time.</p>
        </div>
    );
}
