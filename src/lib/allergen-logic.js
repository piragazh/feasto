/**
 * src/lib/allergen-logic.js
 * =========================
 * TESTED source of truth for what customers are told about allergens.
 *
 * ─── THE RULE THAT MATTERS ──────────────────────────────────────────────────
 * An empty allergen list means NOBODY HAS SAID - not "this food is safe".
 *
 * Every item in the live database currently has an empty list because nothing
 * has been entered yet. Showing those as allergen-free would tell someone with a
 * peanut allergy that a dish contains no peanuts, on no evidence at all. So an
 * item only ever shows allergens once a person has CONFIRMED them; until then it
 * says the information isn't available and to ask.
 *
 * "Confirmed with none present" is a different, deliberate statement, and is
 * shown as such.
 *
 * ─── WHY AI SUGGESTIONS ARE NOT A DECLARATION ───────────────────────────────
 * The menu editor can suggest allergens from an item's name and description.
 * That is a guess. Under UK law the business is responsible for accuracy, so a
 * suggestion is never shown to a customer until someone confirms it - and who
 * confirmed it, and when, is recorded.
 */

/** The 14 allergens that must be declared under UK law (Food Information Regulations 2014). */
export const UK_ALLERGENS = [
    'celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk',
    'molluscs', 'mustard', 'nuts', 'peanuts', 'sesame', 'soya', 'sulphites',
];

/** Labels as customers should see them. */
export const ALLERGEN_LABELS = {
    celery: 'Celery',
    gluten: 'Cereals containing gluten',
    crustaceans: 'Crustaceans',
    eggs: 'Eggs',
    fish: 'Fish',
    lupin: 'Lupin',
    milk: 'Milk',
    molluscs: 'Molluscs',
    mustard: 'Mustard',
    nuts: 'Tree nuts',
    peanuts: 'Peanuts',
    sesame: 'Sesame',
    soya: 'Soya',
    sulphites: 'Sulphur dioxide / sulphites',
};

/** Accepts the common ways these get typed and maps them to one canonical name. */
export function canonicalAllergen(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return null;
    const direct = UK_ALLERGENS.find(a => a === v);
    if (direct) return direct;
    const ALIASES = {
        'cereals containing gluten': 'gluten', wheat: 'gluten', barley: 'gluten', rye: 'gluten', oats: 'gluten',
        'tree nuts': 'nuts', treenuts: 'nuts', nut: 'nuts',
        peanut: 'peanuts', groundnuts: 'peanuts',
        dairy: 'milk', lactose: 'milk',
        egg: 'eggs', soy: 'soya', soybeans: 'soya', soja: 'soya',
        shellfish: 'crustaceans', prawns: 'crustaceans', crab: 'crustaceans',
        'sulphur dioxide': 'sulphites', sulfites: 'sulphites', so2: 'sulphites',
        seeds: 'sesame',
    };
    return ALIASES[v] || null;
}

export const STATE = {
    DECLARED: 'declared',          // confirmed, and contains these allergens
    NONE_DECLARED: 'none',         // confirmed, and contains none of the 14
    NOT_PROVIDED: 'not_provided',  // nobody has confirmed - never imply safety
};

/**
 * What to tell a customer about one item.
 *
 * @returns {{ state, allergens: string[], labels: string[], message, canTrust: boolean }}
 */
export function allergenDisplay(item) {
    const confirmed = item?.allergens_confirmed === true;
    const raw = Array.isArray(item?.allergens) ? item.allergens : [];
    const list = [...new Set(raw.map(canonicalAllergen).filter(Boolean))]
        .sort((a, b) => UK_ALLERGENS.indexOf(a) - UK_ALLERGENS.indexOf(b));

    if (!confirmed) {
        return {
            state: STATE.NOT_PROVIDED,
            allergens: [],
            labels: [],
            // Deliberately says nothing about what the item does or doesn't contain.
            message: 'Allergen information isn\u2019t available for this item \u2014 please ask before ordering.',
            canTrust: false,
        };
    }
    if (list.length === 0) {
        return {
            state: STATE.NONE_DECLARED,
            allergens: [],
            labels: [],
            message: 'No listed allergens. Prepared in a kitchen that handles allergens, so traces are possible.',
            canTrust: true,
        };
    }
    return {
        state: STATE.DECLARED,
        allergens: list,
        labels: list.map(a => ALLERGEN_LABELS[a]),
        message: `Contains: ${list.map(a => ALLERGEN_LABELS[a]).join(', ')}.`,
        canTrust: true,
    };
}

/**
 * Allergens across a whole order, for the kitchen ticket and the receipt.
 *
 * Items whose allergens nobody has confirmed are listed separately - the kitchen
 * must not read their absence from the "contains" line as meaning they are free
 * of allergens.
 */
export function orderAllergenSummary(orderItems = [], menuById = new Map()) {
    const contains = new Set();
    const unknown = [];
    for (const line of orderItems) {
        const item = menuById.get(line?.menu_item_id);
        if (!item) { unknown.push(line?.name || 'Unknown item'); continue; }
        const d = allergenDisplay(item);
        if (d.state === STATE.NOT_PROVIDED) unknown.push(item.name || line?.name || 'Unknown item');
        else d.allergens.forEach(a => contains.add(a));
    }
    const list = [...contains].sort((a, b) => UK_ALLERGENS.indexOf(a) - UK_ALLERGENS.indexOf(b));
    return {
        allergens: list,
        labels: list.map(a => ALLERGEN_LABELS[a]),
        unconfirmedItems: unknown,
        hasAny: list.length > 0 || unknown.length > 0,
    };
}
