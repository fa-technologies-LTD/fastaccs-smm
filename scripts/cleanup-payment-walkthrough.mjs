import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { createVerifiedStagingBridge } from './verified-staging-bridge.mjs';

// Only exact synthetic IDs recorded by the walkthrough. Never a general cleanup.
const path = process.argv[2];
if (!path || !path.includes('/fastaccs-payment-races-') || !path.endsWith('/fixtures.json'))
	throw new Error('Explicit walkthrough fixture journal required.');
const record = JSON.parse(await readFile(path, 'utf8'));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
assert.ok(uuid.test(record.runId) && uuid.test(record.userId));
assert.equal(record.prefix, `SAFETY-TEST-${record.runId}`);
assert.ok(Array.isArray(record.fixtures) && record.fixtures.length <= 20);
assert.ok(
	record.fixtures.every(
		(row) => uuid.test(row.id) && row.orderNumber.startsWith(`${record.prefix}-`)
	)
);
if (record.resources) {
	assert.ok(
		['categoryId', 'batchId', 'accountId'].every((key) => uuid.test(record.resources[key]))
	);
	assert.ok(
		Array.isArray(record.resources.itemIds) &&
			record.resources.itemIds.length <= 20 &&
			record.resources.itemIds.every((id) => uuid.test(id))
	);
}
let bridge, db;
try {
	bridge = await createVerifiedStagingBridge();
	db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
	await db.$transaction(
		async (tx) => {
			const user = await tx.user.findUnique({
				where: { id: record.userId },
				select: { fullName: true, isActive: true, email: true }
			});
			if (!user) return;
			assert.equal(user.fullName, record.prefix);
			assert.equal(user.isActive, false);
			assert.equal(user.email, `${record.runId}@invalid.example`);
			const rows = await tx.order.findMany({
				where: { userId: record.userId },
				select: { id: true, orderNumber: true }
			});
			assert.ok(
				rows.every((row) =>
					record.fixtures.some(
						(fixture) => fixture.id === row.id && fixture.orderNumber === row.orderNumber
					)
				)
			);
			await tx.walletTransaction.deleteMany({ where: { userId: record.userId } });
			await tx.wallet.deleteMany({ where: { userId: record.userId } });
			if (record.resources) {
				const { categoryId, batchId, accountId, itemIds } = record.resources;
				const category = await tx.category.findUnique({
					where: { id: categoryId },
					select: { name: true, isActive: true }
				});
				if (category) {
					assert.equal(category.name, record.prefix);
					assert.equal(category.isActive, false);
					const accounts = await tx.account.findMany({
						where: { categoryId },
						select: { id: true }
					});
					assert.ok(accounts.every((row) => row.id === accountId));
					await tx.account.deleteMany({ where: { id: accountId, categoryId, batchId } });
					await tx.orderItem.deleteMany({
						where: {
							id: { in: itemIds },
							orderId: { in: record.fixtures.map((row) => row.id) },
							categoryId
						}
					});
					await tx.accountBatch.deleteMany({ where: { id: batchId, categoryId } });
					await tx.category.delete({ where: { id: categoryId }, select: { id: true } });
				}
			}
			await tx.order.deleteMany({
				where: {
					id: { in: record.fixtures.map((row) => row.id) },
					userId: record.userId,
					orderNumber: { startsWith: record.prefix }
				}
			});
			await tx.user.delete({ where: { id: record.userId }, select: { id: true } });
		},
		{ timeout: 30000, maxWait: 15000 }
	);
	assert.equal(await db.user.count({ where: { id: record.userId } }), 0);
	assert.equal(
		await db.order.count({ where: { id: { in: record.fixtures.map((row) => row.id) } } }),
		0
	);
	assert.equal(await db.walletTransaction.count({ where: { userId: record.userId } }), 0);
	if (record.resources) {
		assert.equal(await db.category.count({ where: { id: record.resources.categoryId } }), 0);
		assert.equal(await db.account.count({ where: { id: record.resources.accountId } }), 0);
		assert.equal(await db.accountBatch.count({ where: { id: record.resources.batchId } }), 0);
		assert.equal(await db.orderItem.count({ where: { id: { in: record.resources.itemIds } } }), 0);
	}
	await writeFile(path, JSON.stringify({ ...record, cleanupVerified: true }, null, 2), {
		mode: 0o600
	});
	console.log(
		JSON.stringify({
			cleanupVerified: true,
			syntheticOrdersRemoved: record.fixtures.length,
			productionTouched: false
		})
	);
} catch (error) {
	console.error(JSON.stringify({ cleanupVerified: false, code: error?.code ?? null }));
	process.exitCode = 1;
} finally {
	await db?.$disconnect();
	await bridge?.close();
}
