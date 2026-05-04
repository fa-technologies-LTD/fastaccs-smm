import { describe, expect, it } from 'vitest';
import {
	ACCOUNT_STATUS_ALLOCATED,
	ACCOUNT_STATUS_LEGACY_ASSIGNED,
	getAllocatedLikeAccountStatuses,
	normalizeAccountStatus
} from './account-status';

describe('account-status helper', () => {
	it('normalizes legacy assigned status to allocated', () => {
		expect(normalizeAccountStatus('assigned')).toBe(ACCOUNT_STATUS_ALLOCATED);
		expect(normalizeAccountStatus('  ASSIGNED  ')).toBe(ACCOUNT_STATUS_ALLOCATED);
		expect(normalizeAccountStatus('allocated')).toBe(ACCOUNT_STATUS_ALLOCATED);
	});

	it('returns both allocated-like statuses for compatibility queries', () => {
		expect(getAllocatedLikeAccountStatuses()).toEqual([
			ACCOUNT_STATUS_ALLOCATED,
			ACCOUNT_STATUS_LEGACY_ASSIGNED
		]);
	});
});
