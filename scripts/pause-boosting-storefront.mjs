import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createVerifiedProductionBridge } from './verified-staging-bridge.mjs';

// Reversible publication-only pause. Preserve prices, routes and already placed orders.
const [mode, backup] = process.argv.slice(2);
if (mode !== '--apply' || !backup) throw new Error('Use --apply VALIDATED_PRIVATE_BACKUP.');
const info = await stat(backup);
if (!info.isFile() || info.mode & 0o077 || Date.now() - info.mtimeMs > 86400000)
	throw new Error('A fresh private backup is required.');
const validation = spawnSync('/opt/homebrew/opt/libpq/bin/pg_restore', ['--list', backup], {
	encoding: 'utf8'
});
if (validation.status !== 0 || !validation.stdout.includes('TABLE DATA'))
	throw new Error('Backup archive validation failed.');
let bridge, db;
try {
	bridge = await createVerifiedProductionBridge();
	db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
	const before = await db.boostCustomerOffer.findMany({ where: { status: 'live' } });
	await writeFile(`${backup}.${Date.now()}.pause-before.json`, JSON.stringify(before), {
		flag: 'wx',
		mode: 0o600
	});
	const result = await db.$transaction(
		async (tx) => {
			const paused = await tx.boostCustomerOffer.updateMany({
				where: { status: 'live' },
				data: { status: 'reviewed' }
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
					action: 'boosting_storefront_paused',
					resourceType: 'boost_customer_offer',
					description:
						'Owner requested a temporary Boosting storefront pause for pricing/catalogue review. Live offers returned to reviewed; prices, supplier routes and placed orders preserved.',
					metadata: { pausedOffers: paused.count }
				}
			});
			return paused.count;
		},
		{ timeout: 30000 }
	);
	if (await db.boostCustomerOffer.count({ where: { status: 'live' } }))
		throw new Error('Live offers remain: review publication state.');
	for (const previous of before) {
		const row = await db.boostCustomerOffer.findUniqueOrThrow({ where: { id: previous.id } });
		if (
			row.status !== 'reviewed' ||
			!row.pricePerStepNgn.equals(previous.pricePerStepNgn) ||
			row.minQuantity !== previous.minQuantity ||
			row.stepQuantity !== previous.stepQuantity ||
			!row.minimumMarginPercent.equals(previous.minimumMarginPercent)
		)
			throw new Error('Pause preservation check failed.');
	}
	console.log(
		JSON.stringify({
			pausedOffers: result,
			liveOffers: 0,
			pricesAndQuantitiesPreserved: true,
			supplierSpend: 0,
			placedOrdersChanged: false
		})
	);
} catch (error) {
	console.error(JSON.stringify({ error: 'Boosting pause failed', code: error.code ?? null }));
	process.exitCode = 1;
} finally {
	await db?.$disconnect();
	await bridge?.close();
}
