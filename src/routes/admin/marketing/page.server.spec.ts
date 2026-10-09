import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getCampaignReport: vi.fn(),
	findPlatforms: vi.fn()
}));

vi.mock('$lib/services/marketing/campaign-report', () => ({
	getCampaignReport: mocks.getCampaignReport
}));

vi.mock('$lib/prisma', () => ({
	prisma: { category: { findMany: mocks.findPlatforms } }
}));

import { load } from './+page.server';

const run = (canViewRevenue: boolean, search = '') =>
	(load as CallableFunction)({
		locals: { adminContext: canViewRevenue ? { canViewRevenue: true } : { canViewRevenue: false } },
		url: new URL(`https://smm.fastaccs.com/admin/marketing${search}`)
	});

describe('admin marketing page load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getCampaignReport.mockResolvedValue({ windowDays: 30, campaigns: [] });
		mocks.findPlatforms.mockResolvedValue([{ name: 'X ', slug: 'x' }]);
	});

	it('is hidden from admins who cannot view revenue', async () => {
		await expect(run(false)).rejects.toMatchObject({ status: 403 });
		expect(mocks.getCampaignReport).not.toHaveBeenCalled();
	});

	it('defaults to 30 days and ignores unsupported windows', async () => {
		await run(true, '?days=365');
		expect(mocks.getCampaignReport).toHaveBeenCalledWith(30);
	});

	it('honours a supported window and offers platform landing pages for links', async () => {
		const result = await run(true, '?days=7');
		expect(mocks.getCampaignReport).toHaveBeenCalledWith(7);
		expect(result.landingOptions).toContainEqual({
			label: 'X (Twitter) accounts',
			path: '/platforms/x'
		});
		expect(result.siteUrl).toBe('https://smm.fastaccs.com');
	});
});
