import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';
import { addBoostProof, loadBoostProof } from '$lib/server/boost-delivery-proof';
import {
	privateReceiptDownloadUrl,
	RECEIPT_CONTENT_TYPES,
	RECEIPT_MAX_BYTES,
	receiptContentType
} from '$lib/server/payout-receipts';
import type { RequestHandler } from './$types';

const uuid = (value: unknown): value is string =>
	typeof value === 'string' &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const canManage = (locals: App.Locals) =>
	Boolean(locals.user) && hasAdminPermission(locals.adminContext, 'admin:orders:manage');

// POST /api/admin/boosting-orders/[itemId]/proof  (multipart "file")
// Keeps a delivery screenshot for a paid Boosting item. Optional; a newer upload replaces the older one.
export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	if (!canManage(locals))
		return json(
			{ success: false, error: 'You do not have permission to manage this order.' },
			{ status: 403 }
		);
	if (request.headers.get('origin') !== url.origin)
		return json({ success: false, error: 'Invalid origin.' }, { status: 403 });
	if (!uuid(params.id)) return json({ success: false, error: 'Invalid item.' }, { status: 400 });

	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File) || file.size <= 0)
		return json({ success: false, error: 'Choose a screenshot.' }, { status: 400 });
	if (!RECEIPT_CONTENT_TYPES.has(file.type))
		return json({ success: false, error: 'Use a JPG, PNG or WEBP image.' }, { status: 400 });
	if (file.size > RECEIPT_MAX_BYTES)
		return json({ success: false, error: 'The image is larger than 5MB.' }, { status: 400 });

	const item = await prisma.orderItem.findUnique({
		where: { id: params.id },
		select: {
			id: true,
			orderId: true,
			boostTargetUrl: true,
			order: { select: { status: true, paymentStatus: true } }
		}
	});
	if (!item?.boostTargetUrl)
		return json({ success: false, error: 'Boosting item not found.' }, { status: 404 });
	if (!isOrderPaymentConfirmed(item.order))
		return json(
			{ success: false, error: 'Only paid Boosting orders take delivery proof.' },
			{ status: 409 }
		);

	try {
		const proof = await addBoostProof({
			orderId: item.orderId,
			orderItemId: item.id,
			file,
			actorUserId: (locals.user as { id: string }).id
		});
		return json({ success: true, proof: { uploadedAt: proof.uploadedAt } });
	} catch (error) {
		console.error('[boosting.proof] upload failed:', (error as Error).message);
		return json({ success: false, error: 'The screenshot could not be saved.' }, { status: 502 });
	}
};

// GET /api/admin/boosting-orders/[itemId]/proof: the current proof, for admins only.
export const GET: RequestHandler = async ({ params, locals, fetch }) => {
	if (!canManage(locals)) return new Response('Not found', { status: 404 });
	if (!uuid(params.id)) return new Response('Not found', { status: 404 });
	const state = await loadBoostProof(params.id);
	const url = state.proof && !state.deletedAt ? privateReceiptDownloadUrl(state.proof) : null;
	if (!state.proof || !url) return new Response('No delivery proof', { status: 404 });
	const upstream = await fetch(url).catch(() => null);
	if (!upstream?.ok || !upstream.body)
		return new Response('The proof could not be loaded. Try again shortly.', { status: 502 });
	return new Response(upstream.body, {
		headers: {
			'content-type': receiptContentType(state.proof),
			'cache-control': 'private, no-store',
			'content-disposition': 'inline',
			'x-content-type-options': 'nosniff'
		}
	});
};
