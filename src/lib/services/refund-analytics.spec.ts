import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	configured: vi.fn(),
	send: vi.fn(),
	find: vi.fn(),
	merge: vi.fn(),
	lock: vi.fn(),
	candidates: vi.fn()
}));
vi.mock('$lib/prisma', () => ({
	prisma: {
		$queryRaw: mocks.candidates,
		$transaction: async (fn: (tx: unknown) => unknown) =>
			fn({ $queryRaw: mocks.lock, $executeRaw: mocks.merge, order: { findUnique: mocks.find } })
	}
}));
vi.mock('$lib/server/ga4-measurement-protocol', () => ({
	isGa4MeasurementProtocolConfigured: mocks.configured,
	sendGa4MeasurementProtocolEvents: mocks.send
}));
import {
	drainRefundAnalytics,
	listRefundAnalyticsReview,
	sendOrderRefundAnalytics
} from './refund-analytics';

describe('durable isolated refund analytics', () => {
	let row: {
		id: string;
		totalAmount: number;
		refundedAmount: number;
		currency: string;
		analyticsMetadata: Record<string, unknown>;
	};
	const baseline = () => ({
		ga4ClientId: '123.456',
		ga4ConsentGranted: true,
		ga4EcommerceVersion: 2,
		ga4CanonicalPurchaseSentAt: new Date().toISOString(),
		unrelated: 'preserved'
	});
	beforeEach(() => {
		vi.resetAllMocks();
		row = {
			id: 'order',
			totalAmount: 1000,
			refundedAmount: 100.11,
			currency: 'NGN',
			analyticsMetadata: baseline()
		};
		mocks.configured.mockReturnValue(true);
		mocks.find.mockImplementation(async () => structuredClone(row));
		mocks.merge.mockImplementation(async (_sql, patch) =>
			Object.assign(row.analyticsMetadata, JSON.parse(patch))
		);
		mocks.send.mockResolvedValue({ success: true });
		mocks.candidates.mockResolvedValue([{ id: row.id }]);
	});
	it('commits the sending marker before transport and reports exact kobo, without changing money', async () => {
		mocks.send.mockImplementation(async () => {
			expect(row.analyticsMetadata.ga4RefundDispatch).toMatchObject({
				state: 'sending',
				beforeKobo: 0,
				targetKobo: 10011
			});
			return { success: true };
		});
		expect(await sendOrderRefundAnalytics(row.id)).toBe('sent');
		expect(mocks.send).toHaveBeenCalledWith({
			clientId: '123.456',
			events: [
				{ name: 'refund', params: { transaction_id: 'order', currency: 'NGN', value: 100.11 } }
			]
		});
		expect(row.analyticsMetadata.ga4RefundReportedKobo).toBe(10011);
		expect(row.totalAmount).toBe(1000);
		expect(row.refundedAmount).toBe(100.11);
		expect(row.analyticsMetadata.unrelated).toBe('preserved');
		expect(mocks.lock.mock.calls[0][0].join('?')).toContain(')::text');
	});
	it('skips a replay and sends only each additional partial-refund increment', async () => {
		await sendOrderRefundAnalytics(row.id);
		expect(await sendOrderRefundAnalytics(row.id)).toBe('skipped');
		row.refundedAmount = 300.25;
		expect(await sendOrderRefundAnalytics(row.id)).toBe('sent');
		expect(mocks.send).toHaveBeenCalledTimes(2);
		expect(mocks.send.mock.calls[1][0].events[0].params.value).toBe(200.14);
		expect(row.analyticsMetadata.ga4RefundReportedKobo).toBe(30025);
	});
	it('handles a full refund after a partial refund without sending the earlier part twice', async () => {
		await sendOrderRefundAnalytics(row.id);
		row.refundedAmount = 1000;
		await sendOrderRefundAnalytics(row.id);
		expect(mocks.send.mock.calls[1][0].events[0].params.value).toBe(899.89);
		expect(row.analyticsMetadata.ga4RefundReportedKobo).toBe(100000);
	});
	it.each([{ success: false }, { success: false, error: 'timeout' }, 'throws'])(
		'holds uncertain transport %s without another send',
		async (response) => {
			if (response === 'throws') mocks.send.mockRejectedValue(new Error('timeout'));
			else mocks.send.mockResolvedValue(response);
			expect(await sendOrderRefundAnalytics(row.id)).toBe('under_review');
			expect(await sendOrderRefundAnalytics(row.id)).toBe('under_review');
			expect(mocks.send).toHaveBeenCalledOnce();
			expect(row.analyticsMetadata.ga4RefundReportedKobo).toBeUndefined();
		}
	);
	it('only permits retry when transport explicitly proves it never submitted HTTP', async () => {
		mocks.send.mockResolvedValue({ success: false, skipped: true });
		expect(await sendOrderRefundAnalytics(row.id)).toBe('pending');
		expect(row.analyticsMetadata.ga4RefundDispatch).toBeNull();
		expect(await sendOrderRefundAnalytics(row.id)).toBe('pending');
		expect(mocks.send).toHaveBeenCalledOnce();
	});
	it('does not replay after remote acceptance if the local completion marker fails', async () => {
		const persist = mocks.merge.getMockImplementation()!;
		mocks.merge.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('database lost'));
		await expect(sendOrderRefundAnalytics(row.id)).rejects.toThrow('database lost');
		const dispatch = row.analyticsMetadata.ga4RefundDispatch as { startedAt: string };
		dispatch.startedAt = new Date(Date.now() - 6 * 60_000).toISOString();
		expect(await sendOrderRefundAnalytics(row.id)).toBe('under_review');
		expect(mocks.send).toHaveBeenCalledOnce();
	});
	it('a second worker sees the committed in-flight marker and cannot send again', async () => {
		let release!: () => void;
		let started!: () => void;
		const waiting = new Promise<void>((resolve) => {
			release = resolve;
		});
		const sending = new Promise<void>((resolve) => {
			started = resolve;
		});
		mocks.send.mockImplementation(async () => {
			started();
			await waiting;
			return { success: true };
		});
		const first = sendOrderRefundAnalytics(row.id);
		await sending;
		expect(await sendOrderRefundAnalytics(row.id)).toBe('pending');
		release();
		expect(await first).toBe('sent');
		expect(mocks.send).toHaveBeenCalledOnce();
	});
	it('retains an additional refund committed while the first transport was waiting', async () => {
		mocks.send.mockImplementationOnce(async () => {
			row.refundedAmount = 250.22;
			return { success: true };
		});
		await sendOrderRefundAnalytics(row.id);
		expect(row.analyticsMetadata.ga4RefundReportedKobo).toBe(10011);
		await sendOrderRefundAnalytics(row.id);
		expect(mocks.send.mock.calls[1][0].events[0].params.value).toBe(150.11);
	});
	it.each([
		{ ga4EcommerceVersion: undefined },
		{ ga4ConsentGranted: false },
		{ ga4CanonicalPurchaseSentAt: undefined },
		{ ga4ClientId: 'bad' }
	])('does not backfill legacy, unconsented or unconfirmed purchases (%s)', async (patch) => {
		Object.assign(row.analyticsMetadata, patch);
		expect(await sendOrderRefundAnalytics(row.id)).toBe('skipped');
		expect(mocks.send).not.toHaveBeenCalled();
	});
	it.each([-1, '10011', 1.5, NaN, null, 9999999999999999])(
		'holds malformed reported total %s instead of resetting it and duplicating a refund',
		async (value) => {
			row.analyticsMetadata.ga4RefundReportedKobo = value;
			expect(await sendOrderRefundAnalytics(row.id)).toBe('under_review');
			expect(mocks.send).not.toHaveBeenCalled();
		}
	);
	it.each([1001, -1, NaN, 100.115])(
		'holds invalid refunded value %s without altering the financial record',
		async (amount) => {
			row.refundedAmount = amount;
			expect(await sendOrderRefundAnalytics(row.id)).toBe('under_review');
			expect(mocks.send).not.toHaveBeenCalled();
		}
	);
	it('uses a bounded versioned queue without an age cutoff that could lose older refunds', async () => {
		expect((await drainRefundAnalytics(500)).sent).toBe(1);
		const query = mocks.candidates.mock.calls[0][0].join('?');
		expect(query).toContain('ga4EcommerceVersion');
		expect(query).toContain('ga4CanonicalPurchaseSentAt');
		expect(query).not.toContain("INTERVAL '72 hours'");
		expect(mocks.candidates.mock.calls[0].at(-1)).toBe(10);
	});
	it('lists bounded stale/held reporting work with only safe administrative fields', async () => {
		mocks.candidates.mockResolvedValue([]);
		expect(await listRefundAnalyticsReview(500)).toEqual([]);
		const query = mocks.candidates.mock.calls[0][0].join('?');
		expect(query).toContain('canonical_purchase_missing');
		expect(query).toContain("INTERVAL '72 hours'");
		expect(query).not.toContain('SELECT analytics_metadata');
		expect(query).not.toContain('ga4ClientId');
		expect(mocks.candidates.mock.calls[0].at(-1)).toBe(50);
		expect(mocks.send).not.toHaveBeenCalled();
	});
	it('bounds infrastructure failures without touching financial recovery', async () => {
		mocks.candidates.mockRejectedValue(new Error('database offline'));
		expect((await drainRefundAnalytics()).failed).toBe(1);
		expect(mocks.send).not.toHaveBeenCalled();
	});
	it('does not claim work without configuration or request time', async () => {
		await drainRefundAnalytics(3, Date.now() + 1000);
		mocks.configured.mockReturnValue(false);
		await drainRefundAnalytics();
		expect(await sendOrderRefundAnalytics(row.id)).toBe('skipped');
		expect(mocks.find).not.toHaveBeenCalled();
		expect(mocks.candidates).not.toHaveBeenCalled();
	});
});
