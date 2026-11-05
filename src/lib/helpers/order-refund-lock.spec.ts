import { describe, it, expect } from 'vitest';
import { isRefundReversal, paidOrderEditBlock } from './order-refund-lock';

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

describe('paidOrderEditBlock', () => {
	it('stops a paid order being cancelled without its refund', () => {
		// ORD-…CEF734C4 / CE0373F6: paid ₦7,500, cancelled by an edit on 25 Oct, nothing returned.
		expect(paidOrderEditBlock(PAID_ORDER, { status: 'cancelled' })).toBe('refund_required');
		expect(paidOrderEditBlock(PAID_ORDER, { status: 'failed' })).toBe('refund_required');
		// ORD-…9B43C685: the held ₦10,500 payment was cancelled the same way.
		expect(paidOrderEditBlock({ paymentStatus: 'under_review' }, { status: 'cancelled' })).toBe(
			'refund_required'
		);
	});

	it('never lets an edit mark an order paid, or change a paid order’s payment details', () => {
		expect(paidOrderEditBlock({ paymentStatus: 'pending' }, { paymentStatus: 'paid' })).toBe(
			'payment_locked'
		);
		expect(paidOrderEditBlock(PAID_ORDER, { paymentStatus: 'failed' })).toBe('payment_locked');
		expect(paidOrderEditBlock(PAID_ORDER, { paymentReference: 'another-payment' })).toBe(
			'payment_locked'
		);
		expect(paidOrderEditBlock(PAID_ORDER, { paidAt: null })).toBe('payment_locked');
	});

	it('leaves unpaid orders and ordinary work on paid orders alone', () => {
		expect(paidOrderEditBlock({ paymentStatus: 'pending' }, { status: 'cancelled' })).toBeNull();
		expect(paidOrderEditBlock({ paymentStatus: 'failed' }, { status: 'cancelled' })).toBeNull();
		expect(paidOrderEditBlock(PAID_ORDER, { status: 'processing' })).toBeNull();
		expect(paidOrderEditBlock(PAID_ORDER, { status: 'completed' })).toBeNull();
		expect(paidOrderEditBlock(PAID_ORDER, { deliveryContact: '@buyer' })).toBeNull();
	});
});
