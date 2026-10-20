import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	tiers: [] as unknown[],
	snapshot: null as string | null,
	openSubs: [] as unknown[],
	buyers: [] as unknown[],
	recentOrders: [] as unknown[],
	recentUsual: [] as unknown[],
	subscribers: [] as unknown[],
	users: [] as unknown[],
	upsert: vi.fn(),
	send: vi.fn(),
	trigger: vi.fn(),
	tierInfo: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		category: { findMany: async () => mocks.tiers },
		microcopy: {
			findUnique: async () => (mocks.snapshot ? { value: mocks.snapshot } : null),
			upsert: mocks.upsert
		},
		restockSubscription: {
			findMany: async ({ where }: { where: { notifiedAt?: null } }) =>
				'notifiedAt' in where ? mocks.openSubs : mocks.subscribers
		},
		order: {
			findMany: async ({ where }: { where: { AND?: unknown } }) =>
				where.AND ? mocks.buyers : mocks.recentOrders
		},
		emailNotification: { findMany: async () => mocks.recentUsual },
		user: { findMany: async () => mocks.users }
	}
}));
vi.mock('$lib/helpers/order-revenue.server', () => ({ buildRevenueOrderWhere: () => ({}) }));
vi.mock('$lib/services/email', () => ({ sendMarketingEmail: mocks.send }));
vi.mock('$lib/services/restock-notifications', () => ({
	getTierInfo: mocks.tierInfo,
	triggerRestockNotificationsForTier: mocks.trigger,
	restockTierUrl: () => 'https://smm.fastaccs.com/platforms/x/tiers/organic-500',
	restockUrgencyNote: () => 'Only 3 left — these go fast.'
}));

import { newlyBuyableTiers, runRestockMarketing } from './restock-marketing';

const tier = (id: string, available: number, mode = 'instant_auto', manualAvailable?: boolean) => ({
	id,
	metadata: {
		delivery_mode: mode,
		...(manualAvailable === undefined ? {} : { manual_available: manualAvailable })
	},
	_count: { accounts: available }
});
const info = {
	id: 't1',
	name: 'Organic 500',
	slug: 'organic-500',
	price: 12_000,
	availableCount: 3,
	buyable: true,
	isManual: false,
	platformName: 'X',
	platformSlug: 'x'
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.tiers = [];
	mocks.snapshot = null;
	mocks.openSubs = [];
	mocks.buyers = [];
	mocks.recentOrders = [];
	mocks.recentUsual = [];
	mocks.subscribers = [];
	mocks.users = [];
	mocks.send.mockResolvedValue({ success: true });
	mocks.trigger.mockResolvedValue(undefined);
	mocks.tierInfo.mockResolvedValue(info);
});

describe('restock marketing', () => {
	it('finds tiers that came back since the last check', () => {
		expect(
			newlyBuyableTiers({ a: false, b: true, c: false }, { a: true, b: true, c: false, d: true })
		).toEqual(['a']);
	});

	it('sends the alerts people asked for when their tier is buyable, including manual handover', async () => {
		mocks.tiers = [tier('t1', 2), tier('t2', 0, 'manual_handover', true), tier('t3', 0)];
		mocks.openSubs = [{ tierId: 't1' }, { tierId: 't2' }, { tierId: 't3' }];
		const result = await runRestockMarketing();
		expect(mocks.trigger.mock.calls.map((call) => call[0])).toEqual(['t1', 't2']);
		expect(result.subscriberTiersChecked).toBe(2);
	});

	it('only records stock on the first run, emailing no past buyers', async () => {
		mocks.tiers = [tier('t1', 3)];
		mocks.buyers = [{ userId: 'u1' }];
		const result = await runRestockMarketing();
		expect(result).toMatchObject({ firstRun: true, newlyBuyable: 0, pastBuyerEmails: 0 });
		expect(mocks.send).not.toHaveBeenCalled();
		expect(JSON.parse(mocks.upsert.mock.calls[0][0].create.value)).toEqual({ t1: true });
	});

	it('emails recent buyers once when their usual tier comes back, skipping busy and recent recipients', async () => {
		mocks.snapshot = JSON.stringify({ t1: false });
		mocks.tiers = [tier('t1', 3)];
		mocks.buyers = [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }, { userId: 'u4' }];
		mocks.recentOrders = [{ userId: 'u2' }]; // ordered in the last 2 days
		mocks.recentUsual = [{ userId: 'u3' }]; // had one this week
		mocks.subscribers = [{ userId: 'u4' }]; // gets the alert they asked for instead
		mocks.users = ['u1', 'u2', 'u3', 'u4'].map((id) => ({
			id,
			email: `${id}@x.test`,
			fullName: 'Ada B'
		}));
		const result = await runRestockMarketing(new Date('2026-11-05T17:00:00.000Z'));
		expect(result.pastBuyerEmails).toBe(1);
		expect(mocks.send).toHaveBeenCalledTimes(1);
		expect(mocks.send.mock.calls[0][0]).toMatchObject({
			to: 'u1@x.test',
			subject: 'Your usual Organic 500 is back in stock',
			referenceId: 'usual-back:t1',
			campaignKey: 'usual-back:t1:u1:2026-11-05',
			ctaUrl: 'https://smm.fastaccs.com/platforms/x/tiers/organic-500'
		});
		expect(mocks.send.mock.calls[0][0].body).toContain(
			'the one you ordered before, is back. ₦12,000 each.'
		);
	});
});
