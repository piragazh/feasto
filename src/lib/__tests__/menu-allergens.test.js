import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { normalizeAllergens, ALL_ALLERGENS } from '../allergens.js';

/**
 * 29 Sep: in the menu editor, "Fill with AI" for allergens did nothing, a
 * ticked allergen un-ticked itself, and "I have checked these allergens" never
 * stayed ticked - no item has been confirmed since the confirmation arrived.
 *
 * Cause: AllergensSection calls three handlers IN A ROW (list, source,
 * confirmed), and each did setFormData({ ...formData, x }) from the SAME
 * render-time formData - so each overwrote the one before, and the last one
 * (confirmed = false) put the old list back.
 *
 * These run the form's REAL handler code, lifted from MenuManagement.jsx,
 * under React's rules: a handler sees the formData of its render; an object
 * update replaces the state; a function update receives the latest state.
 */
const src = fs.readFileSync(new URL('../../components/restaurant/MenuManagement.jsx', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('<AllergensSection'), src.indexOf('/>', src.indexOf('<AllergensSection')));
function handler(prop) {
    const m = new RegExp(`${prop}=\\{(\\(v\\) => setFormData\\([\\s\\S]*?\\))\\}\\n`).exec(block);
    if (!m) throw new Error(`no ${prop} handler found`);
    return m[1];
}
/** One render: handlers bound to that render's formData, updates queued like React. */
function render(state) {
    const queue = [];
    const setFormData = (u) => queue.push(u);
    const formData = state;                                  // what the handlers close over
    const make = (prop) => new Function('setFormData', 'formData', `return ${handler(prop)};`)(setFormData, formData);
    const h = { onChange: make('onChange'), onSourceChange: make('onSourceChange'), onConfirmedChange: make('onConfirmedChange') };
    const commit = () => queue.reduce((s, u) => (typeof u === 'function' ? u(s) : u), state);
    return { h, commit };
}
const START = { name: 'Kids Meal', allergens: ['gluten'], allergens_source: 'manual', allergens_confirmed: false };

describe('the allergen editor keeps what you do', () => {
    it('REGRESSION GUARD: "Fill with AI" keeps the suggested list', () => {
        const { h, commit } = render(START);
        // exactly what fillWithAI does, in order
        h.onChange(['gluten', 'milk', 'eggs']); h.onSourceChange('ai_suggested'); h.onConfirmedChange(false);
        const s = commit();
        expect(s.allergens).toEqual(['gluten', 'milk', 'eggs']);
        expect(s.allergens_source).toBe('ai_suggested');
        expect(s.allergens_confirmed).toBe(false);
    });

    it('REGRESSION GUARD: ticking an allergen by hand sticks', () => {
        const { h, commit } = render(START);
        h.onChange(['gluten', 'sesame']); h.onSourceChange('manual'); h.onConfirmedChange(false);   // what toggle() does
        expect(commit().allergens).toEqual(['gluten', 'sesame']);
    });

    it('REGRESSION GUARD: "I have checked these allergens" stays ticked', () => {
        const { h, commit } = render(START);
        h.onConfirmedChange(true); h.onSourceChange('manual');                                   // what the checkbox does
        const s = commit();
        expect(s.allergens_confirmed).toBe(true);
        expect(s.allergens).toEqual(['gluten']);
    });

    it('nothing else in the form is touched', () => {
        const { h, commit } = render({ ...START, price: 4.5, category: 'Kids' });
        h.onChange(['milk']); h.onSourceChange('ai_suggested'); h.onConfirmedChange(false);
        const s = commit();
        expect(s.price).toBe(4.5);
        expect(s.category).toBe('Kids');
    });
});

describe('whatever the AI calls them, allergens are recognised', () => {
    it('capitals, synonyms and plurals map to the 14 keys', () => {
        expect(normalizeAllergens(['Gluten', 'dairy', 'Tree Nuts', 'sulphur dioxide', 'soy', 'Egg', 'Shellfish']))
            .toEqual(['gluten', 'crustaceans', 'eggs', 'soya', 'milk', 'nuts', 'sulphites']);
    });
    it('unknown words and duplicates are dropped; the order is the standard one', () => {
        expect(normalizeAllergens(['milk', 'MILK', 'lactose', 'chocolate', '', null])).toEqual(['milk']);
    });
    it('safe with nothing', () => {
        expect(normalizeAllergens(undefined)).toEqual([]);
        expect(normalizeAllergens('gluten')).toEqual([]);
    });
    it('every one of the 14 is accepted as itself', () => {
        expect(normalizeAllergens(ALL_ALLERGENS)).toEqual(ALL_ALLERGENS);
    });
});
