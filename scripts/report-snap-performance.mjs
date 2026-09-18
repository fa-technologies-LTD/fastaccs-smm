import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const WINDOWS = [7, 30, 90];

function money(value) {
	const amount = Number(value || 0);
	return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function netSales(order) {
	return Math.max(0, money(order.totalAmount) - money(order.refundedAmount));
}

async function reportWindow(days) {
	const since = new Date(Date.now() - days * 86_400_000);
	const allUsers = await prisma.user.findMany({
		where: {
			registeredAt: { gte: since }
		},
		select: { id: true, acquisitionSource: true, acquisitionCampaign: true }
	});
	const users = allUsers.filter(
		(user) =>
			String(user.acquisitionSource || '')
				.trim()
				.toLowerCase() === 'snapchat'
	);
	const sourceSignups = {};
	for (const user of allUsers) {
		const source =
			String(user.acquisitionSource || '')
				.trim()
				.toLowerCase() || 'untracked';
		sourceSignups[source] = (sourceSignups[source] || 0) + 1;
	}
	const attributedSignups = allUsers.length - (sourceSignups.untracked || 0);
	const userIds = users.map((user) => user.id);
	const orders = userIds.length
		? await prisma.order.findMany({
				where: {
					userId: { in: userIds },
					createdAt: { gte: since },
					OR: [
						{ paymentStatus: { in: ['paid', 'success'] } },
						{ status: { in: ['completed', 'delivered', 'processing'] } }
					]
				},
				select: { userId: true, totalAmount: true, refundedAmount: true }
			})
		: [];
	const buyers = new Set(orders.map((order) => order.userId).filter(Boolean));
	const revenueNgn = orders.reduce((total, order) => total + netSales(order), 0);

	return {
		days,
		totalSignups: allUsers.length,
		attributedSignups,
		attributionCoveragePercent: allUsers.length
			? Math.round((attributedSignups / allUsers.length) * 1000) / 10
			: 0,
		sourceSignups,
		signups: users.length,
		buyers: buyers.size,
		paidOrders: orders.length,
		signupToBuyerPercent: users.length ? Math.round((buyers.size / users.length) * 1000) / 10 : 0,
		netSalesNgn: Math.round(revenueNgn * 100) / 100,
		averageOrderNgn: orders.length ? Math.round((revenueNgn / orders.length) * 100) / 100 : 0
	};
}

try {
	const windows = [];
	for (const days of WINDOWS) windows.push(await reportWindow(days));

	const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
	const snapchatCampaigns = await prisma.user.groupBy({
		by: ['acquisitionCampaign'],
		where: {
			registeredAt: { gte: ninetyDaysAgo },
			acquisitionSource: { equals: 'snapchat', mode: 'insensitive' }
		},
		_count: { _all: true },
		orderBy: { _count: { acquisitionCampaign: 'desc' } }
	});
	const funnel = await prisma.analyticsEvent.groupBy({
		by: ['type'],
		where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
		_count: { _all: true }
	});

	console.log(
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				note: 'Snapchat rows use FastAccs first-touch signup attribution. Funnel counts include all sources and are not Snapchat-only.',
				windows,
				campaignSignups90Days: snapchatCampaigns.map((campaign) => ({
					campaign: campaign.acquisitionCampaign || 'not_tagged',
					signups: campaign._count._all
				})),
				allTrafficFunnel30Days: Object.fromEntries(
					funnel.map((event) => [event.type, event._count._all])
				)
			},
			null,
			2
		)
	);
} finally {
	await prisma.$disconnect();
}
