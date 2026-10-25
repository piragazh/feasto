/**
 * Server-side restaurant settings update — replaces direct entity writes from RestaurantSettings component.
 *
 * FIELD ALLOWLIST:
 *   - Low-risk (non-financial): description, address, phone, alert_phone, logo_url,
 *     food_hygiene_rating, food_hygiene_certificate_url, seo_keywords, seo_description,
 *     theme_primary_color, cuisine_types, cuisine_type, whatsapp_alerts_enabled,
 *     sms_alerts_enabled, order_alert_channel, collection_enabled, printer_config,
 *     opening_hours, delivery_hours, collection_hours, name, branding_config
 *   - High-risk (financial/order-affecting, audited with before/after):
 *     delivery_fee, minimum_order, tiered_delivery, accepts_cash_on_delivery,
 *     loyalty_program_enabled, loyalty_points_multiplier
 *
 * Fields NOT on the allowlist are silently stripped and logged.
 * branding_config is validated field by field (see sanitizeBrandingConfig); any invalid
 * value rejects the whole request, because these values are written into the public
 * storefront's CSS. branding_config.primary_color is the restaurant's brand colour and is
 * always copied to theme_primary_color, which the storefront (when custom styling is off),
 * media screens, menu icons and the app manifest use. branding_config.enabled only
 * switches the extra styling: fonts, backgrounds, buttons, hero image.
 * commission_rate is admin-only and requires a note.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Fields that need before/after audit logging because they directly affect order pricing or access
const HIGH_RISK_FIELDS = new Set([
    'delivery_fee',
    'minimum_order',
    'tiered_delivery',
    'accepts_cash_on_delivery',
    'loyalty_program_enabled',
    'loyalty_points_multiplier',
    'commission_rate',
    'commission_type',
    'fixed_commission_amount',
    // Access and availability controls
    'role_permissions',
    'qr_ordering_enabled',
    'temporary_closure',
]);

// Full allowlist of fields a restaurant manager may update
const ALLOWED_FIELDS = new Set([
    'name',
    'description',
    'address',
    'phone',
    'alert_phone',
    'cuisine_type',
    'cuisine_types',
    'whatsapp_alerts_enabled',
    'sms_alerts_enabled',
    'order_alert_channel',
    'delivery_fee',
    'minimum_order',
    'tiered_delivery',
    'collection_enabled',
    'accepts_cash_on_delivery',
    'show_review_count',
    'logo_url',
    'food_hygiene_rating',
    'food_hygiene_certificate_url',
    'seo_keywords',
    'seo_description',
    'loyalty_program_enabled',
    'loyalty_points_multiplier',
    'theme_primary_color',
    'opening_hours',
    'delivery_hours',
    'collection_hours',
    'printer_config',
    // Info section
    'info_section',
    // Notification settings
    'sms_notification_settings',
    'whatsapp_notification_settings',
    // Brand Studio
    'branding_config',
    // Onboarding
    'delivery_time',
    // Profile & story
    'about_us',
    'our_story',
    'is_halal',
    'card_style',
    'menu_layout',
    'gallery_images',
    'social_media',
    'awards_certifications',
    // Menu structure
    'menu_categories',
    'category_order',
    'category_images',
    'item_order',
    'custom_option_templates',
    'custom_pos_items',
    // Order pause
    'temporary_closure',
    // Kiosk, POS and table ordering
    'kiosk_config',
    'role_permissions',
    'pos_palette',
    'pos_layout',
    'pos_customization_layout',
    'quick_sale_items',
    'qr_ordering_enabled',
]);

// ── Brand Studio validation ──────────────────────────────────────────────────
// Every value here ends up inside a <style> block on the public storefront, so
// nothing is stored unless it matches a strict format.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const BRANDING_HISTORY_LIMIT = 5;

/** True when two brand configs differ in substance (ignores hex case and key order). */
function brandingChanged(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
    const norm = (c: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(c).sort()) {
            const v = c[key];
            if (v === undefined || v === null || v === '') continue;
            if (key === 'hero_focus_y' && v === 30) continue; // the default, same as unset
            out[key] = typeof v === 'string' && HEX_COLOR.test(v) ? v.toLowerCase() : v;
        }
        return JSON.stringify(out);
    };
    return norm(before) !== norm(after);
}
const BRANDING_COLOR_FIELDS = [
    'primary_color',
    'secondary_color',
    'background_color',
    'nav_background',
    'card_background',
    'button_text_color',
    'add_to_cart_color',
    'heading_color',
];
const BRANDING_ENUMS: Record<string, string[]> = {
    button_style: ['rounded', 'pill', 'sharp'],
    font_style: ['modern', 'classic', 'playful', 'elegant'],
};
// Hero images must be files uploaded to this app.
const HERO_IMAGE_HOSTS = new Set(['base44.app', 'media.base44.com']);
const BRANDING_KEYS = new Set([
    'enabled',
    ...BRANDING_COLOR_FIELDS,
    ...Object.keys(BRANDING_ENUMS),
    'hero_overlay_opacity',
    'hero_focus_y',
    'hero_image_url',
    'ai_palette_name',
]);

function sanitizeBrandingConfig(input: unknown): { value?: Record<string, unknown>; errors: string[] } {
    const errors: string[] = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { errors: ['branding_config must be an object'] };
    }
    const raw = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(raw)) {
        if (!BRANDING_KEYS.has(key)) errors.push(`unknown field ${key}`);
    }

    out.enabled = raw.enabled === true;

    for (const field of BRANDING_COLOR_FIELDS) {
        const v = raw[field];
        if (v === undefined || v === null || v === '') continue;
        if (typeof v !== 'string' || !HEX_COLOR.test(v)) {
            errors.push(`${field} must be a colour like #1a2b3c`);
        } else {
            out[field] = v.toLowerCase();
        }
    }

    for (const [field, allowed] of Object.entries(BRANDING_ENUMS)) {
        const v = raw[field];
        if (v === undefined || v === null || v === '') continue;
        if (typeof v !== 'string' || !allowed.includes(v)) {
            errors.push(`${field} must be one of ${allowed.join(', ')}`);
        } else {
            out[field] = v;
        }
    }

    if (raw.hero_overlay_opacity !== undefined && raw.hero_overlay_opacity !== null) {
        const n = Number(raw.hero_overlay_opacity);
        if (!Number.isFinite(n)) {
            errors.push('hero_overlay_opacity must be a number');
        } else {
            out.hero_overlay_opacity = Math.min(1, Math.max(0, Math.round(n * 100) / 100));
        }
    }

    if (raw.hero_focus_y !== undefined && raw.hero_focus_y !== null) {
        const n = Number(raw.hero_focus_y);
        if (!Number.isFinite(n)) {
            errors.push('hero_focus_y must be a number');
        } else {
            out.hero_focus_y = Math.min(100, Math.max(0, Math.round(n)));
        }
    }

    const hero = raw.hero_image_url;
    if (hero === undefined || hero === null || hero === '') {
        out.hero_image_url = '';
    } else {
        let ok = false;
        if (typeof hero === 'string' && hero.length <= 2048) {
            try {
                const u = new URL(hero);
                ok = u.protocol === 'https:' && HERO_IMAGE_HOSTS.has(u.hostname);
            } catch { /* invalid URL */ }
        }
        if (ok) out.hero_image_url = hero;
        else errors.push('hero_image_url must be an image uploaded to MealDrop');
    }

    if (raw.ai_palette_name !== undefined && raw.ai_palette_name !== null) {
        if (typeof raw.ai_palette_name !== 'string') {
            errors.push('ai_palette_name must be text');
        } else {
            // Display-only label; strip anything that isn't plain text and cap length.
            out.ai_palette_name = raw.ai_palette_name.replace(/[<>{}\\]/g, '').slice(0, 60);
        }
    }

    return errors.length ? { errors } : { value: out, errors };
}

// commission_rate and related fields are admin-only
const ADMIN_ONLY_FIELDS = new Set([
    'commission_rate',
    'commission_type',
    'fixed_commission_amount',
    'pos_enabled',
    'max_pos_count',
    'media_screen_enabled',
    'max_screens_allowed',
    'onboarding_status',
]);

// ── ATOMIC PERMISSION CHECK (inline, not separate HTTP call) ─────────────────
async function checkRestaurantPermission(base44, user, restaurantId) {
    if (!restaurantId) {
        return { allowed: false, error: 'Restaurant ID required', statusCode: 400 };
    }
    if (user.role === 'admin') {
        console.log(`[AUDIT] Admin ${user.email} accessing restaurant ${restaurantId}`);
        return { allowed: true, role: 'admin', statusCode: 200 };
    }
    let managers;
    try {
        managers = await base44.asServiceRole.entities.RestaurantManager.filter({
            user_email: user.email,
            is_active: true,
        });
    } catch (error) {
        console.error(`[PERMISSION] Manager fetch failed for ${user.email}:`, error.message);
        return { allowed: false, error: 'Permission check failed', statusCode: 500 };
    }
    if (!managers?.length) {
        console.error(`[SECURITY] Non-admin user ${user.email} has no restaurant access`);
        return { allowed: false, error: 'No restaurant access', statusCode: 403 };
    }
    const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurantId));
    if (!hasAccess) {
        console.error(`[SECURITY] User ${user.email} attempted unauthorized access to restaurant ${restaurantId}`);
        return { allowed: false, error: 'Access denied to this restaurant', statusCode: 403 };
    }
    console.log(`[AUDIT] Manager ${user.email} accessing restaurant ${restaurantId}`);
    return { allowed: true, role: 'manager', statusCode: 200 };
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        let user = null;
        try {
            user = await base44.auth.me();
        } catch {
            user = null;
        }

        if (!user) {
            return Response.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 });
        }

        const { restaurant_id, updates, note } = await req.json();

        if (!restaurant_id || !updates || typeof updates !== 'object') {
            return Response.json({ error: 'restaurant_id and updates required' }, { status: 400 });
        }

        // TENANT CHECK — atomic inline permission enforcement
        const permissionResult = await checkRestaurantPermission(base44, user, restaurant_id);
        if (!permissionResult.allowed) {
            return Response.json({ error: permissionResult.error }, { status: permissionResult.statusCode });
        }

        // Fetch current restaurant for before/after diff
        let restaurants;
        try {
            restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurant_id });
        } catch {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }
        if (!restaurants?.length) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }
        const current = restaurants[0];

        // Separate allowed, admin-only, and forbidden fields
        const safeUpdates = {};
        const strippedFields = [];
        const blockedAdminFields = [];

        for (const [field, value] of Object.entries(updates)) {
            if (ADMIN_ONLY_FIELDS.has(field)) {
                if (user.role === 'admin') {
                    safeUpdates[field] = value;
                } else {
                    blockedAdminFields.push(field);
                }
            } else if (ALLOWED_FIELDS.has(field)) {
                safeUpdates[field] = value;
            } else {
                strippedFields.push(field);
            }
        }

        if (blockedAdminFields.length > 0) {
            return Response.json({
                error: `Admin access required to update: ${blockedAdminFields.join(', ')}`,
            }, { status: 403 });
        }

        if (Object.keys(safeUpdates).length === 0) {
            return Response.json({ error: 'No allowed fields to update' }, { status: 400 });
        }

        // Validate Brand Studio settings before anything is written
        if ('branding_config' in safeUpdates) {
            const { value, errors } = sanitizeBrandingConfig(safeUpdates.branding_config);
            if (errors.length) {
                return Response.json({
                    error: `Invalid brand settings: ${errors.join('; ')}`,
                }, { status: 400 });
            }
            safeUpdates.branding_config = value;
            // The brand colour is always live; the enabled switch only covers extra styling.
            if (typeof value!.primary_color === 'string') {
                safeUpdates.theme_primary_color = value!.primary_color;
            }
            // Keep the previous brand settings so they can be restored (newest first, last 5).
            // No user names or emails: restaurant records are publicly readable.
            const previous = current.branding_config;
            if (previous && typeof previous === 'object' && brandingChanged(previous, value!)) {
                const history = Array.isArray(current.branding_history) ? current.branding_history : [];
                safeUpdates.branding_history = [
                    {
                        saved_at: current.updated_date || new Date().toISOString(),
                        theme_primary_color: current.theme_primary_color || null,
                        config: previous,
                    },
                    ...history,
                ].slice(0, BRANDING_HISTORY_LIMIT);
            }
        }

        if (strippedFields.length > 0) {
            console.warn(`[SETTINGS] Stripped non-allowlisted fields for ${restaurant_id} by ${user.email}: ${strippedFields.join(', ')}`);
        }

        // Calculate high-risk changes for audit
        const highRiskChanges = {};
        for (const field of Object.keys(safeUpdates)) {
            if (HIGH_RISK_FIELDS.has(field)) {
                highRiskChanges[field] = {
                    before: current[field],
                    after: safeUpdates[field],
                };
            }
        }

        // Perform the update
        await base44.asServiceRole.entities.Restaurant.update(restaurant_id, safeUpdates);

        // Audit logging
        const hasHighRiskChanges = Object.keys(highRiskChanges).length > 0;
        const severity = hasHighRiskChanges ? 'high' : 'info';
        const auditDetails = {
            restaurant_id,
            restaurant_name: current.name,
            updated_fields: Object.keys(safeUpdates),
            high_risk_changes: highRiskChanges,
            stripped_fields: strippedFields,
            note: note || null,
        };

        console.log(`[AUDIT] RESTAURANT_SETTINGS_UPDATE: actor=${user.email} restaurant=${restaurant_id} severity=${severity} fields=${Object.keys(safeUpdates).join(',')} ${hasHighRiskChanges ? `high_risk=${JSON.stringify(highRiskChanges)}` : ''}`);

        try {
            await base44.asServiceRole.entities.DashboardActivity.create({
                user_email: user.email,
                action: 'RESTAURANT_SETTINGS_UPDATE',
                resource_type: 'Restaurant',
                resource_id: restaurant_id,
                details: JSON.stringify(auditDetails),
                severity,
            });
        } catch (dbErr) {
            console.error('[AUDIT] Could not persist settings audit log:', dbErr.message);
        }

        return Response.json({
            success: true,
            updated_fields: Object.keys(safeUpdates),
            stripped_fields: strippedFields,
            high_risk_changes: hasHighRiskChanges ? highRiskChanges : undefined,
        });

    } catch (error) {
        console.error('[SETTINGS] updateRestaurantSettings error:', error);
        return Response.json({ error: 'Settings update failed. Please try again.' }, { status: 500 });
    }
});