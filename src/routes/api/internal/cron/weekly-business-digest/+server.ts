import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendWeeklyBusinessDigest } from '$lib/services/weekly-business-digest';

function isAuthorized(request: Request): boolean {
	if (dev) return true;
	const cronSecret = (env.CRON_SECRET || env.VERCEL_CRON_SECRET || '').trim();
	if (!cronSecret) {
		console.error('[cron.weekly-business-digest] CRON_SECRET is not configured.');
		return false;
	}
	return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorized(request)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const result = await sendWeeklyBusinessDigest();
		return json({ success: true, data: result });
	} catch (error) {
		console.error('[cron.weekly-business-digest] failed:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Weekly digest cron run failed'
			},
			{ status: 500 }
		);
	}
};
