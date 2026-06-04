import { describe, expect, it } from 'vitest';
import {
	getPaymentReservationExpiresAt,
	getPendingPaymentExpiresAt
} from './payment-expiry.server';

describe('payment expiry windows', () => {
	it('keeps inventory reserved beyond the buyer payment window', () => {
		const createdAt = new Date('2026-06-04T12:00:00.000Z');
		const paymentExpiresAt = getPendingPaymentExpiresAt(createdAt);
		const reservationExpiresAt = getPaymentReservationExpiresAt(paymentExpiresAt);

		expect(paymentExpiresAt.getTime()).toBeGreaterThan(createdAt.getTime());
		expect(reservationExpiresAt.getTime()).toBeGreaterThan(paymentExpiresAt.getTime());
		expect(reservationExpiresAt.getTime() - paymentExpiresAt.getTime()).toBe(5 * 60 * 1000);
	});
});
