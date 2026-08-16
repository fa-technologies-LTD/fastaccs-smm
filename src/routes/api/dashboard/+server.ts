import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import { getDashboardInitialData } from '$lib/server/dashboard-load';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const user = locals.user;

		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Dashboard reads must not run global payment repair. That work remains on the
		// scheduled reconciliation job, so one buyer never waits on unrelated orders.
		const data = await getDashboardInitialData(user.id);

		return json({
			success: true,
			data
		});
	} catch (error) {
		const traceId = randomUUID();
		console.error('Dashboard API error:', { traceId, error });
		return json(
			{
				success: false,
				error: `Failed to load dashboard data. Reference: ${traceId}`
			},
			{ status: 500 }
		);
	}
};
