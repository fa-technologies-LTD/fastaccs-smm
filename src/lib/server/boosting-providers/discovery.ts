import { bulkFollowsClient } from './bulk-follows';
import { BoostProviderError } from './panel-client';
import { smmRajaClient } from './smm-raja';
import {
	BOOST_CATALOG_OUTCOMES,
	BOOST_CATALOG_PLATFORMS,
	BOOST_PROVIDER_IDS,
	type BoostCoverageCell,
	type BoostProviderDiscovery,
	type BoostProviderDiscoverySummary,
	type BoostProviderId,
	type BoostProviderReadClient,
	type BoostProviderService
} from './types';

const CACHE_TTL_MS = 15 * 60_000;
const DEFAULT_CLIENTS: BoostProviderReadClient[] = [smmRajaClient, bulkFollowsClient];

let cachedDiscovery: { expiresAt: number; value: BoostProviderDiscovery } | null = null;
let inFlightDiscovery: Promise<BoostProviderDiscovery> | null = null;

function safeError(error: unknown): string {
	if (error instanceof BoostProviderError) return error.message;
	return 'Supplier catalogue is temporarily unavailable.';
}

async function readProvider(client: BoostProviderReadClient): Promise<{
	summary: BoostProviderDiscoverySummary;
	services: BoostProviderService[];
}> {
	if (!client.isConfigured()) {
		return {
			summary: {
				id: client.id,
				label: client.label,
				configured: false,
				status: 'not_configured',
				fetchedAt: null,
				durationMs: null,
				balance: null,
				currency: null,
				totalServices: 0,
				readyForReview: 0,
				needsClassification: 0,
				quarantined: 0,
				error: null
			},
			services: []
		};
	}

	const startedAt = Date.now();
	try {
		const [services, balanceResult] = await Promise.all([
			client.listServices(),
			client.getBalance().then(
				(balance) => ({ balance, error: null }),
				(error: unknown) => ({ balance: null, error: safeError(error) })
			)
		]);
		const fetchedAt = new Date().toISOString();
		return {
			summary: {
				id: client.id,
				label: client.label,
				configured: true,
				status: 'ready',
				fetchedAt,
				durationMs: Date.now() - startedAt,
				balance: balanceResult.balance?.amount ?? null,
				currency: balanceResult.balance?.currency ?? null,
				totalServices: services.length,
				readyForReview: services.filter((service) => service.status === 'ready_for_review').length,
				needsClassification: services.filter((service) => service.status === 'needs_classification')
					.length,
				quarantined: services.filter((service) => service.status === 'quarantined').length,
				error: balanceResult.error
			},
			services
		};
	} catch (error) {
		return {
			summary: {
				id: client.id,
				label: client.label,
				configured: true,
				status: 'unavailable',
				fetchedAt: null,
				durationMs: Date.now() - startedAt,
				balance: null,
				currency: null,
				totalServices: 0,
				readyForReview: 0,
				needsClassification: 0,
				quarantined: 0,
				error: safeError(error)
			},
			services: []
		};
	}
}

export function buildBoostCoverage(services: BoostProviderService[]): BoostCoverageCell[] {
	const rows: BoostCoverageCell[] = [];
	for (const platform of BOOST_CATALOG_PLATFORMS) {
		for (const outcome of BOOST_CATALOG_OUTCOMES) {
			const matches = services.filter(
				(service) =>
					service.status !== 'quarantined' &&
					service.platforms.includes(platform) &&
					service.outcomes.includes(outcome)
			);
			if (!matches.length) continue;
			const byProvider = Object.fromEntries(
				BOOST_PROVIDER_IDS.map((provider) => [
					provider,
					matches.filter((service) => service.provider === provider).length
				])
			) as Record<BoostProviderId, number>;
			rows.push({
				platform,
				outcome,
				total: matches.length,
				readyForReview: matches.filter((service) => service.status === 'ready_for_review').length,
				byProvider
			});
		}
	}
	return rows;
}

async function readDiscovery(clients: BoostProviderReadClient[]): Promise<BoostProviderDiscovery> {
	const providerResults = await Promise.all(clients.map(readProvider));
	const services = providerResults.flatMap((result) => result.services);
	return {
		fetchedAt: new Date().toISOString(),
		providers: providerResults.map((result) => result.summary),
		coverage: buildBoostCoverage(services)
	};
}

export async function getBoostProviderDiscovery(options?: {
	force?: boolean;
	clients?: BoostProviderReadClient[];
}): Promise<BoostProviderDiscovery> {
	const clients = options?.clients ?? DEFAULT_CLIENTS;
	const useCache = !options?.clients;
	if (!options?.force && useCache && cachedDiscovery && cachedDiscovery.expiresAt > Date.now()) {
		return cachedDiscovery.value;
	}
	if (!options?.force && useCache && inFlightDiscovery) return inFlightDiscovery;

	const read = readDiscovery(clients);
	if (!useCache) return read;
	inFlightDiscovery = read;
	try {
		const value = await read;
		cachedDiscovery = { value, expiresAt: Date.now() + CACHE_TTL_MS };
		return value;
	} finally {
		inFlightDiscovery = null;
	}
}

export function clearBoostProviderDiscoveryCache(): void {
	cachedDiscovery = null;
	inFlightDiscovery = null;
}
