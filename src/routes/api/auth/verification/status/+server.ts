import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVerificationStatus } from '$lib/services/email-verification';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const status = await getVerificationStatus({
		id: locals.user.id,
		email: locals.user.email,
		emailVerified: locals.user.emailVerified
	});

	return json({
		success: true,
		data: status
	});
};
