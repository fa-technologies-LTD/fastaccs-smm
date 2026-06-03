import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

export interface InternalCronJob {
	name: string;
	path: string;
}

export interface InternalCronJobResult {
	name: string;
	path: string;
	status: number;
	ok: boolean;
	data?: unknown;
	error?: string;
}

export function isCronAuthorized(request: Request, source: string): boolean {
	if (dev) return true;

	const cronSecret = (env.CRON_SECRET || env.VERCEL_CRON_SECRET || '').trim();
	if (!cronSecret) {
		console.error(`[cron.${source}] CRON_SECRET is not configured.`);
		return false;
	}

	return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function dispatchInternalCronJobs(
	origin: string,
	jobs: InternalCronJob[]
): Promise<InternalCronJobResult[]> {
	const cronSecret = (env.CRON_SECRET || env.VERCEL_CRON_SECRET || '').trim();
	const authorizationHeaders: Record<string, string> = cronSecret
		? { authorization: `Bearer ${cronSecret}` }
		: {};

	const settledResults = await Promise.allSettled(
		jobs.map(async (job) => {
			const response = await fetch(new URL(job.path, origin), {
				headers: authorizationHeaders
			});
			const rawBody = await response.text();
			let data: unknown = rawBody;

			try {
				data = rawBody ? JSON.parse(rawBody) : null;
			} catch {
				// Keep the raw body for non-JSON failures.
			}

			return {
				name: job.name,
				path: job.path,
				status: response.status,
				ok: response.ok,
				data,
				error: response.ok ? undefined : `HTTP ${response.status}`
			};
		})
	);

	return settledResults.map((result, index) => {
		const job = jobs[index];
		if (result.status === 'fulfilled') return result.value;

		return {
			name: job.name,
			path: job.path,
			status: 0,
			ok: false,
			error: result.reason instanceof Error ? result.reason.message : 'Cron dispatch failed'
		};
	});
}
