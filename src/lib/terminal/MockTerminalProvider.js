/**
 * MockTerminalProvider — Deterministic mock for testing and development
 * 
 * CRITICAL DESIGN:
 * - NO Math.random() in production paths
 * - Behavior is FULLY DETERMINISTIC based on input
 * - Test mode enabled via environment or explicit config.deterministic_mode = true
 * - Clearly marked as NON-PRODUCTION
 * - Suitable for development, integration testing, and smoke tests
 * - NOT suitable for customer-facing environments
 */

import { BaseTerminalProvider, AUTHORIZATION_RESULT } from './TerminalProvider.js';

const NON_PRODUCTION_WARNING = `
⚠️  MOCK TERMINAL PROVIDER IN USE
This is a non-production, simulated terminal. Do NOT use in live environments.
Use only for development and testing. For production, configure a real terminal provider
(Stripe Terminal, SumUp, Square, or Worldpay).
`;

export class MockTerminalProvider extends BaseTerminalProvider {
    constructor(config = {}) {
        super(config);
        this.type = 'mock';
        this.name = 'Mock Terminal (Non-Production)';
        this.deterministic = config.deterministic_mode === true || config.test_mode === true;
        
        // Deterministic test scenarios (keyed by transactionRef pattern or amount)
        this.deterministicScenarios = {
            // Explicit scenarios by reference prefix
            'DECLINE_': () => this._declineResult(),
            'TIMEOUT_': () => this._timeoutResult(),
            'FAIL_': () => this._failResult(),
            'CANCEL_': () => this._cancelResult(),
            // Amount-based scenarios (for testing)
            '6.66': () => this._declineResult(),  // Magic amount: always decline
            '9.99': () => this._failResult(),    // Magic amount: always fail
        };
        
        this.simulationDelay = config.simulation_delay_ms || 1500;
        this.initialized = false;
    }

    async initialize() {
        console.warn(NON_PRODUCTION_WARNING);
        this.initialized = true;
        return { success: true };
    }

    async validateConfig() {
        if (!this.initialized) {
            return { valid: false, error: 'Mock provider not initialized' };
        }
        return { valid: true };
    }

    /**
     * Authorize a card payment using deterministic logic.
     * In test mode, behavior is fully determined by input.
     * In non-test mode, uses realistic randomized approval (≈95% pass rate).
     */
    async authorize({ amount, transactionRef, terminal = {} }) {
        if (!this.initialized) {
            return this._failResult(transactionRef);
        }

        // Log authorization attempt with warning
        console.warn(`[MOCK-TERMINAL] Authorizing £${amount.toFixed(2)} ref=${transactionRef}`);
        console.warn(NON_PRODUCTION_WARNING);

        return new Promise((resolve) => {
            setTimeout(() => {
                // ── DETERMINISTIC MODE: Full control for testing ────────────────────
                if (this.deterministic) {
                    const result = this._checkDeterministicScenario(transactionRef, amount);
                    if (result) {
                        console.log(`[MOCK-TERMINAL] Deterministic scenario matched: ${transactionRef}`);
                        resolve(result);
                        return;
                    }
                    // Default: always approve in deterministic mode unless explicit scenario
                    resolve(this._approveResult(transactionRef, amount, terminal));
                    return;
                }

                // ── NON-DETERMINISTIC MODE: Realistic randomization (for demos) ─────
                // 95% approval rate to simulate real card environment
                const approvalRate = 0.95;
                const approved = Math.random() < approvalRate;

                if (approved) {
                    resolve(this._approveResult(transactionRef, amount, terminal));
                } else {
                    resolve(this._declineResult(transactionRef, amount, terminal));
                }
            }, this.simulationDelay);
        });
    }

    /**
     * Check if transactionRef or amount matches a deterministic scenario.
     * Used ONLY in deterministic/test mode.
     * 
     * @private
     */
    _checkDeterministicScenario(transactionRef, amount) {
        // Check reference patterns
        for (const [pattern, handler] of Object.entries(this.deterministicScenarios)) {
            if (transactionRef.includes(pattern)) {
                return handler(transactionRef, amount);
            }
        }

        // Check amount patterns
        const amountStr = amount.toFixed(2);
        for (const [pattern, handler] of Object.entries(this.deterministicScenarios)) {
            if (amountStr === pattern) {
                return handler(transactionRef, amount);
            }
        }

        // No scenario matched
        return null;
    }

    /**
     * Approval result
     * @private
     */
    _approveResult(transactionRef, amount, terminal = {}) {
        return {
            success: true,
            status: AUTHORIZATION_RESULT.APPROVED,
            transactionRef,
            amount,
            provider: this.type,
            terminal: terminal.reader_label || terminal.reader_id || 'mock-terminal',
            timestamp: new Date().toISOString(),
            idempotencyKey: transactionRef, // Mock: transactionRef is idempotency key
            message: 'Card approved (mock)',
        };
    }

    /**
     * Decline result
     * @private
     */
    _declineResult(transactionRef, amount, terminal = {}) {
        return {
            success: false,
            status: AUTHORIZATION_RESULT.DECLINED,
            transactionRef,
            amount,
            provider: this.type,
            terminal: terminal.reader_label || terminal.reader_id || 'mock-terminal',
            timestamp: new Date().toISOString(),
            error: 'Card declined (mock)',
        };
    }

    /**
     * Failure result
     * @private
     */
    _failResult(transactionRef, amount, terminal = {}) {
        return {
            success: false,
            status: AUTHORIZATION_RESULT.FAILED,
            transactionRef,
            amount,
            provider: this.type,
            terminal: terminal.reader_label || terminal.reader_id || 'mock-terminal',
            timestamp: new Date().toISOString(),
            error: 'Terminal processing failed (mock)',
        };
    }

    /**
     * Timeout result (simulates terminal hanging)
     * @private
     */
    _timeoutResult(transactionRef, amount, terminal = {}) {
        return {
            success: false,
            status: AUTHORIZATION_RESULT.TIMEOUT,
            transactionRef,
            amount,
            provider: this.type,
            terminal: terminal.reader_label || terminal.reader_id || 'mock-terminal',
            timestamp: new Date().toISOString(),
            error: 'Terminal did not respond in time (mock)',
        };
    }

    /**
     * Cancelled result (user pressed back)
     * @private
     */
    _cancelResult(transactionRef, amount, terminal = {}) {
        return {
            success: false,
            status: 'cancelled',
            transactionRef,
            amount,
            provider: this.type,
            terminal: terminal.reader_label || terminal.reader_id || 'mock-terminal',
            timestamp: new Date().toISOString(),
            error: 'Payment cancelled by user (mock)',
        };
    }

    async cancel(transactionRef) {
        console.log(`[MOCK-TERMINAL] Cancel requested for ${transactionRef}`);
        return true;
    }

    async getStatus(transactionRef) {
        console.log(`[MOCK-TERMINAL] Status check for ${transactionRef}`);
        // In mock, we assume recent transactions are still in process
        return {
            status: 'processing',
            transactionRef,
            timestamp: new Date().toISOString(),
        };
    }

    supportsIdempotency() {
        return true; // Mock provides idempotent behavior
    }
}