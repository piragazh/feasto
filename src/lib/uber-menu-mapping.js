/**
 * src/lib/uber-menu-mapping.js
 * ============================
 * TESTED translation of a MealDrop menu into Uber Eats' menu payload.
 *
 * Uber's model (PUT /v2/eats/stores/{store_id}/menus):
 *   { menus[], categories[], items[], modifier_groups[] }
 *
 * The key thing to understand: A MODIFIER OPTION IS ITSELF AN ITEM. A modifier
 * group holds no prices - it lists item ids, and each of those items carries its
 * own price. Nested modifiers fall out of the same rule: the "Meal" option is an
 * item that itself has modifier_group_ids, which is exactly how a meal upgrade
 * with its own drink and side choices maps across.
 *
 * ─── WHY WE SEND OUR OWN IDS ────────────────────────────────────────────────
 * Every id we send is OUR id. Uber echoes it back on each order line, so an
 * incoming order resolves to our menu with no matching table and no guesswork.
 * Today the webhook stores Uber's item id in menu_item_id, which matches nothing
 * - so stock never decrements and allergens never resolve for marketplace orders.
 *
 * ─── THINGS THAT WOULD BREAK THE UPLOAD ─────────────────────────────────────
 * Real menu data here has option groups with EMPTY names, and items with TWO
 * groups sharing the same name (see Ringer Burger). Uber needs a title and
 * unique ids, so group ids are built from the item id plus the group's INDEX,
 * never its name, and empty titles get a readable fallback.
 *
 * ─── PRICES ─────────────────────────────────────────────────────────────────
 * Uber wants integer minor units: £8.99 is 899. Marketplace prices are normally
 * higher than in-store to absorb commission, so each item may carry its own
 * platform price; failing that a per-restaurant markup is applied to the normal
 * price. The in-store price is never sent unless that is what the owner chose.
 */

/**
 * £8.99 -> 899.
 *
 * The naive Math.round(amount * 100) under-charges on some values: 2.005 * 100
 * is 200.49999999999997 in floating point, so it rounds DOWN to 200 instead of
 * 201. Normalising the scaled value first removes that representation error, so
 * a price is never a penny lower on the marketplace than intended.
 */
export function toMinorUnits(amount) {
    const scaled = Number(amount || 0) * 100;
    return Math.round(Number(scaled.toFixed(4)));
}

/**
 * What to charge on the marketplace for one item.
 *
 * Order of preference:
 *   1. an explicit price for that platform (platform_prices.uber_eats)
 *   2. the normal price plus the restaurant's marketplace markup
 *   3. the normal price
 *
 * A markup of 0 or absent means "same price as in store", which is a legitimate
 * choice, so it is honoured rather than silently marked up.
 */
export function marketplacePrice(item, { platform = 'uber_eats', markupPercent = 0 } = {}) {
    const explicit = item?.platform_prices?.[platform];
    if (explicit !== undefined && explicit !== null && Number(explicit) > 0) {
        return toMinorUnits(explicit);
    }
    const base = Number(item?.price || 0);
    const markup = Number(markupPercent || 0);
    return toMinorUnits(base * (1 + markup / 100));
}

const text = (s) => ({ translations: { en_us: String(s ?? '').trim() || 'Item' } });

/** Ids must be stable and unique; option group names are neither. */
const groupId = (itemId, index) => `${itemId}__g${index}`;
const optionId = (gid, index) => `${gid}__o${index}`;

/**
 * Turn one MealDrop option group into an Uber modifier group plus the items its
 * options become.
 *
 * `required` and `max_quantity` become Uber's min/max selection rules. A single
 * choice is exactly one; a multiple choice is zero-to-max unless required.
 */
function mapGroup(group, gid, opts = {}) {
    const items = [];
    const childIds = [];

    (group.options || []).forEach((opt, i) => {
        const oid = optionId(gid, i);
        childIds.push(oid);
        items.push({
            id: oid,
            title: text(opt.label),
            external_data: JSON.stringify({ group: group.name ?? '', label: opt.label ?? '' }),
            price_info: { price: toMinorUnits(Number(opt.price || 0) * (1 + (opts.markupPercent || 0) / 100)) },
            quantity_info: {},
            // A meal upgrade's option carries the meal's own choices - this is
            // how nested modifiers are expressed.
            ...(opt._nestedGroupIds?.length ? { modifier_group_ids: { ids: opt._nestedGroupIds } } : {}),
        });
    });

    const isSingle = group.type === 'single' || group.type === 'meal_upgrade';
    const max = isSingle ? 1 : Math.max(1, Math.floor(Number(group.max_quantity || childIds.length) || childIds.length));
    const min = group.required ? 1 : 0;

    return {
        modifierGroup: {
            id: gid,
            // Uber needs a title; real data has groups with empty names.
            title: text(group.name || (group.type === 'meal_upgrade' ? 'Make it a meal' : 'Choose an option')),
            modifier_options: childIds.map(id => ({ id })),
            quantity_info: { quantity: { max_permitted: max, min_permitted: min } },
        },
        items,
    };
}

/**
 * Build the full payload for one store.
 *
 * @param {object[]} menuItems  MealDrop menu items
 * @param {object} opts { platform, markupPercent, menuTitle, availability }
 */
export function buildUberMenu(menuItems = [], opts = {}) {
    const { markupPercent = 0, platform = 'uber_eats' } = opts;
    const items = [];
    const modifierGroups = [];
    const categoryMap = new Map();

    for (const mi of menuItems) {
        // Unavailable items are simply not offered. Suspension is handled
        // separately by the availability push.
        if (mi?.is_available === false) continue;

        const topGroupIds = [];

        (mi.customization_options || []).forEach((group, gi) => {
            const gid = groupId(mi.id, gi);

            // A meal upgrade's nested choices become their own groups first, so
            // the "Meal" option can point at them.
            const nestedIds = [];
            (group.meal_customizations || []).forEach((mealGroup, mgi) => {
                const mgid = `${gid}__m${mgi}`;
                const mapped = mapGroup(mealGroup, mgid, { markupPercent });
                modifierGroups.push(mapped.modifierGroup);
                items.push(...mapped.items);
                nestedIds.push(mgid);
            });

            const withNested = {
                ...group,
                options: (group.options || []).map(o => ({
                    ...o,
                    // Only the paid upgrade carries the meal's choices, not "On its own".
                    _nestedGroupIds: (nestedIds.length && Number(o.price || 0) > 0) ? nestedIds : [],
                })),
            };

            const mapped = mapGroup(withNested, gid, { markupPercent });
            modifierGroups.push(mapped.modifierGroup);
            items.push(...mapped.items);
            topGroupIds.push(gid);
        });

        items.push({
            id: mi.id,                       // OUR id - echoed back on every order
            title: text(mi.name),
            ...(mi.description ? { description: text(mi.description) } : {}),
            external_data: JSON.stringify({ mealdrop_id: mi.id }),
            price_info: { price: marketplacePrice(mi, { platform, markupPercent }) },
            quantity_info: {},
            ...(topGroupIds.length ? { modifier_group_ids: { ids: topGroupIds } } : {}),
        });

        const cat = String(mi.category || 'Menu').trim() || 'Menu';
        if (!categoryMap.has(cat)) categoryMap.set(cat, []);
        categoryMap.get(cat).push(mi.id);
    }

    const categories = [...categoryMap.entries()].map(([name, ids], i) => ({
        id: `cat_${i}`,
        title: text(name),
        entities: ids.map(id => ({ id, type: 'ITEM' })),
    }));

    return {
        menus: [{
            id: 'mealdrop_menu',
            title: text(opts.menuTitle || 'Menu'),
            service_availability: opts.availability || [],
            category_ids: categories.map(c => c.id),
        }],
        categories,
        items,
        modifier_groups: modifierGroups,
    };
}
