/**
 * GUEST IDENTITY — normalisation and composite fingerprinting
 *
 * Tests the pure functions used for best-effort guest abuse detection.
 * These are NOT identity-verification tests — the system cannot verify
 * guest signals. These tests confirm consistent normalisation so that
 * the same real person using different formatting is detected as the same.
 *
 * SYNC NOTE: normalizeEmail / normalizePhone / guestCompositeFingerprint
 * are mirrored in:
 *   - functions/verifyAndCreateOrder  (inline _normalizeEmail / _normalizePhone)
 *   - functions/orderVelocityThrottle (inline normalizePhone)
 * Any change here must be reflected in those handlers.
 */

import { describe, it, expect } from 'vitest';
import { normalizeEmail, normalizePhone, guestCompositeFingerprint } from '../order-logic.js';

// ─── normalizeEmail ───────────────────────────────────────────────────────────

describe('normalizeEmail', () => {
    it('lowercases email', () => {
        expect(normalizeEmail('User@Example.COM')).toBe('user@example.com');
    });

    it('trims whitespace', () => {
        expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
    });

    it('handles already-normalised email', () => {
        expect(normalizeEmail('user@example.com')).toBe('user@example.com');
    });

    it('returns null for null input', () => {
        expect(normalizeEmail(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
        expect(normalizeEmail(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(normalizeEmail('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
        expect(normalizeEmail('   ')).toBeNull();
    });

    it('does NOT strip plus aliases (foo+bar@gmail.com is distinct from foo@gmail.com)', () => {
        expect(normalizeEmail('user+alias@gmail.com')).toBe('user+alias@gmail.com');
    });

    it('does NOT strip dots (use.r@gmail.com is kept as-is)', () => {
        expect(normalizeEmail('use.r@gmail.com')).toBe('use.r@gmail.com');
    });
});

// ─── normalizePhone ───────────────────────────────────────────────────────────

describe('normalizePhone', () => {
    it('normalises 07 prefix UK number to 44 form', () => {
        expect(normalizePhone('07123456789')).toBe('447123456789');
    });

    it('normalises +44 prefix (already E.164)', () => {
        // +447123456789 → digits 447123456789 (no leading 07, already 44)
        expect(normalizePhone('+447123456789')).toBe('447123456789');
    });

    it('strips spaces: 07123 456789', () => {
        expect(normalizePhone('07123 456789')).toBe('447123456789');
    });

    it('strips hyphens: 07123-456-789', () => {
        expect(normalizePhone('07123-456-789')).toBe('447123456789');
    });

    it('strips brackets: (07123) 456789', () => {
        expect(normalizePhone('(07123) 456789')).toBe('447123456789');
    });

    it('produces the same key for 07123456789 and +447123456789', () => {
        expect(normalizePhone('07123456789')).toBe(normalizePhone('+447123456789'));
    });

    it('produces the same key for different formatting of the same number', () => {
        expect(normalizePhone('07123456789')).toBe(normalizePhone('07123 456 789'));
    });

    it('returns null for null input', () => {
        expect(normalizePhone(null)).toBeNull();
    });

    it('returns null for undefined', () => {
        expect(normalizePhone(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(normalizePhone('')).toBeNull();
    });

    it('returns null for too-short number (fewer than 10 digits)', () => {
        expect(normalizePhone('12345')).toBeNull();
    });

    it('returns null for non-numeric garbage', () => {
        expect(normalizePhone('not-a-phone')).toBeNull();
    });
});

// ─── guestCompositeFingerprint ────────────────────────────────────────────────

describe('guestCompositeFingerprint', () => {
    const orderData = {
        guest_email: 'Guest@Example.COM',
        phone: '07123 456789',
        restaurant_id: 'rest-aaa',
    };

    it('normalises email in the fingerprint', () => {
        const fp = guestCompositeFingerprint(orderData);
        expect(fp.email).toBe('guest@example.com');
    });

    it('normalises phone in the fingerprint', () => {
        const fp = guestCompositeFingerprint(orderData);
        expect(fp.phone).toBe('447123456789');
    });

    it('builds a phoneKey scoped to restaurant_id', () => {
        const fp = guestCompositeFingerprint(orderData);
        expect(fp.phoneKey).toBe('447123456789::rest-aaa');
    });

    it('builds an emailKey scoped to restaurant_id', () => {
        const fp = guestCompositeFingerprint(orderData);
        expect(fp.emailKey).toBe('guest@example.com::rest-aaa');
    });

    it('builds compositeKey containing both signals', () => {
        const fp = guestCompositeFingerprint(orderData);
        expect(fp.compositeKey).toContain('447123456789');
        expect(fp.compositeKey).toContain('guest@example.com');
        expect(fp.compositeKey).toContain('rest-aaa');
    });

    it('two different formatting variants of same data produce identical keys', () => {
        const fp1 = guestCompositeFingerprint({
            guest_email: 'GUEST@EXAMPLE.COM',
            phone: '07123456789',
            restaurant_id: 'rest-aaa',
        });
        const fp2 = guestCompositeFingerprint({
            guest_email: 'guest@example.com',
            phone: '+44 7123 456789',
            restaurant_id: 'rest-aaa',
        });
        expect(fp1.phoneKey).toBe(fp2.phoneKey);
        expect(fp1.emailKey).toBe(fp2.emailKey);
        expect(fp1.compositeKey).toBe(fp2.compositeKey);
    });

    it('returns null phone/email fields when inputs are missing', () => {
        const fp = guestCompositeFingerprint({ restaurant_id: 'rest-aaa' });
        expect(fp.phone).toBeNull();
        expect(fp.email).toBeNull();
        expect(fp.phoneKey).toBeNull();
        expect(fp.emailKey).toBeNull();
        expect(fp.compositeKey).toBeNull();
    });

    it('falls back to phone-only compositeKey when email is missing', () => {
        const fp = guestCompositeFingerprint({ phone: '07123456789', restaurant_id: 'rest-aaa' });
        expect(fp.compositeKey).toBe('phone:447123456789::rest-aaa');
    });

    it('falls back to email-only compositeKey when phone is missing', () => {
        const fp = guestCompositeFingerprint({ guest_email: 'user@test.com', restaurant_id: 'rest-aaa' });
        expect(fp.compositeKey).toBe('email:user@test.com::rest-aaa');
    });

    it('different restaurants produce different scoped keys', () => {
        const fp1 = guestCompositeFingerprint({ ...orderData, restaurant_id: 'rest-aaa' });
        const fp2 = guestCompositeFingerprint({ ...orderData, restaurant_id: 'rest-bbb' });
        expect(fp1.phoneKey).not.toBe(fp2.phoneKey);
        expect(fp1.emailKey).not.toBe(fp2.emailKey);
    });
});

// ─── Guest coupon blocking — integration-style (pure logic) ──────────────────
//
// These tests verify the guest per-customer limit strategy:
// check BOTH email and phone independently, take the MAX.

describe('guest coupon per-customer limit — dual-signal strategy', () => {
    /**
     * Simulates the server-side guest check from verifyAndCreateOrder.
     * Injects getCountByEmail and getCountByPhone for testability.
     */
    const guestCouponCheck = async ({ perCustomerLimit, countByEmail, countByPhone }) => {
        const limit = perCustomerLimit;
        let usage = 0;
        if (countByEmail !== undefined) usage = Math.max(usage, countByEmail);
        if (countByPhone !== undefined) usage = Math.max(usage, countByPhone);
        return usage >= limit ? { blocked: true } : { blocked: false };
    };

    it('blocks when email alone exceeds limit', async () => {
        const r = await guestCouponCheck({ perCustomerLimit: 1, countByEmail: 1, countByPhone: 0 });
        expect(r.blocked).toBe(true);
    });

    it('blocks when phone alone exceeds limit', async () => {
        const r = await guestCouponCheck({ perCustomerLimit: 1, countByEmail: 0, countByPhone: 1 });
        expect(r.blocked).toBe(true);
    });

    it('blocks when both signals are at the limit', async () => {
        const r = await guestCouponCheck({ perCustomerLimit: 2, countByEmail: 2, countByPhone: 2 });
        expect(r.blocked).toBe(true);
    });

    it('blocks when one signal is at limit and other is below', async () => {
        const r = await guestCouponCheck({ perCustomerLimit: 1, countByEmail: 1, countByPhone: 0 });
        expect(r.blocked).toBe(true);
    });

    it('allows first-time guest (both signals return 0)', async () => {
        const r = await guestCouponCheck({ perCustomerLimit: 1, countByEmail: 0, countByPhone: 0 });
        expect(r.blocked).toBe(false);
    });

    it('allows when limit=2 and both signals return 1', async () => {
        const r = await guestCouponCheck({ perCustomerLimit: 2, countByEmail: 1, countByPhone: 1 });
        expect(r.blocked).toBe(false);
    });

    it('allows when only email is available (phone is undefined/missing)', async () => {
        const r = await guestCouponCheck({ perCustomerLimit: 1, countByEmail: 0, countByPhone: undefined });
        expect(r.blocked).toBe(false);
    });

    it('allows when only phone is available (email is undefined/missing)', async () => {
        const r = await guestCouponCheck({ perCustomerLimit: 1, countByEmail: undefined, countByPhone: 0 });
        expect(r.blocked).toBe(false);
    });

    it('blocks when phone is available and at limit, even if email is missing', async () => {
        const r = await guestCouponCheck({ perCustomerLimit: 1, countByEmail: undefined, countByPhone: 1 });
        expect(r.blocked).toBe(true);
    });
});

// ─── Guest phone burst throttle — pure logic ─────────────────────────────────

describe('guest phone coupon abuse throttle — pure logic', () => {
    /**
     * Simulates the guest phone coupon abuse throttle from verifyAndCreateOrder.
     * recentCouponOrderCount: how many orders with a coupon exist in last hour for this phone.
     */
    const guestPhoneCouponThrottle = (recentCouponOrderCount, limit = 3) => {
        return recentCouponOrderCount >= limit ? { throttled: true } : { throttled: false };
    };

    it('allows 0 recent coupon orders', () => {
        expect(guestPhoneCouponThrottle(0).throttled).toBe(false);
    });

    it('allows 2 recent coupon orders (below threshold of 3)', () => {
        expect(guestPhoneCouponThrottle(2).throttled).toBe(false);
    });

    it('throttles at exactly 3 recent coupon orders', () => {
        expect(guestPhoneCouponThrottle(3).throttled).toBe(true);
    });

    it('throttles above threshold', () => {
        expect(guestPhoneCouponThrottle(10).throttled).toBe(true);
    });
});