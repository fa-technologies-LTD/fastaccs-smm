import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createVerifiedProductionBridge } from './verified-staging-bridge.mjs';

if (process.argv.length > 2) throw new Error('Read-only inspection accepts no arguments.');
let bridge, db;
try {
	bridge = await createVerifiedProductionBridge();
	db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
	const result = await db.$transaction(
		async (tx) => {
			await tx.$executeRaw`SET TRANSACTION READ ONLY`;
			const runs = await tx.automationJobRun.findMany({
				where: {
					jobName: {
						in: [
							'boosting-fulfillment',
							'boosting-catalog-sync',
							'boosting-refills',
							'payments-reconcile'
						]
					}
				},
				orderBy: { startedAt: 'desc' },
				take: 12,
				select: {
					jobName: true,
					startedAt: true,
					finishedAt: true,
					status: true,
					failureCount: true,
					result: true
				}
			});
			const providers = await tx.boostProviderState.findMany({
				select: {
					provider: true,
					enabled: true,
					circuitOpen: true,
					currency: true,
					lastCatalogueSuccessAt: true,
					lastBalanceSuccessAt: true,
					consecutiveFailures: true
				}
			});
			const pending = await tx.boostFulfillment.count({
				where: { status: { in: ['queued', 'submitted', 'in_progress', 'manual_review'] } }
			});
			return { readOnly: true, runs, providers, activeFulfillments: pending };
		},
		{ timeout: 30000 }
	);
	console.log(JSON.stringify(result, null, 2));
} catch (error) {
	console.error(
		JSON.stringify({ error: 'Read-only runtime review failed', code: error.code ?? null })
	);
	process.exitCode = 1;
} finally {
	await db?.$disconnect();
	await bridge?.close();
}
