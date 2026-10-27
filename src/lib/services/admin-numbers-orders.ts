import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';

/**
 * Numbers Orders for the admin: every number rental, newest first, with the order it belongs to
 * and the supplier attempts behind it. Read-only; the Numbers system itself is untouched.
 */
export interface NumbersOrderRow {
	orderId: string | null;
	orderNumber: string | null;
	createdAt: string;
	buyer: string | null;
	buyerUserId: string | null;
	serviceName: string;
	countryName: string;
	phoneNumber: string | null;
	rentalStatus: string;
	provider: string;
	saleNgn: number | null;
	costUsd: number | null;
	/** The order fields the shared stage rules read. */
	order: {
		status: string;
		paymentStatus: string;
		deliveryStatus: string;
		totalAmount: number;
		refundedAmount: number;
		orderType: string;
		paymentExpiresAt: string | null;
	} | null;
	attempts: Array<{
		createdAt: string;
		provider: string;
		providerServiceRef: string;
		outcome: string;
		failureCategory: string | null;
		expectedCostUsd: number | null;
		actualCostUsd: number | null;
	}>;
}

export const NUMBERS_ORDERS_PAGE_SIZE = 30;

export async function listNumbersOrders(input: {
	search?: string | null;
	page?: number;
	showOrderAmounts: boolean;
	showCosts: boolean;
}): Promise<{ rows: NumbersOrderRow[]; total: number; page: number; pageCount: number }> {
	const term = String(input.search ?? '')
		.trim()
		.slice(0, 100);
	const where: Prisma.PhoneRentalWhereInput = term
		? {
				OR: [
					{ phoneNumber: { contains: term } },
					{ serviceName: { contains: term, mode: 'insensitive' } },
					{ countryName: { contains: term, mode: 'insensitive' } },
					{ orderItem: { order: { orderNumber: { contains: term, mode: 'insensitive' } } } },
					{ orderItem: { order: { guestEmail: { contains: term, mode: 'insensitive' } } } },
					{ orderItem: { order: { user: { email: { contains: term, mode: 'insensitive' } } } } }
				]
			}
		: {};
	const total = await prisma.phoneRental.count({ where });
	const pageCount = Math.max(1, Math.ceil(total / NUMBERS_ORDERS_PAGE_SIZE));
	const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), pageCount);
	const rentals = await prisma.phoneRental.findMany({
		where,
		orderBy: { createdAt: 'desc' },
		skip: (page - 1) * NUMBERS_ORDERS_PAGE_SIZE,
		take: NUMBERS_ORDERS_PAGE_SIZE,
		include: {
			orderItem: {
				select: {
					refundedAmount: true,
					order: {
						select: {
							id: true,
							orderNumber: true,
							status: true,
							paymentStatus: true,
							deliveryStatus: true,
							totalAmount: true,
							refundedAmount: true,
							orderType: true,
							paymentExpiresAt: true,
							guestEmail: true,
							user: { select: { id: true, email: true, fullName: true } }
						}
					}
				}
			}
		}
	});
	const attempts = rentals.length
		? await prisma.phoneAttempt.findMany({
				where: { orderItemId: { in: rentals.map((rental) => rental.orderItemId) } },
				select: {
					orderItemId: true,
					provider: true,
					providerServiceRef: true,
					outcome: true,
					failureCategory: true,
					expectedCostCents: true,
					actualCostCents: true,
					createdAt: true
				},
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
			})
		: [];
	const trails = new Map<string, typeof attempts>();
	for (const attempt of attempts) {
		const trail = trails.get(attempt.orderItemId) ?? [];
		trail.push(attempt);
		trails.set(attempt.orderItemId, trail);
	}

	const rows = rentals.map((rental): NumbersOrderRow => {
		const order = rental.orderItem?.order ?? null;
		const trail = trails.get(rental.orderItemId) ?? [];
		const actualCents = trail.reduce((sum, a) => sum + Math.max(0, a.actualCostCents ?? 0), 0);
		const hasActual = trail.some((a) => a.actualCostCents != null);
		const costUsd = hasActual
			? actualCents / 100
			: rental.costCents != null
				? rental.costCents / 100
				: null;
		return {
			orderId: order?.id ?? null,
			orderNumber: order?.orderNumber ?? null,
			createdAt: rental.createdAt.toISOString(),
			buyer: order?.user
				? order.user.fullName?.trim() || order.user.email
				: (order?.guestEmail ?? null),
			buyerUserId: order?.user?.id ?? null,
			serviceName: rental.serviceName,
			countryName: rental.countryName,
			phoneNumber: rental.phoneNumber,
			rentalStatus: rental.status,
			provider: rental.provider,
			saleNgn: input.showOrderAmounts
				? Math.max(
						0,
						Number(rental.saleAmountNgn ?? 0) - Number(rental.orderItem?.refundedAmount ?? 0)
					)
				: null,
			costUsd: input.showCosts ? costUsd : null,
			order: order
				? {
						status: order.status,
						paymentStatus: order.paymentStatus,
						deliveryStatus: order.deliveryStatus,
						totalAmount: Number(order.totalAmount ?? 0),
						refundedAmount: Number(order.refundedAmount ?? 0),
						orderType: order.orderType,
						paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null
					}
				: null,
			attempts: trail.map((attempt) => ({
				createdAt: attempt.createdAt.toISOString(),
				provider: attempt.provider,
				providerServiceRef: attempt.providerServiceRef,
				outcome: attempt.outcome,
				failureCategory: attempt.failureCategory,
				expectedCostUsd:
					input.showCosts && attempt.expectedCostCents != null
						? attempt.expectedCostCents / 100
						: null,
				actualCostUsd:
					input.showCosts && attempt.actualCostCents != null ? attempt.actualCostCents / 100 : null
			}))
		};
	});
	return { rows, total, page, pageCount };
}
