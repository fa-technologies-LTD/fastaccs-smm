import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	executeRaw: vi.fn(async () => 1),
	upsertChannel: vi.fn(),
	recordManualBooking: vi.fn(async () => 2),
	discardHeldPostback: vi.fn(async () => true),
	dispatchAdPostbacks: vi.fn(async () => ({ examined: 1, sent: 1 })),
	recordMarketingAction: vi.fn(async () => undefined),
	excludePropellerZones: vi.fn(async () => undefined),
	token: ''
}));

vi.mock('$lib/prisma', () => ({ prisma: { $executeRaw: mocks.executeRaw } }));
vi.mock('$lib/services/marketing/channels', () => ({ upsertChannel: mocks.upsertChannel }));
vi.mock('$lib/services/marketing/spend-ledger', () => ({
	recordManualBooking: mocks.recordManualBooking
}));
vi.mock('$lib/services/marketing/postbacks', () => ({
	discardHeldPostback: mocks.discardHeldPostback,
	dispatchAdPostbacks: mocks.dispatchAdPostbacks
}));
vi.mock('$lib/services/marketing/placement-report', () => ({
	recordMarketingAction: mocks.recordMarketingAction
}));
vi.mock('$lib/services/marketing/spend-sources/propellerads', () => ({
	PROPELLER_CHANNEL_KEY: 'propellerads',
	excludePropellerZones: mocks.excludePropellerZones,
	getPropellerToken: () => mocks.token
}));

import { POST } from './+server';

const ORDER = '4a6f1d2c-9b1e-4c3a-8f00-123456789abc';
const admin = {
	adminContext: { permissions: ['admin:access', 'admin:settings:manage'] },
	user: { email: 'owner@fastaccs' }
};

async function call(body: unknown, locals: unknown = admin) {
	const response = (await (POST as CallableFunction)({
		request: new Request('https://smm.fastaccs.com/api/admin/marketing', {
			method: 'POST',
			body: JSON.stringify(body)
		}),
		locals
	})) as Response;
	return { status: response.status, body: await response.json() };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.token = '';
});

describe('POST /api/admin/marketing', () => {
	it('requires settings permission', async () => {
		const result = await call(
			{ action: 'book_spend' },
			{ adminContext: { permissions: ['admin:access'] }, user: { email: 'assistant' } }
		);
		expect(result.status).toBe(403);
		expect(mocks.recordManualBooking).not.toHaveBeenCalled();
	});

	it('books direct-buy spend, creating the channel row if needed, and audits it', async () => {
		const result = await call({
			action: 'book_spend',
			channelKey: 'Nairaland',
			campaignKey: 'Sports Oct',
			placementKey: 'sports board',
			totalNgn: 11600,
			startDay: '2026-10-10',
			endDay: '2026-10-11'
		});
		expect(result).toEqual({ status: 200, body: { success: true, data: { days: 2 } } });
		expect(mocks.recordManualBooking).toHaveBeenCalledWith({
			channelKey: 'nairaland',
			campaignKey: 'sports-oct',
			placementKey: 'sports-board',
			totalNgn: 11600,
			startDay: '2026-10-10',
			endDay: '2026-10-11'
		});
		expect(mocks.recordMarketingAction).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'book_spend', actor: 'owner@fastaccs' })
		);
	});

	it('rejects bookings without a source or a sane amount', async () => {
		expect((await call({ action: 'book_spend', channelKey: '', totalNgn: 5 })).status).toBe(400);
		expect(
			(await call({ action: 'book_spend', channelKey: 'nairaland', totalNgn: -1 })).status
		).toBe(400);
	});

	it('discards a held postback, or reports it already moved on', async () => {
		expect(
			(await call({ action: 'postback_decision', orderId: ORDER, decision: 'discard' })).status
		).toBe(200);
		mocks.discardHeldPostback.mockResolvedValueOnce(false);
		expect(
			(await call({ action: 'postback_decision', orderId: ORDER, decision: 'discard' })).status
		).toBe(409);
		expect(
			(await call({ action: 'postback_decision', orderId: 'x', decision: 'discard' })).status
		).toBe(400);
	});

	it('refuses to send a held report for a stopped channel', async () => {
		mocks.dispatchAdPostbacks.mockResolvedValueOnce({ examined: 1, sent: 0, stopped: 1 } as never);
		const result = await call({ action: 'postback_decision', orderId: ORDER, decision: 'send' });
		expect(result.status).toBe(409);
		expect(mocks.recordMarketingAction).not.toHaveBeenCalled();
	});

	it('sends a held postback through the guarded dispatcher', async () => {
		const result = await call({ action: 'postback_decision', orderId: ORDER, decision: 'send' });
		expect(result.status).toBe(200);
		expect(mocks.dispatchAdPostbacks).toHaveBeenCalledWith({ orderIds: [ORDER] });
	});

	it('blocks a zone only when the PropellerAds token is configured', async () => {
		expect((await call({ action: 'block_zone', campaignKey: '1', placementKey: '2' })).status).toBe(
			409
		);
		mocks.token = 'tok';
		const result = await call({
			action: 'block_zone',
			campaignKey: '183788',
			placementKey: '7777',
			reason: 'No buyers after ₦8,000'
		});
		expect(result.status).toBe(200);
		expect(mocks.excludePropellerZones).toHaveBeenCalledWith({
			token: 'tok',
			campaignId: '183788',
			zoneIds: ['7777']
		});
	});

	it('surfaces validation errors from channel saves', async () => {
		mocks.upsertChannel.mockRejectedValueOnce(
			new Error('Postback must contain the click id token, e.g. ${SUBID}')
		);
		const result = await call({
			action: 'save_channel',
			key: 'propellerads',
			postbackTemplate: 'https://x'
		});
		expect(result.status).toBe(400);
		expect(result.body.error).toContain('click id');
	});
});
