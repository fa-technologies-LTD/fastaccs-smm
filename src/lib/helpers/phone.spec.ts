import { describe, expect, it } from 'vitest';
import { sanitizePhone, isValidPhone } from './phone';

describe('sanitizePhone', () => {
	it('keeps valid phone numbers (various formats)', () => {
		expect(sanitizePhone('+234 801 234 5678')).toBe('+234 801 234 5678');
		expect(sanitizePhone('08012345678')).toBe('08012345678');
		expect(sanitizePhone('(234) 801-234-5678')).toBe('(234) 801-234-5678');
	});

	it('drops garbage/bot values', () => {
		expect(sanitizePhone('bnYZzLiRajxhODK')).toBeNull();
		expect(sanitizePhone('ZujhioJrIDXpIVtxfdRKUdE')).toBeNull();
		expect(sanitizePhone('not a number')).toBeNull();
		expect(sanitizePhone('123abc456')).toBeNull();
	});

	it('drops empty / wrong-length / non-string', () => {
		expect(sanitizePhone('')).toBeNull();
		expect(sanitizePhone('   ')).toBeNull();
		expect(sanitizePhone('12345')).toBeNull(); // too short (<7 digits)
		expect(sanitizePhone('1234567890123456')).toBeNull(); // too long (>15 digits)
		expect(sanitizePhone(null)).toBeNull();
		expect(sanitizePhone(12345678)).toBeNull();
	});

	it('isValidPhone mirrors sanitizePhone', () => {
		expect(isValidPhone('+2348012345678')).toBe(true);
		expect(isValidPhone('bnYZzLiRajxhODK')).toBe(false);
	});
});
