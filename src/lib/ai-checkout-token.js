/**
 * The token of the AI pay link this browser arrived through (/AiCheckout?t=...).
 *
 * AiCheckout saves it; the checkout sends it with the order (orderData.ai_checkout_token)
 * so verifyAndCreateOrder can tie the paid order to the exact AI conversation it came
 * from. Before this, the link was guessed from the phone number or the basket, which
 * could attach a stranger's order to someone else's chat.
 *
 * Kept only for the restaurant the link was for, and for 3 hours (links last 2).
 */
const KEY = 'aiCheckoutToken';
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
const SHAPE = /^[A-Za-z0-9_-]{20,64}$/;

export function saveAiCheckoutToken(token, restaurantId) {
    try {
        if (!SHAPE.test(String(token || '')) || !restaurantId) return;
        localStorage.setItem(KEY, JSON.stringify({ token, restaurant_id: restaurantId, at: Date.now() }));
    } catch { /* storage blocked: the order still goes through, just unlinked */ }
}

/** The saved token, if it belongs to this restaurant and is still fresh; otherwise null. */
export function readAiCheckoutToken(restaurantId) {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const v = JSON.parse(raw);
        if (!v || !SHAPE.test(String(v.token || '')) || v.restaurant_id !== restaurantId
            || !(Date.now() - Number(v.at) < MAX_AGE_MS)) {
            return null;
        }
        return v.token;
    } catch { return null; }
}

export function clearAiCheckoutToken() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
