import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getAffiliateAccessSummary: vi.fn(),
	getAffiliateDashboardState: vi.fn()
}));

vi.mock('$lib/services/affiliate', () => ({
	getAffiliateAccessSummary: mocks.getAffiliateAccessSummary,
	getAffiliateDashboardState: mocks.getAffiliateDashboardState
}));

import { GET } from './+server';

function callStats(path: string, user: unknown = { id: 'user-1' }) {
	return GET({
		locals: { user },
		url: new URL(`https://smm.fastaccs.com${path}`)
	} as never);
}

describe('affiliate stats loading', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAffiliateAccessSummary.mockResolvedValue({
			eligible: true,
			unlocked: true,
			canActivate: false,
			isActive: true
		});
		mocks.getAffiliateDashboardState.mockResolvedValue({ isActive: true });
	});

	it('rejects unauthenticated reads', async () => {
		const response = await callStats('/api/affiliate/stats', null);

		expect(response.status).toBe(401);
		expect(mocks.getAffiliateAccessSummary).not.toHaveBeenCalled();
		expect(mocks.getAffiliateDashboardState).not.toHaveBeenCalled();
	});

	it('loads only the lightweight access summary for an ordinary dashboard visit', async () => {
		const response = await callStats('/api/affiliate/stats?summary=1');
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.summary).toMatchObject({ isActive: true, unlocked: true });
		expect(mocks.getAffiliateAccessSummary).toHaveBeenCalledWith('user-1');
		expect(mocks.getAffiliateDashboardState).not.toHaveBeenCalled();
	});

	it('loads the full dashboard only when requested', async () => {
		const response = await callStats('/api/affiliate/stats');
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.dashboard).toEqual({ isActive: true });
		expect(mocks.getAffiliateDashboardState).toHaveBeenCalledWith('user-1');
		expect(mocks.getAffiliateAccessSummary).not.toHaveBeenCalled();
	});
});
