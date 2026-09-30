import { describe, expect, it } from 'vitest';
import { getBoostComplaintEligibility } from './complaints';

describe('Boosting complaint eligibility', () => {
	it('always permits missing and stopped delivery after payment', () => {
		expect(
			getBoostComplaintEligibility({
				offerSnapshot: { refillDays: null },
				completedAt: null,
				paymentConfirmed: true
			}).allowedTypes
		).toEqual(['nothing_delivered', 'delivery_stopped']);
	});

	it('permits a drop report only inside the purchased refill window', () => {
		const completedAt = new Date('2026-09-01T00:00:00Z');
		expect(
			getBoostComplaintEligibility({
				offerSnapshot: { refillDays: 30 },
				completedAt,
				paymentConfirmed: true,
				now: new Date('2026-09-20T00:00:00Z')
			}).allowedTypes
		).toContain('dropped');
		expect(
			getBoostComplaintEligibility({
				offerSnapshot: { refillDays: 30 },
				completedAt,
				paymentConfirmed: true,
				now: new Date('2026-10-02T00:00:00Z')
			}).allowedTypes
		).not.toContain('dropped');
	});
});
