import { describe, expect, it } from 'vitest';
import { normalizeBoostItemStatus, canManuallyChangeBoostStatus } from './boosting-admin-status';

describe('Boosting admin status display', () => {
	it('preserves partial and review states, and does not present an unknown state as pending', () => {
		expect(normalizeBoostItemStatus('partial')).toBe('partial');
		expect(normalizeBoostItemStatus('under_review')).toBe('under_review');
		expect(normalizeBoostItemStatus('unexpected')).toBe('under_review');
		expect(normalizeBoostItemStatus(null)).toBe('pending');
	});
	it('keeps automation-controlled orders out of the manual Start/Complete/Reopen controls', () => {
		for (const mode of ['pilot', 'live']) {
			expect(canManuallyChangeBoostStatus({ mode, status: 'manual_review' })).toBe(false);
			expect(canManuallyChangeBoostStatus({ mode, status: 'queued' })).toBe(false);
		}
		expect(canManuallyChangeBoostStatus({ mode: 'manual', status: 'submitted' })).toBe(false);
		expect(canManuallyChangeBoostStatus({ mode: 'shadow', status: 'manual_review' })).toBe(true);
		expect(canManuallyChangeBoostStatus(null)).toBe(true);
	});
});
