/**
 * kioskTerminalReadiness.js
 *
 * Pure, side-effect-free function that evaluates whether the card terminal
 * is usable right now, given the restaurant's kiosk_config.
 *
 * Returns a readiness descriptor — intentionally separating the raw diagnostic
 * reason (admin-visible) from whether the option should appear to customers.
 *
 * Usage:
 *   import { getTerminalReadiness } from '@/lib/kioskTerminalReadiness';
 *   const readiness = getTerminalReadiness(restaurant?.kiosk_config);
 *   if (readiness.configured && readiness.available) { ... }
 */

/**
 * @typedef {Object} TerminalReadiness
 * @property {boolean} configured  - A reader_id is saved in config
 * @property {boolean} available   - Terminal is configured AND not marked unavailable
 * @property {string|null} provider - Terminal provider string (e.g. 'stripe_terminal')
 * @property {string|null} reason   - Admin-facing reason why terminal is not available (null when available)
 */

/**
 * Evaluate terminal readiness from kiosk_config.
 *
 * @param {object|null|undefined} kioskConfig - restaurant.kiosk_config
 * @returns {TerminalReadiness}
 */
export function getTerminalReadiness(kioskConfig) {
    // Guard: no config at all
    if (!kioskConfig) {
        return {
            configured: false,
            available: false,
            provider: null,
            reason: 'No kiosk configuration found.',
        };
    }

    const terminalConfig = kioskConfig.card_terminal || null;
    const readerId = terminalConfig?.reader_id?.trim() || '';

    // Not configured: no reader_id saved
    if (!readerId) {
        return {
            configured: false,
            available: false,
            provider: terminalConfig?.provider || null,
            reason: 'No card reader configured. Add a Reader ID in Kiosk Settings.',
        };
    }

    // Configured but explicitly marked unavailable at runtime
    if (kioskConfig.terminal_unavailable === true) {
        return {
            configured: true,
            available: false,
            provider: terminalConfig?.provider || null,
            reason: 'Card reader is marked as temporarily unavailable.',
        };
    }

    // Configured and available
    return {
        configured: true,
        available: true,
        provider: terminalConfig?.provider || null,
        reason: null,
    };
}

/**
 * Derive which payment methods are visible to the customer right now.
 *
 * @param {object|null|undefined} kioskConfig
 * @returns {{ showCard: boolean, showCounter: boolean, terminalReadiness: TerminalReadiness }}
 */
export function getKioskPaymentOptions(kioskConfig) {
    const readiness = getTerminalReadiness(kioskConfig);

    const cardConfigEnabled = kioskConfig?.payment_card_enabled === true;
    // Counter is enabled by default unless explicitly set to false
    const counterConfigEnabled = kioskConfig?.payment_counter_enabled !== false;
    // Auto-fallback: if card was meant to show but terminal isn't configured, expose counter
    const counterFallback = cardConfigEnabled && !readiness.configured;

    const showCard = cardConfigEnabled && readiness.configured && readiness.available;
    const showCounter = counterConfigEnabled || counterFallback;

    return { showCard, showCounter, terminalReadiness: readiness };
}