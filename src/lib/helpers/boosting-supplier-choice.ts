import type { BoostPricingQuote } from './boosting-pricing-sheet';

export interface BoostSupplierChoice extends BoostPricingQuote {
	provider: 'smm_raja' | 'bulk_follows';
	serviceId: string;
	revision: string;
	refillAdvertised: boolean;
	refillDaysClaimed: number | null;
	publicationIssues?: string[];
}

export interface BoostSupplierChoices {
	services: BoostSupplierChoice[];
	hasMore: boolean;
}
