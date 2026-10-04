import 'dotenv/config';
import { stat } from 'node:fs/promises';
import { createServer } from 'vite';

const CONFIRMATION = 'POPULATE_HIDDEN_BOOSTING_DRAFTS';
const confirmArgument = process.argv.find((argument) =>
	argument.startsWith('--confirm-production=')
);
const backupArgument = process.argv.find((argument) => argument.startsWith('--backup='));
const confirmed = confirmArgument?.slice('--confirm-production='.length) === CONFIRMATION;
const backupPath = backupArgument?.slice('--backup='.length).trim() || '';

function databaseTarget(name, value) {
	if (!value?.trim()) throw new Error(`${name} is not configured.`);
	const url = new URL(value.trim());
	if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
		throw new Error(`${name} must be a PostgreSQL URL.`);
	}
	return {
		url: value.trim(),
		hostname: url.hostname.toLowerCase(),
		branchHost: url.hostname.toLowerCase().replace('-pooler.', '.')
	};
}

async function verifyBackup(path) {
	if (!path) {
		throw new Error('A verified backup is required. Pass --backup=/absolute/path/to/backup.dump.');
	}
	const details = await stat(path);
	if (!details.isFile() || details.size < 1024) {
		throw new Error('The supplied backup is missing, empty, or too small to be valid.');
	}
	return { path, bytes: details.size };
}

const productionPool = databaseTarget('DATABASE_URL', process.env.DATABASE_URL);
const productionDirect = databaseTarget('DIRECT_URL', process.env.DIRECT_URL);
if (productionPool.branchHost !== productionDirect.branchHost) {
	throw new Error('Production pooled and direct URLs do not identify the same database branch.');
}
for (const [name, value] of [
	['STAGING_DATABASE_URL', process.env.STAGING_DATABASE_URL],
	['STAGING_DIRECT_URL', process.env.STAGING_DIRECT_URL]
]) {
	if (!value?.trim()) continue;
	const staging = databaseTarget(name, value);
	if (staging.branchHost === productionDirect.branchHost) {
		throw new Error(`${name} resolves to production. Refusing to continue.`);
	}
}

const backup = confirmed ? await verifyBackup(backupPath) : null;
// A bounded one-off administration job should use the direct endpoint. The transaction pooler is
// reserved for application traffic and can silently drop a long catalogue-planning query.
process.env.DATABASE_URL = productionDirect.url;
process.env.DIRECT_URL = productionDirect.url;
process.env.FASTACCS_LOCAL_DATA_MODE = 'production';

console.log(
	`[boosting-drafts] Production target verified: ${productionDirect.hostname} (${confirmed ? 'APPLY' : 'DRY RUN'})`
);

const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom'
});

try {
	const [{ prepopulateBoostingDraftSuggestions }, { prisma }] = await Promise.all([
		vite.ssrLoadModule('/src/lib/server/boosting-providers/draft-suggestions.ts'),
		vite.ssrLoadModule('/src/lib/prisma.ts')
	]);
	try {
		const snapshot = async () => ({
			categories: await prisma.category.count({ where: { categoryType: 'boosting_service' } }),
			offers: await prisma.boostCustomerOffer.count(),
			routes: await prisma.boostServiceRoute.count(),
			liveOffers: await prisma.boostCustomerOffer.count({ where: { status: 'live' } }),
			unsafeGeneratedRoutes: await prisma.boostServiceRoute.count({
				where: {
					equivalenceLabel: 'Automatically suggested; owner review required',
					OR: [{ state: { not: 'shadow' } }, { equivalenceApproved: true }]
				}
			}),
			activeGeneratedCategories: await prisma.category.count({
				where: {
					categoryType: 'boosting_service',
					isActive: true,
					metadata: { path: ['boosting_draft_generated'], equals: true }
				}
			})
		});

		const before = await snapshot();
		if (confirmed && before.unsafeGeneratedRoutes !== 0) {
			throw new Error(
				'Production already contains an unreviewed generated route outside shadow mode. Refusing to write.'
			);
		}
		const result = await prepopulateBoostingDraftSuggestions({ dryRun: !confirmed });
		const after = await snapshot();

		if (confirmed) {
			if (after.liveOffers !== before.liveOffers) {
				throw new Error('Safety invariant failed: draft population changed the live-offer count.');
			}
			if (after.unsafeGeneratedRoutes !== 0) {
				throw new Error('Safety invariant failed: a generated route is approved or enabled.');
			}
			if (after.activeGeneratedCategories !== before.activeGeneratedCategories) {
				throw new Error('Safety invariant failed: draft population activated a category.');
			}
		}

		console.log(
			JSON.stringify(
				{
					mode: confirmed ? 'apply' : 'dry_run',
					actionSafety: [
						'hidden_offers_only',
						'unapproved_shadow_routes_only',
						'generated_categories_inactive',
						'no_supplier_contact',
						'no_customer_visibility'
					],
					backup,
					before,
					plannedOrApplied: result,
					after
				},
				null,
				2
			)
		);
	} finally {
		await prisma.$disconnect();
	}
} finally {
	await vite.close();
}
