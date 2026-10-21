import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import AffiliateTab from './AffiliateTab.svelte';

describe('affiliate pending timing copy', () => {
	const props = {
		unlocked: true,
		isActive: true,
		availableStoreCredit: 13300,
		pendingStoreCredit: 700,
		affiliateCode: 'DEMO',
		payoutEligible: false,
		payoutBlockers: ['bank_details_missing'],
		recentReferralActivity: [],
		recentStoreCreditActivity: [],
		superReferrals: []
	};
	it('explains the Super 24-hour wait without promising unchecked clearance', () => {
		const body = render(AffiliateTab, {
			props: { initialAffiliateData: { ...props, isSuperAffiliate: true } }
		}).body;
		expect(body).toContain('Super rewards clear after 24 hours, subject to checks.');
	});
	it('does not advertise the Super wait to regular affiliates', () => {
		const body = render(AffiliateTab, {
			props: { initialAffiliateData: { ...props, isSuperAffiliate: false } }
		}).body;
		expect(body).not.toContain('Super rewards clear after 24 hours');
	});
});
