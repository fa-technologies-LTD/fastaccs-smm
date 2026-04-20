import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyEmailCode } from '$lib/services/email-verification';

interface VerifyPayload {
	code?: unknown;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as VerifyPayload;
	const code = typeof body.code === 'string' ? body.code.trim() : '';

	if (!/^\d{6}$/.test(code)) {
		return json({ success: false, error: 'Enter the 6-digit verification code.' }, { status: 400 });
	}

	const result = await verifyEmailCode(
		{
			id: locals.user.id,
			email: locals.user.email,
			emailVerified: locals.user.emailVerified,
			fullName: locals.user.fullName || null
		},
		code
	);

	if (!result.success) {
		return json({ success: false, error: result.error || 'Verification failed.' }, { status: 400 });
	}

	return json({ success: true });
};
