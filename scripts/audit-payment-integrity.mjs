import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRMED_ORDER = new Set(['paid', 'processing', 'completed']);
const CONFIRMED_PAYMENT = new Set(['paid', 'success', 'overpaid']);
const REFUNDED = 'refunded';
const ACTIVE = 'available';
const CREDIT_TYPES = new Set(['affiliate_credit', 'store_credit_gift', 'store_credit_refund']);
const EARNED_CREDIT_TYPES = new Set(['affiliate_credit', 'store_credit_gift']);
const REDEMPTION_TYPES = new Set([
	'store_credit_redemption_earned',
	'store_credit_redemption_refund'
]);

function amount(value) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function normalize(value) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

function metadata(value) {
	return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function confirmed(order) {
	return (
		CONFIRMED_ORDER.has(normalize(order.status)) &&
		CONFIRMED_PAYMENT.has(normalize(order.paymentStatus))
	);
}

function hasRefundMarker(order) {
	return [order.status, order.paymentStatus, order.deliveryStatus].some(
		(value) => normalize(value) === REFUNDED
	);
}

function redemptionOrderId(row) {
	const meta = metadata(row.metadata);
	if (typeof meta.orderId === 'string') return meta.orderId;
	const reference = String(row.reference || '');
	const separator = reference.indexOf(':');
	return separator > 0 ? reference.slice(0, separator) : null;
}

function affiliateOrderId(row) {
	const meta = metadata(row.metadata);
	if (typeof meta.orderId === 'string') return meta.orderId;
	if (typeof meta.activatedByOrderId === 'string') return meta.activatedByOrderId;
	const match = String(row.reference || '').match(/^affiliate:(?:credit|adjustment):order:(.+)$/);
	return match?.[1] || null;
}

try {
	const [orders, wallets, walletTransactions, affiliatePrograms] = await Promise.all([
		prisma.order.findMany({
			select: {
				id: true,
				orderNumber: true,
				userId: true,
				affiliateUserId: true,
				affiliateCode: true,
				subtotal: true,
				taxAmount: true,
				discountAmount: true,
				storeCreditApplied: true,
				refundedAmount: true,
				totalAmount: true,
				paymentMethod: true,
				paymentChannel: true,
				paymentReference: true,
				paymentStatus: true,
				deliveryStatus: true,
				status: true,
				orderType: true,
				orderItems: {
					select: {
						id: true,
						refundedAmount: true,
						allocationStatus: true,
						accounts: { select: { id: true, status: true } },
						phoneRental: {
							select: { id: true, status: true, receivedAt: true, refundedAt: true }
						}
					}
				}
			}
		}),
		prisma.wallet.findMany({ select: { id: true, userId: true, balance: true } }),
		prisma.walletTransaction.findMany({
			select: {
				id: true,
				walletId: true,
				userId: true,
				type: true,
				amount: true,
				status: true,
				reference: true,
				metadata: true,
				balanceBefore: true,
				balanceAfter: true,
				createdAt: true
			}
		}),
		prisma.affiliateProgram.findMany({
			select: {
				id: true,
				userId: true,
				affiliateCode: true,
				isSuperAffiliate: true,
				totalSales: true
			}
		})
	]);

	const issues = [];
	const add = (severity, key, details) => issues.push({ severity, key, ...details });
	const orderById = new Map(orders.map((order) => [order.id, order]));
	const orderIdByAccountId = new Map(
		orders.flatMap((order) =>
			order.orderItems.flatMap((item) => item.accounts.map((account) => [account.id, order.id]))
		)
	);

	const refundCreditsByOrder = new Map();
	const redemptionsByOrder = new Map();
	const affiliateRowsByOrder = new Map();
	for (const row of walletTransactions) {
		if (row.type === 'store_credit_refund' && normalize(row.status) === ACTIVE) {
			const meta = metadata(row.metadata);
			const reference = String(row.reference || '');
			const orderId =
				(typeof meta.orderId === 'string' && orderById.has(meta.orderId) ? meta.orderId : null) ||
				(orderById.has(reference) ? reference : null) ||
				orderIdByAccountId.get(reference) ||
				null;
			if (orderId) {
				const bucket = refundCreditsByOrder.get(orderId) || [];
				bucket.push(row);
				refundCreditsByOrder.set(orderId, bucket);
			}
		}
		if (REDEMPTION_TYPES.has(row.type)) {
			const orderId = redemptionOrderId(row);
			if (orderId) {
				const bucket = redemptionsByOrder.get(orderId) || [];
				bucket.push(row);
				redemptionsByOrder.set(orderId, bucket);
			}
		}
		if (row.type === 'affiliate_credit' || row.type === 'affiliate_credit_adjustment') {
			const orderId = affiliateOrderId(row);
			if (orderId) {
				const bucket = affiliateRowsByOrder.get(orderId) || [];
				bucket.push(row);
				affiliateRowsByOrder.set(orderId, bucket);
			}
		}
	}

	const refs = new Map();
	for (const order of orders) {
		if (!order.paymentReference) continue;
		const bucket = refs.get(order.paymentReference) || [];
		bucket.push(order);
		refs.set(order.paymentReference, bucket);
	}
	for (const [paymentReference, matches] of refs) {
		if (matches.length > 1) {
			add('blocker', 'duplicate_payment_reference', {
				paymentReference,
				orders: matches.map((order) => ({ id: order.id, orderNumber: order.orderNumber }))
			});
		}
	}

	for (const order of orders) {
		const total = amount(order.totalAmount);
		const storedRefund = amount(order.refundedAmount);
		const credits = refundCreditsByOrder.get(order.id) || [];
		const ledgerRefund = amount(credits.reduce((sum, row) => sum + amount(row.amount), 0));
		const itemRefund = amount(
			order.orderItems.reduce((sum, item) => sum + amount(item.refundedAmount), 0)
		);
		const redemptions = redemptionsByOrder.get(order.id) || [];
		const activeRedemptions = redemptions.filter((row) => normalize(row.status) === ACTIVE);
		const reversedRedemptions = redemptions.filter((row) => normalize(row.status) === 'reversed');
		const recordedRedemption = amount(
			[...activeRedemptions, ...reversedRedemptions].reduce(
				(sum, row) => sum + amount(row.amount),
				0
			)
		);
		const storeCreditApplied = amount(order.storeCreditApplied);

		if (ledgerRefund > total + 0.01) {
			add('blocker', 'refund_exceeds_order', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				total,
				ledgerRefund,
				refundTransactions: credits.map((row) => row.id)
			});
		}
		if (Math.abs(storedRefund - ledgerRefund) > 0.01) {
			add('repair', 'stored_refund_vs_ledger', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				storedRefund,
				ledgerRefund
			});
		}
		if (Math.abs(storedRefund - itemRefund) > 0.01) {
			add('repair', 'order_refund_vs_items', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				storedRefund,
				itemRefund
			});
		}
		if (storeCreditApplied > total + 0.01) {
			add('blocker', 'store_credit_exceeds_order', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				total,
				storeCreditApplied
			});
		}
		if (Math.abs(recordedRedemption - storeCreditApplied) > 0.01) {
			add(storeCreditApplied > 0 ? 'blocker' : 'review', 'store_credit_redemption_mismatch', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				storeCreditApplied,
				recordedRedemption,
				redemptionTransactions: redemptions.map((row) => ({
					id: row.id,
					status: row.status,
					amount: amount(row.amount)
				}))
			});
		}
		if (confirmed(order) && reversedRedemptions.length > 0) {
			add('blocker', 'confirmed_order_has_restored_credit', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				storeCreditApplied,
				reversedAmount: amount(
					reversedRedemptions.reduce((sum, row) => sum + amount(row.amount), 0)
				)
			});
		}
		if (
			['failed', 'cancelled', 'canceled'].includes(normalize(order.status)) &&
			activeRedemptions.length > 0
		) {
			add('blocker', 'terminal_unpaid_order_holds_credit', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				activeAmount: amount(activeRedemptions.reduce((sum, row) => sum + amount(row.amount), 0))
			});
		}

		const allowedManualRelease = normalize(order.paymentChannel) === 'manual_release';
		if (
			confirmed(order) &&
			normalize(order.paymentMethod) === 'monnify' &&
			!order.paymentReference &&
			!allowedManualRelease
		) {
			add('blocker', 'confirmed_monnify_order_missing_reference', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				total
			});
		}
		if (
			confirmed(order) &&
			normalize(order.paymentMethod) === 'store_credit' &&
			Math.abs(storeCreditApplied - total) > 0.01
		) {
			add('blocker', 'store_credit_order_not_fully_funded', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				total,
				storeCreditApplied
			});
		}

		const deliveredAsset =
			normalize(order.deliveryStatus) === 'delivered' ||
			order.orderItems.some(
				(item) =>
					item.accounts.some((account) =>
						['allocated', 'delivered'].includes(normalize(account.status))
					) || normalize(item.phoneRental?.status) === 'received'
			);
		if (deliveredAsset && !confirmed(order) && !hasRefundMarker(order) && !allowedManualRelease) {
			add('blocker', 'fulfilled_without_confirmed_payment', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				status: order.status,
				paymentStatus: order.paymentStatus,
				deliveryStatus: order.deliveryStatus
			});
		}

		const affiliateRows = affiliateRowsByOrder.get(order.id) || [];
		const affiliateCredits = affiliateRows
			.filter((row) => row.type === 'affiliate_credit' && normalize(row.status) === ACTIVE)
			.reduce((sum, row) => sum + amount(row.amount), 0);
		const affiliateAdjustments = affiliateRows
			.filter(
				(row) => row.type === 'affiliate_credit_adjustment' && normalize(row.status) === ACTIVE
			)
			.reduce((sum, row) => sum + amount(row.amount), 0);
		if (ledgerRefund >= total - 0.01 && affiliateCredits - affiliateAdjustments > 0.01) {
			add('blocker', 'refunded_order_retains_affiliate_reward', {
				orderId: order.id,
				orderNumber: order.orderNumber,
				affiliateCredits,
				affiliateAdjustments
			});
		}
	}

	const txByUser = new Map();
	for (const row of walletTransactions) {
		const bucket = txByUser.get(row.userId) || [];
		bucket.push(row);
		txByUser.set(row.userId, bucket);
	}
	for (const wallet of wallets) {
		const rows = txByUser.get(wallet.userId) || [];
		let earnedCredits = 0;
		let refundCredits = 0;
		let earnedDebits = 0;
		let refundDebits = 0;
		let payouts = 0;
		for (const row of rows) {
			const value = Math.max(0, amount(row.amount));
			const status = normalize(row.status);
			if (EARNED_CREDIT_TYPES.has(row.type) && status === ACTIVE) earnedCredits += value;
			else if (row.type === 'store_credit_refund' && status === ACTIVE) refundCredits += value;
			else if (row.type === 'store_credit_redemption_earned' && status === ACTIVE)
				earnedDebits += value;
			else if (row.type === 'store_credit_redemption_refund' && status === ACTIVE)
				refundDebits += value;
			else if (row.type === 'affiliate_credit_adjustment' && status === ACTIVE)
				earnedDebits += value;
			else if (
				row.type === 'affiliate_payout' &&
				['requested', 'under_review', 'paid'].includes(status)
			)
				payouts += value;
		}
		const rawEarned = amount(earnedCredits - earnedDebits - payouts);
		const rawRefund = amount(refundCredits - refundDebits);
		const ledgerAvailable = amount(Math.max(0, rawEarned) + Math.max(0, rawRefund));
		if (rawEarned < -0.01 || rawRefund < -0.01) {
			const reversedManualTestCredit = amount(
				rows
					.filter(
						(row) =>
							row.type === 'store_credit_refund' &&
							normalize(row.status) === 'reversed' &&
							String(row.reference || '').startsWith('manual:smoketest:')
					)
					.reduce((sum, row) => sum + amount(row.amount), 0)
			);
			const explainedManualTestArtifact =
				rawEarned >= -0.01 && rawRefund < -0.01 && reversedManualTestCredit + rawRefund >= -0.01;
			add(
				explainedManualTestArtifact ? 'review' : 'blocker',
				explainedManualTestArtifact
					? 'manual_test_credit_cleanup_mismatch'
					: 'wallet_bucket_overspent',
				{
					walletId: wallet.id,
					userId: wallet.userId,
					earnedBalance: rawEarned,
					refundBalance: rawRefund,
					reversedManualTestCredit
				}
			);
		}
		if (Math.abs(amount(wallet.balance) - ledgerAvailable) > 0.01) {
			add('blocker', 'wallet_cache_vs_ledger', {
				walletId: wallet.id,
				userId: wallet.userId,
				walletBalance: amount(wallet.balance),
				ledgerAvailable
			});
		}
	}

	for (const program of affiliatePrograms) {
		const truthfulSales = program.isSuperAffiliate
			? amount(
					walletTransactions
						.filter((row) => {
							const meta = metadata(row.metadata);
							return (
								row.userId === program.userId &&
								row.type === 'affiliate_credit' &&
								meta.kind === 'super_activation' &&
								meta.affiliateCode === program.affiliateCode
							);
						})
						.reduce((sum, row) => sum + amount(metadata(row.metadata).cumulativeSpend), 0)
				)
			: amount(
					orders.reduce((sum, order) => {
						if (
							order.affiliateUserId !== program.userId ||
							order.affiliateCode !== program.affiliateCode ||
							!confirmed(order) ||
							hasRefundMarker(order)
						)
							return sum;
						const ledgerRefund = amount(
							(refundCreditsByOrder.get(order.id) || []).reduce(
								(total, row) => total + amount(row.amount),
								0
							)
						);
						return sum + Math.max(0, amount(order.totalAmount) - ledgerRefund);
					}, 0)
				);
		if (Math.abs(amount(program.totalSales) - truthfulSales) > 0.01) {
			add('repair', 'affiliate_sales_mismatch', {
				programId: program.id,
				userId: program.userId,
				affiliateCode: program.affiliateCode,
				isSuperAffiliate: program.isSuperAffiliate,
				storedSales: amount(program.totalSales),
				truthfulSales
			});
		}
	}

	const bySeverity = Object.fromEntries(
		['blocker', 'repair', 'review'].map((severity) => [
			severity,
			issues.filter((issue) => issue.severity === severity).length
		])
	);
	const byKey = {};
	for (const issue of issues) byKey[issue.key] = (byKey[issue.key] || 0) + 1;
	const unknownTransactionTypes = [
		...new Set(
			walletTransactions
				.map((row) => row.type)
				.filter(
					(type) =>
						!CREDIT_TYPES.has(type) &&
						!REDEMPTION_TYPES.has(type) &&
						type !== 'affiliate_credit_adjustment' &&
						type !== 'affiliate_payout'
				)
		)
	].sort();

	console.log(
		JSON.stringify(
			{
				mode: 'read-only',
				generatedAt: new Date().toISOString(),
				counts: {
					orders: orders.length,
					wallets: wallets.length,
					walletTransactions: walletTransactions.length,
					affiliatePrograms: affiliatePrograms.length
				},
				summary: { issueCount: issues.length, bySeverity, byKey },
				unknownTransactionTypes,
				issues
			},
			null,
			2
		)
	);
} catch (error) {
	console.error('Payment integrity audit could not run:', error);
	process.exitCode = 1;
} finally {
	await prisma.$disconnect();
}
