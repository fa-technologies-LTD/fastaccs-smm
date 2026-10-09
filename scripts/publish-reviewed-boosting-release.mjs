import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createVerifiedProductionBridge } from './verified-staging-bridge.mjs';

// Publication only: never purchases, tests, changes retail prices or launches unreviewed suppliers.
const [mode, planPath, backup, revision] = process.argv.slice(2);
if (mode !== '--apply' || !planPath || !backup || !/^[a-f0-9]{40}$/i.test(revision || ''))
	throw new Error('Use --apply PRIVATE_PLAN FRESH_BACKUP VERIFIED_REVISION.');
for (const path of [planPath, backup]) {
	const info = await stat(path);
	if (!info.isFile() || info.mode & 0o077)
		throw new Error('Plan and archive must be private files.');
}
if (Date.now() - (await stat(backup)).mtimeMs > 86400000) throw new Error('Fresh backup required.');
const validation = spawnSync('/opt/homebrew/opt/libpq/bin/pg_restore', ['--list', backup], {
	encoding: 'utf8'
});
if (validation.status !== 0 || !validation.stdout.includes('TABLE DATA'))
	throw new Error('Archive invalid.');
const planText = await readFile(planPath, 'utf8');
const plan = JSON.parse(planText.slice(planText.indexOf('{')));
if (
	plan.mode !== 'read-only-proposal' ||
	!Number.isFinite(Date.parse(plan.checkedAt)) ||
	Date.now() - Date.parse(plan.checkedAt) > 15 * 60000 ||
	Date.parse(plan.checkedAt) > Date.now()
)
	throw new Error('A fresh reviewed release plan is required.');
if (!Array.isArray(plan.readyCandidates) || !plan.readyCandidates.length)
	throw new Error('No ready offers.');
const response = await fetch(`https://smm.fastaccs.com/api/boosting-offers?release=${revision}`, {
	signal: AbortSignal.timeout(20000),
	headers: { 'cache-control': 'no-cache' }
});
const publicState = await response.json();
if (
	!response.ok ||
	response.headers.get('x-app-revision') !== revision ||
	publicState.automationReady !== true
)
	throw new Error(
		'The required new production revision and live dispatch configuration are not verified.'
	);
let bridge, db;
try {
	bridge = await createVerifiedProductionBridge();
	db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
	const lastWorker = await db.automationJobRun.findFirst({
		where: { jobName: 'boosting-fulfillment' },
		orderBy: { startedAt: 'desc' }
	});
	if (
		lastWorker?.status !== 'succeeded' ||
		lastWorker?.result?.mode !== 'live' ||
		lastWorker.result.appRevision !== revision ||
		Date.now() - lastWorker.startedAt.getTime() > 15 * 60000
	)
		throw new Error('A recent successful live-mode scheduled worker is required.');
	const ids = plan.readyCandidates.map((o) => o.id);
	const before = await db.boostCustomerOffer.findMany({
		where: { id: { in: ids } },
		include: { category: true, routes: true }
	});
	await writeFile(`${backup}.${Date.now()}.publish-before.json`, JSON.stringify(before), {
		flag: 'wx',
		mode: 0o600
	});
	await db.$transaction(
		async (tx) => {
			await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
			await tx.$queryRaw`SELECT id FROM boost_customer_offers WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
			const offers = await tx.boostCustomerOffer.findMany({
				where: { id: { in: ids } },
				include: { routes: { include: { providerService: true } } }
			});
			if (offers.length !== ids.length) throw new Error('An offer no longer exists.');
			for (const proposal of plan.readyCandidates) {
				const offer = offers.find((o) => o.id === proposal.id);
				const testedCustom = offer.platform === 'tiktok' && offer.outcome === 'custom_comments';
				if (
					!['reviewed', 'live'].includes(offer.status) &&
					!(testedCustom && offer.status === 'hidden')
				)
					throw new Error('Offer has not been owner-reviewed.');
				if (
					+offer.updatedAt !== Date.parse(proposal.updatedAt) ||
					offer.routes.length !== proposal.routeRevisions.length ||
					offer.routes.some(
						(route) =>
							!proposal.routeRevisions.some(
								(saved) =>
									saved.id === route.id &&
									Date.parse(saved.updatedAt) === +route.updatedAt &&
									Date.parse(saved.serviceUpdatedAt) === +route.providerService.updatedAt
							)
					)
				)
					throw new Error('Owner setup or catalogue changed since the proposal.');
				const selected = offer.routes.filter((r) => proposal.safeRouteIds.includes(r.id));
				if (
					!selected.length ||
					selected.some(
						(r) =>
							!r.equivalenceApproved ||
							r.providerService.unavailableAt ||
							r.providerService.catalogueStatus === 'quarantined'
					)
				)
					throw new Error('An approved safe route is missing.');
				if (
					testedCustom &&
					selected.some(
						(r) =>
							r.providerService.provider !== 'bulk_follows' ||
							r.providerService.serviceId !== '14260'
					)
				)
					throw new Error(
						'Only the explicitly tested custom-comment service may launch from hidden.'
					);
				await tx.boostServiceRoute.updateMany({
					where: { id: { in: selected.map((r) => r.id) } },
					data: { state: 'enabled' }
				});
				await tx.boostCustomerOffer.update({ where: { id: offer.id }, data: { status: 'live' } });
			}
			await tx.category.updateMany({
				where: { id: { in: [...new Set(offers.map((o) => o.categoryId))] } },
				data: { isActive: true }
			});
			await tx.microcopy.upsert({
				where: { key: 'config.boosting.managed_storefront_enabled' },
				create: {
					key: 'config.boosting.managed_storefront_enabled',
					value: 'true',
					category: 'boosting_config',
					isActive: true
				},
				update: { value: 'true', isActive: true }
			});
			await tx.adminAuditLog.create({
				data: {
					action: 'boosting_reviewed_release_published',
					resourceType: 'boost_customer_offer',
					description:
						'Published the freshly simulated reviewed subset after verified deployment and live worker. Prices, quantities and all other offers preserved.',
					metadata: { revision, offerIds: ids }
				}
			});
		},
		{ timeout: 90000, maxWait: 15000 }
	);
	const after = await db.boostCustomerOffer.findMany({ where: { id: { in: ids } } });
	if (after.some((o) => o.status !== 'live') || after.length !== ids.length)
		throw new Error('Publication readback failed.');
	for (const old of before) {
		const o = after.find((row) => row.id === old.id);
		if (
			!o.pricePerStepNgn.equals(old.pricePerStepNgn) ||
			o.minQuantity !== old.minQuantity ||
			o.stepQuantity !== old.stepQuantity ||
			!o.minimumMarginPercent.equals(old.minimumMarginPercent)
		)
			throw new Error('Preserved-price/quantity verification failed.');
	}
	console.log(
		JSON.stringify({
			publishedOffers: ids.length,
			retailAndQuantityPreserved: true,
			supplierSpend: 0,
			revision
		})
	);
} catch (error) {
	console.error(
		JSON.stringify({
			error: 'Publication gate stopped',
			reason: String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')
		})
	);
	process.exitCode = 1;
} finally {
	await db?.$disconnect();
	await bridge?.close();
}
