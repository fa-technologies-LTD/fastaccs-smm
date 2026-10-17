import { describe, expect, it } from 'vitest';
import {
	allocatePromoSpend,
	computePromoLotBalances,
	promoAvailable,
	promoBalancesByCampaign,
	promoCapAmount,
	promoSpendableForOrder,
	type PromoLot
} from './promo-credit';
import { computeOrderRedemption } from './store-credit-redemption';

const day = 86_400_000;
const now = new Date('2026-11-10T12:00:00.000Z');
const lot = (id: string, campaign: string, amount: number, expiresInDays: number): PromoLot => ({
	id,
	campaign,
	amount,
	createdAt: new Date(now.getTime() - 5 * day),
	expiresAt: new Date(now.getTime() + expiresInDays * day)
});

describe('promo credit lots', () => {
	it('spends the earliest-expiring credit first and ignores expired credit', () => {
		const balances = computePromoLotBalances(
			[
				lot('late', 'bigspender', 3_000, 20),
				lot('soon', 'refer_win', 1_000, 2),
				lot('old', 'refer_win', 1_000, -1)
			],
			[{ amount: 1_500, createdAt: now }],
			now
		);
		const byId = Object.fromEntries(balances.map((entry) => [entry.id, entry]));
		expect(byId.soon.remaining).toBe(0);
		expect(byId.late.remaining).toBe(2_500);
		expect(byId.old.expired).toBe(true);
		expect(promoAvailable(balances)).toBe(2_500);
		expect(promoBalancesByCampaign(balances)).toEqual([
			{ campaign: 'bigspender', available: 2_500, nextExpiresAt: byId.late.expiresAt.toISOString() }
		]);
	});

	it('applies spend recorded against named lots exactly', () => {
		const balances = computePromoLotBalances(
			[lot('a', 'refer_win', 1_000, 5), lot('b', 'refer_win', 1_000, 10)],
			[{ amount: 600, createdAt: now, lots: [{ lotId: 'b', amount: 600 }] }],
			now
		);
		expect(balances.map((entry) => entry.remaining)).toEqual([1_000, 400]);
	});

	it('closes one lot by id (expiry or reversal)', () => {
		const balances = computePromoLotBalances(
			[lot('a', 'refer_win', 1_000, 5)],
			[{ amount: 1_000, createdAt: now, lotId: 'a' }],
			now
		);
		expect(balances[0].remaining).toBe(0);
	});
});

describe('promo credit at checkout', () => {
	it('caps promo credit at 50% of the order after discounts', () => {
		expect(promoCapAmount(5_000, 50)).toBe(2_500);
		expect(
			computeOrderRedemption(5_000, {
				earnedAvailable: 0,
				refundAvailable: 0,
				promo: [{ campaign: 'refer_win', available: 3_000 }]
			})
		).toEqual({ refundApplied: 0, earnedApplied: 0, promoApplied: 2_500, totalApplied: 2_500 });
	});

	it('uses promo first, then refund credit, then earned credit within its 30% cap', () => {
		expect(
			computeOrderRedemption(10_000, {
				earnedAvailable: 5_000,
				refundAvailable: 1_000,
				promo: [{ campaign: 'bigspender', available: 3_000 }]
			})
		).toEqual({
			refundApplied: 1_000,
			earnedApplied: 3_000,
			promoApplied: 3_000,
			totalApplied: 7_000
		});
	});

	it('keeps the old result exactly when the buyer has no promo credit', () => {
		expect(computeOrderRedemption(10_000, { earnedAvailable: 5_000, refundAvailable: 0 })).toEqual({
			refundApplied: 0,
			earnedApplied: 3_000,
			totalApplied: 3_000
		});
	});

	it('holds each campaign to its own cap, and all promo together to the highest cap', () => {
		const promo = [
			{ campaign: 'refer_win', available: 3_000 },
			{ campaign: 'bigspender', available: 3_000 }
		];
		// ₦4,000 order: refer_win may pay ₦1,200 (30%), bigspender ₦2,000 (50%); together ≤ ₦2,000.
		expect(promoSpendableForOrder(4_000, promo, { refer_win: 30, bigspender: 50 })).toBe(2_000);
		// ₦20,000 order: ₦3,000 + ₦3,000 fits inside both caps.
		expect(promoSpendableForOrder(20_000, promo, { refer_win: 30, bigspender: 50 })).toBe(6_000);
		// Unknown campaigns fall back to the 50% default.
		expect(promoSpendableForOrder(1_000, [{ campaign: 'other', available: 900 }])).toBe(500);
	});

	it('allocates lots within each campaign cap so the server matches the preview', () => {
		const balances = computePromoLotBalances(
			[lot('rw', 'refer_win', 3_000, 2), lot('bs', 'bigspender', 3_000, 20)],
			[],
			now
		);
		expect(
			allocatePromoSpend(balances, 2_000, {
				orderTotal: 4_000,
				caps: { refer_win: 30, bigspender: 50 }
			})
		).toEqual([
			{ lotId: 'rw', amount: 1_200 },
			{ lotId: 'bs', amount: 800 }
		]);
	});
});
