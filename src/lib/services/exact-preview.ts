import { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { getTierExactPreviewConfig } from '$lib/helpers/tier-exact-preview';

export const EXACT_PREVIEW_RESERVATION_KEY = 'exact_preview_reservation';
export const EXACT_PREVIEW_SOURCE = 'exact_preview';
export const EXACT_PREVIEW_RESERVATION_MINUTES = 10;

const MAX_EXACT_PREVIEW_ACCOUNTS = 20;

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

export interface AccountPreviewRow {
	id: string;
	linkUrl: string | null;
	status: string;
	reservedUntil: Date | null;
	followers: number | null;
	ageMonths: number | null;
	niche: string | null;
	qualityScore: number | null;
	credentialExtras: unknown;
}

interface ExactReservationMetadata {
	source: typeof EXACT_PREVIEW_SOURCE;
	userId: string;
	displayLabel: string;
	reservedAt: string;
	expiresAt: string;
	orderId?: string;
	orderItemId?: string;
}

export interface ExactPreviewAccount {
	accountId: string;
	displayLabel: string;
	profileUrl: string;
	screenshotUrl: string | null;
	tags: string[];
	reservedUntil: string | null;
	isReservedByCurrentUser: boolean;
}

export interface ExactPreviewListResult {
	enabled: boolean;
	accounts: ExactPreviewAccount[];
	activeReservation: ExactPreviewAccount | null;
}

export interface ExactPreviewReservationResult {
	accountId: string;
	displayLabel: string;
	profileUrl: string;
	screenshotUrl: string | null;
	tags: string[];
	reservedUntil: string;
}

export interface ExactAccountSelectionInput {
	categoryId: string;
	accountId: string;
	displayLabel?: string;
}

interface AttachSelectionInput extends ExactAccountSelectionInput {
	orderItemId: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getReservationMetadata(value: unknown): ExactReservationMetadata | null {
	if (!isObject(value)) return null;
	const rawReservation = value[EXACT_PREVIEW_RESERVATION_KEY];
	if (!isObject(rawReservation)) return null;

	const source = rawReservation.source;
	const userId = rawReservation.userId;
	const displayLabel = rawReservation.displayLabel;
	const reservedAt = rawReservation.reservedAt;
	const expiresAt = rawReservation.expiresAt;

	if (
		source !== EXACT_PREVIEW_SOURCE ||
		typeof userId !== 'string' ||
		typeof displayLabel !== 'string' ||
		typeof reservedAt !== 'string' ||
		typeof expiresAt !== 'string'
	) {
		return null;
	}

	return {
		source,
		userId,
		displayLabel,
		reservedAt,
		expiresAt,
		orderId: typeof rawReservation.orderId === 'string' ? rawReservation.orderId : undefined,
		orderItemId:
			typeof rawReservation.orderItemId === 'string' ? rawReservation.orderItemId : undefined
	};
}

function isCurrentUserReservation(
	account: Pick<AccountPreviewRow, 'status' | 'reservedUntil' | 'credentialExtras'>,
	userId: string,
	now = new Date()
): boolean {
	if (account.status !== 'reserved') return false;
	if (!account.reservedUntil || account.reservedUntil.getTime() <= now.getTime()) return false;
	const reservation = getReservationMetadata(account.credentialExtras);
	return reservation?.userId === userId;
}

function normalizeExtraKey(key: string): string {
	return key
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

function getCredentialExtraValue(extras: unknown, keys: string[]): unknown {
	if (!isObject(extras)) return null;

	const normalizedCandidates = new Set(keys.map(normalizeExtraKey));
	for (const [key, value] of Object.entries(extras)) {
		if (normalizedCandidates.has(normalizeExtraKey(key))) {
			return value;
		}
	}

	return null;
}

function sanitizePublicText(value: unknown, maxLength = 28): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	const safe = normalized.replace(/[^\w\s.+&/-]/g, '').trim();
	if (!safe) return null;
	return safe.length > maxLength ? `${safe.slice(0, maxLength - 1).trim()}…` : safe;
}

function toTitleCase(value: string): string {
	return value
		.toLowerCase()
		.split(/\s+/)
		.map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
		.join(' ');
}

function sanitizeUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const url = new URL(candidate);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url.toString();
	} catch {
		return null;
	}
}

export function getExactPreviewProfileUrl(
	account: Pick<AccountPreviewRow, 'linkUrl' | 'credentialExtras'>
): string | null {
	const direct = sanitizeUrl(account.linkUrl);
	if (direct) return direct;

	return sanitizeUrl(
		getCredentialExtraValue(account.credentialExtras, [
			'profile_link',
			'profileLink',
			'Profile Link',
			'profile url',
			'profileUrl',
			'link',
			'link_url',
			'linkurl',
			'url'
		])
	);
}

export function getExactPreviewScreenshotUrl(account: {
	credentialExtras: unknown;
}): string | null {
	return sanitizeUrl(
		getCredentialExtraValue(account.credentialExtras, [
			'exact_preview_screenshot',
			'exact preview screenshot',
			'preview_screenshot',
			'preview screenshot',
			'screenshot_url',
			'screenshotUrl',
			'profile_screenshot',
			'profile screenshot',
			'image_url',
			'imageUrl'
		])
	);
}

function formatFollowerBadge(count: number | null | undefined): string | null {
	if (!Number.isFinite(count || NaN) || !count || count <= 0) return null;
	if (count >= 1000000) return `${Number((count / 1000000).toFixed(1))}M`;
	if (count >= 1000) return `${Number((count / 1000).toFixed(1))}K`;
	return String(count);
}

function formatFollowerLabel(count: number | null | undefined): string | null {
	const badge = formatFollowerBadge(count);
	if (!badge) return null;
	return /[KM]$/i.test(badge) ? badge : `${badge}F`;
}

function formatAgeBadge(ageMonths: number | null | undefined): string | null {
	if (!Number.isFinite(ageMonths || NaN) || !ageMonths || ageMonths <= 0) return null;
	if (ageMonths >= 12) {
		const years = Math.max(1, Math.floor(ageMonths / 12));
		return `${years}Y aged`;
	}
	return `${ageMonths}mo aged`;
}

function buildPreviewTags(
	account: Pick<AccountPreviewRow, 'followers' | 'ageMonths' | 'niche' | 'qualityScore'>
): string[] {
	const tags: string[] = [];
	const followers = formatFollowerBadge(account.followers);
	if (followers) tags.push(`${followers} followers`);

	const age = formatAgeBadge(account.ageMonths);
	if (age) tags.push(age);

	const niche = sanitizePublicText(account.niche, 18);
	if (niche) tags.push(toTitleCase(niche));

	if (typeof account.qualityScore === 'number' && account.qualityScore >= 4) {
		tags.push('Premium quality');
	}

	return tags.slice(0, 3);
}

function buildDisplayLabel(account: AccountPreviewRow, index: number): string {
	const sequence = `#${String(index + 1).padStart(2, '0')}`;
	const customLabel = sanitizePublicText(
		getCredentialExtraValue(account.credentialExtras, [
			'exact_preview_label',
			'exact preview label',
			'preview_label',
			'preview label',
			'public_label',
			'public label',
			'marketing_label',
			'marketing label'
		]),
		24
	);

	if (customLabel) return `${customLabel} ${sequence}`;

	const followers = formatFollowerLabel(account.followers);
	const niche = sanitizePublicText(account.niche, 16);
	const age = formatAgeBadge(account.ageMonths);

	if (followers && niche) return `${followers} ${toTitleCase(niche)} Pick ${sequence}`;
	if (followers) return `${followers} Pick ${sequence}`;
	if (niche) return `${toTitleCase(niche)} Pick ${sequence}`;
	if (age) return `${age} Pick ${sequence}`;
	if (typeof account.qualityScore === 'number' && account.qualityScore >= 4) {
		return `Premium Pick ${sequence}`;
	}

	return `Profile No ${String(index + 1).padStart(2, '0')}`;
}

function getReservationExpiry(minutes = EXACT_PREVIEW_RESERVATION_MINUTES): Date {
	return new Date(Date.now() + Math.max(1, minutes) * 60 * 1000);
}

function toJsonInput(value: Record<string, unknown>): Prisma.InputJsonObject {
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

export async function releaseExpiredExactPreviewReservations(
	client: PrismaClientLike = prisma,
	tierId?: string
): Promise<number> {
	const tierFilter = tierId ? Prisma.sql`AND category_id = ${tierId}::uuid` : Prisma.empty;
	const affected = await client.$executeRaw`
		UPDATE accounts
		SET
			status = 'available',
			reserved_until = NULL,
			order_item_id = NULL,
			credential_extras = credential_extras - ${EXACT_PREVIEW_RESERVATION_KEY},
			updated_at = NOW()
		WHERE status = 'reserved'
			AND reserved_until IS NOT NULL
			AND reserved_until <= NOW()
			AND credential_extras->${EXACT_PREVIEW_RESERVATION_KEY}->>'source' = ${EXACT_PREVIEW_SOURCE}
			AND (
				order_item_id IS NULL
				OR NOT EXISTS (
					SELECT 1
					FROM order_items AS oi
					JOIN orders AS o ON o.id = oi.order_id
					WHERE oi.id = accounts.order_item_id
						AND (
							o.status IN ('paid', 'completed')
							OR o.payment_status = 'paid'
						)
				)
			)
			${tierFilter};
	`;
	return Number(affected || 0);
}

export async function releaseUserExactPreviewReservations(
	userId: string,
	tierId: string,
	client: PrismaClientLike = prisma
): Promise<number> {
	const affected = await client.$executeRaw`
		UPDATE accounts
		SET
			status = 'available',
			reserved_until = NULL,
			order_item_id = NULL,
			credential_extras = credential_extras - ${EXACT_PREVIEW_RESERVATION_KEY},
			updated_at = NOW()
		WHERE status = 'reserved'
			AND category_id = ${tierId}::uuid
			AND order_item_id IS NULL
			AND credential_extras->${EXACT_PREVIEW_RESERVATION_KEY}->>'source' = ${EXACT_PREVIEW_SOURCE}
			AND credential_extras->${EXACT_PREVIEW_RESERVATION_KEY}->>'userId' = ${userId};
	`;
	return Number(affected || 0);
}

export async function releaseExactPreviewReservationsForOrder(orderId: string): Promise<number> {
	const affected = await prisma.$executeRaw`
		UPDATE accounts AS a
		SET
			status = 'available',
			reserved_until = NULL,
			order_item_id = NULL,
			credential_extras = a.credential_extras - ${EXACT_PREVIEW_RESERVATION_KEY},
			updated_at = NOW()
		FROM order_items AS oi
		WHERE a.order_item_id = oi.id
			AND oi.order_id = ${orderId}::uuid
			AND a.status = 'reserved'
			AND a.credential_extras->${EXACT_PREVIEW_RESERVATION_KEY}->>'source' = ${EXACT_PREVIEW_SOURCE};
	`;
	return Number(affected || 0);
}

export async function listExactPreviewAccounts(
	tierId: string,
	userId: string
): Promise<ExactPreviewListResult> {
	await releaseExpiredExactPreviewReservations(prisma, tierId);

	const tier = await prisma.category.findUnique({
		where: { id: tierId },
		select: {
			id: true,
			categoryType: true,
			isActive: true,
			metadata: true
		}
	});

	if (!tier || tier.categoryType !== 'tier' || !tier.isActive) {
		throw new Error('Tier not found');
	}

	const config = getTierExactPreviewConfig(tier.metadata);
	if (!config.enabled) {
		return { enabled: false, accounts: [], activeReservation: null };
	}

	const rows = await prisma.account.findMany({
		where: {
			categoryId: tierId,
			status: { in: ['available', 'reserved'] }
		},
		select: {
			id: true,
			linkUrl: true,
			status: true,
			reservedUntil: true,
			followers: true,
			ageMonths: true,
			niche: true,
			qualityScore: true,
			credentialExtras: true
		},
		orderBy: { createdAt: 'asc' },
		take: MAX_EXACT_PREVIEW_ACCOUNTS * 3
	});

	const visible: ExactPreviewAccount[] = [];
	let activeReservation: ExactPreviewAccount | null = null;
	const now = new Date();

	for (const row of rows) {
		const profileUrl = getExactPreviewProfileUrl(row);
		if (!profileUrl) continue;

		const currentUserReservation = isCurrentUserReservation(row, userId, now);
		if (row.status === 'reserved' && !currentUserReservation) continue;

		const reservation = getReservationMetadata(row.credentialExtras);
		const displayLabel =
			currentUserReservation && reservation?.displayLabel
				? reservation.displayLabel
				: buildDisplayLabel(row, visible.length);

		const preview: ExactPreviewAccount = {
			accountId: row.id,
			displayLabel,
			profileUrl,
			screenshotUrl: getExactPreviewScreenshotUrl(row),
			tags: buildPreviewTags(row),
			reservedUntil: row.reservedUntil?.toISOString() || null,
			isReservedByCurrentUser: currentUserReservation
		};

		visible.push(preview);
		if (currentUserReservation) {
			activeReservation = preview;
		}

		if (visible.length >= MAX_EXACT_PREVIEW_ACCOUNTS) break;
	}

	return {
		enabled: true,
		accounts: visible,
		activeReservation
	};
}

export async function reserveExactPreviewAccount(input: {
	tierId: string;
	accountId: string;
	userId: string;
}): Promise<ExactPreviewReservationResult> {
	const list = await listExactPreviewAccounts(input.tierId, input.userId);
	if (!list.enabled) {
		throw new Error('Exact account preview is not enabled for this tier.');
	}

	const target = list.accounts.find((account) => account.accountId === input.accountId);
	if (!target) {
		throw new Error('This account is no longer available for exact preview.');
	}

	const expiresAt = getReservationExpiry();
	const reservedAt = new Date();
	const reservationMetadata: ExactReservationMetadata = {
		source: EXACT_PREVIEW_SOURCE,
		userId: input.userId,
		displayLabel: target.displayLabel,
		reservedAt: reservedAt.toISOString(),
		expiresAt: expiresAt.toISOString()
	};

	await prisma.$transaction(async (tx) => {
		await releaseExpiredExactPreviewReservations(tx, input.tierId);
		const currentAccount = await tx.account.findUnique({
			where: { id: input.accountId },
			select: { credentialExtras: true }
		});
		const currentExtras = isObject(currentAccount?.credentialExtras)
			? currentAccount.credentialExtras
			: {};

		const updated = await tx.account.updateMany({
			where: {
				id: input.accountId,
				categoryId: input.tierId,
				status: 'available'
			},
			data: {
				status: 'reserved',
				reservedUntil: expiresAt,
				credentialExtras: toJsonInput({
					...currentExtras,
					[EXACT_PREVIEW_RESERVATION_KEY]: reservationMetadata
				}),
				updatedAt: new Date()
			}
		});

		if (updated.count !== 1) {
			throw new Error('This account was just reserved by someone else. Please choose another.');
		}
	});

	return {
		accountId: input.accountId,
		displayLabel: target.displayLabel,
		profileUrl: target.profileUrl,
		screenshotUrl: target.screenshotUrl,
		tags: target.tags,
		reservedUntil: expiresAt.toISOString()
	};
}

export async function attachExactPreviewSelectionsToOrder(input: {
	orderId: string;
	userId: string;
	selections: AttachSelectionInput[];
	client: Prisma.TransactionClient;
	expiresAt?: Date;
}): Promise<void> {
	const expiresAt = input.expiresAt || getReservationExpiry(EXACT_PREVIEW_RESERVATION_MINUTES);

	for (const selection of input.selections) {
		const account = await input.client.account.findUnique({
			where: { id: selection.accountId },
			select: {
				id: true,
				categoryId: true,
				status: true,
				reservedUntil: true,
				credentialExtras: true
			}
		});

		if (!account || account.categoryId !== selection.categoryId) {
			throw new Error('Selected exact account is invalid for this tier.');
		}

		const reservation = getReservationMetadata(account.credentialExtras);
		if (
			account.status !== 'reserved' ||
			!account.reservedUntil ||
			account.reservedUntil.getTime() <= Date.now() ||
			reservation?.userId !== input.userId
		) {
			throw new Error('Selected exact account reservation expired. Please choose again.');
		}

		const nextReservation: ExactReservationMetadata = {
			...reservation,
			displayLabel: selection.displayLabel || reservation.displayLabel,
			expiresAt: expiresAt.toISOString(),
			orderId: input.orderId,
			orderItemId: selection.orderItemId
		};
		const currentExtras = isObject(account.credentialExtras) ? account.credentialExtras : {};

		await input.client.account.update({
			where: { id: selection.accountId },
			data: {
				orderItemId: selection.orderItemId,
				reservedUntil: expiresAt,
				credentialExtras: toJsonInput({
					...currentExtras,
					[EXACT_PREVIEW_RESERVATION_KEY]: nextReservation
				}),
				updatedAt: new Date()
			}
		});
	}
}

export async function allocateReservedExactPreviewAccountsForItem(input: {
	client: Prisma.TransactionClient;
	orderId: string;
	orderItemId: string;
	quantity: number;
	categoryName: string;
}): Promise<{ accountIds: string[] } | null> {
	const accounts = await input.client.account.findMany({
		where: {
			orderItemId: input.orderItemId,
			status: 'reserved'
		},
		select: {
			id: true,
			credentialExtras: true
		}
	});

	const exactAccounts = accounts.filter((account) => {
		const reservation = getReservationMetadata(account.credentialExtras);
		return reservation?.orderId === input.orderId;
	});

	if (exactAccounts.length === 0) return null;
	if (exactAccounts.length !== input.quantity) {
		throw new Error(
			`EXACT_PREVIEW_RESERVATION_INCOMPLETE:${input.categoryName}:${input.quantity}:${exactAccounts.length}`
		);
	}

	const accountIds = exactAccounts.map((account) => account.id);
	await input.client.account.updateMany({
		where: { id: { in: accountIds } },
		data: {
			status: 'allocated',
			reservedUntil: null,
			updatedAt: new Date()
		}
	});

	return { accountIds };
}
