/**
 * Terminal Provider Interface
 * 
 * Abstract provider definition for card terminal integrations.
 * Each provider (Stripe, SumUp, Square, Worldpay, MockTerminal) must implement this interface.
 * 
 * CRITICAL: No provider instance should be used directly by business logic.
 * All terminal calls go through TerminalService (see TerminalService.js).
 */

/**
 * Base interface that all terminal providers must implement.
 * 
 * @typedef {Object} TerminalProvider
 * @property {string} type - Provider identifier: 'stripe_terminal', 'sumup', 'square', 'worldpay', 'mock'
 * @property {string} name - Human-readable name
 * @property {Function} initialize - Set up provider connection
 * @property {Function} authorize - Execute card authorization
 * @property {Function} cancel - Cancel in-flight authorization
 * @property {Function} getStatus - Fetch status of a transaction
 * @property {Function} supportsIdempotency - Whether provider guarantees idempotent retries
 */

export const TERMINAL_STATES = {
    IDLE: 'idle',
    INITIATING: 'initiating',
    AWAITING_CARD: 'awaiting_card',
    PROCESSING: 'processing',
    AUTHORIZED: 'authorized',
    DECLINED: 'declined',
    CANCELLED: 'cancelled',
    FAILED: 'failed',
    TIMEOUT: 'timeout',
};

export const AUTHORIZATION_RESULT = {
    APPROVED: 'approved',
    DECLINED: 'declined',
    FAILED: 'failed',
    TIMEOUT: 'timeout',
};

/**
 * Interface that every terminal provider must implement.
 * Providers are NOT called directly — TerminalService wraps them.
 */
export class BaseTerminalProvider {
    constructor(config = {}) {
        this.type = 'base';
        this.name = 'Base Provider';
        this.config = config;
    }

    /**
     * Initialize provider (e.g., connect to API, set credentials)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async initialize() {
        throw new Error('Provider must implement initialize()');
    }

    /**
     * Authorize a card payment.
     * 
     * @param {Object} params
     * @param {number} params.amount - Amount in GBP
     * @param {string} params.transactionRef - Unique reference for this attempt
     * @param {Object} params.terminal - Terminal configuration
     * @returns {Promise<{
     *   status: 'approved' | 'declined' | 'failed' | 'timeout',
     *   transactionRef: string,
     *   amount: number,
     *   provider: string,
     *   timestamp: string,
     *   idempotencyKey?: string,
     *   providerRef?: string,
     *   error?: string
     * }>}
     */
    async authorize({ amount, transactionRef, terminal }) {
        throw new Error('Provider must implement authorize()');
    }

    /**
     * Cancel an in-flight authorization (user pressed back, timeout, etc.)
     * @param {string} transactionRef
     * @returns {Promise<boolean>}
     */
    async cancel(transactionRef) {
        throw new Error('Provider must implement cancel()');
    }

    /**
     * Check status of a previous authorization (useful for retries after network failure).
     * @param {string} transactionRef
     * @returns {Promise<{status: string, transactionRef: string, timestamp: string}>}
     */
    async getStatus(transactionRef) {
        throw new Error('Provider must implement getStatus()');
    }

    /**
     * Whether this provider guarantees idempotent transaction handling.
     * If true, the same transactionRef can be safely re-submitted.
     * @returns {boolean}
     */
    supportsIdempotency() {
        return false;
    }

    /**
     * Validate provider configuration before use.
     * @returns {Promise<{valid: boolean, error?: string}>}
     */
    async validateConfig() {
        throw new Error('Provider must implement validateConfig()');
    }
}

/**
 * Provider registry: maps provider type to class.
 * New providers are registered here and loaded by TerminalService.
 */
export const TERMINAL_PROVIDERS = {};

export function registerProvider(type, ProviderClass) {
    if (TERMINAL_PROVIDERS[type]) {
        console.warn(`[TERMINAL] Provider type '${type}' already registered, overwriting`);
    }
    TERMINAL_PROVIDERS[type] = ProviderClass;
}

/**
 * Get a provider instance by type.
 * @param {string} type - Provider type key
 * @param {Object} config - Provider configuration
 * @returns {BaseTerminalProvider}
 */
export function getProvider(type, config = {}) {
    const ProviderClass = TERMINAL_PROVIDERS[type];
    if (!ProviderClass) {
        throw new Error(`Unknown terminal provider type: '${type}'`);
    }
    return new ProviderClass(config);
}