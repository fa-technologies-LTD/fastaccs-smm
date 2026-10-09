import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findUsers: vi.fn(),
	findOrders: vi.fn(),
	queryRaw: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		user: { findMany: mocks.findUsers },
		order: { findMany: mocks.findOrders },
		$queryRaw: mocks.queryRaw
	}
}));

import { getCampaignReport, resolveChannel } from './campaign-report';

const user = (
	id: string,
	source: string | null,
	campaign: string | null = null,
	landing: string | null = '/platforms/x'
) => ({
	id,
	acquisitionSource: source,
	acquisitionMedium: source ? 'forum' : null,
	acquisitionCampaign: campaign,
	acquisitionLanding: landing
});

describe('getCampaignReport', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.queryRaw.mockResolvedValue([{ path: '/platforms/x', views: 40 }]);
	});

	it('rolls signups, buyers, repeat buyers and net revenue up by source + campaign', async () => {
		mocks.findUsers.mockResolvedValue([
			user('u1', 'Nairaland', 'Sports-Oct'),
			user('u2', 'nairaland', 'sports-oct'),
			user('u3', 'nairaland', 'tech-oct', '/numbers'),
			user('u4', null, null, null)
		]);
		mocks.findOrders.mockResolvedValue([
			{ userId: 'u1', totalAmount: 6000, refundedAmount: 0 },
			{ userId: 'u1', totalAmount: 4000, refundedAmount: 1000 },
			{ userId: 'u3', totalAmount: 2500, refundedAmount: 0 }
		]);

		const report = await getCampaignReport(30);

		const sports = report.campaigns.find((row) => row.campaign === 'sports-oct');
		expect(sports).toMatchObject({
			source: 'nairaland',
			signups: 2,
			buyers: 1,
			repeatBuyers: 1,
			orders: 2,
			revenueNgn: 9000
		});
		expect(report.campaigns.find((row) => row.source === 'untracked')).toMatchObject({
			signups: 1,
			buyers: 0
		});
		expect(report.totals).toEqual({
			signups: 4,
			attributedSignups: 3,
			buyers: 2,
			revenueNgn: 11500
		});
		expect(report.campaigns[0].campaign).toBe('sports-oct'); // highest revenue first
		expect(report.landings.find((row) => row.landing === '/numbers')).toMatchObject({
			signups: 1,
			buyers: 1,
			revenueNgn: 2500
		});
		expect(report.topPages).toEqual([{ path: '/platforms/x', views: 40 }]);
	});

	it('skips the order query when nobody signed up in the window', async () => {
		mocks.findUsers.mockResolvedValue([]);

		const report = await getCampaignReport(7);

		expect(mocks.findOrders).not.toHaveBeenCalled();
		expect(report.totals.signups).toBe(0);
		expect(report.campaigns).toEqual([]);
	});
});

describe('resolveChannel', () => {
	const base = {
		acquisitionSource: 'direct',
		acquisitionMedium: 'referral',
		acquisitionCampaign: null,
		acquisitionLanding: '/ref/AMIII'
	};

	it('credits direct arrivals on a referral link to the affiliate channel', () => {
		expect(resolveChannel(base)).toEqual({
			source: 'affiliate',
			medium: 'referral-link',
			campaign: 'amiii'
		});
		expect(resolveChannel({ ...base, acquisitionSource: null })).toMatchObject({
			source: 'affiliate'
		});
	});

	it('keeps a real tracked source even when the landing was a referral link', () => {
		expect(
			resolveChannel({ ...base, acquisitionSource: 'nairaland', acquisitionCampaign: 'Sports' })
		).toEqual({ source: 'nairaland', medium: 'referral', campaign: 'sports' });
	});

	it('marks users without any source as untracked', () => {
		expect(
			resolveChannel({ ...base, acquisitionSource: null, acquisitionLanding: '/platforms/x' })
		).toMatchObject({ source: 'untracked' });
	});
});
