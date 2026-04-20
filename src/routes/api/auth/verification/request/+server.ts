import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureVerificationCode } from '$lib/services/email-verification';

interface VerificationRequestPayload {
	resend?: unknown;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as VerificationRequestPayload;
	const resend = body.resend === true;

	const result = await ensureVerificationCode(
		{
			id: locals.user.id,
			email: locals.user.email,
			emailVerified: locals.user.emailVerified,
			fullName: locals.user.fullName || null
		},
		{ forceResend: resend }
	);

	if (!result.success) {
		return json(
			{
				success: false,
				error: result.error || 'Failed to send verification code.',
				rateLimited: result.rateLimited || false,
				retryAfterSeconds: result.retryAfterSeconds || 0
			},
			{ status: result.rateLimited ? 429 : 400 }
		);
	}

	return json({
		success: true,
		alreadyActive: result.alreadyActive || false,
		retryAfterSeconds: result.retryAfterSeconds || 0,
		requestsRemaining: result.requestsRemaining ?? null
	});
};
