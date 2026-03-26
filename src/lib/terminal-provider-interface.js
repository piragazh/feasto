/**
 * Terminal Provider Interface
 * 
 * Defines the contract that all terminal providers must implement.
 * Enables swapping providers (Ingenico, PAX, Square, etc.) without UI changes.
 */

/**
 * Base TerminalProvider interface
 * All providers must implement these methods
 */
export class TerminalProvider {
  /**
   * Initialize the terminal (connect to hardware)
   * @returns {Promise<void>}
   * @throws {TerminalError}
   */
  async init() {
    throw new Error('init() not implemented');
  }

  /**
   * Start a payment transaction
   * @param {Object} params
   * @param {number} params.amount - Amount in cents (e.g., 1000 = $10.00)
   * @param {string} params.currency - ISO currency code (e.g., 'GBP')
   * @param {string} params.orderId - Unique order identifier
   * @returns {Promise<TerminalResponse>}
   * @throws {TerminalError}
   */
  async startPayment({ amount, currency, orderId }) {
    throw new Error('startPayment() not implemented');
  }

  /**
   * Cancel the current transaction
   * @returns {Promise<void>}
   * @throws {TerminalError}
   */
  async cancelPayment() {
    throw new Error('cancelPayment() not implemented');
  }

  /**
   * Get current terminal status/health
   * @returns {Promise<Object>} { online: boolean, lastActivity: Date, ... }
   */
  async getStatus() {
    throw new Error('getStatus() not implemented');
  }
}

/**
 * Normalized response structure all providers must return
 * @typedef {Object} TerminalResponse
 * @property {string} status - 'authorized' | 'declined' | 'error'
 * @property {string} transaction_id - Unique transaction ID from provider
 * @property {string} receipt_reference - Reference for customer receipt
 * @property {string} [error_code] - Provider-specific error code (if error)
 * @property {string} [error_message] - Human-readable error message (if error)
 * @property {Object} [metadata] - Provider-specific data (for receipts, audits, etc.)
 */

/**
 * Terminal Error - should be thrown by providers
 */
export class TerminalError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'TerminalError';
    this.code = code;
    this.details = details;
  }
}