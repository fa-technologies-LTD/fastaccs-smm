import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	updateMany: vi.fn(),
	recordEvent: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		notification: {
			findFirst: mocks.findFirst,
			updateMany: mocks.updateMany
		}
	}
}));

vi.mock('$lib/services/affiliate-events', () => ({
	recordAffiliateEvent: mocks.recordEvent
}));

import { POST } from './+server';

function callRead(body: unknown, user: unknown = { id: 'user-1' }) {
	return POST({
		locals: { user },
		request: new Request('https://smm.fastaccs.com/api/affiliate/notifications/read', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never);
}

describe('universal notification reads', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.updateMany.mockResolvedValue({ count: 1 });
		mocks.recordEvent.mockResolvedValue(true);
	});

	it('cannot mark another user notification as read', async () => {
		mocks.findFirst.mockResolvedValue(null);
		const response = await callRead({ notificationId: 'note-1' });

		expect(response.status).toBe(404);
		expect(mocks.updateMany).not.toHaveBeenCalled();
	});

	it('records one useful-open event for affiliate notifications', async () => {
		mocks.findFirst.mockResolvedValue({ id: 'note-1', type: 'affiliate_store_credit' });
		const response = await callRead({ notificationId: 'note-1' });

		expect(response.status).toBe(200);
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'affiliate_notification_opened',
				dedupeKey: 'affiliate:notification_opened:note-1',
				affiliateUserId: 'user-1'
			})
		);
	});

	it('does not pollute the affiliate funnel for ordinary order notifications', async () => {
		mocks.findFirst.mockResolvedValue({ id: 'note-2', type: 'order_delivered' });
		await callRead({ notificationId: 'note-2' });

		expect(mocks.recordEvent).not.toHaveBeenCalled();
	});
});
