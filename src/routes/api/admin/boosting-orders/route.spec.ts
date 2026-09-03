import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ hasPermission: vi.fn() }));

vi.mock('$lib/prisma', () => ({
	prisma: {
		orderItem: {
			count: vi.fn(),
			findMany: vi.fn(),
			groupBy: vi.fn()
		},
		orderEvent: { findMany: vi.fn() }
	}
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));

import { prisma } from '$lib/prisma';
import { GET } from './+server';

function callGet(query = '') {
	return GET({
		url: new URL(`https://smm.fastaccs.com/api/admin/boosting-orders${query}`),
		locals: { user: { id: 'admin-1' }, adminContext: {} }
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	vi.mocked(prisma.orderItem.count).mockResolvedValue(0);
	vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);
	vi.mocked(prisma.orderItem.groupBy).mockResolvedValue([
		{ boostFulfillmentStatus: 'pending', _count: { _all: 3 } },
		{ boostFulfillmentStatus: 'needs_link', _count: { _all: 1 } }
	] as never);
	vi.mocked(prisma.orderEvent.findMany).mockResolvedValue([]);
});

describe('boosting admin queue list', () => {
	it('defaults to active work, newest first, with a bounded page size', async () => {
		const response = await callGet();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.meta).toMatchObject({
			page: 1,
			pageSize: 25,
			sort: 'newest',
			status: 'active',
			statusCounts: { pending: 3, needs_link: 1 }
		});
		expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ orderBy: { createdAt: 'desc' }, skip: 0, take: 25 })
		);
	});

	it('supports oldest-first pagination and server-side search', async () => {
		await callGet('?status=all&sort=oldest&page=2&pageSize=10&q=customer@example.com');

		expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: { createdAt: 'asc' },
				skip: 10,
				take: 10,
				where: expect.objectContaining({ AND: expect.any(Array) })
			})
		);
	});

	it('requires admin access', async () => {
		mocks.hasPermission.mockReturnValue(false);
		const response = await callGet();
		expect(response.status).toBe(401);
		expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
	});
});
