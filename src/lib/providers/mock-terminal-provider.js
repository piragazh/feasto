/**
 * Mock Terminal Provider
 * 
 * Simulates a real card terminal for testing and development.
 * DETERMINISTIC: behavior is reproducible, not random.
 * 
 * Success/failure determined by:
 * - Order amount ending in specific digits
 * - Or explicit test mode set during init
 */

import { TerminalProvider, TerminalError } from '@/lib/terminal-provider-interface.js';

export class MockTerminalProvider extends TerminalProvider {
  constructor() {
    super();
    this.isInitialized = false;
    this.testMode = null; // Can be set to 'success' | 'decline' | 'timeout' | 'error'
    this.lastTransactionId = null;
  }

  /**
   * Initialize the mock terminal
   * @param {Object} options
   * @param {string} options.testMode - 'success' | 'decline' | 'timeout' | 'error' (optional)
   */
  async init(options = {}) {
    // Simulate initialization delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    this.isInitialized = true;
    this.testMode = options.testMode || null;
    
    console.log('[MockTerminal] Initialized', { testMode: this.testMode });
  }

  /**
   * Start a payment
   * @param {Object} params - { amount, currency, orderId }
   * @returns {Promise<TerminalResponse>}
   */
  async startPayment({ amount, currency, orderId }) {
    if (!this.isInitialized) {
      throw new TerminalError(
        'Terminal not initialized',
        'NOT_INITIALIZED',
        { orderId }
      );
    }

    try {
      // Simulate card tap/swipe + processing delay
      await this._simulateAwaitingCard();
      
      // Determine outcome (deterministically)
      const outcome = this._determineOutcome(amount, orderId);
      
      // Simulate processing
      await this._simulateProcessing();

      // Return normalized response
      if (outcome === 'success') {
        this.lastTransactionId = this._generateTransactionId(orderId);
        return {
          status: 'authorized',
          transaction_id: this.lastTransactionId,
          receipt_reference: `RCP-${this.lastTransactionId}`,
          metadata: {
            provider: 'mock',
            amount,
            currency,
            orderId,
            timestamp: new Date().toISOString()
          }
        };
      } else if (outcome === 'decline') {
        return {
          status: 'declined',
          transaction_id: null,
          receipt_reference: null,
          error_code: 'CARD_DECLINED',
          error_message: 'Card was declined by issuer',
          metadata: {
            provider: 'mock',
            amount,
            currency,
            orderId,
            timestamp: new Date().toISOString()
          }
        };
      } else if (outcome === 'timeout') {
        throw new TerminalError(
          'Timeout waiting for card',
          'TIMEOUT',
          { orderId, amount }
        );
      } else {
        // 'error'
        throw new TerminalError(
          'Terminal communication error',
          'COMMUNICATION_ERROR',
          { orderId, amount }
        );
      }
    } catch (error) {
      if (error instanceof TerminalError) {
        throw error;
      }
      throw new TerminalError(
        error.message,
        'UNKNOWN_ERROR',
        { orderId, originalError: error.message }
      );
    }
  }

  /**
   * Cancel the current payment
   */
  async cancelPayment() {
    // Simulate cancellation
    await new Promise(resolve => setTimeout(resolve, 200));
    this.lastTransactionId = null;
  }

  /**
   * Get terminal status
   */
  async getStatus() {
    return {
      online: true,
      initialized: this.isInitialized,
      lastActivity: new Date(),
      provider: 'mock'
    };
  }

  // ──────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────────────────

  /**
   * Determine payment outcome (deterministically)
   * If testMode set, use that. Otherwise use amount-based logic.
   */
  _determineOutcome(amount, orderId) {
    // If explicit test mode set, use it
    if (this.testMode === 'success') return 'success';
    if (this.testMode === 'decline') return 'decline';
    if (this.testMode === 'timeout') return 'timeout';
    if (this.testMode === 'error') return 'error';

    // Otherwise, use deterministic amount-based logic:
    // Amounts ending in:
    // - 02 → decline
    // - 03 → timeout
    // - 04 → error
    // - anything else → success

    const lastTwoDigits = amount % 100;

    if (lastTwoDigits === 2) return 'decline';
    if (lastTwoDigits === 3) return 'timeout';
    if (lastTwoDigits === 4) return 'error';

    return 'success';
  }

  /**
   * Simulate waiting for card (tap/swipe)
   */
  async _simulateAwaitingCard() {
    // In real terminal, this would wait for actual hardware event
    // Here we simulate a 1-3 second delay
    const delay = 1000 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Simulate processing at provider
   */
  async _simulateProcessing() {
    // Simulate network round-trip
    const delay = 500 + Math.random() * 1500;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Generate a transaction ID
   */
  _generateTransactionId(orderId) {
    return `mock_${orderId}_${Date.now()}`;
  }
}