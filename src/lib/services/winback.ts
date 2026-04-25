import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { sendEmail } from './email';

const WINBACK_DAYS = Math.max(Number(env.WINBACK_DAYS_THRESHOLD || 30), 1);
const WINBACK_COOLDOWN_DAYS = 30;

function getBaseUrl(): string {
	const candidate = (env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
	return candidate ? candidate.replace(/\/+$/, '') : 'http://localhost:5173';
}

function getWATDateParts(date = new Date()): { year: number; month: number; day: number; hour: number } {
	const formatter = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Africa/Lagos',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hour12: false
	});

	const parts = formatter.formatToParts(date);
	const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || '0');

	return {
		year: value('year'),
		month: value('month'),
		day: value('day'),
		hour: value('hour')
	};
}

function getFirstName(fullName: string | null | undefined, fallbackEmail: string): string {
	if (fullName && fullName.trim()) {
		return fullName.trim().split(/\s+/)[0];
	}
	return fallbackEmail.split('@')[0] || 'there';
}

async function getAvailablePlatformNames(limit = 3): Promise<string[]> {
	const tiers = await prisma.category.findMany({
		where: {
			categoryType: 'tier',
			isActive: true,
			accounts: {
				some: {
					status: 'available'
				}
			}
		},
		select: {
			parent: {
				select: {
					name: true
				}
			}
		},
		take: 100
	});

	const names = new Set<string>();
	for (const tier of tiers) {
		const platformName = tier.parent?.name?.trim();
		if (platformName) {
			names.add(platformName);
		}
		if (names.size >= limit) break;
	}

	return Array.from(names);
}

export async function runWinBackCampaign(): Promise<{ queued: number; sent: number; skipped: number }> {
	const users = await prisma.user.findMany({
		where: {
			emailVerified: true,
			email: { not: null },
			isActive: true
		},
		select: {
			id: true,
			email: true,
			fullName: true
		},
		take: 1000
	});

	const inactiveThreshold = new Date(Date.now() - WINBACK_DAYS * 24 * 60 * 60 * 1000);
	const recentWinbackThreshold = new Date(Date.now() - WINBACK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
	const platforms = await getAvailablePlatformNames();
	const platformLine =
		platforms.length > 0 ? `Currently in stock: ${platforms.join(', ')}.` : 'Fresh inventory is available now.';

	let queued = 0;
	let sent = 0;
	let skipped = 0;

	for (const user of users) {
		if (!user.email) {
			skipped += 1;
			continue;
		}

		const lastOrder = await prisma.order.findFirst({
			where: { userId: user.id },
			orderBy: { createdAt: 'desc' },
			select: { createdAt: true }
		});

		if (!lastOrder || lastOrder.createdAt > inactiveThreshold) {
			skipped += 1;
			continue;
		}

		const alreadySent = await prisma.emailNotification.findFirst({
			where: {
				userId: user.id,
				notificationType: 'win_back',
				status: 'sent',
				createdAt: { gte: recentWinbackThreshold }
			},
			select: { id: true }
		});

		if (alreadySent) {
			skipped += 1;
			continue;
		}

		queued += 1;
		const firstName = getFirstName(user.fullName, user.email);
		const result = await sendEmail({
			to: user.email,
			subject: "We've got fresh stock waiting for you",
			body: `Hi ${firstName},

We've added fresh inventory since your last order.

${platformLine}

Take a quick look and grab what fits your goals.`,
			ctaText: "See what's new",
			ctaUrl: `${getBaseUrl()}/platforms`,
			userId: user.id,
			notificationType: 'win_back'
		});

		if (result.success) {
			sent += 1;
		}
	}

	return { queued, sent, skipped };
}

export function startWinBackScheduler(): void {
	const schedulerEnabled = (env.WINBACK_SCHEDULER_ENABLED || '').toLowerCase() === 'true';
	if (!schedulerEnabled) return;

	const globalScope = globalThis as unknown as Record<string, unknown>;
	const startedKey = '__fastaccsWinBackSchedulerStarted__';
	const lastRunKey = '__fastaccsWinBackLastRun__';
	if (globalScope[startedKey]) return;

	globalScope[startedKey] = true;
	const intervalMs = Math.max(Number(env.WINBACK_SCHEDULER_INTERVAL_MS || 15 * 60 * 1000), 60000);

	setInterval(() => {
		const { year, month, day, hour } = getWATDateParts();
		if (hour !== 9) return;

		const currentRunMarker = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		if (globalScope[lastRunKey] === currentRunMarker) return;

		globalScope[lastRunKey] = currentRunMarker;
		void runWinBackCampaign().catch((error) => {
			console.error('[winback.scheduler] run failed:', error);
		});
	}, intervalMs);

	console.info('[winback.scheduler] started', { intervalMs, timezone: 'Africa/Lagos' });
}
