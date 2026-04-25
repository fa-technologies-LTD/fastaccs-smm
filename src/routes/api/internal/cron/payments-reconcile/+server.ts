import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { reconcilePendingPayments } from '$lib/services/payment-reconciliation';

function isAuthorized(request: Request): boolean {
	if (dev) return true;

	const cronSecret = (env.CRON_SECRET || env.VERCEL_CRON_SECRET || '').trim();
	if (!cronSecret) {
		console.error('[cron.payments-reconcile] CRON_SECRET is not configured.');
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
		const summary = await reconcilePendingPayments({ limit: 50 });
		return json({
			success: true,
			data: summary
		});
	} catch (error) {
		console.error('[cron.payments-reconcile] failed:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Reconciliation failed'
			},
			{ status: 500 }
		);
	}
};
