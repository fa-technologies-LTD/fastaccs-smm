import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	order: { findMany: vi.fn() },
	walletTransaction: { findMany: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));

import { getFinancialReconciliation } from './financial-reconciliation';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('financial reconciliation', () => {
	it('reconciles a partial refund whose legacy ledger reference is the account id', async () => {
		prismaMock.order.findMany.mockResolvedValue([
			{
				id: 'order-1',
				orderNumber: 'ORD-1',
				totalAmount: 22_500,
				refundedAmount: 7_500,
				status: 'completed',
				paymentStatus: 'paid',
				deliveryStatus: 'delivered',
				orderItems: [{ refundedAmount: 7_500, accounts: [{ id: 'account-1' }] }]
			}
		]);
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				amount: 7_500,
				status: 'available',
				reference: 'account-1',
				metadata: {}
			}
		]);

		const result = await getFinancialReconciliation();

		expect(result.ok).toBe(true);
		expect(result.issueCount).toBe(0);
	});

	it('flags a full refund that still carries contradictory live-order markers', async () => {
		prismaMock.order.findMany.mockResolvedValue([
			{
				id: 'order-2',
				orderNumber: 'ORD-2',
				totalAmount: 5_800,
				refundedAmount: 5_800,
				status: 'paid',
				paymentStatus: 'paid',
				deliveryStatus: 'refunded',
				orderItems: [{ refundedAmount: 5_800, accounts: [] }]
			}
		]);
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				amount: 5_800,
				status: 'available',
				reference: 'order-2',
				metadata: { orderId: 'order-2' }
			}
		]);

		const result = await getFinancialReconciliation();

		expect(result.ok).toBe(false);
		expect(result.issues.map((issue) => issue.key)).toContain('full_refund_markers');
	});

	it('reports ledger, item, and over-refund contradictions independently', async () => {
		prismaMock.order.findMany.mockResolvedValue([
			{
				id: 'order-3',
				orderNumber: 'ORD-3',
				totalAmount: 5_000,
				refundedAmount: 5_500,
				status: 'refunded',
				paymentStatus: 'refunded',
				deliveryStatus: 'refunded',
				orderItems: [{ refundedAmount: 4_000, accounts: [] }]
			}
		]);
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				amount: 6_000,
				status: 'available',
				reference: 'order-3',
				metadata: { orderId: 'order-3' }
			}
		]);

		const result = await getFinancialReconciliation();
		const keys = result.issues.map((issue) => issue.key);

		expect(keys).toEqual(
			expect.arrayContaining([
				'order_vs_refund_ledger',
				'order_vs_item_refunds',
				'refund_exceeds_order'
			])
		);
	});
});
