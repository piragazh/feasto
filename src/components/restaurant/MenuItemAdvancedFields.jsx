import React, { useState } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Leaf, AlertTriangle, Activity, Sparkles, Loader2 } from 'lucide-react';
import { base44 } from "@/api/base44Client";

const DAYS = [
    { id: 'mon', label: 'Mon' },
    { id: 'tue', label: 'Tue' },
    { id: 'wed', label: 'Wed' },
    { id: 'thu', label: 'Thu' },
    { id: 'fri', label: 'Fri' },
    { id: 'sat', label: 'Sat' },
    { id: 'sun', label: 'Sun' },
];

const ALL_ALLERGENS = [
    'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya',
    'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
];

const ALLERGEN_ICONS = {
    gluten: '🌾', crustaceans: '🦞', eggs: '🥚', fish: '🐟', peanuts: '🥜',
    soya: '🫘', milk: '🥛', nuts: '🌰', celery: '🥬', mustard: '🌿',
    sesame: '🌱', sulphites: '🍷', lupin: '🌸', molluscs: '🐚'
};

// ── Schedule Section ───────────────────────────────────────────────────────────
export function ScheduleSection({ value = {}, onChange }) {
    const schedule = { enabled: false, days: ['mon','tue','wed','thu','fri','sat','sun'], time_from: '', time_until: '', label: '', ...value };

    const update = (patch) => onChange({ ...schedule, ...patch });

    const toggleDay = (day) => {
        const days = schedule.days.includes(day)
            ? schedule.days.filter(d => d !== day)
            : [...schedule.days, day];
        update({ days });
    };

    return (
        <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-sm text-blue-900">Availability Schedule</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-600">{schedule.enabled ? 'Restricted' : 'Always available'}</span>
                    <Switch
                        checked={schedule.enabled}
                        onCheckedChange={(v) => update({ enabled: v })}
                    />
                </div>
            </div>

            {schedule.enabled && (
                <>
                    <div>
                        <Label className="text-xs text-blue-800 mb-2 block">Available Days</Label>
                        <div className="flex gap-1.5 flex-wrap">
                            {DAYS.map(d => (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => toggleDay(d.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                        schedule.days.includes(d.id)
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-blue-600 border-blue-200 hover:border-blue-400'
                                    }`}
                                >
                                    {d.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs text-blue-800 mb-1 block">From</Label>
                            <Input
                                type="time"
                                value={schedule.time_from}
                                onChange={(e) => update({ time_from: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-blue-800 mb-1 block">Until</Label>
                            <Input
                                type="time"
                                value={schedule.time_until}
                                onChange={(e) => update({ time_until: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <Label className="text-xs text-blue-800 mb-1 block">Display Label (optional)</Label>
                        <Input
                            value={schedule.label}
                            onChange={(e) => update({ label: e.target.value })}
                            placeholder="e.g. Breakfast until 11:00, Lunch special"
                            className="h-9 text-sm"
                        />
                    </div>
                </>
            )}
        </div>
    );
}

// ── Allergens Section ─────────────────────────────────────────────────────────
export function AllergensSection({ value = [], onChange, itemName = '', itemDescription = '' }) {
    const [loading, setLoading] = useState(false);

    const toggle = (a) => {
        onChange(value.includes(a) ? value.filter(x => x !== a) : [...value, a]);
    };

    const fillWithAI = async () => {
        if (!itemName) return;
        setLoading(true);
        const result = await base44.integrations.Core.InvokeLLM({
            prompt: `Identify allergens for this menu item based on UK food allergen regulations (14 major allergens).
Item name: "${itemName}"
Description: "${itemDescription || 'N/A'}"

Return ONLY the allergens present from this exact list: gluten, crustaceans, eggs, fish, peanuts, soya, milk, nuts, celery, mustard, sesame, sulphites, lupin, molluscs.`,
            response_json_schema: {
                type: "object",
                properties: {
                    allergens: { type: "array", items: { type: "string" } }
                }
            }
        });
        const detected = (result.allergens || []).filter(a => ALL_ALLERGENS.includes(a));
        onChange(detected);
        setLoading(false);
    };

    return (
        <div className="space-y-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold text-sm text-amber-900">Allergen Information</span>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={fillWithAI}
                    disabled={loading || !itemName}
                    className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    Fill with AI
                </Button>
            </div>
            <p className="text-xs text-amber-700">Select all allergens present in this item (14 major UK allergens).</p>
            <div className="flex flex-wrap gap-2">
                {ALL_ALLERGENS.map(a => (
                    <button
                        key={a}
                        type="button"
                        onClick={() => toggle(a)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors capitalize ${
                            value.includes(a)
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-white text-amber-700 border-amber-200 hover:border-amber-400'
                        }`}
                    >
                        <span>{ALLERGEN_ICONS[a]}</span>
                        {a}
                    </button>
                ))}
            </div>
            {value.length > 0 && (
                <p className="text-xs text-amber-700">
                    Contains: <span className="font-semibold">{value.join(', ')}</span>
                </p>
            )}
        </div>
    );
}

// ── Nutrition Section ─────────────────────────────────────────────────────────
const NUTRITION_FIELDS = [
    { key: 'calories', label: 'Calories', unit: 'kcal' },
    { key: 'protein_g', label: 'Protein', unit: 'g' },
    { key: 'carbs_g', label: 'Carbohydrates', unit: 'g' },
    { key: 'sugar_g', label: '  of which Sugars', unit: 'g' },
    { key: 'fat_g', label: 'Fat', unit: 'g' },
    { key: 'saturates_g', label: '  of which Saturates', unit: 'g' },
    { key: 'fibre_g', label: 'Fibre', unit: 'g' },
    { key: 'salt_g', label: 'Salt', unit: 'g' },
];

export function NutritionSection({ value = {}, onChange }) {
    const update = (key, val) => onChange({ ...value, [key]: val === '' ? undefined : parseFloat(val) });

    return (
        <div className="space-y-3 p-4 bg-green-50 rounded-xl border border-green-100">
            <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-green-700" />
                <span className="font-semibold text-sm text-green-900">Nutritional Information</span>
                <span className="text-xs text-green-600">(per serving)</span>
            </div>

            <div>
                <Label className="text-xs text-green-800 mb-1 block">Serving Size</Label>
                <Input
                    value={value.serving_size || ''}
                    onChange={(e) => onChange({ ...value, serving_size: e.target.value })}
                    placeholder="e.g. 1 portion (350g)"
                    className="h-9 text-sm"
                />
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {NUTRITION_FIELDS.map(({ key, label, unit }) => (
                    <div key={key} className="flex items-center gap-2">
                        <Label className="text-xs text-green-800 w-36 shrink-0">{label}</Label>
                        <div className="flex items-center gap-1 flex-1">
                            <Input
                                type="number"
                                min="0"
                                step="0.1"
                                value={value[key] ?? ''}
                                onChange={(e) => update(key, e.target.value)}
                                placeholder="—"
                                className="h-8 text-sm w-20"
                            />
                            <span className="text-xs text-green-600 shrink-0">{unit}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Subcategory Section ───────────────────────────────────────────────────────
export function SubcategorySection({ value = '', onChange, suggestions = [] }) {
    return (
        <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
                <Leaf className="h-3.5 w-3.5 text-gray-400" />
                Subcategory <span className="font-normal text-gray-400">(optional)</span>
            </Label>
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="e.g. Grilled, Fried, Vegan option, Seasonal"
                list="subcategory-suggestions"
                className="h-9 text-sm"
            />
            {suggestions.length > 0 && (
                <datalist id="subcategory-suggestions">
                    {suggestions.map(s => <option key={s} value={s} />)}
                </datalist>
            )}
            <p className="text-xs text-gray-400">Group items further within a category for better organisation.</p>
        </div>
    );
}

// ── Compact display badges for the item card ──────────────────────────────────
export function MenuItemBadges({ item }) {
    const now = new Date();
    const day = ['sun','mon','tue','wed','thu','fri','sat'][now.getDay()];
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const schedule = item.availability_schedule;
    const scheduleActive = schedule?.enabled
        && (schedule.days?.length && !schedule.days.includes(day)
            || (schedule.time_from && timeStr < schedule.time_from)
            || (schedule.time_until && timeStr > schedule.time_until));

    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {item.subcategory && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.subcategory}</Badge>
            )}
            {schedule?.enabled && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${scheduleActive ? 'border-red-300 text-red-600' : 'border-blue-300 text-blue-600'}`}>
                    <Clock className="h-2.5 w-2.5 mr-0.5" />
                    {schedule.label || `${schedule.time_from}–${schedule.time_until}`}
                </Badge>
            )}
            {item.allergens?.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                    {item.allergens.length} allergen{item.allergens.length > 1 ? 's' : ''}
                </Badge>
            )}
            {item.nutrition?.calories && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700">
                    {item.nutrition.calories} kcal
                </Badge>
            )}
        </div>
    );
}