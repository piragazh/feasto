/**
 * Terminal State Machine
 * 
 * Defines valid terminal states and transitions.
 * Enforces strict state flow for payment processing.
 */

export const TERMINAL_STATES = {
  IDLE: 'idle',                    // Ready, no payment in progress
  INITIATING: 'initiating',        // Starting payment flow
  AWAITING_CARD: 'awaiting_card',  // Waiting for card tap/swipe
  PROCESSING: 'processing',        // Transaction sent to provider
  AUTHORIZED: 'authorized',        // Payment successful
  DECLINED: 'declined',            // Card declined
  CANCELLED: 'cancelled',          // User cancelled
  FAILED: 'failed',                // Provider error (not declined)
  TIMEOUT: 'timeout'               // Timeout waiting for card
};

/**
 * Valid state transitions
 * Maps: current_state -> [allowed_next_states]
 */
export const VALID_TRANSITIONS = {
  [TERMINAL_STATES.IDLE]: [
    TERMINAL_STATES.INITIATING
  ],
  [TERMINAL_STATES.INITIATING]: [
    TERMINAL_STATES.AWAITING_CARD,
    TERMINAL_STATES.FAILED,
    TERMINAL_STATES.CANCELLED
  ],
  [TERMINAL_STATES.AWAITING_CARD]: [
    TERMINAL_STATES.PROCESSING,
    TERMINAL_STATES.TIMEOUT,
    TERMINAL_STATES.CANCELLED
  ],
  [TERMINAL_STATES.PROCESSING]: [
    TERMINAL_STATES.AUTHORIZED,
    TERMINAL_STATES.DECLINED,
    TERMINAL_STATES.FAILED,
    TERMINAL_STATES.CANCELLED,
    TERMINAL_STATES.TIMEOUT
  ],
  // Terminal states (no further transitions except back to IDLE)
  [TERMINAL_STATES.AUTHORIZED]: [TERMINAL_STATES.IDLE],
  [TERMINAL_STATES.DECLINED]: [TERMINAL_STATES.IDLE],
  [TERMINAL_STATES.CANCELLED]: [TERMINAL_STATES.IDLE],
  [TERMINAL_STATES.FAILED]: [TERMINAL_STATES.IDLE],
  [TERMINAL_STATES.TIMEOUT]: [TERMINAL_STATES.IDLE]
};

/**
 * Check if transition is valid
 * @param {string} currentState
 * @param {string} nextState
 * @returns {boolean}
 */
export function isValidTransition(currentState, nextState) {
  const allowed = VALID_TRANSITIONS[currentState] || [];
  return allowed.includes(nextState);
}

/**
 * Check if state is a terminal state (payment complete)
 * @param {string} state
 * @returns {boolean}
 */
export function isTerminalState(state) {
  return [
    TERMINAL_STATES.AUTHORIZED,
    TERMINAL_STATES.DECLINED,
    TERMINAL_STATES.CANCELLED,
    TERMINAL_STATES.FAILED,
    TERMINAL_STATES.TIMEOUT
  ].includes(state);
}

/**
 * Check if state is a success state
 * @param {string} state
 * @returns {boolean}
 */
export function isSuccessState(state) {
  return state === TERMINAL_STATES.AUTHORIZED;
}

/**
 * Check if state is a failure state
 * @param {string} state
 * @returns {boolean}
 */
export function isFailureState(state) {
  return [
    TERMINAL_STATES.DECLINED,
    TERMINAL_STATES.FAILED,
    TERMINAL_STATES.TIMEOUT,
    TERMINAL_STATES.CANCELLED
  ].includes(state);
}