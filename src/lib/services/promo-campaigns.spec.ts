import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	settings: { refer_win: null as string | null, bigspender: null as string | null },
	referrals: [] as unknown[],
	orders: [] as unknown[],
	grants: [] as unknown[],
	monthGrants: [] as unknown[],
	existingByReference: new Map<string, unknown>(),
	spendAtLaunch: 0,
	risk: vi.fn(),
	creditPromo: vi.fn(),
	notification: vi.fn(),
	event: vi.fn(),
	email: vi.fn(),
	dropped: [] as unknown[]
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		microcopy: {
			findMany: async () =>
				Object.entries(mocks.settings)
					.filter(([, value]) => value)
					.map(([kind, value]) => ({ key: `config.campaign.${kind}`, value }))
		},
		affiliateReferral: { findMany: async () => mocks.referrals },
		order: {
			findMany: async () => mocks.orders,
			aggregate: async () => ({ _sum: { totalAmount: mocks.spendAtLaunch, refundedAmount: 0 } })
		},
		walletTransaction: {
			findMany: async ({ where }: { where: { reference?: unknown } }) =>
				where.reference && typeof where.reference === 'object' && 'in' in where.reference
					? mocks.grants
					: mocks.monthGrants,
			findUnique: async ({ where }: { where: { reference: string } }) =>
				mocks.existingByReference.get(where.reference) ?? null
		},
		notification: { create: mocks.notification },
		affiliateEvent: { findMany: async () => mocks.dropped },
		$transaction: (fn: (tx: unknown) => unknown) => fn({})
	}
}));
vi.mock('$lib/helpers/order-revenue.server', () => ({
	buildRewardSpendOrderWhere: () => ({}),
	toNetSales: (total: unknown, refunded: unknown) => Number(total || 0) - Number(refunded || 0)
}));
vi.mock('$lib/services/affiliate-vesting', () => ({
	detectAffiliateIdentityRiskSignals: mocks.risk
}));
vi.mock('$lib/services/affiliate-events', () => ({ recordAffiliateEvent: mocks.event }));
vi.mock('$lib/services/admin-audit', () => ({ createAdminAuditLog: vi.fn() }));
vi.mock('$lib/services/promo-credit-email', () => ({ sendPromoCreditIssuedEmail: mocks.email }));
vi.mock('$lib/services/store-credit', async (original) => ({
	...(await original<typeof import('$lib/services/store-credit')>()),
	creditPromoCredit: mocks.creditPromo
}));

import { evaluateReferWin, maybeGrantBigSpender, runReferWinIssuance } from './promo-campaigns';
import { REFER_WIN_DEFAULTS } from '$lib/helpers/promo-campaign-rules';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const LAUNCH = new Date('2026-11-01T00:00:00.000Z');
const liveReferWin = JSON.stringify({
	...REFER_WIN_DEFAULTS,
	enabled: true,
	startsAt: LAUNCH.toISOString()
});

const referral = (friend: string, referrer = 'ref-1', isSuper = false) => ({
	referrerUserId: referrer,
	referredUserId: friend,
	referrer: { email: `${referrer}@x.test` },
	referredUser: { email: `${friend}@x.test` },
	program: { isSuperAffiliate: isSuper }
});
const paidOrder = (userId: string, id = `order-${userId}`) => ({
	id,
	userId,
	totalAmount: 5_000,
	storeCreditApplied: 0,
	refundedAmount: 0,
	paidAt: new Date('2026-11-05T10:00:00.000Z'),
	createdAt: new Date('2026-11-05T10:00:00.000Z'),
	deliveredAt: new Date('2026-11-05T11:00:00.000Z'),
	updatedAt: new Date('2026-11-05T11:00:00.000Z'),
	deliveryStatus: 'delivered',
	status: 'completed'
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.settings = { refer_win: null, bigspender: null };
	mocks.referrals = [];
	mocks.orders = [];
	mocks.grants = [];
	mocks.monthGrants = [];
	mocks.existingByReference = new Map();
	mocks.spendAtLaunch = 0;
	mocks.risk.mockResolvedValue([]);
	mocks.creditPromo.mockResolvedValue(true);
	mocks.notification.mockResolvedValue({});
	mocks.event.mockResolvedValue(true);
	mocks.email.mockResolvedValue(true);
	mocks.dropped = [];
});

describe('Refer & Win issuing', () => {
	it('does nothing at all while the campaign is off', async () => {
		mocks.referrals = [referral('f1')];
		mocks.orders = [paidOrder('f1')];
		expect(await runReferWinIssuance(NOW)).toEqual({ live: false, issued: 0, held: 0, dropped: 0 });
		expect(mocks.creditPromo).not.toHaveBeenCalled();
		expect(mocks.notification).not.toHaveBeenCalled();
		expect(mocks.email).not.toHaveBeenCalled();
	});

	it('pays nobody before launch (no backfill)', async () => {
		mocks.referrals = [referral('f1')];
		expect(
			await evaluateReferWin({ settings: REFER_WIN_DEFAULTS, now: NOW, launchForwardFrom: null })
		).toEqual([]);
	});

	it('issues ₦1,000 once per qualifying friend and drops the 4th in a month', async () => {
		mocks.settings.refer_win = liveReferWin;
		mocks.referrals = ['f1', 'f2', 'f3', 'f4'].map((friend) => referral(friend));
		mocks.orders = ['f1', 'f2', 'f3', 'f4'].map((friend) => paidOrder(friend));
		const result = await runReferWinIssuance(NOW);
		expect(result).toEqual({ live: true, issued: 3, held: 0, dropped: 1 });
		expect(mocks.event).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'refer_win_dropped_monthly_limit',
				dedupeKey: 'refer_win:dropped:f4'
			})
		);
		expect(mocks.email).toHaveBeenCalledTimes(3);
		expect(mocks.email.mock.calls[0][0]).toMatchObject({
			userId: 'ref-1',
			grantReference: 'refer_win:f1',
			subject: 'You earned ₦1,000 store credit'
		});
		expect(mocks.creditPromo).toHaveBeenCalledTimes(3);
		expect(mocks.creditPromo.mock.calls[0][1]).toMatchObject({
			userId: 'ref-1',
			amount: 1_000,
			campaign: 'refer_win',
			reference: 'refer_win:f1',
			expiresAt: new Date(NOW.getTime() + 30 * 86_400_000)
		});
	});

	it('counts rewards already issued this month toward the limit', async () => {
		mocks.settings.refer_win = liveReferWin;
		mocks.referrals = [referral('f1')];
		mocks.orders = [paidOrder('f1')];
		mocks.monthGrants = [{ userId: 'ref-1' }, { userId: 'ref-1' }, { userId: 'ref-1' }];
		const [decision] = await evaluateReferWin({
			settings: JSON.parse(liveReferWin),
			now: NOW,
			launchForwardFrom: LAUNCH
		});
		expect(decision.status).toBe('dropped_limit');
	});

	it('never issues a reward that was dropped for the limit, even next month', async () => {
		mocks.settings.refer_win = liveReferWin;
		mocks.referrals = [referral('f1')];
		mocks.orders = [paidOrder('f1')];
		mocks.dropped = [{ referredUserId: 'f1', createdAt: NOW }];
		const result = await runReferWinIssuance(new Date('2026-12-02T12:00:00.000Z'));
		expect(result).toMatchObject({ issued: 0, dropped: 0 });
		expect(mocks.creditPromo).not.toHaveBeenCalled();
	});

	it('excludes Super affiliates by default and holds identity matches', async () => {
		mocks.settings.refer_win = liveReferWin;
		mocks.referrals = [referral('f1', 'stacy', true), referral('f2', 'ref-2')];
		mocks.orders = [paidOrder('f1'), paidOrder('f2')];
		mocks.risk.mockResolvedValue(['shared_phone']);
		const decisions = await evaluateReferWin({
			settings: JSON.parse(liveReferWin),
			now: NOW,
			launchForwardFrom: LAUNCH
		});
		expect(decisions.map((row) => [row.friendUserId, row.status])).toEqual([
			['f1', 'super_excluded'],
			['f2', 'held_identity']
		]);
	});

	it('never pays twice for the same friend', async () => {
		mocks.settings.refer_win = liveReferWin;
		mocks.referrals = [referral('f1')];
		mocks.orders = [paidOrder('f1')];
		mocks.grants = [{ reference: 'refer_win:f1', createdAt: NOW, amount: 1_000 }];
		expect((await runReferWinIssuance(NOW)).issued).toBe(0);
	});
});

describe('BIGSPENDER', () => {
	const live = JSON.stringify({
		enabled: true,
		startsAt: '2026-10-01T00:00:00.000Z',
		rewardNgn: 3_000,
		thresholdNgn: 100_000
	});

	it('does nothing while off', async () => {
		await maybeGrantBigSpender('buyer', 150_000);
		expect(mocks.creditPromo).not.toHaveBeenCalled();
	});

	it('grants ₦3,000 and emails when a customer without the ₦70k gift reaches ₦100,000', async () => {
		mocks.settings.bigspender = live;
		mocks.spendAtLaunch = 60_000;
		await maybeGrantBigSpender('buyer', 101_000);
		expect(mocks.creditPromo.mock.calls[0][1]).toMatchObject({
			userId: 'buyer',
			amount: 3_000,
			campaign: 'bigspender',
			reference: 'bigspender:buyer',
			metadata: expect.objectContaining({ thresholdNgn: 100_000 })
		});
		expect(mocks.email.mock.calls[0][0]).toMatchObject({ grantReference: 'bigspender:buyer' });
	});

	it('makes customers who already had the ₦70k gift wait for the next round mark', async () => {
		mocks.settings.bigspender = live;
		mocks.spendAtLaunch = 85_000;
		mocks.existingByReference.set('spend:gift:70k:buyer', { status: 'available' });
		await maybeGrantBigSpender('buyer', 150_000);
		expect(mocks.creditPromo).not.toHaveBeenCalled();
		await maybeGrantBigSpender('buyer', 200_000);
		expect(mocks.creditPromo.mock.calls[0][1].metadata).toMatchObject({ thresholdNgn: 200_000 });
	});

	it('pays customers already over ₦100,000 at launch at their next round mark', async () => {
		mocks.settings.bigspender = live;
		mocks.spendAtLaunch = 575_700;
		mocks.existingByReference.set('spend:gift:70k:buyer', { status: 'available' });
		await maybeGrantBigSpender('buyer', 590_000);
		expect(mocks.creditPromo).not.toHaveBeenCalled();
		await maybeGrantBigSpender('buyer', 600_000);
		expect(mocks.creditPromo.mock.calls[0][1].metadata).toMatchObject({ thresholdNgn: 600_000 });
	});

	it('grants at most once', async () => {
		mocks.settings.bigspender = live;
		mocks.existingByReference.set('bigspender:buyer', { id: 'lot' });
		await maybeGrantBigSpender('buyer', 125_000);
		expect(mocks.creditPromo).not.toHaveBeenCalled();
	});
});
