import { prisma } from '$lib/prisma';
import {
	customerProofAccess,
	loadBoostProof,
	recordBoostProofViewed
} from '$lib/server/boost-delivery-proof';
import { privateReceiptDownloadUrl, receiptContentType } from '$lib/server/payout-receipts';
import type { RequestHandler } from './$types';

const notFound = () => new Response('No delivery proof for this order.', { status: 404 });

// GET /api/orders/[id]/boosting-proof/[itemId]: the delivery proof for the buyer, once, and only after
// a report they made on this item was closed. Someone else's order looks exactly like a missing proof.
export const GET: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.user) return new Response('Sign in to view this proof.', { status: 401 });
	const item = await prisma.orderItem.findFirst({
		where: { id: params.itemId, orderId: params.id, order: { userId: locals.user.id } },
		select: {
			id: true,
			orderId: true,
			boostFulfillment: { select: { complaints: { select: { status: true } } } }
		}
	});
	if (!item) return notFound();
	const state = await loadBoostProof(item.id);
	const access = customerProofAccess(state, item.boostFulfillment?.complaints ?? []);
	if (access === 'none' || !state.proof) return notFound();
	if (access === 'used')
		return new Response('You’ve already viewed this delivery proof.', { status: 410 });

	const url = privateReceiptDownloadUrl(state.proof);
	const upstream = url ? await fetch(url).catch(() => null) : null;
	if (!upstream?.ok || !upstream.body)
		return new Response('The proof could not be loaded. Try again shortly.', { status: 502 });
	// Counted as viewed only once the image is actually on its way to the buyer.
	if (access === 'available')
		await recordBoostProofViewed({
			orderId: item.orderId,
			orderItemId: item.id,
			publicId: state.proof.publicId,
			userId: locals.user.id
		});
	return new Response(upstream.body, {
		headers: {
			'content-type': receiptContentType(state.proof),
			'cache-control': 'private, no-store',
			'content-disposition': 'inline',
			'x-content-type-options': 'nosniff'
		}
	});
};
