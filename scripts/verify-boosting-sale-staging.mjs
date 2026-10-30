import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createVerifiedStagingBridge } from './verified-staging-bridge.mjs';

// Built application, real separate staging PostgreSQL, rollback-only synthetic fixtures.
// No supplier/client imports, paid order, wallet credit, real gateway, emails or persistent edits.
if (process.argv.length !== 2) throw new Error('No arguments accepted. Build locally first.');
const bridge = await createVerifiedStagingBridge();
const target = bridge.url;
const db = new PrismaClient({ datasourceUrl: target, log: [] });
const originalFetch = globalThis.fetch;
const rollback = new Error('EXPECTED_FIXTURE_ROLLBACK');
const origin = 'http://127.0.0.1:5174';
const fixtureId = randomUUID();
const email = `sale-review-${fixtureId}@example.invalid`;
let gatewayStubs = 0,
	blockedExternal = 0,
	result;
const stateBefore = await db.boostProviderState.findMany({ orderBy: { provider: 'asc' } });
const countsBefore = await Promise.all([
	db.user.count(),
	db.category.count(),
	db.boostCustomerOffer.count(),
	db.order.count()
]);
const runtime = {
	DATABASE_URL: target,
	DIRECT_URL: target,
	NODE_ENV: 'production',
	FASTACCS_LOCAL_DATA_MODE: 'staging',
	BOOSTING_AUTOMATION_MODE: 'live',
	MONNIFY_BASE_URL: 'https://gateway.local.invalid',
	MONNIFY_API_KEY: 'LOCAL-FAKE',
	MONNIFY_SECRET_KEY: 'LOCAL-FAKE',
	MONNIFY_CONTRACT_CODE: 'LOCAL-FAKE',
	CHECKOUT_DISABLED: 'false'
};
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
	'PASSWORD_RESET_SECRET',
	'CRON_SECRET',
	'GA4_API_SECRET',
	'GOOGLE_ANALYTICS_API_SECRET'
])
	runtime[key] = '';
Object.assign(process.env, runtime);
globalThis.fetch = async (input, init) => {
	const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
	if (url.origin === 'https://gateway.local.invalid') {
		gatewayStubs++;
		if (url.pathname === '/api/v1/auth/login')
			return Response.json({
				requestSuccessful: true,
				responseBody: { accessToken: 'LOCAL-FAKE', expiresIn: 3600 }
			});
		assert.equal(url.pathname, '/api/v1/merchant/transactions/init-transaction');
		const body = JSON.parse(init.body);
		return Response.json({
			requestSuccessful: true,
			responseBody: {
				paymentReference: body.paymentReference,
				transactionReference: `LOCAL-${fixtureId}`,
				// Returned only by this in-process stub; never followed or requested.
				checkoutUrl: `https://sandbox.monnify.com/checkout/LOCAL-${fixtureId}`,
				amount: body.amount,
				currencyCode: 'NGN'
			}
		});
	}
	blockedExternal++;
	throw new Error('External HTTP is forbidden in this rollback-only rehearsal.');
};
try {
	await db
		.$transaction(
			async (tx) => {
				// Synthetic runtime values are visible only in this uncommitted transaction, not to
				// localhost, cron, other connections or production. They are not supplier evidence.
				const now = new Date();
				await tx.boostProviderState.update({
					where: { provider: 'smm_raja' },
					data: {
						enabled: true,
						circuitOpen: false,
						currency: 'USD',
						balance: 100,
						projectedBalance: 100,
						lastCatalogueSuccessAt: now,
						lastBalanceSuccessAt: now
					}
				});
				const salt = randomBytes(16).toString('hex'),
					password = randomBytes(24).toString('hex');
				const user = await tx.user.create({
					data: {
						email,
						passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
						fullName: 'Rollback-only checkout fixture',
						emailVerified: true,
						userType: 'ADMIN',
						marketingEmailEnabled: false,
						restrictedCategories: [],
						adminRoleAssignment: { create: { role: 'FULL_ADMIN' } }
					}
				});
				const category = await tx.category.create({
					data: {
						name: 'TikTok Likes',
						slug: `local-fixture-${fixtureId}`,
						categoryType: 'boosting_service',
						isActive: true,
						metadata: { boosting_platform: 'tiktok', boosting_action_type: 'likes' }
					}
				});
				const service = await tx.boostProviderService.create({
					data: {
						provider: 'smm_raja',
						serviceId: `s999${Date.now()}`,
						name: 'TikTok Likes',
						category: 'TikTok Likes',
						providerType: 'Default',
						ratePerThousand: 0.1,
						minQuantity: 100,
						maxQuantity: 10000,
						refillAdvertised: false,
						platforms: ['tiktok'],
						outcomes: ['likes'],
						targetType: 'content',
						qualitySignals: [],
						anomalies: [],
						catalogueStatus: 'ready_for_review',
						fingerprint: fixtureId,
						lastSeenAt: now
					}
				});
				const offer = await tx.boostCustomerOffer.create({
					data: {
						categoryId: category.id,
						platform: 'tiktok',
						outcome: 'likes',
						targetType: 'content',
						qualityTier: 'value',
						customerName: 'TikTok Likes',
						shortPromise: 'A straightforward option.',
						expectationChips: [],
						minQuantity: 100,
						maxQuantity: 10000,
						stepQuantity: 100,
						quantityPresets: [100, 200, 500],
						pricePerStepNgn: 100,
						priceLocked: true,
						requiredVerifiedSignals: [],
						minimumMarginPercent: 20,
						normalCostTargetNgn: 15,
						maximumSupplierCostNgn: 100,
						attemptCap: 1,
						recoveryModes: [],
						status: 'hidden',
						routingPolicy: 'locked'
					}
				});
				const route = await tx.boostServiceRoute.create({
					data: {
						offerId: offer.id,
						providerServiceId: service.id,
						state: 'shadow',
						equivalenceApproved: false,
						targetType: 'content',
						verifiedSignals: [],
						audienceTags: [],
						minimumQuantity: 100,
						maximumQuantity: 10000,
						reliabilityScore: 1,
						reliabilityObservations: 5
					}
				});
				await tx.boostCustomerOffer.update({
					where: { id: offer.id },
					data: { lockedRouteId: route.id }
				});
				const unmappedOffer = await tx.boostCustomerOffer.create({
					data: {
						categoryId: category.id,
						platform: 'tiktok',
						outcome: 'likes',
						targetType: 'content',
						qualityTier: 'stable',
						customerName: 'Synthetic unmapped option',
						shortPromise: 'A neutral description.',
						expectationChips: [],
						minQuantity: 100,
						maxQuantity: 10000,
						stepQuantity: 100,
						quantityPresets: [100, 200, 500],
						pricePerStepNgn: 300,
						priceLocked: true,
						requiredVerifiedSignals: [],
						minimumMarginPercent: 20,
						normalCostTargetNgn: 0,
						maximumSupplierCostNgn: 0,
						attemptCap: 1,
						recoveryModes: [],
						status: 'hidden'
					}
				});
				// Keep the real application queries/writes inside this same real PostgreSQL transaction.
				let proxy;
				proxy = new Proxy(tx, {
					get(object, key) {
						if (key === '$transaction')
							return async (callback) =>
								typeof callback === 'function' ? callback(proxy) : Promise.all(callback);
						if (key === '$disconnect') return async () => {};
						const value = object[key];
						return typeof value === 'function' ? value.bind(object) : value;
					}
				});
				globalThis.prisma = proxy;
				const { Server } = await import('../.svelte-kit/output/server/index.js');
				const { manifest } = await import('../.svelte-kit/output/server/manifest.js');
				const server = new Server(manifest);
				await server.init({ env: runtime });
				let cookie = '';
				async function request(path, body) {
					return server.respond(
						new Request(`${origin}${path}`, {
							method: body ? 'POST' : 'GET',
							headers: { origin, 'content-type': 'application/json', cookie },
							...(body ? { body: JSON.stringify(body) } : {})
						}),
						{ getClientAddress: () => '127.0.0.1' }
					);
				}
				const login = await request('/api/auth/login', {
					email,
					password,
					redirectTo: '/admin/boosting'
				});
				assert.equal(login.status, 200, 'Real session login');
				cookie =
					login.headers
						.getSetCookie()
						.find((value) => value.startsWith('session='))
						?.split(';')[0] ?? '';
				assert.ok(cookie, 'Authenticated session cookie');
				const pricingResponse = await request('/api/admin/boosting-pricing');
				assert.equal(pricingResponse.status, 200);
				const pricing = (await pricingResponse.json()).data;
				assert.ok(
					pricing.sheet.rows.every(
						(row) =>
							row.maximumQuantity == null ||
							(Number.isSafeInteger(row.maximumQuantity) &&
								row.maximumQuantity >= row.startingQuantity &&
								row.maximumQuantity <= 2147483647)
					),
					'Loaded maximum limits are representable'
				);
				Object.assign(pricing.sheet.settings, {
					fx: 1500,
					defaultMarkup: 40,
					profitTargetNgn: 0,
					hardProfitNgn: 0,
					maxPriceMultiple: 0,
					feeConfirmed: false
				});
				for (const row of pricing.sheet.rows) row.selected = false;
				const row = pricing.sheet.rows.find((row) => row.sourceOfferId === offer.id);
				assert.ok(row, 'The real sheet loads the new fixture offer');
				Object.assign(row, {
					startingQuantity: 200,
					increment: 200,
					maximumQuantity: 10000,
					sale: 250,
					priceMode: 'manual',
					selected: true,
					option: 'Reviewed option',
					shortPromise: 'Neutral customer description.'
				});
				const save = await request('/api/admin/boosting-pricing', {
					action: 'save',
					confirmSave: true,
					sheet: pricing.sheet
				});
				assert.equal(
					save.status,
					200,
					`Confirmed Save: ${(await save.clone().text()).slice(0, 180)}`
				);
				const stored = await tx.boostCustomerOffer.findUniqueOrThrow({ where: { id: offer.id } });
				assert.equal(stored.minQuantity, 200);
				assert.equal(stored.stepQuantity, 200);
				assert.equal(stored.maxQuantity, 10000);
				assert.equal(stored.customerName, 'Reviewed option');
				assert.equal(Number(stored.pricePerStepNgn), 500);
				assert.equal(stored.status, 'live');
				const approvedRoute = await tx.boostServiceRoute.findUniqueOrThrow({
					where: { id: route.id }
				});
				assert.equal(approvedRoute.state, 'enabled');
				assert.equal(approvedRoute.equivalenceApproved, true);
				assert.equal(approvedRoute.reviewedByUserId, user.id);
				const visible = await (await request('/api/boosting-offers')).json();
				assert.ok(
					visible.data.some((row) => row.id === offer.id),
					'Saved fixture is offered'
				);
				// Review existing prices without reselecting a supplier: accept the owner's
				// preference override/current cost and remove only unverified future claims.
				await tx.boostCustomerOffer.update({
					where: { id: offer.id },
					data: {
						maximumSupplierCostNgn: 0.01,
						requiredVerifiedSignals: ['unverified-quality'],
						minimumMarginPercent: 350
					}
				});
				const advisoryView = (await (await request('/api/admin/boosting-pricing')).json()).data;
				advisoryView.sheet.settings.hardProfitNgn = 1000;
				const reviewedRow = advisoryView.sheet.rows.find((r) => r.sourceOfferId === offer.id);
				Object.assign(reviewedRow, { reviewRequested: true, shortPromise: 'Best' });
				const advisorySave = await request('/api/admin/boosting-pricing', {
					action: 'save',
					confirmSave: true,
					sheet: advisoryView.sheet
				});
				assert.equal(
					advisorySave.status,
					200,
					`Owner advisory review: ${(await advisorySave.clone().text()).slice(0, 180)}`
				);
				const reviewedOffer = await tx.boostCustomerOffer.findUniqueOrThrow({
					where: { id: offer.id }
				});
				assert.equal(Number(reviewedOffer.pricePerStepNgn), 500);
				assert.equal(Number(reviewedOffer.maximumSupplierCostNgn), 30);
				assert.deepEqual(reviewedOffer.requiredVerifiedSignals, []);
				const reviewedPublic = (await (await request('/api/boosting-offers')).json()).data.find(
					(r) => r.id === offer.id
				);
				assert.ok(reviewedPublic, 'Reviewed offer remains purchasable');
				assert.equal(
					reviewedPublic.shortPromise,
					'Delivery timing varies. Track progress from your order.'
				);
				const reviewAudit = await tx.adminAuditLog.findFirstOrThrow({
					where: { actorUserId: user.id, action: 'boosting_controls_saved' },
					orderBy: { createdAt: 'desc' }
				});
				const receipt = reviewAudit.metadata.ownerReviews.find((r) => r.offerId === offer.id);
				assert.equal(receipt.previousCostLimitNgn, 0.01);
				assert.equal(receipt.approvedCostLimitNgn, 30);
				assert.equal(receipt.acceptedBelowProfitPreference, true);
				assert.deepEqual(receipt.removedUnverifiedRequirements, ['unverified-quality']);
				// The other missing UI path: browse an unmapped offer, select an exact code,
				// then atomically approve/pin it together with its price and Live tick.
				const afterSave = (await (await request('/api/admin/boosting-pricing')).json()).data;
				const unmappedRow = afterSave.sheet.rows.find((r) => r.sourceOfferId === unmappedOffer.id);
				assert.ok(unmappedRow);
				assert.equal(afterSave.quotes[unmappedRow.id], null);
				const choicesResponse = await request(
					`/api/admin/boosting-pricing/supplier-choices?${new URLSearchParams({ row: unmappedRow.id, provider: 'smm_raja', search: service.serviceId })}`
				);
				assert.equal(choicesResponse.status, 200);
				const choices = (await choicesResponse.json()).data.services;
				assert.equal(choices.length, 1);
				assert.equal(choices[0].providerServiceId, service.id);
				assert.deepEqual(choices[0].issues, []);
				Object.assign(unmappedRow, {
					supplierChoiceId: service.id,
					supplierChoiceRevision: choices[0].revision,
					selected: true,
					sale: 300
				});
				const selectedSave = await request('/api/admin/boosting-pricing', {
					action: 'save',
					confirmSave: true,
					sheet: afterSave.sheet
				});
				assert.equal(
					selectedSave.status,
					200,
					`Exact-choice Save: ${(await selectedSave.clone().text()).slice(0, 180)}`
				);
				const pinned = await tx.boostCustomerOffer.findUniqueOrThrow({
					where: { id: unmappedOffer.id },
					include: { routes: true }
				});
				assert.equal(pinned.status, 'live');
				assert.equal(pinned.routingPolicy, 'locked');
				assert.equal(pinned.routes.length, 1);
				assert.equal(pinned.routes[0].id, pinned.lockedRouteId);
				assert.equal(pinned.routes[0].providerServiceId, service.id);
				assert.equal(pinned.routes[0].equivalenceApproved, true);
				assert.deepEqual(pinned.routes[0].verifiedSignals, []);
				assert.equal(pinned.routes[0].verifiedRefillDays, null);
				const selectionAudit = await tx.adminAuditLog.findFirstOrThrow({
					where: { actorUserId: user.id, action: 'boosting_controls_saved' },
					orderBy: { createdAt: 'desc' }
				});
				const auditedSelection = selectionAudit.metadata.sheet.rows.find(
					(r) => r.sourceOfferId === pinned.id
				);
				assert.equal(auditedSelection.provider, 'smm_raja');
				assert.equal(auditedSelection.serviceId, service.serviceId);
				assert.equal(
					(await (await request('/api/boosting-offers')).json()).data.some(
						(r) => r.id === pinned.id
					),
					true
				);
				const checkoutBody = {
					checkoutKey: `local-${fixtureId}`,
					paymentMethod: 'monnify',
					totalAmount: 500,
					acceptedQuote: {
						subtotal: 500,
						discount: 0,
						total: 500,
						creditApplied: 0,
						payable: 500,
						linePrices: [500]
					},
					items: [
						{
							categoryId: category.id,
							boostOfferId: offer.id,
							quantity: 1,
							boostQuantity: 200,
							price: 1,
							boostTargetUrl: 'https://www.tiktok.com/@localreviewfixture/video/7599586070874918162'
						}
					]
				};
				const stale = await request('/api/orders', { ...checkoutBody, totalAmount: 1 });
				assert.equal(stale.status, 409);
				assert.equal((await stale.json()).code, 'CHECKOUT_PRICE_CHANGED');
				assert.equal(await tx.order.count({ where: { userId: user.id } }), 0);
				assert.equal(gatewayStubs, 0);
				const checkout = await request('/api/orders', checkoutBody);
				const checkoutResult = await checkout.json();
				assert.equal(checkout.status, 200, `Checkout: ${checkoutResult.error ?? 'unknown'}`);
				assert.equal(checkoutResult.success, true);
				const pending = await tx.order.findUniqueOrThrow({
					where: { id: checkoutResult.orderId },
					include: { orderItems: true }
				});
				assert.equal(Number(pending.totalAmount), 500);
				assert.equal(pending.paymentStatus, 'pending');
				assert.equal(pending.orderItems[0].boostQuantity, 200);
				await tx.boostProviderState.update({
					where: { provider: 'smm_raja' },
					data: { projectedBalance: 0 }
				});
				assert.ok(
					!(await (await request('/api/boosting-offers')).json()).data.some(
						(row) => row.id === offer.id
					),
					'Known insufficient funds hides offer'
				);
				const blocked = await request('/api/orders', {
					...checkoutBody,
					checkoutKey: `blocked-${fixtureId}`
				});
				assert.equal(blocked.status, 409, 'A stale cart is refused before creating another order');
				assert.equal(await tx.order.count({ where: { userId: user.id } }), 1);
				result = {
					separateStaging: true,
					realSessionLogin: true,
					oneConfirmedSave: true,
					preloadedSupplierApprovedWithFinalSave: true,
					exactSupplierSearchAndUnmappedOfferSave: true,
					selectedSupplierPersistedAndLocked: true,
					quantityAndPricePersisted: true,
					manualProfitPreferenceAccepted: true,
					currentQuotedCostReviewed: true,
					unverifiedQualityNotPromised: true,
					reviewAuditVerified: true,
					storefrontVerified: true,
					checkoutTotalNgn: 500,
					unpaidOrderOnly: true,
					knownUnavailableHidden: true,
					staleCartRefused: true,
					gateway: 'local stub only',
					supplierCalls: 0,
					realPayments: 0,
					emails: 0,
					productionChanged: false
				};
				throw rollback;
			},
			{ timeout: 300000, maxWait: 20000 }
		)
		.catch((error) => {
			if (error !== rollback) throw error;
		});
	assert.deepEqual(
		await db.boostProviderState.findMany({ orderBy: { provider: 'asc' } }),
		stateBefore,
		'Runtime fixtures rolled back'
	);
	assert.deepEqual(
		await Promise.all([
			db.user.count(),
			db.category.count(),
			db.boostCustomerOffer.count(),
			db.order.count()
		]),
		countsBefore,
		'All fixture rows rolled back'
	);
	assert.equal(blockedExternal, 0);
	assert.equal(gatewayStubs, 2);
	console.log(
		JSON.stringify({ ...result, rollbackVerified: true, blockedExternalRequests: blockedExternal })
	);
} catch (error) {
	console.error(
		JSON.stringify({
			error: 'Rollback-only staging rehearsal failed',
			message:
				error.code === 'ERR_ASSERTION'
					? String(error.message)
					: 'Application or database check failed; sensitive query details withheld.',
			code: error.code ?? null
		})
	);
	process.exitCode = 1;
} finally {
	delete globalThis.prisma;
	globalThis.fetch = originalFetch;
	try {
		assert.deepEqual(
			await db.boostProviderState.findMany({ orderBy: { provider: 'asc' } }),
			stateBefore
		);
		assert.deepEqual(
			await Promise.all([
				db.user.count(),
				db.category.count(),
				db.boostCustomerOffer.count(),
				db.order.count()
			]),
			countsBefore
		);
		console.log(JSON.stringify({ fixtureCleanupVerified: true, allChangesRolledBack: true }));
	} catch {
		console.error(
			JSON.stringify({ fixtureCleanupVerified: false, manualStagingCheckNeeded: true })
		);
		process.exitCode = 1;
	}
	await db.$disconnect();
	await bridge.close();
}
// The compiled application has unrelated background timers. All transaction cleanup above
// is awaited before ending this isolated verification process.
process.exit(process.exitCode ?? 0);
