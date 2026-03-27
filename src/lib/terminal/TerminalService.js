/**
 * TerminalService — Terminal orchestrator
 * 
 * CRITICAL ARCHITECTURE:
 * - Single entry point for all terminal operations
 * - Routes requests through appropriate provider based on config
 * - Enforces deterministic behavior in test/dev environments
 * - No provider-specific logic in business functions
 * - UI never calls providers directly
 * - All terminal attempts write to KioskTerminalTransaction record
 */

import { MockTerminalProvider } from './MockTerminalProvider.js';
import { registerProvider, getProvider, AUTHORIZATION_RESULT } from './TerminalProvider.js';

// Register built-in mock provider
registerProvider('mock', MockTerminalProvider);

// Placeholder: real providers registered when their SDKs are integrated
// registerProvider('stripe_terminal', StripeTerminalProvider);
// registerProvider('sumup', SumUpProvider);
// registerProvider('square', SquareProvider);
// registerProvider('worldpay', WorldpayProvider);

/**
 * TerminalService — orchestrates terminal payments
 * 
 * Usage:
 *   const service = new TerminalService({
 *       provider: 'mock',
 *       deterministic_mode: true,
 *   });
 *   const result = await service.authorize({ amount, transactionRef, terminal });
 */
export class TerminalService {
    constructor(config = {}) {
        this.config = config;
        this.provider = null;
        this.initialized = false;
    }

    /**
     * Initialize terminal service with the configured provider.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async initialize() {
        try {
            const providerType = this.config.provider || 'mock';
            this.provider = getProvider(providerType, this.config);
            
            const initResult = await this.provider.initialize();
            if (initResult?.success === false) {
                return { success: false, error: initResult.error || 'Provider initialization failed' };
            }

            const validateResult = await this.provider.validateConfig();
            if (validateResult?.valid === false) {
                return { success: false, error: validateResult.error || 'Provider validation failed' };
            }

            this.initialized = true;
            console.log(`[TERMINAL-SERVICE] Initialized with provider: ${providerType}`);
            return { success: true };
        } catch (err) {
            console.error('[TERMINAL-SERVICE] Initialization error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Authorize a card payment.
     * 
     * Always returns normalized response — caller doesn't need provider-specific logic.
     * 
     * @param {Object} params
     * @param {number} params.amount - Amount in GBP
     * @param {string} params.transactionRef - Unique reference for this attempt
     * @param {Object} params.terminal - Terminal config (reader_id, reader_label, etc.)
     * @returns {Promise<{
     *   success: boolean,
     *   status: 'approved' | 'declined' | 'failed' | 'timeout',
     *   transactionRef: string,
     *   amount: number,
     *   provider: string,
     *   terminal: string,
     *   timestamp: string,
     *   error?: string
     * }>}
     */
    async authorize({ amount, transactionRef, terminal = {} }) {
        if (!this.initialized || !this.provider) {
            return {
                success: false,
                status: 'failed',
                transactionRef,
                error: 'Terminal service not initialized',
            };
        }

        try {
            const result = await this.provider.authorize({
                amount,
                transactionRef,
                terminal,
            });

            // Normalize response (each provider might have slightly different fields)
            return {
                success: result.status === AUTHORIZATION_RESULT.APPROVED,
                status: result.status,
                transactionRef: result.transactionRef || transactionRef,
                amount: result.amount || amount,
                provider: result.provider || this.config.provider || 'unknown',
                terminal: result.terminal || terminal.reader_label || 'terminal',
                timestamp: result.timestamp || new Date().toISOString(),
                error: result.error,
            };
        } catch (err) {
            console.error('[TERMINAL-SERVICE] Authorization error:', err);
            return {
                success: false,
                status: 'failed',
                transactionRef,
                amount,
                provider: this.config.provider || 'unknown',
                error: err.message || 'Terminal processing failed',
            };
        }
    }

    /**
     * Cancel an in-flight authorization.
     * @param {string} transactionRef
     * @returns {Promise<boolean>}
     */
    async cancel(transactionRef) {
        if (!this.initialized || !this.provider) {
            return false;
        }
        try {
            return await this.provider.cancel(transactionRef);
        } catch (err) {
            console.error('[TERMINAL-SERVICE] Cancel error:', err);
            return false;
        }
    }

    /**
     * Check status of a previous authorization.
     * @param {string} transactionRef
     * @returns {Promise<{status: string, transactionRef: string, timestamp: string}>}
     */
    async getStatus(transactionRef) {
        if (!this.initialized || !this.provider) {
            return { status: 'unknown', transactionRef };
        }
        try {
            return await this.provider.getStatus(transactionRef);
        } catch (err) {
            console.error('[TERMINAL-SERVICE] Status check error:', err);
            return { status: 'unknown', transactionRef };
        }
    }

    /**
     * Whether the current provider supports idempotent retries.
     * @returns {boolean}
     */
    supportsIdempotency() {
        if (!this.provider) return false;
        return this.provider.supportsIdempotency();
    }

    /**
     * Get provider type
     * @returns {string}
     */
    getProviderType() {
        return this.config.provider || 'mock';
    }
}

/**
 * Global singleton instance (for Deno serverless functions)
 * Initialize once at startup, reuse across requests.
 */
let globalTerminalService = null;

/**
 * Get or create global terminal service instance.
 * @param {Object} config - Service configuration
 * @returns {Promise<TerminalService>}
 */
export async function getTerminalService(config = {}) {
    if (globalTerminalService && !config.reinitialize) {
        return globalTerminalService;
    }

    const service = new TerminalService(config);
    await service.initialize();
    globalTerminalService = service;
    return service;
}