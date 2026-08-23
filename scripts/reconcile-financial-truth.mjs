import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const APPLY_CONFIRMATION = 'I_UNDERSTAND_THIS_WRITES_FINANCIAL_DATA';
const VALID_REFUND_STATUSES = new Set([
	'available',
	'pending',
	'under_review',
	'requested',
	'paid'
]);
const REFUNDED = 'refunded';
const MANUAL_RELEASE = 'manual_release';
const PROMO_MILESTONE_SPEND = 8_000;
const GIFT_MILESTONE_SPEND = 70_000;

function flagValue(name) {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

function parseSelection(value) {
	return new Set(
		String(value || '')
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean)
	);
}

function amount(value) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

function metadataRecord(value) {
	return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasRefundMarker(order) {
	return [order.status, order.paymentStatus, order.deliveryStatus].some(
		(value) => String(value || '').toLowerCase() === REFUNDED
	);
}

function isRevenueOrder(order, refundedAmount = order.refundedAmount, forceFullRefund = false) {
	if (String(order.paymentChannel || '') === MANUAL_RELEASE) return false;
	if (forceFullRefund || hasRefundMarker(order)) return false;
	return (
		['paid', 'completed'].includes(String(order.status || '').toLowerCase()) ||
		String(order.paymentStatus || '').toLowerCase() === 'paid'
	);
}

function allocateItemRefunds(order, credits, targetRefund) {
	const byItem = new Map(order.orderItems.map((item) => [item.id, 0]));
	const capacityByItem = new Map();
	const itemByAccount = new Map();
	const total = amount(order.totalAmount);
	const gross = order.orderItems.reduce((sum, item) => sum + amount(item.totalPrice), 0);
	let unallocatedOrderValue = total;
	for (const [index, item] of order.orderItems.entries()) {
		const capacity =
			index === order.orderItems.length - 1
				? unallocatedOrderValue
				: Math.min(
						unallocatedOrderValue,
						gross > 0 ? amount((total * amount(item.totalPrice)) / gross) : 0
					);
		capacityByItem.set(item.id, capacity);
		unallocatedOrderValue = amount(unallocatedOrderValue - capacity);
	}
	for (const item of order.orderItems) {
		for (const account of item.accounts) itemByAccount.set(account.id, item.id);
	}

	let attributed = 0;
	for (const credit of credits) {
		const metadata = metadataRecord(credit.metadata);
		const accountId =
			typeof metadata.accountId === 'string'
				? metadata.accountId
				: itemByAccount.has(String(credit.reference || ''))
					? String(credit.reference)
					: null;
		const itemId = accountId ? itemByAccount.get(accountId) : null;
		if (!itemId) continue;
		const itemCapacity = Math.max(
			0,
			amount(capacityByItem.get(itemId)) - amount(byItem.get(itemId))
		);
		const creditAmount = Math.min(
			amount(credit.amount),
			Math.max(0, targetRefund - attributed),
			itemCapacity
		);
		byItem.set(itemId, amount((byItem.get(itemId) || 0) + creditAmount));
		attributed = amount(attributed + creditAmount);
	}

	let remaining = amount(targetRefund - attributed);
	let remainingCapacity = order.orderItems.reduce(
		(sum, item) =>
			sum + Math.max(0, amount(capacityByItem.get(item.id)) - amount(byItem.get(item.id))),
		0
	);
	for (const item of order.orderItems) {
		if (remaining <= 0) break;
		const current = byItem.get(item.id) || 0;
		const available = Math.max(0, amount(capacityByItem.get(item.id)) - current);
		if (available <= 0) continue;
		const share = Math.min(
			available,
			remaining,
			remainingCapacity <= available
				? remaining
				: amount((remaining * available) / remainingCapacity)
		);
		byItem.set(item.id, amount(current + share));
		remaining = amount(remaining - share);
		remainingCapacity = amount(remainingCapacity - available);
	}
	return byItem;
}

function linkedOrderId(transaction) {
	const metadata = metadataRecord(transaction.metadata);
	if (typeof metadata.orderId === 'string') return metadata.orderId;
	if (typeof metadata.activatedByOrderId === 'string') return metadata.activatedByOrderId;
	const match = String(transaction.reference || '').match(/^affiliate:credit:order:(.+)$/);
	return match?.[1] || null;
}

function planFingerprint(report) {
	return createHash('sha256').update(JSON.stringify(report)).digest('hex');
}

const requestedSelection = parseSelection(flagValue('orders'));
const suppliedFingerprint = flagValue('fingerprint');

if (APPLY && process.env.ALLOW_FINANCIAL_REPAIR !== APPLY_CONFIRMATION) {
	console.error(
		`Refusing to write. Set ALLOW_FINANCIAL_REPAIR=${APPLY_CONFIRMATION} and pass --apply only after reviewing the dry run.`
	);
	process.exit(1);
}
if (APPLY && requestedSelection.size === 0) {
	console.error('Refusing to write without an explicit --orders=<id,id,...> allowlist.');
	process.exit(1);
}
if (APPLY && !suppliedFingerprint) {
	console.error(
		'Refusing to write without the exact --fingerprint printed by the reviewed dry run.'
	);
	process.exit(1);
}

console.log(
	APPLY ? '=== APPLYING FINANCIAL RECONCILIATION ===' : '=== FINANCIAL RECONCILIATION DRY RUN ==='
);

try {
	const [orders, refundCredits] = await Promise.all([
		prisma.order.findMany({
			select: {
				id: true,
				orderNumber: true,
				userId: true,
				affiliateUserId: true,
				affiliateCode: true,
				paymentChannel: true,
				totalAmount: true,
				storeCreditApplied: true,
				refundedAmount: true,
				status: true,
				paymentStatus: true,
				deliveryStatus: true,
				orderItems: {
					select: {
						id: true,
						productName: true,
						quantity: true,
						unitPrice: true,
						totalPrice: true,
						refundedAmount: true,
						accounts: { select: { id: true, username: true, status: true } },
						phoneRental: { select: { id: true, status: true } }
					}
				}
			}
		}),
		prisma.walletTransaction.findMany({
			where: { type: 'store_credit_refund' },
			select: {
				id: true,
				walletId: true,
				userId: true,
				amount: true,
				balanceBefore: true,
				balanceAfter: true,
				status: true,
				reference: true,
				metadata: true,
				createdAt: true
			}
		})
	]);

	const orderById = new Map(orders.map((order) => [order.id, order]));
	const orderIdByAccountId = new Map(
		orders.flatMap((order) =>
			order.orderItems.flatMap((item) => item.accounts.map((account) => [account.id, order.id]))
		)
	);
	const creditsByOrder = new Map();
	for (const credit of refundCredits) {
		if (!VALID_REFUND_STATUSES.has(String(credit.status || '').toLowerCase())) continue;
		const metadata = metadataRecord(credit.metadata);
		const metadataOrderId = typeof metadata.orderId === 'string' ? metadata.orderId : null;
		const reference = String(credit.reference || '');
		const orderId =
			(metadataOrderId && orderById.has(metadataOrderId) ? metadataOrderId : null) ||
			(orderById.has(reference) ? reference : null) ||
			orderIdByAccountId.get(reference) ||
			null;
		if (!orderId || !orderById.has(orderId)) continue;
		const bucket = creditsByOrder.get(orderId) || [];
		bucket.push(credit);
		creditsByOrder.set(orderId, bucket);
	}

	const allPlans = [];
	const unsafe = [];
	for (const order of orders) {
		const credits = creditsByOrder.get(order.id) || [];
		if (credits.length === 0) continue;
		const total = amount(order.totalAmount);
		const ledgerRefund = amount(credits.reduce((sum, credit) => sum + amount(credit.amount), 0));
		if (ledgerRefund > total + 0.01) {
			unsafe.push({
				orderId: order.id,
				orderNumber: order.orderNumber,
				reason: `Refund ledger ₦${ledgerRefund} exceeds order ₦${total}`
			});
			continue;
		}
		const targetRefund = Math.min(total, ledgerRefund);
		const full = total > 0 && targetRefund >= total - 0.01;
		const itemTargets = allocateItemRefunds(order, credits, targetRefund);
		const itemRefundTotal = amount(
			[...itemTargets.values()].reduce((sum, itemRefund) => sum + amount(itemRefund), 0)
		);
		if (Math.abs(itemRefundTotal - targetRefund) > 0.01) {
			unsafe.push({
				orderId: order.id,
				orderNumber: order.orderNumber,
				reason: `Could only attribute ₦${itemRefundTotal} of ₦${targetRefund} across order items`
			});
			continue;
		}
		const changed =
			Math.abs(amount(order.refundedAmount) - targetRefund) > 0.01 ||
			(full &&
				(order.status !== REFUNDED ||
					order.paymentStatus !== REFUNDED ||
					order.deliveryStatus !== REFUNDED)) ||
			order.orderItems.some(
				(item) => Math.abs(amount(item.refundedAmount) - amount(itemTargets.get(item.id))) > 0.01
			);
		if (!full && hasRefundMarker(order)) {
			unsafe.push({
				orderId: order.id,
				orderNumber: order.orderNumber,
				reason:
					'Partially refunded order carries a terminal refund marker; the correct restored live status requires owner review.'
			});
			continue;
		}
		if (changed) allPlans.push({ order, credits, targetRefund, full, itemTargets });
	}

	const plans =
		requestedSelection.size === 0
			? allPlans
			: allPlans.filter(
					(plan) =>
						requestedSelection.has(plan.order.id) || requestedSelection.has(plan.order.orderNumber)
				);
	const matchedSelection = new Set(
		plans.flatMap((plan) => [plan.order.id, plan.order.orderNumber])
	);
	const unmatchedSelection = [...requestedSelection].filter(
		(entry) => !matchedSelection.has(entry)
	);
	for (const entry of unmatchedSelection) {
		unsafe.push({
			orderId: null,
			orderNumber: null,
			reason: `Selected order '${entry}' has no repair plan`
		});
	}

	const selectedOrderIds = new Set(plans.map((plan) => plan.order.id));
	const selectedBuyerIds = [...new Set(plans.map((plan) => plan.order.userId).filter(Boolean))];
	const selectedAffiliateIds = [
		...new Set(plans.map((plan) => plan.order.affiliateUserId).filter(Boolean))
	];
	const [wallets, affiliatePrograms, affiliateLedger, milestoneGifts, milestonePromos] =
		await Promise.all([
			selectedBuyerIds.length
				? prisma.wallet.findMany({
						where: { userId: { in: selectedBuyerIds } },
						select: { id: true, userId: true, balance: true, currency: true }
					})
				: [],
			selectedAffiliateIds.length
				? prisma.affiliateProgram.findMany({
						where: { userId: { in: selectedAffiliateIds } },
						select: {
							id: true,
							userId: true,
							affiliateCode: true,
							isSuperAffiliate: true,
							totalSales: true
						}
					})
				: [],
			selectedAffiliateIds.length
				? prisma.walletTransaction.findMany({
						where: {
							userId: { in: selectedAffiliateIds },
							type: { in: ['affiliate_credit', 'affiliate_credit_adjustment'] }
						},
						select: {
							id: true,
							walletId: true,
							userId: true,
							type: true,
							amount: true,
							balanceBefore: true,
							balanceAfter: true,
							status: true,
							reference: true,
							metadata: true
						}
					})
				: [],
			selectedBuyerIds.length
				? prisma.walletTransaction.findMany({
						where: {
							userId: { in: selectedBuyerIds },
							type: 'store_credit_gift',
							reference: { startsWith: 'spend:gift:70k:' }
						},
						select: { id: true, userId: true, amount: true, status: true, reference: true }
					})
				: [],
			selectedBuyerIds.length
				? prisma.promotionCode.findMany({
						where: {
							issuedToUserId: { in: selectedBuyerIds },
							code: { startsWith: 'SPEND8K-' }
						},
						select: {
							id: true,
							issuedToUserId: true,
							code: true,
							isActive: true,
							usageCount: true,
							endsAt: true,
							_count: { select: { redemptions: true } }
						}
					})
				: []
		]);

	const targetRefundByOrder = new Map(plans.map((plan) => [plan.order.id, plan.targetRefund]));
	const planByOrderId = new Map(plans.map((plan) => [plan.order.id, plan]));
	const programReports = affiliatePrograms.map((program) => {
		if (program.isSuperAffiliate) {
			const selectedLinkedOrders = plans.filter(
				(plan) =>
					plan.order.affiliateUserId === program.userId &&
					plan.order.affiliateCode === program.affiliateCode
			);
			for (const plan of selectedLinkedOrders) {
				unsafe.push({
					orderId: plan.order.id,
					orderNumber: plan.order.orderNumber,
					reason:
						'Super-affiliate total sales records qualification-time spend, not regular per-order sales; requires explicit reward review.'
				});
			}
			return {
				id: program.id,
				userId: program.userId,
				affiliateCode: program.affiliateCode,
				isSuperAffiliate: true,
				accountingBasis: 'qualification_time_spend',
				totalSalesBefore: amount(program.totalSales),
				totalSalesAfter: amount(program.totalSales)
			};
		}
		const targetSales = amount(
			orders.reduce((sum, order) => {
				if (
					order.affiliateUserId !== program.userId ||
					order.affiliateCode !== program.affiliateCode
				)
					return sum;
				const targetRefund = targetRefundByOrder.get(order.id) ?? amount(order.refundedAmount);
				const forceFullRefund =
					targetRefundByOrder.has(order.id) && targetRefund >= amount(order.totalAmount) - 0.01;
				return isRevenueOrder(order, targetRefund, forceFullRefund)
					? sum + Math.max(0, amount(order.totalAmount) - targetRefund)
					: sum;
			}, 0)
		);
		return {
			id: program.id,
			userId: program.userId,
			affiliateCode: program.affiliateCode,
			isSuperAffiliate: program.isSuperAffiliate,
			accountingBasis: 'net_retained_referred_orders',
			totalSalesBefore: amount(program.totalSales),
			totalSalesAfter: targetSales
		};
	});

	const linkedAffiliateLedger = affiliateLedger.filter((row) => {
		const orderId = linkedOrderId(row);
		return orderId ? selectedOrderIds.has(orderId) : false;
	});
	for (const row of linkedAffiliateLedger) {
		const orderId = linkedOrderId(row);
		const plan = orderId ? planByOrderId.get(orderId) : null;
		unsafe.push({
			orderId: orderId || null,
			orderNumber: plan?.order.orderNumber || null,
			reason: `Linked affiliate earning ${row.id} (${row.status}, ₦${amount(row.amount)}) requires explicit before/after reward review before repair.`
		});
	}

	const promotionDeactivations = [];
	const buyerSpendReports = selectedBuyerIds.map((userId) => {
		let before = 0;
		let after = 0;
		for (const order of orders) {
			if (order.userId !== userId) continue;
			if (isRevenueOrder(order)) {
				before += Math.max(0, amount(order.totalAmount) - amount(order.refundedAmount));
			}
			const targetRefund = targetRefundByOrder.get(order.id) ?? amount(order.refundedAmount);
			const forceFullRefund =
				targetRefundByOrder.has(order.id) && targetRefund >= amount(order.totalAmount) - 0.01;
			if (isRevenueOrder(order, targetRefund, forceFullRefund)) {
				after += Math.max(0, amount(order.totalAmount) - targetRefund);
			}
		}
		const gifts = milestoneGifts.filter((gift) => gift.userId === userId);
		const promos = milestonePromos.filter((promo) => promo.issuedToUserId === userId);
		if (
			before >= GIFT_MILESTONE_SPEND &&
			after < GIFT_MILESTONE_SPEND &&
			gifts.some((gift) => gift.status === 'available')
		) {
			unsafe.push({
				orderId: null,
				orderNumber: null,
				reason: `Buyer ${userId} falls below the ₦70,000 milestone with an available gift; review whether it remains unspent.`
			});
		}
		if (before >= PROMO_MILESTONE_SPEND && after < PROMO_MILESTONE_SPEND) {
			for (const promo of promos.filter((row) => row.isActive && row.usageCount === 0)) {
				if (promo._count.redemptions > 0) {
					unsafe.push({
						orderId: null,
						orderNumber: null,
						reason: `Promo ${promo.id} reports zero usage but has ${promo._count.redemptions} redemption row(s).`
					});
					continue;
				}
				promotionDeactivations.push({
					id: promo.id,
					userId,
					code: promo.code,
					isActiveBefore: true,
					isActiveAfter: false,
					usageCount: promo.usageCount,
					redemptionCount: promo._count.redemptions,
					reason: 'Corrected net spend falls below ₦8,000'
				});
			}
		}
		return {
			userId,
			netSpendBefore: amount(before),
			netSpendAfter: amount(after),
			milestoneGifts: gifts.map((gift) => ({ ...gift, amount: amount(gift.amount) })),
			milestonePromos: promos.map(({ _count, ...promo }) => ({
				...promo,
				redemptionCount: _count.redemptions
			}))
		};
	});

	const walletByUserId = new Map(wallets.map((wallet) => [wallet.userId, wallet]));
	const orderReports = plans.map((plan) => {
		const wallet = plan.order.userId ? walletByUserId.get(plan.order.userId) : null;
		return {
			orderId: plan.order.id,
			orderNumber: plan.order.orderNumber,
			buyerUserId: plan.order.userId,
			affiliateUserId: plan.order.affiliateUserId,
			before: {
				status: plan.order.status,
				paymentStatus: plan.order.paymentStatus,
				deliveryStatus: plan.order.deliveryStatus,
				totalAmount: amount(plan.order.totalAmount),
				refundedAmount: amount(plan.order.refundedAmount),
				netSales: Math.max(0, amount(plan.order.totalAmount) - amount(plan.order.refundedAmount)),
				externalCashCollected: Math.max(
					0,
					amount(plan.order.totalAmount) - amount(plan.order.storeCreditApplied)
				)
			},
			after: {
				status: plan.full ? REFUNDED : plan.order.status,
				paymentStatus: plan.full ? REFUNDED : plan.order.paymentStatus,
				deliveryStatus: plan.full ? REFUNDED : plan.order.deliveryStatus,
				totalAmount: amount(plan.order.totalAmount),
				refundedAmount: plan.targetRefund,
				netSales: Math.max(0, amount(plan.order.totalAmount) - plan.targetRefund),
				externalCashCollected: Math.max(
					0,
					amount(plan.order.totalAmount) - amount(plan.order.storeCreditApplied)
				)
			},
			buyerWallet: wallet
				? {
						id: wallet.id,
						currency: wallet.currency,
						balanceBefore: amount(wallet.balance),
						balanceAfter: amount(wallet.balance),
						change: 0
					}
				: null,
			refundCredits: plan.credits.map((credit) => ({
				id: credit.id,
				walletId: credit.walletId,
				userId: credit.userId,
				amount: amount(credit.amount),
				status: credit.status,
				reference: credit.reference,
				balanceBefore: amount(credit.balanceBefore),
				balanceAfter: amount(credit.balanceAfter),
				createdAt: credit.createdAt.toISOString(),
				metadata: metadataRecord(credit.metadata)
			})),
			itemAllocations: plan.order.orderItems.map((item) => ({
				itemId: item.id,
				productName: item.productName,
				quantity: item.quantity,
				unitPrice: amount(item.unitPrice),
				totalPrice: amount(item.totalPrice),
				refundedAmountBefore: amount(item.refundedAmount),
				refundedAmountAfter: amount(plan.itemTargets.get(item.id)),
				accounts: item.accounts,
				phoneRental: item.phoneRental
			})),
			affiliateEarnings: linkedAffiliateLedger
				.filter((row) => linkedOrderId(row) === plan.order.id)
				.map((row) => ({
					...row,
					amount: amount(row.amount),
					balanceBefore: amount(row.balanceBefore),
					balanceAfter: amount(row.balanceAfter)
				}))
		};
	});

	const relevantUnsafe = unsafe.filter(
		(issue) =>
			!issue.orderId ||
			requestedSelection.size === 0 ||
			selectedOrderIds.has(issue.orderId) ||
			requestedSelection.has(issue.orderNumber)
	);
	const approvalReport = {
		selection: plans.map((plan) => plan.order.id),
		ordersChecked: orders.length,
		ordersNeedingRepair: plans.length,
		orders: orderReports,
		affiliatePrograms: programReports,
		buyerSpend: buyerSpendReports,
		promotionDeactivations,
		unsafe: relevantUnsafe
	};
	const fingerprint = planFingerprint(approvalReport);
	const output = {
		mode: APPLY ? 'apply' : 'dry-run',
		generatedAt: new Date().toISOString(),
		fingerprint,
		...approvalReport
	};
	console.log(JSON.stringify(output, null, 2));

	if (APPLY && suppliedFingerprint !== fingerprint) {
		console.error(
			`Refusing to write: reviewed fingerprint ${suppliedFingerprint} does not match current plan ${fingerprint}. Run and review a fresh dry run.`
		);
		process.exitCode = 1;
	} else if (APPLY && relevantUnsafe.length > 0) {
		console.error(
			'Refusing to write because the reviewed selection contains unsafe or ambiguous records.'
		);
		process.exitCode = 1;
	} else if (APPLY) {
		for (const plan of plans) {
			await prisma.$transaction(
				async (tx) => {
					await tx.$queryRaw`SELECT id FROM orders WHERE id = ${plan.order.id}::uuid FOR UPDATE`;
					await tx.order.update({
						where: { id: plan.order.id },
						data: {
							refundedAmount: plan.targetRefund,
							...(plan.full
								? {
										status: REFUNDED,
										paymentStatus: REFUNDED,
										deliveryStatus: REFUNDED
									}
								: {})
						}
					});
					for (const item of plan.order.orderItems) {
						await tx.orderItem.update({
							where: { id: item.id },
							data: { refundedAmount: amount(plan.itemTargets.get(item.id)) }
						});
						if (
							plan.full &&
							item.phoneRental &&
							!['received', REFUNDED].includes(item.phoneRental.status)
						) {
							await tx.phoneRental.update({
								where: { id: item.phoneRental.id },
								data: {
									status: REFUNDED,
									refundedAt: new Date(),
									rentLeaseToken: null,
									rentLeaseExpiresAt: null,
									operationToken: null,
									operationLeaseExpiresAt: null,
									nextRentAttemptAt: null
								}
							});
						}
					}
					await tx.orderEvent.createMany({
						data: plan.credits.map((credit) => ({
							orderId: plan.order.id,
							type: plan.full ? 'order_refunded' : 'item_refunded',
							source: 'financial_reconciliation',
							amount: amount(credit.amount),
							description: 'Historical store-credit refund reconciled from wallet ledger',
							idempotencyKey: `backfill:refund:${credit.id}`,
							metadata: { walletTransactionId: credit.id, legacyBackfill: true },
							occurredAt: credit.createdAt
						})),
						skipDuplicates: true
					});
				},
				{ maxWait: 10_000, timeout: 20_000 }
			);
		}

		for (const program of programReports) {
			if (Math.abs(program.totalSalesBefore - program.totalSalesAfter) <= 0.01) continue;
			await prisma.affiliateProgram.update({
				where: { id: program.id },
				data: { totalSales: program.totalSalesAfter }
			});
		}

		for (const promo of promotionDeactivations) {
			const deactivated = await prisma.promotionCode.updateMany({
				where: {
					id: promo.id,
					isActive: true,
					usageCount: 0,
					redemptions: { none: {} }
				},
				data: { isActive: false }
			});
			if (deactivated.count !== 1) {
				throw new Error(
					`Promo ${promo.id} changed after dry-run; refusing an ambiguous milestone update.`
				);
			}
			await prisma.notification.create({
				data: {
					userId: promo.userId,
					type: 'promotion',
					title: 'Promo no longer available',
					message:
						'A refund brought you below the ₦8,000 threshold, so your unused ₦1,000 promo was withdrawn.'
				}
			});
		}

		const repaired = await prisma.order.findMany({
			where: { id: { in: plans.map((plan) => plan.order.id) } },
			select: {
				id: true,
				status: true,
				paymentStatus: true,
				deliveryStatus: true,
				refundedAmount: true,
				orderItems: { select: { id: true, refundedAmount: true } }
			}
		});
		const repairedById = new Map(repaired.map((order) => [order.id, order]));
		const verificationFailures = [];
		for (const plan of plans) {
			const actual = repairedById.get(plan.order.id);
			if (!actual || Math.abs(amount(actual.refundedAmount) - plan.targetRefund) > 0.01) {
				verificationFailures.push(`${plan.order.orderNumber}: order refund amount mismatch`);
				continue;
			}
			if (
				plan.full &&
				[actual.status, actual.paymentStatus, actual.deliveryStatus].some(
					(value) => value !== REFUNDED
				)
			) {
				verificationFailures.push(`${plan.order.orderNumber}: terminal refund markers mismatch`);
			}
			for (const item of actual.orderItems) {
				if (Math.abs(amount(item.refundedAmount) - amount(plan.itemTargets.get(item.id))) > 0.01) {
					verificationFailures.push(
						`${plan.order.orderNumber}: item ${item.id} refund amount mismatch`
					);
				}
			}
		}
		if (promotionDeactivations.length > 0) {
			const remainingActivePromos = await prisma.promotionCode.count({
				where: {
					id: { in: promotionDeactivations.map((promo) => promo.id) },
					isActive: true
				}
			});
			if (remainingActivePromos > 0) {
				verificationFailures.push(
					`${remainingActivePromos} approved spend promo(s) remain active after repair`
				);
			}
		}
		if (verificationFailures.length > 0) {
			console.error('Post-apply verification failed:', verificationFailures);
			process.exitCode = 1;
		} else {
			console.log(`Applied and verified ${plans.length} explicitly approved order repairs.`);
		}
	} else {
		console.log('\nNo writes made. Review the JSON above.');
		if (plans.length > 0 && relevantUnsafe.length === 0) {
			console.log(
				`Approved apply shape: --orders=${plans.map((plan) => plan.order.id).join(',')} --fingerprint=${fingerprint}`
			);
		}
	}
} catch (error) {
	console.error(
		'Financial reconciliation could not run. Ensure the additive migration has been deployed first.',
		error
	);
	process.exitCode = 1;
} finally {
	await prisma.$disconnect();
}
