import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findReferral: vi.fn(),
	findReferrals: vi.fn(),
	findLegacyLock: vi.fn(),
	findLegacyLocks: vi.fn(),
	findProgram: vi.fn(),
	findPrograms: vi.fn(),
	findUser: vi.fn(),
	countOrders: vi.fn(),
	transaction: vi.fn(),
	createEvent: vi.fn(),
	createNotification: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	order: { count: vi.fn() },
	affiliateProgram: { findFirst: vi.fn() },
	affiliateReferral: { findUnique: vi.fn(), create: vi.fn() },
	microcopy: { findUnique: vi.fn(), create: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		affiliateReferral: { findUnique: mocks.findReferral, findMany: mocks.findReferrals },
		microcopy: { findUnique: mocks.findLegacyLock, findMany: mocks.findLegacyLocks },
		affiliateProgram: { findFirst: mocks.findProgram, findMany: mocks.findPrograms },
		user: { findUnique: mocks.findUser },
		order: { count: mocks.countOrders },
		affiliateEvent: { create: mocks.createEvent },
		notification: { create: mocks.createNotification },
		$transaction: mocks.transaction
	}
}));

vi.mock('$lib/services/email', () => ({ sendEmail: vi.fn(), sendMarketingEmail: vi.fn() }));
vi.mock('$lib/services/affiliate-notification-email', () => ({
	sendAffiliateUnlockEmailIfNeeded: vi.fn(),
	sendFirstStoreCreditEmailIfNeeded: vi.fn()
}));
vi.mock('$lib/services/affiliate-payout-email', () => ({
	sendAffiliatePayoutStatusEmailIfNeeded: vi.fn()
}));
vi.mock('$lib/services/admin-settings', () => ({ getOperationalAlertRecipients: vi.fn() }));

import { getCanonicalReferralCounts, lockReferralAttributionForUser } from './affiliate';

const ACTIVE_PROGRAM = {
	id: '11111111-1111-4111-8111-111111111111',
	userId: '22222222-2222-4222-8222-222222222222',
	affiliateCode: 'FIRST',
	user: { isActive: true, isAffiliateEnabled: true }
};

function durableLock(code = 'FIRST') {
	return {
		affiliateProgramId: ACTIVE_PROGRAM.id,
		affiliateCode: code,
		referrerUserId: ACTIVE_PROGRAM.userId,
		referredUserId: '33333333-3333-4333-8333-333333333333',
		source: 'checkout_link',
		lockedAt: new Date('2026-08-01T12:00:00.000Z')
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findReferral.mockResolvedValue(null);
	mocks.findReferrals.mockResolvedValue([]);
	mocks.findLegacyLock.mockResolvedValue(null);
	mocks.findLegacyLocks.mockResolvedValue([]);
	mocks.findProgram.mockResolvedValue(ACTIVE_PROGRAM);
	mocks.findPrograms.mockResolvedValue([]);
	mocks.findUser.mockResolvedValue({
		id: '33333333-3333-4333-8333-333333333333',
		isActive: true
	});
	mocks.countOrders.mockResolvedValue(0);
	mocks.createEvent.mockResolvedValue({});
	mocks.createNotification.mockResolvedValue({});
	tx.$queryRaw.mockResolvedValue([]);
	tx.order.count.mockResolvedValue(0);
	tx.affiliateProgram.findFirst.mockResolvedValue({ id: ACTIVE_PROGRAM.id });
	tx.affiliateReferral.findUnique.mockResolvedValue(null);
	tx.microcopy.findUnique.mockResolvedValue(null);
	tx.affiliateReferral.create.mockResolvedValue({});
	tx.microcopy.create.mockResolvedValue({});
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
});

describe('durable first-touch affiliate attribution', () => {
	it('keeps the first referrer when a later code is presented', async () => {
		mocks.findReferral.mockResolvedValue(durableLock());

		const result = await lockReferralAttributionForUser({
			referredUserId: '33333333-3333-4333-8333-333333333333',
			affiliateCode: 'SECOND',
			source: 'checkout_manual'
		});

		expect(result).toMatchObject({
			locked: true,
			alreadyLocked: true,
			reason: 'already_locked',
			attribution: { affiliateCode: 'FIRST' }
		});
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('blocks self-referral before writing an attribution', async () => {
		mocks.findProgram.mockResolvedValue({
			...ACTIVE_PROGRAM,
			userId: '33333333-3333-4333-8333-333333333333'
		});

		const result = await lockReferralAttributionForUser({
			referredUserId: '33333333-3333-4333-8333-333333333333',
			affiliateCode: 'FIRST',
			source: 'checkout_manual'
		});

		expect(result.reason).toBe('self_referral_blocked');
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('does not attach a referral after the buyer already has a retained paid order', async () => {
		mocks.countOrders.mockResolvedValue(1);

		const result = await lockReferralAttributionForUser({
			referredUserId: '33333333-3333-4333-8333-333333333333',
			affiliateCode: 'FIRST',
			source: 'checkout_link'
		});

		expect(result.reason).toBe('buyer_has_prior_paid_orders');
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('rechecks buyer and program eligibility under the user lock before creating both records', async () => {
		const result = await lockReferralAttributionForUser({
			referredUserId: '33333333-3333-4333-8333-333333333333',
			affiliateCode: 'first',
			source: 'checkout_link'
		});

		expect(result).toMatchObject({ locked: true, alreadyLocked: false });
		expect(tx.$queryRaw).toHaveBeenCalledOnce();
		expect(tx.order.count).toHaveBeenCalledOnce();
		expect(tx.affiliateReferral.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				affiliateCode: 'FIRST',
				referredUserId: '33333333-3333-4333-8333-333333333333',
				policySnapshot: expect.objectContaining({
					version: 1,
					programId: ACTIVE_PROGRAM.id,
					programType: 'regular'
				})
			})
		});
		expect(tx.microcopy.create).toHaveBeenCalledOnce();
	});

	it('treats a concurrent uniqueness winner as the one durable first-touch result', async () => {
		mocks.transaction.mockRejectedValue({ code: 'P2002' });
		mocks.findReferral.mockResolvedValueOnce(null).mockResolvedValueOnce(durableLock());

		const result = await lockReferralAttributionForUser({
			referredUserId: '33333333-3333-4333-8333-333333333333',
			affiliateCode: 'FIRST',
			source: 'checkout_link'
		});

		expect(result).toMatchObject({
			locked: true,
			alreadyLocked: true,
			reason: 'already_locked',
			attribution: { affiliateCode: 'FIRST' }
		});
	});

	it('dual-reads and deduplicates durable and legacy referrals during migration', async () => {
		mocks.findReferrals.mockResolvedValue([
			{
				referrerUserId: ACTIVE_PROGRAM.userId,
				referredUserId: '33333333-3333-4333-8333-333333333333'
			}
		]);
		mocks.findLegacyLocks.mockResolvedValue([
			{ value: JSON.stringify({ ...durableLock(), lockedAt: '2026-08-01T12:00:00.000Z' }) },
			{
				value: JSON.stringify({
					...durableLock(),
					referredUserId: '44444444-4444-4444-8444-444444444444',
					lockedAt: '2026-08-02T12:00:00.000Z'
				})
			}
		]);

		const counts = await getCanonicalReferralCounts([ACTIVE_PROGRAM.userId]);

		expect(counts.get(ACTIVE_PROGRAM.userId)).toBe(2);
	});
});
