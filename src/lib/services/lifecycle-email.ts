import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { sendEmail, sendMarketingEmail, sendWelcomeEmailIfNeeded } from '$lib/services/email';

const ONBOARDING_STEP_A_DELAY_HOURS = 24;
const ONBOARDING_STEP_B_DELAY_HOURS = 48;
const ABANDONED_ORDER_DELAY_MINUTES = 15;

// Abandoned-checkout reminders are a 3-step sequence: 15 min, ~4 h, ~24 h.
// Each step dedupes on its own referenceId suffix; a later step only sends once
// the previous one has, so the reminders naturally space out.
const ABANDONED_REMINDER_STEPS = [
	{ step: 1, minAgeMinutes: ABANDONED_ORDER_DELAY_MINUTES, refSuffix: '' },
	{ step: 2, minAgeMinutes: 4 * 60, refSuffix: ':r2' },
	{ step: 3, minAgeMinutes: 24 * 60, refSuffix: ':r3' }
] as const;

function getAbandonedReminderContent(
	step: number,
	ctx: { firstName: string; orderLabel: string; currency: string; amountText: string }
): { subject: string; body: string; ctaText: string } {
	const { firstName, orderLabel, currency, amountText } = ctx;
	const support = `If you need help, contact support:\n- WhatsApp: https://wa.link/fast_accounts\n- Email: support@fastaccs.com\n\n**Important:** If this email lands in Spam or Promotions, mark it as Not Spam and move it to Primary.`;
	if (step === 2) {
		return {
			subject: `Still want these? Your order is held (${orderLabel})`,
			ctaText: 'Complete my order',
			body: `Hi ${firstName},\n\nYour order is still waiting \u2014 payment hasn't come through yet.\n\nOrder: ${orderLabel}\nAmount: ${currency} ${amountText}\n\nWe're holding your items, but stock moves fast. Tap below to finish and we'll deliver right away.\n\n${support}`
		};
	}
	if (step === 3) {
		return {
			subject: `Last call \u2014 your held order is about to be released (${orderLabel})`,
			ctaText: 'Finish before it expires',
			body: `Hi ${firstName},\n\nThis is the last reminder for your order \u2014 we can only hold your items a little longer.\n\nOrder: ${orderLabel}\nAmount: ${currency} ${amountText}\n\nIf you still want them, complete your payment now before they're released to other buyers.\n\n${support}`
		};
	}
	return {
		subject: `Complete your FastAccs order (${orderLabel})`,
		ctaText: 'Resume payment',
		body: `Hi ${firstName},\n\nYou started an order a few minutes ago, but payment hasn't gone through yet.\n\nOrder: ${orderLabel}\nAmount: ${currency} ${amountText}\n\nYour items are still being held for you, but not for much longer. Tap the button below to finish your payment now.\n\n${support}`
	};
}

// Nurture drip for verified users who signed up but never bought — a gentle
// 3-email sequence (day 3 / day 10 / day 21 after registration), then it stops.
// Gated behind NURTURE_ENABLED so it never sends until explicitly switched on.
const NURTURE_STEP_DELAYS_HOURS = [72, 240, 504];
// Minimum spacing between consecutive nurture emails. Keeps the existing backlog
// (whose registration-age delays are all already passed) gently spaced instead of
// receiving all three on consecutive days. New signups are already spaced by the
// registration-age delays above, so this rarely binds for them.
const NURTURE_MIN_STEP_GAP_MS = 7 * 24 * 60 * 60 * 1000;

function isNurtureEnabled(): boolean {
	return (env.NURTURE_ENABLED || '').trim().toLowerCase() === 'true';
}

function getNurturePromoCode(): string {
	return (env.NURTURE_PROMO_CODE || 'WELCOME10').trim().toUpperCase();
}

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

Browse available accounts, or boost an account you already own with followers, likes, and views — choose what fits your needs and complete checkout in a few simple steps.

Your purchases and delivery status will always be available from your dashboard.`
	};
}

function getOnboardingStepBContent(): { subject: string; body: string } {
	return {
		subject: 'Need help choosing the right account?',
		body: `Not sure which account is right for you — or want to boost one you already have?

Our platform and account pages show what is available, how delivery works, and the important details to check before buying. Our boosting services page covers followers, likes, and views if you'd rather grow an existing account.

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
	step: number;
	refSuffix: string;
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

interface NurtureDispatchCandidate {
	userId: string;
	email: string;
	firstName: string;
	step: number;
	referenceId: string;
}

function getNurtureContent(step: number, promoCode: string): { subject: string; body: string } {
	if (step === 0) {
		return {
			subject: 'A welcome gift — 10% off your first order 🎁',
			body: `You created your Fast Accounts account but haven't placed your first order yet — so here's a little nudge, with a bonus.

Use code ${promoCode} for 10% off your first purchase. Browse verified social accounts ready for instant delivery, or boost any account with real followers, likes & views — from just ₦700 per 1,000.

Hundreds of orders delivered so far — yours could be next.`
		};
	}
	if (step === 1) {
		return {
			subject: "See what everyone's ordering 🔥",
			body: `Still deciding? Here's what other customers are grabbing right now:

• Instagram followers — from ₦2,500 (240+ delivered)
• X (Twitter) accounts — from ₦1,800
• 1,000 IG followers — ₦4,500

362 orders delivered to 114 customers, and counting — real accounts, sent the moment your payment lands.

Your ${promoCode} code for 10% off your first order is still active. Take a look and grab what fits.`
		};
	}
	return {
		subject: "One last nudge (then we'll leave you be) 👋",
		body: `We don't want to crowd your inbox, so this is the last reminder from us for now.

If you've been meaning to try Fast Accounts, your 10% first-order code ${promoCode} is still here — instant delivery, verified accounts, and real support if you need it.

Whenever you're ready, we're here.`
	};
}

/**
 * Gentle 3-email drip to verified users who signed up but never completed a
 * purchase. Steps fire at ~day 3 / 10 / 21 after registration, never skip
 * ahead, and stop the moment the user buys. No-op unless NURTURE_ENABLED=true.
 */
export async function runNurtureSequence(params?: {
	limit?: number;
}): Promise<LifecycleEmailRunSummary> {
	if (!isNurtureEnabled()) {
		return { queued: 0, sent: 0, skipped: 0, failed: 0 };
	}

	const now = new Date();
	const batchLimit = Math.min(Math.max(Number(params?.limit || DEFAULT_BATCH_LIMIT), 1), 1000);
	const stepReadyAt = NURTURE_STEP_DELAYS_HOURS.map(
		(hours) => new Date(now.getTime() - hours * 60 * 60 * 1000)
	);
	const promoCode = getNurturePromoCode();
	const baseUrl = getBaseUrl();
	const scanChunk = Math.min(1000, Math.max(batchLimit * SCAN_CHUNK_MULTIPLIER, batchLimit));
	const maxScanRows = Math.max(scanChunk, batchLimit * MAX_SCAN_FACTOR);

	const dispatchQueue: NurtureDispatchCandidate[] = [];
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
				// Eligible once they've reached at least the first step's delay.
				registeredAt: { lte: stepReadyAt[0] },
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
		userCursor = { registeredAt: lastUser.registeredAt, id: lastUser.id };

		const userIds = users.map((user) => user.id);
		const existingSends = await prisma.emailNotification.findMany({
			where: {
				userId: { in: userIds },
				notificationType: 'nurture_step',
				status: 'sent',
				referenceId: { startsWith: 'nurture:' }
			},
			select: { userId: true, referenceId: true, sentAt: true }
		});
		const sentByUser = new Map<string, Map<string, Date | null>>();
		for (const row of existingSends) {
			if (!row.userId || !row.referenceId) continue;
			const stepMap = sentByUser.get(row.userId) || new Map<string, Date | null>();
			stepMap.set(row.referenceId, row.sentAt);
			sentByUser.set(row.userId, stepMap);
		}

		// Anyone who has ever paid/completed an order drops out of the sequence.
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

			const sentSteps = sentByUser.get(user.id) || new Map<string, Date | null>();
			// First unsent step decides — never skip ahead, and only send when it's
			// due by registration age AND at least the min gap after the prior step.
			let chosenStep = -1;
			for (let i = 0; i < NURTURE_STEP_DELAYS_HOURS.length; i++) {
				const ref = `nurture:step_${i + 1}:${user.id}`;
				if (sentSteps.has(ref)) continue;
				if (user.registeredAt > stepReadyAt[i]) break;
				if (i > 0) {
					const prevSentAt = sentSteps.get(`nurture:step_${i}:${user.id}`);
					if (!prevSentAt || now.getTime() - prevSentAt.getTime() < NURTURE_MIN_STEP_GAP_MS) {
						break;
					}
				}
				chosenStep = i;
				break;
			}

			if (chosenStep === -1) {
				skipped += 1;
				continue;
			}

			dispatchQueue.push({
				userId: user.id,
				email,
				firstName: getFirstName(user.fullName, email),
				step: chosenStep,
				referenceId: `nurture:step_${chosenStep + 1}:${user.id}`
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
		const message = getNurtureContent(candidate.step, promoCode);
		queued += 1;
		const result = await sendMarketingEmail({
			to: candidate.email,
			subject: message.subject,
			body: `Hi ${candidate.firstName},

${message.body}`,
			ctaText: 'Shop now',
			ctaUrl: `${baseUrl}/platforms`,
			userId: candidate.userId,
			notificationType: 'nurture_step',
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

		const candidateRefs: string[] = [];
		for (const order of candidateOrders) {
			for (const stepDef of ABANDONED_REMINDER_STEPS) {
				candidateRefs.push(`${order.id}${stepDef.refSuffix}`);
			}
		}
		const existingReminderSends = await prisma.emailNotification.findMany({
			where: {
				notificationType: 'abandoned_order',
				status: 'sent',
				referenceId: { in: candidateRefs }
			},
			select: { referenceId: true }
		});
		const sentRefs = new Set(
			existingReminderSends
				.map((row) => row.referenceId)
				.filter((r): r is string => typeof r === 'string' && Boolean(r))
		);

		for (const order of candidateOrders) {
			const targetEmail = normalizeEmail(order.user?.email || order.guestEmail);
			if (!targetEmail) {
				skipped += 1;
				continue;
			}

			// Pick the next unsent reminder step this order is old enough for.
			const ageMinutes = (now.getTime() - order.createdAt.getTime()) / 60000;
			let chosenStep: (typeof ABANDONED_REMINDER_STEPS)[number] | null = null;
			for (const stepDef of ABANDONED_REMINDER_STEPS) {
				if (sentRefs.has(`${order.id}${stepDef.refSuffix}`)) continue;
				if (ageMinutes < stepDef.minAgeMinutes) break;
				if (stepDef.step > 1) {
					const prev = ABANDONED_REMINDER_STEPS[stepDef.step - 2];
					if (!sentRefs.has(`${order.id}${prev.refSuffix}`)) break;
				}
				chosenStep = stepDef;
				break;
			}
			if (!chosenStep) {
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
				targetEmail,
				step: chosenStep.step,
				refSuffix: chosenStep.refSuffix
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
		const content = getAbandonedReminderContent(candidate.step, {
			firstName,
			orderLabel,
			currency: candidate.currency,
			amountText
		});

		queued += 1;
		const result = await sendEmail({
			to: candidate.targetEmail,
			subject: content.subject,
			body: content.body,
			ctaText: content.ctaText,
			ctaUrl: orderUrl,
			userId: candidate.userId,
			notificationType: 'abandoned_order',
			referenceId: `${candidate.orderId}${candidate.refSuffix}`
		});

		if (result.success) {
			sent += 1;
		} else {
			failed += 1;
		}
	}

	return { queued, sent, skipped, failed };
}
