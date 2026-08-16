import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findMany: vi.fn(),
	count: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		notification: {
			findMany: mocks.findMany,
			count: mocks.count
		}
	}
}));

import { GET } from './+server';

function callNotifications(path: string, user: unknown = { id: 'buyer-1' }) {
	return GET({
		locals: { user },
		url: new URL(`https://smm.fastaccs.com${path}`)
	} as never);
}

describe('notification inbox pagination', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.count.mockResolvedValue(7);
	});

	it('rejects unauthenticated reads', async () => {
		const response = await callNotifications('/api/affiliate/notifications', null);

		expect(response.status).toBe(401);
		expect(mocks.findMany).not.toHaveBeenCalled();
	});

	it('loads only the unread summary when the bell is idle', async () => {
		const response = await callNotifications('/api/affiliate/notifications?summary=1');
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({ unreadCount: 7, notifications: [], nextCursor: null });
		expect(mocks.findMany).not.toHaveBeenCalled();
	});

	it('returns a bounded page and an opaque cursor for older notifications', async () => {
		mocks.findMany.mockResolvedValue([
			{ id: 'note-3', createdAt: new Date('2026-08-16T10:00:00Z') },
			{ id: 'note-2', createdAt: new Date('2026-08-16T09:00:00Z') },
			{ id: 'note-1', createdAt: new Date('2026-08-16T08:00:00Z') }
		]);

		const response = await callNotifications(
			'/api/affiliate/notifications?limit=2&cursor=note-previous'
		);
		const body = await response.json();

		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				cursor: { id: 'note-previous' },
				skip: 1,
				take: 3,
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
			})
		);
		expect(body.data.notifications.map((notification: { id: string }) => notification.id)).toEqual([
			'note-3',
			'note-2'
		]);
		expect(body.data.nextCursor).toBe('note-2');
	});
});
