/**
 * Uber menu mapping tests, against REAL menu shapes from this database -
 * including the two that would break an upload: option groups with empty names,
 * and one item carrying two groups with the SAME name.
 */
import { describe, it, expect } from 'vitest';
import { toMinorUnits, marketplacePrice, buildUberMenu } from '../uber-menu-mapping.js';

// Real items from the live menu.
const WINGS = {
    id: 'wings', name: 'Hot Wings', price: 2.99, category: 'Wings', is_available: true,
    customization_options: [
        { name: 'Count', type: 'single', required: true, options: [{ label: '4', price: 0 }, { label: '6', price: 1 }] },
        { name: 'Upgarade?', type: 'meal_upgrade', options: [{ label: 'On its Own', price: 0 }, { label: 'Meal', price: 3 }],
          meal_customizations: [{ name: 'Side', type: 'single', options: [{ label: 'Chips', price: 0 }, { label: 'Peri Peri Chips', price: 0.2 }] }] },
    ],
};
const RINGER = {   // two groups BOTH named ''
    id: 'ringer', name: 'Ringer Burger', price: 5.19, category: 'Burgers', is_available: true,
    customization_options: [
        { name: '', type: 'single', options: [{ label: 'Normal', price: 0 }, { label: 'Spicy', price: 0 }] },
        { name: '', type: 'meal_upgrade', options: [{ label: 'On its Own', price: 0 }, { label: 'Meal', price: 2.5 }], meal_customizations: [] },
    ],
};

describe('prices', () => {
    it('converts to integer pence', () => {
        expect(toMinorUnits(8.99)).toBe(899);
        expect(toMinorUnits(0.2)).toBe(20);
        expect(toMinorUnits(0)).toBe(0);
    });

    it('rounds rather than truncates', () => {
        expect(toMinorUnits(8.995)).toBe(900);
        expect(toMinorUnits(2.005)).toBe(201);
    });

    it('uses an explicit marketplace price when set', () => {
        expect(marketplacePrice({ price: 6.49, platform_prices: { uber_eats: 7.99 } })).toBe(799);
    });

    it('otherwise applies the markup', () => {
        expect(marketplacePrice({ price: 10 }, { markupPercent: 25 })).toBe(1250);
    });

    it('no markup means the in-store price, honoured as a real choice', () => {
        expect(marketplacePrice({ price: 6.49 })).toBe(649);
    });

    it('an explicit price wins over the markup', () => {
        expect(marketplacePrice({ price: 10, platform_prices: { uber_eats: 11 } }, { markupPercent: 50 })).toBe(1100);
    });
});

describe('items carry OUR id', () => {
    it('so an incoming order resolves to our menu with no matching table', () => {
        const menu = buildUberMenu([WINGS]);
        const item = menu.items.find(i => i.id === 'wings');
        expect(item).toBeTruthy();
        expect(JSON.parse(item.external_data).mealdrop_id).toBe('wings');
    });

    it('prices the item in pence', () => {
        expect(buildUberMenu([WINGS]).items.find(i => i.id === 'wings').price_info.price).toBe(299);
    });
});

describe('modifiers', () => {
    it('each option becomes an ITEM with its own price', () => {
        const menu = buildUberMenu([WINGS]);
        const six = menu.items.find(i => i.title.translations.en_us === '6');
        expect(six.price_info.price).toBe(100);
    });

    it('a group lists its option item ids and carries no prices itself', () => {
        const menu = buildUberMenu([WINGS]);
        const g = menu.modifier_groups.find(g => g.title.translations.en_us === 'Count');
        expect(g.modifier_options).toHaveLength(2);
        expect(JSON.stringify(g)).not.toMatch(/price/);
    });

    it('a required single choice is exactly one selection', () => {
        const g = buildUberMenu([WINGS]).modifier_groups.find(g => g.title.translations.en_us === 'Count');
        expect(g.quantity_info.quantity).toEqual({ max_permitted: 1, min_permitted: 1 });
    });

    it('NESTED: the paid Meal option carries the meal\'s own choices', () => {
        const menu = buildUberMenu([WINGS]);
        const meal = menu.items.find(i => i.title.translations.en_us === 'Meal');
        expect(meal.modifier_group_ids.ids.length).toBe(1);
        const side = menu.modifier_groups.find(g => g.id === meal.modifier_group_ids.ids[0]);
        expect(side.title.translations.en_us).toBe('Side');
    });

    it('"On its Own" does NOT carry the meal choices', () => {
        const menu = buildUberMenu([WINGS]);
        const plain = menu.items.find(i => i.title.translations.en_us === 'On its Own');
        expect(plain.modifier_group_ids).toBeUndefined();
    });

    it('a priced meal extra keeps its price', () => {
        const peri = buildUberMenu([WINGS]).items.find(i => i.title.translations.en_us === 'Peri Peri Chips');
        expect(peri.price_info.price).toBe(20);
    });
});

describe('REGRESSION GUARDS: real data that would break the upload', () => {
    it('two groups with the SAME (empty) name get distinct ids', () => {
        const menu = buildUberMenu([RINGER]);
        const ids = menu.modifier_groups.map(g => g.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('an empty group name still gets a readable title', () => {
        const menu = buildUberMenu([RINGER]);
        for (const g of menu.modifier_groups) {
            expect(g.title.translations.en_us.trim().length).toBeGreaterThan(0);
        }
    });

    it('every id in the whole payload is unique', () => {
        const menu = buildUberMenu([WINGS, RINGER]);
        const ids = [...menu.items.map(i => i.id), ...menu.modifier_groups.map(g => g.id)];
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every referenced modifier group actually exists', () => {
        const menu = buildUberMenu([WINGS, RINGER]);
        const groupIds = new Set(menu.modifier_groups.map(g => g.id));
        for (const item of menu.items) {
            for (const id of item.modifier_group_ids?.ids || []) expect(groupIds.has(id)).toBe(true);
        }
    });

    it('every option referenced by a group actually exists', () => {
        const menu = buildUberMenu([WINGS, RINGER]);
        const itemIds = new Set(menu.items.map(i => i.id));
        for (const g of menu.modifier_groups) {
            for (const o of g.modifier_options) expect(itemIds.has(o.id)).toBe(true);
        }
    });
});

describe('structure', () => {
    it('groups items into categories', () => {
        const menu = buildUberMenu([WINGS, RINGER]);
        expect(menu.categories.map(c => c.title.translations.en_us).sort()).toEqual(['Burgers', 'Wings']);
    });

    it('leaves unavailable items out entirely', () => {
        const menu = buildUberMenu([{ ...WINGS, is_available: false }]);
        expect(menu.items.find(i => i.id === 'wings')).toBeUndefined();
    });

    it('produces the four top-level collections Uber requires', () => {
        const menu = buildUberMenu([WINGS]);
        expect(Object.keys(menu).sort()).toEqual(['categories', 'items', 'menus', 'modifier_groups']);
    });
});

describe('the single marketplace price field', () => {
    it('one field covers every platform', () => {
        const item = { price: 6.49, platform_prices: { default: 7.99 } };
        expect(marketplacePrice(item, { platform: 'uber_eats' })).toBe(799);
        expect(marketplacePrice(item, { platform: 'deliveroo' })).toBe(799);
    });

    it('a platform-specific price overrides it', () => {
        const item = { price: 6.49, platform_prices: { default: 7.99, deliveroo: 8.49 } };
        expect(marketplacePrice(item, { platform: 'deliveroo' })).toBe(849);
        expect(marketplacePrice(item, { platform: 'uber_eats' })).toBe(799);
    });

    it('falls back to the markup when the field is left empty', () => {
        expect(marketplacePrice({ price: 10, platform_prices: {} }, { markupPercent: 20 })).toBe(1200);
    });
});
