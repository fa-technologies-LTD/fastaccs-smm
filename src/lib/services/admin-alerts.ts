import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';
import {
	getLowStockAlertState,
	getLowStockThresholdSetting,
	getOperationalAlertRecipients,
	setLowStockAlertState
} from '$lib/services/admin-settings';

const LOW_STOCK_ALERT_COOLDOWN_MS = 30 * 60 * 1000;
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

	const impacted = tiers
		.filter((tier) => tier._count.accounts <= threshold)
		.sort((a, b) => a._count.accounts - b._count.accounts);

	if (impacted.length === 0) {
		return { sent: false, reason: 'no_low_stock' };
	}

	const signature = `${threshold}:${impacted
		.map((tier) => `${tier.id}:${tier._count.accounts}`)
		.join('|')}`;

	const previousState = await getLowStockAlertState();
	const previousSignature = safeText(previousState.signature);
	const previousSentAt = safeText(previousState.sentAt);
	const previousSentTs = previousSentAt ? Date.parse(previousSentAt) : Number.NaN;

	if (
		previousSignature === signature &&
		Number.isFinite(previousSentTs) &&
		Date.now() - previousSentTs < LOW_STOCK_ALERT_COOLDOWN_MS
	) {
		return { sent: false, reason: 'cooldown' };
	}

	const previewRows = impacted.slice(0, 20);
	const bodyLines = [
		`Low-stock alert triggered (${source}).`,
		'',
		`Threshold: ${threshold}`,
		`Impacted tiers: ${impacted.length}`,
		'',
		'Current tier availability:',
		...previewRows.map((tier) => {
			const platformName = tier.parent?.name || 'Unknown platform';
			return `- ${platformName} / ${tier.name}: ${tier._count.accounts} available`;
		}),
		previewRows.length < impacted.length
			? `- ...and ${impacted.length - previewRows.length} more tier(s).`
			: '',
		'',
		'Open admin inventory for action: /admin/inventory'
	].filter(Boolean);

	let atLeastOneSent = false;
	for (const email of recipients) {
		const result = await sendEmail({
			to: email,
			subject: `[FastAccs Ops] Low stock alert (${impacted.length} tier${impacted.length > 1 ? 's' : ''})`,
			body: bodyLines.join('\n'),
			notificationType: 'admin_broadcast',
			referenceId: 'low_stock_alert',
			showCta: false
		});

		if (result.success) {
			atLeastOneSent = true;
		}
	}

	if (atLeastOneSent) {
		await setLowStockAlertState(signature, toIso(new Date()));
	}

	return { sent: atLeastOneSent, reason: atLeastOneSent ? undefined : 'send_failed' };
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
