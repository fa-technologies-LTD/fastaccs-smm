import type { PageServerLoad } from './$types';
import { getAffiliateConfig } from '$lib/services/affiliate';

export const load: PageServerLoad = async () => {
	const config = await getAffiliateConfig().catch(() => ({
		payoutMinimum: 10_000,
		payoutMinAccountAgeDays: 15
	}));
	return {
		payoutMinimum: config.payoutMinimum,
		payoutMinAccountAgeDays: config.payoutMinAccountAgeDays
	};
};
