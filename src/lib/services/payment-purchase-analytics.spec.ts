import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	configured: vi.fn(),
	send: vi.fn(),
	find: vi.fn(),
	update: vi.fn(),
	lock: vi.fn(),
	merge: vi.fn(),
	candidates: vi.fn()
}));
vi.mock('$lib/server/ga4-measurement-protocol', () => ({
	isGa4MeasurementProtocolConfigured: mocks.configured,
	sendGa4MeasurementProtocolEvents: mocks.send
}));
vi.mock('$lib/prisma', () => ({
	prisma: {
		$queryRaw: mocks.candidates,
		$transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({
				$queryRaw: mocks.lock,
				$executeRaw: mocks.merge,
				order: { findUnique: mocks.find, update: mocks.update }
			})
	}
}));
import {
	sendServerPurchaseVerifiedEvent,
	drainServerPurchaseAnalytics
} from './payment-settlement';
describe('verified purchase analytics', () => {
	const order = {
		id: 'order',
		orderNumber: '123',
		userId: 'buyer',
		status: 'paid',
		paymentStatus: 'paid',
		deliveryStatus: 'processing',
		totalAmount: 1000,
		storeCreditApplied: 300,
		currency: 'NGN',
		orderType: 'boosting',
		analyticsMetadata: { ga4ClientId: '123.456' },
		orderItems: [{ categoryId: 'offer', productName: 'Likes', unitPrice: 1000, quantity: 1 }]
	};
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.configured.mockReturnValue(true);
		mocks.find.mockResolvedValue(order);
		mocks.send.mockResolvedValue({ success: true });
		mocks.candidates.mockResolvedValue([{ id: 'order', status: 'completed' }]);
	});
	it('uses the full sale, not the gateway remainder or a second store-credit purchase', async () => {
		await sendServerPurchaseVerifiedEvent('order', 'PAID');
		expect(mocks.send).toHaveBeenCalledWith(
			expect.objectContaining({
				events: [
					expect.objectContaining({
						name: 'purchase_verified_server',
						params: expect.objectContaining({ transaction_id: 'order', value: 1000 })
					})
				]
			})
		);
		expect(mocks.lock).toHaveBeenCalledOnce();
		expect(mocks.lock.mock.calls[0][0].join('?')).toContain(')::text');
		expect(mocks.merge).toHaveBeenCalledOnce();
	});
	it('skips previously recorded purchases and refunded orders', async () => {
		mocks.find.mockResolvedValue({
			...order,
			analyticsMetadata: { ...order.analyticsMetadata, ga4ServerPurchaseVerifiedSentAt: 'sent' }
		});
		await sendServerPurchaseVerifiedEvent('order', 'PAID');
		mocks.find.mockResolvedValue({
			...order,
			status: 'refunded',
			paymentStatus: 'refunded',
			deliveryStatus: 'refunded'
		});
		await sendServerPurchaseVerifiedEvent('order', 'PAID');
		expect(mocks.send).not.toHaveBeenCalled();
	});
	it('does not claim successful delivery if analytics transport fails', async () => {
		mocks.send.mockResolvedValue({ success: false, error: 'timeout' });
		await sendServerPurchaseVerifiedEvent('order', 'PAID');
		expect(mocks.update).not.toHaveBeenCalled();
		const patch = JSON.parse(mocks.merge.mock.calls[0][1]);
		expect(patch.ga4ServerPurchaseVerifiedSentAt).toBeUndefined();
		expect(patch.ga4ServerPurchaseVerifiedAttempts).toBe(1);
		expect(Date.parse(patch.ga4ServerPurchaseVerifiedRetryAfter)).toBeGreaterThan(Date.now());
	});
	it('backs off failed sends without claiming success or erasing unrelated metadata', async () => {
		mocks.find.mockResolvedValue({
			...order,
			analyticsMetadata: {
				...order.analyticsMetadata,
				ga4ServerPurchaseVerifiedAttempts: 2
			}
		});
		mocks.send.mockResolvedValue({ success: false });
		expect(await sendServerPurchaseVerifiedEvent('order', 'COMPLETED')).toBe('retry_pending');
		const patch = JSON.parse(mocks.merge.mock.calls[0][1]);
		expect(patch.ga4ServerPurchaseVerifiedAttempts).toBe(3);
		expect(patch.ga4ClientId).toBeUndefined();
		expect(Date.parse(patch.ga4ServerPurchaseVerifiedRetryAfter) - Date.now()).toBeGreaterThan(
			19 * 60_000
		);
	});
	it('does not retry ahead of the stored backoff', async () => {
		mocks.find.mockResolvedValue({
			...order,
			analyticsMetadata: {
				...order.analyticsMetadata,
				ga4ServerPurchaseVerifiedRetryAfter: new Date(Date.now() + 60_000).toISOString()
			}
		});
		expect(await sendServerPurchaseVerifiedEvent('order', 'PAID')).toBe('retry_pending');
		expect(mocks.send).not.toHaveBeenCalled();
	});
	it('recovers a completed purchase from the durable order without re-settling it', async () => {
		expect(await drainServerPurchaseAnalytics()).toEqual({
			sent: 1,
			pending: 0,
			skipped: 0,
			failed: 0
		});
		expect(mocks.send).toHaveBeenCalledOnce();
		expect(mocks.update).not.toHaveBeenCalled();
	});
	it('rechecks an order refunded after the candidate read', async () => {
		mocks.find.mockResolvedValue({ ...order, deliveryStatus: 'refunded' });
		expect((await drainServerPurchaseAnalytics()).skipped).toBe(1);
		expect(mocks.send).not.toHaveBeenCalled();
	});
	it('uses a bounded recent, confirmed-paid, unsent-only scan', async () => {
		await drainServerPurchaseAnalytics(500);
		const call = mocks.candidates.mock.calls[0];
		const query = call[0].join('?');
		expect(query).toContain("INTERVAL '72 hours'");
		expect(query).toContain('ga4ServerPurchaseVerifiedSentAt');
		expect(query).toContain("delivery_status <> 'refunded'");
		expect(query).toContain("payment_status IN ('paid', 'success', 'overpaid')");
		expect(call.at(-1)).toBe(10);
	});
	it('does not delay payment reconciliation if an analytics database read fails', async () => {
		mocks.candidates.mockRejectedValue(new Error('database unavailable'));
		expect((await drainServerPurchaseAnalytics()).failed).toBe(1);
		expect(mocks.send).not.toHaveBeenCalled();
	});
	it('respects configuration and the remaining request budget', async () => {
		await drainServerPurchaseAnalytics(3, Date.now() + 1000);
		mocks.configured.mockReturnValue(false);
		await drainServerPurchaseAnalytics();
		expect(mocks.candidates).not.toHaveBeenCalled();
	});
	it('adds standard purchase reporting only for a new consented order, retaining the original sale time', async () => {
		const paidAt = new Date(Date.now() - 1000);
		mocks.find.mockResolvedValue({
			...order,
			paidAt,
			analyticsMetadata: {
				...order.analyticsMetadata,
				ga4EcommerceVersion: 2,
				ga4ConsentGranted: true
			}
		});
		await sendServerPurchaseVerifiedEvent('order', 'PAID');
		const payload = mocks.send.mock.calls[0][0];
		expect(payload.events.map((event: { name: string }) => event.name)).toEqual([
			'purchase_verified_server',
			'purchase'
		]);
		expect(payload.events[1].params).toMatchObject({ value: 1000, transaction_id: 'order' });
		expect(payload.timestampMicros).toBe(String(paidAt.getTime() * 1000));
		expect(JSON.parse(mocks.merge.mock.calls[0][1]).ga4CanonicalPurchaseSentAt).toEqual(
			expect.any(String)
		);
	});
	it('reports a recent paid-then-refunded new sale so the paired refund can subtract it', async () => {
		mocks.find.mockResolvedValue({
			...order,
			paidAt: new Date(Date.now() - 1000),
			status: 'refunded',
			paymentStatus: 'refunded',
			deliveryStatus: 'refunded',
			refundedAmount: 1000,
			analyticsMetadata: {
				...order.analyticsMetadata,
				ga4EcommerceVersion: 2,
				ga4ConsentGranted: true
			}
		});
		expect(await sendServerPurchaseVerifiedEvent('order', 'PAID')).toBe('sent');
		expect(mocks.send.mock.calls[0][0].events[1].name).toBe('purchase');
	});
	it('canonical item revenue includes the promotion but does not deduct store-credit tender or later refunds', async () => {
		mocks.find.mockResolvedValue({
			...order,
			totalAmount: 900,
			refundedAmount: 100,
			paidAt: new Date(Date.now() - 1000),
			analyticsMetadata: {
				...order.analyticsMetadata,
				ga4EcommerceVersion: 2,
				ga4ConsentGranted: true
			},
			orderItems: [
				{
					id: 'item',
					categoryId: 'offer',
					productName: 'Likes',
					unitPrice: 500,
					totalPrice: 1000,
					quantity: 2
				}
			]
		});
		await sendServerPurchaseVerifiedEvent('order', 'PAID');
		const canonical = mocks.send.mock.calls[0][0].events.find(
			(event: { name: string }) => event.name === 'purchase'
		);
		expect(canonical.params.value).toBe(900);
		expect(canonical.params.items[0]).toMatchObject({ price: 450, quantity: 2 });
	});
	it.each([null, new Date(Date.now() - 73 * 60 * 60_000)])(
		'does not fabricate or shift old canonical revenue when paidAt is %s',
		async (paidAt) => {
			mocks.find.mockResolvedValue({
				...order,
				paidAt,
				analyticsMetadata: {
					...order.analyticsMetadata,
					ga4EcommerceVersion: 2,
					ga4ConsentGranted: true
				}
			});
			expect(await sendServerPurchaseVerifiedEvent('order', 'PAID')).toBe('skipped');
			expect(mocks.send).not.toHaveBeenCalled();
		}
	);
});
