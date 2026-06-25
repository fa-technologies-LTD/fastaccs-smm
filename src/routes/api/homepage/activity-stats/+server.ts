import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { serverCache, getCacheHeaders } from '$lib/helpers/cache';
import { CONFIRMED_PAYMENT_STATUSES } from '$lib/helpers/buyer-order-visibility';

const CACHE_KEY = 'homepage:completed-orders-7d';
const CACHE_TTL_MS = 10 * 60 * 1000;

export const GET: RequestHandler = async ({ setHeaders }) => {
	setHeaders(getCacheHeaders('dynamic'));

	const cached = serverCache.get<number>(CACHE_KEY, CACHE_TTL_MS);
	if (cached !== null) {
		return json({ success: true, data: { completedOrdersThisWeek: cached } });
	}

	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	const completedOrdersThisWeek = await prisma.order.count({
		where: {
			createdAt: { gte: sevenDaysAgo },
			paymentStatus: { in: [...CONFIRMED_PAYMENT_STATUSES] }
		}
	});

	serverCache.set(CACHE_KEY, completedOrdersThisWeek);

	return json({ success: true, data: { completedOrdersThisWeek } });
};
