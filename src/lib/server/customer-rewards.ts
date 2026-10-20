import type { CustomerRewards } from '$lib/helpers/customer-rewards';
import { getFirstOrderOffer } from '$lib/services/promotions';
import { getBigSpenderProgress, getReferWinOffer } from '$lib/services/promo-campaigns';

export type { CustomerRewards };

/** Each part is best-effort: a failing lookup hides that line, never the dashboard. */
export async function getCustomerRewards(userId: string): Promise<CustomerRewards> {
	const [offer, bigSpender, referWin] = await Promise.all([
		getFirstOrderOffer(userId).catch(() => null),
		getBigSpenderProgress(userId).catch(() => null),
		getReferWinOffer().catch(() => null)
	]);
	return {
		firstOrderOffer: offer ? { code: offer.code, label: offer.label } : null,
		bigSpender,
		referWin
	};
}
