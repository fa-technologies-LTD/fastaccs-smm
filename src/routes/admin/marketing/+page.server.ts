import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { canViewRevenue } from '$lib/services/admin-revenue-visibility';
import { getCampaignReport } from '$lib/services/marketing/campaign-report';
import { DEFAULT_THRESHOLDS } from '$lib/services/marketing/rules';
import { platformDisplayName } from '$lib/helpers/platform-seo';

const WINDOWS = [7, 30, 90] as const;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!canViewRevenue(locals)) {
		throw error(403, 'Marketing results are only visible to admins who can view revenue.');
	}

	const requested = Number(url.searchParams.get('days'));
	const windowDays = (WINDOWS as readonly number[]).includes(requested) ? requested : 30;

	const [report, platforms] = await Promise.all([
		getCampaignReport(windowDays),
		prisma.category.findMany({
			where: { categoryType: 'platform', isActive: true },
			select: { name: true, slug: true },
			orderBy: { sortOrder: 'asc' }
		})
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
		windows: [...WINDOWS],
		thresholds: DEFAULT_THRESHOLDS,
		landingOptions,
		siteUrl: url.origin
	};
};
