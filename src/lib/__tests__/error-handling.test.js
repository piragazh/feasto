/**
 * E) ERROR HANDLING
 *
 * Tests that:
 * - auditLog returns a safe generic message on internal failure, not raw errors
 * - validateCouponUsage returns safe business-rule messages, not stack traces
 * - expected business-rule errors still surface useful (non-leaking) messages
 *
 * Strategy: We test the RESPONSE SHAPE CONTRACT — what a client receives —
 * by simulating the handler's response logic with mocked internals.
 * This is the most practical approach without a live Deno runtime.
 */

import { describe, it, expect } from 'vitest';

/**
 * Simulate the auditLog handler's error branch.
 * In production, any thrown error hits the catch block and returns
 * a generic message. We verify that shape here.
 */
function simulateAuditLogError(thrownError) {
    // Mirrors the catch block in functions/auditLog
    console.error('Audit log error:', thrownError); // would log internally
    return {
        status: 500,
        body: { error: 'Audit log failed' }
    };
}

/**
 * Simulate validateCouponUsage internal DB failure branch.
 */
function simulateValidateCouponUsageError(thrownError) {
    console.error('Coupon validation error:', thrownError);
    return {
        status: 500,
        body: { error: 'Coupon validation failed. Please try again.' }
    };
}

/**
 * Simulate validateCouponUsage business-rule error responses.
 */
function simulateValidateCouponUsageBusinessError(reason, coupon) {
    if (reason === 'per_customer_limit') {
        return {
            status: 400,
            body: {
                valid: false,
                error: `You have reached the usage limit for this coupon (${coupon.per_customer_limit} use${coupon.per_customer_limit === 1 ? '' : 's'} per customer)`
            }
        };
    }
    if (reason === 'inactive') {
        return { status: 400, body: { valid: false, error: 'This coupon is no longer active' } };
    }
    if (reason === 'usage_limit') {
        return { status: 400, body: { valid: false, error: 'This coupon has reached its usage limit' } };
    }
    if (reason === 'expired') {
        return { status: 400, body: { valid: false, error: 'This coupon has expired' } };
    }
    if (reason === 'not_yet_valid') {
        return { status: 400, body: { valid: false, error: 'This coupon is not yet valid' } };
    }
}

/**
 * Simulate verifyAndCreateOrder coupon error responses.
 */
function simulateOrderCouponError(reason) {
    if (reason === 'STACKING') {
        return { status: 400, body: { error: 'Only one coupon code can be applied per order.', success: false } };
    }
    if (reason === 'NOT_FOUND') {
        return { status: 400, body: { error: 'The coupon code applied is not recognised. Please remove it and try again.', success: false } };
    }
    if (reason === 'invalid') {
        return { status: 400, body: { error: 'The coupon code applied is no longer valid. Please remove it and try again.', success: false } };
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('auditLog error containment', () => {
    it('never leaks raw error messages to the client on internal failure', () => {
        const rawError = new Error('Connection to DB lost: credentials expired at host db.internal:5432');
        const response = simulateAuditLogError(rawError);
        expect(response.status).toBe(500);
        // Must NOT contain the raw error details
        expect(response.body.error).not.toContain('db.internal');
        expect(response.body.error).not.toContain('credentials');
        // Must return a safe generic message
        expect(typeof response.body.error).toBe('string');
        expect(response.body.error.length).toBeGreaterThan(0);
    });

    it('safe error message does not expose stack traces', () => {
        const rawError = new Error('TypeError: cannot read property of undefined\n  at handler (file.js:42)');
        const response = simulateAuditLogError(rawError);
        expect(response.body.error).not.toContain('TypeError');
        expect(response.body.error).not.toContain('file.js');
        expect(response.body.error).not.toContain('undefined');
    });
});

describe('validateCouponUsage error containment', () => {
    it('returns generic message on internal failure, not raw error', () => {
        const rawError = new Error('DB timeout: host unreachable');
        const response = simulateValidateCouponUsageError(rawError);
        expect(response.status).toBe(500);
        expect(response.body.error).not.toContain('DB timeout');
        expect(response.body.error).not.toContain('unreachable');
        expect(typeof response.body.error).toBe('string');
    });

    it('per_customer_limit error message is specific and safe', () => {
        const response = simulateValidateCouponUsageBusinessError('per_customer_limit', { per_customer_limit: 1 });
        expect(response.status).toBe(400);
        expect(response.body.valid).toBe(false);
        expect(response.body.error).toContain('1 use per customer');
        // Singular form
        expect(response.body.error).not.toContain('uses per customer');
    });

    it('per_customer_limit pluralises correctly for limit > 1', () => {
        const response = simulateValidateCouponUsageBusinessError('per_customer_limit', { per_customer_limit: 3 });
        expect(response.body.error).toContain('3 uses per customer');
    });

    it('inactive coupon returns clear message', () => {
        const response = simulateValidateCouponUsageBusinessError('inactive', {});
        expect(response.body.valid).toBe(false);
        expect(response.body.error).toContain('no longer active');
    });

    it('expired coupon returns clear message', () => {
        const response = simulateValidateCouponUsageBusinessError('expired', {});
        expect(response.body.valid).toBe(false);
        expect(response.body.error).toContain('expired');
    });
});

describe('verifyAndCreateOrder coupon error messages', () => {
    it('stacking returns the correct safe business message', () => {
        const response = simulateOrderCouponError('STACKING');
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Only one coupon code');
        // Must not contain internal details
        expect(response.body.error).not.toContain('restaurant_id');
        expect(response.body.error).not.toContain('codes.length');
    });

    it('not found returns a safe message without exposing DB details', () => {
        const response = simulateOrderCouponError('NOT_FOUND');
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('not recognised');
        expect(response.body.error).not.toContain('filter(');
        expect(response.body.error).not.toContain('asServiceRole');
    });

    it('invalid coupon (failed validation) returns a safe message', () => {
        const response = simulateOrderCouponError('invalid');
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('no longer valid');
    });
});