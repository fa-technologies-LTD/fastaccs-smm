import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';

const uuid = (s: unknown): s is string =>
	typeof s === 'string' &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/** A customer-visible support message; does not change delivery, payment or supplier state. */
export const POST: RequestHandler = async ({ request, params, locals, url }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:orders:manage'))
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	if (request.headers.get('origin') !== url.origin)
		return json({ success: false, error: 'Invalid origin' }, { status: 403 });
	if (!uuid(params.id)) return json({ success: false, error: 'Invalid order ID' }, { status: 400 });
	const raw = await request.text();
	if (raw.length > 3000)
		return json({ success: false, error: 'Customer update is too long.' }, { status: 400 });
	let body;
	try {
		body = JSON.parse(raw);
	} catch {
		return json({ success: false, error: 'Invalid customer update.' }, { status: 400 });
	}
	if (
		!body ||
		typeof body.message !== 'string' ||
		!uuid(body.requestId) ||
		body.message.trim().length < 3 ||
		body.message.trim().length > 500
	)
		return json(
			{ success: false, error: 'Enter a customer update between 3 and 500 characters.' },
			{ status: 400 }
		);
	const message = body.message.trim();
	const outcome = await prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM orders WHERE id=${params.id}::uuid FOR UPDATE`;
		const order = await tx.order.findUnique({
			where: { id: params.id },
			select: { id: true, userId: true, orderType: true }
		});
		if (!order) return 'missing';
		if (order.orderType !== 'boosting') return 'wrong_product';
		if (!order.userId) return 'guest';
		const key = `support-update:${order.id}:${body.requestId.toLowerCase()}`;
		const prior = await tx.orderEvent.findUnique({
			where: { idempotencyKey: key },
			select: { description: true }
		});
		if (prior) return prior.description === message ? 'already_sent' : 'changed_request';
		await tx.orderEvent.create({
			data: {
				orderId: order.id,
				type: 'customer_support_update',
				source: 'admin',
				actorUserId: locals.user!.id,
				description: message,
				idempotencyKey: key
			}
		});
		await tx.notification.create({
			data: {
				userId: order.userId,
				orderId: order.id,
				type: 'boosting_issue',
				title: 'An update on your order',
				message
			}
		});
		return 'sent';
	});
	if (outcome === 'missing')
		return json({ success: false, error: 'Order not found.' }, { status: 404 });
	if (outcome === 'wrong_product')
		return json(
			{ success: false, error: 'Use this update for a Boosting order.' },
			{ status: 409 }
		);
	if (outcome === 'guest')
		return json(
			{
				success: false,
				error: 'No customer account to notify. Contact this guest through support.'
			},
			{ status: 409 }
		);
	if (outcome === 'changed_request')
		return json(
			{
				success: false,
				error: 'This update was already sent with different wording. Reload before sending another.'
			},
			{ status: 409 }
		);
	return json(
		{ success: true, alreadySent: outcome === 'already_sent' },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
