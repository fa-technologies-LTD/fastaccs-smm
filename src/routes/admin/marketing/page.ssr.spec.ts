import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';
import { DEFAULT_THRESHOLDS } from '$lib/services/marketing/rules';

const base = {
	report: {
		windowDays: 30,
		totals: { signups: 4, attributedSignups: 3, buyers: 2, revenueNgn: 11500 },
		campaigns: [
			{
				source: 'nairaland',
				medium: 'forum',
				campaign: 'sports-oct',
				signups: 2,
				buyers: 1,
				repeatBuyers: 1,
				orders: 2,
				revenueNgn: 9000
			},
			{
				source: 'untracked',
				medium: '',
				campaign: '',
				signups: 1,
				buyers: 0,
				repeatBuyers: 0,
				orders: 0,
				revenueNgn: 0
			}
		],
		landings: [{ landing: '/platforms/x', signups: 2, buyers: 1, revenueNgn: 9000 }],
		topPages: [{ path: '/platforms/x', views: 1544 }]
	},
	windows: [7, 30, 90],
	thresholds: DEFAULT_THRESHOLDS,
	landingOptions: [
		{ label: 'All accounts', path: '/platforms' },
		{ label: 'X (Twitter) accounts', path: '/platforms/x' }
	],
	siteUrl: 'https://smm.fastaccs.com',
	window: { days: 30, sinceDay: '2026-09-11', untilDay: '2026-10-10', timeZone: 'Africa/Lagos' },
	placements: [
		{
			channelKey: 'propellerads',
			campaignKey: '183788',
			placementKey: '7777',
			spendNgn: 8000,
			impressions: 20000,
			clicks: 400,
			buyers: 0,
			orders: 0,
			revenueNgn: 0
		}
	],
	channels: [
		{
			key: 'propellerads',
			name: 'PropellerAds',
			kind: 'network',
			status: 'testing',
			targetCacNgn: null,
			dailyCapNgn: null,
			postbackConfigured: true,
			dedupByClickId: false,
			notes: null
		}
	],
	heldPostbacks: [
		{
			orderId: '4a6f1d2c-9b1e-4c3a-8f00-123456789abc',
			orderNumber: 'ORD-77',
			channelKey: 'propellerads',
			netNgn: 6000,
			lastResult: 'TimeoutError: may have been recorded',
			attempts: 1,
			paidAt: null
		}
	],
	spendTrackingReady: true,
	canManage: true,
	propellerConfigured: true
};

const html = (data: Record<string, unknown>) => render(Page, { props: { data } as never }).body;

describe('admin marketing page (server render)', () => {
	it('shows the signup cohort without dividing it by spend', () => {
		const body = html(base);
		expect(body).toContain('New signups by first source');
		expect(body).toContain('75%');
		expect(body).toContain('sports-oct');
		expect(body).toContain('since 2026-09-11');
	});

	it('judges cost per buyer on placements, with the not-profit caveat', () => {
		const body = html(base);
		expect(body).toContain('Cost per buyer by placement');
		expect(body).toContain('not profit');
		expect(body).toContain('kill'); // ₦8,000 spent, no buyers
	});

	it('defaults booking dates to the business day, not UTC', () => {
		expect(html(base)).toContain('value="2026-10-10"');
	});

	it('lists held sale reports with send/discard for managers', () => {
		const body = html(base);
		expect(body).toContain('Sale reports waiting for you (1)');
		expect(body).toContain('ORD-77');
		expect(body).toContain('Discard');
	});

	it('shows stopped channels as not reporting', () => {
		const body = html({
			...base,
			channels: [{ ...base.channels[0], status: 'killed' }]
		});
		expect(body).toContain('off (stopped)');
	});

	it('offers to block a PropellerAds zone that hit the kill limit', () => {
		const body = html(base);
		expect(body).toContain('7777');
		expect(body).toContain('Block zone');
	});

	it('hides management controls from view-only admins', () => {
		const body = html({ ...base, canManage: false });
		expect(body).not.toContain('Block zone');
		expect(body).not.toContain('Book spend for a direct buy');
		expect(body).not.toContain('Save channel');
	});

	it('explains the missing setup before the migration and hides spend tools', () => {
		const body = html({
			...base,
			spendTrackingReady: false,
			placements: [],
			channels: [],
			heldPostbacks: []
		});
		expect(body).toContain("Spend tracking isn't set up yet");
		expect(body).not.toContain('Book spend for a direct buy');
		expect(body).toContain('Tracked link builder');
	});
});
