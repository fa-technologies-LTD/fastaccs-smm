import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const EXPECTED_TABLES = [
	'boost_attempts',
	'boost_complaints',
	'boost_customer_offers',
	'boost_fulfillments',
	'boost_provider_services',
	'boost_provider_states',
	'boost_service_routes'
];

const EXPECTED_INDEXES = [
	'boost_complaints_fulfillment_id_type_key',
	'boost_fulfillments_active_target_guard',
	'boost_fulfillments_order_item_id_key',
	'boost_provider_services_provider_service_id_key',
	'boost_service_routes_offer_id_provider_service_id_key'
];

const EXPECTED_MIGRATIONS = [
	'20260911150000_add_boost_automation_foundation',
	'20260925120000_complete_boosting_workflow'
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
		`SELECT migration_name, finished_at, rolled_back_at
		 FROM "_prisma_migrations"
		 WHERE migration_name IN (${EXPECTED_MIGRATIONS.map((name) => `'${name}'`).join(', ')})`
	);
	const offerColumns = await prisma.$queryRawUnsafe(
		"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'boost_customer_offers'"
	);
	const generatedRoutes = await prisma.boostServiceRoute.count({
		where: {
			state: 'shadow',
			equivalenceApproved: false,
			equivalenceLabel: 'Automatically suggested; owner review required'
		}
	});

	const tableNames = tables.map((row) => String(row.tablename));
	const indexNames = indexes.map((row) => String(row.indexname));
	const missingTables = EXPECTED_TABLES.filter((name) => !tableNames.includes(name));
	const missingIndexes = EXPECTED_INDEXES.filter((name) => !indexNames.includes(name));
	const completedMigrations = migrations
		.filter((migration) => migration.finished_at && migration.rolled_back_at === null)
		.map((migration) => String(migration.migration_name));
	const missingMigrations = EXPECTED_MIGRATIONS.filter(
		(name) => !completedMigrations.includes(name)
	);
	const priceLockPresent = offerColumns.some((row) => row.column_name === 'price_locked');
	const guard = indexes.find(
		(row) => row.indexname === 'boost_fulfillments_active_target_guard'
	)?.indexdef;
	const guardSafe =
		typeof guard === 'string' &&
		guard.includes("fulfillment_mode <> 'shadow'") &&
		guard.includes('submission_unknown') &&
		guard.includes('refill_requested');
	const migrationComplete = missingMigrations.length === 0;

	console.log(
		JSON.stringify(
			{
				migrationComplete,
				completedMigrations,
				missingMigrations,
				tablesPresent: EXPECTED_TABLES.length - missingTables.length,
				expectedTables: EXPECTED_TABLES.length,
				missingTables,
				indexesPresent: EXPECTED_INDEXES.length - missingIndexes.length,
				expectedIndexes: EXPECTED_INDEXES.length,
				missingIndexes,
				activeTargetGuardSafe: guardSafe,
				priceLockPresent,
				unapprovedGeneratedRoutes: generatedRoutes
			},
			null,
			2
		)
	);

	if (
		!migrationComplete ||
		missingTables.length ||
		missingIndexes.length ||
		!guardSafe ||
		!priceLockPresent ||
		generatedRoutes !== 0
	) {
		process.exitCode = 1;
	}
} finally {
	await prisma.$disconnect();
}
