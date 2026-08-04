import { hubmanProvider } from './hubman-provider';
import { pvapinsProvider } from './pvapins-provider';
import type { NumberProvider, NumberProviderId } from './types';

const PROVIDERS: Record<NumberProviderId, NumberProvider> = {
	hubman: hubmanProvider,
	pvapins: pvapinsProvider
};

/** The adapter for a given provider id (used to route poll/cancel/refund by a rental's source). */
export function getProvider(id: NumberProviderId): NumberProvider {
	return PROVIDERS[id];
}

export function allProviders(): NumberProvider[] {
	return Object.values(PROVIDERS);
}

/** Providers that have credentials in this environment — the candidates for source selection. */
export function configuredProviders(): NumberProvider[] {
	return allProviders().filter((p) => p.isConfigured());
}

/** A PhoneRental row's fields needed to route poll/cancel back to the right source. */
export interface RentalRouting {
	provider: string;
	providerRef: string | null;
	hubOrderUuid: string | null;
}

/** The adapter that served a given rental (defaults to hub-man for legacy/unknown rows). */
export function providerForRental(rental: Pick<RentalRouting, 'provider'>): NumberProvider {
	return getProvider(rental.provider === 'pvapins' ? 'pvapins' : 'hubman');
}

/** The opaque handle to poll/cancel a rental: pvapins uses providerRef, hub-man uses its uuid. */
export function refForRental(rental: RentalRouting): string | null {
	return rental.provider === 'pvapins' ? rental.providerRef : rental.hubOrderUuid;
}

export * from './types';
export { encodePvapinsRef, decodePvapinsRef } from './pvapins-provider';
export { buildLiveCandidatePool } from './live-pool';
export { type Candidate, rankCandidates, poolFloorCostCents } from './selection';
