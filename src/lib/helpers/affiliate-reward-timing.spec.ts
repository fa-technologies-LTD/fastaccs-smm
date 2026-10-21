import { describe, expect, it } from 'vitest';
import {
	computeSuperRewardVestsAt,
	getAffiliateRewardVestsAt,
	isSuperAffiliateReward
} from './affiliate-reward-timing';

describe('Super reward timing', () => {
	it.each(['super_activation', 'super_monthly_bonus', 'super_order_commission'])(
		'uses exactly 24 elapsed hours for %s',
		(kind) => {
			const due = getAffiliateRewardVestsAt({
				createdAt: '2026-10-20T23:17:29.435Z',
				metadata: { kind, vestsAt: '2026-11-03T23:17:29.421Z' }
			});
			expect(due?.toISOString()).toBe('2026-10-21T23:17:29.435Z');
		}
	);
	it('does not restart the clock when an account transfers', () => {
		expect(
			getAffiliateRewardVestsAt({
				createdAt: '2026-10-08T09:44:23.549Z',
				metadata: { kind: 'super_activation', accountTransfer: { at: '2026-10-21T14:00:00.000Z' } }
			})?.toISOString()
		).toBe('2026-10-09T09:44:23.549Z');
	});
	it('honours original payment time for a commission recorded later', () => {
		expect(
			getAffiliateRewardVestsAt({
				createdAt: '2026-10-21T12:00:00.000Z',
				commissionEarnedAt: '2026-10-18T11:00:00.000Z',
				metadata: { kind: 'super_order_commission' }
			})?.toISOString()
		).toBe('2026-10-19T11:00:00.000Z');
	});
	it('does not add another day after a cost review', () => {
		expect(
			getAffiliateRewardVestsAt({
				createdAt: '2026-10-18T12:00:00.000Z',
				metadata: {
					kind: 'super_order_commission',
					earnedAt: '2026-10-18T11:00:00.000Z',
					costResolvedAt: '2026-10-21T12:00:00.000Z'
				}
			})?.toISOString()
		).toBe('2026-10-21T12:00:00.000Z');
	});
	it('leaves regular and unidentified rewards on their saved return window', () => {
		for (const metadata of [
			{ vestsAt: '2026-11-03T12:00:00.000Z' },
			{ kind: 'regular', vestsAt: '2026-11-03T12:00:00.000Z' }
		])
			expect(
				getAffiliateRewardVestsAt({
					createdAt: '2026-10-20T12:00:00.000Z',
					metadata
				})?.toISOString()
			).toBe('2026-11-03T12:00:00.000Z');
	});
	it('recognises legacy Super references but not refund adjustments', () => {
		expect(isSuperAffiliateReward({ reference: 'super:activation:affiliate:buyer' })).toBe(true);
		expect(isSuperAffiliateReward({ reference: 'super:monthly_bonus:affiliate:2026-10:10' })).toBe(
			true
		);
		expect(isSuperAffiliateReward({ reference: 'super:commission:order:order-id' })).toBe(true);
		expect(isSuperAffiliateReward({ reference: 'super:commission:adjustment:order-id:300' })).toBe(
			false
		);
	});
	it('does not invent an immediate release date for malformed legacy records', () => {
		expect(
			getAffiliateRewardVestsAt({ metadata: { kind: 'super_activation', vestsAt: 'invalid' } })
		).toBeNull();
		expect(getAffiliateRewardVestsAt({ metadata: { vestsAt: 'invalid' } })).toBeNull();
		expect(() => computeSuperRewardVestsAt(new Date('invalid'))).toThrow('Invalid');
	});
});
