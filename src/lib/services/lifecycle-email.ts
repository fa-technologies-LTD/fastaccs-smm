import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';

const ONBOARDING_STEP_A_DELAY_HOURS = 24;
const ONBOARDING_STEP_B_DELAY_HOURS = 48;
const ABANDONED_ORDER_DELAY_HOURS = 2;

const DEFAULT_BATCH_LIMIT = 300;
const SCAN_CHUNK_MULTIPLIER = 3;
const MAX_SCAN_FACTOR = 30;

function getBaseUrl(): string {
	const candidate = (env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
	if (candidate) {
		return candidate.replace(/\/+$/, '');
	}
	return 'http://localhost:5173';
}

function getFirstName(fullName: string | null | undefined, fallbackEmail: string): string {
	if (fullName && fullName.trim()) {
		return fullName.trim().split(/\s+/)[0];
	}
	return fallbackEmail.split('@')[0] || 'there';
}

function normalizeEmail(input: string | null | undefined): string {
	return String(input || '').trim().toLowerCase();
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

function getOnboardingStepAContent(baseUrl: string): { subject: string; body: string } {
	return {
		subject: 'Welcome to FastAccs: Start your first order',
		body: `Welcome to FastAccs.

What you can do here:
- Buy social media accounts on demand for all your needs
- Complete secure checkout, transactions are safe
- Track orders from your dashboard

Quick first-order flow:
- Open Platforms: ${baseUrl}/platforms
- Pick a tier and quantity
- Checkout and complete payment
- View delivery/status from your order page

Beginner-safe way to start:
- Start with lower-cost tiers first
- Place small test quantities before scaling
- Use each tier's login guide before purchase

**Important:** If this email lands in Spam or Promotions, mark it as Not Spam and move it to Primary.`
	};
}

function getOnboardingStepBContent(baseUrl: string): { subject: string; body: string } {
	return {
		subject: 'Need help? FastAccs guides and support',
		body: `Need help getting results faster? We have you covered.

Useful links:
- Support and FAQ: ${baseUrl}/support
- How it works: ${baseUrl}/how-it-works
- Tier catalog (includes guide/video links where available): ${baseUrl}/platforms

If you ever get stuck, reach support directly:
- WhatsApp: https://wa.link/fast_accounts
- Email: support@fastaccs.com

**Important:** If this email lands in Spam or Promotions, mark it as Not Spam and move it to Primary.`
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

	const baseUrl = getBaseUrl();
	const stepA = getOnboardingStepAContent(baseUrl);
	const stepB = getOnboardingStepBContent(baseUrl);
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

		for (const user of users) {
			const email = normalizeEmail(user.email);
			if (!email) {
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
		const result = await sendEmail({
			to: candidate.email,
			subject: message.subject,
			body: `Hi ${candidate.firstName},

${message.body}`,
			ctaText: candidate.sendingStepA ? 'Browse Platforms' : 'Open Support Center',
			ctaUrl: candidate.sendingStepA ? `${baseUrl}/platforms` : `${baseUrl}/support`,
			userId: candidate.userId,
			notificationType: 'onboarding_step',
			referenceId: candidate.referenceId
		});

		if (result.success) {
			sent += 1;
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
	const cutoff = new Date(now.getTime() - ABANDONED_ORDER_DELAY_HOURS * 60 * 60 * 1000);
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
					(referenceId): referenceId is string => typeof referenceId === 'string' && Boolean(referenceId)
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
			refreshed.status === 'paid' ||
			refreshed.status === 'completed' ||
			refreshed.paymentStatus === 'paid'
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

You started an order about 2 hours ago, but payment is still incomplete.

Order: ${orderLabel}
Amount: ${candidate.currency} ${amountText}

Your order is still open. Complete payment to continue delivery.

If you need help, contact support:
- WhatsApp: https://wa.link/fast_accounts
- Email: support@fastaccs.com

**Important:** If this email lands in Spam or Promotions, mark it as Not Spam and move it to Primary.`,
			ctaText: 'Complete this order',
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
