import type { BoostingActionType, BoostingPlatform } from './social-link-validator';

export type BoostMappingPolicy = 'automatic' | 'preferred' | 'locked';
export type BoostMappingRouteState = 'shadow' | 'enabled' | 'paused';

export interface BoostMappingOfferDraft {
	qualityTier: string;
	customerName: string;
	shortPromise: string;
	refillDays: number | null;
	pricePerStepNgn: number;
	priceLocked: boolean;
	minimumMarginPercent: number;
	normalCostTargetNgn: number;
	maximumSupplierCostNgn: number;
	attemptCap: number;
	fallbackMode: 'none' | 'automatic' | 'manual';
	status: 'hidden' | 'reviewed' | 'live';
	routingPolicy: BoostMappingPolicy;
	preferredProviderServiceId: string | null;
	lockedProviderServiceId: string | null;
}

export interface BoostMappingRouteDraft {
	providerServiceId: string;
	state: BoostMappingRouteState;
	equivalenceApproved: boolean;
	verifiedSignals: string[];
	audienceTags: string[];
	verifiedRefillDays: number | null;
	maximumPilotQuantity: number | null;
	expectedRecoveryCostPercent: number;
}

export interface BoostMappingCandidate {
	id: string;
	provider: 'smm_raja' | 'bulk_follows';
	providerLabel: string;
	serviceId: string;
	name: string;
	category: string;
	providerType: string | null;
	ratePerThousand: number;
	minQuantity: number;
	maxQuantity: number;
	refillAdvertised: boolean | null;
	refillDaysClaimed: number | null;
	cancelAdvertised: boolean | null;
	dripfeedAdvertised: boolean | null;
	qualitySignals: string[];
	catalogueStatus: string;
	lastSeenAt: string;
	mappedRoute: (BoostMappingRouteDraft & { id: string }) | null;
}

export interface BoostServiceLookupResult {
	found: boolean;
	compatible: boolean;
	issues: string[];
	service: BoostMappingCandidate | null;
}

export interface BoostMappingWorkspace {
	foundationReady: boolean;
	migrationMessage: string | null;
	selectedQualityTier: 'value' | 'stable' | 'premium';
	category: {
		id: string;
		name: string;
		platform: BoostingPlatform;
		outcome: BoostingActionType;
		minQuantity: number;
		stepQuantity: number;
		pricePerStepNgn: number;
		refillDays: number | null;
	};
	offer: (BoostMappingOfferDraft & { id: string }) | null;
	candidates: BoostMappingCandidate[];
	candidateCount: number;
	configuredFxNgnPerUsd: number;
	configuredCurrencyBufferPercent: number;
	configuredDefaultMarginPercent: number;
}

export interface BoostMappingSaveInput {
	offer: BoostMappingOfferDraft;
	routes: BoostMappingRouteDraft[];
}
