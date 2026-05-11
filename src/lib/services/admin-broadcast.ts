import { randomUUID } from 'crypto';
import { env } from '$env/dynamic/private';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { sendEmail } from './email';

export type BroadcastAudience =
	| 'all_verified'
	| 'purchased_30'
	| 'purchased_60'
	| 'purchased_90'
	| 'never_purchased'
	| 'specific_platform_buyers'
	| 'new_users_no_purchase_7'
	| 'new_users_no_purchase_14'
	| 'first_time_buyers'
	| 'repeat_buyers'
	| 'high_spenders'
	| 'inactive_30'
	| 'inactive_60'
	| 'inactive_90'
	| 'recent_abandoned_checkout'
	| 'platform_tier_buyers'
	| 'failed_payment_users';

export interface BroadcastRecipient {
	id: string;
	email: string;
	fullName: string | null;
}

export interface BroadcastBatchConfig {
	batchSize: number;
	delayMs: number;
}

export interface BroadcastProgress {
	broadcastId: string;
	subject: string;
	body: string;
	audience: BroadcastAudience | null;
	audienceLabel: string;
	createdAt: string;
	total: number;
	sent: number;
	failed: number;
	pending: number;
	status: 'in_progress' | 'completed' | 'failed';
}

export interface BroadcastHistoryItem extends BroadcastProgress {}

export interface BroadcastDetails extends BroadcastProgress {
	recipients: Array<{
		id: string;
		email: string;
		name: string | null;
		status: string;
		sentAt: string | null;
		failedAt: string | null;
		errorMessage: string | null;
	}>;
	hasMoreRecipients: boolean;
}

const BROADCAST_TYPE = 'admin_broadcast';
const SUCCESSFUL_ORDER_FILTER: Prisma.OrderWhereInput = {
	OR: [{ paymentStatus: 'paid' }, { status: { in: ['paid', 'completed'] } }]
};
const FAILED_ORDER_FILTER: Prisma.OrderWhereInput = {
	OR: [{ paymentStatus: { in: ['failed', 'cancelled'] } }, { status: { in: ['failed', 'cancelled'] } }]
};
const HIGH_SPENDER_MIN_TOTAL = Math.max(Number(env.BROADCAST_HIGH_SPENDER_MIN_TOTAL || 100000), 1);
const RECENT_ABANDONED_LOOKBACK_DAYS = clamp(
	Number(env.BROADCAST_ABANDONED_LOOKBACK_DAYS || 14),
	1,
	90
);
const ABANDONED_ORDER_PENDING_STATUSES = ['pending', 'pending_payment'];
const ABANDONED_ORDER_EXCLUDED_PAYMENT_STATUSES = ['paid', 'failed', 'cancelled'];

const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
	all_verified: 'All verified users',
	purchased_30: 'Purchased in last 30 days',
	purchased_60: 'Purchased in last 60 days',
	purchased_90: 'Purchased in last 90 days',
	never_purchased: 'Never purchased',
	specific_platform_buyers: 'Specific platform buyers',
	new_users_no_purchase_7: 'New users (7d), no purchase',
	new_users_no_purchase_14: 'New users (14d), no purchase',
	first_time_buyers: 'First-time buyers only',
	repeat_buyers: 'Repeat buyers',
	high_spenders: 'High spenders',
	inactive_30: 'Inactive buyers (30d)',
	inactive_60: 'Inactive buyers (60d)',
	inactive_90: 'Inactive buyers (90d)',
	recent_abandoned_checkout: 'Recent abandoned checkout users',
	platform_tier_buyers: 'Platform + tier buyers',
	failed_payment_users: 'Failed payment users'
};

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(Math.max(value, min), max);
}

export function getBroadcastBatchConfig(): BroadcastBatchConfig {
	const configuredBatchSize = Number(env.BROADCAST_BATCH_SIZE || 10);
	const configuredDelayMs = Number(env.BROADCAST_BATCH_DELAY_MS || 1000);

	return {
		batchSize: clamp(configuredBatchSize, 1, 200),
		delayMs: clamp(configuredDelayMs, 200, 30_000)
	};
}

export function parseBroadcastAudience(value: unknown): BroadcastAudience | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	if (!normalized) return null;

	if (
		normalized === 'all_verified' ||
		normalized === 'purchased_30' ||
		normalized === 'purchased_60' ||
		normalized === 'purchased_90' ||
		normalized === 'never_purchased' ||
		normalized === 'specific_platform_buyers' ||
		normalized === 'new_users_no_purchase_7' ||
		normalized === 'new_users_no_purchase_14' ||
		normalized === 'first_time_buyers' ||
		normalized === 'repeat_buyers' ||
		normalized === 'high_spenders' ||
		normalized === 'inactive_30' ||
		normalized === 'inactive_60' ||
		normalized === 'inactive_90' ||
		normalized === 'recent_abandoned_checkout' ||
		normalized === 'platform_tier_buyers' ||
		normalized === 'failed_payment_users'
	) {
		return normalized;
	}

	return null;
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function sanitizePlatformIds(input: unknown): string[] {
	if (!Array.isArray(input)) return [];

	const ids = new Set<string>();
	for (const value of input) {
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (!trimmed || !isUuid(trimmed)) continue;
		ids.add(trimmed);
	}

	return Array.from(ids);
}

export function sanitizeTierIds(input: unknown): string[] {
	if (!Array.isArray(input)) return [];

	const ids = new Set<string>();
	for (const value of input) {
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (!trimmed || !isUuid(trimmed)) continue;
		ids.add(trimmed);
	}

	return Array.from(ids);
}

interface BroadcastAudienceFilters {
	platformIds: string[];
	tierIds: string[];
}

function getAudienceReference(audience: BroadcastAudience, filters: BroadcastAudienceFilters): string {
	const sortedPlatformIds = [...filters.platformIds].sort();
	const sortedTierIds = [...filters.tierIds].sort();
	return `audience=${audience};platformIds=${sortedPlatformIds.join(',')};tierIds=${sortedTierIds.join(',')}`;
}

function parseAudienceReference(referenceId: string | null): {
	audience: BroadcastAudience | null;
	audienceLabel: string;
} {
	if (!referenceId) {
		return {
			audience: null,
			audienceLabel: 'Unknown audience'
		};
	}

	const [audiencePart] = referenceId.split(';');
	const audienceRaw = audiencePart.replace(/^audience=/, '').trim();
	const audience = parseBroadcastAudience(audienceRaw);

	if (!audience) {
		return {
			audience: null,
			audienceLabel: 'Unknown audience'
		};
	}

	return {
		audience,
		audienceLabel: AUDIENCE_LABELS[audience]
	};
}

function getBaseAudienceWhere(): Prisma.UserWhereInput {
	return {
		emailVerified: true,
		isActive: true,
		email: { not: null }
	};
}

function getSinceDate(days: number): Date {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function getSuccessfulOrderStatsByUser(): Promise<
	Array<{ userId: string; count: number; totalAmount: number }>
> {
	const rows = await prisma.order.groupBy({
		by: ['userId'],
		where: {
			userId: { not: null },
			...SUCCESSFUL_ORDER_FILTER
		},
		_count: { _all: true },
		_sum: { totalAmount: true }
	});

	return rows
		.filter((row): row is typeof row & { userId: string } => Boolean(row.userId))
		.map((row) => ({
			userId: row.userId,
			count: row._count._all,
			totalAmount: Number(row._sum.totalAmount || 0)
		}));
}

async function getAudienceWhereClause(
	audience: BroadcastAudience,
	filters: BroadcastAudienceFilters
): Promise<Prisma.UserWhereInput> {
	const baseWhere = getBaseAudienceWhere();

	if (audience === 'all_verified') {
		return baseWhere;
	}

	if (audience === 'never_purchased') {
		return {
			...baseWhere,
			orders: {
				none: SUCCESSFUL_ORDER_FILTER
			}
		};
	}

	if (audience === 'specific_platform_buyers') {
		if (filters.platformIds.length === 0) {
			return {
				...baseWhere,
				id: { in: [] }
			};
		}

		return {
			...baseWhere,
			orders: {
				some: {
					AND: [
						SUCCESSFUL_ORDER_FILTER,
						{
							orderItems: {
								some: {
									category: {
										parentId: { in: filters.platformIds }
									}
								}
							}
						}
					]
				}
			}
		};
	}

	if (audience === 'platform_tier_buyers') {
		if (filters.platformIds.length === 0 || filters.tierIds.length === 0) {
			return {
				...baseWhere,
				id: { in: [] }
			};
		}

		return {
			...baseWhere,
			orders: {
				some: {
					AND: [
						SUCCESSFUL_ORDER_FILTER,
						{
							orderItems: {
								some: {
									categoryId: { in: filters.tierIds },
									category: {
										parentId: { in: filters.platformIds }
									}
								}
							}
						}
					]
				}
			}
		};
	}

	if (audience === 'purchased_30' || audience === 'purchased_60' || audience === 'purchased_90') {
		const days = audience === 'purchased_30' ? 30 : audience === 'purchased_60' ? 60 : 90;
		const since = getSinceDate(days);
		return {
			...baseWhere,
			orders: {
				some: {
					AND: [SUCCESSFUL_ORDER_FILTER, { createdAt: { gte: since } }]
				}
			}
		};
	}

	if (audience === 'new_users_no_purchase_7' || audience === 'new_users_no_purchase_14') {
		const days = audience === 'new_users_no_purchase_7' ? 7 : 14;
		const since = getSinceDate(days);
		return {
			...baseWhere,
			registeredAt: { gte: since },
			orders: {
				none: SUCCESSFUL_ORDER_FILTER
			}
		};
	}

	if (audience === 'inactive_30' || audience === 'inactive_60' || audience === 'inactive_90') {
		const days = audience === 'inactive_30' ? 30 : audience === 'inactive_60' ? 60 : 90;
		const since = getSinceDate(days);
		return {
			...baseWhere,
			orders: {
				some: SUCCESSFUL_ORDER_FILTER,
				none: {
					AND: [SUCCESSFUL_ORDER_FILTER, { createdAt: { gte: since } }]
				}
			}
		};
	}

	if (audience === 'recent_abandoned_checkout') {
		const since = getSinceDate(RECENT_ABANDONED_LOOKBACK_DAYS);
		return {
			...baseWhere,
			orders: {
				some: {
					createdAt: { gte: since },
					status: { in: ABANDONED_ORDER_PENDING_STATUSES },
					paymentStatus: { notIn: ABANDONED_ORDER_EXCLUDED_PAYMENT_STATUSES }
				}
			}
		};
	}

	if (audience === 'failed_payment_users') {
		return {
			...baseWhere,
			orders: {
				some: FAILED_ORDER_FILTER
			}
		};
	}

	if (audience === 'first_time_buyers' || audience === 'repeat_buyers' || audience === 'high_spenders') {
		const stats = await getSuccessfulOrderStatsByUser();
		const filteredIds = stats
			.filter((row) => {
				if (audience === 'first_time_buyers') return row.count === 1;
				if (audience === 'repeat_buyers') return row.count >= 2;
				return row.totalAmount >= HIGH_SPENDER_MIN_TOTAL;
			})
			.map((row) => row.userId);

		return {
			...baseWhere,
			id: { in: filteredIds }
		};
	}

	return {
		...baseWhere,
		id: { in: [] }
	};
}

export async function getBroadcastAudienceCount(
	audience: BroadcastAudience,
	platformIds: string[],
	tierIds: string[]
): Promise<number> {
	const filters: BroadcastAudienceFilters = { platformIds, tierIds };

	if (audience === 'specific_platform_buyers' && filters.platformIds.length === 0) {
		return 0;
	}
	if (audience === 'platform_tier_buyers' && (filters.platformIds.length === 0 || filters.tierIds.length === 0)) {
		return 0;
	}

	const where = await getAudienceWhereClause(audience, filters);
	return prisma.user.count({ where });
}

export async function getBroadcastRecipients(
	audience: BroadcastAudience,
	platformIds: string[],
	tierIds: string[]
): Promise<BroadcastRecipient[]> {
	const filters: BroadcastAudienceFilters = { platformIds, tierIds };

	if (audience === 'specific_platform_buyers' && filters.platformIds.length === 0) {
		return [];
	}
	if (audience === 'platform_tier_buyers' && (filters.platformIds.length === 0 || filters.tierIds.length === 0)) {
		return [];
	}

	const users = await prisma.user.findMany({
		where: await getAudienceWhereClause(audience, filters),
		select: {
			id: true,
			email: true,
			fullName: true
		},
		orderBy: { createdAt: 'desc' }
	});

	return users
		.filter((user): user is { id: string; email: string; fullName: string | null } => Boolean(user.email))
		.map((user) => ({
			id: user.id,
			email: user.email,
			fullName: user.fullName
		}));
}

function chunkArray<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

export async function createBroadcast(
	params: {
		subject: string;
		body: string;
		audience: BroadcastAudience;
		platformIds: string[];
		tierIds: string[];
	}
): Promise<{ broadcastId: string; total: number }> {
	const recipients = await getBroadcastRecipients(params.audience, params.platformIds, params.tierIds);
	if (recipients.length === 0) {
		return {
			broadcastId: randomUUID(),
			total: 0
		};
	}

	const broadcastId = randomUUID();
	const audienceReference = getAudienceReference(params.audience, {
		platformIds: params.platformIds,
		tierIds: params.tierIds
	});
	const subject = params.subject.trim();
	const body = params.body.trim();

	const batches = chunkArray(recipients, 500);
	for (const batch of batches) {
		await prisma.emailNotification.createMany({
			data: batch.map((recipient) => ({
				userId: recipient.id,
				email: recipient.email,
				notificationType: BROADCAST_TYPE,
				referenceId: audienceReference,
				subject,
				body,
				status: 'pending',
				broadcastId
			}))
		});
	}

	return {
		broadcastId,
		total: recipients.length
	};
}

async function computeBroadcastProgress(broadcastId: string): Promise<BroadcastProgress | null> {
	const [total, sent, failed, pending, firstRecord] = await Promise.all([
		prisma.emailNotification.count({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE
			}
		}),
		prisma.emailNotification.count({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE,
				status: 'sent'
			}
		}),
		prisma.emailNotification.count({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE,
				status: 'failed'
			}
		}),
		prisma.emailNotification.count({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE,
				status: 'pending'
			}
		}),
		prisma.emailNotification.findFirst({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE
			},
			orderBy: { createdAt: 'asc' },
			select: {
				subject: true,
				body: true,
				referenceId: true,
				createdAt: true
			}
		})
	]);

	if (!firstRecord) return null;

	const audienceInfo = parseAudienceReference(firstRecord.referenceId || null);
	const status = pending > 0 ? 'in_progress' : sent === 0 && failed > 0 ? 'failed' : 'completed';

	return {
		broadcastId,
		subject: firstRecord.subject || '(No subject)',
		body: firstRecord.body || '',
		audience: audienceInfo.audience,
		audienceLabel: audienceInfo.audienceLabel,
		createdAt: firstRecord.createdAt.toISOString(),
		total,
		sent,
		failed,
		pending,
		status
	};
}

export async function processBroadcastBatch(
	broadcastId: string,
	batchSize: number
): Promise<{ processed: number; progress: BroadcastProgress | null }> {
	const pendingNotifications = await prisma.emailNotification.findMany({
		where: {
			broadcastId,
			notificationType: BROADCAST_TYPE,
			status: 'pending'
		},
		orderBy: { createdAt: 'asc' },
		take: clamp(batchSize, 1, 200)
	});

	if (pendingNotifications.length === 0) {
		return {
			processed: 0,
			progress: await computeBroadcastProgress(broadcastId)
		};
	}

	for (const notification of pendingNotifications) {
		const subject = (notification.subject || '').trim();
		const body = (notification.body || '').trim();
		if (!subject || !body) {
			await prisma.emailNotification.update({
				where: { id: notification.id },
				data: {
					status: 'failed',
					failedAt: new Date(),
					errorMessage: 'Missing subject or body for broadcast message.'
				}
			});
			continue;
		}

		await sendEmail({
			to: notification.email,
			subject,
			body,
			showCta: false,
			userId: notification.userId,
			notificationType: 'admin_broadcast',
			referenceId: notification.referenceId,
			broadcastId,
			notificationId: notification.id
		});
	}

	return {
		processed: pendingNotifications.length,
		progress: await computeBroadcastProgress(broadcastId)
	};
}

export async function getBroadcastProgress(broadcastId: string): Promise<BroadcastProgress | null> {
	return computeBroadcastProgress(broadcastId);
}

export async function getBroadcastHistory(limit = 20): Promise<BroadcastHistoryItem[]> {
	const rows = await prisma.emailNotification.findMany({
		where: {
			notificationType: BROADCAST_TYPE,
			broadcastId: { not: null }
		},
		select: {
			broadcastId: true,
			createdAt: true
		},
		orderBy: { createdAt: 'desc' },
		take: 2000
	});

	const seen = new Set<string>();
	const broadcastIds: string[] = [];
	for (const row of rows) {
		if (!row.broadcastId || seen.has(row.broadcastId)) continue;
		seen.add(row.broadcastId);
		broadcastIds.push(row.broadcastId);
		if (broadcastIds.length >= clamp(limit, 1, 100)) break;
	}

	const progressRows = await Promise.all(
		broadcastIds.map((broadcastId) => computeBroadcastProgress(broadcastId))
	);

	return progressRows
		.filter((row): row is BroadcastHistoryItem => Boolean(row))
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getBroadcastDetails(
	broadcastId: string,
	recipientLimit = 200
): Promise<BroadcastDetails | null> {
	const progress = await computeBroadcastProgress(broadcastId);
	if (!progress) return null;

	const limit = clamp(recipientLimit, 1, 1000);
	const [recipients, totalRecipients] = await Promise.all([
		prisma.emailNotification.findMany({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE
			},
			select: {
				id: true,
				email: true,
				status: true,
				sentAt: true,
				failedAt: true,
				errorMessage: true,
				user: {
					select: {
						fullName: true
					}
				}
			},
			orderBy: [{ status: 'asc' }, { email: 'asc' }],
			take: limit
		}),
		prisma.emailNotification.count({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE
			}
		})
	]);

	return {
		...progress,
		recipients: recipients.map((recipient) => ({
			id: recipient.id,
			email: recipient.email,
			name: recipient.user?.fullName || null,
			status: recipient.status,
			sentAt: recipient.sentAt?.toISOString() || null,
			failedAt: recipient.failedAt?.toISOString() || null,
			errorMessage: recipient.errorMessage || null
		})),
		hasMoreRecipients: totalRecipients > recipients.length
	};
}

export function getAudienceLabel(audience: BroadcastAudience): string {
	return AUDIENCE_LABELS[audience];
}
