import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	tier: null as unknown,
	subs: [] as unknown[],
	send: vi.fn(),
	updateMany: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/prisma', () => ({
	prisma: {
		category: { findFirst: async () => mocks.tier },
		restockSubscription: { findMany: async () => mocks.subs, updateMany: mocks.updateMany }
	}
}));
vi.mock('./email', () => ({ sendMarketingEmail: mocks.send }));
vi.mock('./push-notifications', () => ({ sendPushToUser: async () => undefined }));
vi.mock('./email-variants', async (original) => ({
	...(await original<typeof import('./email-variants')>()),
	pickVariantIndex: async () => 0
}));

import { triggerRestockNotificationsForTier } from './restock-notifications';

const tier = (overrides: Record<string, unknown>) => ({
	id: 't1',
	name: 'Verified X',
	slug: 'verified-x',
	isActive: true,
	metadata: { pricing: { base_price: 24_500 } },
	parent: { name: 'X', slug: 'x' },
	accounts: [],
	...overrides
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.subs = [{ id: 's1', userId: 'u1', email: 'a@gmail.com' }];
	mocks.send.mockResolvedValue({ success: true });
});

describe('restock alerts people asked for', () => {
	it('fires for a manual-handover tier switched to available', async () => {
		mocks.tier = tier({ metadata: { delivery_mode: 'manual_handover', manual_available: true } });
		await triggerRestockNotificationsForTier('t1');
		expect(mocks.send.mock.calls[0][0]).toMatchObject({
			subject: 'Verified X is back in stock',
			preheader: 'Available now. Our team hands it over on WhatsApp.'
		});
		expect(mocks.updateMany).toHaveBeenCalled();
	});

	it('stays quiet for a hidden tier even with stock, and for an empty one', async () => {
		mocks.tier = tier({ isActive: false, accounts: [{ id: 'a1' }] });
		await triggerRestockNotificationsForTier('t1');
		mocks.tier = tier({ accounts: [] });
		await triggerRestockNotificationsForTier('t1');
		expect(mocks.send).not.toHaveBeenCalled();
	});
});
