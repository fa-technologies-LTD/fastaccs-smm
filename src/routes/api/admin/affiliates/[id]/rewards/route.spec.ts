import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	audit: vi.fn(),
	recordEvent: vi.fn(),
	reconcileSuperMonthly: vi.fn(),
	transaction: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	walletTransaction: { findFirst: vi.fn(), update: vi.fn() },
	notification: { create: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/services/admin-audit', () => ({ createAdminAuditLog: mocks.audit }));
vi.mock('$lib/services/affiliate-events', () => ({ recordAffiliateEvent: mocks.recordEvent }));
vi.mock('$lib/services/affiliate', () => ({
	reconcileSuperMonthlyTierForActivation: mocks.reconcileSuperMonthly
}));

import { POST } from './+server';

const AFFILIATE_ID = '11111111-1111-4111-8111-111111111111';
const REWARD_ID = '22222222-2222-4222-8222-222222222222';

function callReward(action: string, extra: Record<string, unknown> = {}, permitted = true) {
	mocks.hasPermission.mockReturnValue(permitted);
	return POST({
		locals: { user: { id: '33333333-3333-4333-8333-333333333333' }, adminContext: {} },
		params: { id: AFFILIATE_ID },
		request: new Request('https://smm.fastaccs.com/api/admin/affiliates/rewards', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ transactionId: REWARD_ID, action, ...extra })
		})
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	mocks.audit.mockResolvedValue(undefined);
	mocks.recordEvent.mockResolvedValue(true);
	mocks.reconcileSuperMonthly.mockResolvedValue(undefined);
	tx.$queryRaw.mockResolvedValue([]);
	tx.walletTransaction.findFirst.mockResolvedValue({
		id: REWARD_ID,
		status: 'pending',
		amount: 1_000,
		metadata: { suspectedSelfReferral: true, orderId: '44444444-4444-4444-8444-444444444444' },
		createdAt: new Date('2026-08-15T00:00:00.000Z')
	});
	tx.walletTransaction.update.mockResolvedValue({
		id: REWARD_ID,
		status: 'pending',
		amount: 1_000
	});
	tx.notification.create.mockResolvedValue({ id: 'notice-1' });
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
});

describe('flagged affiliate reward review', () => {
	it('requires affiliate-management permission', async () => {
		const response = await callReward('approve', {}, false);
		expect(response.status).toBe(401);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('approves only a flagged pending reward under a row lock', async () => {
		const response = await callReward('approve');
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.reward.status).toBe('pending');
		expect(tx.$queryRaw).toHaveBeenCalledOnce();
		expect(tx.walletTransaction.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'pending',
					metadata: expect.objectContaining({ suspectedSelfReferral: false })
				})
			})
		);
		expect(mocks.recordEvent).toHaveBeenCalledOnce();
		expect(mocks.audit).toHaveBeenCalledOnce();
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'affiliate_reward_identity_approve', required: true }),
			tx
		);
	});

	it('requires a reason and cancels no wallet money when rejecting a pending reward', async () => {
		const missingReason = await callReward('reject');
		expect(missingReason.status).toBe(400);

		tx.walletTransaction.update.mockResolvedValue({
			id: REWARD_ID,
			status: 'reversed',
			amount: 1_000
		});
		const response = await callReward('reject', { reason: 'Shared identity was confirmed' });
		expect(response.status).toBe(200);
		expect(tx.walletTransaction.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ status: 'reversed' }) })
		);
	});

	it('repairs the monthly tier after approving a flagged Super activation', async () => {
		tx.walletTransaction.findFirst.mockResolvedValue({
			id: REWARD_ID,
			status: 'pending',
			amount: 700,
			metadata: {
				kind: 'super_activation',
				suspectedSelfReferral: true,
				referredUserId: '55555555-5555-4555-8555-555555555555'
			},
			createdAt: new Date('2026-08-15T00:00:00.000Z')
		});

		const response = await callReward('approve');
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.monthlyTierReconciliationPending).toBe(false);
		expect(mocks.reconcileSuperMonthly).toHaveBeenCalledWith(
			AFFILIATE_ID,
			new Date('2026-08-15T00:00:00.000Z')
		);
	});

	it('refuses to touch a reward that is no longer flagged and pending', async () => {
		tx.walletTransaction.findFirst.mockResolvedValue({
			id: REWARD_ID,
			status: 'available',
			amount: 1_000,
			metadata: { suspectedSelfReferral: true }
		});

		const response = await callReward('reject', { reason: 'Mismatch' });
		expect(response.status).toBe(409);
		expect(tx.walletTransaction.update).not.toHaveBeenCalled();
		expect(tx.notification.create).not.toHaveBeenCalled();
	});
});
