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

const marketing = vi.hoisted(() => ({
	getSpendTotals: vi.fn(),
	listChannels: vi.fn(),
	getPlacementReport: vi.fn(),
	listHeldPostbacks: vi.fn()
}));

vi.mock('$lib/services/marketing/spend-ledger', () => ({
	getSpendTotals: marketing.getSpendTotals
}));
vi.mock('$lib/services/marketing/channels', () => ({ listChannels: marketing.listChannels }));
vi.mock('$lib/services/marketing/placement-report', () => ({
	getPlacementReport: marketing.getPlacementReport,
	listHeldPostbacks: marketing.listHeldPostbacks
}));
vi.mock('$lib/services/marketing/spend-sources/propellerads', () => ({
	getPropellerToken: () => ''
}));

import { load } from './+page.server';

const run = (canViewRevenue: boolean, search = '') =>
	(load as CallableFunction)({
		locals: {
			adminContext: canViewRevenue
				? { canViewRevenue: true, permissions: ['admin:access', 'admin:settings:manage'] }
				: { canViewRevenue: false, permissions: ['admin:access'] }
		},
		url: new URL(`https://smm.fastaccs.com/admin/marketing${search}`)
	});

describe('admin marketing page load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getCampaignReport.mockResolvedValue({ windowDays: 30, campaigns: [] });
		mocks.findPlatforms.mockResolvedValue([{ name: 'X ', slug: 'x' }]);
		marketing.getSpendTotals.mockResolvedValue([
			{
				channelKey: 'nairaland',
				campaignKey: 'sports-oct',
				spendNgn: 11600,
				impressions: 0,
				clicks: 0
			}
		]);
		marketing.listChannels.mockResolvedValue([]);
		marketing.getPlacementReport.mockResolvedValue([]);
		marketing.listHeldPostbacks.mockResolvedValue([]);
	});

	it('joins booked spend to campaigns', async () => {
		const result = await run(true);
		expect(result.spendByCampaign).toEqual({ 'nairaland|sports-oct': 11600 });
		expect(result.spendTrackingReady).toBe(true);
	});

	it('still loads before the marketing migration is applied', async () => {
		marketing.getSpendTotals.mockRejectedValueOnce(
			new Error('relation "marketing_spend_daily" does not exist')
		);
		marketing.listChannels.mockRejectedValueOnce(
			new Error('relation "marketing_channels" does not exist')
		);
		const result = await run(true);
		expect(result.spendTrackingReady).toBe(false);
		expect(result.spendByCampaign).toEqual({});
		expect(result.report).toBeDefined();
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
