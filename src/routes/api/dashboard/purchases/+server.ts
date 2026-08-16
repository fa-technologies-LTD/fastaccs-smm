import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	DASHBOARD_PURCHASES_PAGE_SIZE,
	getDashboardPurchasesPage
} from '$lib/server/dashboard-purchases';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	const rawCursor = String(url.searchParams.get('cursor') || '').trim();
	if (rawCursor && !isUuid(rawCursor)) {
		return json({ success: false, error: 'Invalid purchases cursor.' }, { status: 400 });
	}
	const requestedLimit = Number(url.searchParams.get('limit') || DASHBOARD_PURCHASES_PAGE_SIZE);
	const page = await getDashboardPurchasesPage({
		userId: locals.user.id,
		cursor: rawCursor || null,
		limit: Number.isFinite(requestedLimit) ? requestedLimit : DASHBOARD_PURCHASES_PAGE_SIZE
	});

	return json({ success: true, data: page });
};
