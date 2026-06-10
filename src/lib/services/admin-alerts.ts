import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';
import {
	getBusinessTimezoneSetting,
	getLowStockThresholdSetting,
	getLowStockPolicyState,
	getOperationalAlertRecipients,
	setLowStockPolicyState,
	setLowStockAlertState
} from '$lib/services/admin-settings';
import { getBusinessDateKey, getStartOfBusinessDayUtc } from '$lib/helpers/business-timezone';

const LOW_STOCK_DIGEST_INTERVAL_MS = 12 * 60 * 60 * 1000;
const LOW_STOCK_MAX_EMAILS_PER_DAY = 3;
const LOW_STOCK_EMAIL_PREVIEW_LIMIT = 20;
const CRITICAL_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

const criticalAlertCooldown = new Map<string, number>();

function pruneCriticalAlertCooldown(): void {
	const cutoff = Date.now() - 24 * 60 * 60 * 1000;
	for (const [key, timestamp] of criticalAlertCooldown.entries()) {
		if (timestamp < cutoff) {
			criticalAlertCooldown.delete(key);
		}
	}
}

function toIso(date: Date): string {
	return date.toISOString();
}

function safeText(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim();
}

export async function sendLowStockAdminAlertIfNeeded(
	source: string
): Promise<{ sent: boolean; reason?: string }> {
	const recipients = await getOperationalAlertRecipients();
	if (recipients.length === 0) {
		return { sent: false, reason: 'no_recipients' };
	}

	const threshold = await getLowStockThresholdSetting();
	const timezone = await getBusinessTimezoneSetting().catch(() => 'Africa/Lagos');
	const now = new Date();
	const todayDateKey = getBusinessDateKey(now, timezone);

	const tiers = await prisma.category.findMany({
		where: {
			categoryType: 'tier',
			isActive: true,
			parentId: { not: null }
		},
		select: {
			id: true,
			name: true,
			parent: {
				select: {
					name: true
				}
			},
			_count: {
				select: {
					accounts: {
						where: {
							status: 'available'
						}
					}
				}
			}
		}
	});

	const zeroStockTiers = tiers
		.filter((tier) => tier._count.accounts === 0)
		.sort((a, b) => a._count.accounts - b._count.accounts);
	const previousState = await getLowStockPolicyState();
	const previousAvailability = previousState.availabilityByTier || {};
	const previousDayKey = safeText(previousState.dayKey);
	const previousSentToday = Number(previousState.sentToday) || 0;
	const previousSuppressedCount = Number(previousState.suppressedCount) || 0;

	const currentAvailabilityByTier = Object.fromEntries(
		tiers.map((tier) => [tier.id, tier._count.accounts])
	);
	const unresolvedZeroTierIds = zeroStockTiers.map((tier) => tier.id);

	const sentTodayCounter = previousDayKey === todayDateKey ? previousSentToday : 0;
	const sentTodayRows = await prisma.emailNotification.findMany({
		where: {
			notificationType: 'admin_broadcast',
			referenceId: {
				startsWith: 'low_stock_alert:'
			},
			status: 'sent',
			createdAt: {
				gte: getStartOfBusinessDayUtc(now, timezone)
			}
		},
		select: {
			referenceId: true
		}
	});
	const dbSentTodayCount = new Set(
		sentTodayRows
			.map((row) => safeText(row.referenceId))
			.filter((referenceId) => referenceId.length > 0)
	).size;
	const effectiveSentToday = Math.max(sentTodayCounter, dbSentTodayCount);

	const newZeroStockTiers = zeroStockTiers.filter((tier) => {
		const previousCount = Number(previousAvailability[tier.id]);
		return Number.isFinite(previousCount) && previousCount > 0;
	});

	const lastDigestAtTs = safeText(previousState.lastDigestAt)
		? Date.parse(String(previousState.lastDigestAt))
		: Number.NaN;
	const digestDue =
		zeroStockTiers.length > 0 &&
		(!Number.isFinite(lastDigestAtTs) || now.getTime() - lastDigestAtTs >= LOW_STOCK_DIGEST_INTERVAL_MS);

	let mode: 'new_zero_hit' | 'digest' | null = null;
	if (newZeroStockTiers.length > 0) {
		mode = 'new_zero_hit';
	} else if (digestDue) {
		mode = 'digest';
	}

	if (!mode) {
		await setLowStockPolicyState({
			version: 1,
			availabilityByTier: currentAvailabilityByTier,
			unresolvedZeroTierIds,
			lastDigestAt: previousState.lastDigestAt,
			dayKey: todayDateKey,
			sentToday: effectiveSentToday,
			suppressedCount: previousSuppressedCount,
			lastAlertAt: previousState.lastAlertAt
		});
		return { sent: false, reason: zeroStockTiers.length === 0 ? 'no_zero_stock' : 'no_action_needed' };
	}

	if (effectiveSentToday >= LOW_STOCK_MAX_EMAILS_PER_DAY) {
		await setLowStockPolicyState({
			version: 1,
			availabilityByTier: currentAvailabilityByTier,
			unresolvedZeroTierIds,
			lastDigestAt: previousState.lastDigestAt,
			dayKey: todayDateKey,
			sentToday: effectiveSentToday,
			suppressedCount: previousSuppressedCount + 1,
			lastAlertAt: previousState.lastAlertAt
		});
		return { sent: false, reason: 'daily_cap' };
	}

	const subject =
		mode === 'new_zero_hit'
			? `[FastAccs Ops] Zero-stock hit (${newZeroStockTiers.length} tier${newZeroStockTiers.length > 1 ? 's' : ''})`
			: `[FastAccs Ops] Zero-stock reminder (${zeroStockTiers.length} tier${zeroStockTiers.length > 1 ? 's' : ''})`;

	const previewRows = zeroStockTiers.slice(0, LOW_STOCK_EMAIL_PREVIEW_LIMIT);
	const newHitRows = newZeroStockTiers.slice(0, LOW_STOCK_EMAIL_PREVIEW_LIMIT);
	const bodyLines = [
		mode === 'new_zero_hit'
			? `New zero-stock tier hit detected (${source}).`
			: `Zero-stock reminder digest (${source}).`,
		'',
		`Configured low-stock threshold: ${threshold}`,
		`Unresolved zero-stock tiers: ${zeroStockTiers.length}`,
		`Alert limit: ${LOW_STOCK_MAX_EMAILS_PER_DAY}/day | Digest window: 12h`,
		'',
		mode === 'new_zero_hit' ? `New zero-stock hits: ${newZeroStockTiers.length}` : '',
		...(mode === 'new_zero_hit'
			? newHitRows.map((tier) => {
					const platformName = tier.parent?.name || 'Unknown platform';
					return `- NEW: ${platformName} / ${tier.name}`;
				})
			: []),
		newHitRows.length < newZeroStockTiers.length
			? `- ...and ${newZeroStockTiers.length - newHitRows.length} more new zero-stock tier(s).`
			: '',
		mode === 'new_zero_hit' ? '' : '',
		'Current unresolved zero-stock tiers:',
		...previewRows.map((tier) => {
			const platformName = tier.parent?.name || 'Unknown platform';
			return `- ${platformName} / ${tier.name}: ${tier._count.accounts} available`;
		}),
		previewRows.length < zeroStockTiers.length
			? `- ...and ${zeroStockTiers.length - previewRows.length} more tier(s).`
			: '',
		previousSuppressedCount > 0
			? `Suppressed alerts since last successful send (daily cap): ${previousSuppressedCount}`
			: '',
		'',
		'Open admin inventory for action: /admin/inventory'
	].filter(Boolean);
	const alertEventReferenceId = `low_stock_alert:${mode}:${todayDateKey}:${now.getTime()}`;

	let atLeastOneSent = false;
	for (const email of recipients) {
		const result = await sendEmail({
			to: email,
			subject,
			body: bodyLines.join('\n'),
			notificationType: 'admin_broadcast',
			classification: 'operational',
			referenceId: alertEventReferenceId,
			showCta: false
		});

		if (result.success) {
			atLeastOneSent = true;
		}
	}

	if (!atLeastOneSent) {
		await setLowStockPolicyState({
			version: 1,
			availabilityByTier: currentAvailabilityByTier,
			unresolvedZeroTierIds,
			lastDigestAt: previousState.lastDigestAt,
			dayKey: todayDateKey,
			sentToday: effectiveSentToday,
			suppressedCount: previousSuppressedCount,
			lastAlertAt: previousState.lastAlertAt
		});
		return { sent: false, reason: 'send_failed' };
	}

	const signature = `zero:${zeroStockTiers.map((tier) => `${tier.id}:0`).join('|')}`;
	const sentAtIso = toIso(now);

	await Promise.all([
		setLowStockAlertState(signature, sentAtIso),
		setLowStockPolicyState({
			version: 1,
			availabilityByTier: currentAvailabilityByTier,
			unresolvedZeroTierIds,
			lastDigestAt: sentAtIso,
			dayKey: todayDateKey,
			sentToday: effectiveSentToday + 1,
			suppressedCount: 0,
			lastAlertAt: sentAtIso
		})
	]);

	return { sent: true };
}

export async function sendCriticalAdminAlert(params: {
	title: string;
	message: string;
	source: string;
	dedupeKey?: string;
	cooldownMs?: number;
}): Promise<{ sent: boolean; reason?: string }> {
	pruneCriticalAlertCooldown();

	const recipients = await getOperationalAlertRecipients();
	if (recipients.length === 0) {
		return { sent: false, reason: 'no_recipients' };
	}

	const dedupeKey = params.dedupeKey || `${params.source}:${params.title}`;
	const cooldownMs = Math.max(1_000, params.cooldownMs ?? CRITICAL_ALERT_COOLDOWN_MS);
	const referenceId = `critical:${dedupeKey}`;

	const recentlySentInDb = await prisma.emailNotification.findFirst({
		where: {
			notificationType: 'admin_broadcast',
			referenceId,
			status: 'sent',
			createdAt: {
				gte: new Date(Date.now() - cooldownMs)
			}
		},
		select: { id: true }
	});
	if (recentlySentInDb) {
		criticalAlertCooldown.set(dedupeKey, Date.now());
		return { sent: false, reason: 'cooldown' };
	}

	const lastSent = criticalAlertCooldown.get(dedupeKey);
	if (lastSent && Date.now() - lastSent < cooldownMs) {
		return { sent: false, reason: 'cooldown' };
	}

	let atLeastOneSent = false;
	for (const email of recipients) {
		const result = await sendEmail({
			to: email,
			subject: `[FastAccs Ops] ${params.title}`,
			body: `${params.message}\n\nSource: ${params.source}`,
			notificationType: 'admin_broadcast',
			classification: 'operational',
			referenceId,
			showCta: false
		});

		if (result.success) {
			atLeastOneSent = true;
		}
	}

	if (atLeastOneSent) {
		criticalAlertCooldown.set(dedupeKey, Date.now());
	}

	return { sent: atLeastOneSent, reason: atLeastOneSent ? undefined : 'send_failed' };
}
