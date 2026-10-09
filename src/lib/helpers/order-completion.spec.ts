import { describe, expect, it } from 'vitest';
import { canCompleteOrder } from './order-completion';

describe('manual completion eligibility', () => {
	it.each([
		'failed',
		'cancelled',
		'refunded',
		'pending',
		'pending_payment',
		'payment_review',
		'completed'
	])('does not complete %s orders', (status) => {
		expect(canCompleteOrder({ status, paymentStatus: 'paid' })).toBe(false);
	});
	it('requires confirmed payment and preserves a refund marker', () => {
		expect(canCompleteOrder({ status: 'processing', paymentStatus: 'pending' })).toBe(false);
		expect(
			canCompleteOrder({ status: 'paid', paymentStatus: 'paid', deliveryStatus: 'refunded' })
		).toBe(false);
		expect(canCompleteOrder({ status: 'paid', paymentStatus: 'paid' })).toBe(true);
		expect(canCompleteOrder({ status: 'processing', paymentStatus: 'overpaid' })).toBe(true);
	});
});
