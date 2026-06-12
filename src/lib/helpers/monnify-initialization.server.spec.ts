import { describe, expect, it } from 'vitest';
import {
	getMonnifyInitializationErrorMessage,
	getMonnifyInitializationIssue
} from './monnify-initialization.server';

describe('Monnify initialization input validation', () => {
	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid amount %s', (amount) => {
		expect(getMonnifyInitializationIssue({ amount, currency: 'NGN' })).toBe('invalid_amount');
	});

	it('rejects unsupported currencies', () => {
		expect(getMonnifyInitializationIssue({ amount: 2500, currency: 'USD' })).toBe(
			'unsupported_currency'
		);
	});

	it('accepts a positive NGN amount', () => {
		expect(getMonnifyInitializationIssue({ amount: 2500, currency: 'ngn' })).toBeNull();
	});

	it('provides brief recoverable buyer messages', () => {
		expect(getMonnifyInitializationErrorMessage('invalid_amount')).toContain('refresh your cart');
		expect(getMonnifyInitializationErrorMessage('unsupported_currency')).toContain(
			'refresh your cart'
		);
	});
});
