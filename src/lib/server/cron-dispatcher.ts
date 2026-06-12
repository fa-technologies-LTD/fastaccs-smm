import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

export function isCronAuthorized(request: Request, source: string): boolean {
	if (dev) return true;

	const cronSecret = (env.CRON_SECRET || env.VERCEL_CRON_SECRET || '').trim();
	if (!cronSecret) {
		console.error(`[cron.${source}] CRON_SECRET is not configured.`);
		return false;
	}

	return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}
