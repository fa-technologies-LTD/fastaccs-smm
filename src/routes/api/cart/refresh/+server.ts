import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { CartItemWithTier } from '$lib/types/cart';
import { prisma } from '$lib/prisma';
import {
	EXACT_PREVIEW_RESERVATION_KEY,
	EXACT_PREVIEW_SOURCE,
	getExactPreviewProfileUrl,
	getExactPreviewScreenshotUrl,
	releaseExpiredExactPreviewReservations
} from '$lib/services/exact-preview';

interface CartRefreshItemInput {
	cartItemId?: string;
	tierId?: string;
	quantity?: number;
	addedAt?: number;
	exactAccount?: {
		accountId?: string;
		displayLabel?: string;
		profileUrl?: string;
		screenshotUrl?: string | null;
		reservedUntil?: string;
	};
}

interface ReservationMetadata {
	source?: string;
	userId?: string;
	displayLabel?: string;
	expiresAt?: string;
}

type CartRefreshTier = {
	id: string;
	name: string;
	price: number;
	slug: string;
	platformName: string;
	platformSlug: string;
	platformIcon: string | null;
	isActive: boolean;
};

const MAX_CART_REFRESH_ITEMS = 80;

function isCartRefreshItemInput(item: unknown): item is CartRefreshItemInput {
	return Boolean(item && typeof item === 'object' && !Array.isArray(item));
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSlug(value: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value);
}

function normalizeText(value: unknown): string {
	return String(value || '').trim();
}

function getTierPrice(metadata: unknown): number {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
	const record = metadata as Record<string, unknown>;
	const pricing = record.pricing as Record<string, unknown> | undefined;
	const parsed = Number(pricing?.base_price ?? record.price ?? 0);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getPlatformIcon(metadata: unknown): string | null {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
	const record = metadata as Record<string, unknown>;
	for (const key of ['icon', 'iconUrl', 'icon_url', 'image', 'image_url', 'logo', 'logo_url']) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}

function getReservationMetadata(value: unknown): ReservationMetadata | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const extras = value as Record<string, unknown>;
	const raw = extras[EXACT_PREVIEW_RESERVATION_KEY];
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	return raw as ReservationMetadata;
}

function buildLineKey(input: { tierId: string; exactAccountId?: string | null }): string {
	return input.exactAccountId ? `exact:${input.exactAccountId}` : `tier:${input.tierId}`;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const payload = (await request.json().catch(() => ({}))) as { items?: unknown };
		const rawItems: unknown[] = Array.isArray(payload.items) ? payload.items : [];
		const inputItems = rawItems.slice(0, MAX_CART_REFRESH_ITEMS).filter(isCartRefreshItemInput);

		if (inputItems.length === 0) {
			return json({ success: true, data: { items: [], messages: [] } });
		}

		await releaseExpiredExactPreviewReservations();

		const tierInputs: string[] = Array.from(
			new Set<string>(
				inputItems.map((item) => normalizeText(item.tierId)).filter((value) => value.length > 0)
			)
		);
		const uuidTierIds = tierInputs.filter((value) => isUuid(value));
		const slugTierIds = tierInputs
			.filter((value) => !isUuid(value) && isSlug(value))
			.map((value) => value.toLowerCase());

		if (uuidTierIds.length === 0 && slugTierIds.length === 0) {
			return json({
				success: true,
				data: {
					items: [],
					messages: ['Your cart was refreshed. Please add items again.']
				}
			});
		}

		const tiers = await prisma.category.findMany({
			where: {
				categoryType: 'tier',
				isActive: true,
				OR: [
					...(uuidTierIds.length ? [{ id: { in: uuidTierIds } }] : []),
					...(slugTierIds.length ? [{ slug: { in: slugTierIds } }] : [])
				]
			},
			select: {
				id: true,
				name: true,
				slug: true,
				metadata: true,
				isActive: true,
				parent: {
					select: {
						name: true,
						slug: true,
						metadata: true
					}
				}
			}
		});

		const tierByInput = new Map<string, (typeof tiers)[number]>();
		for (const tier of tiers) {
			tierByInput.set(tier.id, tier);
			tierByInput.set(tier.slug.toLowerCase(), tier);
		}

		const canonicalTierIds = Array.from(new Set(tiers.map((tier) => tier.id)));
		const stockRows = canonicalTierIds.length
			? await prisma.account.groupBy({
					by: ['categoryId'],
					where: {
						categoryId: { in: canonicalTierIds },
						status: 'available'
					},
					_count: { _all: true }
				})
			: [];
		const availableByTierId = new Map(
			stockRows.map((row) => [row.categoryId, Number(row._count._all || 0)])
		);

		const exactAccountIds = inputItems
			.map((item) => normalizeText(item.exactAccount?.accountId))
			.filter((value) => value.length > 0 && isUuid(value));
		const exactAccounts = exactAccountIds.length
			? await prisma.account.findMany({
					where: { id: { in: exactAccountIds } },
					select: {
						id: true,
						categoryId: true,
						linkUrl: true,
						status: true,
						reservedUntil: true,
						followers: true,
						ageMonths: true,
						niche: true,
						qualityScore: true,
						credentialExtras: true
					}
				})
			: [];
		const exactAccountById = new Map(exactAccounts.map((account) => [account.id, account]));

		const messages: string[] = [];
		const mergedItems = new Map<string, CartItemWithTier>();
		const now = new Date();

		for (const input of inputItems) {
			const rawTierId = normalizeText(input.tierId);
			const tier = tierByInput.get(isUuid(rawTierId) ? rawTierId : rawTierId.toLowerCase());
			if (!tier) {
				messages.push('An unavailable account type was removed from your cart.');
				continue;
			}

			const tierPayload: CartRefreshTier = {
				id: tier.id,
				name: tier.name,
				price: getTierPrice(tier.metadata),
				slug: tier.slug,
				platformName: tier.parent?.name || 'Unknown',
				platformSlug: tier.parent?.slug || '',
				platformIcon: getPlatformIcon(tier.parent?.metadata),
				isActive: tier.isActive
			};

			const exactAccountId = normalizeText(input.exactAccount?.accountId);
			if (exactAccountId) {
				const account = exactAccountById.get(exactAccountId);
				const reservation = getReservationMetadata(account?.credentialExtras);
				const isHeldByCurrentUser =
					Boolean(locals.user?.id) &&
					account?.status === 'reserved' &&
					Boolean(account.reservedUntil) &&
					account.reservedUntil!.getTime() > now.getTime() &&
					reservation?.source === EXACT_PREVIEW_SOURCE &&
					reservation?.userId === locals.user?.id;

				if (!account || account.categoryId !== tier.id || !isHeldByCurrentUser) {
					const label = normalizeText(input.exactAccount?.displayLabel) || tier.name;
					messages.push(`${label} is no longer held for you, so it was removed from your cart.`);
					continue;
				}

				const profileUrl =
					getExactPreviewProfileUrl(account) || input.exactAccount?.profileUrl || '';
				if (!profileUrl) {
					messages.push(`${tier.name} was removed because its live profile link is unavailable.`);
					continue;
				}

				const key = buildLineKey({ tierId: tier.id, exactAccountId: account.id });
				mergedItems.set(key, {
					cartItemId: key,
					tierId: tier.id,
					quantity: 1,
					addedAt: Number(input.addedAt || Date.now()),
					exactAccount: {
						accountId: account.id,
						displayLabel:
							normalizeText(input.exactAccount?.displayLabel) ||
							normalizeText(reservation?.displayLabel) ||
							'Selected profile',
						profileUrl,
						screenshotUrl: getExactPreviewScreenshotUrl(account),
						reservedUntil: account.reservedUntil!.toISOString()
					},
					tier: tierPayload
				});
				continue;
			}

			const requestedQuantity = Math.max(1, Math.floor(Number(input.quantity || 1)));
			const available = availableByTierId.get(tier.id) || 0;
			if (available <= 0) {
				messages.push(`${tier.name} is out of stock, so it was removed from your cart.`);
				continue;
			}

			const quantity = Math.min(requestedQuantity, available);
			if (quantity < requestedQuantity) {
				messages.push(
					`Only ${quantity} ${tier.name} ${quantity === 1 ? 'account remains' : 'accounts remain'}, so your cart was updated.`
				);
			}

			const key = buildLineKey({ tierId: tier.id });
			const existing = mergedItems.get(key);
			if (existing) {
				const mergedQuantity = Math.min(existing.quantity + quantity, available);
				if (mergedQuantity < existing.quantity + quantity) {
					messages.push(`${tier.name} quantity was capped at available stock.`);
				}
				existing.quantity = mergedQuantity;
				existing.addedAt = Math.min(existing.addedAt, Number(input.addedAt || Date.now()));
				continue;
			}

			mergedItems.set(key, {
				cartItemId: key,
				tierId: tier.id,
				quantity,
				addedAt: Number(input.addedAt || Date.now()),
				tier: tierPayload
			});
		}

		return json({
			success: true,
			data: {
				items: Array.from(mergedItems.values()),
				messages: [...new Set(messages)].slice(0, 5)
			}
		});
	} catch (error) {
		console.error('[cart.refresh] failed:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to refresh cart.'
			},
			{ status: 500 }
		);
	}
};
