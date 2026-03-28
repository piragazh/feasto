/**
 * Maps structured error codes from createPaymentIntent backend
 * to user-facing messages. Falls back to the raw error message.
 *
 * Error codes are documented in functions/createPaymentIntent.
 */
export const PI_ERROR_CODE_MESSAGES = {
    MATH_INTEGRITY_FAIL: 'Your order total changed. Please review your basket and try again.',
    STRIPE_IDEMPOTENCY_CONFLICT: 'Your session has changed. Please refresh the page and try again.',
    STRIPE_NULL_SECRET: 'This payment session has expired. Please refresh and try again.',
    STRIPE_API_ERROR: 'Payment system temporarily unavailable. Please try again.',
    INVALID_AMOUNT: 'Invalid order total. Please review your basket.',
    INVALID_ITEMS: 'Your basket appears empty. Please go back and add items.',
    INVALID_RESTAURANT: 'Restaurant information missing. Please go back and try again.',
    INVALID_CURRENCY: 'Payment currency error. Please contact support.',
    INVALID_IDEMPOTENCY_KEY: 'Session error. Please refresh the page.',
    INTERNAL_ERROR: 'An unexpected error occurred. Please refresh and try again.',
};

/**
 * Returns a user-friendly message for a given PI error code.
 * Falls back to the raw server error message if code is unrecognised.
 */
export function getPaymentErrorMessage(code, fallbackMessage) {
    return PI_ERROR_CODE_MESSAGES[code] || fallbackMessage || 'Failed to initialize payment. Please try again.';
}