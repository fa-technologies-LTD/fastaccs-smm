import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { sendCriticalAdminAlert } from './admin-alerts';
import * as pvapins from './pvapins';
import { getPhonePricingConfig } from './phone-pricing';
import {
	MAJOR_SERVICES,
	PVAPINS_EXPANSION_SERVICE_IDS,
	PVAPINS_ONLY_MARKET_CODES
} from './phone-catalog';
import {
	findPvapinsCountry,
	pvapinsAppsForService,
	serviceByHubId
} from './number-providers/service-map';
import { decodePvapinsRef, encodePvapinsRef } from './number-providers/pvapins-provider';
import { acquireRateToken, pvapinsRateSpec, PVAPINS_GET_NUMBER_BUCKET } from './rate-limiter';

const DAY_MS = 86_400_000;
const DEFAULT_DAILY_CAP = 8;
const DEFAULT_MIN_INTERVAL_MINUTES = 120;
const ACTIVE_BUYER_RENTAL_STATUSES = [
	'pending',
	'renting',
	'awaiting_sms',
	'cancelling',
	'replacing'
];
const PROBE_MARKETS: Record<string, string> = {
	US: 'United States',
	GB: 'United Kingdom',
	CA: 'Canada',
	NG: 'Nigeria',
	GH: 'Ghana',
	ZA: 'South Africa',
	IN: 'India',
	DE: 'Germany',
	AU: 'Australia',
	BR: 'Brazil',
	FR: 'France',
	PH: 'Philippines',
	AE: 'United Arab Emirates'
};

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
	const parsed = Math.floor(Number(value));
	return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function getPhoneCatalogProbePolicy() {
	return {
		dailyCap: boundedInteger(env.PHONE_CATALOG_PROBE_DAILY_CAP, DEFAULT_DAILY_CAP, 1, 12),
		minIntervalMinutes: boundedInteger(
			env.PHONE_CATALOG_PROBE_MIN_INTERVAL_MINUTES,
			DEFAULT_MIN_INTERVAL_MINUTES,
			30,
			24 * 60
		)
	};
}

async function promoteDeliveryProvenProbes(): Promise<number> {
	const received = await prisma.phoneAttempt.findMany({
		where: {
			provider: 'pvapins',
			outcome: 'otp_received',
			providerRef: { not: null },
			createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) }
		},
		select: { providerRef: true },
		orderBy: { createdAt: 'desc' },
		take: 500
	});
	let promoted = 0;
	const seen = new Set<string>();
	for (const row of received) {
		if (!row.providerRef) continue;
		const ref = decodePvapinsRef(row.providerRef);
		const key = `${ref.country}||${ref.app}`;
		if (!ref.country || !ref.app || seen.has(key)) continue;
		seen.add(key);
		const changed = await prisma.phoneCatalogProbe.updateMany({
			where: {
				provider: 'pvapins',
				providerServiceRef: ref.app,
				countryName: ref.country,
				status: { not: 'delivery_proven' }
			},
			data: { status: 'delivery_proven' }
		});
		promoted += changed.count;
	}
	return promoted;
}

async function countActiveBuyerRentals(): Promise<number> {
	return prisma.phoneRental.count({
		where: {
			status: { in: ACTIVE_BUYER_RENTAL_STATUSES },
			orderItem: {
				order: {
					paymentStatus: 'paid',
					deliveryStatus: { not: 'refunded' }
				}
			}
		}
	});
}

async function syncOneDiscoveryCountry(
	now: Date,
	intervalMinutes: number
): Promise<{
	countryCode: string | null;
	discovered: number;
}> {
	const configuredCodes = [...PVAPINS_ONLY_MARKET_CODES].filter((code) => PROBE_MARKETS[code]);
	if (configuredCodes.length === 0) return { countryCode: null, discovered: 0 };
	const slot = Math.floor(now.getTime() / (intervalMinutes * 60_000));
	const countryCode = configuredCodes[slot % configuredCodes.length];
	const countries = await pvapins.loadCountries();
	const country = findPvapinsCountry(countries, countryCode, PROBE_MARKETS[countryCode]);
	if (!country) return { countryCode, discovered: 0 };
	const apps = await pvapins.loadApps(country.id);
	let discovered = 0;
	for (const service of MAJOR_SERVICES) {
		if (!PVAPINS_EXPANSION_SERVICE_IDS.has(service.id)) continue;
		const mapping = serviceByHubId(service.id);
		if (!mapping) continue;
		const matches = pvapinsAppsForService(mapping.pvapinsPrefixes, apps);
		for (const app of matches) {
			await prisma.phoneCatalogProbe.upsert({
				where: {
					provider_providerServiceRef_countryName: {
						provider: 'pvapins',
						providerServiceRef: app.full_name,
						countryName: country.full_name
					}
				},
				create: {
					provider: 'pvapins',
					serviceId: service.id,
					serviceName: service.name,
					providerServiceRef: app.full_name,
					countryId: country.id,
					countryName: country.full_name,
					status: 'discovered',
					metadata: {
						countryCode,
						listedCostCents: pvapins.usdStringToCents(app.deduct),
						discoveredFromCatalogAt: now.toISOString()
					}
				},
				update: {
					serviceId: service.id,
					serviceName: service.name,
					countryId: country.id,
					metadata: {
						countryCode,
						listedCostCents: pvapins.usdStringToCents(app.deduct),
						lastSeenInCatalogAt: now.toISOString()
					}
				}
			});
			discovered += 1;
		}
	}
	return { countryCode, discovered };
}

/**
 * Controlled idle discovery: buyer work always wins, at most one upstream rent is attempted, a
 * strict daily cap applies, and any unconfirmed release pauses all future probes for review.
 * A successful probe marks a combination rentable; it never auto-publishes a storefront tier.
 */
export async function runPhoneCatalogProbe() {
	const now = new Date();
	const policy = getPhoneCatalogProbePolicy();
	if (!pvapins.isPvapinsConfigured()) return { skipped: 'pvapins_not_configured', policy };

	const promoted = await promoteDeliveryProvenProbes();
	const activeBuyerRentals = await countActiveBuyerRentals();
	if (activeBuyerRentals > 0) {
		return { skipped: 'buyer_fulfillment_active', activeBuyerRentals, promoted, policy };
	}

	const unresolvedRelease = await prisma.phoneCatalogProbe.findFirst({
		where: { status: 'release_failed', releaseConfirmed: false },
		select: { id: true, serviceName: true, countryName: true, providerServiceRef: true }
	});
	if (unresolvedRelease) {
		return { skipped: 'unresolved_probe_release', unresolvedRelease, promoted, policy };
	}

	const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const probesToday = await prisma.phoneCatalogProbeAttempt.count({
		where: { createdAt: { gte: dayStart } }
	});
	if (probesToday >= policy.dailyCap) {
		return { skipped: 'daily_cap', probesToday, promoted, policy };
	}

	const mostRecent = await prisma.phoneCatalogProbeAttempt.findFirst({
		orderBy: { createdAt: 'desc' },
		select: { createdAt: true }
	});
	if (
		mostRecent &&
		now.getTime() - mostRecent.createdAt.getTime() < policy.minIntervalMinutes * 60_000
	) {
		return { skipped: 'minimum_interval', probesToday, promoted, policy };
	}

	const discovery = await syncOneDiscoveryCountry(now, policy.minIntervalMinutes);
	// Catalog responses can take tens of seconds. Re-check immediately before consuming scarce
	// rent capacity so a buyer who arrived during discovery still wins.
	const buyersAfterDiscovery = await countActiveBuyerRentals();
	if (buyersAfterDiscovery > 0) {
		return {
			skipped: 'buyer_fulfillment_started_during_discovery',
			activeBuyerRentals: buyersAfterDiscovery,
			discovery,
			probesToday,
			promoted,
			policy
		};
	}
	const candidate = await prisma.phoneCatalogProbe.findFirst({
		where: {
			status: { in: ['discovered', 'unreliable', 'rentable'] },
			OR: [{ nextProbeAt: null }, { nextProbeAt: { lte: now } }]
		},
		orderBy: [{ lastProbedAt: 'asc' }, { createdAt: 'asc' }]
	});
	if (!candidate) return { skipped: 'no_due_candidate', discovery, probesToday, promoted, policy };

	const pricing = await getPhonePricingConfig();
	const token = await acquireRateToken(
		PVAPINS_GET_NUMBER_BUCKET,
		pvapinsRateSpec(pricing.pvapinsRateLimitPerMin)
	);
	if (!token)
		return { skipped: 'buyer_rate_capacity_reserved', discovery, probesToday, promoted, policy };

	let providerRef: string | null = null;
	try {
		const number = await pvapins.rentNumber({
			country: candidate.countryName,
			app: candidate.providerServiceRef
		});
		providerRef = encodePvapinsRef(number, candidate.countryName, candidate.providerServiceRef);
		const releaseConfirmed = await pvapins.rejectNumber({
			number,
			country: candidate.countryName,
			app: candidate.providerServiceRef
		});
		await prisma.$transaction([
			prisma.phoneCatalogProbe.update({
				where: { id: candidate.id },
				data: {
					status: releaseConfirmed ? 'rentable' : 'release_failed',
					successCount: { increment: 1 },
					lastProbedAt: now,
					lastRentableAt: now,
					nextProbeAt: releaseConfirmed ? new Date(now.getTime() + 7 * DAY_MS) : null,
					lastProviderRef: providerRef,
					releaseConfirmed
				}
			}),
			prisma.phoneCatalogProbeAttempt.create({
				data: {
					probeId: candidate.id,
					outcome: releaseConfirmed ? 'rentable_released' : 'rentable_release_failed',
					providerRef,
					releaseConfirmed
				}
			})
		]);
		if (!releaseConfirmed) {
			await sendCriticalAdminAlert({
				title: 'Numbers catalogue probe was not released',
				message: `The idle catalogue probe rented ${candidate.serviceName} / ${candidate.countryName} (${providerRef}) but PVAPins did not confirm release. Automated probes are paused until this exact hold is reviewed.`,
				source: 'phone-catalog-probe',
				dedupeKey: `phone-catalog-probe-release:${providerRef}`
			}).catch(() => undefined);
		}
		return {
			outcome: releaseConfirmed ? 'rentable_released' : 'rentable_release_failed',
			candidate: {
				service: candidate.serviceName,
				country: candidate.countryName,
				variant: candidate.providerServiceRef
			},
			discovery,
			probesToday: probesToday + 1,
			promoted,
			policy
		};
	} catch (error) {
		const message = error instanceof Error ? error.message.slice(0, 300) : 'Unknown probe failure';
		const outcome = providerRef ? 'error_after_rent' : 'rent_failed';
		if (providerRef) {
			console.error(
				`Catalogue probe error after PVAPins rent ${providerRef}; automated probes will be paused.`,
				error
			);
			await sendCriticalAdminAlert({
				title: 'Numbers catalogue probe errored after rent',
				message: `The idle catalogue probe obtained ${providerRef} for ${candidate.serviceName} / ${candidate.countryName}, then failed before release was durably confirmed. Automated probes are paused; reconcile this exact provider reference. Error: ${message}`,
				source: 'phone-catalog-probe',
				dedupeKey: `phone-catalog-probe-error-after-rent:${providerRef}`
			}).catch(() => undefined);
		}
		await prisma.$transaction([
			prisma.phoneCatalogProbe.update({
				where: { id: candidate.id },
				data: {
					status: providerRef ? 'release_failed' : 'unreliable',
					failureCount: { increment: 1 },
					lastProbedAt: now,
					lastFailureAt: now,
					nextProbeAt: providerRef ? null : new Date(now.getTime() + DAY_MS),
					lastProviderRef: providerRef,
					releaseConfirmed: providerRef ? false : null
				}
			}),
			prisma.phoneCatalogProbeAttempt.create({
				data: {
					probeId: candidate.id,
					outcome,
					providerRef,
					releaseConfirmed: providerRef ? false : null,
					errorMessage: message
				}
			})
		]);
		return {
			outcome,
			error: message,
			discovery,
			probesToday: probesToday + 1,
			promoted,
			policy
		};
	}
}

export async function getPhoneCatalogProbeSummary() {
	const [byStatus, recent] = await Promise.all([
		prisma.phoneCatalogProbe.groupBy({
			by: ['status'],
			_count: { _all: true }
		}),
		prisma.phoneCatalogProbe.findMany({
			where: { status: { in: ['rentable', 'delivery_proven', 'release_failed'] } },
			select: {
				serviceName: true,
				countryName: true,
				providerServiceRef: true,
				status: true,
				lastProbedAt: true,
				releaseConfirmed: true
			},
			orderBy: { lastProbedAt: 'desc' },
			take: 30
		})
	]);
	return {
		byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
		recent
	};
}
