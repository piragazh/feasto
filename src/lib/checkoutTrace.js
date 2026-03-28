/**
 * Checkout Trace Logger
 * Provides structured, trace-correlated logging for the entire payment flow.
 * One trace ID is generated per checkout session and threaded through all steps.
 */

const _state = { id: null };

export const checkoutTrace = {
    reset: (id) => {
        _state.id = id;
    },
    getId: () => _state.id,
    log: (step, data = {}) => {
        if (!_state.id) return;
        console.log(`[CHECKOUT_TRACE] trace=${_state.id} step=${step}`, Object.keys(data).length ? JSON.stringify(data) : '');
    },
    error: (step, data = {}) => {
        if (!_state.id) return;
        console.error(`[CHECKOUT_TRACE_ERR] trace=${_state.id} step=${step}`, Object.keys(data).length ? JSON.stringify(data) : '');
    },
};