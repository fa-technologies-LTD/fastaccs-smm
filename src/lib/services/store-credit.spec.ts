import { describe, expect, it, vi } from 'vitest';
import {
	creditStoreCredit,
	computeOrderRedemption,
	EARNED_REDEMPTION_CAP_PERCENT,
	getStoreCreditBuckets,
	redemptionExceedsAvailable
} from './store-credit';

describe('computeOrderRedemption', () => {
	it('applies refund credit first, uncapped up to the order total', () => {
		// ₦10k order, ₦10k refund credit → refund covers it all, no earned needed.
		expect(computeOrderRedemption(10000, { refundAvailable: 10000, earnedAvailable: 5000 })).toEqual({
			refundApplied: 10000,
			earnedApplied: 0,
			totalApplied: 10000
		});
	});

	it('caps earned/gifted credit at 30% of the order', () => {
		// ₦10k order, no refund, ₦5k earned → earned capped at ₦3,000 (30%).
		expect(computeOrderRedemption(10000, { refundAvailable: 0, earnedAvailable: 5000 })).toEqual({
			refundApplied: 0,
			earnedApplied: 3000,
			totalApplied: 3000
		});
	});

	it('combines refund (free) then earned (capped) without exceeding the order', () => {
		// ₦10k order, ₦4k refund + ₦5k earned → refund ₦4k, remaining ₦6k, earned capped ₦3k.
		expect(computeOrderRedemption(10000, { refundAvailable: 4000, earnedAvailable: 5000 })).toEqual({
			refundApplied: 4000,
			earnedApplied: 3000,
			totalApplied: 7000
		});
	});

	it('never applies more than the order total (refund covers everything)', () => {
		// ₦2k order, ₦9k refund → only ₦2k applied.
		expect(computeOrderRedemption(2000, { refundAvailable: 9000, earnedAvailable: 9000 })).toEqual({
			refundApplied: 2000,
			earnedApplied: 0,
			totalApplied: 2000
		});
	});

	it('earned is bounded by the remainder after refund, not just the 30% cap', () => {
		// ₦10k order, ₦8k refund → remaining ₦2k; earned cap is ₦3k but only ₦2k remains.
		expect(computeOrderRedemption(10000, { refundAvailable: 8000, earnedAvailable: 9000 })).toEqual({
			refundApplied: 8000,
			earnedApplied: 2000,
			totalApplied: 10000
		});
	});

	it('uses only what earned credit the user actually has (under the cap)', () => {
		// ₦10k order, ₦1k earned only → applies ₦1k (below the ₦3k cap).
		expect(computeOrderRedemption(10000, { refundAvailable: 0, earnedAvailable: 1000 })).toEqual({
			refundApplied: 0,
			earnedApplied: 1000,
			totalApplied: 1000
		});
	});

	it('handles zero / no-credit gracefully', () => {
		expect(computeOrderRedemption(0, { refundAvailable: 5000, earnedAvailable: 5000 })).toEqual({
			refundApplied: 0,
			earnedApplied: 0,
			totalApplied: 0
		});
		expect(computeOrderRedemption(5000, { refundAvailable: 0, earnedAvailable: 0 })).toEqual({
			refundApplied: 0,
			earnedApplied: 0,
			totalApplied: 0
		});
	});

	it('floors the 30% cap to whole naira', () => {
		// ₦1,999 order → 30% = 599.7 → floored to ₦599.
		const r = computeOrderRedemption(1999, { refundAvailable: 0, earnedAvailable: 9000 });
		expect(r.earnedApplied).toBe(Math.floor(1999 * EARNED_REDEMPTION_CAP_PERCENT));
		expect(r.earnedApplied).toBe(599);
	});

	it('respects a custom cap percent', () => {
		expect(
			computeOrderRedemption(10000, { refundAvailable: 0, earnedAvailable: 9000 }, { earnedCapPercent: 0.5 })
		).toEqual({ refundApplied: 0, earnedApplied: 5000, totalApplied: 5000 });
	});
});

/**
 * The concurrency guard (F1): under a wallet row-lock we re-check the redemption against the
 * live buckets, so a second simultaneous checkout that would over-spend is refused. This tests
 * that per-bucket rule directly.
 */
describe('redemptionExceedsAvailable', () => {
	it('allows a redemption that exactly matches the available buckets', () => {
		expect(
			redemptionExceedsAvailable(
				{ refundApplied: 1000, earnedApplied: 500 },
				{ refundAvailable: 1000, earnedAvailable: 500 }
			)
		).toBe(false);
	});
	it('refuses when the refund bucket is over-spent', () => {
		expect(
			redemptionExceedsAvailable(
				{ refundApplied: 1500, earnedApplied: 0 },
				{ refundAvailable: 1000, earnedAvailable: 0 }
			)
		).toBe(true);
	});
	it('refuses when the earned bucket is over-spent even if the total looks fine', () => {
		// A naive total-only check (800 ≤ 5000+500) would pass; the per-bucket rule catches it.
		expect(
			redemptionExceedsAvailable(
				{ refundApplied: 0, earnedApplied: 800 },
				{ refundAvailable: 5000, earnedAvailable: 500 }
			)
		).toBe(true);
	});
	it('models the race: a second checkout after the first drained the balance is refused', () => {
		// Balance was 5000 when this order computed a 3000 redemption; a concurrent order already
		// spent it down to 2000 before we acquired the lock → refuse rather than leak 1000.
		expect(
			redemptionExceedsAvailable(
				{ refundApplied: 3000, earnedApplied: 0 },
				{ refundAvailable: 2000, earnedAvailable: 0 }
			)
		).toBe(true);
	});
	it('tolerates a sub-naira rounding difference', () => {
		expect(
			redemptionExceedsAvailable(
				{ refundApplied: 1000.4, earnedApplied: 0 },
				{ refundAvailable: 1000, earnedAvailable: 0 }
			)
		).toBe(false);
	});
});

describe('store-credit ledger safeguards', () => {
	it('re-reads the wallet balance after acquiring the row lock before crediting', async () => {
		const tx = {
			wallet: {
				upsert: vi.fn().mockResolvedValue({ id: 'wallet-1', balance: 100 }),
				findUnique: vi.fn().mockResolvedValue({ balance: 250 }),
				update: vi.fn().mockResolvedValue({})
			},
			walletTransaction: {
				findUnique: vi.fn().mockResolvedValue(null),
				create: vi.fn().mockResolvedValue({})
			},
			$queryRaw: vi.fn().mockResolvedValue([])
		};

		await creditStoreCredit(tx as never, {
			userId: '11111111-1111-4111-8111-111111111111',
			amount: 100,
			type: 'store_credit_refund',
			description: 'Refund',
			reference: 'order-1'
		});

		expect(tx.$queryRaw).toHaveBeenCalledOnce();
		expect(tx.wallet.update).toHaveBeenCalledWith({
			where: { id: 'wallet-1' },
			data: { balance: 350 }
		});
		expect(tx.walletTransaction.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ balanceBefore: 250, balanceAfter: 350 })
			})
		);
	});

	it('treats an exact referenced credit replay as success without adding money twice', async () => {
		const tx = {
			wallet: {
				upsert: vi.fn().mockResolvedValue({ id: 'wallet-1', balance: 350 }),
				findUnique: vi.fn(),
				update: vi.fn()
			},
			walletTransaction: {
				findUnique: vi.fn().mockResolvedValue({
					userId: '11111111-1111-4111-8111-111111111111',
					type: 'store_credit_refund',
					amount: 100
				}),
				create: vi.fn()
			},
			$queryRaw: vi.fn().mockResolvedValue([])
		};

		await creditStoreCredit(tx as never, {
			userId: '11111111-1111-4111-8111-111111111111',
			amount: 100,
			type: 'store_credit_refund',
			description: 'Refund replay',
			reference: 'order-1'
		});

		expect(tx.wallet.update).not.toHaveBeenCalled();
		expect(tx.walletTransaction.create).not.toHaveBeenCalled();
	});

	it('keeps an affiliate payout reserved while it is under admin review', async () => {
		const db = {
			walletTransaction: {
				groupBy: vi.fn().mockResolvedValue([
					{ type: 'affiliate_credit', status: 'available', _sum: { amount: 1000 } },
					{ type: 'affiliate_payout', status: 'under_review', _sum: { amount: 700 } }
				])
			}
		};

		await expect(
			getStoreCreditBuckets('11111111-1111-4111-8111-111111111111', db as never)
		).resolves.toEqual({ earnedAvailable: 300, refundAvailable: 0, totalAvailable: 300 });
	});
});
