import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: {} as Record<string, unknown>, save: vi.fn() }));
vi.mock('$lib/services/announcement-banner', () => ({
	getAnnouncementBannerConfig: async () => mocks.config,
	isAnnouncementBannerActive: (config: { enabled: boolean }) => config.enabled,
	saveAnnouncementBannerConfig: mocks.save
}));

import {
	announceCampaignInBanner,
	campaignBannerMessage,
	withdrawCampaignBanner
} from './campaign-banner';
import { BIGSPENDER_DEFAULTS, REFER_WIN_DEFAULTS } from '$lib/helpers/promo-campaign-rules';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.config = { enabled: true, text: 'Old news', link: null, dismissible: true, version: 4 };
});

describe('campaign announcement bar', () => {
	it('writes a one-line message per campaign', () => {
		expect(campaignBannerMessage('refer_win', REFER_WIN_DEFAULTS).text).toBe(
			'Refer & Win: get ₦1,000 store credit when a friend you refer spends ₦5,000.'
		);
		expect(campaignBannerMessage('bigspender', BIGSPENDER_DEFAULTS).text).toBe(
			'BIGSPENDER: reach ₦100,000 in orders and get ₦3,000 store credit, automatically.'
		);
	});

	it('shows the campaign with a new version so people who dismissed the old bar see it', async () => {
		await announceCampaignInBanner('refer_win', REFER_WIN_DEFAULTS);
		expect(mocks.save.mock.calls[0][0]).toMatchObject({
			enabled: true,
			link: '/dashboard?tab=affiliate',
			version: 5
		});
	});

	it('takes the bar down only if it still shows that campaign', async () => {
		expect(await withdrawCampaignBanner('refer_win', REFER_WIN_DEFAULTS)).toBe(false);
		mocks.config = { ...mocks.config, text: 'Refer & Win: get ₦1,000…' };
		expect(await withdrawCampaignBanner('refer_win', REFER_WIN_DEFAULTS)).toBe(true);
		expect(mocks.save.mock.calls[0][0]).toMatchObject({ enabled: false });
	});
});
