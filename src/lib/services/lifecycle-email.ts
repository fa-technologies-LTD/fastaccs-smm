import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { sendEmail, sendMarketingEmail, sendWelcomeEmailIfNeeded } from '$lib/services/email';

const ONBOARDING_STEP_A_DELAY_HOURS = 24;
const ONBOARDING_STEP_B_DELAY_HOURS = 48;
const ABANDONED_ORDER_DELAY_MINUTES = 15;

const DEFAULT_BATCH_LIMIT = 300;
const SCAN_CHUNK_MULTIPLIER = 3;
const MAX_SCAN_FACTOR = 30;

function getBaseUrl(): string {
	const candidate = (env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
	if (candidate) {
		return candidate.replace(/\/+$/, '');
	}
	return 'https://smm.fastaccs.com';
}

function getFirstName(fullName: string | null | undefined, fallbackEmail: string): string {
	if (fullName && fullName.trim()) {
		return fullName.trim().split(/\s+/)[0];
	}
	return fallbackEmail.split('@')[0] || 'there';
}

function normalizeEmail(input: string | null | undefined): string {
	return String(input || '')
		.trim()
		.toLowerCase();
}

function getUserAfterCursorWhere(cursor: { registeredAt: Date; id: string } | null) {
	if (!cursor) return {};
	return {
		OR: [
			{
				registeredAt: {
					gt: cursor.registeredAt
				}
			},
			{
				AND: [{ registeredAt: cursor.registeredAt }, { id: { gt: cursor.id } }]
			}
		]
	};
}

function getOrderAfterCursorWhere(cursor: { createdAt: Date; id: string } | null) {
	if (!cursor) return {};
	return {
		OR: [
			{
				createdAt: {
					gt: cursor.createdAt
				}
			},
			{
				AND: [{ createdAt: cursor.createdAt }, { id: { gt: cursor.id } }]
			}
		]
	};
}

function toOrderLabel(orderNumber: string): string {
	const normalizedOrderSuffix = orderNumber.replace(/^ORD-?/i, '');
	return `FA-${normalizedOrderSuffix}`;
}

function getOnboardingStepAContent(): { subject: string; body: string } {
	return {
		subject: 'Ready for your first Fast Accounts order?',
		body: `Your Fast Accounts account is ready whenever you are.

Browse available accounts, choose what fits your needs, and complete checkout in a few simple steps.

Your purchases and delivery status will always be available from your dashboard.`
	};
}

function getOnboardingStepBContent(): { subject: string; body: string } {
	return {
		subject: 'Need help choosing the right account?',
		body: `Not sure which account is right for you?

Our platform and account pages show what is available, how delivery works, and the important details to check before buying.

If you still need help, message us and we will point you in the right direction.`
	};
}

export interface LifecycleEmailRunSummary {
	queued: number;
	sent: number;
	skipped: number;
	failed: number;
}

interface OnboardingDispatchCandidate {
	userId: string;
	email: string;
	firstName: string;
	sendingStepA: boolean;
	referenceId: string;
}

interface OnboardingUserRow {
	id: string;
	email: string | null;
	fullName: string | null;
	registeredAt: Date;
}

export async function runWelcomeRecovery(params?: {
	limit?: number;
}): Promise<LifecycleEmailRunSummary> {
	const limit = Math.min(Math.max(Number(params?.limit || DEFAULT_BATCH_LIMIT), 1), 1000);
	const users = await prisma.user.findMany({
		where: {
			isActive: true,
			emailVerified: true,
			email: { not: null },
			userType: { not: 'ADMIN' },
			emailNotifications: {
				none: {
					notificationType: 'welcome',
					status: 'sent'
				}
			}
		},
		select: {
			id: true,
			email: true,
			fullName: true
		},
		orderBy: { registeredAt: 'asc' },
		take: limit
	});

	let queued = 0;
	let sent = 0;
	let skipped = 0;
	let failed = 0;
	for (const user of users) {
		const email = normalizeEmail(user.email);
		if (!email) {
			skipped += 1;
			continue;
		}

		queued += 1;
		try {
			const didSend = await sendWelcomeEmailIfNeeded({
				userId: user.id,
				email,
				firstName: getFirstName(user.fullName, email)
			});
			if (didSend) sent += 1;
			else skipped += 1;
		} catch {
			failed += 1;
		}
	}

	return { queued, sent, skipped, failed };
}

export async function runOnboardingAutomation(params?: { limit?: number }): Promise<{
	processed: number;
	failed: number;
	welcome: LifecycleEmailRunSummary;
	onboarding: LifecycleEmailRunSummary;
}> {
	const welcome = await runWelcomeRecovery(params);
	const onboarding = await runOnboardingSequence(params);
	return {
		processed: welcome.queued + onboarding.queued,
		failed: welcome.failed + onboarding.failed,
		welcome,
		onboarding
	};
}

interface AbandonedOrderDispatchCandidate {
	orderId: string;
	orderNumber: string;
	totalAmount: number;
	currency: string;
	userId: string | null;
	fullName: string | null;
	targetEmail: string;
}

interface AbandonedOrderRow {
	id: string;
	orderNumber: string;
	createdAt: Date;
	totalAmount: unknown;
	currency: string;
	guestEmail: string | null;
	user: {
		id: string;
		email: string | null;
		fullName: string | null;
	} | null;
}

export async function runOnboardingSequence(params?: {
	limit?: number;
}): Promise<LifecycleEmailRunSummary> {
	const now = new Date();
	const batchLimit = Math.min(Math.max(Number(params?.limit || DEFAULT_BATCH_LIMIT), 1), 1000);
	const stepAReadyAt = new Date(now.getTime() - ONBOARDING_STEP_A_DELAY_HOURS * 60 * 60 * 1000);
	const stepBReadyAt = new Date(now.getTime() - ONBOARDING_STEP_B_DELAY_HOURS * 60 * 60 * 1000);
	const recentWelcomeThreshold = new Date(
		now.getTime() - ONBOARDING_STEP_A_DELAY_HOURS * 60 * 60 * 1000
	);

	const baseUrl = getBaseUrl();
	const stepA = getOnboardingStepAContent();
	const stepB = getOnboardingStepBContent();
	const scanChunk = Math.min(1000, Math.max(batchLimit * SCAN_CHUNK_MULTIPLIER, batchLimit));
	const maxScanRows = Math.max(scanChunk, batchLimit * MAX_SCAN_FACTOR);

	const dispatchQueue: OnboardingDispatchCandidate[] = [];
	let scannedRows = 0;
	let userCursor: { registeredAt: Date; id: string } | null = null;
	let queued = 0;
	let sent = 0;
	let skipped = 0;
	let failed = 0;

	while (dispatchQueue.length < batchLimit && scannedRows < maxScanRows) {
		const users = (await prisma.user.findMany({
			where: {
				isActive: true,
				emailVerified: true,
				email: { not: null },
				userType: { not: 'ADMIN' },
				registeredAt: { lte: stepAReadyAt },
				emailNotifications: {
					none: {
						notificationType: 'welcome',
						status: 'sent',
						sentAt: { gte: recentWelcomeThreshold }
					}
				},
				...getUserAfterCursorWhere(userCursor)
			},
			select: {
				id: true,
				email: true,
				fullName: true,
				registeredAt: true
			},
			orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
			take: scanChunk
		})) as OnboardingUserRow[];

		if (users.length === 0) {
			break;
		}

		scannedRows += users.length;
		const lastUser = users[users.length - 1];
		userCursor = {
			registeredAt: lastUser.registeredAt,
			id: lastUser.id
		};

		const userIds = users.map((user) => user.id);
		const existingSends = await prisma.emailNotification.findMany({
			where: {
				userId: { in: userIds },
				notificationType: 'onboarding_step',
				status: 'sent',
				referenceId: {
					startsWith: 'onboarding:'
				}
			},
			select: {
				userId: true,
				referenceId: true
			}
		});

		const sentByUser = new Map<string, Set<string>>();
		for (const row of existingSends) {
			if (!row.userId) continue;
			const set = sentByUser.get(row.userId) || new Set<string>();
			if (row.referenceId) set.add(row.referenceId);
			sentByUser.set(row.userId, set);
		}
		const paidOrders = await prisma.order.findMany({
			where: {
				userId: { in: userIds },
				OR: [{ status: 'paid' }, { status: 'completed' }, { paymentStatus: 'paid' }]
			},
			select: { userId: true },
			distinct: ['userId']
		});
		const paidUserIds = new Set(
			paidOrders.map((order) => order.userId).filter((userId): userId is string => Boolean(userId))
		);

		for (const user of users) {
			const email = normalizeEmail(user.email);
			if (!email) {
				skipped += 1;
				continue;
			}
			if (paidUserIds.has(user.id)) {
				skipped += 1;
				continue;
			}

			const sentReferences = sentByUser.get(user.id) || new Set<string>();
			const stepAReference = `onboarding:step_a:${user.id}`;
			const stepBReference = `onboarding:step_b:${user.id}`;
			const hasStepASent = sentReferences.has(stepAReference);
			const hasStepBSent = sentReferences.has(stepBReference);

			const shouldSendStepA = !hasStepASent && user.registeredAt <= stepAReadyAt;
			const shouldSendStepB = hasStepASent && !hasStepBSent && user.registeredAt <= stepBReadyAt;

			if (!shouldSendStepA && !shouldSendStepB) {
				skipped += 1;
				continue;
			}

			dispatchQueue.push({
				userId: user.id,
				email,
				firstName: getFirstName(user.fullName, email),
				sendingStepA: shouldSendStepA,
				referenceId: shouldSendStepA ? stepAReference : stepBReference
			});

			if (dispatchQueue.length >= batchLimit) {
				break;
			}
		}
	}

	if (dispatchQueue.length === 0) {
		return { queued: 0, sent: 0, skipped, failed: 0 };
	}

	for (const candidate of dispatchQueue) {
		const message = candidate.sendingStepA ? stepA : stepB;
		queued += 1;
		const result = await sendMarketingEmail({
			to: candidate.email,
			subject: message.subject,
			body: `Hi ${candidate.firstName},

${message.body}`,
			ctaText: candidate.sendingStepA ? 'See available accounts' : 'Get help',
			ctaUrl: candidate.sendingStepA ? `${baseUrl}/platforms` : `${baseUrl}/support`,
			userId: candidate.userId,
			notificationType: 'onboarding_step',
			referenceId: candidate.referenceId,
			campaignKey: candidate.referenceId
		});

		if (result.success) {
			sent += 1;
		} else if (result.suppressed) {
			skipped += 1;
		} else {
			failed += 1;
		}
	}

	return { queued, sent, skipped, failed };
}

export async function runAbandonedOrderReminder(params?: {
	limit?: number;
}): Promise<LifecycleEmailRunSummary> {
	const now = new Date();
	const batchLimit = Math.min(Math.max(Number(params?.limit || DEFAULT_BATCH_LIMIT), 1), 1000);
	const cutoff = new Date(now.getTime() - ABANDONED_ORDER_DELAY_MINUTES * 60 * 1000);
	const scanChunk = Math.min(1000, Math.max(batchLimit * SCAN_CHUNK_MULTIPLIER, batchLimit));
	const maxScanRows = Math.max(scanChunk, batchLimit * MAX_SCAN_FACTOR);

	const baseUrl = getBaseUrl();
	const dispatchQueue: AbandonedOrderDispatchCandidate[] = [];
	let scannedRows = 0;
	let orderCursor: { createdAt: Date; id: string } | null = null;
	let queued = 0;
	let sent = 0;
	let skipped = 0;
	let failed = 0;

	while (dispatchQueue.length < batchLimit && scannedRows < maxScanRows) {
		const candidateOrders = (await prisma.order.findMany({
			where: {
				createdAt: { lte: cutoff },
				status: { in: ['pending', 'pending_payment'] },
				paymentStatus: { notIn: ['paid', 'failed', 'cancelled'] },
				...getOrderAfterCursorWhere(orderCursor)
			},
			select: {
				id: true,
				orderNumber: true,
				createdAt: true,
				totalAmount: true,
				currency: true,
				guestEmail: true,
				user: {
					select: {
						id: true,
						email: true,
						fullName: true
					}
				}
			},
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
			take: scanChunk
		})) as AbandonedOrderRow[];

		if (candidateOrders.length === 0) {
			break;
		}

		scannedRows += candidateOrders.length;
		const lastOrder = candidateOrders[candidateOrders.length - 1];
		orderCursor = {
			createdAt: lastOrder.createdAt,
			id: lastOrder.id
		};

		const existingReminderSends = await prisma.emailNotification.findMany({
			where: {
				notificationType: 'abandoned_order',
				status: 'sent',
				referenceId: {
					in: candidateOrders.map((order) => order.id)
				}
			},
			select: {
				referenceId: true
			}
		});
		const sentOrderIds = new Set(
			existingReminderSends
				.map((row) => row.referenceId)
				.filter(
					(referenceId): referenceId is string =>
						typeof referenceId === 'string' && Boolean(referenceId)
				)
		);

		for (const order of candidateOrders) {
			if (sentOrderIds.has(order.id)) {
				skipped += 1;
				continue;
			}

			const targetEmail = normalizeEmail(order.user?.email || order.guestEmail);
			if (!targetEmail) {
				skipped += 1;
				continue;
			}

			dispatchQueue.push({
				orderId: order.id,
				orderNumber: order.orderNumber,
				totalAmount: Number(order.totalAmount),
				currency: order.currency || 'NGN',
				userId: order.user?.id || null,
				fullName: order.user?.fullName || null,
				targetEmail
			});

			if (dispatchQueue.length >= batchLimit) {
				break;
			}
		}
	}

	if (dispatchQueue.length === 0) {
		return { queued: 0, sent: 0, skipped, failed: 0 };
	}

	for (const candidate of dispatchQueue) {
		const refreshed = await prisma.order.findUnique({
			where: { id: candidate.orderId },
			select: {
				status: true,
				paymentStatus: true
			}
		});
		if (!refreshed) {
			skipped += 1;
			continue;
		}
		if (
			!['pending', 'pending_payment'].includes(refreshed.status) ||
			['paid', 'failed', 'cancelled'].includes(refreshed.paymentStatus)
		) {
			skipped += 1;
			continue;
		}

		const firstName = getFirstName(candidate.fullName, candidate.targetEmail);
		const orderLabel = toOrderLabel(candidate.orderNumber);
		const orderUrl = `${baseUrl}/order/${encodeURIComponent(candidate.orderId)}`;
		const amountText = candidate.totalAmount.toLocaleString('en-US');

		queued += 1;
		const result = await sendEmail({
			to: candidate.targetEmail,
			subject: `Complete your FastAccs order (${orderLabel})`,
			body: `Hi ${firstName},

You started an order a few minutes ago, but payment hasn't gone through yet.

Order: ${orderLabel}
Amount: ${candidate.currency} ${amountText}

Your items are still being held for you, but not for much longer. Tap the button below to finish your payment now.

If you need help, contact support:
- WhatsApp: https://wa.link/fast_accounts
- Email: support@fastaccs.com

**Important:** If this email lands in Spam or Promotions, mark it as Not Spam and move it to Primary.`,
			ctaText: 'Resume payment',
			ctaUrl: orderUrl,
			userId: candidate.userId,
			notificationType: 'abandoned_order',
			referenceId: candidate.orderId
		});

		if (result.success) {
			sent += 1;
		} else {
			failed += 1;
		}
	}

	return { queued, sent, skipped, failed };
}
