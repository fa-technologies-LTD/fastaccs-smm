import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	findUnique: vi.fn(),
	update: vi.fn(),
	invalidate: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		category: {
			create: mocks.create,
			findUnique: mocks.findUnique,
			update: mocks.update
		}
	}
}));
vi.mock('$lib/services/admin-metrics', () => ({ invalidateAdminStatsCache: mocks.invalidate }));
vi.mock('$lib/services/boosting-service-notifications', () => ({
	triggerBoostingWaitlistNotifications: vi.fn()
}));

import { POST } from './+server';
import { PUT } from './[id]/+server';

function adminLocals() {
	return { user: { id: 'admin-1', userType: 'ADMIN' } };
}

function tierPayload(metadata: Record<string, unknown>) {
	return {
		name: 'New Tier',
		slug: 'new-tier',
		description: 'Test tier',
		categoryType: 'tier',
		metadata,
		sortOrder: 0,
		isActive: true
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.create.mockImplementation(async ({ data }) => data);
	mocks.update.mockImplementation(async ({ data }) => ({ id: 'tier-1', name: 'Tier', ...data }));
});

describe('private affiliate eligibility on account tiers', () => {
	it('defaults a newly created tier to excluded when no eligibility decision was supplied', async () => {
		const response = await POST({
			locals: adminLocals(),
			request: new Request('https://smm.fastaccs.com/api/categories', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(tierPayload({ pricing: { base_price: 10_000 } }))
			})
		} as never);

		expect(response.status).toBe(200);
		expect(mocks.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				metadata: expect.objectContaining({ affiliate_excluded: true })
			})
		});
	});

	it('respects an explicit owner decision to include a new tier', async () => {
		await POST({
			locals: adminLocals(),
			request: new Request('https://smm.fastaccs.com/api/categories', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(tierPayload({ affiliate_excluded: false }))
			})
		} as never);

		expect(mocks.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				metadata: expect.objectContaining({ affiliate_excluded: false })
			})
		});
	});

	it('preserves an existing exclusion when an older edit payload omits the field', async () => {
		mocks.findUnique.mockResolvedValue({
			categoryType: 'tier',
			metadata: { pricing: { base_price: 10_000 }, affiliate_excluded: true }
		});

		const response = await PUT({
			locals: adminLocals(),
			params: { id: 'tier-1' },
			request: new Request('https://smm.fastaccs.com/api/categories/tier-1', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ metadata: { pricing: { base_price: 12_000 } } })
			})
		} as never);

		expect(response.status).toBe(200);
		expect(mocks.update).toHaveBeenCalledWith({
			where: { id: 'tier-1' },
			data: expect.objectContaining({
				metadata: expect.objectContaining({ affiliate_excluded: true })
			})
		});
	});
});
