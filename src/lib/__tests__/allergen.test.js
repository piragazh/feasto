/**
 * Allergen tests.
 *
 * The central one: an item nobody has filled in must NEVER read as allergen-free.
 * Every item in the live database is currently empty, so getting this wrong would
 * tell someone with a peanut allergy that a dish contains no peanuts, on no
 * evidence whatsoever.
 */
import { describe, it, expect } from 'vitest';
import {
    UK_ALLERGENS, ALLERGEN_LABELS, canonicalAllergen, allergenDisplay,
    orderAllergenSummary, STATE,
} from '../allergen-logic.js';

describe('the 14 UK allergens', () => {
    it('lists exactly the 14 required by law', () => {
        expect(UK_ALLERGENS).toHaveLength(14);
        for (const a of ['celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk',
                         'molluscs', 'mustard', 'nuts', 'peanuts', 'sesame', 'soya', 'sulphites']) {
            expect(UK_ALLERGENS).toContain(a);
        }
    });

    it('every one has a customer-facing label', () => {
        for (const a of UK_ALLERGENS) expect(ALLERGEN_LABELS[a]).toBeTruthy();
    });

    it('keeps peanuts and tree nuts separate - they are different allergies', () => {
        expect(canonicalAllergen('peanut')).toBe('peanuts');
        expect(canonicalAllergen('tree nuts')).toBe('nuts');
        expect(canonicalAllergen('peanuts')).not.toBe(canonicalAllergen('nuts'));
    });

    it('understands how these actually get typed', () => {
        expect(canonicalAllergen('Wheat')).toBe('gluten');
        expect(canonicalAllergen('dairy')).toBe('milk');
        expect(canonicalAllergen('SOY')).toBe('soya');
        expect(canonicalAllergen('shellfish')).toBe('crustaceans');
        expect(canonicalAllergen('sulfites')).toBe('sulphites');
    });

    it('ignores anything it does not recognise rather than inventing one', () => {
        expect(canonicalAllergen('chicken')).toBeNull();
        expect(canonicalAllergen('')).toBeNull();
        expect(canonicalAllergen(undefined)).toBeNull();
    });
});

describe('THE SAFETY RULE: silence is never safety', () => {
    it('an item nobody has confirmed says information is unavailable', () => {
        // Every live item looks like this today.
        const d = allergenDisplay({ name: 'Burger', allergens: [] });
        expect(d.state).toBe(STATE.NOT_PROVIDED);
        expect(d.canTrust).toBe(false);
        expect(d.message).toMatch(/isn.t available/i);
    });

    it('NEVER claims an unconfirmed item is free of anything', () => {
        const d = allergenDisplay({ name: 'Burger', allergens: [] });
        expect(d.message).not.toMatch(/no listed allergens|allergen.free|none/i);
        expect(d.allergens).toEqual([]);
    });

    it('AI suggestions alone are NOT shown to customers', () => {
        // Suggested from the item name, never confirmed by a person. The business
        // is legally responsible for accuracy, so this stays unavailable.
        const d = allergenDisplay({ name: 'Peanut Satay', allergens: ['peanuts'], allergens_source: 'ai' });
        expect(d.state).toBe(STATE.NOT_PROVIDED);
        expect(d.labels).toEqual([]);
    });

    it('once confirmed, the same suggestion IS shown', () => {
        const d = allergenDisplay({ name: 'Peanut Satay', allergens: ['peanuts'], allergens_source: 'ai', allergens_confirmed: true });
        expect(d.state).toBe(STATE.DECLARED);
        expect(d.labels).toEqual(['Peanuts']);
    });

    it('confirmed-with-none is a real statement, and still warns about traces', () => {
        const d = allergenDisplay({ name: 'Chips', allergens: [], allergens_confirmed: true });
        expect(d.state).toBe(STATE.NONE_DECLARED);
        expect(d.message).toMatch(/traces are possible/i);
    });
});

describe('what a customer sees', () => {
    it('lists allergens in the legal order, de-duplicated and tidied', () => {
        const d = allergenDisplay({ allergens: ['MILK', 'wheat', 'milk', 'egg'], allergens_confirmed: true });
        expect(d.allergens).toEqual(['gluten', 'eggs', 'milk']);
        expect(d.message).toBe('Contains: Cereals containing gluten, Eggs, Milk.');
    });

    it('drops entries that are not real allergens', () => {
        const d = allergenDisplay({ allergens: ['chicken', 'milk'], allergens_confirmed: true });
        expect(d.allergens).toEqual(['milk']);
    });
});

describe('a whole order, for the kitchen and the receipt', () => {
    const menu = new Map([
        ['a', { name: 'Cheeseburger', allergens: ['milk', 'gluten'], allergens_confirmed: true }],
        ['b', { name: 'Chips', allergens: [], allergens_confirmed: true }],
        ['c', { name: 'Mystery Pie', allergens: [] }],                    // never confirmed
    ]);

    it('gathers every confirmed allergen across the order', () => {
        const s = orderAllergenSummary([{ menu_item_id: 'a' }, { menu_item_id: 'b' }], menu);
        expect(s.allergens).toEqual(['gluten', 'milk']);
    });

    it('REGRESSION GUARD: unconfirmed items are flagged, not treated as clear', () => {
        // The kitchen must not read a short "contains" line as meaning the rest
        // of the order is safe.
        const s = orderAllergenSummary([{ menu_item_id: 'a' }, { menu_item_id: 'c' }], menu);
        expect(s.unconfirmedItems).toEqual(['Mystery Pie']);
        expect(s.hasAny).toBe(true);
    });

    it('an item missing from the menu is flagged too', () => {
        const s = orderAllergenSummary([{ menu_item_id: 'gone', name: 'Deleted item' }], menu);
        expect(s.unconfirmedItems).toEqual(['Deleted item']);
    });

    it('an all-confirmed, allergen-free order reports nothing to flag', () => {
        const s = orderAllergenSummary([{ menu_item_id: 'b' }], menu);
        expect(s.hasAny).toBe(false);
    });
});
