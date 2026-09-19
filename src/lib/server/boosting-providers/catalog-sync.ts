import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { bulkFollowsClient } from './bulk-follows';
import { BoostProviderError } from './panel-client';
import { smmRajaClient } from './smm-raja';
import type { BoostProviderId, BoostProviderReadClient, BoostProviderService } from './types';

const WRITE_BATCH_SIZE = 250;
const DEFAULT_CLIENTS: BoostProviderReadClient[] = [smmRajaClient, bulkFollowsClient];

export interface BoostCatalogSyncResult {
	provider: BoostProviderId;
	status: 'synced' | 'not_configured' | 'failed';
	servicesSeen: number;
	servicesMarkedUnavailable: number;
	balance: number | null;
	currency: string | null;
	balanceWarning: string | null;
	error: string | null;
	finishedAt: string;
}

interface CatalogSyncOptions {
	clients?: BoostProviderReadClient[];
	database?: PrismaClient;
	now?: () => Date;
	sleep?: (milliseconds: number) => Promise<void>;
}

const DATABASE_RETRY_DELAYS_MS = [1_000, 3_000] as const;

function safeError(error: unknown): string {
	if (error instanceof BoostProviderError) return error.message;
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		return `Supplier catalogue database write failed (${error.code}).`;
	}
	if (error instanceof Prisma.PrismaClientInitializationError) {
		return 'Supplier catalogue database connection failed.';
	}
	return 'Supplier catalogue sync failed.';
}

function databaseErrorCode(error: unknown): string | null {
	if (!error || typeof error !== 'object') return null;
	const value = error as { code?: unknown; errorCode?: unknown };
	const code = typeof value.code === 'string' ? value.code : value.errorCode;
	return typeof code === 'string' ? code : null;
}

function isRetryableDatabaseError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const name = 'name' in error ? String(error.name) : '';
	return (
		name === 'PrismaClientInitializationError' ||
		['P1001', 'P1002', 'P2024', 'P2028'].includes(databaseErrorCode(error) || '')
	);
}

async function withDatabaseRetry<T>(
	operation: () => Promise<T>,
	sleep: (milliseconds: number) => Promise<void>
): Promise<T> {
	for (let attempt = 0; ; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			const delay = DATABASE_RETRY_DELAYS_MS[attempt];
			if (delay === undefined || !isRetryableDatabaseError(error)) throw error;
			await sleep(delay);
		}
	}
}

function catalogueFingerprint(services: BoostProviderService[]): string {
	const fingerprints = services.map((service) => service.fingerprint).sort();
	return createHash('sha256').update(fingerprints.join('\n')).digest('hex');
}

function batches<T>(values: T[], size: number): T[][] {
	const output: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		output.push(values.slice(index, index + size));
	}
	return output;
}

function textArray(values: string[]): Prisma.Sql {
	if (values.length === 0) return Prisma.sql`ARRAY[]::text[]`;
	return Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]`;
}

function serviceRow(service: BoostProviderService, syncedAt: Date): Prisma.Sql {
	return Prisma.sql`(
		${service.provider},
		${service.serviceId},
		${service.name},
		${service.category},
		${service.description},
		${service.providerType},
		${service.ratePerThousand},
		${service.minQuantity},
		${service.maxQuantity},
		${service.refillAdvertised},
		${service.cancelAdvertised},
		${service.dripfeedAdvertised},
		${textArray(service.platforms)},
		${textArray(service.outcomes)},
		${service.targetType},
		${textArray(service.qualitySignals)},
		${textArray(service.anomalies)},
		${service.status},
		${service.fingerprint},
		${syncedAt},
		${syncedAt},
		${syncedAt},
		${syncedAt}
	)`;
}

async function persistServiceBatch(
	tx: Prisma.TransactionClient,
	services: BoostProviderService[],
	syncedAt: Date
): Promise<void> {
	if (services.length === 0) return;
	await tx.$executeRaw(Prisma.sql`
		INSERT INTO "boost_provider_services" (
			"provider", "service_id", "name", "category", "description", "provider_type",
			"rate_per_thousand", "min_quantity", "max_quantity", "refill_advertised",
			"cancel_advertised", "dripfeed_advertised", "platforms", "outcomes", "target_type",
			"quality_signals", "anomalies", "catalogue_status", "fingerprint", "first_seen_at",
			"last_seen_at", "last_changed_at", "updated_at"
		)
		VALUES ${Prisma.join(services.map((service) => serviceRow(service, syncedAt)))}
		ON CONFLICT ("provider", "service_id") DO UPDATE SET
			"name" = EXCLUDED."name",
			"category" = EXCLUDED."category",
			"description" = EXCLUDED."description",
			"provider_type" = EXCLUDED."provider_type",
			"rate_per_thousand" = EXCLUDED."rate_per_thousand",
			"min_quantity" = EXCLUDED."min_quantity",
			"max_quantity" = EXCLUDED."max_quantity",
			"refill_advertised" = EXCLUDED."refill_advertised",
			"cancel_advertised" = EXCLUDED."cancel_advertised",
			"dripfeed_advertised" = EXCLUDED."dripfeed_advertised",
			"platforms" = EXCLUDED."platforms",
			"outcomes" = EXCLUDED."outcomes",
			"target_type" = EXCLUDED."target_type",
			"quality_signals" = EXCLUDED."quality_signals",
			"anomalies" = EXCLUDED."anomalies",
			"catalogue_status" = EXCLUDED."catalogue_status",
			"last_changed_at" = CASE
				WHEN "boost_provider_services"."fingerprint" IS DISTINCT FROM EXCLUDED."fingerprint"
				THEN EXCLUDED."last_changed_at"
				ELSE "boost_provider_services"."last_changed_at"
			END,
			"fingerprint" = EXCLUDED."fingerprint",
			"last_seen_at" = EXCLUDED."last_seen_at",
			"unavailable_at" = NULL,
			"updated_at" = EXCLUDED."updated_at"
	`);
}

async function recordProviderFailure(
	database: PrismaClient,
	client: BoostProviderReadClient,
	failedAt: Date
): Promise<void> {
	await database.boostProviderState.upsert({
		where: { provider: client.id },
		create: {
			provider: client.id,
			label: client.label,
			consecutiveFailures: 1,
			pauseReason: 'Catalogue sync failed'
		},
		update: {
			label: client.label,
			consecutiveFailures: { increment: 1 },
			pauseReason: 'Catalogue sync failed',
			updatedAt: failedAt
		}
	});
}

async function syncProvider(
	client: BoostProviderReadClient,
	database: PrismaClient,
	now: () => Date,
	sleep: (milliseconds: number) => Promise<void>
): Promise<BoostCatalogSyncResult> {
	if (!client.isConfigured()) {
		return {
			provider: client.id,
			status: 'not_configured',
			servicesSeen: 0,
			servicesMarkedUnavailable: 0,
			balance: null,
			currency: null,
			balanceWarning: null,
			error: null,
			finishedAt: now().toISOString()
		};
	}

	const syncedAt = now();
	try {
		const [services, balanceRead] = await Promise.all([
			client.listServices(),
			client.getBalance().then(
				(balance) => ({ balance, warning: null }),
				(error: unknown) => ({ balance: null, warning: safeError(error) })
			)
		]);
		if (services.length === 0) {
			throw new BoostProviderError(
				'Provider returned an empty catalogue; the previous snapshot was preserved.',
				client.id,
				'invalid_response'
			);
		}

		const missing = await withDatabaseRetry(
			() =>
				database.$transaction(
					async (tx) => {
				await tx.boostProviderState.upsert({
					where: { provider: client.id },
					create: {
						provider: client.id,
						label: client.label,
						balance: balanceRead.balance?.amount,
						projectedBalance: balanceRead.balance?.amount,
						currency: balanceRead.balance?.currency,
						catalogueServiceCount: services.length,
						catalogueFingerprint: catalogueFingerprint(services),
						lastCatalogueSuccessAt: syncedAt,
						lastBalanceSuccessAt: balanceRead.balance ? syncedAt : undefined,
						lastApiSuccessAt: syncedAt,
						consecutiveFailures: 0,
						pauseReason: null
					},
					update: {
						label: client.label,
						...(balanceRead.balance
							? {
									balance: balanceRead.balance.amount,
									projectedBalance: balanceRead.balance.amount,
									currency: balanceRead.balance.currency,
									lastBalanceSuccessAt: syncedAt
								}
							: {}),
						catalogueServiceCount: services.length,
						catalogueFingerprint: catalogueFingerprint(services),
						lastCatalogueSuccessAt: syncedAt,
						lastApiSuccessAt: syncedAt,
						consecutiveFailures: 0,
						pauseReason: null
					}
				});

				for (const batch of batches(services, WRITE_BATCH_SIZE)) {
					await persistServiceBatch(tx, batch, syncedAt);
				}

				return tx.boostProviderService.updateMany({
					where: {
						provider: client.id,
						lastSeenAt: { lt: syncedAt },
						unavailableAt: null
					},
					data: { unavailableAt: syncedAt }
				});
					},
					{ timeout: 60_000 }
				),
			sleep
		);

		return {
			provider: client.id,
			status: 'synced',
			servicesSeen: services.length,
			servicesMarkedUnavailable: missing.count,
			balance: balanceRead.balance?.amount ?? null,
			currency: balanceRead.balance?.currency ?? null,
			balanceWarning: balanceRead.warning,
			error: null,
			finishedAt: now().toISOString()
		};
	} catch (error) {
		try {
			await recordProviderFailure(database, client, syncedAt);
		} catch {
			// Preserve the supplier failure as the useful result even if the health row cannot be updated.
		}
		return {
			provider: client.id,
			status: 'failed',
			servicesSeen: 0,
			servicesMarkedUnavailable: 0,
			balance: null,
			currency: null,
			balanceWarning: null,
			error: safeError(error),
			finishedAt: now().toISOString()
		};
	}
}

export async function syncBoostProviderCatalogues(
	options: CatalogSyncOptions = {}
): Promise<BoostCatalogSyncResult[]> {
	const clients = options.clients ?? DEFAULT_CLIENTS;
	const database = options.database ?? prisma;
	const now = options.now ?? (() => new Date());
	const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
	const results: BoostCatalogSyncResult[] = [];
	for (const client of clients) {
		// A full provider can exceed 6,000 rows. Keep writes sequential so large first imports and
		// refreshes do not compete for the same serverless connection and transaction budget.
		results.push(await syncProvider(client, database, now, sleep));
	}
	return results;
}
