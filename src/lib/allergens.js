/**
 * The 14 UK allergens, and turning however they are named ("Gluten", "dairy",
 * "tree nuts") into the keys the menu stores. Used by the menu editor's
 * "Fill with AI", whose answers were silently dropped by a strict match.
 */
export const ALL_ALLERGENS = [
    'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya',
    'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
];

// How the AI (or anyone) may name the 14 - "Gluten", "dairy", "tree nuts",
// "sulphur dioxide". A strict lowercase match silently DROPPED these.
const ALLERGEN_ALIASES = {
    wheat: 'gluten', 'cereals containing gluten': 'gluten',
    crustacean: 'crustaceans', shellfish: 'crustaceans', prawns: 'crustaceans', shrimp: 'crustaceans',
    egg: 'eggs', peanut: 'peanuts', groundnuts: 'peanuts',
    soy: 'soya', soybeans: 'soya', soybean: 'soya',
    dairy: 'milk', lactose: 'milk',
    'tree nuts': 'nuts', 'tree nut': 'nuts', nut: 'nuts',
    'sesame seeds': 'sesame', 'sulphur dioxide': 'sulphites', 'sulfur dioxide': 'sulphites', sulfites: 'sulphites',
    lupine: 'lupin', mollusc: 'molluscs', mollusks: 'molluscs', mollusk: 'molluscs',
};
/** Any naming -> the 14 canonical keys, de-duplicated, in the standard order. */
export function normalizeAllergens(list) {
    const found = new Set();
    for (const raw of Array.isArray(list) ? list : []) {
        const k = String(raw || '').toLowerCase().trim().replace(/\s+/g, ' ');
        const key = ALL_ALLERGENS.includes(k) ? k : ALLERGEN_ALIASES[k];
        if (key) found.add(key);
    }
    return ALL_ALLERGENS.filter(a => found.has(a));
}
