import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { createAdminAuditLog } from '$lib/services/admin-audit';
import {
	decryptAffiliateBankDetails,
	maskAffiliateAccountNumber
} from '$lib/services/affiliate-payout-details';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:affiliates:manage')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;
	if (!id) {
		return json({ success: false, error: 'Affiliate user ID is required' }, { status: 400 });
	}

	const submission = await prisma.affiliatePayoutDetails.findUnique({ where: { userId: id } });
	if (!submission) return json({ success: true, submission: null });
	let details;
	try {
		details = decryptAffiliateBankDetails(submission);
	} catch (error) {
		console.error('Unable to decrypt affiliate bank details for admin:', error);
		return json(
			{ success: false, error: 'Bank details are temporarily unavailable.' },
			{ status: 503 }
		);
	}
	try {
		await createAdminAuditLog({
			actorUserId: locals.user.id,
			targetUserId: id,
			action: 'affiliate_bank_details_viewed',
			resourceType: 'affiliate_payout_details',
			resourceId: submission.id,
			description: 'Affiliate payout bank details viewed',
			metadata: { accountNumber: maskAffiliateAccountNumber(details.accountNumber) },
			required: true
		});
	} catch (error) {
		console.error('Unable to audit affiliate bank-details reveal:', error);
		return json(
			{ success: false, error: 'Bank details cannot be revealed safely right now.' },
			{ status: 503 }
		);
	}

	return json({
		success: true,
		submission: {
			...details,
			id: submission.id,
			status: submission.status,
			rejectionReason: submission.rejectionReason,
			reviewedAt: submission.reviewedAt,
			reviewedBy: submission.reviewedBy,
			createdAt: submission.createdAt,
			updatedAt: submission.updatedAt
		}
	});
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:affiliates:manage')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	const actorUserId = locals.user.id;

	const { id } = params;
	if (!id) {
		return json({ success: false, error: 'Affiliate user ID is required' }, { status: 400 });
	}

	const body = await request.json().catch(() => ({}));
	const action = String(body?.action || '')
		.trim()
		.toLowerCase();
	const reason = String(body?.reason || '').trim();

	if (!['approve', 'reject'].includes(action)) {
		return json({ success: false, error: 'action must be approve or reject' }, { status: 400 });
	}

	if (action === 'reject' && !reason) {
		return json({ success: false, error: 'A rejection reason is required.' }, { status: 400 });
	}

	const nextStatus = action === 'approve' ? 'approved' : 'rejected';
	const transition = await prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM affiliate_payout_details WHERE user_id = ${id}::uuid FOR UPDATE`;
		const existing = await tx.affiliatePayoutDetails.findUnique({ where: { userId: id } });
		if (!existing) return { outcome: 'not_found' as const };
		if (existing.status === nextStatus) {
			return { outcome: 'ok' as const, changed: false, existing, updated: existing };
		}
		if (existing.status !== 'pending') {
			return { outcome: 'conflict' as const, existing };
		}
		const updated = await tx.affiliatePayoutDetails.update({
			where: { userId: id },
			data: {
				status: nextStatus,
				rejectionReason: action === 'reject' ? reason : null,
				reviewedAt: new Date(),
				reviewedBy: actorUserId
			}
		});
		await tx.notification.create({
			data: {
				userId: id,
				type: 'affiliate_bank_details',
				title: action === 'approve' ? 'Bank details approved' : 'Bank details rejected',
				message:
					action === 'approve'
						? 'Your bank details have been approved. You can now request payouts.'
						: `Your bank details were rejected: ${reason}`
			}
		});
		await createAdminAuditLog(
			{
				actorUserId,
				targetUserId: id,
				action: `affiliate_bank_details_${nextStatus}`,
				resourceType: 'affiliate_payout_details',
				resourceId: updated.id,
				description: `Affiliate bank details changed from ${existing.status} to ${nextStatus}`,
				metadata: { previousStatus: existing.status, nextStatus, reason: reason || null },
				required: true
			},
			tx
		);
		return { outcome: 'ok' as const, changed: true, existing, updated };
	});

	if (transition.outcome === 'not_found') {
		return json({ success: false, error: 'No bank details submission found' }, { status: 404 });
	}
	if (transition.outcome === 'conflict') {
		return json(
			{ success: false, error: `Submission cannot transition from ${transition.existing.status}.` },
			{ status: 409 }
		);
	}
	const updated = transition.updated;
	return json({
		success: true,
		alreadyApplied: !transition.changed,
		submission: { id: updated.id, status: updated.status, updatedAt: updated.updatedAt }
	});
};
