import { describe, it, expect } from 'vitest';
import { isRevenueOrder, REFUNDED_MARKER } from './order-revenue';

/**
 * These cases are taken from real production rows. Each "refunded" shape below is one a live
 * refund path actually produced, and each used to be counted as revenue.
 */
describe('isRevenueOrder', () => {
	it('counts a straightforward paid order', () => {
		expect(
			isRevenueOrder({ status: 'paid', paymentStatus: 'paid', deliveryStatus: 'processing' })
		).toBe(true);
	});

	it('counts a delivered order', () => {
		expect(
			isRevenueOrder({ status: 'completed', paymentStatus: 'paid', deliveryStatus: 'delivered' })
		).toBe(true);
	});

	it('excludes a fully refunded order (all three columns marked)', () => {
		expect(
			isRevenueOrder({ status: 'refunded', paymentStatus: 'refunded', deliveryStatus: 'refunded' })
		).toBe(false);
	});

	it('excludes a per-account refund left sitting at status=completed', () => {
		// The real shape of ORD-1785236497736-747DEE2A: refunded in full to store credit, then a
		// later PATCH put status back to 'completed'. It kept reporting as a ₦9,500 paid sale.
		expect(
			isRevenueOrder({ status: 'completed', paymentStatus: 'refunded', deliveryStatus: 'pending' })
		).toBe(false);
	});

	it('excludes a legacy Numbers refund that only marked deliveryStatus', () => {
		// ORD-1785498567561-CB983EA5: rental refunded to store credit, payment columns never flipped.
		expect(
			isRevenueOrder({ status: 'paid', paymentStatus: 'paid', deliveryStatus: 'refunded' })
		).toBe(false);
	});

	it('still counts a PARTIAL (per-account) refund — the order keeps its remaining value', () => {
		// ORD-1786008956917-7F0E9D15: one faulty account refunded, order itself still paid.
		expect(
			isRevenueOrder({ status: 'completed', paymentStatus: 'paid', deliveryStatus: 'delivered' })
		).toBe(true);
	});

	it('excludes cancelled and pending orders', () => {
		expect(
			isRevenueOrder({ status: 'cancelled', paymentStatus: 'cancelled', deliveryStatus: 'pending' })
		).toBe(false);
		expect(
			isRevenueOrder({ status: 'pending', paymentStatus: 'pending', deliveryStatus: 'pending' })
		).toBe(false);
	});

	it('is case- and whitespace-insensitive on the refund marker', () => {
		expect(isRevenueOrder({ status: 'COMPLETED', paymentStatus: ' Refunded ' })).toBe(false);
	});

	it('tolerates missing fields (older callers pass only two)', () => {
		expect(isRevenueOrder({ status: 'completed' })).toBe(true);
		expect(isRevenueOrder({ paymentStatus: 'paid' })).toBe(true);
		expect(isRevenueOrder({})).toBe(false);
	});

	it('exports the marker the SQL builder mirrors', () => {
		expect(REFUNDED_MARKER).toBe('refunded');
	});
});
