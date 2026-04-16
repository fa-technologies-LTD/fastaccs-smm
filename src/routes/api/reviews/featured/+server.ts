import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

function clampLimit(value: number): number {
	if (!Number.isFinite(value)) return 3;
	return Math.max(1, Math.min(Math.trunc(value), 6));
}

function getInitials(fullName: string | null, email: string | null): string {
	const source = (fullName || '').trim() || (email || '').trim();
	if (!source) return 'FA';

	const nameParts = source.split(/[.\s_-]+/).filter(Boolean);
	if (nameParts.length >= 2) {
		return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
	}

	return source.slice(0, 2).toUpperCase();
}

function buildQuote(content: string | null, title: string | null, skuName: string): string {
	const fromContent = (content || '').trim();
	if (fromContent) return fromContent;

	const fromTitle = (title || '').trim();
	if (fromTitle) return fromTitle;

	return `Completed purchase for ${skuName}.`;
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const limitParam = Number(url.searchParams.get('limit') || '3');
		const limit = clampLimit(limitParam);

		const reviews = await prisma.review.findMany({
			where: {
				status: 'published',
				OR: [{ content: { not: null } }, { title: { not: null } }]
			},
			orderBy: {
				createdAt: 'desc'
			},
			take: limit,
			include: {
				user: {
					select: {
						id: true,
						fullName: true,
						email: true
					}
				},
				category: {
					select: {
						name: true
					}
				},
				orderItem: {
					select: {
						productName: true
					}
				}
			}
		});

		const mapped = await Promise.all(
			reviews.map(async (review) => {
				const orderCount = await prisma.order.count({
					where: {
						userId: review.userId,
						status: { in: ['completed', 'paid'] }
					}
				});

				const rating = Math.max(1, Math.min(5, review.rating || 5));
				const skuName =
					(review.orderItem?.productName || '').trim() || review.category?.name || 'Account';
				const orderCountLabel = Math.max(orderCount, 1);

				return {
					id: review.id,
					buyerType: `${skuName} buyer`,
					rating,
					quote: buildQuote(review.content, review.title, skuName),
					initials: getInitials(review.user.fullName, review.user.email),
					customerLabel: orderCount > 1 ? 'Returning customer' : 'New customer',
					sku: `${skuName} · ×${orderCountLabel} ${orderCountLabel === 1 ? 'order' : 'orders'}`
				};
			})
		);

		return json({ data: mapped, error: null });
	} catch (error) {
		console.error('Failed to load featured testimonials:', error);
		return json({ data: [], error: 'Failed to load testimonials' }, { status: 500 });
	}
};
