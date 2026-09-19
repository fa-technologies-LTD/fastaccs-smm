import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';
import { createServer } from 'vite';

setDefaultResultOrder('ipv4first');

const action = process.argv[2];
if (!['review', 'sync-staging'].includes(action)) {
	console.error('[boosting-catalogue] Use review or sync-staging.');
	process.exit(1);
}

function databaseTarget(name, value) {
	if (!value?.trim()) throw new Error(`${name} is not configured.`);
	let url;
	try {
		url = new URL(value.trim());
	} catch {
		throw new Error(`${name} is not a valid database URL.`);
	}
	if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
		throw new Error(`${name} must be a PostgreSQL URL.`);
	}
	return {
		url: value.trim(),
		hostname: url.hostname.toLowerCase(),
		branchHost: url.hostname.toLowerCase().replace('-pooler.', '.')
	};
}

async function withViteModules(run) {
	const vite = await createServer({
		server: { middlewareMode: true, hmr: false },
		appType: 'custom'
	});
	try {
		return await run((path) => vite.ssrLoadModule(path));
	} finally {
		await vite.close();
	}
}

async function reviewCatalogue() {
	await withViteModules(async (load) => {
		const { getBoostProviderDiscovery } = await load(
			'/src/lib/server/boosting-providers/discovery.ts'
		);
		const discovery = await getBoostProviderDiscovery({ force: true });
		console.log(
			JSON.stringify(
				{
					actionSafety: ['services', 'balance'],
					fetchedAt: discovery.fetchedAt,
					providers: discovery.providers,
					coverageCells: discovery.coverage.length,
					coverage: discovery.coverage
				},
				null,
				2
			)
		);
	});
}

async function syncStagingCatalogue() {
	const productionDirect = databaseTarget('DIRECT_URL', process.env.DIRECT_URL);
	const stagingPool = databaseTarget('STAGING_DATABASE_URL', process.env.STAGING_DATABASE_URL);
	const stagingDirect = databaseTarget('STAGING_DIRECT_URL', process.env.STAGING_DIRECT_URL);
	if (stagingPool.branchHost !== stagingDirect.branchHost) {
		throw new Error('Staging pooled and direct URLs do not identify the same branch.');
	}
	if (stagingDirect.branchHost === productionDirect.branchHost) {
		throw new Error('Staging resolves to the production branch. Refusing to continue.');
	}

	// A short CLI sync uses the direct endpoint; the deployed app continues to use the pooler.
	process.env.DATABASE_URL = stagingDirect.url;
	process.env.DIRECT_URL = stagingDirect.url;
	console.log(`[boosting-catalogue] Staging target verified: ${stagingDirect.hostname}`);

	await withViteModules(async (load) => {
		const [catalogueSync, smmRaja, bulkFollows, prismaModule] = await Promise.all([
			load('/src/lib/server/boosting-providers/catalog-sync.ts'),
			load('/src/lib/server/boosting-providers/smm-raja.ts'),
			load('/src/lib/server/boosting-providers/bulk-follows.ts'),
			load('/src/lib/prisma.ts')
		]);
		const { syncBoostProviderCatalogues } = catalogueSync;
		const { prisma } = prismaModule;
		try {
			const results = [];
			// Keep the large first import sequential so the two providers do not compete for the
			// same staging connection/transaction budget. Scheduled refreshes use the same safe path.
			for (const client of [smmRaja.smmRajaClient, bulkFollows.bulkFollowsClient]) {
				const [result] = await syncBoostProviderCatalogues({ clients: [client], database: prisma });
				results.push(result);
				console.log(`[boosting-catalogue] ${client.id}: ${JSON.stringify(result)}`);
			}
			const persisted = await prisma.boostProviderService.groupBy({
				by: ['provider', 'catalogueStatus'],
				where: { unavailableAt: null },
				_count: { _all: true },
				orderBy: [{ provider: 'asc' }, { catalogueStatus: 'asc' }]
			});
			console.log(
				JSON.stringify(
					{
						actionSafety: ['services', 'balance', 'staging_database_write'],
						results,
						persisted: persisted.map((row) => ({
							provider: row.provider,
							status: row.catalogueStatus,
							count: row._count._all
						}))
					},
					null,
					2
				)
			);
			if (results.some((result) => result.status !== 'synced')) process.exitCode = 1;
		} finally {
			await prisma.$disconnect();
		}
	});
}

try {
	if (action === 'review') await reviewCatalogue();
	else await syncStagingCatalogue();
} catch (error) {
	console.error(
		`[boosting-catalogue] ${error instanceof Error ? error.message : 'Operation failed.'}`
	);
	process.exitCode = 1;
}
