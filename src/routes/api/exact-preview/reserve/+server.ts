import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reserveExactPreviewAccount } from '$lib/services/exact-preview';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		if (!locals.user) {
			return json(
				{
					success: false,
					error: 'Login required to reserve exact accounts.'
				},
				{ status: 401 }
			);
		}

		const payload = await request.json();
		const tierId = String(payload?.tierId || '').trim();
		const accountId = String(payload?.accountId || '').trim();

		if (!tierId || !accountId) {
			return json(
				{ success: false, error: 'Tier ID and account ID are required.' },
				{ status: 400 }
			);
		}

		const data = await reserveExactPreviewAccount({
			tierId,
			accountId,
			userId: locals.user.id
		});

		return json({ success: true, data });
	} catch (error) {
		console.error('Failed to reserve exact account:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to reserve exact account.'
			},
			{ status: 400 }
		);
	}
};
