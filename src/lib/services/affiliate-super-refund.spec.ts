import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	countActivations: vi.fn(),
	findActivation: vi.fn(),
	findOrders: vi.fn(),
	findSettings: vi.fn(),
	transaction: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	wallet: { findUnique: vi.fn(), update: vi.fn() },
	walletTransaction: {
		findMany: vi.fn(),
		update: vi.fn(),
		updateMany: vi.fn(),
		create: vi.fn()
	},
	affiliateEvent: { create: vi.fn() },
	notification: { create: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		walletTransaction: { count: mocks.countActivations, findUnique: mocks.findActivation },
		order: { findMany: mocks.findOrders },
		microcopy: { findMany: mocks.findSettings },
		$transaction: mocks.transaction
	}
}));
vi.mock('$lib/services/email', () => ({ sendEmail: vi.fn(), sendMarketingEmail: vi.fn() }));
vi.mock('$lib/services/affiliate-notification-email', () => ({
	sendAffiliateUnlockEmailIfNeeded: vi.fn(),
	sendFirstStoreCreditEmailIfNeeded: vi.fn()
}));
vi.mock('$lib/services/affiliate-payout-email', () => ({
	sendAffiliatePayoutStatusEmailIfNeeded: vi.fn()
}));
vi.mock('$lib/services/admin-settings', () => ({ getOperationalAlertRecipients: vi.fn() }));

import {
	maybeVoidSuperActivationOnRefund,
	reconcileSuperMonthlyBonusAfterActivationReversal
} from './affiliate';

const TIERS = [
	{ count: 10, amount: 3_000 },
	{ count: 20, amount: 8_000 },
	{ count: 30, amount: 15_000 }
];
const MONTH = new Date('2026-08-12T10:00:00.000Z');

beforeEach(() => {
	vi.clearAllMocks();
	mocks.countActivations.mockResolvedValue(19);
	mocks.findActivation.mockResolvedValue(null);
	mocks.findOrders.mockResolvedValue([]);
	mocks.findSettings.mockResolvedValue([]);
	tx.$queryRaw.mockResolvedValue([]);
	tx.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', balance: 10_000 });
	tx.wallet.update.mockResolvedValue({});
	tx.walletTransaction.update.mockResolvedValue({});
	tx.walletTransaction.updateMany.mockResolvedValue({ count: 0 });
	tx.walletTransaction.create.mockResolvedValue({});
	tx.affiliateEvent.create.mockResolvedValue({});
	tx.notification.create.mockResolvedValue({});
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
});

describe('super monthly bonus refund reconciliation', () => {
	it('reverses a historical Super activation even after the affiliate is later demoted', async () => {
		mocks.findActivation.mockResolvedValue({
			id: 'activation-1',
			amount: 700,
			status: 'pending',
			createdAt: MONTH,
			metadata: {
				activationSpendThreshold: 3_500,
				activationOrderThreshold: 3,
				monthlyTiers: TIERS
			}
		});
		tx.walletTransaction.updateMany.mockResolvedValue({ count: 1 });
		tx.wallet.findUnique.mockResolvedValue(null);

		await maybeVoidSuperActivationOnRefund({
			userId: 'buyer-1',
			affiliateUserId: 'affiliate-1'
		});

		expect(tx.walletTransaction.updateMany).toHaveBeenCalledWith({
			where: { id: 'activation-1', status: 'pending' },
			data: { status: 'reversed' }
		});
	});

	it('removes only the incremental 20-activation row and preserves the earned ₦3,000 total', async () => {
		tx.walletTransaction.findMany
			.mockResolvedValueOnce([
				{
					id: 'tier-10',
					amount: 3_000,
					status: 'pending',
					metadata: { tierCount: 10 },
					createdAt: new Date('2026-08-10T00:00:00.000Z')
				},
				{
					id: 'tier-20',
					amount: 5_000,
					status: 'pending',
					metadata: { tierCount: 20 },
					createdAt: new Date('2026-08-20T00:00:00.000Z')
				}
			])
			.mockResolvedValueOnce([]);

		await reconcileSuperMonthlyBonusAfterActivationReversal(
			'affiliate-1',
			MONTH,
			'activation-20',
			TIERS
		);

		expect(mocks.countActivations).toHaveBeenCalledWith({
			where: expect.objectContaining({
				status: { notIn: ['reversed', 'failed', 'cancelled'] },
				NOT: { metadata: { path: ['suspectedSelfReferral'], equals: true } }
			})
		});
		expect(tx.walletTransaction.update).toHaveBeenCalledOnce();
		expect(tx.walletTransaction.update).toHaveBeenCalledWith({
			where: { id: 'tier-20' },
			data: { status: 'reversed' }
		});
		expect(tx.walletTransaction.create).not.toHaveBeenCalled();
		expect(tx.wallet.update).not.toHaveBeenCalled();
	});

	it('resizes a direct pending ₦8,000 award to the still-earned ₦3,000 tier', async () => {
		tx.walletTransaction.findMany
			.mockResolvedValueOnce([
				{
					id: 'direct-tier-20',
					amount: 8_000,
					status: 'pending',
					metadata: { tierCount: 20, tierTotalAmount: 8_000 },
					createdAt: new Date('2026-08-20T00:00:00.000Z')
				}
			])
			.mockResolvedValueOnce([]);

		await reconcileSuperMonthlyBonusAfterActivationReversal(
			'affiliate-1',
			MONTH,
			'activation-direct',
			TIERS
		);

		expect(tx.walletTransaction.update).toHaveBeenCalledWith({
			where: { id: 'direct-tier-20' },
			data: expect.objectContaining({
				amount: 3_000,
				metadata: expect.objectContaining({ tierCount: 10, tierTotalAmount: 3_000 })
			})
		});
		expect(tx.walletTransaction.create).not.toHaveBeenCalled();
	});

	it('records the full vested adjustment even when only part is recoverable immediately', async () => {
		tx.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', balance: 1_000 });
		tx.walletTransaction.findMany
			.mockResolvedValueOnce([
				{
					id: 'available-tier-20',
					amount: 8_000,
					status: 'available',
					metadata: { tierCount: 20 },
					createdAt: new Date('2026-08-20T00:00:00.000Z')
				}
			])
			.mockResolvedValueOnce([]);

		await reconcileSuperMonthlyBonusAfterActivationReversal(
			'affiliate-1',
			MONTH,
			'activation-available',
			TIERS
		);

		expect(tx.wallet.update).toHaveBeenCalledWith({
			where: { id: 'wallet-1' },
			data: { balance: 0 }
		});
		expect(tx.walletTransaction.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				type: 'affiliate_credit_adjustment',
				amount: 5_000,
				balanceBefore: 1_000,
				balanceAfter: 0,
				metadata: expect.objectContaining({
					recoveredAdjustmentAmount: 1_000,
					unrecoveredAdjustmentAmount: 4_000,
					validTierTotal: 3_000
				})
			})
		});
	});
});
