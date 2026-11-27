import { describe, it, expect } from 'vitest';
import { isValidCustomerPhone, phoneForOrder, toE164, nationalNumber, phoneFieldText } from '../phone.js';

// The rule that was live in Checkout.jsx before region support.
const OLD_UK = (p) => /^(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}$/.test(p.replace(/\s/g, ''));

const SAMPLES = [
    '07123456789', '07123 456789', '07123 456 789', '+447123456789', '+44 7123 456789',
    '+44 (0)7123 456789', '447123456789', '00447123456789', '(07123) 456789', '07123-456789',
    '0712345678', '071234567890', '01375 123456', '020 7946 0958', '7123456789', '+94712345678',
    '0712345678', '+94 71 234 5678', '', ' ', 'abc', '07123 45678a', '+4407123456789', ' 07123456789 ',
];

describe('phone — UK shops behave exactly as before', () => {
    const uk = { country: null, timezone: 'UTC' };

    it('validation matches the old checkout rule on every sample', () => {
        for (const s of SAMPLES) {
            expect(isValidCustomerPhone(s, uk), JSON.stringify(s)).toBe(OLD_UK(s));
            expect(isValidCustomerPhone(s, 'GB'), JSON.stringify(s)).toBe(OLD_UK(s));
        }
    });

    it('the saved number is exactly what was typed', () => {
        for (const s of SAMPLES) expect(phoneForOrder(s, uk)).toBe(s);
    });

    it('field text is unchanged', () => {
        expect(phoneFieldText(uk)).toEqual({
            label: 'UK Mobile Number',
            placeholder: '07123 456789',
            error: 'Please enter a valid UK phone number',
        });
    });

    it('E.164 for UK mobiles', () => {
        expect(toE164('07123 456789', uk)).toBe('+447123456789');
        expect(toE164('+44 7123 456789', uk)).toBe('+447123456789');
        expect(toE164('0044 7123 456789', uk)).toBe('+447123456789');
        expect(toE164('01375 123456', uk)).toBeNull();
    });
});

describe('phone — Sri Lankan shops', () => {
    const lk = { country: 'LK' };
    const SAME_CUSTOMER = ['0712345678', '071 234 5678', '071-234-5678', '+94712345678',
        '+94 71 234 5678', '0094712345678', '94712345678', '(071) 234 5678'];

    it('accepts every common way of writing one mobile number', () => {
        for (const s of SAME_CUSTOMER) expect(isValidCustomerPhone(s, lk), s).toBe(true);
    });

    it('stores them all as one value, so the customer is recognised', () => {
        for (const s of SAME_CUSTOMER) expect(phoneForOrder(s, lk), s).toBe('0712345678');
    });

    it('sends texts to +94', () => {
        for (const s of SAME_CUSTOMER) expect(toE164(s, lk), s).toBe('+94712345678');
    });

    it('rejects UK numbers, landlines and wrong lengths', () => {
        for (const s of ['07123456789', '+447123456789', '011 234 5678', '071234567', '07123456789 0', '', 'abc', '+94 11 234 5678'])
            expect(isValidCustomerPhone(s, lk), s).toBe(false);
    });

    it('an invalid entry is kept (trimmed) so the customer can correct it', () => {
        expect(phoneForOrder('  0712 ', lk)).toBe('0712');
        expect(toE164('0712', lk)).toBeNull();
    });

    it('national number helper', () => {
        expect(nationalNumber('+94 71 234 5678', lk)).toBe('712345678');
        expect(nationalNumber('+44 7123 456789', lk)).toBe('');
    });

    it('field text gives a local example', () => {
        const t = phoneFieldText(lk);
        expect(t.label).toBe('Mobile Number');
        expect(t.placeholder).toBe('071 234 5678');
        expect(t.error).toContain('071 234 5678');
    });
});
