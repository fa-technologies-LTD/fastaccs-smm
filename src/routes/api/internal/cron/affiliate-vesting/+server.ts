import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { vestMaturedAffiliateRewards } from '$lib/services/affiliate-vesting';
import { recoverAffiliateRewardIntegrity } from '$lib/services/affiliate';

// Promotes matured pending affiliate rewards to available (and voids any whose order was
// refunded in the meantime). Scheduled every few hours; vesting is 14 days so cadence
// precision is not critical.
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'affiliate-vesting',
		work: async () => {
			// Repair a missed settlement/refund obligation before allowing any matured
			// reward to become spendable or withdrawable.
			const integrity = await recoverAffiliateRewardIntegrity(500);
			const vesting = await vestMaturedAffiliateRewards(500);
			return { integrity, vesting };
		}
	});
