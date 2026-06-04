import { describe, expect, it } from 'vitest';
import {
	getBuyerVisibleAccounts,
	isOrderPaymentConfirmed,
	sanitizeBuyerOrderAccounts
} from './buyer-order-visibility';

const automaticCategory = { metadata: { delivery_mode: 'instant_auto' } };
const manualCategory = { metadata: { delivery_mode: 'manual_handover' } };

describe('buyer order visibility', () => {
	it('requires both a paid payment status and a confirmed order status', () => {
		expect(isOrderPaymentConfirmed({ status: 'pending_payment', paymentStatus: 'paid' })).toBe(
			false
		);
		expect(isOrderPaymentConfirmed({ status: 'completed', paymentStatus: 'pending' })).toBe(false);
		expect(isOrderPaymentConfirmed({ status: 'paid', paymentStatus: 'paid' })).toBe(true);
		expect(isOrderPaymentConfirmed({ status: 'completed', paymentStatus: 'paid' })).toBe(true);
		expect(isOrderPaymentConfirmed({ status: 'completed', paymentStatus: 'success' })).toBe(true);
	});

	it('never exposes accounts before payment confirmation', () => {
		const accounts = getBuyerVisibleAccounts(
			{ status: 'pending_payment', paymentStatus: 'pending' },
			{
				category: automaticCategory,
				accounts: [
					{ id: 'reserved', status: 'reserved' },
					{ id: 'allocated', status: 'allocated' }
				]
			}
		);

		expect(accounts).toEqual([]);
	});

	it('only exposes fulfilled automatic-delivery accounts after payment', () => {
		const accounts = getBuyerVisibleAccounts(
			{ status: 'completed', paymentStatus: 'paid' },
			{
				category: automaticCategory,
				accounts: [
					{ id: 'reserved', status: 'reserved' },
					{ id: 'allocated', status: 'assigned' },
					{ id: 'delivered', status: 'delivered' }
				]
			}
		);

		expect(accounts.map((account) => account.id)).toEqual(['allocated', 'delivered']);
	});

	it('never exposes stored accounts for manual-handover items', () => {
		const accounts = getBuyerVisibleAccounts(
			{ status: 'paid', paymentStatus: 'paid' },
			{
				category: manualCategory,
				accounts: [{ id: 'allocated', status: 'allocated' }]
			}
		);

		expect(accounts).toEqual([]);
	});

	it('sanitizes every order item without changing other order fields', () => {
		const order = sanitizeBuyerOrderAccounts({
			id: 'order-1',
			status: 'pending_payment',
			paymentStatus: 'pending',
			orderItems: [
				{
					category: automaticCategory,
					accounts: [{ id: 'account-1', status: 'reserved' }]
				}
			]
		});

		expect(order.id).toBe('order-1');
		expect(order.orderItems[0].accounts).toEqual([]);
	});
});
