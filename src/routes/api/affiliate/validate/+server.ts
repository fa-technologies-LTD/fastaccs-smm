import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateAffiliateCode } from '$lib/services/affiliate';

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');

	if (!code) {
		return json({ valid: false, error: 'Code parameter is required' }, { status: 400 });
	}

	const result = await validateAffiliateCode(code);

	return json(result);
};
