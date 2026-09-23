import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { exactRouteReliabilityKey } from './number-providers/reliability';

export interface PhoneSupplierCatalogRouteInput {
	provider: string;
	serviceId: number;
	serviceName: string;
	countryId: number;
	countryName: string;
	providerServiceRef: string;
	providerCountryRef: string;
	costCents: number;
	available: number;
	stockConfidence: 'confirmed' | 'listed';
}

export interface PhoneSupplierCatalogScope {
	provider: string;
	countryId: number;
	serviceIds: number[];
}

export function phoneSupplierCatalogRouteKey(
	route: Pick<
		PhoneSupplierCatalogRouteInput,
		'provider' | 'providerServiceRef' | 'serviceId' | 'countryId'
	>
): string {
	return exactRouteReliabilityKey(
		route.provider,
		route.providerServiceRef,
		route.serviceId,
		route.countryId
	);
}

const WRITE_BATCH_SIZE = 250;

function batches<T>(values: T[], size: number): T[][] {
	const output: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		output.push(values.slice(index, index + size));
	}
	return output;
}

function routeRow(route: PhoneSupplierCatalogRouteInput, syncedAt: Date): Prisma.Sql {
	return Prisma.sql`(
		${phoneSupplierCatalogRouteKey(route)},
		${route.provider},
		${route.serviceId},
		${route.serviceName},
		${route.countryId},
		${route.countryName},
		${route.providerServiceRef},
		${route.providerCountryRef},
		${route.costCents},
		${route.available},
		${route.stockConfidence},
		${syncedAt},
		${syncedAt},
		${syncedAt},
		${syncedAt}
	)`;
}

function scopeKey(provider: string, serviceId: number, countryId: number): string {
	return `${provider}:scope:${serviceId}:${countryId}`;
}

interface NormalizedScope {
	provider: string;
	serviceId: number;
	countryId: number;
	routeCount: number;
}

function scopeRow(scope: NormalizedScope, syncedAt: Date): Prisma.Sql {
	return Prisma.sql`(
		${scopeKey(scope.provider, scope.serviceId, scope.countryId)},
		${scope.provider},
		${scope.serviceId},
		${scope.countryId},
		${scope.routeCount},
		${syncedAt},
		${syncedAt},
		${syncedAt}
	)`;
}

/**
 * Replace only catalogue scopes that were read successfully. A provider/country fetch failure is
 * intentionally omitted from `scopes`, preserving its last trustworthy snapshot instead of
 * converting a network blip into false zero-stock data.
 */
export async function persistPhoneSupplierCatalogSnapshot(input: {
	routes: PhoneSupplierCatalogRouteInput[];
	scopes: PhoneSupplierCatalogScope[];
	syncedAt?: Date;
	database?: PrismaClient;
}): Promise<void> {
	const database = input.database ?? prisma;
	const syncedAt = input.syncedAt ?? new Date();
	// Supplier catalogues occasionally repeat a variant. PostgreSQL cannot update the same conflict
	// target twice inside one INSERT, so normalize to one current row per exact route first.
	const routeByKey = new Map<string, PhoneSupplierCatalogRouteInput>();
	for (const route of input.routes) {
		if (
			route.costCents <= 0 ||
			route.available <= 0 ||
			!Number.isInteger(route.serviceId) ||
			!Number.isInteger(route.countryId)
		)
			continue;
		routeByKey.set(phoneSupplierCatalogRouteKey(route), route);
	}
	const routes = [...routeByKey.values()];

	// One durable scope row per successful provider/service/country read. This is deliberately
	// persisted even when routeCount is zero so "confirmed empty" is distinct from "never fetched".
	const routeCountByScope = new Map<string, number>();
	for (const route of routes) {
		const key = scopeKey(route.provider, route.serviceId, route.countryId);
		routeCountByScope.set(key, (routeCountByScope.get(key) ?? 0) + 1);
	}
	const normalizedScopeByKey = new Map<string, NormalizedScope>();
	for (const scope of input.scopes) {
		if (!scope.provider || !Number.isInteger(scope.countryId)) continue;
		for (const serviceId of new Set(scope.serviceIds.filter(Number.isInteger))) {
			const key = scopeKey(scope.provider, serviceId, scope.countryId);
			normalizedScopeByKey.set(key, {
				provider: scope.provider,
				serviceId,
				countryId: scope.countryId,
				routeCount: routeCountByScope.get(key) ?? 0
			});
		}
	}
	const normalizedScopes = [...normalizedScopeByKey.values()];

	await database.$transaction(
		async (tx) => {
			for (const batch of batches(routes, WRITE_BATCH_SIZE)) {
				await tx.$executeRaw(Prisma.sql`
					INSERT INTO "phone_supplier_catalog_routes" (
						"route_key", "provider", "service_id", "service_name", "country_id",
						"country_name", "provider_service_ref", "provider_country_ref", "cost_cents",
						"available", "stock_confidence", "first_seen_at", "last_seen_at",
						"created_at", "updated_at"
					)
					VALUES ${Prisma.join(batch.map((route) => routeRow(route, syncedAt)))}
					ON CONFLICT ("route_key") DO UPDATE SET
						"service_name" = EXCLUDED."service_name",
						"country_name" = EXCLUDED."country_name",
						"provider_country_ref" = EXCLUDED."provider_country_ref",
						"cost_cents" = EXCLUDED."cost_cents",
						"available" = EXCLUDED."available",
						"stock_confidence" = EXCLUDED."stock_confidence",
						"last_seen_at" = EXCLUDED."last_seen_at",
						"unavailable_at" = NULL,
						"updated_at" = EXCLUDED."updated_at"
				`);
			}

			for (const batch of batches(normalizedScopes, WRITE_BATCH_SIZE)) {
				await tx.$executeRaw(Prisma.sql`
					INSERT INTO "phone_supplier_catalog_scopes" (
						"scope_key", "provider", "service_id", "country_id", "route_count",
						"refreshed_at", "created_at", "updated_at"
					)
					VALUES ${Prisma.join(batch.map((scope) => scopeRow(scope, syncedAt)))}
					ON CONFLICT ("scope_key") DO UPDATE SET
						"route_count" = EXCLUDED."route_count",
						"refreshed_at" = EXCLUDED."refreshed_at",
						"updated_at" = EXCLUDED."updated_at"
				`);
			}

			for (const scope of input.scopes) {
				const serviceIds = [...new Set(scope.serviceIds.filter(Number.isInteger))];
				if (serviceIds.length === 0) continue;
				const seenKeys = routes
					.filter(
						(route) =>
							route.provider === scope.provider &&
							route.countryId === scope.countryId &&
							serviceIds.includes(route.serviceId)
					)
					.map(phoneSupplierCatalogRouteKey);
				await tx.phoneSupplierCatalogRoute.updateMany({
					where: {
						provider: scope.provider,
						countryId: scope.countryId,
						serviceId: { in: serviceIds },
						unavailableAt: null,
						...(seenKeys.length > 0 ? { routeKey: { notIn: seenKeys } } : {})
					},
					data: { unavailableAt: syncedAt }
				});
			}
		},
		{ timeout: 60_000 }
	);
}
