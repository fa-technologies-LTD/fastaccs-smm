import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { sendLowStockAdminAlertIfNeeded } from '$lib/services/admin-alerts';

function isAuthorized(request: Request): boolean {
	if (dev) return true;

	const cronSecret = (env.CRON_SECRET || env.VERCEL_CRON_SECRET || '').trim();
	if (!cronSecret) {
		console.error('[cron.low-stock-alerts] CRON_SECRET is not configured.');
		return false;
	}

	const authorization = request.headers.get('authorization') || '';
	return authorization === `Bearer ${cronSecret}`;
}

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorized(request)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const result = await sendLowStockAdminAlertIfNeeded('cron_low_stock');
		return json({
			success: true,
			data: result
		});
	} catch (error) {
		console.error('[cron.low-stock-alerts] failed:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Low-stock cron run failed'
			},
			{ status: 500 }
		);
	}
};
