import type { PromotionCode, PromotionType } from '@prisma/client';
import { prisma } from '$lib/prisma';

interface PromotionValidationInput {
	code: string;
	userId?: string | null;
	subtotal: number;
	categoryIds: string[];
	now?: Date;
}

export interface PromotionValidationResult {
	valid: boolean;
	error?: string;
	promotion?: PromotionCode;
	discountAmount: number;
	finalTotal: number;
}

export interface PromotionCreateInput {
	code: string;
	type: PromotionType;
	value: number;
	currency?: string;
	minOrderValue?: number;
	usageCap?: number | null;
	singleUsePerUser?: boolean;
	platformIds?: string[];
	startsAt?: string | null;
	endsAt?: string | null;
	isActive?: boolean;
	createdBy?: string | null;
}

export interface PromotionUpdateInput {
	type?: PromotionType;
	value?: number;
	currency?: string;
	minOrderValue?: number;
	usageCap?: number | null;
	singleUsePerUser?: boolean;
	platformIds?: string[];
	startsAt?: string | null;
	endsAt?: string | null;
	isActive?: boolean;
}

function normalizeCode(value: string): string {
	return String(value || '').trim().toUpperCase();
}

function toAmount(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.round(value * 100) / 100;
}

function parseIsoDate(value: string | null | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function isPromotionScheduledForNow(promotion: PromotionCode, now: Date): boolean {
	if (promotion.startsAt && promotion.startsAt.getTime() > now.getTime()) return false;
	if (promotion.endsAt && promotion.endsAt.getTime() < now.getTime()) return false;
	return true;
}

async function getCartPlatformIds(categoryIds: string[]): Promise<string[]> {
	if (!categoryIds.length) return [];

	const categories = await prisma.category.findMany({
		where: {
			id: { in: categoryIds }
		},
		select: {
			id: true,
			parentId: true,
			categoryType: true
		}
	});

	const platformIdSet = new Set<string>();
	for (const category of categories) {
		if (category.categoryType === 'platform') {
			platformIdSet.add(category.id);
			continue;
		}

		if (category.parentId) {
			platformIdSet.add(category.parentId);
		}
	}

	return [...platformIdSet];
}

function calculatePromotionDiscount(
	promotion: PromotionCode,
	subtotal: number
): { discountAmount: number; finalTotal: number } {
	const normalizedSubtotal = Math.max(0, toAmount(subtotal));
	const promotionValue = Math.max(0, Number(promotion.value || 0));

	let rawDiscount = 0;
	if (promotion.type === 'PERCENT') {
		const safePercent = Math.min(100, promotionValue);
		rawDiscount = (normalizedSubtotal * safePercent) / 100;
	} else {
		rawDiscount = promotionValue;
	}

	const discountAmount = Math.min(normalizedSubtotal, toAmount(rawDiscount));
	const finalTotal = Math.max(0, toAmount(normalizedSubtotal - discountAmount));

	return {
		discountAmount,
		finalTotal
	};
}

export async function validatePromotionCode(
	input: PromotionValidationInput
): Promise<PromotionValidationResult> {
	const code = normalizeCode(input.code);
	if (!code) {
		return { valid: false, error: 'Promo code is required.', discountAmount: 0, finalTotal: toAmount(input.subtotal) };
	}

	const subtotal = toAmount(input.subtotal);
	if (subtotal <= 0) {
		return {
			valid: false,
			error: 'Invalid subtotal for promo validation.',
			discountAmount: 0,
			finalTotal: subtotal
		};
	}

	const promotion = await prisma.promotionCode.findUnique({
		where: { code }
	});

	if (!promotion || !promotion.isActive) {
		return {
			valid: false,
			error: 'Promo code is invalid or inactive.',
			discountAmount: 0,
			finalTotal: subtotal
		};
	}

	const now = input.now || new Date();
	if (!isPromotionScheduledForNow(promotion, now)) {
		return {
			valid: false,
			error: 'Promo code is not active at this time.',
			discountAmount: 0,
			finalTotal: subtotal
		};
	}

	if (promotion.usageCap !== null && promotion.usageCount >= promotion.usageCap) {
		return {
			valid: false,
			error: 'Promo code usage limit has been reached.',
			discountAmount: 0,
			finalTotal: subtotal
		};
	}

	if (subtotal < Number(promotion.minOrderValue || 0)) {
		return {
			valid: false,
			error: `Promo requires a minimum order of ${Number(promotion.minOrderValue || 0).toLocaleString()} ${promotion.currency}.`,
			discountAmount: 0,
			finalTotal: subtotal
		};
	}

	if (promotion.platformIds.length > 0) {
		const cartPlatformIds = await getCartPlatformIds(input.categoryIds);
		const hasEligiblePlatform = cartPlatformIds.some((platformId) =>
			promotion.platformIds.includes(platformId)
		);
		if (!hasEligiblePlatform) {
			return {
				valid: false,
				error: 'Promo code is not eligible for the selected platform(s).',
				discountAmount: 0,
				finalTotal: subtotal
			};
		}
	}

	if (promotion.singleUsePerUser && input.userId) {
		const priorRedemption = await prisma.promotionRedemption.findFirst({
			where: {
				promotionId: promotion.id,
				userId: input.userId
			},
			select: { id: true }
		});

		if (priorRedemption) {
			return {
				valid: false,
				error: 'Promo code has already been used on this account.',
				discountAmount: 0,
				finalTotal: subtotal
			};
		}
	}

	const { discountAmount, finalTotal } = calculatePromotionDiscount(promotion, subtotal);
	if (discountAmount <= 0) {
		return {
			valid: false,
			error: 'Promo code did not produce a discount for this cart.',
			discountAmount: 0,
			finalTotal: subtotal
		};
	}

	return {
		valid: true,
		promotion,
		discountAmount,
		finalTotal
	};
}

export async function createPromotion(input: PromotionCreateInput): Promise<PromotionCode> {
	const code = normalizeCode(input.code);
	if (!code) {
		throw new Error('Promo code is required.');
	}

	const startsAt = parseIsoDate(input.startsAt || null);
	const endsAt = parseIsoDate(input.endsAt || null);
	if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) {
		throw new Error('Promo start date must be before end date.');
	}

	return prisma.promotionCode.create({
		data: {
			code,
			type: input.type,
			value: toAmount(input.value),
			currency: (input.currency || 'NGN').trim().toUpperCase() || 'NGN',
			minOrderValue: toAmount(input.minOrderValue || 0),
			usageCap:
				typeof input.usageCap === 'number' && Number.isFinite(input.usageCap)
					? Math.max(1, Math.round(input.usageCap))
					: null,
			singleUsePerUser: Boolean(input.singleUsePerUser),
			platformIds: Array.isArray(input.platformIds) ? [...new Set(input.platformIds)] : [],
			startsAt,
			endsAt,
			isActive: input.isActive ?? true,
			createdBy: input.createdBy || null
		}
	});
}

export async function updatePromotion(id: string, input: PromotionUpdateInput): Promise<PromotionCode> {
	const startsAt = input.startsAt !== undefined ? parseIsoDate(input.startsAt || null) : undefined;
	const endsAt = input.endsAt !== undefined ? parseIsoDate(input.endsAt || null) : undefined;
	if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) {
		throw new Error('Promo start date must be before end date.');
	}

	return prisma.promotionCode.update({
		where: { id },
		data: {
			type: input.type,
			value: input.value !== undefined ? toAmount(input.value) : undefined,
			currency: input.currency !== undefined ? input.currency.trim().toUpperCase() || 'NGN' : undefined,
			minOrderValue: input.minOrderValue !== undefined ? toAmount(input.minOrderValue) : undefined,
			usageCap:
				input.usageCap === undefined
					? undefined
					: input.usageCap === null
						? null
						: Math.max(1, Math.round(input.usageCap)),
			singleUsePerUser: input.singleUsePerUser,
			platformIds: input.platformIds ? [...new Set(input.platformIds)] : undefined,
			startsAt,
			endsAt,
			isActive: input.isActive
		}
	});
}

export async function listPromotions(): Promise<PromotionCode[]> {
	return prisma.promotionCode.findMany({
		orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
	});
}

export async function recordPromotionRedemption(orderId: string): Promise<{ recorded: boolean }> {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			userId: true,
			status: true,
			promotionId: true,
			promotionCode: true,
			discountAmount: true
		}
	});

	if (!order?.promotionId || !order.promotionCode) {
		return { recorded: false };
	}

	if (order.status !== 'paid' && order.status !== 'completed') {
		return { recorded: false };
	}

	const promotionId = order.promotionId;
	const promotionCode = order.promotionCode;
	const optionalUserId = order.userId || undefined;

	return prisma.$transaction(async (tx) => {
		const existing = await tx.promotionRedemption.findUnique({
			where: { orderId: order.id },
			select: { id: true }
		});
		if (existing) {
			return { recorded: false };
		}

		await tx.promotionRedemption.create({
			data: {
				orderId: order.id,
				promotionId,
				userId: optionalUserId,
				codeSnapshot: promotionCode,
				discountAmount: order.discountAmount
			}
		});

		await tx.promotionCode.update({
			where: { id: promotionId },
			data: {
				usageCount: {
					increment: 1
				}
			}
		});

		return { recorded: true };
	});
}
