import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findProgram: vi.fn(),
	recordEvent: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: { affiliateProgram: { findFirst: mocks.findProgram } }
}));
vi.mock('$lib/services/affiliate-events', () => ({
	recordAffiliateEvent: mocks.recordEvent
}));

import { POST } from './+server';

function callEvent(type: string, eventId = 'event_12345678', userId: string | null = 'user-1') {
	return POST({
		locals: { user: userId ? { id: userId } : null },
		request: new Request('https://smm.fastaccs.com/api/affiliate/events', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type, eventId })
		})
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findProgram.mockResolvedValue({ id: 'program-1' });
	mocks.recordEvent.mockResolvedValue(true);
});

describe('affiliate interaction events', () => {
	it('requires an authenticated active affiliate', async () => {
		expect((await callEvent('affiliate_dashboard_viewed', 'event_12345678', null)).status).toBe(401);
		mocks.findProgram.mockResolvedValue(null);
		expect((await callEvent('affiliate_dashboard_viewed')).status).toBe(403);
		expect(mocks.recordEvent).not.toHaveBeenCalled();
	});

	it('rejects arbitrary event names', async () => {
		const response = await callEvent('payout_paid');
		expect(response.status).toBe(400);
		expect(mocks.recordEvent).not.toHaveBeenCalled();
	});

	it('records an allow-listed action with a user-scoped dedupe key', async () => {
		const response = await callEvent('affiliate_link_copied', 'copy_12345678');
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true, recorded: true });
		expect(mocks.recordEvent).toHaveBeenCalledWith({
			type: 'affiliate_link_copied',
			dedupeKey: 'affiliate:interaction:user-1:affiliate_link_copied:copy_12345678',
			affiliateProgramId: 'program-1',
			affiliateUserId: 'user-1',
			source: 'affiliate_dashboard'
		});
	});
});
