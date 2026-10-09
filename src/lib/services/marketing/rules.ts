/**
 * Kill / prune / scale decisions for a paid channel or placement. Pure (no I/O) so the admin page
 * can evaluate typed-in spend instantly and the optimizer cron can reuse it later.
 */

export type MarketingAction = 'kill' | 'prune' | 'scale' | 'hold';

export interface MarketingThresholds {
	targetCacNgn: number; // pays back on the first order
	ceilingCacNgn: number; // most we'll pay for a buyer, counting repeat purchases
	killAtNgn: number; // spend with zero buyers that ends a test
	minBuyersToScale: number;
	scaleStepPct: number;
}

// Account margin ≈44%, first order ≈₦6,000, lifetime revenue ≈₦24,000 per buyer (Oct 2026).
export const DEFAULT_THRESHOLDS: MarketingThresholds = {
	targetCacNgn: 2600,
	ceilingCacNgn: 5000,
	killAtNgn: 8000,
	minBuyersToScale: 3,
	scaleStepPct: 30
};

export interface MarketingDecision {
	action: MarketingAction;
	cacNgn: number | null;
	reason: string;
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

export function decide(
	input: { spendNgn: number; buyers: number },
	thresholds: MarketingThresholds = DEFAULT_THRESHOLDS
): MarketingDecision {
	const spend = Math.max(0, Number(input.spendNgn) || 0);
	const buyers = Math.max(0, Math.floor(Number(input.buyers) || 0));
	const { targetCacNgn, ceilingCacNgn, killAtNgn, minBuyersToScale, scaleStepPct } = thresholds;

	if (spend === 0) {
		return { action: 'hold', cacNgn: null, reason: 'No spend recorded yet.' };
	}

	if (buyers === 0) {
		if (spend >= killAtNgn) {
			return {
				action: 'kill',
				cacNgn: null,
				reason: `Spent ${naira(spend)} with no buyers (limit ${naira(killAtNgn)}). Stop it.`
			};
		}
		return {
			action: 'hold',
			cacNgn: null,
			reason: `No buyers yet. ${naira(killAtNgn - spend)} left before the kill limit.`
		};
	}

	const cac = spend / buyers;

	if (cac <= targetCacNgn) {
		if (buyers >= minBuyersToScale) {
			return {
				action: 'scale',
				cacNgn: cac,
				reason: `${naira(cac)} per buyer is within the ${naira(targetCacNgn)} target across ${buyers} buyers. Raise budget ${scaleStepPct}%.`
			};
		}
		return {
			action: 'hold',
			cacNgn: cac,
			reason: `On target, but only ${buyers} buyer${buyers === 1 ? '' : 's'}. Keep running to confirm.`
		};
	}

	if (cac > ceilingCacNgn && spend >= killAtNgn) {
		return {
			action: 'kill',
			cacNgn: cac,
			reason: `${naira(cac)} per buyer is above the ${naira(ceilingCacNgn)} ceiling. Stop it.`
		};
	}

	return {
		action: 'prune',
		cacNgn: cac,
		reason: `${naira(cac)} per buyer is above the ${naira(targetCacNgn)} target. Cut the weakest placements and run one more round.`
	};
}
