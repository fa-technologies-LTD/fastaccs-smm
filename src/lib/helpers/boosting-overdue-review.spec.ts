import { expect, it } from 'vitest';
import { isBoostOrderOverdue } from './boosting-overdue-review';
const now = new Date('2026-10-14T12:00:00Z');
const item = {
	boostFulfillmentStatus: 'in_progress',
	order: {
		paymentStatus: 'paid',
		status: 'paid',
		deliveryStatus: 'processing',
		paidAt: '2026-10-13T12:00:00Z'
	}
};
it('flags at 24 hours without calling it a failed order', () => {
	expect(isBoostOrderOverdue(item, now)).toBe(true);
	expect(item.boostFulfillmentStatus).toBe('in_progress');
	expect(isBoostOrderOverdue(item, new Date(now.getTime() - 1))).toBe(false);
});
it('keeps partial delivery and unknown states visible for review', () => {
	expect(isBoostOrderOverdue({ ...item, boostFulfillmentStatus: 'partial' }, now)).toBe(true);
	expect(isBoostOrderOverdue({ ...item, boostFulfillmentStatus: 'unknown' }, now)).toBe(true);
});
it.each(['completed', 'cancelled', 'rejected'])('excludes terminal item %s', (status) => {
	expect(isBoostOrderOverdue({ ...item, boostFulfillmentStatus: status }, now)).toBe(false);
});
it.each(['pending', 'refunded', 'failed'])('excludes unconfirmed payment %s', (paymentStatus) => {
	expect(isBoostOrderOverdue({ ...item, order: { ...item.order, paymentStatus } }, now)).toBe(
		false
	);
});
it('uses legacy order creation only when payment time is missing and rejects invalid/future times', () => {
	expect(
		isBoostOrderOverdue(
			{ ...item, order: { ...item.order, paidAt: null, createdAt: item.order.paidAt } },
			now
		)
	).toBe(true);
	for (const paidAt of ['invalid', '2026-10-15T12:00:00Z'])
		expect(isBoostOrderOverdue({ ...item, order: { ...item.order, paidAt } }, now)).toBe(false);
});
