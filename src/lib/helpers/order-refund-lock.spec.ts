import { describe, it, expect } from 'vitest';
import { isRefundReversal } from './order-refund-lock';

const REFUNDED_ORDER = {
	status: 'refunded',
	paymentStatus: 'refunded',
	deliveryStatus: 'refunded'
};
// The exact shape a per-account refund leaves behind before anything touches it.
const PER_ACCOUNT_REFUNDED = {
	status: 'refunded',
	paymentStatus: 'refunded',
	deliveryStatus: 'pending'
};
const PAID_ORDER = { status: 'completed', paymentStatus: 'paid', deliveryStatus: 'delivered' };

describe('isRefundReversal', () => {
	it('blocks the PATCH that actually happened in production', () => {
		// ORD-1785236497736-747DEE2A: refunded, then status put back to 'completed' 5s later.
		expect(isRefundReversal(PER_ACCOUNT_REFUNDED, { status: 'completed' })).toBe(true);
	});

	it('blocks re-opening the refund guards by marking payment paid again', () => {
		// This is the money hole: both refund endpoints bail on paymentStatus === 'refunded',
		// so flipping it back to 'paid' would permit a SECOND refund of the same order.
		expect(isRefundReversal(REFUNDED_ORDER, { paymentStatus: 'paid' })).toBe(true);
	});

	it('blocks a delivery-status edit on a refunded order', () => {
		expect(isRefundReversal(REFUNDED_ORDER, { deliveryStatus: 'delivered' })).toBe(true);
	});

	it('blocks when only ONE column carries the refund marker', () => {
		expect(
			isRefundReversal(
				{ status: 'paid', paymentStatus: 'paid', deliveryStatus: 'refunded' },
				{ status: 'completed' }
			)
		).toBe(true);
		expect(
			isRefundReversal({ status: 'completed', paymentStatus: 'refunded' }, { status: 'paid' })
		).toBe(true);
	});

	it('still allows non-state bookkeeping on a refunded order', () => {
		expect(isRefundReversal(REFUNDED_ORDER, { deliveryContact: 'a@b.com' })).toBe(false);
		expect(isRefundReversal(REFUNDED_ORDER, { paymentReference: 'REF-123' })).toBe(false);
	});

	it('leaves normal orders fully editable', () => {
		expect(isRefundReversal(PAID_ORDER, { status: 'completed' })).toBe(false);
		expect(isRefundReversal(PAID_ORDER, { paymentStatus: 'paid' })).toBe(false);
		expect(isRefundReversal({ status: 'pending' }, { status: 'paid' })).toBe(false);
	});

	it('is case-insensitive about the stored marker', () => {
		expect(isRefundReversal({ status: 'REFUNDED' }, { status: 'completed' })).toBe(true);
	});

	it('treats an empty patch as harmless', () => {
		expect(isRefundReversal(REFUNDED_ORDER, {})).toBe(false);
	});
});
