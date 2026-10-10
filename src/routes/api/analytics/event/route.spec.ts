import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	executeRaw: vi.fn(async () => 1),
	create: vi.fn(async () => ({}))
}));

vi.mock('$lib/prisma', () => ({
	prisma: { $executeRaw: mocks.executeRaw, analyticsEvent: { create: mocks.create } }
}));
vi.mock('$lib/server/request-rate-limit', () => ({ consumeRequestAllowance: () => true }));

import { POST } from './+server';

const call = (body: unknown, attribution?: unknown) =>
	(POST as CallableFunction)({
		request: new Request('https://smm.fastaccs.com/api/analytics/event', {
			method: 'POST',
			body: JSON.stringify(body)
		}),
		getClientAddress: () => '127.0.0.1',
		locals: { attribution }
	}) as Promise<Response>;

const lastTouch = {
	source: 'propellerads',
	medium: 'push',
	campaign: '183788',
	content: '5551',
	clickId: 'abc',
	landing: '/platforms/x',
	landedAt: '2026-10-10T10:00:00.000Z'
};

beforeEach(() => vi.clearAllMocks());

describe('POST /api/analytics/event', () => {
	it('stamps the consented source on the visit', async () => {
		const response = await call(
			{ type: 'page_view', path: '/platforms/x' },
			{ first: null, last: lastTouch }
		);
		expect(response.status).toBe(200);
		const values = (mocks.executeRaw.mock.calls[0] as unknown[]).slice(1);
		expect(values).toEqual(['page_view', '/platforms/x', 'propellerads', '183788', '5551']);
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it('records an unattributed visit without a source', async () => {
		await call({ type: 'page_view', path: '/' }, { first: null, last: null });
		expect(mocks.executeRaw).not.toHaveBeenCalled();
		expect(mocks.create).toHaveBeenCalledWith({ data: { type: 'page_view', path: '/' } });
	});

	it('still records the visit before the marketing migration exists', async () => {
		mocks.executeRaw.mockRejectedValueOnce(new Error('column "source" does not exist'));
		await call({ type: 'page_view', path: '/numbers' }, { first: null, last: lastTouch });
		expect(mocks.create).toHaveBeenCalledWith({ data: { type: 'page_view', path: '/numbers' } });
	});

	it('rejects invalid events', async () => {
		expect((await call({ type: 'nope', path: '/' })).status).toBe(400);
	});
});
