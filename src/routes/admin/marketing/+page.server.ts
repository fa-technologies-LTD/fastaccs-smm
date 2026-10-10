import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { canViewRevenue } from '$lib/services/admin-revenue-visibility';
import { getBusinessTimezoneSetting } from '$lib/services/admin-settings';
import { getCampaignReport } from '$lib/services/marketing/campaign-report';
import { DEFAULT_THRESHOLDS } from '$lib/services/marketing/rules';
import { listChannels, toChannelView } from '$lib/services/marketing/channels';
import { getPlacementReport, listHeldPostbacks } from '$lib/services/marketing/placement-report';
import { getPropellerToken } from '$lib/services/marketing/spend-sources/propellerads';
import { businessWindow } from '$lib/services/marketing/window';
import { platformDisplayName } from '$lib/helpers/platform-seo';

const WINDOWS = [7, 30, 90] as const;

// The marketing tables arrive with their own migration; until it is applied the page still
// shows signup/revenue reporting and explains that spend tracking isn't set up yet.
async function optional<T>(work: Promise<T>, fallback: T): Promise<{ value: T; ok: boolean }> {
	try {
		return { value: await work, ok: true };
	} catch (cause) {
		console.warn('[admin.marketing] optional data unavailable:', (cause as Error)?.message);
		return { value: fallback, ok: false };
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!canViewRevenue(locals)) {
		throw error(403, 'Marketing results are only visible to admins who can view revenue.');
	}
	const canManage = hasAdminPermission(locals.adminContext, 'admin:settings:manage');

	const requested = Number(url.searchParams.get('days'));
	const windowDays = (WINDOWS as readonly number[]).includes(requested) ? requested : 30;
	const timeZone = await getBusinessTimezoneSetting().catch(() => 'Africa/Lagos');
	const window = businessWindow(windowDays, new Date(), timeZone);

	const [report, platforms, placements, channels, held] = await Promise.all([
		getCampaignReport(window),
		prisma.category.findMany({
			where: { categoryType: 'platform', isActive: true },
			select: { name: true, slug: true },
			orderBy: { sortOrder: 'asc' }
		}),
		optional(getPlacementReport(window), []),
		optional(listChannels(), []),
		optional(listHeldPostbacks(), [])
	]);

	const landingOptions = [
		{ label: 'Homepage', path: '/' },
		{ label: 'All accounts', path: '/platforms' },
		...platforms.map((platform) => ({
			label: `${platformDisplayName(platform.name, platform.slug)} accounts`,
			path: `/platforms/${platform.slug}`
		})),
		{ label: 'Verification numbers', path: '/numbers' }
	];

	return {
		report,
		window: { days: window.days, sinceDay: window.sinceDay, timeZone },
		windows: [...WINDOWS],
		thresholds: DEFAULT_THRESHOLDS,
		landingOptions,
		siteUrl: url.origin,
		placements: placements.value,
		channels: channels.value.map((channel) => toChannelView(channel, canManage)),
		heldPostbacks: held.value,
		spendTrackingReady: placements.ok && channels.ok,
		canManage,
		propellerConfigured: Boolean(getPropellerToken())
	};
};
