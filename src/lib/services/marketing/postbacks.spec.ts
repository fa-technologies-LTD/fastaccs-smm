import { beforeEach, describe, expect, it, vi } from 'vitest';

type Sql = TemplateStringsArray;
const text = (strings: Sql) => strings.join('?');

const state = vi.hoisted(() => ({
	order: null as null | Record<string, unknown>,
	orderAfterClaim: null as null | Record<string, unknown>,
	candidates: [] as Array<{ id: string }>,
	channel: null as null | Record<string, unknown>,
	channelAfterClaim: null as null | Record<string, unknown>,
	merges: [] as Array<Record<string, unknown>>,
	sql: [] as string[]
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

import {
	classifyPostbackResult,
	discardHeldPostback,
	dispatchAdPostbacks,
	nextRetryAt,
	payoutUsd
} from './postbacks';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const TEMPLATE =
	'https://ad.propellerads.com/conversion.php?aid=1&pid=&tid=2&visitor_id=${SUBID}&payout=${PAYOUT}';

function paidOrder(meta: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
	return {
		status: 'completed',
		payment_status: 'paid',
		delivery_status: 'delivered',
		payment_channel: 'monnify',
		total_amount: '6000',
		refunded_amount: '0',
		analytics_metadata: {
			attribution: { last: { source: 'propellerads', clickId: 'click-1' } },
			...meta
		},
		...overrides
	};
}

let orderReads = 0;
let channelReads = 0;

beforeEach(() => {
	vi.clearAllMocks();
	orderReads = 0;
	channelReads = 0;
	state.channelAfterClaim = null;
	state.order = paidOrder();
	state.orderAfterClaim = null;
	state.candidates = [{ id: 'order-1' }];
	state.channel = { status: 'testing', postback_template: TEMPLATE, dedup_by_click_id: false };
	state.merges = [];
	state.sql = [];

	mocks.queryRaw.mockImplementation(async (strings: Sql) => {
		const sql = text(strings);
		state.sql.push(sql);
		if (sql.includes('JOIN marketing_channels')) return state.candidates;
		if (sql.includes('FROM microcopy'))
			return [{ key: 'config.phone.usd_ngn_rate', value: '1500' }];
		if (sql.includes('FROM marketing_channels')) {
			channelReads += 1;
			const channel =
				channelReads > 1 && state.channelAfterClaim ? state.channelAfterClaim : state.channel;
			return channel ? [channel] : [];
		}
		if (sql.includes('FROM orders WHERE id')) {
			orderReads += 1;
			const order = orderReads > 1 && state.orderAfterClaim ? state.orderAfterClaim : state.order;
			return order ? [order] : [];
		}
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
const okSend = () => vi.fn(async () => ({ status: 200 }));

describe('classifyPostbackResult', () => {
	const noDedup = { dedupByClickId: false, attempts: 1 };
	const dedup = { dedupByClickId: true, attempts: 1 };
	const err = (code: string) => ({ error: Object.assign(new Error('x'), { code }) });

	it.each([
		[{ status: 200 }, noDedup, 'sent'],
		[{ status: 302 }, noDedup, 'rejected'],
		[{ status: 400 }, noDedup, 'rejected'],
		[{ status: 429 }, noDedup, 'retry'],
		[{ status: 502 }, noDedup, 'held'],
		[{ status: 502 }, dedup, 'retry'],
		[err('ECONNREFUSED'), noDedup, 'retry'],
		[err('ENOTFOUND'), noDedup, 'retry'],
		[err('EUNSAFEADDR'), dedup, 'rejected'],
		[err('ETIMEDOUT'), noDedup, 'held'],
		[err('ETIMEDOUT'), dedup, 'retry'],
		[err('ECONNRESET'), noDedup, 'held']
	])('%o with %o → %s', (result, opts, expected) => {
		expect(classifyPostbackResult(result, opts).state).toBe(expected);
	});

	it('stops retrying after the attempt limit', () => {
		expect(
			classifyPostbackResult(err('ECONNREFUSED'), { dedupByClickId: true, attempts: 5 }).state
		).toBe('held');
	});
});

describe('helpers', () => {
	it('backs off 5, 10, 20 minutes … capped at 6 hours', () => {
		expect(nextRetryAt(1, NOW).toISOString()).toBe('2026-10-10T12:05:00.000Z');
		expect(nextRetryAt(20, NOW).toISOString()).toBe('2026-10-10T18:00:00.000Z');
	});
	it('converts the sale to USD at the configured rate', () => {
		expect(payoutUsd(6000, 1500)).toBe(4);
		expect(payoutUsd(-10, 1500)).toBe(0);
	});
});

describe('dispatchAdPostbacks', () => {
	it('row-locks the order, sends once over the trusted host and records it', async () => {
		const send = okSend();
		const summary = await dispatchAdPostbacks({ now: NOW, send });
		expect(summary).toMatchObject({ examined: 1, sent: 1 });
		expect(send).toHaveBeenCalledWith(
			'https://ad.propellerads.com/conversion.php?aid=1&pid=&tid=2&visitor_id=click-1&payout=4.00'
		);
		expect(
			state.sql.some((sql) => sql.includes('FROM orders WHERE id') && sql.includes('FOR UPDATE'))
		).toBe(true);
		expect(lastMerge()).toMatchObject({ adPostbackState: 'sent', adPostbackRetryAfter: null });
	});

	it('selects only canonical sales from reporting channels', async () => {
		await dispatchAdPostbacks({ now: NOW, send: okSend() });
		const selection = state.sql.find((sql) => sql.includes('JOIN marketing_channels'))!;
		expect(selection).toContain("payment_channel <> 'manual_release'");
		expect(selection).toContain("c.status IN ('testing', 'scaling', 'paused')");
	});

	it('does not report a stopped channel, on schedule or by admin force', async () => {
		state.channel = { status: 'killed', postback_template: TEMPLATE, dedup_by_click_id: false };
		const send = okSend();
		expect(await dispatchAdPostbacks({ now: NOW, send })).toMatchObject({ stopped: 1, sent: 0 });
		expect(lastMerge()).toMatchObject({ adPostbackState: 'skipped' });

		state.order = paidOrder({ adPostbackState: 'held' });
		expect(await dispatchAdPostbacks({ now: NOW, send, orderIds: ['order-1'] })).toMatchObject({
			stopped: 1,
			sent: 0
		});
		expect(send).not.toHaveBeenCalled();
	});

	it('still reports conversions for a paused channel', async () => {
		state.channel = { status: 'paused', postback_template: TEMPLATE, dedup_by_click_id: false };
		expect((await dispatchAdPostbacks({ now: NOW, send: okSend() })).sent).toBe(1);
	});

	it('never sends to an untrusted URL stored in the database (e.g. loopback)', async () => {
		state.channel = {
			status: 'testing',
			postback_template: 'http://127.0.0.1:3000/internal?click=${SUBID}',
			dedup_by_click_id: false
		};
		const send = okSend();
		expect(await dispatchAdPostbacks({ now: NOW, send })).toMatchObject({ held: 1, sent: 0 });
		expect(send).not.toHaveBeenCalled();
		expect(String(lastMerge().adPostbackLastResult)).toContain('Postback URL not allowed');
	});

	it('treats a redirect as rejected and never follows it', async () => {
		const send = vi.fn(async () => ({ status: 302 }));
		expect((await dispatchAdPostbacks({ now: NOW, send })).rejected).toBe(1);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('refund before the claim: no send, no state change', async () => {
		state.order = paidOrder({}, { refunded_amount: '6000', status: 'refunded' });
		const send = okSend();
		await dispatchAdPostbacks({ now: NOW, send });
		expect(send).not.toHaveBeenCalled();
		expect(state.merges).toEqual([]);
	});

	it('refund racing the claim (between claim and send): skipped, no send', async () => {
		state.orderAfterClaim = paidOrder({}, { refunded_amount: '6000', status: 'refunded' });
		const send = okSend();
		const summary = await dispatchAdPostbacks({ now: NOW, send });
		expect(send).not.toHaveBeenCalled();
		expect(summary.skipped).toBe(1);
		expect(lastMerge()).toMatchObject({ adPostbackState: 'skipped' });
	});

	it('channel stopped after the claim, before sending: no send (scheduled and admin)', async () => {
		state.channelAfterClaim = {
			status: 'killed',
			postback_template: TEMPLATE,
			dedup_by_click_id: false
		};
		const send = okSend();
		expect(await dispatchAdPostbacks({ now: NOW, send })).toMatchObject({ stopped: 1, sent: 0 });
		expect(lastMerge()).toMatchObject({ adPostbackState: 'skipped' });

		channelReads = 0;
		orderReads = 0;
		state.order = paidOrder({ adPostbackState: 'held', adPostbackAttempts: 1 });
		expect(await dispatchAdPostbacks({ now: NOW, send, orderIds: ['order-1'] })).toMatchObject({
			stopped: 1,
			sent: 0
		});
		expect(send).not.toHaveBeenCalled();
	});

	it('URL changed to an untrusted one after the claim: held, no send', async () => {
		state.channelAfterClaim = {
			status: 'testing',
			postback_template: 'https://evil.example/pb?c=${SUBID}',
			dedup_by_click_id: false
		};
		const send = okSend();
		expect(await dispatchAdPostbacks({ now: NOW, send })).toMatchObject({ held: 1, sent: 0 });
		expect(send).not.toHaveBeenCalled();
	});

	it('uses the current URL and dedup setting read at the final check', async () => {
		state.channelAfterClaim = {
			status: 'testing',
			postback_template: TEMPLATE.replace('aid=1', 'aid=9'),
			dedup_by_click_id: true
		};
		const send = vi.fn(async () => ({
			error: Object.assign(new Error('t'), { code: 'ETIMEDOUT' })
		}));
		await dispatchAdPostbacks({ now: NOW, send });
		expect(send).toHaveBeenCalledWith(expect.stringContaining('aid=9'));
		expect(lastMerge()).toMatchObject({ adPostbackState: 'retry' }); // fresh dedup=true
	});

	it('owner self-offloads are never conversions', async () => {
		state.order = paidOrder({}, { payment_channel: 'manual_release' });
		const send = okSend();
		await dispatchAdPostbacks({ now: NOW, send });
		expect(send).not.toHaveBeenCalled();
	});

	it('holds a timed-out postback when the network is not known to dedupe', async () => {
		const send = vi.fn(async () => ({
			error: Object.assign(new Error('t'), { code: 'ETIMEDOUT' })
		}));
		expect((await dispatchAdPostbacks({ now: NOW, send })).held).toBe(1);
		expect(lastMerge()).toMatchObject({ adPostbackState: 'held', adPostbackRetryAfter: null });
	});

	it('schedules a retry when the request never reached the network', async () => {
		const send = vi.fn(async () => ({
			error: Object.assign(new Error('r'), { code: 'ECONNREFUSED' })
		}));
		await dispatchAdPostbacks({ now: NOW, send });
		expect(lastMerge()).toMatchObject({
			adPostbackState: 'retry',
			adPostbackRetryAfter: '2026-10-10T12:05:00.000Z'
		});
	});

	it('admin "send" only acts on held orders', async () => {
		const send = okSend();
		await dispatchAdPostbacks({ now: NOW, send, orderIds: ['order-1'] });
		expect(send).not.toHaveBeenCalled();
		state.order = paidOrder({ adPostbackState: 'held', adPostbackAttempts: 1 });
		expect((await dispatchAdPostbacks({ now: NOW, send, orderIds: ['order-1'] })).sent).toBe(1);
	});
});

describe('discardHeldPostback', () => {
	it('only discards postbacks that are held', async () => {
		mocks.executeRaw.mockResolvedValueOnce(1);
		expect(await discardHeldPostback('order-1', 'admin@fastaccs')).toBe(true);
		expect(text(mocks.executeRaw.mock.calls[0][0] as Sql)).toContain(
			"analytics_metadata->>'adPostbackState' = 'held'"
		);
	});
});
