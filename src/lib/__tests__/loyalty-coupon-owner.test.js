/**
 * Loyalty coupon ownership.
 *
 * Reward coupons used to encode ownership by putting "loyalty_user_<email>" in
 * restaurant_id. Both the checkout and the server then rejected them as being
 * for the wrong restaurant, so redeeming points produced a coupon nobody could
 * spend - the loyalty scheme never completed a cycle.
 *
 * Ownership now lives in its own field, and is enforced only when set.
 */
import { describe, it, expect } from 'vitest';
import { validateCoupon } from '../order-logic.js';

const REST = 'rest-1';
const reward = (owner, extra = {}) => ({
    code: 'RW-1', is_active: true, discount_type: 'fixed', discount_value: 5,
    restaurant_id: REST, loyalty_owner: owner, ...extra,
});

describe('a reward coupon belongs to one customer', () => {
    it('the owner can use it', () => {
        expect(validateCoupon(reward('email:sam@x.com'), 20, REST, ['email:sam@x.com']).valid).toBe(true);
    });

    it('a guest can own one by phone', () => {
        expect(validateCoupon(reward('phone:07123456789'), 20, REST, ['phone:07123456789']).valid).toBe(true);
    });

    it('someone else cannot use it', () => {
        const r = validateCoupon(reward('email:sam@x.com'), 20, REST, ['email:alex@x.com']);
        expect(r.valid).toBe(false);
        expect(r.reason).toBe('not_your_coupon');
    });

    it('cannot be used with no identity at all', () => {
        expect(validateCoupon(reward('email:sam@x.com'), 20, REST, []).valid).toBe(false);
    });

    it('matches when the customer has both an account and a phone', () => {
        expect(validateCoupon(reward('phone:07123456789'), 20, REST, ['email:sam@x.com', 'phone:07123456789']).valid).toBe(true);
    });
});

describe('ordinary coupons are untouched', () => {
    it('a normal promotional code still works for anyone', () => {
        const plain = { code: 'SAVE10', is_active: true, discount_type: 'percentage', discount_value: 10, restaurant_id: REST };
        expect(validateCoupon(plain, 20, REST, []).valid).toBe(true);
        expect(validateCoupon(plain, 20, REST).valid).toBe(true);        // no identity passed at all
    });
});

describe('REGRESSION GUARD: the old tagging is gone', () => {
    it('a reward coupon is valid at the restaurant it belongs to', () => {
        // Previously restaurant_id held "loyalty_user_sam@x.com", so this was
        // rejected as wrong_restaurant and the reward was unusable.
        expect(validateCoupon(reward('email:sam@x.com'), 20, REST, ['email:sam@x.com']).reason).not.toBe('wrong_restaurant');
    });

    it('a coupon still cannot be used at a different restaurant', () => {
        const r = validateCoupon(reward('email:sam@x.com'), 20, 'other-rest', ['email:sam@x.com']);
        expect(r.reason).toBe('wrong_restaurant');
    });
});
