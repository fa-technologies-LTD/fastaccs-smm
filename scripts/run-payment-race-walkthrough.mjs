import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'vite';
import { createVerifiedStagingBridge } from './verified-staging-bridge.mjs';

// Explicit staging-only synthetic fixtures. Actual app financial code + PostgreSQL
// locks; provider/email/analytics dispatch and real inventory allocation are disabled.
if (process.argv[2] !== '--run-staging') throw new Error('Explicit --run-staging required.');
const runId = randomUUID();
const userId = randomUUID();
const prefix = `SAFETY-TEST-${runId}`;
const fixtures = [];
const resources = {
	categoryId: randomUUID(),
	batchId: randomUUID(),
	accountId: randomUUID(),
	itemIds: []
};
const results = [];
const walletInserts = [];
let bridge,
	db,
	vite,
	journal,
	cleanupVerified = false;
let gate = null;
const originalFetch = globalThis.fetch;
const deferred = () => {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
};
const sideEffectModules = new Set([
	'$lib/prisma',
	'$lib/services/fulfillment',
	'$lib/services/affiliate',
	'$lib/services/admin-metrics',
	'$lib/services/admin-alerts',
	'$lib/services/admin-settings',
	'$lib/services/email',
	'$lib/services/manual-handover',
	'$lib/services/order-audit',
	'$lib/services/order-delivery-mode',
	'$lib/services/phone-fulfillment',
	'$lib/services/order-reservations',
	'$lib/services/spend-milestones',
	'$lib/services/promotions',
	'$lib/services/notifications',
	'$lib/services/refund-recovery',
	'$lib/services/affiliate-vesting',
	'$lib/services/order-events',
	'$lib/services/hubman',
	'$lib/services/phone-pricing',
	'$lib/services/rate-limiter',
	'$lib/services/phone-telemetry',
	'$lib/services/number-providers',
	'$lib/server/ga4-measurement-protocol',
	'$lib/server/boosting-providers/fulfillment-worker'
]);
const txOptions = { timeout: 30000, maxWait: 15000 };
async function allComplete(promises) {
	// Never begin cleanup while a sibling transaction is still running after an
	// early Promise.all rejection.
	const settled = await Promise.allSettled(promises);
	const failure = settled.find((row) => row.status === 'rejected');
	if (failure) throw failure.reason;
	return settled.map((row) => row.value);
}
try {
	bridge = await createVerifiedStagingBridge();
	db = new PrismaClient({
		datasources: { db: { url: bridge.url } },
		log: [{ emit: 'event', level: 'query' }]
	});
	db.$on('query', (event) => {
		if (/INSERT\s+INTO\s+(?:"public"\.)?"wallets"/i.test(event.query))
			walletInserts.push(/ON\s+CONFLICT/i.test(event.query));
	});
	await db.$queryRaw`SELECT 1`;
	const appDb = db.$extends({
		query: {
			orderItem: {
				async findFirst({ args, query }) {
					const row = await query(args);
					if (gate && args.where.orderId === gate.orderId) {
						const barrier = gate;
						gate = null;
						barrier.read.resolve();
						await barrier.release.promise;
					}
					return row;
				}
			},
			order: {
				async findUnique({ args, query }) {
					const row = await query(args);
					if (gate && args.where.id === gate.orderId) {
						const barrier = gate;
						gate = null;
						barrier.read.resolve();
						await barrier.release.promise;
					}
					return row;
				}
			}
		}
	});
	globalThis.__paymentWalkthrough = {
		db: appDb,
		effects: [],
		boostingOrders: new Set(),
		analyticsConfigured: false,
		analyticsOrders: new Set(),
		analyticsEvents: [],
		analyticsHandler: null
	};
	globalThis.fetch = async () => {
		throw new Error('Outbound HTTP disabled in staging walkthrough.');
	};
	const stub = fileURLToPath(new URL('./payment-walkthrough-stubs.mjs', import.meta.url));
	const stubPaths = new Set(
		Array.from(sideEffectModules, (id) =>
			fileURLToPath(new URL(`../src/lib/${id.slice('$lib/'.length)}`, import.meta.url))
		)
	);
	vite = await createServer({
		configFile: false,
		appType: 'custom',
		server: { middlewareMode: true, hmr: false },
		resolve: {
			alias: [
				...Array.from(sideEffectModules, (find) => ({ find, replacement: stub })),
				{ find: '$lib', replacement: fileURLToPath(new URL('../src/lib', import.meta.url)) }
			]
		},
		plugins: [
			{
				name: 'staging-side-effect-firewall',
				enforce: 'pre',
				resolveId(id, importer) {
					if (sideEffectModules.has(id)) return stub;
					if (
						id.startsWith('.') &&
						importer &&
						stubPaths.has(resolve(dirname(importer), id).replace(/\.ts$/, ''))
					)
						return stub;
				}
			}
		]
	});
	const settlement = await vite.ssrLoadModule('/src/lib/services/payment-settlement.ts');
	const credit = await vite.ssrLoadModule('/src/lib/services/store-credit.ts');
	const submission = await vite.ssrLoadModule(
		'/src/lib/server/boosting-providers/reserve-submission.ts'
	);
	const allocation = await vite.ssrLoadModule('/src/lib/services/fulfillment.ts');
	const refundAnalytics = await vite.ssrLoadModule('/src/lib/services/refund-analytics.ts');
	const phone = await vite.ssrLoadModule('/src/lib/services/phone-fulfillment.ts');
	journal = join(await mkdtemp(join(tmpdir(), 'fastaccs-payment-races-')), 'fixtures.json');
	const saveJournal = () =>
		writeFile(
			journal,
			JSON.stringify(
				{ runId, userId, prefix, fixtures, resources, results, cleanupVerified },
				null,
				2
			),
			{ mode: 0o600 }
		);
	await saveJournal();
	await db.user.create({
		data: {
			id: userId,
			email: `${runId}@invalid.example`,
			fullName: prefix,
			restrictedCategories: [],
			marketingEmailEnabled: false,
			isActive: false
		},
		select: { id: true }
	});
	async function order(label, extra = {}) {
		const id = randomUUID();
		const orderNumber = `${prefix}-${label}`;
		fixtures.push({ id, orderNumber });
		await saveJournal(); // Record exact cleanup target before any creation.
		return db.order.create({
			data: {
				id,
				userId,
				orderNumber,
				subtotal: 1000,
				totalAmount: 1000,
				currency: 'NGN',
				deliveryMethod: 'email',
				deliveryContact: `${runId}@invalid.example`,
				status: 'pending_payment',
				paymentStatus: 'pending',
				paymentReference: `${prefix}-${label}-payment`,
				...extra
			}
		});
	}
	const pay = (row) =>
		settlement.settleSuccessfulPayment({
			orderId: row.id,
			source: 'verify',
			paymentReference: row.paymentReference,
			amountPaid: 1000,
			currency: 'NGN'
		});
	async function staleReadRace(row, operation, competingUpdate) {
		const barrier = { orderId: row.id, read: deferred(), release: deferred() };
		gate = barrier;
		const timer = setTimeout(() => {
			barrier.read.resolve();
			barrier.release.resolve();
		}, 20000);
		const pending = operation();
		pending.catch(() => undefined); // Observe early errors until the barrier releases.
		let competingError;
		try {
			await barrier.read.promise;
			assert.equal(gate, null, 'Application first read must hit the actual database barrier.');
			await competingUpdate();
		} catch (error) {
			competingError = error;
		} finally {
			barrier.release.resolve();
			clearTimeout(timer);
		}
		const result = await pending;
		if (competingError) throw competingError;
		return result;
	}
	const refunded = await order('refund-race', {
		status: 'paid',
		paymentStatus: 'paid',
		deliveryStatus: 'processing'
	});
	globalThis.__paymentWalkthrough.boostingOrders.add(refunded.id);
	const recovery = await staleReadRace(
		refunded,
		() => settlement.recoverPaidOrder(refunded.id, 'reconcile'),
		() =>
			db.order.update({
				where: { id: refunded.id },
				data: {
					status: 'refunded',
					paymentStatus: 'refunded',
					deliveryStatus: 'refunded',
					refundedAmount: 1000
				}
			})
	);
	assert.equal(recovery.status, 'CANCELLED');
	const refundedLive = await db.order.findUniqueOrThrow({ where: { id: refunded.id } });
	assert.deepEqual(
		[refundedLive.status, refundedLive.paymentStatus, refundedLive.deliveryStatus],
		['refunded', 'refunded', 'refunded']
	);
	assert.equal(Number(refundedLive.refundedAmount), 1000);
	results.push('stale paid recovery cannot resurrect a committed refund');

	const cancelled = await order('cancel-race');
	const late = await staleReadRace(
		cancelled,
		() => pay(cancelled),
		() =>
			db.order.update({
				where: { id: cancelled.id },
				data: {
					status: 'cancelled',
					paymentStatus: 'cancelled',
					cancellationReason: 'Synthetic race cancellation'
				}
			})
	);
	assert.equal(late.status, 'PENDING');
	const held = await db.order.findUniqueOrThrow({ where: { id: cancelled.id } });
	assert.equal(held.status, 'payment_review');
	assert.equal(held.paymentStatus, 'under_review');
	assert.notEqual(held.deliveryStatus, 'completed');
	results.push('settlement after concurrent cancellation is held for review, not fulfilled');

	const duplicate = await order('duplicate-payment');
	const both = await allComplete([pay(duplicate), pay(duplicate)]);
	assert.ok(both.every((result) => result.status === 'PAID'));
	const paid = await db.order.findUniqueOrThrow({ where: { id: duplicate.id } });
	assert.equal(paid.status, 'paid');
	assert.equal(paid.paymentStatus, 'paid');
	const transitions = globalThis.__paymentWalkthrough.effects.filter(
		(effect) => effect.name === 'transition' && effect.orderId === duplicate.id
	);
	assert.equal(transitions.length, 1, 'Exactly one successful payment transition.');
	results.push('simultaneous payment settlements commit one paid transition');

	const creditOnce = (amount, reference) =>
		db.$transaction(
			(tx) =>
				credit.creditStoreCredit(tx, {
					userId,
					amount,
					type: credit.SC_CREDIT_REFUND,
					description: prefix,
					reference
				}),
			txOptions
		);
	await allComplete([
		creditOnce(500.25, `${prefix}-credit-a`),
		creditOnce(500.3, `${prefix}-credit-b`)
	]);
	const wallet = await db.wallet.findUniqueOrThrow({ where: { userId } });
	assert.equal(Number(wallet.balance), 1000.55);
	assert.equal((await credit.getStoreCreditBuckets(userId, db)).refundAvailable, 1000.55);
	assert.ok(
		walletInserts.length >= 2 && walletInserts.every(Boolean),
		'Wallet creation must use actual atomic PostgreSQL ON CONFLICT.'
	);
	results.push('different concurrent refund credits preserve both amounts and kobo');

	const spendA = await order('spend-a'),
		spendB = await order('spend-b');
	const redeem = (row) =>
		db.$transaction(
			(tx) =>
				credit.redeemStoreCreditForOrder(tx, {
					userId,
					orderId: row.id,
					orderNumber: row.orderNumber,
					redemption: { refundApplied: 700.25, earnedApplied: 0, totalApplied: 700.25 }
				}),
			txOptions
		);
	const spends = await Promise.allSettled([redeem(spendA), redeem(spendB)]);
	assert.equal(spends.filter((result) => result.status === 'fulfilled').length, 1);
	assert.ok(
		spends.some(
			(result) =>
				result.status === 'rejected' && result.reason.message === 'INSUFFICIENT_STORE_CREDIT'
		)
	);
	assert.equal(Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance), 300.3);
	results.push('two concurrent checkouts cannot spend the same wallet credit');

	await allComplete([
		creditOnce(100.11, `${prefix}-same-refund`),
		creditOnce(100.11, `${prefix}-same-refund`)
	]);
	assert.equal(
		await db.walletTransaction.count({ where: { reference: `${prefix}-same-refund` } }),
		1
	);
	assert.equal(Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance), 400.41);
	results.push('duplicate concurrent refund credit creates one ledger row');

	const winner = spends[0].status === 'fulfilled' ? spendA : spendB;
	await allComplete(
		[0, 1].map(() =>
			db.$transaction(
				(tx) => credit.reverseStoreCreditRedemption(tx, { userId, orderId: winner.id }),
				txOptions
			)
		)
	);
	assert.equal(Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance), 1100.66);
	await allComplete(
		[0, 1].map(() =>
			db.$transaction(
				(tx) =>
					credit.restoreStoreCreditRedemptionForLatePayment(tx, {
						userId,
						orderId: winner.id,
						expectedAmount: 700.25
					}),
				txOptions
			)
		)
	);
	assert.equal(Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance), 400.41);
	results.push('concurrent reversal and late-payment restoration each change credit only once');

	const reservation = await submission.reserveBoostSubmission(db, {
		orderId: refunded.id,
		fulfillmentId: randomUUID(),
		routeId: randomUUID(),
		provider: 'bulkfollows',
		serviceId: 'synthetic',
		leaseToken: runId,
		attemptCount: 0,
		requestFingerprint: prefix,
		supplierCostUsd: 0.01,
		balanceSafetyUsd: 0
	});
	assert.equal(reservation, 'order_hold');
	results.push('final supplier-dispatch gate rejects a refunded order');

	const staleRefundMarker = await order('allocation-refund', {
		status: 'paid',
		paymentStatus: 'paid',
		deliveryStatus: 'refunded'
	});
	assert.equal((await allocation.allocateAccountsForOrder(staleRefundMarker.id)).success, false);
	assert.equal(
		(await db.order.findUniqueOrThrow({ where: { id: staleRefundMarker.id } })).deliveryStatus,
		'refunded'
	);
	results.push('account allocation respects the terminal delivery-refund marker');

	await db.category.create({
		data: {
			id: resources.categoryId,
			name: prefix,
			slug: prefix,
			categoryType: 'account',
			isActive: false
		},
		select: { id: true }
	});
	await db.accountBatch.create({
		data: {
			id: resources.batchId,
			categoryId: resources.categoryId,
			totalUnits: 1,
			remainingUnits: 1,
			notes: prefix
		},
		select: { id: true }
	});
	await db.account.create({
		data: {
			id: resources.accountId,
			categoryId: resources.categoryId,
			batchId: resources.batchId,
			platform: 'synthetic',
			username: prefix,
			status: 'available'
		},
		select: { id: true }
	});
	const inventoryA = await order('inventory-a', { status: 'paid', paymentStatus: 'paid' });
	const inventoryB = await order('inventory-b', { status: 'paid', paymentStatus: 'paid' });
	for (const row of [inventoryA, inventoryB]) {
		const id = randomUUID();
		resources.itemIds.push(id);
		await saveJournal();
		await db.orderItem.create({
			data: {
				id,
				orderId: row.id,
				categoryId: resources.categoryId,
				quantity: 1,
				unitPrice: 1000,
				totalPrice: 1000,
				productName: prefix,
				productCategory: prefix
			},
			select: { id: true }
		});
	}
	const allocations = await allComplete(
		[inventoryA, inventoryB].map((row) => allocation.allocateAccountsForOrder(row.id))
	);
	assert.equal(allocations.filter((result) => result.success).length, 1);
	assert.equal(
		allocations.filter(
			(result) => !result.success && result.error.startsWith('Insufficient accounts')
		).length,
		1
	);
	const allocated = await db.account.findUniqueOrThrow({
		where: { id: resources.accountId },
		select: { status: true, orderItemId: true }
	});
	assert.equal(allocated.status, 'allocated');
	assert.ok(resources.itemIds.includes(allocated.orderItemId));
	const winningInventory = allocations[0].success ? inventoryA : inventoryB;
	assert.equal((await allocation.allocateAccountsForOrder(winningInventory.id)).success, false);
	assert.equal(
		await db.account.count({ where: { categoryId: resources.categoryId, status: 'allocated' } }),
		1
	);
	results.push(
		'two paid orders cannot allocate the same account; completed replay cannot allocate again'
	);

	// Real order rows, JSON merges, row/advisory locks; ONLY analytics transport is mocked.
	const analyticsState = globalThis.__paymentWalkthrough;
	const baselineAnalytics = () => ({
		ga4EcommerceVersion: 2,
		ga4ConsentGranted: true,
		ga4ClientId: '123.456',
		unrelated: 'fixture-metadata-preserved'
	});
	async function analyticsOrder(label, extra = {}) {
		const row = await order(label, {
			status: 'completed',
			paymentStatus: 'paid',
			deliveryStatus: 'completed',
			paidAt: new Date(Date.now() - 1000),
			analyticsMetadata: baselineAnalytics(),
			...extra
		});
		analyticsState.analyticsOrders.add(row.id);
		return row;
	}
	analyticsState.analyticsConfigured = true;
	analyticsState.analyticsHandler = async () => ({ success: true });
	const canonical = await analyticsOrder('analytics-purchase', { storeCreditApplied: 300 });
	const canonicalResults = await allComplete([
		settlement.sendServerPurchaseVerifiedEvent(canonical.id, 'COMPLETED'),
		settlement.sendServerPurchaseVerifiedEvent(canonical.id, 'COMPLETED')
	]);
	assert.deepEqual(canonicalResults.slice().sort(), ['sent', 'skipped']);
	assert.equal(analyticsState.analyticsEvents.length, 1);
	assert.equal(analyticsState.analyticsEvents[0].events[1].name, 'purchase');
	assert.equal(analyticsState.analyticsEvents[0].events[1].params.value, 1000);
	assert.equal(
		analyticsState.analyticsEvents[0].timestampMicros,
		String(canonical.paidAt.getTime() * 1000)
	);
	let canonicalLive = await db.order.findUniqueOrThrow({ where: { id: canonical.id } });
	assert.equal(canonicalLive.analyticsMetadata.unrelated, 'fixture-metadata-preserved');
	assert.ok(canonicalLive.analyticsMetadata.ga4CanonicalPurchaseSentAt);
	results.push(
		'concurrent canonical purchase workers report the full sale once, not the gateway remainder'
	);

	await db.order.update({ where: { id: canonical.id }, data: { refundedAmount: 100.11 } });
	const started = deferred(),
		release = deferred();
	analyticsState.analyticsHandler = async () => {
		const live = await db.order.findUniqueOrThrow({ where: { id: canonical.id } });
		assert.equal(live.analyticsMetadata.ga4RefundDispatch.state, 'sending');
		started.resolve();
		await release.promise;
		return { success: true };
	};
	const firstRefund = refundAnalytics.sendOrderRefundAnalytics(canonical.id);
	firstRefund.catch(() => undefined);
	const refundTimer = setTimeout(() => {
		started.resolve();
		release.resolve();
	}, 20000);
	let competingRefundError;
	try {
		await started.promise;
		assert.equal(await refundAnalytics.sendOrderRefundAnalytics(canonical.id), 'pending');
		await db.order.update({ where: { id: canonical.id }, data: { refundedAmount: 250.22 } });
	} catch (error) {
		competingRefundError = error;
	} finally {
		release.resolve();
		clearTimeout(refundTimer);
	}
	assert.equal(await firstRefund, 'sent');
	if (competingRefundError) throw competingRefundError;
	analyticsState.analyticsHandler = async () => ({ success: true });
	assert.equal(await refundAnalytics.sendOrderRefundAnalytics(canonical.id), 'sent');
	assert.equal(await refundAnalytics.sendOrderRefundAnalytics(canonical.id), 'skipped');
	const refundEvents = analyticsState.analyticsEvents.filter(
		(input) => input.events[0].name === 'refund'
	);
	assert.deepEqual(
		refundEvents.map((input) => input.events[0].params.value),
		[100.11, 150.11]
	);
	canonicalLive = await db.order.findUniqueOrThrow({ where: { id: canonical.id } });
	assert.equal(canonicalLive.analyticsMetadata.ga4RefundReportedKobo, 25022);
	assert.equal(Number(canonicalLive.refundedAmount), 250.22);
	assert.equal(canonicalLive.status, 'completed');
	assert.equal(canonicalLive.analyticsMetadata.unrelated, 'fixture-metadata-preserved');
	results.push(
		'committed refund claims block duplicate workers and retain a concurrent additional partial refund'
	);

	const uncertain = await analyticsOrder('analytics-uncertain', {
		refundedAmount: 50.55,
		analyticsMetadata: {
			...baselineAnalytics(),
			ga4CanonicalPurchaseSentAt: new Date().toISOString()
		}
	});
	analyticsState.analyticsHandler = async () => ({ success: false, error: 'synthetic timeout' });
	const beforeUnknown = analyticsState.analyticsEvents.length;
	assert.equal(await refundAnalytics.sendOrderRefundAnalytics(uncertain.id), 'under_review');
	assert.equal(await refundAnalytics.sendOrderRefundAnalytics(uncertain.id), 'under_review');
	assert.equal(analyticsState.analyticsEvents.length - beforeUnknown, 1);
	assert.ok(
		(await refundAnalytics.listRefundAnalyticsReview()).some((row) => row.id === uncertain.id)
	);
	results.push('uncertain refund analytics sends once and appears in the read-only review queue');

	const crashed = await analyticsOrder('analytics-crashed', {
		refundedAmount: 25.25,
		analyticsMetadata: {
			...baselineAnalytics(),
			ga4CanonicalPurchaseSentAt: new Date().toISOString(),
			ga4RefundDispatch: {
				state: 'sending',
				token: randomUUID(),
				beforeKobo: 0,
				targetKobo: 2525,
				startedAt: new Date(Date.now() - 6 * 60_000).toISOString()
			}
		}
	});
	const beforeCrash = analyticsState.analyticsEvents.length;
	assert.equal(await refundAnalytics.sendOrderRefundAnalytics(crashed.id), 'under_review');
	assert.equal(analyticsState.analyticsEvents.length, beforeCrash);
	results.push(
		'a stale committed dispatch after interruption is held instead of replaying an unknown refund'
	);

	const fullyRefunded = await analyticsOrder('analytics-full-refund', {
		status: 'refunded',
		paymentStatus: 'refunded',
		deliveryStatus: 'refunded',
		refundedAmount: 1000
	});
	analyticsState.analyticsHandler = async () => ({ success: true });
	assert.equal(await settlement.sendServerPurchaseVerifiedEvent(fullyRefunded.id, 'PAID'), 'sent');
	assert.equal(await refundAnalytics.sendOrderRefundAnalytics(fullyRefunded.id), 'sent');
	const fullLive = await db.order.findUniqueOrThrow({ where: { id: fullyRefunded.id } });
	assert.deepEqual(
		[fullLive.status, fullLive.paymentStatus, fullLive.deliveryStatus],
		['refunded', 'refunded', 'refunded']
	);
	assert.equal(fullLive.analyticsMetadata.ga4RefundReportedKobo, 100000);
	results.push(
		'a new sale refunded before reporting records purchase and refund without reviving the order'
	);
	analyticsState.analyticsConfigured = false;

	// Only a synthetic inactive category is changed; no real provider is rented/polled.
	await db.category.update({
		where: { id: resources.categoryId },
		data: {
			metadata: {
				delivery_mode: 'auto_sms',
				hub_service_id: 1,
				hub_country_id: 1,
				hub_service_name: 'Fixture',
				hub_country_name: 'Fixture'
			}
		},
		select: { id: true }
	});
	async function phoneOrder(label, amount = 1000) {
		const row = await order(label, {
			orderType: 'phone',
			totalAmount: amount,
			subtotal: amount,
			status: 'paid',
			paymentStatus: 'paid',
			deliveryStatus: 'processing'
		});
		const itemId = randomUUID();
		resources.itemIds.push(itemId);
		await saveJournal();
		await db.orderItem.create({
			data: {
				id: itemId,
				orderId: row.id,
				categoryId: resources.categoryId,
				quantity: 1,
				unitPrice: amount,
				totalPrice: amount,
				productName: prefix,
				productCategory: prefix
			},
			select: { id: true }
		});
		await db.phoneRental.create({
			data: {
				orderItemId: itemId,
				serviceId: 1,
				countryId: 1,
				serviceName: 'Fixture',
				countryName: 'Fixture',
				saleAmountNgn: amount,
				status: 'awaiting_sms'
			},
			select: { id: true }
		});
		return { ...row, itemId };
	}
	const phoneDuplicate = await phoneOrder('phone-duplicate', 1000.55);
	const beforePhoneBalance = Number(
		(await db.wallet.findUniqueOrThrow({ where: { userId } })).balance
	);
	const phoneResults = await allComplete([
		phone.refundPhoneOrderToStoreCredit(phoneDuplicate.id, prefix, 'staging'),
		phone.refundPhoneOrderToStoreCredit(phoneDuplicate.id, prefix, 'staging')
	]);
	assert.deepEqual(phoneResults.slice().sort(), [false, true]);
	assert.equal(
		Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance),
		Math.round((beforePhoneBalance + 1000.55) * 100) / 100
	);
	assert.equal(
		await db.walletTransaction.count({ where: { userId, reference: phoneDuplicate.id } }),
		1
	);
	results.push(
		'simultaneous automatic Numbers refunds credit one exact amount under the order lock'
	);

	async function simulatedAdminRefund(row, amount, full = false) {
		await db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM orders WHERE id = ${row.id}::uuid FOR UPDATE`;
			await credit.creditStoreCredit(tx, {
				userId,
				amount,
				type: credit.SC_CREDIT_REFUND,
				description: prefix,
				reference: full ? row.id : `${prefix}-partial-${row.id}`,
				metadata: { orderId: row.id }
			});
			await tx.order.update({
				where: { id: row.id },
				data: {
					refundedAmount: amount,
					...(full
						? { status: 'refunded', paymentStatus: 'refunded', deliveryStatus: 'refunded' }
						: {})
				}
			});
			await tx.orderItem.update({ where: { id: row.itemId }, data: { refundedAmount: amount } });
		}, txOptions);
	}
	const phonePartial = await phoneOrder('phone-partial');
	const partialBalance = Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance);
	assert.equal(
		await staleReadRace(
			phonePartial,
			() => phone.refundPhoneOrderToStoreCredit(phonePartial.id, prefix, 'staging'),
			() => simulatedAdminRefund(phonePartial, 200.11)
		),
		true
	);
	assert.equal(
		Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance),
		Math.round((partialBalance + 1000) * 100) / 100
	);
	const partialCredit = await db.walletTransaction.findFirstOrThrow({
		where: { userId, reference: phonePartial.id },
		select: { amount: true }
	});
	assert.equal(Number(partialCredit.amount), 799.89);
	assert.equal(
		Number(
			(
				await db.orderItem.findUniqueOrThrow({
					where: { id: phonePartial.itemId },
					select: { refundedAmount: true }
				})
			).refundedAmount
		),
		1000
	);
	results.push(
		'an automatic Numbers refund recomputes the remainder after a concurrent partial refund'
	);

	const phoneFull = await phoneOrder('phone-full');
	const fullBalance = Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance);
	assert.equal(
		await staleReadRace(
			phoneFull,
			() => phone.refundPhoneOrderToStoreCredit(phoneFull.id, prefix, 'staging'),
			() => simulatedAdminRefund(phoneFull, 1000, true)
		),
		false
	);
	assert.equal(
		Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance),
		Math.round((fullBalance + 1000) * 100) / 100
	);
	assert.equal(
		Number(
			(
				await db.orderItem.findUniqueOrThrow({
					where: { id: phoneFull.itemId },
					select: { refundedAmount: true }
				})
			).refundedAmount
		),
		1000
	);
	results.push(
		'automatic Numbers refund cannot duplicate item accounting after a manual full refund wins'
	);
	await saveJournal();
} catch (error) {
	console.error(
		JSON.stringify({
			success: false,
			completed: results,
			error:
				error instanceof assert.AssertionError
					? error.message
					: 'Staging walkthrough stopped; inspect code and fixture journal.',
			code: error?.code ?? null,
			missingColumn:
				error?.code === 'P2022'
					? String(error.meta?.column || '')
							.replace(/[^a-zA-Z0-9_.]/g, '')
							.slice(0, 150)
					: undefined,
			journal
		})
	);
	process.exitCode = 1;
} finally {
	gate = null;
	try {
		if (db) {
			await db.$transaction(async (tx) => {
				const owner = await tx.user.findUnique({
					where: { id: userId },
					select: { fullName: true, isActive: true }
				});
				if (owner) {
					assert.equal(owner.fullName, prefix);
					assert.equal(owner.isActive, false);
					const rows = await tx.order.findMany({
						where: { userId },
						select: { id: true, orderNumber: true }
					});
					assert.ok(
						rows.every((row) =>
							fixtures.some(
								(fixture) => fixture.id === row.id && fixture.orderNumber === row.orderNumber
							)
						)
					);
					await tx.walletTransaction.deleteMany({ where: { userId } });
					await tx.wallet.deleteMany({ where: { userId } });
					const category = await tx.category.findUnique({
						where: { id: resources.categoryId },
						select: { name: true, isActive: true }
					});
					if (category) {
						assert.equal(category.name, prefix);
						assert.equal(category.isActive, false);
						const accounts = await tx.account.findMany({
							where: { categoryId: resources.categoryId },
							select: { id: true }
						});
						assert.ok(accounts.every((row) => row.id === resources.accountId));
						await tx.account.deleteMany({
							where: {
								id: resources.accountId,
								categoryId: resources.categoryId,
								batchId: resources.batchId
							}
						});
						await tx.orderItem.deleteMany({
							where: {
								id: { in: resources.itemIds },
								orderId: { in: fixtures.map((row) => row.id) },
								categoryId: resources.categoryId
							}
						});
						await tx.accountBatch.deleteMany({
							where: { id: resources.batchId, categoryId: resources.categoryId }
						});
						await tx.category.delete({ where: { id: resources.categoryId }, select: { id: true } });
					}
					await tx.order.deleteMany({
						where: {
							id: { in: fixtures.map((row) => row.id) },
							userId,
							orderNumber: { startsWith: prefix }
						}
					});
					await tx.user.delete({ where: { id: userId }, select: { id: true } });
				}
			}, txOptions);
			assert.equal(await db.user.count({ where: { id: userId } }), 0);
			assert.equal(
				await db.order.count({ where: { id: { in: fixtures.map((row) => row.id) } } }),
				0
			);
			assert.equal(await db.walletTransaction.count({ where: { userId } }), 0);
			assert.equal(await db.category.count({ where: { id: resources.categoryId } }), 0);
			cleanupVerified = true;
		}
	} catch (error) {
		console.error(JSON.stringify({ cleanupVerified: false, journal, code: error?.code ?? null }));
		process.exitCode = 1;
	}
	if (journal)
		await writeFile(
			journal,
			JSON.stringify(
				{ runId, userId, prefix, fixtures, resources, results, cleanupVerified },
				null,
				2
			),
			{ mode: 0o600 }
		);
	await vite?.close();
	await db?.$disconnect();
	await bridge?.close();
	globalThis.fetch = originalFetch;
	delete globalThis.__paymentWalkthrough;
}
console.log(
	JSON.stringify(
		{
			success: process.exitCode !== 1,
			separateStaging: true,
			externalCharges: 0,
			passed: results.length,
			results,
			cleanupVerified,
			verifiedTlsConnections: bridge?.verifiedTlsConnections(),
			journal
		},
		null,
		2
	)
);
