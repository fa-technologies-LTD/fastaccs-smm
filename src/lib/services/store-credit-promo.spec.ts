import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

/**
 * In-memory ledger with just enough of Prisma's walletTransaction/wallet/order API to run the
 * promo wallet end to end (grant → spend → refund → expiry) without a database.
 */
type Row = Record<string, unknown> & {
	id: string;
	userId: string;
	type: string;
	amount: number;
	status: string;
	reference: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
};

const state = vi.hoisted(() => ({
	rows: [] as Row[],
	wallets: new Map<string, { id: string; userId: string; balance: number }>(),
	orders: new Map<string, { totalAmount: number }>(),
	clock: 0
}));

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
	for (const [key, cond] of Object.entries(where)) {
		const value = row[key];
		if (key === 'metadata') {
			const { path, equals } = cond as { path: string[]; equals: unknown };
			if ((row.metadata ?? {})[path[0]] !== equals) return false;
			continue;
		}
		if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
			const c = cond as Record<string, unknown>;
			if ('in' in c && !(c.in as unknown[]).includes(value)) return false;
			if ('notIn' in c && (c.notIn as unknown[]).includes(value)) return false;
			if ('startsWith' in c && !String(value ?? '').startsWith(String(c.startsWith))) return false;
			continue;
		}
		if (value !== cond) return false;
	}
	return true;
}

const db = vi.hoisted(() => ({}) as Record<string, unknown>);

function buildDb() {
	return {
		$queryRaw: async () => [],
		wallet: {
			upsert: async ({ where }: { where: { userId: string } }) => {
				const existing = state.wallets.get(where.userId);
				if (existing) return existing;
				const wallet = { id: `w-${where.userId}`, userId: where.userId, balance: 0 };
				state.wallets.set(where.userId, wallet);
				return wallet;
			},
			findUnique: async ({ where }: { where: { userId?: string; id?: string } }) =>
				[...state.wallets.values()].find(
					(w) => (where.userId && w.userId === where.userId) || (where.id && w.id === where.id)
				) ?? null,
			update: async ({ where, data }: { where: { id: string }; data: { balance: number } }) => {
				const wallet = [...state.wallets.values()].find((w) => w.id === where.id)!;
				wallet.balance = data.balance;
				return wallet;
			}
		},
		order: {
			findUnique: async ({ where }: { where: { id: string } }) => state.orders.get(where.id) ?? null
		},
		walletTransaction: {
			findUnique: async ({ where }: { where: { reference?: string; id?: string } }) =>
				state.rows.find(
					(r) =>
						(where.reference && r.reference === where.reference) || (where.id && r.id === where.id)
				) ?? null,
			findMany: async ({ where }: { where: Record<string, unknown> }) =>
				state.rows.filter((r) => matches(r, where)),
			create: async ({ data }: { data: Partial<Row> }) => {
				if (data.reference && state.rows.some((r) => r.reference === data.reference)) {
					throw Object.assign(new Error('unique'), { code: 'P2002' });
				}
				const row = {
					id: randomUUID(),
					createdAt: new Date(Date.now() + ++state.clock),
					metadata: null,
					reference: null,
					...data,
					amount: Number(data.amount)
				} as Row;
				state.rows.push(row);
				return row;
			},
			updateMany: async ({
				where,
				data
			}: {
				where: Record<string, unknown>;
				data: Partial<Row>;
			}) => {
				const hits = state.rows.filter((r) => matches(r, where));
				for (const r of hits) Object.assign(r, data);
				return { count: hits.length };
			},
			aggregate: async ({ where }: { where: Record<string, unknown> }) => ({
				_sum: {
					amount: state.rows.filter((r) => matches(r, where)).reduce((s, r) => s + r.amount, 0)
				}
			}),
			groupBy: async ({ where }: { by: string[]; where: Record<string, unknown> }) => {
				const groups = new Map<
					string,
					{ userId: string; type: string; status: string; sum: number }
				>();
				for (const r of state.rows.filter((row) => matches(row, where))) {
					const key = `${r.userId}|${r.type}|${r.status}`;
					const g = groups.get(key) ?? { userId: r.userId, type: r.type, status: r.status, sum: 0 };
					g.sum += r.amount;
					groups.set(key, g);
				}
				return [...groups.values()].map((g) => ({ ...g, _sum: { amount: g.sum } }));
			}
		}
	};
}

vi.mock('$lib/prisma', () => ({ prisma: db }));

import {
	closePromoLot,
	computeOrderRedemption,
	creditPromoCredit,
	creditStoreCredit,
	getStoreCreditBuckets,
	getStoreCreditHistory,
	getTotalStoreCreditLiability,
	redeemStoreCreditForOrder,
	restoreStoreCreditRedemptionForLatePayment,
	reverseStoreCreditRedemption,
	SC_CREDIT_PROMO,
	SC_PROMO_EXPIRY,
	SC_PROMO_REVERSAL
} from './store-credit';

const USER = '11111111-1111-4111-8111-111111111111';
const EXPIRES = new Date('2026-12-01T00:00:00.000Z');
const tx = () => db as never;

async function grant(
	reference: string,
	amount = 1_000,
	campaign = 'refer_win',
	expiresAt = EXPIRES
) {
	return creditPromoCredit(tx(), {
		userId: USER,
		amount,
		campaign,
		expiresAt,
		description: `Refer & Win credit · expires 1 Dec 2026`,
		reference
	});
}

async function payOrder(orderId: string, total: number) {
	state.orders.set(orderId, { totalAmount: total });
	const redemption = computeOrderRedemption(total, await getStoreCreditBuckets(USER));
	await redeemStoreCreditForOrder(tx(), {
		userId: USER,
		orderId,
		orderNumber: orderId.toUpperCase(),
		redemption,
		orderTotal: total
	});
	return redemption;
}

async function refund(orderId: string, amount: number, reference: string) {
	await creditStoreCredit(tx(), {
		userId: USER,
		amount,
		type: 'store_credit_refund',
		description: `Refund for order ${orderId}`,
		reference,
		metadata: { orderId }
	});
}

beforeEach(() => {
	state.rows = [];
	state.wallets = new Map();
	state.orders = new Map();
	state.clock = 0;
	Object.assign(db, buildDb());
});

describe('promo wallet ledger', () => {
	it('grants promo credit once per reference and shows it with its expiry', async () => {
		expect(await grant('rw:1')).toBe(true);
		expect(await grant('rw:1')).toBe(false);
		const buckets = await getStoreCreditBuckets(USER);
		expect(buckets).toMatchObject({
			promoAvailable: 1_000,
			totalAvailable: 1_000,
			promo: [{ campaign: 'refer_win', available: 1_000, nextExpiresAt: EXPIRES.toISOString() }]
		});
		expect(state.wallets.get(USER)!.balance).toBe(1_000);
	});

	it('spends promo credit at checkout against named lots and reduces the balance', async () => {
		await grant('rw:1', 3_000);
		const redemption = await payOrder('order-a', 5_000);
		expect(redemption.promoApplied).toBe(2_500);
		const debit = state.rows.find((r) => r.reference === 'order-a:promo')!;
		expect(debit.metadata).toMatchObject({ bucket: 'promo', lots: [{ amount: 2_500 }] });
		expect((await getStoreCreditBuckets(USER)).promoAvailable).toBe(500);
	});

	it('refuses a checkout that would spend promo credit twice', async () => {
		await grant('rw:1', 1_000);
		const stale = computeOrderRedemption(4_000, await getStoreCreditBuckets(USER));
		await redeemStoreCreditForOrder(tx(), {
			userId: USER,
			orderId: 'order-a',
			orderNumber: 'A',
			redemption: stale,
			orderTotal: 4_000
		});
		await expect(
			redeemStoreCreditForOrder(tx(), {
				userId: USER,
				orderId: 'order-b',
				orderNumber: 'B',
				redemption: stale,
				orderTotal: 4_000
			})
		).rejects.toThrow('INSUFFICIENT_STORE_CREDIT');
	});

	it('returns the promo-paid part of a full refund as promo credit with the original expiry', async () => {
		await grant('rw:1', 2_500);
		await payOrder('order-a', 5_000); // ₦2,500 promo + ₦2,500 cash
		await refund('order-a', 5_000, 'order-a');
		const buckets = await getStoreCreditBuckets(USER);
		expect(buckets.refundAvailable).toBe(2_500);
		expect(buckets.promoAvailable).toBe(2_500);
		expect(buckets.promo[0].nextExpiresAt).toBe(EXPIRES.toISOString());
		// Wallet total = the ₦5,000 refund; nothing created or lost by the move.
		expect(state.wallets.get(USER)!.balance).toBe(5_000);
	});

	it('splits partial refunds by the promo share and never returns more than was spent', async () => {
		await grant('rw:1', 2_500);
		await payOrder('order-a', 5_000);
		await refund('order-a', 1_000, 'acct-1');
		expect((await getStoreCreditBuckets(USER)).promoAvailable).toBe(500);
		expect((await getStoreCreditBuckets(USER)).refundAvailable).toBe(500);
		await refund('order-a', 4_000, 'order-a');
		await refund('order-a', 4_000, 'order-a'); // replay
		const buckets = await getStoreCreditBuckets(USER);
		expect(buckets.promoAvailable).toBe(2_500);
		expect(buckets.refundAvailable).toBe(2_500);
	});

	it('does not revive promo credit whose original expiry has passed', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date('2026-10-30T10:00:00.000Z'));
			await grant('rw:1', 1_000, 'refer_win', new Date('2026-11-02T00:00:00.000Z'));
			await payOrder('order-a', 2_000);
			vi.setSystemTime(new Date('2026-11-05T10:00:00.000Z'));
			await refund('order-a', 2_000, 'order-a');
			const buckets = await getStoreCreditBuckets(USER);
			expect(buckets.promoAvailable).toBe(0);
			expect(buckets.refundAvailable).toBe(1_000);
		} finally {
			vi.useRealTimers();
		}
	});

	it('gives promo credit back when the payment for that order fails', async () => {
		await grant('rw:1', 1_000);
		await payOrder('order-a', 2_000);
		expect((await getStoreCreditBuckets(USER)).promoAvailable).toBe(0);
		await reverseStoreCreditRedemption(tx(), { userId: USER, orderId: 'order-a' });
		expect((await getStoreCreditBuckets(USER)).promoAvailable).toBe(1_000);
	});

	it('re-reserves promo credit for a late payment only if the same credit is still there', async () => {
		await grant('rw:1', 1_000);
		await payOrder('order-a', 2_000);
		await reverseStoreCreditRedemption(tx(), { userId: USER, orderId: 'order-a' });
		await payOrder('order-b', 2_000); // the restored ₦1,000 is spent on another order
		await expect(
			restoreStoreCreditRedemptionForLatePayment(tx(), {
				userId: USER,
				orderId: 'order-a',
				expectedAmount: 1_000
			})
		).rejects.toThrow('STORE_CREDIT_LATE_PAYMENT_INSUFFICIENT');
	});

	it('reverses only the unspent part of a grant and reports what was already spent', async () => {
		await grant('rw:1', 1_000);
		await payOrder('order-a', 1_200); // ₦600 promo used
		const lotId = state.rows.find((r) => r.type === SC_CREDIT_PROMO)!.id;
		const result = await closePromoLot(tx(), {
			userId: USER,
			lotId,
			type: SC_PROMO_REVERSAL,
			description: 'Refer & Win credit removed: the qualifying order was refunded',
			reference: `promo:reversal:${lotId}`
		});
		expect(result).toEqual({ closed: 400, alreadySpent: 600 });
		expect((await getStoreCreditBuckets(USER)).promoAvailable).toBe(0);
	});

	it('expires only lots that are past their date, once', async () => {
		await grant('rw:1', 1_000);
		const lotId = state.rows.find((r) => r.type === SC_CREDIT_PROMO)!.id;
		const close = (now: Date) =>
			closePromoLot(tx(), {
				userId: USER,
				lotId,
				type: SC_PROMO_EXPIRY,
				description: 'Promo credit expired',
				reference: `promo:expiry:${lotId}`,
				requireExpired: true,
				now
			});
		expect(await close(new Date('2026-11-20T00:00:00.000Z'))).toEqual({
			closed: 0,
			alreadySpent: 0
		});
		expect(await close(new Date('2026-12-02T00:00:00.000Z'))).toEqual({
			closed: 1_000,
			alreadySpent: 0
		});
		expect(await close(new Date('2026-12-03T00:00:00.000Z'))).toEqual({
			closed: 0,
			alreadySpent: 0
		});
		expect(state.wallets.get(USER)!.balance).toBe(0);
	});

	it('counts unspent promo credit in what we owe customers', async () => {
		await grant('rw:1', 1_000);
		await grant('bs:1', 3_000, 'bigspender');
		await payOrder('order-a', 2_000); // ₦1,000 promo used
		expect(await getTotalStoreCreditLiability()).toBe(3_000);
	});

	it('labels promo rows in the customer history', async () => {
		await grant('rw:1', 1_000);
		await payOrder('order-a', 2_000);
		const history = await getStoreCreditHistory(USER);
		expect(history.map((entry) => [entry.category, entry.delta])).toEqual(
			expect.arrayContaining([
				['Promo credit', 1_000],
				['Spent', -1_000]
			])
		);
	});
});
