import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';

const VALID_STATUSES = ['pending', 'in_progress', 'completed'] as const;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (
		!locals.user ||
		!locals.adminContext ||
		!hasAdminPermission(locals.adminContext, 'admin:access')
	) {
		return json({ success: false, data: null, error: 'Unauthorized' }, { status: 401 });
	}

	const statusFilter = url.searchParams.get('status');
	const where = {
		boostTargetUrl: { not: null },
		order: {
			paymentStatus: 'paid' as const
		},
		...(statusFilter && VALID_STATUSES.includes(statusFilter as (typeof VALID_STATUSES)[number])
			? { boostFulfillmentStatus: statusFilter }
			: {})
	};

	const items = await prisma.orderItem.findMany({
		where,
		select: {
			id: true,
			productName: true,
			boostTargetUrl: true,
			boostQuantity: true,
			boostFulfillmentStatus: true,
			boostProviderReference: true,
			boostCompletedAt: true,
			createdAt: true,
			order: {
				select: {
					id: true,
					orderNumber: true,
					guestEmail: true,
					user: {
						select: {
							email: true,
							fullName: true
						}
					}
				}
			},
			category: {
				select: {
					metadata: true
				}
			}
		},
		orderBy: { createdAt: 'asc' }
	});

	return json({ success: true, data: items, error: null });
};
