import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'vite';
import { createVerifiedStagingBridge } from './verified-staging-bridge.mjs';

// All DDL and fixtures live in ONE rolled-back transaction on a verified separate
// staging branch. No migration history, existing rows or production state changed.
if (process.argv.length !== 3 || process.argv[2] !== '--run-staging')
	throw new Error('Explicit --run-staging required.');
const prefix = `RECOVERY-SAFETY-${randomUUID()}`;
const orderId = randomUUID();
const result = [];
const passed = (label) => {
	result.push(label);
	console.log(`PASS: ${label}`);
};
const rollback = new Error('Intentional recovery rehearsal rollback.');
let bridge, db, vite;
let phase = 'verified staging connection';
const originalFetch = globalThis.fetch;
const migrations = [
	'20261007193000_add_payment_webhook_inbox',
	'20261007200000_add_refund_recovery_tasks',
	'20261008220000_add_boost_refill_tracking'
];
const snapshot = (client) => client.$queryRaw`SELECT
	to_regclass('public.payment_webhook_inbox')::text AS inbox,
	to_regclass('public.refund_recovery_tasks')::text AS refunds,
	(SELECT COUNT(*)::int FROM information_schema.columns WHERE table_schema = 'public'
	AND table_name = 'boost_complaints' AND column_name LIKE 'refill_%') AS refill_columns`;

try {
	bridge = await createVerifiedStagingBridge();
	phase = 'read-only schema snapshot';
	db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
	const before = await snapshot(db);
	const applied = await db.$queryRaw`SELECT migration_name FROM _prisma_migrations
		WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
	const pending = migrations.filter((name) => !applied.some((row) => row.migration_name === name));
	const sql = await Promise.all(
		pending.map((name) =>
			readFile(
				fileURLToPath(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url)),
				'utf8'
			)
		)
	);
	phase = 'isolated application loader';
	globalThis.fetch = async () => {
		throw new Error('Outbound HTTP prohibited in rehearsal.');
	};
	const ids = new Set();
	const keys = new Set();
	const state = (globalThis.__recoverySchemaWalkthrough = {
		prefix,
		database: null,
		calls: [],
		effects: [],
		gatewayOutcome: 'success',
		failReward: null
	});
	const stub = fileURLToPath(new URL('./recovery-schema-walkthrough-stubs.mjs', import.meta.url));
	const modules = new Set([
		'$lib/prisma',
		'$lib/services/monnify-webhook-processing',
		'$lib/services/admin-alerts',
		'$lib/services/affiliate',
		'$lib/services/affiliate-vesting',
		'$lib/services/spend-milestones'
	]);
	const paths = new Set(
		Array.from(modules, (id) =>
			fileURLToPath(new URL(`../src/lib/${id.slice('$lib/'.length)}`, import.meta.url))
		)
	);
	vite = await createServer({
		configFile: false,
		appType: 'custom',
		server: { middlewareMode: true, hmr: false },
		optimizeDeps: { noDiscovery: true, include: [] },
		resolve: {
			alias: [
				...Array.from(modules, (find) => ({ find, replacement: stub })),
				{ find: '$lib', replacement: fileURLToPath(new URL('../src/lib', import.meta.url)) }
			]
		},
		plugins: [
			{
				name: 'recovery-side-effect-firewall',
				enforce: 'pre',
				resolveId(id, importer) {
					if (
						modules.has(id) ||
						(id.startsWith('.') &&
							importer &&
							paths.has(resolve(dirname(importer), id).replace(/\.ts$/, '')))
					)
						return stub;
				}
			}
		]
	});
	// Compile application modules before opening the DDL transaction. No application
	// query may run until the proxy receives the fixture-scoped transaction client.
	const webhook = await vite.ssrLoadModule('/src/lib/services/payment-webhook-inbox.ts');
	const refund = await vite.ssrLoadModule('/src/lib/services/refund-recovery.ts');
	try {
		await db.$transaction(
			async (tx) => {
				phase = 'transactional migration rehearsal';
				await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
				await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '20s'");
				for (const migration of sql)
					for (const statement of migration
						.split(';')
						.map((part) => part.trim())
						.filter(Boolean))
						await tx.$executeRawUnsafe(statement); // Fixed local migration SQL only.
				const schema = (await snapshot(tx))[0];
				assert.ok(schema.inbox && schema.refunds && schema.refill_columns === 6);
				passed('three additive migration schemas usable by Prisma');
				const scopedDelegate = (delegate, kind) => ({
					upsert: async (args) => {
						if (kind === 'webhook') {
							assert.ok(args.create.payload.eventData.paymentReference.startsWith(prefix));
							keys.add(args.where.eventKey);
						} else assert.equal(args.create.orderId, orderId);
						const row = await delegate.upsert(args);
						ids.add(row.id);
						return row;
					},
					findMany: (args) =>
						delegate.findMany({
							...args,
							where: {
								AND: [
									args.where,
									kind === 'webhook' ? { eventKey: { in: [...keys] } } : { orderId }
								]
							}
						}),
					updateMany: (args) => {
						assert.ok(ids.has(args.where.id), 'Only an exact fixture may be updated.');
						return delegate.updateMany(args);
					}
				});
				state.database = {
					paymentWebhookInbox: scopedDelegate(tx.paymentWebhookInbox, 'webhook'),
					refundRecoveryTask: scopedDelegate(tx.refundRecoveryTask, 'refund'),
					order: {
						findUnique: (args) => {
							assert.equal(args.where.id, orderId);
							return tx.order.findUnique(args);
						}
					}
				};
				phase = 'webhook duplicate enqueue';
				const payload = (label) =>
					webhook.normalizeWebhookPayload({
						eventType: 'SUCCESSFUL_TRANSACTION',
						eventData: {
							paymentReference: `${prefix}-${label}`,
							customer: { bank: 'must-not-persist' }
						}
					});
				const key = await webhook.receivePaymentWebhook(payload('duplicate'));
				assert.equal(await webhook.receivePaymentWebhook(payload('duplicate')), key);
				assert.equal(await tx.paymentWebhookInbox.count({ where: { eventKey: key } }), 1);
				const event = await tx.paymentWebhookInbox.findUniqueOrThrow({ where: { eventKey: key } });
				assert.deepEqual(event.payload, payload('duplicate'));
				passed('duplicate webhook stored once without customer/bank payload');
				phase = 'webhook completed replay';
				assert.equal((await webhook.drainPaymentWebhookInbox(1, key)).processed, 1);
				await webhook.receivePaymentWebhook(payload('duplicate'));
				assert.equal((await webhook.drainPaymentWebhookInbox(1, key)).processed, 0);
				assert.equal(state.calls.length, 1);
				passed('completed webhook replay does not reset work');
				const temporary = await webhook.receivePaymentWebhook(payload('temporary'));
				state.gatewayOutcome = 'temporary';
				assert.equal((await webhook.drainPaymentWebhookInbox(1, temporary)).retried, 1);
				let retry = await tx.paymentWebhookInbox.findUniqueOrThrow({
					where: { eventKey: temporary }
				});
				assert.equal(retry.status, 'pending');
				assert.equal(retry.attempts, 1);
				assert.equal(retry.leaseExpiresAt, null);
				assert.ok(retry.nextAttemptAt > new Date());
				passed('temporary verification failure retained with backoff');
				await tx.paymentWebhookInbox.update({
					where: { id: retry.id },
					data: {
						status: 'processing',
						leaseExpiresAt: new Date(Date.now() + 60_000)
					}
				});
				assert.equal((await webhook.drainPaymentWebhookInbox(1, temporary)).processed, 0);
				passed('active worker lease cannot be stolen');
				await tx.paymentWebhookInbox.update({
					where: { id: retry.id },
					data: {
						leaseExpiresAt: new Date(0),
						attempts: 11
					}
				});
				assert.equal((await webhook.drainPaymentWebhookInbox(1, temporary)).quarantined, 1);
				retry = await tx.paymentWebhookInbox.findUniqueOrThrow({ where: { id: retry.id } });
				assert.equal(retry.status, 'quarantined');
				assert.equal(retry.attempts, 12);
				passed('expired lease recovered and exhausted retry held for review');
				phase = 'refund recovery database checks';
				await tx.order.create({
					data: {
						id: orderId,
						orderNumber: prefix,
						subtotal: 1000,
						totalAmount: 1000,
						refundedAmount: 1000,
						status: 'refunded',
						paymentStatus: 'refunded',
						deliveryStatus: 'refunded',
						deliveryMethod: 'dashboard',
						deliveryContact: 'rehearsal@invalid.example'
					}
				});
				await refund.enqueueRefundRecovery(state.database, orderId, `${prefix}-refund`);
				await refund.enqueueRefundRecovery(state.database, orderId, `${prefix}-refund`);
				assert.equal(await tx.refundRecoveryTask.count({ where: { orderId } }), 1);
				passed('refund accounting enqueue deduplicates in refund transaction');
				state.failReward = 'reverse';
				assert.deepEqual(await refund.drainRefundRecovery(1), { completed: 0, retried: 1 });
				let task = await tx.refundRecoveryTask.findFirstOrThrow({ where: { orderId } });
				assert.equal(task.status, 'pending');
				assert.equal(task.completedAt, null);
				assert.equal(task.leaseExpiresAt, null);
				assert.equal(
					Number((await tx.order.findUniqueOrThrow({ where: { id: orderId } })).refundedAmount),
					1000
				);
				passed('interrupted reward reversal preserves committed refund value');
				state.failReward = null;
				await tx.refundRecoveryTask.update({
					where: { id: task.id },
					data: { nextAttemptAt: new Date(0) }
				});
				assert.deepEqual(await refund.drainRefundRecovery(1), { completed: 1, retried: 0 });
				await refund.enqueueRefundRecovery(state.database, orderId, `${prefix}-refund`);
				task = await tx.refundRecoveryTask.findFirstOrThrow({ where: { orderId } });
				assert.equal(task.status, 'completed');
				assert.equal(task.attempts, 2);
				assert.deepEqual(await refund.drainRefundRecovery(1), { completed: 0, retried: 0 });
				passed('successful recovery and duplicate enqueue preserve completed work');
				throw rollback;
			},
			{ timeout: 90_000, maxWait: 10_000 }
		);
		assert.fail('Rehearsal must never commit.');
	} catch (error) {
		if (error !== rollback) throw error;
	}
	phase = 'independent rollback verification';
	assert.deepEqual(await snapshot(db), before, 'Schema restored after rollback.');
	assert.equal(await db.order.count({ where: { id: orderId } }), 0);
	if (before[0].inbox)
		assert.equal(await db.paymentWebhookInbox.count({ where: { eventKey: { in: [...keys] } } }), 0);
	if (before[0].refunds) assert.equal(await db.refundRecoveryTask.count({ where: { orderId } }), 0);
	assert.deepEqual(
		await db.$queryRaw`SELECT migration_name FROM _prisma_migrations
		WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
		applied
	);
	console.log(
		JSON.stringify(
			{
				checks: result,
				passed: result.length,
				rollbackVerified: true,
				productionChanged: false,
				externalCalls: 0,
				verifiedTlsConnections: bridge.verifiedTlsConnections()
			},
			null,
			2
		)
	);
} catch (error) {
	console.error(
		JSON.stringify({
			error: 'Staging recovery rehearsal failed; transaction rolled back.',
			phase,
			code: error?.code ?? error?.cause?.code ?? null,
			assertion: error?.code === 'ERR_ASSERTION' ? error.message : undefined
		})
	);
	process.exitCode = 1;
} finally {
	globalThis.fetch = originalFetch;
	await vite?.close();
	await db?.$disconnect();
	await bridge?.close();
	delete globalThis.__recoverySchemaWalkthrough;
}
