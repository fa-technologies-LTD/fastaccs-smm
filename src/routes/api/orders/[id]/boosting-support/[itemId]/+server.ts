import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { applyBoostSupportAction, BoostSupportError } from '$lib/server/boosting-support';
import type { RequestHandler } from './$types';

const uuid = (value: unknown): value is string =>
	typeof value === 'string' &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	if (!locals.user)
		return json({ success: false, error: 'Sign in to reply to support.' }, { status: 401 });
	if (request.headers.get('origin') !== url.origin)
		return json({ success: false, error: 'Invalid origin.' }, { status: 403 });
	const raw = await request.text();
	if (raw.length > 6000)
		return json({ success: false, error: 'This reply is too long.' }, { status: 413 });
	let body;
	try {
		body = JSON.parse(raw);
	} catch {
		body = null;
	}
	if (
		!body ||
		!uuid(params.id) ||
		!uuid(params.itemId) ||
		!uuid(body.operationId) ||
		!uuid(body.requestId) ||
		!uuid(body.expectedRevision) ||
		typeof body.link !== 'string' ||
		body.link.length > 2048 ||
		(body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500))
	)
		return json(
			{
				success: false,
				error: 'Please send a valid link and refresh the order if its request has changed.'
			},
			{ status: 400 }
		);
	try {
		const data = await prisma.$transaction(
			(tx) =>
				applyBoostSupportAction(tx, {
					itemId: params.itemId,
					orderId: params.id,
					actorId: locals.user!.id,
					operationId: body.operationId,
					expectedRevision: body.expectedRevision,
					requestId: body.requestId,
					action: 'reply',
					message: body.note?.trim() ?? '',
					link: body.link.trim()
				}),
			{ timeout: 15000 }
		);
		return json({ success: true, data });
	} catch (error) {
		if (error instanceof BoostSupportError)
			return json({ success: false, error: error.message }, { status: error.status });
		console.error('[boosting.support] reply failed');
		return json(
			{ success: false, error: 'Your reply could not be confirmed. Refresh before trying again.' },
			{ status: 500 }
		);
	}
};
