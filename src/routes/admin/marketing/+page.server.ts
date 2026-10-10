import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { canViewRevenue } from '$lib/services/admin-revenue-visibility';
import { getCampaignReport } from '$lib/services/marketing/campaign-report';
import { DEFAULT_THRESHOLDS } from '$lib/services/marketing/rules';
import { getSpendTotals } from '$lib/services/marketing/spend-ledger';
import { listChannels } from '$lib/services/marketing/channels';
import { getPlacementReport, listHeldPostbacks } from '$lib/services/marketing/placement-report';
import { getPropellerToken } from '$lib/services/marketing/spend-sources/propellerads';
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

	const requested = Number(url.searchParams.get('days'));
	const windowDays = (WINDOWS as readonly number[]).includes(requested) ? requested : 30;
	const since = new Date(Date.now() - windowDays * 86_400_000);

	const [report, platforms, spend, placements, channels, held] = await Promise.all([
		getCampaignReport(windowDays),
		prisma.category.findMany({
			where: { categoryType: 'platform', isActive: true },
			select: { name: true, slug: true },
			orderBy: { sortOrder: 'asc' }
		}),
		optional(getSpendTotals(since), []),
		optional(getPlacementReport(since), []),
		optional(listChannels(), []),
		optional(listHeldPostbacks(), [])
	]);

	const spendByCampaign: Record<string, number> = {};
	for (const row of spend.value) {
		const key = `${row.channelKey}|${row.campaignKey}`;
		spendByCampaign[key] = (spendByCampaign[key] ?? 0) + row.spendNgn;
	}

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
		windows: [...WINDOWS],
		thresholds: DEFAULT_THRESHOLDS,
		landingOptions,
		siteUrl: url.origin,
		spendByCampaign,
		placements: placements.value,
		channels: channels.value,
		heldPostbacks: held.value,
		spendTrackingReady: spend.ok && channels.ok,
		canManage: hasAdminPermission(locals.adminContext, 'admin:settings:manage'),
		propellerConfigured: Boolean(getPropellerToken())
	};
};
