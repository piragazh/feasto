/**
 * STRIPE CONFIG DIAGNOSTIC — Admin-only endpoint
 *
 * Reports current Stripe key mode without exposing secrets.
 * Returns: { mode, secret_mode, publishable_mode, webhook_secret_present, issues, safe_for_production }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function getStripeMode(key = '') {
    if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) return 'live';
    if (key.startsWith('sk_test_') || key.startsWith('pk_test_')) return 'test';
    return 'unknown';
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
        }

        const secretKey      = Deno.env.get('STRIPE_SECRET_KEY') || '';
        const publishableKey = Deno.env.get('STRIPE_PUBLIC_KEY') || Deno.env.get('VITE_STRIPE_PUBLIC_KEY') || '';
        const webhookSecret  = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

        const secretMode      = getStripeMode(secretKey);
        const publishableMode = publishableKey ? getStripeMode(publishableKey) : 'not_set';
        const webhookPresent  = webhookSecret.length > 0;
        const modeMatch       = !publishableKey || secretMode === publishableMode;

        const issues = [];
        if (!secretKey)            issues.push('STRIPE_SECRET_KEY is not set');
        if (secretMode === 'unknown') issues.push(`Secret key format unrecognised — must start with sk_live_ or sk_test_ (got: ${secretKey.slice(0, 10)}...)`);
        if (!modeMatch)            issues.push(`KEY MODE MISMATCH: secret_key=${secretMode}, publishable_key=${publishableMode} — mixed live/test keys are not allowed`);
        if (!webhookPresent)       issues.push('STRIPE_WEBHOOK_SECRET is not set — webhook verification impossible');

        const safe_for_production = issues.length === 0 && secretMode === 'live';
        const safe_for_staging    = issues.length === 0 && secretMode === 'test';

        const report = {
            stripe_mode: secretMode,
            secret_key_mode: secretMode,
            publishable_key_mode: publishableMode,
            webhook_secret_present: webhookPresent,
            key_mode_match: modeMatch,
            safe_for_production,
            safe_for_staging,
            issues,
            secret_key_prefix:      secretKey      ? secretKey.slice(0, 12) + '...' : 'NOT_SET',
            publishable_key_prefix:  publishableKey ? publishableKey.slice(0, 12) + '...' : 'NOT_SET',
            checked_at: new Date().toISOString()
        };

        console.log('[STRIPE_CONFIG_DIAG]', JSON.stringify(report));
        return Response.json(report);

    } catch (error) {
        console.error('[STRIPE_CONFIG_DIAG] Error:', error.message);
        return Response.json({ error: error.message, safe_for_production: false, safe_for_staging: false }, { status: 500 });
    }
});