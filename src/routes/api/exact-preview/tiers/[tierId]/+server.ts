import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listExactPreviewAccounts } from '$lib/services/exact-preview';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		if (!locals.user) {
			return json(
				{
					success: false,
					error: 'Login required to view exact account previews.'
				},
				{ status: 401 }
			);
		}

		const tierId = String(params.tierId || '').trim();
		if (!tierId) {
			return json({ success: false, error: 'Tier ID is required.' }, { status: 400 });
		}

		const data = await listExactPreviewAccounts(tierId, locals.user.id);
		return json({ success: true, data });
	} catch (error) {
		console.error('Failed to load exact account previews:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to load exact account previews.'
			},
			{ status: 500 }
		);
	}
};
