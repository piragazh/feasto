/**
 * Terminal Service
 * 
 * Core orchestrator for card terminal operations.
 * - Manages state machine
 * - Delegates to provider
 * - Emits updates to UI
 * - Enforces timeouts
 * - Normalizes responses
 * 
 * Dependency injection: provider passed in, not hardcoded.
 * Enables easy swapping (Mock → Real Ingenico, etc.)
 */

import {
  TERMINAL_STATES,
  isValidTransition,
  isTerminalState,
  isSuccessState,
  isFailureState
} from '@/lib/terminal-state-machine.js';

export class TerminalService {
  constructor(provider) {
    this.provider = provider;
    this.state = TERMINAL_STATES.IDLE;
    this.currentPayment = null;
    this.listeners = [];
    this.timeoutHandle = null;
    this.timeoutSeconds = 60; // Timeout waiting for card
  }

  /**
   * Initialize the terminal
   * @param {Object} options - Provider-specific options
   */
  async init(options = {}) {
    try {
      await this.provider.init(options);
      this.setState(TERMINAL_STATES.IDLE);
    } catch (error) {
      this.setState(TERMINAL_STATES.FAILED, {
        error: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Start a payment
   * @param {Object} params - { amount, currency, orderId }
   * @returns {Promise<Object>} Result { success, data, error }
   */
  async startPayment({ amount, currency, orderId }) {
    // Guard: already processing
    if (this.state !== TERMINAL_STATES.IDLE) {
      return {
        success: false,
        error: `Cannot start payment in state: ${this.state}`
      };
    }

    // Store current payment context
    this.currentPayment = { amount, currency, orderId, startedAt: Date.now() };

    try {
      // Transition: IDLE → INITIATING
      this.setState(TERMINAL_STATES.INITIATING);

      // Transition: INITIATING → AWAITING_CARD
      this.setState(TERMINAL_STATES.AWAITING_CARD);

      // Start timeout (for card tap)
      this.startTimeout();

      // Call provider to start payment
      // Provider will handle all transitions (processing, authorized, declined, etc.)
      const response = await this.provider.startPayment({
        amount,
        currency,
        orderId
      });

      // Clear timeout (got response)
      this.clearTimeout();

      // Transition to final state based on provider response
      if (response.status === 'authorized') {
        this.setState(TERMINAL_STATES.AUTHORIZED, {
          transactionId: response.transaction_id,
          receiptReference: response.receipt_reference,
          metadata: response.metadata
        });

        return {
          success: true,
          data: response
        };
      } else if (response.status === 'declined') {
        this.setState(TERMINAL_STATES.DECLINED, {
          errorCode: response.error_code,
          errorMessage: response.error_message
        });

        return {
          success: false,
          error: response.error_message || 'Card declined',
          errorCode: response.error_code
        };
      } else {
        // Unexpected status
        this.setState(TERMINAL_STATES.FAILED, {
          error: `Unexpected provider status: ${response.status}`
        });

        return {
          success: false,
          error: `Unexpected response status: ${response.status}`
        };
      }
    } catch (error) {
      this.clearTimeout();

      // Determine state based on error
      if (error.code === 'TIMEOUT') {
        this.setState(TERMINAL_STATES.TIMEOUT, {
          error: error.message
        });
      } else {
        this.setState(TERMINAL_STATES.FAILED, {
          error: error.message,
          code: error.code
        });
      }

      return {
        success: false,
        error: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * Cancel the current payment
   */
  async cancelPayment() {
    // Guard: not processing
    if (this.state === TERMINAL_STATES.IDLE || isTerminalState(this.state)) {
      return {
        success: false,
        error: 'No payment in progress'
      };
    }

    try {
      this.clearTimeout();
      await this.provider.cancelPayment();
      this.setState(TERMINAL_STATES.CANCELLED);
      this.currentPayment = null;

      return { success: true };
    } catch (error) {
      this.setState(TERMINAL_STATES.FAILED, { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset to idle after payment complete
   */
  resetToIdle() {
    if (!isTerminalState(this.state)) {
      console.warn(`Cannot reset from non-terminal state: ${this.state}`);
      return;
    }

    this.setState(TERMINAL_STATES.IDLE);
    this.currentPayment = null;
    this.clearTimeout();
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Get current payment data
   */
  getCurrentPayment() {
    return this.currentPayment;
  }

  /**
   * Subscribe to state changes
   * @param {Function} listener - Called with { state, metadata }
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // ──────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────────────────

  /**
   * Set state with validation and notify listeners
   */
  setState(nextState, metadata = {}) {
    // Validate transition
    if (!isValidTransition(this.state, nextState)) {
      console.error(
        `[Terminal] Invalid transition: ${this.state} → ${nextState}`
      );
      return;
    }

    const previousState = this.state;
    this.state = nextState;

    console.log(
      `[Terminal] State transition: ${previousState} → ${nextState}`,
      metadata
    );

    // Notify all listeners
    this.listeners.forEach(listener => {
      listener({
        state: nextState,
        previousState,
        metadata
      });
    });
  }

  /**
   * Start a timeout for card waiting
   */
  startTimeout() {
    this.clearTimeout(); // Clear any existing

    this.timeoutHandle = setTimeout(() => {
      console.warn(`[Terminal] Timeout waiting for card (${this.timeoutSeconds}s)`);
      this.setState(TERMINAL_STATES.TIMEOUT, {
        error: 'Timeout waiting for card'
      });
      this.listeners.forEach(listener => {
        listener({
          state: TERMINAL_STATES.TIMEOUT,
          type: 'timeout'
        });
      });
    }, this.timeoutSeconds * 1000);
  }

  /**
   * Clear timeout
   */
  clearTimeout() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}