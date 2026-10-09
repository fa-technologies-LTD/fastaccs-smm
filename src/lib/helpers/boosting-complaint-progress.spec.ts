import { describe, expect, it } from 'vitest';
import { getBoostComplaintStatusLabel } from './boosting-complaint-progress';

describe('public Boosting report progress', () => {
	it('does not claim refilling or completion without a successful provider observation', () => {
		expect(getBoostComplaintStatusLabel({ status: 'escalated', refillState: 'in_progress' })).toBe(
			'Follow-up requested'
		);
		expect(
			getBoostComplaintStatusLabel({
				status: 'resolved',
				refillState: 'completed',
				refillCheckedAt: 'invalid'
			})
		).toBe('Resolved');
		expect(
			getBoostComplaintStatusLabel({
				status: 'escalation_unknown',
				refillState: 'completed',
				refillCheckedAt: new Date()
			})
		).toBe('Under review');
	});
	it('gives short labels for observed progress without exposing provider details', () => {
		const refillCheckedAt = '2026-10-08T21:00:00.000Z';
		expect(getBoostComplaintStatusLabel({ status: 'escalated', refillState: 'pending' })).toBe(
			'Refill requested'
		);
		expect(
			getBoostComplaintStatusLabel({
				status: 'escalated',
				refillState: 'in_progress',
				refillCheckedAt
			})
		).toBe('Refill in progress');
		expect(
			getBoostComplaintStatusLabel({
				status: 'resolved',
				refillState: 'completed',
				refillCheckedAt
			})
		).toBe('Refill complete');
		expect(
			getBoostComplaintStatusLabel({
				status: 'escalated',
				refillState: 'rejected',
				refillCheckedAt
			})
		).toBe('Under review');
	});
});
