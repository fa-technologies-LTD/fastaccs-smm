import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	users: [] as unknown[],
	orders: [] as unknown[],
	tiers: [] as unknown[],
	send: vi.fn(),
	offer: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/prisma', () => ({
	prisma: {
		user: { findMany: async () => mocks.users },
		order: { findMany: async () => mocks.orders },
		category: {
			findMany: async ({ where }: { where: { id?: unknown } }) =>
				where.id ? mocks.tiers : [{ parent: { name: 'X' } }, { parent: { name: 'Instagram' } }]
		},
		emailNotification: { findFirst: async () => null }
	}
}));
vi.mock('$lib/helpers/order-revenue.server', () => ({ buildRevenueOrderWhere: () => ({}) }));
vi.mock('./email', () => ({ sendMarketingEmail: mocks.send }));
vi.mock('./email-variants', async (original) => ({
	...(await original<typeof import('./email-variants')>()),
	pickVariantIndex: async () => 0
}));
vi.mock('./admin-settings', () => ({
	getAdminSettingsSnapshot: async () => ({ notifications: { winbackDaysThreshold: 20 } })
}));
vi.mock('./promotions', () => ({ getFirstOrderOffer: mocks.offer }));

import { runWinBackCampaign } from './winback';

const DAY = 86_400_000;
const user = (id: string, registeredDaysAgo: number) => ({
	id,
	email: `${id}@gmail.com`,
	fullName: 'Ada Obi',
	registeredAt: new Date(Date.now() - registeredDaysAgo * DAY)
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.users = [];
	mocks.orders = [];
	mocks.tiers = [];
	mocks.send.mockResolvedValue({ success: true });
	mocks.offer.mockResolvedValue({ label: '10% off your first account order' });
});

describe('win-back', () => {
	it('tells a lapsed buyer their usual tier is in stock, with a direct link', async () => {
		mocks.users = [user('buyer', 200)];
		mocks.orders = [
			{
				userId: 'buyer',
				createdAt: new Date(Date.now() - 40 * DAY),
				orderItems: [
					{ categoryId: 't-500', quantity: 3 },
					{ categoryId: 't-50f', quantity: 1 }
				]
			}
		];
		mocks.tiers = [
			{
				id: 't-500',
				name: 'Organic 500 Followers ',
				slug: 'organic-500',
				metadata: { pricing: { base_price: 12_000 } },
				parent: { name: 'X', slug: 'x' },
				_count: { accounts: 4 }
			}
		];
		await runWinBackCampaign();
		expect(mocks.send.mock.calls[0][0]).toMatchObject({
			subject: 'Your usual Organic 500 Followers is in stock',
			ctaUrl: 'https://smm.fastaccs.com/platforms/x/tiers/organic-500'
		});
		expect(mocks.send.mock.calls[0][0].body).toContain('₦12,000 each');
	});

	it('leaves new never-bought sign-ups to the welcome emails', async () => {
		mocks.users = [user('newbie', 10)];
		await runWinBackCampaign();
		expect(mocks.send).not.toHaveBeenCalled();
	});

	it('reminds older never-bought sign-ups of the first-order offer', async () => {
		mocks.users = [user('older', 90)];
		await runWinBackCampaign();
		expect(mocks.send.mock.calls[0][0].body).toContain(
			'New here? 10% off your first account order: one tap at checkout.'
		);
	});
});
