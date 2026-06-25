import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { serverCache } from '$lib/helpers/cache';
import { CONFIRMED_PAYMENT_STATUSES } from '$lib/helpers/buyer-order-visibility';

const CACHE_KEY = 'homepage:completed-orders-7d';
const CACHE_TTL_MS = 10 * 60 * 1000;

export const GET: RequestHandler = async ({ setHeaders }) => {
	// The in-memory serverCache below only helps within a single warm serverless
	// instance — on Vercel, cold starts and concurrent instances each have their
	// own copy. The CDN/browser cache (matched to the same 10-minute freshness
	// window) is what actually avoids repeat DB hits across instances.
	setHeaders({ 'Cache-Control': 'public, max-age=600, stale-while-revalidate=1800' });

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
