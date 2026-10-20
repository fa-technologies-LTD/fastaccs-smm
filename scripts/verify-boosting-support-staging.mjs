import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'vite';
import { createVerifiedStagingBridge } from './verified-staging-bridge.mjs';

// Separate staging only. Every synthetic row and notification rolls back. No supplier,
// payment, email, worker or external request is permitted by this support rehearsal.
if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const fixture = randomUUID(),
	orderId = randomUUID();
const emails = [
	`support-admin-${fixture}@example.invalid`,
	`support-buyer-${fixture}@example.invalid`
];
let bridge,
	db,
	vite,
	result,
	blockedExternal = 0;
let phase = 'connect separate staging';
const originalFetch = globalThis.fetch,
	rollback = new Error('EXPECTED_SUPPORT_FIXTURE_ROLLBACK');
try {
	bridge = await createVerifiedStagingBridge();
	phase = 'load local support module';
	db = new PrismaClient({ datasourceUrl: bridge.url, log: [] });
	process.env.DATABASE_URL = bridge.url;
	process.env.DIRECT_URL = bridge.url;
	process.env.FASTACCS_LOCAL_DATA_MODE = 'staging';
	for (const key of [
		'SMMRAJA_API_KEY',
		'BULKFOLLOWS_API_KEY',
		'HUBMAN_API_TOKEN',
		'PVAPINS_API_KEY',
		'SMTP_HOST',
		'SMTP_USER',
		'SMTP_PASSWORD',
		'GMAIL_USER',
		'GMAIL_APP_PASSWORD',
		'RESEND_API_KEY',
		'GA4_API_SECRET',
		'CRON_SECRET'
	])
		process.env[key] = '';
	globalThis.fetch = async () => {
		blockedExternal++;
		throw new Error('External requests forbidden in rollback-only support rehearsal.');
	};
	vite = await createServer({
		cacheDir: 'node_modules/.vite-support-rehearsal',
		server: { middlewareMode: true, hmr: false },
		appType: 'custom'
	});
	const { applyBoostSupportAction } = await vite.ssrLoadModule(
		'/src/lib/server/boosting-support.ts'
	);
	phase = 'rollback-only fixture rehearsal';
	try {
		await db.$transaction(
			async (tx) => {
				const admin = await tx.user.create({
					data: {
						email: emails[0],
						fullName: 'Synthetic support admin',
						userType: 'ADMIN',
						restrictedCategories: [],
						adminRoleAssignment: { create: { role: 'FULL_ADMIN' } }
					}
				});
				const buyer = await tx.user.create({
					data: { email: emails[1], fullName: 'Synthetic support buyer', restrictedCategories: [] }
				});
				const category = await tx.category.create({
					data: {
						name: 'Synthetic support-only item',
						slug: `support-${fixture}`,
						categoryType: 'boosting_service',
						isActive: false,
						metadata: { boosting_platform: 'instagram', boosting_action_type: 'followers' }
					}
				});
				await tx.order.create({
					data: {
						id: orderId,
						orderNumber: `QA-SUPPORT-${fixture}`,
						userId: buyer.id,
						subtotal: 850,
						totalAmount: 850,
						paymentStatus: 'paid',
						paidAt: new Date(),
						status: 'completed',
						deliveryStatus: 'delivered',
						orderType: 'boosting',
						deliveryMethod: 'dashboard',
						deliveryContact: emails[1]
					}
				});
				const item = await tx.orderItem.create({
					data: {
						orderId,
						categoryId: category.id,
						quantity: 1,
						unitPrice: 850,
						totalPrice: 850,
						productName: 'Instagram Followers',
						productCategory: 'boosting_service',
						boostQuantity: 500,
						boostTargetUrl: 'https://www.instagram.com/originalfixture',
						boostFulfillmentStatus: 'under_review'
					}
				});
				const fulfillment = await tx.boostFulfillment.create({
					data: {
						orderItemId: item.id,
						offerSnapshot: { platform: 'instagram', outcome: 'followers' },
						targetUrl: item.boostTargetUrl,
						targetKey: `support-${fixture}`,
						platform: 'instagram',
						outcome: 'followers',
						targetType: 'profile',
						quantity: 500,
						customerPriceNgn: 850,
						status: 'manual_review',
						customerStatus: 'under_review',
						fulfillmentMode: 'live',
						supplierOrderId: 'SYNTHETIC-CANCELLED-NOT-SENT',
						rawProviderStatus: 'Canceled',
						finalSupplierCostUsd: 0,
						maximumSupplierCostNgn: 330,
						lastSafeErrorCategory: 'provider_cancelled',
						nextActionAt: null
					}
				});
				const complaint = await tx.boostComplaint.create({
					data: {
						fulfillmentId: fulfillment.id,
						userId: buyer.id,
						type: 'missing',
						status: 'open',
						customerNote: 'Synthetic unresolved delivery issue for rollback verification only.'
					}
				});
				const base = {
					itemId: item.id,
					actorId: admin.id,
					operationId: randomUUID(),
					expectedRevision: null,
					action: 'request_link',
					message: 'Please send your public Instagram profile link.'
				};
				const requested = await applyBoostSupportAction(tx, base);
				assert.equal(requested.support.state, 'awaiting_customer');
				const repeated = await applyBoostSupportAction(tx, base);
				assert.equal(repeated.repeated, true);
				assert.equal(await tx.notification.count({ where: { orderId, userId: buyer.id } }), 1);
				const reply = await applyBoostSupportAction(tx, {
					itemId: item.id,
					orderId,
					actorId: buyer.id,
					operationId: randomUUID(),
					expectedRevision: requested.support.revision,
					requestId: requested.support.requestId,
					action: 'reply',
					link: 'https://www.instagram.com/correctfixture',
					message: 'Here is the corrected public profile.'
				});
				assert.equal(reply.support.state, 'reply_received');
				const before = await tx.boostFulfillment.findUniqueOrThrow({
					where: { orderItemId: item.id }
				});
				assert.equal(before.targetUrl, item.boostTargetUrl);
				assert.equal(before.supplierOrderId, 'SYNTHETIC-CANCELLED-NOT-SENT');
				assert.equal(before.nextActionAt, null);
				const completion = {
					itemId: item.id,
					actorId: admin.id,
					operationId: randomUUID(),
					expectedRevision: reply.support.revision,
					action: 'confirm_delivery',
					message: 'Support has confirmed delivery and closed this review.',
					confirmed: true,
					evidence: 'SYNTHETIC receipt confirmed for local QA only; not real delivery proof.'
				};
				const resolved = await applyBoostSupportAction(tx, completion);
				assert.equal(resolved.support.state, 'resolved');
				assert.ok(!JSON.stringify(resolved).includes('SYNTHETIC receipt'));
				const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } }),
					after = await tx.boostFulfillment.findUniqueOrThrow({ where: { orderItemId: item.id } });
				assert.equal(order.status, 'completed');
				assert.equal(order.deliveryStatus, 'delivered');
				assert.equal(order.paymentStatus, 'paid');
				assert.equal(Number(order.refundedAmount), 0);
				assert.equal(Number(order.totalAmount), 850);
				assert.equal(after.status, 'completed');
				assert.equal(after.rawProviderStatus, 'Canceled');
				assert.equal(Number(after.finalSupplierCostUsd), 0);
				assert.equal(Number(after.maximumSupplierCostNgn), 330);
				assert.equal(after.targetUrl, item.boostTargetUrl);
				assert.equal(after.nextActionAt, null);
				const closedComplaint = await tx.boostComplaint.findUniqueOrThrow({
					where: { id: complaint.id }
				});
				assert.equal(closedComplaint.status, 'resolved');
				assert.ok(closedComplaint.resolvedAt);
				assert.equal(closedComplaint.validatedByUserId, admin.id);
				assert.equal(
					await tx.orderItem.count({
						where: {
							id: item.id,
							OR: [
								{
									boostFulfillmentStatus: {
										in: [
											'pending',
											'needs_link',
											'in_progress',
											'under_review',
											'partial',
											'rejected',
											'cancelled'
										]
									}
								},
								{
									boostFulfillment: {
										is: {
											complaints: {
												some: {
													status: {
														in: [
															'open',
															'validated',
															'escalating',
															'escalated',
															'escalation_unknown'
														]
													}
												}
											}
										}
									}
								}
							]
						}
					}),
					0
				);
				const count = await tx.notification.count({ where: { orderId } });
				assert.equal((await applyBoostSupportAction(tx, completion)).repeated, true);
				assert.equal(await tx.notification.count({ where: { orderId } }), count);
				// A completed delivery can later have an open customer complaint. Closing that
				// evidenced review must work without reopening/submitting the supplier order.
				const followUp = await tx.boostComplaint.create({
					data: {
						fulfillmentId: fulfillment.id,
						userId: buyer.id,
						type: 'stopped',
						status: 'open',
						customerNote: 'Synthetic post-completion review; not a real customer complaint.'
					}
				});
				const followUpResolved = await applyBoostSupportAction(tx, {
					...completion,
					operationId: randomUUID(),
					expectedRevision: resolved.support.revision
				});
				assert.equal(followUpResolved.support.state, 'resolved');
				assert.equal(
					(await tx.boostComplaint.findUniqueOrThrow({ where: { id: followUp.id } })).status,
					'resolved'
				);
				const finalFulfillment = await tx.boostFulfillment.findUniqueOrThrow({
					where: { orderItemId: item.id }
				});
				assert.equal(finalFulfillment.rawProviderStatus, 'Canceled');
				assert.equal(finalFulfillment.supplierOrderId, 'SYNTHETIC-CANCELLED-NOT-SENT');
				assert.equal(finalFulfillment.nextActionAt, null);
				result = {
					separateStaging: true,
					requestPersisted: true,
					customerReplyPersisted: true,
					duplicateActionsSuppressed: true,
					originalTargetAndSupplierHistoryPreserved: true,
					closedReviewLeavesActiveQueue: true,
					parentItemAndFulfillmentAgree: true,
					openDeliveryComplaintResolved: true,
					completedDeliveryReviewResolved: true,
					privateEvidenceNotExposed: true,
					paymentAndChargesUnchanged: true,
					externalCalls: blockedExternal
				};
				throw rollback;
			},
			{ timeout: 60000 }
		);
	} catch (error) {
		if (error !== rollback) throw error;
	}
	assert.equal(await db.order.count({ where: { id: orderId } }), 0);
	assert.equal(await db.user.count({ where: { email: { in: emails } } }), 0);
	assert.equal(await db.category.count({ where: { slug: `support-${fixture}` } }), 0);
	assert.equal(await db.orderEvent.count({ where: { orderId } }), 0);
	assert.equal(await db.notification.count({ where: { orderId } }), 0);
	assert.equal(blockedExternal, 0);
	console.log(
		JSON.stringify({
			...result,
			rollbackAndIndependentCleanupVerified: true,
			productionChanged: false,
			emailsSent: 0,
			supplierCalls: 0,
			payments: 0
		})
	);
} catch (error) {
	console.error(
		JSON.stringify({
			supportRehearsalFailed: true,
			code: error.code ?? error.name,
			phase,
			causeCode: error.cause?.code ?? null,
			message: String(error.message).split('\n')[0].slice(0, 180)
		})
	);
	process.exitCode = 1;
} finally {
	globalThis.fetch = originalFetch;
	await vite?.close();
	await db?.$disconnect();
	await bridge?.close();
}
