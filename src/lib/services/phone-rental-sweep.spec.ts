import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	phoneRental: { findMany: vi.fn() }
}));
const pollMock = vi.hoisted(() => vi.fn());
const alertMock = vi.hoisted(() => vi.fn().mockResolvedValue({ sent: true }));

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./phone-fulfillment', () => ({ pollPhoneRentalSms: pollMock }));
vi.mock('./admin-alerts', () => ({ sendCriticalAdminAlert: alertMock }));

import { sweepExpiredPhoneRentals } from './phone-rental-sweep';

function row(orderItemId: string, over: Record<string, unknown> = {}) {
	return {
		orderItemId,
		status: 'pending',
		rentLeaseExpiresAt: null,
		operationLeaseExpiresAt: null,
		...over
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	pollMock.mockResolvedValue({ status: 'awaiting_sms' });
});

describe('sweepExpiredPhoneRentals', () => {
	it('selects oldest work, bounds the batch, and limits worker concurrency', async () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([
			row('oldest'),
			row('second'),
			row('deferred')
		]);
		let active = 0;
		let peak = 0;
		pollMock.mockImplementation(async () => {
			active += 1;
			peak = Math.max(peak, active);
			await Promise.resolve();
			active -= 1;
			return { status: 'received' };
		});

		const result = await sweepExpiredPhoneRentals({ batchSize: 2, concurrency: 2 });

		expect(prismaMock.phoneRental.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					OR: expect.arrayContaining([
						expect.objectContaining({
							status: 'pending',
							OR: [{ nextRentAttemptAt: null }, { nextRentAttemptAt: { lte: expect.any(Date) } }]
						}),
						expect.objectContaining({ status: 'awaiting_sms' })
					])
				},
				orderBy: [{ createdAt: 'asc' }, { orderItemId: 'asc' }],
				take: 3
			})
		);
		expect(pollMock.mock.calls.map(([id]) => id)).toEqual(['oldest', 'second']);
		expect(peak).toBeLessThanOrEqual(2);
		expect(result).toMatchObject({ processed: 2, resolved: 2, hasDeferredWork: true });
	});

	it('alerts and fails the automation run when a stale lease remains unresolved', async () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([
			row('stale-rent', {
				status: 'renting',
				rentLeaseExpiresAt: new Date(Date.now() - 60_000)
			})
		]);
		pollMock.mockResolvedValue({ status: 'preparing' });

		await expect(sweepExpiredPhoneRentals({ batchSize: 2, concurrency: 1 })).rejects.toThrow(
			'1 stale unresolved'
		);
		expect(alertMock).toHaveBeenCalledWith(
			expect.objectContaining({
				source: 'phone.sweep',
				message: expect.stringContaining('stale-rent')
			})
		);
	});

	it('alerts and fails instead of swallowing a worker exception', async () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([row('broken')]);
		pollMock.mockRejectedValue(new Error('provider transport failed'));

		await expect(sweepExpiredPhoneRentals({ batchSize: 1, concurrency: 1 })).rejects.toThrow(
			'1 errors'
		);
		expect(alertMock).toHaveBeenCalledOnce();
	});
});
