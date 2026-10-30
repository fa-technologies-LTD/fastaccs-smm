import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import {
	privateReceiptDownloadUrl,
	receiptContentType,
	receiptFromMetadata
} from '$lib/server/payout-receipts';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const notFound = () => new Response('Receipt not found', { status: 404 });

// GET /api/payouts/[id]/receipt: the payment receipt for one payout, shown only to the affiliate
// who was paid and to admins who manage affiliates. The image itself is private in Cloudinary.
export const GET: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.user) return new Response('Sign in to view this receipt', { status: 401 });
	const id = String(params.id || '');
	if (!isUuid(id)) return notFound();

	const payout = await prisma.walletTransaction.findUnique({
		where: { id },
		select: { userId: true, type: true, metadata: true }
	});
	const allowed =
		payout?.type === 'affiliate_payout' &&
		(payout.userId === locals.user.id ||
			hasAdminPermission(locals.adminContext, 'admin:affiliates:manage'));
	// Someone else's payout looks exactly like a missing one.
	if (!payout || !allowed) return notFound();
	const receipt = receiptFromMetadata(payout.metadata);
	const url = receipt ? privateReceiptDownloadUrl(receipt) : null;
	if (!receipt || !url) return notFound();

	const upstream = await fetch(url).catch(() => null);
	if (!upstream?.ok || !upstream.body) {
		return new Response('The receipt could not be loaded. Try again shortly.', { status: 502 });
	}
	return new Response(upstream.body, {
		headers: {
			'content-type': receiptContentType(receipt),
			'cache-control': 'private, no-store',
			'content-disposition': 'inline',
			'x-content-type-options': 'nosniff'
		}
	});
};
