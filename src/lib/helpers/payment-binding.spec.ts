import { describe, expect, it } from 'vitest';
import { isVerifiedPaymentBoundToOrder } from './payment-binding';

describe('verified payment order binding', () => {
	it('accepts matching Monnify metadata', () => {
		expect(
			isVerifiedPaymentBoundToOrder({
				orderId: 'order-a',
				metadataOrderId: 'order-a',
				storedPaymentReference: null,
				verifiedPaymentReference: null
			})
		).toBe(true);
	});

	it('accepts matching stored and verified payment references', () => {
		expect(
			isVerifiedPaymentBoundToOrder({
				orderId: 'order-a',
				metadataOrderId: null,
				storedPaymentReference: 'ORD_A',
				verifiedPaymentReference: 'ORD_A'
			})
		).toBe(true);
	});

	it('rejects a payment reference from another order even when metadata matches', () => {
		expect(
			isVerifiedPaymentBoundToOrder({
				orderId: 'order-a',
				metadataOrderId: 'order-a',
				storedPaymentReference: 'ORD_A',
				verifiedPaymentReference: 'ORD_B'
			})
		).toBe(false);
	});

	it('rejects an unbound verified payment', () => {
		expect(
			isVerifiedPaymentBoundToOrder({
				orderId: 'order-a',
				metadataOrderId: null,
				storedPaymentReference: null,
				verifiedPaymentReference: 'ORD_B'
			})
		).toBe(false);
	});
});
