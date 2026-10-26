import { describe, expect, it } from 'vitest';
import { getOrderStage, isWithinAccountReportWindow } from './order-stage';

const now = new Date('2026-10-26T12:00:00Z');
const paid = { status: 'completed', paymentStatus: 'paid', totalAmount: 1900, refundedAmount: 0 };
const boost = (fulfillment: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
	boostTargetUrl: 'https://instagram.com/p/x',
	boostQuantity: 1000,
	...fulfillment,
	...extra
});

describe('order stages', () => {
	it('reads a delivered account plainly', () => {
		expect(
			getOrderStage({ ...paid, orderType: 'account', deliveryStatus: 'pending' }, now)
		).toMatchObject({
			key: 'delivered',
			chip: 'Delivered',
			detail: 'Your login details are ready.'
		});
	});

	it('shows WhatsApp handover as preparing until it is sent', () => {
		expect(
			getOrderStage(
				{
					status: 'paid',
					paymentStatus: 'paid',
					deliveryMethod: 'whatsapp',
					deliveryStatus: 'processing'
				},
				now
			)
		).toMatchObject({ key: 'preparing', detail: 'We’ll send the login details on WhatsApp.' });
	});

	it('says where refund money went, per product', () => {
		expect(
			getOrderStage(
				{
					status: 'refunded',
					paymentStatus: 'refunded',
					orderType: 'phone',
					totalAmount: 1300,
					refundedAmount: 1300
				},
				now
			)
		).toMatchObject({
			key: 'refunded',
			detail: 'No code came. ₦1,300 is back in your store credit.'
		});
		expect(
			getOrderStage({ ...paid, orderType: 'account', refundedAmount: 500 }, now)
		).toMatchObject({
			key: 'delivered',
			detail: 'Your login details are ready. ₦500 of it is back in your store credit.'
		});
	});

	it('never calls an unpaid order cancelled while it is still payable, and expires it after the deadline', () => {
		const open = {
			status: 'pending_payment',
			paymentStatus: 'pending',
			paymentExpiresAt: '2026-10-26T12:30:00Z'
		};
		expect(getOrderStage(open, now).key).toBe('awaiting_payment');
		expect(getOrderStage({ ...open, paymentExpiresAt: '2026-10-26T11:00:00Z' }, now)).toMatchObject(
			{
				key: 'payment_expired',
				detail: 'Nothing was charged. Order again anytime.'
			}
		);
		expect(getOrderStage({ status: 'cancelled', paymentStatus: 'failed' }, now).key).toBe(
			'cancelled'
		);
	});

	it('shows engagement progress from the supplier report, and review as checking (not cancelled)', () => {
		const order = {
			status: 'paid',
			paymentStatus: 'paid',
			orderType: 'boosting',
			orderItems: [
				boost({
					boostFulfillmentStatus: 'in_progress',
					boostFulfillment: { remains: 600, quantity: 1000 }
				})
			]
		};
		expect(getOrderStage(order, now)).toMatchObject({
			key: 'in_progress',
			detail: 'Delivering · 40%',
			progress: 40
		});
		const review = {
			...order,
			orderItems: [
				boost({
					boostFulfillmentStatus: 'in_progress',
					boostFulfillment: { status: 'manual_review' }
				})
			]
		};
		expect(getOrderStage(review, now)).toMatchObject({ key: 'checking', chip: 'Checking' });
	});

	it('asks the buyer only when we need them, and queues before delivery starts', () => {
		const base = { status: 'paid', paymentStatus: 'paid', orderType: 'boosting' };
		expect(
			getOrderStage({ ...base, orderItems: [boost({ boostFulfillmentStatus: 'needs_link' })] }, now)
		).toMatchObject({
			key: 'needs_you',
			tone: 'you'
		});
		expect(
			getOrderStage({ ...base, orderItems: [boost({ boostFulfillmentStatus: 'pending' })] }, now)
		).toMatchObject({
			key: 'preparing',
			detail: 'Queued to start. No need to order again.'
		});
	});

	it('marks a delivery checked on the profile once that check exists', () => {
		const done = {
			...paid,
			orderType: 'boosting',
			deliveryStatus: 'delivered',
			orderItems: [
				boost({ boostFulfillmentStatus: 'completed', boostVerifiedAt: '2026-10-26T11:00:00Z' })
			]
		};
		expect(getOrderStage(done, now)).toMatchObject({
			key: 'delivered',
			deliveryCheck: 'verified',
			detail: 'Delivered and checked on your profile.'
		});
	});

	it('keeps the account report window to three hours after delivery', () => {
		expect(isWithinAccountReportWindow({ deliveredAt: '2026-10-26T09:30:00Z' }, now)).toBe(true);
		expect(isWithinAccountReportWindow({ deliveredAt: '2026-10-26T08:59:00Z' }, now)).toBe(false);
	});
});
