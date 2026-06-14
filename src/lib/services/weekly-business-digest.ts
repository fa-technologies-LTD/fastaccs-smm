import { prisma } from '$lib/prisma';
import { getBusinessDateKey, getStartOfBusinessDayUtc } from '$lib/helpers/business-timezone';
import { buildRevenueOrderWindowWhere } from '$lib/helpers/order-revenue.server';
import {
	getBusinessTimezoneSetting,
	getLowStockThresholdSetting,
	getOperationalAlertRecipients
} from '$lib/services/admin-settings';
import { sendEmail } from '$lib/services/email';
import { RATE_LIMIT_NOTIFICATION_TYPES } from '$lib/auth/rate-limit';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_ROW_LIMIT = 5;

type DigestOrder = Awaited<ReturnType<typeof getRevenueOrders>>[number];

function formatAmount(value: number): string {
	return `₦${Math.round(value).toLocaleString()}`;
}

function formatPercentChange(current: number, previous: number): string {
	if (previous === 0) return current === 0 ? 'flat' : 'new activity';
	const change = Math.round(((current - previous) / previous) * 1000) / 10;
	return `${change >= 0 ? '+' : ''}${change}%`;
}

function formatWindowDate(value: Date, timezone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		day: '2-digit',
		month: 'short',
		year: 'numeric'
	}).format(value);
}

function getRunMetric(result: unknown, key: string): number {
	if (!result || typeof result !== 'object' || Array.isArray(result)) return 0;
	const value = Number((result as Record<string, unknown>)[key] || 0);
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sumRunMetric(runs: Array<{ result: unknown }>, key: string): number {
	return runs.reduce((total, run) => total + getRunMetric(run.result, key), 0);
}

function formatAge(value: Date | null, now: Date): string {
	if (!value) return 'none';
	const minutes = Math.max(0, Math.floor((now.getTime() - value.getTime()) / 60000));
	if (minutes < 60) return `${minutes} minute(s)`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours} hour(s)`;
	return `${Math.floor(hours / 24)} day(s)`;
}

function getBuyerIdentity(order: {
	userId: string | null;
	guestEmail: string | null;
}): string | null {
	if (order.userId) return `user:${order.userId}`;
	const guestEmail = String(order.guestEmail || '')
		.trim()
		.toLowerCase();
	return guestEmail ? `email:${guestEmail}` : null;
}

function getBuyerStats(orders: Array<{ userId: string | null; guestEmail: string | null }>): {
	unique: number;
	repeat: number;
} {
	const counts = new Map<string, number>();
	for (const order of orders) {
		const identity = getBuyerIdentity(order);
		if (!identity) continue;
		counts.set(identity, (counts.get(identity) || 0) + 1);
	}
	return {
		unique: counts.size,
		repeat: [...counts.values()].filter((count) => count > 1).length
	};
}

function getRevenueOrders(start: Date, end: Date) {
	return prisma.order.findMany({
		where: buildRevenueOrderWindowWhere(start, new Date(end.getTime() - 1)),
		select: {
			id: true,
			userId: true,
			guestEmail: true,
			totalAmount: true,
			affiliateUserId: true,
			deliveryMethod: true,
			orderItems: {
				select: {
					quantity: true,
					totalPrice: true,
					category: {
						select: {
							name: true,
							parent: {
								select: {
									name: true
								}
							}
						}
					}
				}
			}
		}
	});
}

function buildCatalogLeaders(orders: DigestOrder[]): {
	topTiers: string[];
	topPlatforms: string[];
	units: number;
} {
	const tiers = new Map<string, { units: number; revenue: number }>();
	const platforms = new Map<string, { units: number; revenue: number }>();
	let units = 0;

	for (const order of orders) {
		for (const item of order.orderItems) {
			const quantity = Number(item.quantity || 0);
			const revenue = Number(item.totalPrice || 0);
			const platform = item.category.parent?.name || 'Unknown platform';
			const tier = `${platform} / ${item.category.name}`;
			units += quantity;

			const tierRow = tiers.get(tier) || { units: 0, revenue: 0 };
			tierRow.units += quantity;
			tierRow.revenue += revenue;
			tiers.set(tier, tierRow);

			const platformRow = platforms.get(platform) || { units: 0, revenue: 0 };
			platformRow.units += quantity;
			platformRow.revenue += revenue;
			platforms.set(platform, platformRow);
		}
	}

	const toRows = (rows: Map<string, { units: number; revenue: number }>) =>
		[...rows.entries()]
			.sort(([, a], [, b]) => b.revenue - a.revenue || b.units - a.units)
			.slice(0, TOP_ROW_LIMIT)
			.map(([name, row]) => `- ${name}: ${row.units} unit(s) | ${formatAmount(row.revenue)}`);

	return {
		topTiers: toRows(tiers),
		topPlatforms: toRows(platforms),
		units
	};
}

export async function sendWeeklyBusinessDigest(): Promise<{
	sent: boolean;
	reason?: string;
	recipientsSent?: number;
}> {
	const [timezone, recipients, lowStockThreshold] = await Promise.all([
		getBusinessTimezoneSetting().catch(() => 'Africa/Lagos'),
		getOperationalAlertRecipients(),
		getLowStockThresholdSetting().catch(() => 10)
	]);

	if (recipients.length === 0) return { sent: false, reason: 'no_recipients' };

	const now = new Date();
	const end = getStartOfBusinessDayUtc(now, timezone);
	const start = new Date(end.getTime() - 7 * DAY_MS);
	const previousStart = new Date(start.getTime() - 7 * DAY_MS);
	const referenceId = `weekly_business_digest:${getBusinessDateKey(end, timezone)}`;
	const existingRows = await prisma.emailNotification.findMany({
		where: {
			notificationType: 'admin_broadcast',
			referenceId,
			status: 'sent'
		},
		select: { email: true }
	});
	const alreadySent = new Set(existingRows.map((row) => row.email.toLowerCase()));
	const pendingRecipients = recipients.filter((email) => !alreadySent.has(email.toLowerCase()));
	if (pendingRecipients.length === 0) return { sent: false, reason: 'already_sent' };

	const inactiveCutoff = new Date(end.getTime() - 60 * DAY_MS);
	const [
		currentOrders,
		previousOrders,
		currentAttempts,
		previousAttempts,
		newUsers,
		previousNewUsers,
		inactiveUsers,
		activeAffiliates,
		affiliateCredits,
		payoutRequests,
		newRestockInterest,
		notifiedRestockInterest,
		tiers,
		failedOrCancelledAttempts,
		currentPendingPayments,
		oldestPendingPayment,
		abandonedRemindersSent,
		allEmailsSent,
		emailFailures,
		marketingEmailsSent,
		marketingEmailsSuppressed,
		marketingUnsubscribes,
		paymentAutomationRuns,
		previewAutomationRuns,
		failedAutomationRuns
	] = await Promise.all([
		getRevenueOrders(start, end),
		getRevenueOrders(previousStart, start),
		prisma.order.count({ where: { createdAt: { gte: start, lt: end } } }),
		prisma.order.count({ where: { createdAt: { gte: previousStart, lt: start } } }),
		prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
		prisma.user.count({ where: { createdAt: { gte: previousStart, lt: start } } }),
		prisma.user.count({
			where: {
				OR: [
					{ lastSeenAt: { lt: inactiveCutoff } },
					{ lastSeenAt: null, lastLogin: { lt: inactiveCutoff } },
					{ lastSeenAt: null, lastLogin: null, registeredAt: { lt: inactiveCutoff } }
				]
			}
		}),
		prisma.affiliateProgram.count({ where: { status: 'active' } }),
		prisma.walletTransaction.aggregate({
			where: {
				type: 'affiliate_credit',
				createdAt: { gte: start, lt: end }
			},
			_sum: { amount: true }
		}),
		prisma.walletTransaction.count({
			where: {
				type: 'affiliate_payout',
				status: 'requested',
				createdAt: { gte: start, lt: end }
			}
		}),
		prisma.restockSubscription.count({ where: { createdAt: { gte: start, lt: end } } }),
		prisma.restockSubscription.count({ where: { notifiedAt: { gte: start, lt: end } } }),
		prisma.category.findMany({
			where: {
				categoryType: 'tier',
				isActive: true,
				parentId: { not: null }
			},
			select: {
				name: true,
				parent: { select: { name: true } },
				_count: {
					select: {
						accounts: { where: { status: 'available' } }
					}
				}
			}
		}),
		prisma.order.count({
			where: {
				createdAt: { gte: start, lt: end },
				OR: [
					{ status: { in: ['failed', 'cancelled'] } },
					{ paymentStatus: { in: ['failed', 'cancelled'] } }
				]
			}
		}),
		prisma.order.count({
			where: {
				paymentMethod: 'monnify',
				status: { in: ['pending', 'pending_payment'] },
				paymentStatus: { notIn: ['paid', 'success', 'overpaid', 'failed', 'cancelled'] }
			}
		}),
		prisma.order.findFirst({
			where: {
				paymentMethod: 'monnify',
				status: { in: ['pending', 'pending_payment'] },
				paymentStatus: { notIn: ['paid', 'success', 'overpaid', 'failed', 'cancelled'] }
			},
			orderBy: { createdAt: 'asc' },
			select: { createdAt: true }
		}),
		prisma.emailNotification.count({
			where: {
				notificationType: 'abandoned_order',
				status: 'sent',
				sentAt: { gte: start, lt: end }
			}
		}),
		prisma.emailNotification.count({
			where: {
				status: 'sent',
				sentAt: { gte: start, lt: end }
			}
		}),
		prisma.emailNotification.count({
			where: {
				status: 'failed',
				failedAt: { gte: start, lt: end },
				notificationType: { notIn: [...RATE_LIMIT_NOTIFICATION_TYPES] }
			}
		}),
		prisma.emailNotification.count({
			where: {
				classification: 'marketing',
				status: 'sent',
				sentAt: { gte: start, lt: end }
			}
		}),
		prisma.emailNotification.count({
			where: {
				classification: 'marketing',
				status: 'suppressed',
				createdAt: { gte: start, lt: end }
			}
		}),
		prisma.user.count({
			where: {
				marketingUnsubscribedAt: { gte: start, lt: end }
			}
		}),
		prisma.automationJobRun.findMany({
			where: {
				jobName: 'payments-reconcile',
				startedAt: { gte: start, lt: end }
			},
			select: {
				status: true,
				result: true
			}
		}),
		prisma.automationJobRun.findMany({
			where: {
				jobName: 'exact-preview-thumbnails',
				startedAt: { gte: start, lt: end }
			},
			select: {
				status: true,
				result: true
			}
		}),
		prisma.automationJobRun.count({
			where: {
				status: 'failed',
				startedAt: { gte: start, lt: end }
			}
		})
	]);

	const currentRevenue = currentOrders.reduce(
		(sum, order) => sum + Number(order.totalAmount || 0),
		0
	);
	const previousRevenue = previousOrders.reduce(
		(sum, order) => sum + Number(order.totalAmount || 0),
		0
	);
	const buyerStats = getBuyerStats(currentOrders);
	const catalog = buildCatalogLeaders(currentOrders);
	const affiliateOrders = currentOrders.filter((order) => order.affiliateUserId);
	const affiliateRevenue = affiliateOrders.reduce(
		(sum, order) => sum + Number(order.totalAmount || 0),
		0
	);
	const manualHandoverOrders = currentOrders.filter(
		(order) => order.deliveryMethod === 'whatsapp'
	).length;
	const stockRows = tiers
		.map((tier) => ({
			label: `${tier.parent?.name || 'Unknown platform'} / ${tier.name}`,
			available: tier._count.accounts
		}))
		.sort((a, b) => a.available - b.available);
	const zeroStockRows = stockRows.filter((row) => row.available === 0);
	const lowStockRows = stockRows.filter(
		(row) => row.available > 0 && row.available <= lowStockThreshold
	);
	const availableAccounts = stockRows.reduce((sum, row) => sum + row.available, 0);
	const averageOrderValue = currentOrders.length > 0 ? currentRevenue / currentOrders.length : 0;
	const reportingEnd = new Date(end.getTime() - 1);
	const successfulAttemptRate =
		currentAttempts > 0 ? Math.round((currentOrders.length / currentAttempts) * 1000) / 10 : 0;
	const paymentRecovered =
		sumRunMetric(paymentAutomationRuns, 'paid') + sumRunMetric(paymentAutomationRuns, 'completed');
	const paymentRunFailures = paymentAutomationRuns.filter((run) => run.status === 'failed').length;
	const previewsGenerated = sumRunMetric(previewAutomationRuns, 'generated');
	const previewFailures = sumRunMetric(previewAutomationRuns, 'failed');
	const urgentStockRows = [...zeroStockRows, ...lowStockRows]
		.slice(0, TOP_ROW_LIMIT)
		.map((row) => `- ${row.label}: ${row.available} available`);
	const recommendedActions = [
		currentPendingPayments > 0
			? `- Review ${currentPendingPayments} unresolved pending payment(s); oldest is ${formatAge(oldestPendingPayment?.createdAt || null, now)}.`
			: null,
		failedAutomationRuns > 0
			? `- Review ${failedAutomationRuns} failed automation run(s) from this week.`
			: null,
		emailFailures > 0 ? `- Review ${emailFailures} failed email delivery attempt(s).` : null,
		zeroStockRows.length > 0 ? `- Restock ${zeroStockRows.length} zero-stock tier(s).` : null
	].filter((line): line is string => Boolean(line));

	const body = [
		'**FastAccs weekly business digest**',
		`Reporting window: ${formatWindowDate(start, timezone)} to ${formatWindowDate(reportingEnd, timezone)} (${timezone})`,
		'',
		'**Executive snapshot**',
		`- Revenue: ${formatAmount(currentRevenue)} (${formatPercentChange(currentRevenue, previousRevenue)} vs previous week)`,
		`- Successful paid orders: ${currentOrders.length} (${formatPercentChange(currentOrders.length, previousOrders.length)})`,
		`- Order attempts: ${currentAttempts} (${formatPercentChange(currentAttempts, previousAttempts)})`,
		`- Units sold: ${catalog.units}`,
		`- Average successful order value: ${formatAmount(averageOrderValue)}`,
		`- Manual WhatsApp handovers: ${manualHandoverOrders}`,
		'',
		'**Payment and checkout health**',
		`- Successful-order conversion from attempts: ${successfulAttemptRate}%`,
		`- Failed or cancelled attempts this week: ${failedOrCancelledAttempts}`,
		`- Current unresolved pending Monnify orders: ${currentPendingPayments}`,
		`- Oldest unresolved pending order age: ${formatAge(oldestPendingPayment?.createdAt || null, now)}`,
		`- Payment reconciliation runs: ${paymentAutomationRuns.length}`,
		`- Orders recovered by scheduled reconciliation: ${paymentRecovered}`,
		`- Failed payment reconciliation runs: ${paymentRunFailures}`,
		`- Abandoned-checkout reminders sent: ${abandonedRemindersSent}`,
		'',
		'**Customer and growth signals**',
		`- Unique buyers this week: ${buyerStats.unique}`,
		`- Repeat buyers within the week: ${buyerStats.repeat}`,
		`- New user accounts: ${newUsers} (${formatPercentChange(newUsers, previousNewUsers)})`,
		`- Users inactive for 60+ days: ${inactiveUsers}`,
		`- New restock requests: ${newRestockInterest}`,
		`- Restock requests notified: ${notifiedRestockInterest}`,
		'',
		'**Inventory action**',
		`- Available accounts: ${availableAccounts}`,
		`- Zero-stock tiers: ${zeroStockRows.length}`,
		`- Low-stock tiers (1-${lowStockThreshold} available): ${lowStockRows.length}`,
		...(urgentStockRows.length > 0
			? ['Most urgent tiers:', ...urgentStockRows]
			: ['- No tier needs stock attention.']),
		'',
		'**Top platforms by weekly sales**',
		...(catalog.topPlatforms.length > 0
			? catalog.topPlatforms
			: ['- No paid platform sales this week.']),
		'',
		'**Top tiers by weekly sales**',
		...(catalog.topTiers.length > 0 ? catalog.topTiers : ['- No paid tier sales this week.']),
		'',
		'**Affiliate signals**',
		`- Active affiliate profiles: ${activeAffiliates}`,
		`- Affiliate-referred paid orders: ${affiliateOrders.length}`,
		`- Affiliate-referred sales: ${formatAmount(affiliateRevenue)}`,
		`- Affiliate Store Credit earned this week: ${formatAmount(Number(affiliateCredits._sum.amount || 0))}`,
		`- New payout requests: ${payoutRequests}`,
		'',
		'**Email performance**',
		`- Emails sent: ${allEmailsSent}`,
		`- Email delivery failures: ${emailFailures}`,
		`- Optional marketing emails sent: ${marketingEmailsSent}`,
		`- Optional marketing sends suppressed by policy: ${marketingEmailsSuppressed}`,
		`- Marketing unsubscribes: ${marketingUnsubscribes}`,
		'',
		'**Automation and exact-preview health**',
		`- Failed automation runs: ${failedAutomationRuns}`,
		`- Exact-preview automation runs: ${previewAutomationRuns.length}`,
		`- Exact previews generated: ${previewsGenerated}`,
		`- Exact-preview generation failures: ${previewFailures}`,
		'',
		'**Recommended operator actions**',
		...(recommendedActions.length > 0
			? recommendedActions
			: ['- No urgent operator action detected from this weekly summary.']),
		'',
		'Open the full admin views:',
		'- Analytics: /admin/analytics',
		'- Inventory: /admin/inventory',
		'- Users: /admin/users'
	].join('\n');

	let recipientsSent = 0;
	for (const email of pendingRecipients) {
		const result = await sendEmail({
			to: email,
			subject: `[FastAccs Ops] Weekly business digest (${getBusinessDateKey(start, timezone)})`,
			body,
			notificationType: 'admin_broadcast',
			classification: 'operational',
			referenceId,
			showCta: false
		});
		if (result.success) recipientsSent += 1;
	}

	return {
		sent: recipientsSent > 0,
		reason: recipientsSent > 0 ? undefined : 'send_failed',
		recipientsSent
	};
}
