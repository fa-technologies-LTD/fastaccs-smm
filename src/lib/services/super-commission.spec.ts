import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	switchover: null as Date | null,
	findUnique: vi.fn(),
	create: vi.fn(),
	upsert: vi.fn(),
	risk: vi.fn(),
	event: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		walletTransaction: { findUnique: mocks.findUnique },
		$transaction: (fn: (tx: unknown) => unknown) =>
			fn({ wallet: { upsert: mocks.upsert }, walletTransaction: { create: mocks.create } })
	}
}));
vi.mock('$lib/services/super-affiliate-terms', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/services/super-affiliate-terms')>()),
	getSuperSwitchoverAt: async () => mocks.switchover
}));
vi.mock('$lib/services/affiliate-vesting', () => ({
	computeVestsAt: (days: number, from: Date) => new Date(from.getTime() + days * 86_400_000),
	detectAffiliateIdentityRiskSignals: mocks.risk,
	getRewardVestingDays: async () => 14
}));
vi.mock('$lib/services/affiliate-events', () => ({ recordAffiliateEvent: mocks.event }));

import { recordSuperOrderCommission } from './super-commission';

const SWITCHOVER = new Date('2026-11-01T00:00:00.000Z');
const costSnapshot = (unitCost: number | null) => ({
	goodsCost: {
		version: 1,
		items: [
			{ orderItemId: 'i1', categoryId: 't1', quantity: 1, unitCostNgn: unitCost, hasAddon: false }
		]
	}
});
const order = (overrides: Record<string, unknown> = {}) => ({
	id: 'order-2',
	userId: 'buyer-1',
	affiliateUserId: 'stacy',
	affiliateCode: 'STACY',
	orderType: 'account',
	totalAmount: 2_000,
	storeCreditApplied: 0,
	refundedAmount: 0,
	paidAt: new Date('2026-11-05T10:00:00.000Z'),
	createdAt: new Date('2026-11-05T09:59:00.000Z'),
	analyticsMetadata: costSnapshot(1_200),
	...overrides
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.switchover = SWITCHOVER;
	mocks.upsert.mockResolvedValue({ id: 'wallet-1', balance: 0 });
	mocks.risk.mockResolvedValue([]);
	mocks.event.mockResolvedValue(undefined);
	mocks.findUnique.mockImplementation(async ({ where }: { where: { reference: string } }) =>
		where.reference.startsWith('super:activation:')
			? { status: 'available', metadata: { activatedByOrderId: 'order-1' } }
			: null
	);
});

describe('recording a Super profit commission', () => {
	it('records nothing while no switchover is set (today’s terms)', async () => {
		mocks.switchover = null;
		expect(await recordSuperOrderCommission(order())).toEqual({ recorded: 'none', amount: 0 });
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it('records nothing for orders paid before the switchover', async () => {
		const result = await recordSuperOrderCommission(
			order({ paidAt: new Date('2026-10-30T10:00:00.000Z') })
		);
		expect(result.recorded).toBe('none');
	});

	it('gives the activating order only its ₦700 (no 5% on top)', async () => {
		const result = await recordSuperOrderCommission(order({ id: 'order-1' }));
		expect(result.recorded).toBe('none');
	});

	it('ignores boosting and numbers orders', async () => {
		expect((await recordSuperOrderCommission(order({ orderType: 'boosting' }))).recorded).toBe(
			'none'
		);
		expect((await recordSuperOrderCommission(order({ orderType: 'phone' }))).recorded).toBe('none');
	});

	it('records 5% of profit as a pending reward with a 14-day hold and no cost/profit stored', async () => {
		const result = await recordSuperOrderCommission(order());
		expect(result).toEqual({ recorded: 'pending', amount: 40 });
		const data = mocks.create.mock.calls[0][0].data;
		expect(data).toMatchObject({
			type: 'affiliate_credit',
			amount: 40,
			status: 'pending',
			reference: 'super:commission:order:order-2',
			description: 'Order earnings'
		});
		expect(data.metadata).toMatchObject({ kind: 'super_order_commission', orderId: 'order-2' });
		expect(data.metadata.vestsAt).toBe('2026-11-19T10:00:00.000Z');
		expect(JSON.stringify(data.metadata)).not.toMatch(/cost|profit|margin/i);
	});

	it('holds the commission for review when the order has no goods cost', async () => {
		const result = await recordSuperOrderCommission(
			order({ analyticsMetadata: costSnapshot(null) })
		);
		expect(result).toEqual({ recorded: 'held', amount: 0 });
		expect(mocks.create.mock.calls[0][0].data).toMatchObject({
			status: 'under_review',
			metadata: expect.objectContaining({ holdReason: 'cost_missing' })
		});
	});

	it('flags the commission when identity checks match the buyer', async () => {
		mocks.risk.mockResolvedValue(['shared_phone']);
		await recordSuperOrderCommission(order());
		expect(mocks.create.mock.calls[0][0].data.metadata).toMatchObject({
			suspectedSelfReferral: true
		});
	});

	it('records each order at most once', async () => {
		mocks.findUnique.mockImplementation(async ({ where }: { where: { reference: string } }) =>
			where.reference.startsWith('super:activation:')
				? { status: 'available', metadata: { activatedByOrderId: 'order-1' } }
				: { id: 'already' }
		);
		expect((await recordSuperOrderCommission(order())).recorded).toBe('none');
		expect(mocks.create).not.toHaveBeenCalled();
	});
});
