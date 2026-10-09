import { describe, expect, it } from 'vitest';
import { canEscalateBoostRefill, getBoostComplaintEligibility } from './complaints';

describe('Boosting complaint eligibility', () => {
	const protectedPurchase = {
		offerSnapshot: { refillDays: 30 },
		completedAt: '2026-09-02T00:00:00Z',
		submittedAt: '2026-09-01T00:00:00Z',
		fulfillmentStatus: 'completed',
		paymentConfirmed: true,
		originalTargetUrl: 'https://www.instagram.com/example/',
		targetUrl: 'https://www.instagram.com/example/',
		now: new Date('2026-09-20T00:00:00Z')
	};

	it('rechecks the purchased window at escalation, not just when reported', () => {
		expect(canEscalateBoostRefill(protectedPurchase)).toBe(true);
		expect(
			canEscalateBoostRefill({ ...protectedPurchase, now: new Date('2026-10-01T00:00:01Z') })
		).toBe(false);
	});
	it('does not refill refunded orders, changed links or incomplete deliveries', () => {
		expect(canEscalateBoostRefill({ ...protectedPurchase, paymentConfirmed: false })).toBe(false);
		expect(
			canEscalateBoostRefill({
				...protectedPurchase,
				targetUrl: 'https://www.instagram.com/other/'
			})
		).toBe(false);
		expect(
			canEscalateBoostRefill({ ...protectedPurchase, fulfillmentStatus: 'manual_review' })
		).toBe(false);
	});
	it('does not extend the protection clock by waiting for completion', () => {
		const result = getBoostComplaintEligibility({
			...protectedPurchase,
			completedAt: '2026-09-25T00:00:00Z',
			now: new Date('2026-10-01T00:00:01Z')
		});
		expect(result.refillEndsAt).toBe('2026-10-01T00:00:00.000Z');
		expect(result.allowedTypes).not.toContain('dropped');
	});
	it.each([0, -1, 1.5, 366, 'not a number'])('rejects invalid refill-day limits: %s', (days) => {
		expect(
			getBoostComplaintEligibility({ ...protectedPurchase, offerSnapshot: { refillDays: days } })
				.allowedTypes
		).not.toContain('dropped');
	});
	it('does not expose a refill before delivery has completed', () => {
		expect(
			getBoostComplaintEligibility({ ...protectedPurchase, completedAt: null }).allowedTypes
		).not.toContain('dropped');
	});
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
