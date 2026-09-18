import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const EXPECTED_TABLES = [
	'boost_attempts',
	'boost_customer_offers',
	'boost_fulfillments',
	'boost_provider_services',
	'boost_provider_states',
	'boost_service_routes'
];

const EXPECTED_INDEXES = [
	'boost_fulfillments_active_target_guard',
	'boost_fulfillments_order_item_id_key',
	'boost_provider_services_provider_service_id_key',
	'boost_service_routes_offer_id_provider_service_id_key'
];

const prisma = new PrismaClient();

try {
	const tables = await prisma.$queryRawUnsafe(
		"SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'boost_%' ORDER BY tablename"
	);
	const indexes = await prisma.$queryRawUnsafe(
		"SELECT indexname, indexdef FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'boost_%' ORDER BY indexname"
	);
	const migrations = await prisma.$queryRawUnsafe(
		'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = \'20260911150000_add_boost_automation_foundation\''
	);

	const tableNames = tables.map((row) => String(row.tablename));
	const indexNames = indexes.map((row) => String(row.indexname));
	const missingTables = EXPECTED_TABLES.filter((name) => !tableNames.includes(name));
	const missingIndexes = EXPECTED_INDEXES.filter((name) => !indexNames.includes(name));
	const migration = migrations[0] || null;
	const guard = indexes.find(
		(row) => row.indexname === 'boost_fulfillments_active_target_guard'
	)?.indexdef;
	const guardSafe =
		typeof guard === 'string' &&
		guard.includes("fulfillment_mode <> 'shadow'") &&
		guard.includes('submission_unknown') &&
		guard.includes('refill_requested');
	const migrationComplete = Boolean(migration?.finished_at && migration?.rolled_back_at === null);

	console.log(
		JSON.stringify(
			{
				migrationComplete,
				migrationName: migration?.migration_name || null,
				tablesPresent: EXPECTED_TABLES.length - missingTables.length,
				expectedTables: EXPECTED_TABLES.length,
				missingTables,
				indexesPresent: EXPECTED_INDEXES.length - missingIndexes.length,
				expectedIndexes: EXPECTED_INDEXES.length,
				missingIndexes,
				activeTargetGuardSafe: guardSafe
			},
			null,
			2
		)
	);

	if (!migrationComplete || missingTables.length || missingIndexes.length || !guardSafe) {
		process.exitCode = 1;
	}
} finally {
	await prisma.$disconnect();
}
