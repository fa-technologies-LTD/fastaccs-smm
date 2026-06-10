import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	user: {
		findMany: vi.fn()
	},
	emailNotification: {
		createMany: vi.fn(),
		findMany: vi.fn(),
		count: vi.fn(),
		findFirst: vi.fn()
	}
}));
const sendQueuedMarketingEmailMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

vi.mock('./email', () => ({
	QUEUED_MARKETING_STALE_MS: 15 * 60 * 1000,
	sendQueuedMarketingEmail: sendQueuedMarketingEmailMock
}));

import { createBroadcast, processBroadcastBatch } from './admin-broadcast';

describe('admin customer broadcasts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.user.findMany.mockResolvedValue([
			{
				id: '11111111-1111-4111-8111-111111111111',
				email: 'buyer@example.com',
				fullName: 'Buyer'
			}
		]);
		prismaMock.emailNotification.createMany.mockResolvedValue({ count: 1 });
	});

	it('queues every recipient as a uniquely keyed marketing email', async () => {
		const result = await createBroadcast({
			subject: 'New service',
			body: 'A relevant service is available.',
			audience: 'all_verified',
			platformIds: [],
			tierIds: []
		});

		expect(result.total).toBe(1);
		expect(prismaMock.emailNotification.createMany).toHaveBeenCalledWith({
			data: [
				expect.objectContaining({
					userId: '11111111-1111-4111-8111-111111111111',
					classification: 'marketing',
					status: 'pending',
					campaignKey: expect.stringMatching(
						/^admin-broadcast:[0-9a-f-]+:11111111-1111-4111-8111-111111111111$/
					)
				})
			]
		});
	});

	it('delegates queued recipients to the central marketing policy', async () => {
		prismaMock.emailNotification.findMany.mockResolvedValue([
			{ id: '22222222-2222-4222-8222-222222222222' }
		]);
		sendQueuedMarketingEmailMock.mockResolvedValue({ success: false, suppressed: true });
		prismaMock.emailNotification.count.mockResolvedValueOnce(1);
		prismaMock.emailNotification.count.mockResolvedValueOnce(0);
		prismaMock.emailNotification.count.mockResolvedValueOnce(0);
		prismaMock.emailNotification.count.mockResolvedValueOnce(1);
		prismaMock.emailNotification.count.mockResolvedValueOnce(0);
		prismaMock.emailNotification.findFirst.mockResolvedValue({
			subject: 'New service',
			body: 'A relevant service is available.',
			referenceId: 'audience=all_verified;platformIds=;tierIds=',
			createdAt: new Date('2026-06-08T12:00:00.000Z')
		});

		const result = await processBroadcastBatch('33333333-3333-4333-8333-333333333333', 10);

		expect(sendQueuedMarketingEmailMock).toHaveBeenCalledWith(
			'22222222-2222-4222-8222-222222222222'
		);
		expect(result.progress).toEqual(
			expect.objectContaining({
				total: 1,
				sent: 0,
				failed: 0,
				suppressed: 1,
				pending: 0,
				status: 'completed'
			})
		);
	});
});
