import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getCampaignReport: vi.fn(),
	findPlatforms: vi.fn(),
	listChannels: vi.fn(),
	getPlacementReport: vi.fn(),
	listHeldPostbacks: vi.fn()
}));

vi.mock('$lib/services/marketing/campaign-report', () => ({
	getCampaignReport: mocks.getCampaignReport
}));
vi.mock('$lib/prisma', () => ({ prisma: { category: { findMany: mocks.findPlatforms } } }));
vi.mock('$lib/services/admin-settings', () => ({
	getBusinessTimezoneSetting: vi.fn(async () => 'Africa/Lagos')
}));
vi.mock('$lib/services/marketing/channels', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/services/marketing/channels')>()),
	listChannels: mocks.listChannels
}));
vi.mock('$lib/services/marketing/placement-report', () => ({
	getPlacementReport: mocks.getPlacementReport,
	listHeldPostbacks: mocks.listHeldPostbacks
}));
vi.mock('$lib/services/marketing/spend-sources/propellerads', () => ({
	getPropellerToken: () => ''
}));

import { load } from './+page.server';

const POSTBACK = 'https://ad.propellerads.com/conversion.php?aid=SECRET-AID&visitor_id=${SUBID}';
const channel = {
	key: 'propellerads',
	name: 'PropellerAds',
	kind: 'network',
	status: 'testing',
	targetCacNgn: null,
	dailyCapNgn: null,
	postbackTemplate: POSTBACK,
	dedupByClickId: false,
	notes: null
};

const run = (role: 'manager' | 'viewer' | 'none', search = '') =>
	(load as CallableFunction)({
		locals: {
			adminContext:
				role === 'manager'
					? { canViewRevenue: true, permissions: ['admin:access', 'admin:settings:manage'] }
					: role === 'viewer'
						? { canViewRevenue: true, permissions: ['admin:access', 'admin:revenue:view'] }
						: { canViewRevenue: false, permissions: ['admin:access'] }
		},
		url: new URL(`https://smm.fastaccs.com/admin/marketing${search}`)
	});

describe('admin marketing page load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getCampaignReport.mockResolvedValue({ windowDays: 30, campaigns: [] });
		mocks.findPlatforms.mockResolvedValue([{ name: 'X ', slug: 'x' }]);
		mocks.listChannels.mockResolvedValue([channel]);
		mocks.getPlacementReport.mockResolvedValue([]);
		mocks.listHeldPostbacks.mockResolvedValue([]);
	});

	it('is hidden from admins who cannot view revenue', async () => {
		await expect(run('none')).rejects.toMatchObject({ status: 403 });
		expect(mocks.getCampaignReport).not.toHaveBeenCalled();
	});

	it('never sends postback URLs to read-only revenue admins', async () => {
		const result = await run('viewer');
		expect(result.canManage).toBe(false);
		expect(result.channels[0]).toMatchObject({ key: 'propellerads', postbackConfigured: true });
		expect(result.channels[0]).not.toHaveProperty('postbackTemplate');
		expect(JSON.stringify(result)).not.toContain('SECRET-AID');
	});

	it('gives settings managers the URL so they can edit it', async () => {
		const result = await run('manager');
		expect(result.channels[0].postbackTemplate).toBe(POSTBACK);
	});

	it('uses the same business-day window for both reports', async () => {
		await run('manager', '?days=7');
		const window = mocks.getCampaignReport.mock.calls[0][0];
		expect(window).toMatchObject({ days: 7 });
		expect(window.sinceDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(mocks.getPlacementReport).toHaveBeenCalledWith(window);
	});

	it('defaults to 30 days and ignores unsupported windows', async () => {
		await run('manager', '?days=365');
		expect(mocks.getCampaignReport.mock.calls[0][0]).toMatchObject({ days: 30 });
	});

	it('still loads before the marketing migration is applied', async () => {
		mocks.getPlacementReport.mockRejectedValueOnce(new Error('relation does not exist'));
		mocks.listChannels.mockRejectedValueOnce(new Error('relation does not exist'));
		const result = await run('manager');
		expect(result.spendTrackingReady).toBe(false);
		expect(result.channels).toEqual([]);
		expect(result.report).toBeDefined();
	});

	it('offers platform landing pages for tracked links', async () => {
		const result = await run('manager');
		expect(result.landingOptions).toContainEqual({
			label: 'X (Twitter) accounts',
			path: '/platforms/x'
		});
	});
});
