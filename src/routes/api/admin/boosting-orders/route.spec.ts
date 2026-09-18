import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ hasPermission: vi.fn() }));

vi.mock('$lib/prisma', () => ({
	prisma: {
		orderItem: {
			count: vi.fn(),
			findMany: vi.fn(),
			groupBy: vi.fn()
		},
		boostFulfillment: { findMany: vi.fn() },
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
	vi.mocked(prisma.boostFulfillment.findMany).mockResolvedValue([]);
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

	it('adds a bounded internal shadow decision without exposing its full audit payload', async () => {
		vi.mocked(prisma.orderItem.findMany).mockResolvedValue([
			{
				id: 'item-1',
				productName: 'Instagram Followers',
				boostTargetUrl: 'https://instagram.com/fastaccs',
				boostQuantity: 1000,
				boostFulfillmentStatus: 'pending',
				boostProviderReference: null,
				boostCompletedAt: null,
				createdAt: new Date(),
				order: {
					id: 'order-1',
					orderNumber: 'ORD-1',
					guestEmail: null,
					createdAt: new Date(),
					paidAt: new Date(),
					user: { email: 'buyer@example.com', fullName: 'Buyer' }
				},
				category: { metadata: {} }
			}
		] as never);
		vi.mocked(prisma.boostFulfillment.findMany).mockResolvedValue([
			{
				orderItemId: 'item-1',
				provider: 'smm_raja',
				quotedSupplierCostUsd: 0.75,
				projectedMarginNgn: 3650,
				lastSafeErrorCategory: null,
				lastCheckedAt: new Date('2026-09-12T10:00:00.000Z'),
				selectedRoute: { providerService: { serviceId: '101', name: 'Supplier row' } }
			}
		] as never);

		const response = await callGet();
		const body = await response.json();
		expect(body.data[0].shadowDecision).toEqual({
			provider: 'smm_raja',
			providerServiceId: '101',
			providerServiceName: 'Supplier row',
			quotedSupplierCostUsd: 0.75,
			projectedMarginNgn: 3650,
			attention: null,
			checkedAt: '2026-09-12T10:00:00.000Z'
		});
	});

	it('keeps the existing queue working before the additive Boosting migration is applied', async () => {
		vi.mocked(prisma.orderItem.findMany).mockResolvedValue([
			{
				id: 'item-1',
				productName: 'Instagram Followers',
				boostTargetUrl: 'https://instagram.com/fastaccs',
				boostQuantity: 1000,
				boostFulfillmentStatus: 'pending',
				boostProviderReference: null,
				boostCompletedAt: null,
				createdAt: new Date(),
				order: {
					id: 'order-1',
					orderNumber: 'ORD-1',
					guestEmail: null,
					createdAt: new Date(),
					paidAt: new Date(),
					user: null
				},
				category: { metadata: {} }
			}
		] as never);
		vi.mocked(prisma.boostFulfillment.findMany).mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError('missing table', {
				code: 'P2021',
				clientVersion: 'test'
			})
		);

		const response = await callGet();
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.data[0].shadowDecision).toBeNull();
	});

	it('requires admin access', async () => {
		mocks.hasPermission.mockReturnValue(false);
		const response = await callGet();
		expect(response.status).toBe(401);
		expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
	});
});
