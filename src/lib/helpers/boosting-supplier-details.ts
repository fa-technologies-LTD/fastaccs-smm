export interface BoostSupplierDetails {
	offerId: string;
	providers: Array<{
		id: 'smm_raja' | 'bulk_follows';
		label: string;
		balance: number | null;
		currency: string | null;
		balanceCheckedAt: string | null;
		enabled: boolean | null;
		healthPaused: boolean | null;
		services: Array<{
			id: string;
			serviceId: string;
			name: string;
			rateUsd: number | null;
			min: number | null;
			max: number | null;
			lastSeenAt: string;
			unavailable: boolean;
			state: string;
			approved: boolean;
			refillAdvertised: boolean;
			refillDaysClaimed: number | null;
			recordedVerifiedRefillDays: number | null;
			recordedObservations: number;
			consecutiveFailures: number;
		}>;
	}>;
}

export function supplierPackCost(
	rateUsd: number | null,
	fx: number,
	quantity: number
): number | null {
	if (
		rateUsd == null ||
		!Number.isFinite(rateUsd) ||
		rateUsd < 0 ||
		!Number.isFinite(fx) ||
		fx <= 0 ||
		!Number.isFinite(quantity) ||
		quantity <= 0
	)
		return null;
	const cost = (rateUsd * fx * quantity) / 1000;
	return Number.isFinite(cost) ? cost : null;
}
