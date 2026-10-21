import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'vite';
import { createVerifiedStagingBridge } from './verified-staging-bridge.mjs';

// Real PostgreSQL, fictional fixtures, always rolled back. No production/customer
// account, supplier, payment, email, cron invocation or external send is allowed.
if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const tag = randomUUID(),
	userId = randomUUID(),
	rollback = new Error('EXPECTED_SUPER24H_ROLLBACK');
let bridge,
	db,
	vite,
	activeTx,
	result,
	phase = 'verified separate staging',
	blockedExternal = 0;
const originalFetch = globalThis.fetch,
	originalPrisma = globalThis.prisma;
try {
	bridge = await createVerifiedStagingBridge();
	db = new PrismaClient({ datasourceUrl: bridge.url, log: [] });
	process.env.DATABASE_URL = bridge.url;
	process.env.DIRECT_URL = bridge.url;
	process.env.FASTACCS_LOCAL_DATA_MODE = 'staging';
	for (const key of [
		'SMMRAJA_API_KEY',
		'BULKFOLLOWS_API_KEY',
		'HUBMAN_API_TOKEN',
		'PVAPINS_API_KEY',
		'MONNIFY_API_KEY',
		'MONNIFY_SECRET_KEY',
		'SMTP_HOST',
		'SMTP_USER',
		'SMTP_PASSWORD',
		'GMAIL_USER',
		'GMAIL_APP_PASSWORD',
		'RESEND_API_KEY',
		'CRON_SECRET',
		'GA4_API_SECRET',
		'PASSWORD_RESET_SECRET'
	])
		process.env[key] = '';
	globalThis.fetch = async () => {
		blockedExternal++;
		throw new Error('External request forbidden in reward rehearsal.');
	};
	globalThis.prisma = new Proxy(db, {
		get(target, prop) {
			if (prop === '$transaction')
				return async (callback) => {
					assert.ok(activeTx, 'No application transaction outside the rollback fixture');
					return callback(activeTx);
				};
			const source = activeTx ?? target;
			const value = Reflect.get(source, prop, source);
			return typeof value === 'function' ? value.bind(source) : value;
		}
	});
	phase = 'load real clearing implementation';
	vite = await createServer({
		cacheDir: 'node_modules/.vite-super24h-staging',
		server: { middlewareMode: true, hmr: false },
		appType: 'custom'
	});
	const { vestMaturedAffiliateRewards } = await vite.ssrLoadModule(
		'/src/lib/services/affiliate-vesting.ts'
	);
	const { NOT_HELD_FOR_IDENTITY_REVIEW } = await vite.ssrLoadModule(
		'/src/lib/services/affiliate-review-hold.ts'
	);
	phase = 'rollback-only money and PostgreSQL-filter rehearsal';
	try {
		await db.$transaction(
			async (tx) => {
				activeTx = tx;
				const now = new Date(),
					earned = new Date(now.getTime() - 25 * 3600000),
					futureEarned = new Date(now.getTime() - 23 * 3600000),
					oldDeadline = new Date(earned.getTime() + 14 * 86400000).toISOString();
				await tx.user.create({
					data: {
						id: userId,
						email: `super24h-${tag}@example.invalid`,
						isAffiliateEnabled: true,
						restrictedCategories: []
					}
				});
				await tx.microcopy.upsert({
					where: { key: 'config.affiliate.super.switchover_at' },
					update: { value: '', isActive: false },
					create: { key: 'config.affiliate.super.switchover_at', value: '', isActive: false }
				});
				const wallet = await tx.wallet.create({ data: { userId, balance: 1800 } });
				const refund = await tx.walletTransaction.create({
					data: {
						userId,
						walletId: wallet.id,
						type: 'store_credit_refund',
						status: 'available',
						amount: 1800,
						balanceBefore: 0,
						balanceAfter: 1800,
						description: 'Synthetic spend-only refund',
						reference: `qa-refund:${tag}`
					}
				});
				const rows = {};
				async function add(
					name,
					{
						metadata = {},
						reference,
						createdAt = earned,
						status = 'pending',
						amount = 700,
						refunded = false
					} = {}
				) {
					const buyer = await tx.user.create({
						data: { email: `super24h-${name}-${tag}@example.invalid`, restrictedCategories: [] }
					});
					const order = await tx.order.create({
						data: {
							userId: buyer.id,
							affiliateUserId: userId,
							orderNumber: `QA-SUPER24H-${name}-${tag}`,
							affiliateCode: 'QA-SUPER24H',
							orderType: 'account',
							subtotal: 5000,
							totalAmount: 5000,
							refundedAmount: refunded ? 5000 : 0,
							status: refunded ? 'refunded' : 'completed',
							paymentStatus: refunded ? 'refunded' : 'paid',
							deliveryStatus: refunded ? 'refunded' : 'delivered',
							deliveryMethod: 'dashboard',
							deliveryContact: buyer.email,
							paidAt: earned,
							createdAt: earned
						}
					});
					const row = await tx.walletTransaction.create({
						data: {
							userId,
							walletId: wallet.id,
							type: 'affiliate_credit',
							status,
							amount,
							balanceBefore: 1800,
							balanceAfter: 1800,
							description: `Synthetic ${name}`,
							reference: reference ? reference(order) : `super:activation:${userId}:${buyer.id}`,
							createdAt,
							metadata: {
								kind: 'super_activation',
								referredUserId: buyer.id,
								activatedByOrderId: order.id,
								activationSpendThreshold: 3500,
								activationOrderThreshold: 3,
								vestsAt: oldDeadline,
								...metadata
							}
						}
					});
					rows[name] = row;
					return row;
				}
				await add('missing');
				await add('false', { metadata: { suspectedSelfReferral: false } });
				await add('null', { metadata: { suspectedSelfReferral: null } });
				await add('flagged', { metadata: { suspectedSelfReferral: true } });
				await add('future', { createdAt: futureEarned });
				await add('refunded', { refunded: true });
				await add('regular', {
					reference: (order) => `affiliate:credit:order:${order.id}`,
					metadata: { kind: 'regular', vestsAt: oldDeadline }
				});
				await add('costHeld', {
					reference: (order) => `super:commission:order:${order.id}`,
					status: 'under_review',
					amount: 0,
					metadata: { kind: 'super_order_commission', holdReason: 'cost_missing' }
				});
				await add('monthly', {
					reference: () => `super:monthly_bonus:${userId}:${earned.toISOString().slice(0, 7)}:2`,
					amount: 3000,
					metadata: {
						kind: 'super_monthly_bonus',
						monthKey: earned.toISOString().slice(0, 7),
						tierCount: 2
					}
				});
				const commission = await add('commission', {
					reference: (order) => `super:commission:order:${order.id}`,
					createdAt: new Date(now.getTime() - 3600000),
					amount: 40,
					metadata: { kind: 'super_order_commission' }
				});
				await tx.walletTransaction.update({
					where: { id: commission.id },
					data: {
						metadata: { ...commission.metadata, orderId: commission.metadata.activatedByOrderId }
					}
				});
				const selected = await tx.walletTransaction.findMany({
					where: {
						userId,
						type: 'affiliate_credit',
						status: 'pending',
						AND: [NOT_HELD_FOR_IDENTITY_REVIEW]
					},
					select: { id: true }
				});
				for (const name of ['missing', 'false', 'null'])
					assert.ok(
						selected.some((r) => r.id === rows[name].id),
						`Real PostgreSQL omitted healthy ${name} flag`
					);
				assert.ok(!selected.some((r) => r.id === rows.flagged.id));
				const first = await vestMaturedAffiliateRewards(50, { userId });
				assert.equal(
					first.vested,
					5,
					'Exactly three healthy activations, one monthly reward and one paid commission may clear'
				);
				assert.equal(first.voided, 1, 'Refunded, no-longer-qualified activation must reverse');
				const after = await tx.walletTransaction.findMany({
					where: { userId },
					select: { id: true, type: true, status: true, amount: true, metadata: true }
				});
				for (const name of ['missing', 'false', 'null', 'monthly', 'commission']) {
					const r = after.find((x) => x.id === rows[name].id);
					assert.equal(r.status, 'available');
					assert.equal(r.metadata.vestingHours, 24);
					assert.equal(r.metadata.originalVestsAt, oldDeadline);
				}
				for (const name of ['future', 'flagged', 'regular'])
					assert.equal(after.find((x) => x.id === rows[name].id).status, 'pending', name);
				assert.equal(after.find((x) => x.id === rows.costHeld.id).status, 'under_review');
				assert.equal(after.find((x) => x.id === refund.id).type, 'store_credit_refund');
				assert.equal(Number(after.find((x) => x.id === refund.id).amount), 1800);
				const balance = Number((await tx.wallet.findUnique({ where: { id: wallet.id } })).balance);
				assert.equal(balance, 6940);
				const replay = await vestMaturedAffiliateRewards(50, { userId });
				assert.equal(replay.vested, 0);
				assert.equal(
					Number((await tx.wallet.findUnique({ where: { id: wallet.id } })).balance),
					balance
				);
				assert.equal(
					await tx.walletTransaction.count({ where: { userId, type: 'affiliate_payout' } }),
					0
				);
				result = {
					separateStaging: true,
					realPostgresMissingFalseNullFlagPass: true,
					trueFlagStaysHeld: true,
					super24Hours: true,
					olderSuperDeadlinesRecovered: true,
					originalEarningClockPreserved: true,
					commissionUsesOriginalPayment: true,
					regularWindowUnchanged: true,
					notYetDueStillPending: true,
					costMissingStillHeld: true,
					refundedRewardNotPaid: true,
					refundCreditStillSpendOnly: true,
					replayDoesNotDoubleCredit: true,
					payouts: 0,
					emails: 0,
					supplierCalls: 0,
					externalCalls: blockedExternal
				};
				throw rollback;
			},
			{ timeout: 180000, maxWait: 15000 }
		);
	} catch (error) {
		if (error !== rollback) throw error;
	} finally {
		activeTx = undefined;
	}
	assert.ok(result);
	assert.equal(await db.user.count({ where: { id: userId } }), 0);
	assert.equal(await db.walletTransaction.count({ where: { userId } }), 0);
	console.log(
		JSON.stringify(
			{
				...result,
				rollbackVerified: true,
				independentCleanupVerified: true,
				productionChanged: false
			},
			null,
			2
		)
	);
} catch (error) {
	console.error(
		JSON.stringify({
			error: 'Super timing staging verification failed',
			phase,
			code: error.code ?? null,
			name: error.name,
			message: String(error.message).slice(0, 450)
		})
	);
	process.exitCode = 1;
} finally {
	globalThis.fetch = originalFetch;
	globalThis.prisma = originalPrisma;
	await vite?.close();
	await db?.$disconnect();
	await bridge?.close();
}
