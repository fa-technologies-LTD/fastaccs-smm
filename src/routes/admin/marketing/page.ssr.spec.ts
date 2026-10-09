import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';
import { DEFAULT_THRESHOLDS } from '$lib/services/marketing/rules';

const data = {
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
	siteUrl: 'https://smm.fastaccs.com'
};

describe('admin marketing page (server render)', () => {
	it('renders totals, campaign rows, landing pages and the link builder', () => {
		const { body } = render(Page, { props: { data } as never });

		expect(body).toContain('Marketing');
		expect(body).toContain('75%'); // 3 of 4 signups came from a tracked source
		expect(body).toContain('nairaland');
		expect(body).toContain('sports-oct');
		expect(body).toContain('Spend for nairaland sports-oct');
		expect(body).toContain('X (Twitter) accounts');
		expect(body).toContain('1,544');
		expect(body).toContain('Enter a source to build the link');
	});

	it('offers no spend box for untracked signups', () => {
		const { body } = render(Page, { props: { data } as never });
		expect(body).not.toContain('Spend for untracked');
	});
});
