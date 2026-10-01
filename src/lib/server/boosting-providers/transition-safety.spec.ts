import { describe, expect, it } from 'vitest';
import { supplierSubmissionMayExist, type BoostTransitionState } from './transition-safety';

function state(overrides: Partial<BoostTransitionState> = {}): BoostTransitionState {
	return {
		status: 'manual_review',
		supplierOrderId: null,
		submittedAt: null,
		leaseToken: null,
		leaseExpiresAt: null,
		attempts: [],
		...overrides
	};
}

describe('Boosting transition safety', () => {
	it('allows a never-submitted manual-review item and a definitive rejection to be retried', () => {
		expect(supplierSubmissionMayExist(state())).toBe(false);
		expect(
			supplierSubmissionMayExist(
				state({ attempts: [{ type: 'submission', outcome: 'provider_rejected' }] })
			)
		).toBe(false);
	});

	it('blocks accepted, uncertain, submitted, and actively leased work from being duplicated', () => {
		expect(supplierSubmissionMayExist(state({ supplierOrderId: 'supplier-1' }))).toBe(true);
		expect(supplierSubmissionMayExist(state({ status: 'in_progress' }))).toBe(true);
		expect(
			supplierSubmissionMayExist(
				state({ attempts: [{ type: 'submission', outcome: 'submission_unknown' }] })
			)
		).toBe(true);
		expect(
			supplierSubmissionMayExist(
				state({
					leaseToken: 'worker-1',
					leaseExpiresAt: new Date('2030-01-01T00:00:00.000Z')
				}),
				new Date('2029-01-01T00:00:00.000Z')
			)
		).toBe(true);
	});
});
