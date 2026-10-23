import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { applyBoostSupportAction, BoostSupportError } from '$lib/server/boosting-support';
import type { RequestHandler } from './$types';

const uuid = (value: unknown): value is string =>
	typeof value === 'string' &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:orders:manage'))
		return json(
			{ success: false, error: 'You do not have permission to manage this order.' },
			{ status: 403 }
		);
	if (request.headers.get('origin') !== url.origin)
		return json({ success: false, error: 'Invalid origin.' }, { status: 403 });
	const raw = await request.text();
	if (raw.length > 6000)
		return json({ success: false, error: 'This update is too long.' }, { status: 413 });
	let body;
	try {
		body = JSON.parse(raw);
	} catch {
		body = null;
	}
	if (
		!body ||
		!uuid(params.id) ||
		!uuid(body.operationId) ||
		(body.expectedRevision !== null && !uuid(body.expectedRevision)) ||
		!['request_link', 'message', 'confirm_delivery', 'confirm_failure', 'withdraw_link'].includes(
			body.action
		) ||
		typeof body.message !== 'string' ||
		body.message.trim().length < 5 ||
		body.message.length > 500
	)
		return json(
			{
				success: false,
				error: 'Choose an action and enter a clear customer message (5–500 characters).'
			},
			{ status: 400 }
		);
	try {
		const data = await prisma.$transaction(
			(tx) =>
				applyBoostSupportAction(tx, {
					itemId: params.id,
					actorId: locals.user!.id,
					operationId: body.operationId,
					expectedRevision: body.expectedRevision,
					action: body.action,
					message: body.message.trim(),
					confirmed: body.confirmed === true,
					evidence: typeof body.evidence === 'string' ? body.evidence.trim() : undefined,
					quantity: typeof body.quantity === 'number' ? body.quantity : undefined
				}),
			{ timeout: 15000 }
		);
		return json({ success: true, data });
	} catch (error) {
		if (error instanceof BoostSupportError)
			return json({ success: false, error: error.message }, { status: error.status });
		console.error('[boosting.support] action failed');
		return json(
			{
				success: false,
				error: 'The result could not be confirmed. Refresh the order before trying again.'
			},
			{ status: 500 }
		);
	}
};
