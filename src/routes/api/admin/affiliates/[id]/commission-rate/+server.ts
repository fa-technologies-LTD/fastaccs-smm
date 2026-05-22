import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;

	if (!id) {
		return json({ success: false, error: 'Affiliate ID is required' }, { status: 400 });
	}

	void request;
	return json(
		{
			success: false,
			error:
				'Commission-rate editing is retired. Configure affiliate discounts from Store-Credit and tier rules.'
		},
		{ status: 410 }
	);
};
