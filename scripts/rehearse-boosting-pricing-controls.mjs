import 'dotenv/config';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { PrismaClient } from '@prisma/client';

// Never contact suppliers, never use production, and deliberately roll back every rehearsal write.
const normalize = (value) => new URL(value).hostname.toLowerCase().replace('-pooler.', '.');
const stage = process.env.STAGING_DATABASE_URL;
if (!stage || !process.env.DATABASE_URL || normalize(stage) === normalize(process.env.DATABASE_URL))
	throw new Error('A separate staging database is required.');
if (
	process.env.STAGING_DIRECT_URL &&
	normalize(stage) !== normalize(process.env.STAGING_DIRECT_URL)
)
	throw new Error('Staging targets do not match.');
const target = new URL(stage);
target.searchParams.set('connection_limit', '1');
target.searchParams.set('pool_timeout', '30');
process.env.DATABASE_URL = target.toString();
process.env.FASTACCS_LOCAL_DATA_MODE = 'staging';
const db = new PrismaClient({ datasourceUrl: target.toString(), log: [] });
const rollback = new Error('ROLLBACK_BOOSTING_CONTROLS_REHEARSAL');
let server;
try {
	server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	const { loadBoostControls, saveBoostControls } = await server.ssrLoadModule(
		'/src/lib/server/boosting-providers/pricing-controls.ts'
	);
	const before = await db.adminAuditLog.count({ where: { action: 'boosting_controls_saved' } });
	await db.$transaction(
		async (tx) => {
			const adapter = new Proxy(tx, {
				get(object, key) {
					return key === '$transaction' ? async (work) => work(tx) : Reflect.get(object, key);
				}
			});
			const initial = await loadBoostControls(tx);
			const candidate = initial.sheet.rows.find(
				(r) =>
					r.sourceOfferId &&
					initial.setup[r.id] &&
					!r.selected &&
					initial.quotes[r.id]?.rateUsd > 0 &&
					!initial.quotes[r.id].issues.length &&
					r.startingQuantity >= initial.quotes[r.id].min
			);
			assert(candidate, 'No suitable hidden staging offer exists.');
			const original = await tx.boostCustomerOffer.findUniqueOrThrow({
				where: { id: candidate.sourceOfferId },
				include: { routes: true }
			});
			const actor = await tx.user.findFirst({ select: { id: true } });
			assert(actor, 'Staging needs a user for audit attribution.');
			await tx.boostProviderService.updateMany({
				where: { id: { in: original.routes.map((r) => r.providerServiceId) } },
				data: { lastSeenAt: new Date() }
			});
			const costAtStart =
				(initial.quotes[candidate.id].rateUsd *
					initial.sheet.settings.fx *
					candidate.startingQuantity) /
				1000;
			await tx.boostCustomerOffer.update({
				where: { id: original.id },
				data: { maximumSupplierCostNgn: Math.ceil(costAtStart * 1.2 * 100) / 100 }
			});
			const view = await loadBoostControls(tx);
			const row = view.sheet.rows.find((r) => r.id === candidate.id);
			const cost = (view.quotes[row.id].rateUsd * view.sheet.settings.fx * row.units) / 1000;
			row.sale = Math.ceil((cost + 2000) / 50) * 50;
			row.priceMode = 'manual';
			const result = await saveBoostControls(view.sheet, actor.id, adapter);
			assert.equal(result.applied, 1);
			const saved = await tx.boostCustomerOffer.findUniqueOrThrow({
				where: { id: original.id },
				include: { routes: true }
			});
			assert.equal(Number(saved.pricePerStepNgn), (row.sale * row.increment) / row.units);
			assert.equal(saved.priceLocked, true);
			assert.equal(saved.status, original.status);
			assert.equal(saved.routingPolicy, original.routingPolicy);
			assert.equal(saved.lockedRouteId, original.lockedRouteId);
			assert.equal(saved.refillDays, original.refillDays);
			assert.deepEqual(
				saved.routes.map((r) => r.id).sort(),
				original.routes.map((r) => r.id).sort()
			);
			assert.equal(
				await tx.adminAuditLog.count({ where: { action: 'boosting_controls_saved' } }),
				before + 1
			);
			console.log(
				'[rehearsal] Atomic pricing save, manual lock, audit and supplier/refill preservation passed.'
			);
			await assert.rejects(
				saveBoostControls(view.sheet, actor.id, adapter),
				(error) => error.status === 409
			);
			console.log('[rehearsal] Stale-save protection passed.');
			throw rollback;
		},
		{ timeout: 120000 }
	);
} catch (error) {
	if (error !== rollback) {
		console.error(
			`[rehearsal] Failed (${error.name ?? 'Error'} / ${error.code ?? 'no code'}); no supplier orders were placed.`
		);
		if (error.code === 'ERR_ASSERTION' || error.name === 'BoostPricingError')
			console.error(error.message);
		process.exitCode = 1;
	}
} finally {
	if (!process.exitCode) console.log('[rehearsal] All temporary database changes rolled back.');
	await db.$disconnect();
	await server?.close();
}
