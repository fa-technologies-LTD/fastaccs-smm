import { describe, expect, it } from 'vitest';
import { BoostProviderSubmissionError } from './panel-order-client';
import {
	canRetryBoostSubmission,
	canStartBoostWork,
	customerStatusForProviderState,
	getBoostAutomationMode
} from './fulfillment-worker';

describe('Boosting fulfillment safety policy', () => {
	it('does not start another provider call when the cron is close to its runtime deadline', () => {
		expect(canStartBoostWork(45000, 20000)).toBe(true);
		expect(canStartBoostWork(45000, 23001)).toBe(false);
	});
	it('fails closed to shadow unless the environment explicitly enables paid routing', () => {
		expect(getBoostAutomationMode(undefined)).toBe('shadow');
		expect(getBoostAutomationMode('unexpected')).toBe('shadow');
		expect(getBoostAutomationMode('pilot')).toBe('pilot');
		expect(getBoostAutomationMode('live')).toBe('live');
	});

	it('retries only a definite uncharged rejection and only below the attempt cap', () => {
		const rejected = new BoostProviderSubmissionError(
			'Not accepted',
			'smm_raja',
			'provider_rejected',
			'not_submitted'
		);
		const unknown = new BoostProviderSubmissionError(
			'Unknown outcome',
			'bulk_follows',
			'submission_unknown',
			'submission_unknown'
		);
		expect(canRetryBoostSubmission(rejected, 1, 2)).toBe(true);
		expect(canRetryBoostSubmission(rejected, 2, 2)).toBe(false);
		expect(canRetryBoostSubmission(unknown, 1, 2)).toBe(false);
		expect(canRetryBoostSubmission(new Error('network'), 1, 2)).toBe(false);
	});

	it('keeps uncertain and terminal failures out of a false completed customer state', () => {
		expect(customerStatusForProviderState('completed')).toBe('completed');
		expect(customerStatusForProviderState('in_progress')).toBe('in_progress');
		expect(customerStatusForProviderState('partial')).toBe('partial');
		expect(customerStatusForProviderState('failed')).toBe('under_review');
		expect(customerStatusForProviderState('unknown')).toBe('processing');
	});
});
