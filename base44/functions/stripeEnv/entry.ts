/**
 * STRIPE ENVIRONMENT VALIDATION — Shared startup guard
 *
 * Call validateStripeEnv() at the top of any function that uses Stripe.
 * Throws on invalid/mixed key configuration. Logs diagnostic summary.
 *
 * Rules:
 *   - sk_live_* must only be paired with pk_live_*
 *   - sk_test_* must only be paired with pk_test_*
 *   - Mixing live/test keys is a hard failure (not a warning)
 *   - Missing STRIPE_WEBHOOK_SECRET is a hard failure for webhook handlers
 */

export function getStripeMode(key = '') {
    if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) return 'live';
    if (key.startsWith('sk_test_') || key.startsWith('pk_test_')) return 'test';
    return 'unknown';
}

/**
 * Validate Stripe key configuration. Throws on:
 *   - Missing secret key
 *   - Unknown key format
 *   - Mixed live/test keys
 *   - Missing webhook secret (when requireWebhookSecret=true)
 *
 * @param {object} opts
 * @param {boolean} [opts.requireWebhookSecret] - Set true for webhook handlers
 * @returns {{ secretMode, publishableMode, webhookPresent, mode }}
 */
export function validateStripeEnv({ requireWebhookSecret = false } = {}) {
    const secretKey     = Deno.env.get('STRIPE_SECRET_KEY') || '';
    const publishableKey = Deno.env.get('STRIPE_PUBLIC_KEY') || Deno.env.get('VITE_STRIPE_PUBLIC_KEY') || '';
    const webhookSecret  = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

    const secretMode      = getStripeMode(secretKey);
    const publishableMode = publishableKey ? getStripeMode(publishableKey) : 'not_set';
    const webhookPresent  = webhookSecret.length > 0;

    // ── Diagnostic log (always emitted on startup) ────────────────────────
    console.log(`[STRIPE_ENV] mode=${secretMode} | secret=${secretMode} | publishable=${publishableMode} | webhook_secret=${webhookPresent ? 'present' : 'MISSING'}`);

    // ── Hard failures ─────────────────────────────────────────────────────
    if (!secretKey) {
        throw new Error('[STRIPE_ENV] FATAL: STRIPE_SECRET_KEY is not set');
    }

    if (secretMode === 'unknown') {
        throw new Error(`[STRIPE_ENV] FATAL: STRIPE_SECRET_KEY has unrecognised format (must begin sk_live_ or sk_test_). Got prefix: ${secretKey.slice(0, 8)}...`);
    }

    // Only validate publishable key if it is set
    if (publishableKey) {
        if (publishableMode === 'unknown') {
            throw new Error(`[STRIPE_ENV] FATAL: Publishable key has unrecognised format (must begin pk_live_ or pk_test_). Got prefix: ${publishableKey.slice(0, 8)}...`);
        }
        if (secretMode !== publishableMode) {
            throw new Error(
                `[STRIPE_ENV] FATAL: KEY MODE MISMATCH — secret key is "${secretMode}" but publishable key is "${publishableMode}". ` +
                `Live and test keys cannot be mixed. Check STRIPE_SECRET_KEY and STRIPE_PUBLIC_KEY environment variables.`
            );
        }
    }

    if (requireWebhookSecret && !webhookPresent) {
        throw new Error('[STRIPE_ENV] FATAL: STRIPE_WEBHOOK_SECRET is not set — webhook signature verification is impossible');
    }

    return { secretMode, publishableMode, webhookPresent, mode: secretMode };
}