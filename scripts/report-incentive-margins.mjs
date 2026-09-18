import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

function reportingDatabaseUrl(value) {
	if (!value?.trim()) return undefined;
	try {
		const url = new URL(value.trim());
		// Reporting is deliberately low-impact. A single client connection also avoids
		// competing with the live site's pool during a busy period.
		url.searchParams.set('connection_limit', '1');
		url.searchParams.set('pool_timeout', '30');
		return url.toString();
	} catch {
		return value;
	}
}

const datasourceUrl = reportingDatabaseUrl(process.env.DATABASE_URL);
const prisma = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);
const WINDOWS = [30, 60];
const REWARD_RATES = [1, 2, 3, 5];
const MONNIFY_COLLECTION_FEE_RATE = 0.015;
const MONNIFY_COLLECTION_FEE_CAP_NGN = 2000;
const NIGERIA_VAT_RATE = 0.075;
const FAILED_PHONE_STATES = new Set(['refunded', 'expired', 'cancelled', 'failed']);
const RETAINED_ORDER_STATES = new Set(['paid', 'processing', 'completed']);
const RETAINED_PAYMENT_STATES = new Set(['paid', 'success', 'overpaid']);
const TERMINAL_NON_REVENUE_STATES = new Set([
	'refunded',
	'cancelled',
	'canceled',
	'failed',
	'expired'
]);

function amount(value) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalized(value) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

function roundMoney(value) {
	return Math.round(value * 100) / 100;
}

function orderDate(order) {
	return order.paidAt || order.createdAt;
}

function isRetainedRevenueOrder(order) {
	if (normalized(order.paymentChannel) === 'manual_release') return false;
	if (
		[order.status, order.paymentStatus, order.deliveryStatus].some((value) =>
			TERMINAL_NON_REVENUE_STATES.has(normalized(value))
		)
	) {
		return false;
	}
	return (
		RETAINED_ORDER_STATES.has(normalized(order.status)) ||
		RETAINED_PAYMENT_STATES.has(normalized(order.paymentStatus))
	);
}

function itemNetSale(item) {
	return Math.max(0, amount(item.totalPrice) - amount(item.refundedAmount));
}

function itemRetainedSale(item, order) {
	const orderNetSale = Math.max(0, amount(order.totalAmount) - amount(order.refundedAmount));
	if (orderNetSale <= 0) return 0;

	const itemNetTotal = order.orderItems.map(itemNetSale).reduce((sum, value) => sum + value, 0);
	if (itemNetTotal <= 0) return 0;

	return roundMoney(orderNetSale * (itemNetSale(item) / itemNetTotal));
}

function itemCashBasis(item, order) {
	const orderNetSale = Math.max(0, amount(order.totalAmount) - amount(order.refundedAmount));
	if (orderNetSale <= 0) return 0;

	const netItems = order.orderItems.map(itemNetSale);
	const itemNetTotal = netItems.reduce((sum, value) => sum + value, 0);
	if (itemNetTotal <= 0) return 0;

	const externalCashRetained = Math.max(0, orderNetSale - amount(order.storeCreditApplied));
	return roundMoney(externalCashRetained * (itemNetSale(item) / itemNetTotal));
}

function itemEstimatedGatewayFee(item, order) {
	if (!order.paidAt) return 0;
	if (['manual_release', 'store_credit'].includes(normalized(order.paymentChannel))) return 0;
	const externalCashCharged = Math.max(
		0,
		amount(order.totalAmount) - amount(order.storeCreditApplied)
	);
	if (externalCashCharged <= 0) return 0;

	const itemGrossTotal = order.orderItems
		.map((orderItem) => amount(orderItem.totalPrice))
		.reduce((sum, value) => sum + value, 0);
	if (itemGrossTotal <= 0) return 0;

	const feeBeforeVat = Math.min(
		externalCashCharged * MONNIFY_COLLECTION_FEE_RATE,
		MONNIFY_COLLECTION_FEE_CAP_NGN
	);
	const orderFee = feeBeforeVat * (1 + NIGERIA_VAT_RATE);
	return roundMoney(orderFee * (amount(item.totalPrice) / itemGrossTotal));
}

function summarizeRewardScenarios(eligibleCashNgn, contributionNgn, netSalesNgn) {
	return REWARD_RATES.map((ratePct) => {
		const rewardCostNgn = roundMoney((eligibleCashNgn * ratePct) / 100);
		const contributionAfterRewardNgn =
			contributionNgn == null ? null : roundMoney(contributionNgn - rewardCostNgn);
		return {
			ratePct,
			rewardCostNgn,
			contributionAfterRewardNgn,
			contributionAfterRewardPct:
				contributionAfterRewardNgn == null || netSalesNgn <= 0
					? null
					: roundMoney((contributionAfterRewardNgn / netSalesNgn) * 100)
		};
	});
}

function summarizeNumbers(rows, attemptsByItem, usdNgnRate) {
	let numbersNetSales = 0;
	let numbersEligibleCash = 0;
	let numbersSupplierCost = 0;
	let numbersGatewayFees = 0;
	let numbersReceived = 0;
	let numbersFailed = 0;
	let numbersInFlight = 0;

	for (const rental of rows) {
		const order = rental.orderItem.order;
		numbersGatewayFees += itemEstimatedGatewayFee(rental.orderItem, order);
		const attemptCostCents = attemptsByItem.get(rental.orderItemId);
		const actualCostCents =
			attemptCostCents != null
				? attemptCostCents
				: normalized(rental.status) === 'received'
					? amount(rental.costCents)
					: 0;
		numbersSupplierCost += (actualCostCents / 100) * usdNgnRate;

		if (normalized(rental.status) === 'received') {
			numbersReceived += 1;
			if (isRetainedRevenueOrder(order) && itemNetSale(rental.orderItem) > 0) {
				numbersNetSales += itemRetainedSale(rental.orderItem, order);
				numbersEligibleCash += itemCashBasis(rental.orderItem, order);
			}
		} else if (FAILED_PHONE_STATES.has(normalized(rental.status))) {
			numbersFailed += 1;
		} else {
			numbersInFlight += 1;
		}
	}

	const numbersResolved = numbersReceived + numbersFailed;
	const numbersContribution = numbersNetSales - numbersSupplierCost - numbersGatewayFees;
	return {
		rentalCount: rows.length,
		received: numbersReceived,
		failedOrRefunded: numbersFailed,
		inFlight: numbersInFlight,
		successRatePct:
			numbersResolved > 0 ? roundMoney((numbersReceived / numbersResolved) * 100) : null,
		netSalesNgn: roundMoney(numbersNetSales),
		eligibleExternalCashNgn: roundMoney(numbersEligibleCash),
		recordedSupplierCostNgn: roundMoney(numbersSupplierCost),
		estimatedGatewayFeesNgn: roundMoney(numbersGatewayFees),
		contributionBeforeRewardNgn: roundMoney(numbersContribution),
		contributionMarginPct:
			numbersNetSales > 0 ? roundMoney((numbersContribution / numbersNetSales) * 100) : null,
		rewardScenarios: summarizeRewardScenarios(
			numbersEligibleCash,
			numbersContribution,
			numbersNetSales
		)
	};
}

function summarizeBoosting(rows) {
	let boostingNetSales = 0;
	let boostingCompletedNetSales = 0;
	let boostingOpenNetSales = 0;
	let boostingEligibleCash = 0;
	let boostingGatewayFees = 0;
	let boostingCompleted = 0;
	let boostingOpen = 0;
	for (const item of rows) {
		boostingGatewayFees += itemEstimatedGatewayFee(item, item.order);
		if (normalized(item.boostFulfillmentStatus) === 'completed') boostingCompleted += 1;
		else boostingOpen += 1;

		if (!isRetainedRevenueOrder(item.order)) continue;
		const netSale = itemRetainedSale(item, item.order);
		boostingNetSales += netSale;
		if (normalized(item.boostFulfillmentStatus) === 'completed' && netSale > 0) {
			boostingCompletedNetSales += netSale;
			boostingEligibleCash += itemCashBasis(item, item.order);
		} else {
			boostingOpenNetSales += netSale;
		}
	}
	const boostingRewardScenarios = summarizeRewardScenarios(
		boostingEligibleCash,
		null,
		boostingCompletedNetSales
	).map((scenario) => ({
		...scenario,
		maximumSupplierCostBeforeLossNgn: roundMoney(
			boostingCompletedNetSales - boostingGatewayFees - scenario.rewardCostNgn
		)
	}));

	return {
		itemCount: rows.length,
		completed: boostingCompleted,
		open: boostingOpen,
		netSalesNgn: roundMoney(boostingNetSales),
		completedNetSalesNgn: roundMoney(boostingCompletedNetSales),
		openNetSalesNgn: roundMoney(boostingOpenNetSales),
		eligibleExternalCashNgn: roundMoney(boostingEligibleCash),
		recordedSupplierCostNgn: null,
		estimatedGatewayFeesNgn: roundMoney(boostingGatewayFees),
		contributionBeforeRewardNgn: null,
		rewardScenarios: boostingRewardScenarios,
		note: 'Supplier costs are not stored for manual boosting orders. The maximum supplier-cost figures are break-even ceilings after estimated gateway fees but before other overhead, not profit.'
	};
}

function groupRows(rows, keyForRow) {
	const groups = new Map();
	for (const row of rows) {
		const key = keyForRow(row);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(row);
	}
	return groups;
}

function summarizeWindow({ days, rentals, boostingItems, attemptsByItem, usdNgnRate, now }) {
	const since = new Date(now.getTime() - days * 86_400_000);
	const phoneRows = rentals.filter(
		(rental) =>
			orderDate(rental.orderItem.order) >= since &&
			normalized(rental.orderItem.order.paymentChannel) !== 'manual_release'
	);
	const boostRows = boostingItems.filter((item) => orderDate(item.order) >= since);
	const numbersByService = [
		...groupRows(phoneRows, (row) => `${row.serviceName}||${row.countryName}`)
	]
		.map(([key, rows]) => {
			const [serviceName, countryName] = key.split('||');
			const summary = summarizeNumbers(rows, attemptsByItem, usdNgnRate);
			const fivePercent = summary.rewardScenarios.find((scenario) => scenario.ratePct === 5);
			const { rewardScenarios, ...metrics } = summary;
			void rewardScenarios;
			return {
				serviceName,
				countryName,
				...metrics,
				fivePercentRewardCostNgn: fivePercent?.rewardCostNgn ?? 0,
				contributionAfterFivePercentNgn: fivePercent?.contributionAfterRewardNgn ?? null,
				contributionAfterFivePercentPct: fivePercent?.contributionAfterRewardPct ?? null
			};
		})
		.sort((a, b) => b.netSalesNgn - a.netSalesNgn || b.rentalCount - a.rentalCount);
	const boostingByService = [...groupRows(boostRows, (row) => row.productName)]
		.map(([serviceName, rows]) => {
			const summary = summarizeBoosting(rows);
			const fivePercent = summary.rewardScenarios.find((scenario) => scenario.ratePct === 5);
			const { rewardScenarios, note, ...metrics } = summary;
			void rewardScenarios;
			void note;
			return {
				serviceName,
				...metrics,
				fivePercentRewardCostNgn: fivePercent?.rewardCostNgn ?? 0,
				maximumSupplierCostBeforeLossAtFivePercentNgn:
					fivePercent?.maximumSupplierCostBeforeLossNgn ?? 0
			};
		})
		.sort((a, b) => b.completedNetSalesNgn - a.completedNetSalesNgn || b.itemCount - a.itemCount);

	return {
		days,
		numbers: {
			...summarizeNumbers(phoneRows, attemptsByItem, usdNgnRate),
			byService: numbersByService
		},
		boosting: {
			...summarizeBoosting(boostRows),
			byService: boostingByService
		}
	};
}

try {
	const now = new Date();
	const since = new Date(now.getTime() - Math.max(...WINDOWS) * 86_400_000);
	const [pricingRow, rentals, boostingItems] = await Promise.all([
		prisma.microcopy.findUnique({
			where: { key: 'config.phone.usd_ngn_rate' },
			select: { value: true }
		}),
		prisma.phoneRental.findMany({
			where: { createdAt: { gte: since } },
			select: {
				orderItemId: true,
				serviceName: true,
				countryName: true,
				status: true,
				costCents: true,
				orderItem: {
					select: {
						totalPrice: true,
						refundedAmount: true,
						order: {
							select: {
								status: true,
								paymentStatus: true,
								deliveryStatus: true,
								paymentChannel: true,
								totalAmount: true,
								refundedAmount: true,
								storeCreditApplied: true,
								paidAt: true,
								createdAt: true,
								orderItems: { select: { totalPrice: true, refundedAmount: true } }
							}
						}
					}
				}
			}
		}),
		prisma.orderItem.findMany({
			where: {
				boostTargetUrl: { not: null },
				order: {
					orderType: 'boosting',
					OR: [{ paidAt: { gte: since } }, { paidAt: null, createdAt: { gte: since } }]
				}
			},
			select: {
				productName: true,
				totalPrice: true,
				refundedAmount: true,
				boostFulfillmentStatus: true,
				order: {
					select: {
						status: true,
						paymentStatus: true,
						deliveryStatus: true,
						paymentChannel: true,
						totalAmount: true,
						refundedAmount: true,
						storeCreditApplied: true,
						paidAt: true,
						createdAt: true,
						orderItems: { select: { totalPrice: true, refundedAmount: true } }
					}
				}
			}
		})
	]);

	const orderItemIds = rentals.map((rental) => rental.orderItemId);
	const attempts = orderItemIds.length
		? await prisma.phoneAttempt.findMany({
				where: { orderItemId: { in: orderItemIds }, actualCostCents: { not: null } },
				select: { orderItemId: true, actualCostCents: true }
			})
		: [];
	const attemptsByItem = new Map();
	for (const attempt of attempts) {
		attemptsByItem.set(
			attempt.orderItemId,
			(attemptsByItem.get(attempt.orderItemId) || 0) + amount(attempt.actualCostCents)
		);
	}

	const configuredRate = Number(pricingRow?.value || 1700);
	const usdNgnRate = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 1700;
	const report = {
		generatedAt: new Date().toISOString(),
		mode: 'READ_ONLY_DRY_RUN',
		assumptions: [
			'No balances, orders, prices, or rewards are changed.',
			'Rewards are calculated only from external cash retained after store credit and refunds.',
			'Gateway fees are estimates using Monnify public pricing: 1.5% capped at NGN 2,000, plus 7.5% VAT.',
			'Numbers contribution includes recorded supplier costs and estimated gateway fees, but excludes other overhead.',
			'Boosting contribution cannot be calculated until manual supplier costs are recorded.'
		],
		usdNgnRate,
		windows: WINDOWS.map((days) =>
			summarizeWindow({ days, rentals, boostingItems, attemptsByItem, usdNgnRate, now })
		)
	};

	console.log(JSON.stringify(report, null, 2));
} finally {
	await prisma.$disconnect();
}
