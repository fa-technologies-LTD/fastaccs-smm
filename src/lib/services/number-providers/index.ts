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

export * from './types';
export { encodePvapinsRef, decodePvapinsRef } from './pvapins-provider';
