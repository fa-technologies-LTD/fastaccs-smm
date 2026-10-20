import { dateToWatInput } from '$lib/helpers/wat-datetime';
import type {
	BigSpenderSettings,
	CampaignKind,
	ReferWinSettings
} from '$lib/helpers/promo-campaign-rules';
import {
	getAnnouncementBannerConfig,
	isAnnouncementBannerActive,
	saveAnnouncementBannerConfig
} from '$lib/services/announcement-banner';

const naira = (value: number) => `₦${value.toLocaleString('en-NG')}`;

/** The site-bar message for a campaign (short: the bar fits about one line on a phone). */
export function campaignBannerMessage(
	kind: CampaignKind,
	settings: ReferWinSettings | BigSpenderSettings
): { text: string; link: string } {
	if (kind === 'refer_win') {
		const referWin = settings as ReferWinSettings;
		return {
			text: `Refer & Win: get ${naira(referWin.rewardNgn)} store credit when a friend you refer spends ${naira(referWin.qualifyingCashNgn)}.`,
			link: '/dashboard?tab=affiliate'
		};
	}
	const bigSpender = settings as BigSpenderSettings;
	return {
		text: `BIGSPENDER: reach ${naira(bigSpender.thresholdNgn)} in orders and get ${naira(bigSpender.rewardNgn)} store credit, automatically.`,
		link: '/platforms'
	};
}

/** The banner showing right now, if any (so the owner sees what a launch would replace). */
export async function getCurrentBannerText(): Promise<string | null> {
	const config = await getAnnouncementBannerConfig();
	return isAnnouncementBannerActive(config) ? config.text : null;
}

/** Show the campaign in the site bar until the campaign's end date (if it has one). */
export async function announceCampaignInBanner(
	kind: CampaignKind,
	settings: ReferWinSettings | BigSpenderSettings
): Promise<void> {
	const current = await getAnnouncementBannerConfig();
	const message = campaignBannerMessage(kind, settings);
	await saveAnnouncementBannerConfig({
		enabled: true,
		text: message.text,
		link: message.link,
		dismissible: true,
		startsAt: '',
		endsAt: settings.endsAt ? dateToWatInput(new Date(settings.endsAt)) : '',
		// A new version so people who dismissed an older banner see this one.
		version: current.version + 1,
		timezone: 'Africa/Lagos'
	});
}

/** Take the campaign out of the site bar, but only if the bar is still showing that campaign. */
export async function withdrawCampaignBanner(
	kind: CampaignKind,
	settings: ReferWinSettings | BigSpenderSettings
): Promise<boolean> {
	const current = await getAnnouncementBannerConfig();
	const prefix = kind === 'refer_win' ? 'Refer & Win:' : 'BIGSPENDER:';
	if (!current.enabled || !current.text.startsWith(prefix)) return false;
	void settings;
	await saveAnnouncementBannerConfig({
		enabled: false,
		text: current.text,
		link: current.link,
		dismissible: current.dismissible,
		startsAt: '',
		endsAt: '',
		version: current.version,
		timezone: 'Africa/Lagos'
	});
	return true;
}
