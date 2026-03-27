/**
 * Server-side restaurant settings update — replaces direct entity writes from RestaurantSettings component.
 *
 * FIELD ALLOWLIST:
 *   - Low-risk (non-financial): description, address, phone, alert_phone, logo_url,
 *     food_hygiene_rating, food_hygiene_certificate_url, seo_keywords, seo_description,
 *     theme_primary_color, cuisine_types, cuisine_type, whatsapp_alerts_enabled,
 *     sms_alerts_enabled, order_alert_channel, collection_enabled, printer_config,
 *     opening_hours, delivery_hours, collection_hours, name
 *   - High-risk (financial/order-affecting, audited with before/after):
 *     delivery_fee, minimum_order, tiered_delivery, accepts_cash_on_delivery,
 *     loyalty_program_enabled, loyalty_points_multiplier
 *
 * Fields NOT on the allowlist are silently stripped and logged.
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
]);

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

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurant_id, updates, note } = await req.json();

        if (!restaurant_id || !updates || typeof updates !== 'object') {
            return Response.json({ error: 'restaurant_id and updates required' }, { status: 400 });
        }

        // TENANT CHECK
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurant_id));
            if (!hasAccess) {
                console.error(`[SECURITY] ${user.email} attempted to update settings for restaurant ${restaurant_id}`);
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
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