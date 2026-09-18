export const BOOST_PROVIDER_IDS = ['smm_raja', 'bulk_follows'] as const;
export type BoostProviderId = (typeof BOOST_PROVIDER_IDS)[number];

export const BOOST_CATALOG_PLATFORMS = [
	'instagram',
	'tiktok',
	'youtube',
	'facebook',
	'x',
	'spotify',
	'telegram'
] as const;
export type BoostCatalogPlatform = (typeof BOOST_CATALOG_PLATFORMS)[number];

export const BOOST_CATALOG_OUTCOMES = [
	'followers',
	'subscribers',
	'members',
	'views',
	'streams',
	'monthly_listeners',
	'likes',
	'reactions',
	'shares',
	'reposts',
	'comments',
	'saves',
	'watch_time'
] as const;
export type BoostCatalogOutcome = (typeof BOOST_CATALOG_OUTCOMES)[number];

export type BoostTargetType = 'profile' | 'content' | 'channel' | 'unknown';
export type BoostCatalogStatus = 'ready_for_review' | 'needs_classification' | 'quarantined';

export type BoostCatalogAnomaly =
	| 'missing_service_id'
	| 'missing_name'
	| 'invalid_rate'
	| 'suspicious_rate'
	| 'invalid_minimum'
	| 'invalid_maximum'
	| 'invalid_quantity_range'
	| 'unknown_platform'
	| 'ambiguous_platform'
	| 'unknown_outcome'
	| 'ambiguous_outcome';

export interface BoostProviderService {
	provider: BoostProviderId;
	serviceId: string;
	name: string;
	category: string;
	description: string | null;
	providerType: string | null;
	ratePerThousand: number | null;
	minQuantity: number | null;
	maxQuantity: number | null;
	refillAdvertised: boolean | null;
	cancelAdvertised: boolean | null;
	dripfeedAdvertised: boolean | null;
	platforms: BoostCatalogPlatform[];
	outcomes: BoostCatalogOutcome[];
	targetType: BoostTargetType;
	qualitySignals: string[];
	anomalies: BoostCatalogAnomaly[];
	status: BoostCatalogStatus;
	fingerprint: string;
}

export interface BoostProviderBalance {
	provider: BoostProviderId;
	amount: number;
	currency: string;
}

export interface SubmitBoostOrder {
	serviceId: string;
	targetUrl: string;
	quantity: number;
}

export interface SubmitBoostOrderResult {
	provider: BoostProviderId;
	providerOrderId: string;
}

export type BoostProviderOrderState =
	| 'pending'
	| 'in_progress'
	| 'completed'
	| 'partial'
	| 'cancelled'
	| 'refunded'
	| 'failed'
	| 'unknown';

export interface BoostProviderOrderStatus {
	provider: BoostProviderId;
	providerOrderId: string;
	state: BoostProviderOrderState;
	rawStatus: string | null;
	charge: number | null;
	currency: string | null;
	startCount: number | null;
	remains: number | null;
	error: string | null;
}

export interface BoostProviderOrderClient {
	readonly id: BoostProviderId;
	submitOrder(input: SubmitBoostOrder): Promise<SubmitBoostOrderResult>;
	getStatuses(providerOrderIds: string[]): Promise<BoostProviderOrderStatus[]>;
}

export interface BoostProviderReadClient {
	readonly id: BoostProviderId;
	readonly label: string;
	isConfigured(): boolean;
	listServices(): Promise<BoostProviderService[]>;
	getBalance(): Promise<BoostProviderBalance>;
}

export interface BoostProviderDiscoverySummary {
	id: BoostProviderId;
	label: string;
	configured: boolean;
	status: 'ready' | 'not_configured' | 'unavailable';
	fetchedAt: string | null;
	durationMs: number | null;
	balance: number | null;
	currency: string | null;
	totalServices: number;
	readyForReview: number;
	needsClassification: number;
	quarantined: number;
	error: string | null;
}

export interface BoostCoverageCell {
	platform: BoostCatalogPlatform;
	outcome: BoostCatalogOutcome;
	total: number;
	readyForReview: number;
	byProvider: Record<BoostProviderId, number>;
}

export interface BoostProviderDiscovery {
	fetchedAt: string;
	providers: BoostProviderDiscoverySummary[];
	coverage: BoostCoverageCell[];
}
