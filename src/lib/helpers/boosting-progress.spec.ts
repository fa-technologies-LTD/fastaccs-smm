import { describe, expect, it } from 'vitest';
import { getBoostingProgress, getBoostOrderSummaryStatus } from './boosting-progress';

const paid = { status: 'paid', paymentStatus: 'paid' };
const item = {
	boostTargetUrl: 'https://www.instagram.com/test/',
	boostQuantity: 10,
	boostFulfillmentStatus: 'in_progress'
};
describe('buyer Boosting progress', () => {
	it('keeps a cancelled held delivery in review even when the parent was marked completed', () => {
		const order = {
			...paid,
			status: 'completed',
			deliveryStatus: 'delivered',
			orderItems: [
				{
					...item,
					boostFulfillmentStatus: 'completed',
					boostFulfillment: { status: 'manual_review', lastSafeErrorCategory: 'provider_cancelled' }
				}
			]
		};
		expect(getBoostOrderSummaryStatus(order)).toBe('under_review');
		expect(getBoostOrderSummaryStatus({ ...order, paymentStatus: 'refunded' })).toBe('refunded');
	});
	it('requires completed items, respects link requests and leaves non-Boosting orders alone', () => {
		const order = { ...paid, orderItems: [{ ...item, boostFulfillmentStatus: 'completed' }] };
		expect(getBoostOrderSummaryStatus(order)).toBe('completed');
		expect(
			getBoostOrderSummaryStatus({ ...order, orderItems: [...order.orderItems, { quantity: 1 }] })
		).toBe('processing');
		expect(
			getBoostOrderSummaryStatus({
				...paid,
				orderItems: [{ ...item, boostFulfillmentStatus: 'needs_link' }]
			})
		).toBe('needs_link');
		expect(getBoostOrderSummaryStatus({ ...paid, orderItems: [{ quantity: 1 }] })).toBeNull();
		expect(getBoostOrderSummaryStatus({ ...order, paymentStatus: 'pending' })).toBe('pending');
	});
	it('explains overdue delivery without changing supplier status or losing partial evidence', () => {
		const result = getBoostingProgress(
			{ ...item, boostFulfillment: { remains: 3 } },
			{ ...paid, paidAt: '2026-10-13T12:00:00Z' },
			new Date('2026-10-14T12:00:00Z')
		);
		expect(result).toMatchObject({
			status: 'in_progress',
			label: 'In progress',
			reportedDelivered: 7,
			message: expect.stringContaining('Contact support')
		});
	});
	it('keeps private supplier data out and bounds reported progress', () => {
		const result = getBoostingProgress(
			{
				...item,
				boostFulfillment: { remains: 3, supplierOrderId: 'private', quotedSupplierCostUsd: 1 }
			},
			paid
		);
		expect(result).toMatchObject({ label: 'In progress', reportedDelivered: 7, quantity: 10 });
		expect(result).not.toHaveProperty('supplierOrderId');
		expect(result).not.toHaveProperty('quotedSupplierCostUsd');
		expect(
			getBoostingProgress({ ...item, boostFulfillment: { remains: 50 } }, paid)?.reportedDelivered
		).toBe(0);
	});
	it('does not fabricate a count when remains is missing', () => {
		expect(getBoostingProgress(item, paid)?.reportedDelivered).toBeNull();
	});
	it('does not claim progress on an unpaid or payment-review order', () => {
		expect(
			getBoostingProgress(item, { status: 'paid', paymentStatus: 'review_required' })?.label
		).toBe('Not started');
	});
	it.each(['provider_cancelled', 'provider_refunded', 'submission_unknown', 'no_safe_route'])(
		'shows review, not endless processing for %s',
		(lastSafeErrorCategory) => {
			expect(
				getBoostingProgress(
					{ ...item, boostFulfillment: { status: 'manual_review', lastSafeErrorCategory } },
					paid
				)?.label
			).toBe('Under review');
		}
	);
	it('distinguishes partial delivery and a customer refund', () => {
		expect(
			getBoostingProgress(
				{
					...item,
					boostFulfillment: {
						status: 'manual_review',
						lastSafeErrorCategory: 'provider_partial',
						remains: 4
					}
				},
				paid
			)
		).toMatchObject({ label: 'Partially delivered', reportedDelivered: 6 });
		expect(
			getBoostingProgress(item, { status: 'completed', paymentStatus: 'refunded' })?.label
		).toBe('Refunded');
	});
	it('explains a failed poll without marking an order failed', () => {
		expect(
			getBoostingProgress(
				{ ...item, boostFulfillment: { lastSafeErrorCategory: 'status_check_failed' } },
				paid
			)
		).toMatchObject({ label: 'In progress', message: expect.stringContaining('delayed') });
	});
});
