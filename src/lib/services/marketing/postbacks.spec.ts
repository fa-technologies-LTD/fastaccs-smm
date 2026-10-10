import { beforeEach, describe, expect, it, vi } from 'vitest';

type Sql = TemplateStringsArray;
const text = (strings: Sql) => strings.join('?');

const state = vi.hoisted(() => ({
	order: null as null | Record<string, unknown>,
	candidates: [] as Array<{ id: string }>,
	channel: null as null | Record<string, unknown>,
	merges: [] as Array<Record<string, unknown>>
}));

const mocks = vi.hoisted(() => ({
	queryRaw: vi.fn(),
	executeRaw: vi.fn(),
	transaction: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		$queryRaw: mocks.queryRaw,
		$executeRaw: mocks.executeRaw,
		$transaction: mocks.transaction
	}
}));

vi.mock('./channels', async (importOriginal) => {
	const original = await importOriginal<typeof import('./channels')>();
	return {
		...original,
		getChannelsByKey: vi.fn(async (keys: string[]) =>
			state.channel ? new Map([[keys[0], state.channel]]) : new Map()
		)
	};
});

import {
	classifyPostbackResult,
	discardHeldPostback,
	dispatchAdPostbacks,
	nextRetryAt,
	payoutUsd
} from './postbacks';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const TEMPLATE =
	'http://ad.propellerads.com/conversion.php?aid=1&pid=&tid=2&visitor_id=${SUBID}&payout=${PAYOUT}';

function paidOrder(meta: Record<string, unknown> = {}) {
	return {
		status: 'completed',
		payment_status: 'paid',
		delivery_status: 'delivered',
		total_amount: '6000',
		refunded_amount: '0',
		analytics_metadata: {
			attribution: { last: { source: 'propellerads', clickId: 'click-1' } },
			...meta
		}
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	state.order = paidOrder();
	state.candidates = [{ id: 'order-1' }];
	state.channel = { key: 'propellerads', postbackTemplate: TEMPLATE, dedupByClickId: false };
	state.merges = [];

	mocks.queryRaw.mockImplementation(async (strings: Sql) => {
		const sql = text(strings);
		if (sql.includes('JOIN marketing_channels')) return state.candidates;
		if (sql.includes('FROM microcopy'))
			return [{ key: 'config.phone.usd_ngn_rate', value: '1500' }];
		if (sql.includes('pg_advisory_xact_lock')) return [{}];
		if (sql.includes('FROM orders WHERE id')) return state.order ? [state.order] : [];
		return [];
	});
	mocks.executeRaw.mockImplementation(async (strings: Sql, ...values: unknown[]) => {
		const sql = text(strings);
		if (sql.includes('WHERE id =') && typeof values[0] === 'string') {
			state.merges.push(JSON.parse(values[0]));
		}
		return sql.includes("= 'sending'") ? 0 : 1;
	});
	mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
		callback({ $queryRaw: mocks.queryRaw, $executeRaw: mocks.executeRaw })
	);
});

const lastMerge = () => state.merges[state.merges.length - 1];

describe('classifyPostbackResult', () => {
	const noDedup = { dedupByClickId: false, attempts: 1 };
	const dedup = { dedupByClickId: true, attempts: 1 };

	it.each([
		[{ status: 200 }, noDedup, 'sent'],
		[{ status: 204 }, noDedup, 'sent'],
		[{ status: 400 }, noDedup, 'rejected'],
		[{ status: 429 }, noDedup, 'retry'],
		[{ status: 502 }, noDedup, 'held'],
		[{ status: 502 }, dedup, 'retry'],
		[
			{ error: Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }) },
			noDedup,
			'retry'
		],
		[
			{ error: Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }) },
			noDedup,
			'retry'
		],
		[{ error: new DOMException('timed out', 'TimeoutError') }, noDedup, 'held'],
		[{ error: new DOMException('timed out', 'TimeoutError') }, dedup, 'retry'],
		[
			{ error: Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }) },
			noDedup,
			'held'
		]
	])('%o with %o → %s', (result, opts, expected) => {
		expect(classifyPostbackResult(result, opts).state).toBe(expected);
	});

	it('stops retrying after the attempt limit', () => {
		const refused = { error: Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } }) };
		expect(classifyPostbackResult(refused, { dedupByClickId: true, attempts: 5 }).state).toBe(
			'held'
		);
		expect(
			classifyPostbackResult({ status: 503 }, { dedupByClickId: true, attempts: 5 }).state
		).toBe('held');
	});
});

describe('helpers', () => {
	it('backs off 5, 10, 20 minutes … capped at 6 hours', () => {
		expect(nextRetryAt(1, NOW).toISOString()).toBe('2026-10-10T12:05:00.000Z');
		expect(nextRetryAt(3, NOW).toISOString()).toBe('2026-10-10T12:20:00.000Z');
		expect(nextRetryAt(20, NOW).toISOString()).toBe('2026-10-10T18:00:00.000Z');
	});
	it('converts the sale to USD at the configured rate', () => {
		expect(payoutUsd(6000, 1500)).toBe(4);
		expect(payoutUsd(6000, 0)).toBe(4);
		expect(payoutUsd(-10, 1500)).toBe(0);
	});
});

describe('dispatchAdPostbacks', () => {
	it('sends once for an eligible order and records it as sent', async () => {
		const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));

		const summary = await dispatchAdPostbacks({ now: NOW, fetchImpl });

		expect(summary).toMatchObject({ examined: 1, sent: 1 });
		expect(fetchImpl).toHaveBeenCalledWith(
			'http://ad.propellerads.com/conversion.php?aid=1&pid=&tid=2&visitor_id=click-1&payout=4.00',
			expect.objectContaining({ method: 'GET' })
		);
		expect(state.merges[0]).toMatchObject({ adPostbackState: 'sending', adPostbackAttempts: 1 });
		expect(lastMerge()).toMatchObject({ adPostbackState: 'sent', adPostbackRetryAfter: null });
	});

	it('re-checks eligibility under the lock: a refund since selection means no send', async () => {
		state.order = { ...paidOrder(), refunded_amount: '6000' };
		const fetchImpl = vi.fn();

		const summary = await dispatchAdPostbacks({ now: NOW, fetchImpl });

		expect(fetchImpl).not.toHaveBeenCalled();
		expect(summary.sent).toBe(0);
		expect(state.merges).toEqual([]);
	});

	it('skips orders another run already handled', async () => {
		state.order = paidOrder({ adPostbackState: 'sent' });
		const fetchImpl = vi.fn();
		await dispatchAdPostbacks({ now: NOW, fetchImpl });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('holds a timed-out postback when the network is not known to dedupe', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new DOMException('timed out', 'TimeoutError');
		});

		const summary = await dispatchAdPostbacks({ now: NOW, fetchImpl });

		expect(summary.held).toBe(1);
		expect(lastMerge()).toMatchObject({ adPostbackState: 'held', adPostbackRetryAfter: null });
	});

	it('schedules a retry when the request never reached the network', async () => {
		const fetchImpl = vi.fn(async () => {
			throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
		});

		await dispatchAdPostbacks({ now: NOW, fetchImpl });

		expect(lastMerge()).toMatchObject({
			adPostbackState: 'retry',
			adPostbackRetryAfter: '2026-10-10T12:05:00.000Z'
		});
	});

	it('holds instead of sending when the channel lost its postback URL', async () => {
		state.channel = { key: 'propellerads', postbackTemplate: null, dedupByClickId: false };
		const fetchImpl = vi.fn();
		const summary = await dispatchAdPostbacks({ now: NOW, fetchImpl });
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(summary.held).toBe(1);
	});

	it('admin "send" only acts on held orders', async () => {
		const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));

		await dispatchAdPostbacks({ now: NOW, fetchImpl, orderIds: ['order-1'] });
		expect(fetchImpl).not.toHaveBeenCalled(); // not held

		state.order = paidOrder({ adPostbackState: 'held', adPostbackAttempts: 1 });
		const summary = await dispatchAdPostbacks({ now: NOW, fetchImpl, orderIds: ['order-1'] });
		expect(summary.sent).toBe(1);
		expect(state.merges.find((m) => m.adPostbackState === 'sending')).toMatchObject({
			adPostbackAttempts: 2
		});
	});

	it('does nothing when there are no candidates', async () => {
		state.candidates = [];
		const fetchImpl = vi.fn();
		expect(await dispatchAdPostbacks({ now: NOW, fetchImpl })).toMatchObject({ examined: 0 });
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

describe('discardHeldPostback', () => {
	it('only discards postbacks that are held', async () => {
		mocks.executeRaw.mockResolvedValueOnce(1);
		expect(await discardHeldPostback('order-1', 'admin@fastaccs')).toBe(true);
		const sql = text(mocks.executeRaw.mock.calls[0][0] as Sql);
		expect(sql).toContain("analytics_metadata->>'adPostbackState' = 'held'");
	});
});
