import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { createAdminAuditLog } from '$lib/services/admin-audit';
import {
	RECEIPT_CONTENT_TYPES,
	RECEIPT_MAX_BYTES,
	uploadPayoutReceipt
} from '$lib/server/payout-receipts';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// POST /api/admin/affiliates/[id]/payouts/[transactionId]/receipt  (multipart "file")
// Attach proof of payment to a paid payout. The affiliate can then view it from their store-credit history.
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:affiliates:manage')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	const affiliateId = String(params.id || '');
	const transactionId = String(params.transactionId || '');
	if (!isUuid(affiliateId) || !isUuid(transactionId)) {
		return json({ success: false, error: 'Invalid payout' }, { status: 400 });
	}

	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File) || file.size <= 0) {
		return json({ success: false, error: 'Choose a receipt image.' }, { status: 400 });
	}
	if (!RECEIPT_CONTENT_TYPES.has(file.type)) {
		return json({ success: false, error: 'Use a JPG, PNG or WEBP image.' }, { status: 400 });
	}
	if (file.size > RECEIPT_MAX_BYTES) {
		return json({ success: false, error: 'The image is larger than 5MB.' }, { status: 400 });
	}

	const payout = await prisma.walletTransaction.findFirst({
		where: { id: transactionId, userId: affiliateId, type: 'affiliate_payout' },
		select: { id: true, status: true, amount: true }
	});
	if (!payout) return json({ success: false, error: 'Payout not found' }, { status: 404 });
	if (String(payout.status).toLowerCase() !== 'paid') {
		return json(
			{ success: false, error: 'Mark the payout paid before adding its receipt.' },
			{ status: 409 }
		);
	}

	let receipt;
	try {
		receipt = await uploadPayoutReceipt(file, locals.user.id);
	} catch (error) {
		console.error('payout receipt upload failed:', error);
		return json({ success: false, error: 'The receipt could not be uploaded.' }, { status: 502 });
	}

	const actorUserId = locals.user.id;
	await prisma.$transaction(async (tx) => {
		// Same row lock as payout status changes, so neither overwrites the other's metadata.
		await tx.$queryRaw`SELECT id FROM wallet_transactions WHERE id = ${transactionId}::uuid FOR UPDATE`;
		const live = await tx.walletTransaction.findUnique({
			where: { id: transactionId },
			select: { metadata: true }
		});
		const metadata =
			live?.metadata && typeof live.metadata === 'object' && !Array.isArray(live.metadata)
				? (live.metadata as Record<string, unknown>)
				: {};
		await tx.walletTransaction.update({
			where: { id: transactionId },
			data: { metadata: { ...metadata, receipt: { ...receipt } } as Prisma.InputJsonValue }
		});
		await tx.notification.create({
			data: {
				userId: affiliateId,
				type: 'affiliate_store_credit',
				title: 'Payment receipt added',
				message: `The receipt for your ₦${Number(payout.amount || 0).toLocaleString('en-NG')} payout is in your store-credit history.`
			}
		});
		await createAdminAuditLog(
			{
				actorUserId,
				targetUserId: affiliateId,
				action: 'affiliate_payout_receipt_added',
				resourceType: 'affiliate_payout',
				resourceId: transactionId,
				description: 'Payment receipt attached to a paid payout',
				metadata: { replaced: Boolean(metadata.receipt), bytes: receipt.bytes }
			},
			tx
		);
	});

	return json({ success: true, receipt: { uploadedAt: receipt.uploadedAt } });
};
