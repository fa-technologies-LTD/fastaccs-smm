import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import type { Prisma } from '@prisma/client';
import { sendAffiliatePayoutStatusEmailIfNeeded } from '$lib/services/affiliate-payout-email';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { createAdminAuditLog } from '$lib/services/admin-audit';
import { getAffiliateMaximumPayable } from '$lib/services/affiliate';
import { recordAffiliateEvent } from '$lib/services/affiliate-events';
import { decryptAffiliateBankDetails } from '$lib/services/affiliate-payout-details';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:affiliates:manage')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	const actorUserId = locals.user.id;

	const { id } = params;

	if (!id) {
		return json({ success: false, error: 'Affiliate user ID is required' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const action = String(body?.action || '')
			.trim()
			.toLowerCase();
		const transactionId = String(body?.transactionId || '').trim();
		const notes = String(body?.notes || '').trim().slice(0, 1_000);
		const payoutReference = String(body?.payoutReference || '').trim().slice(0, 200);

		if (!transactionId || !isUuid(transactionId)) {
			return json({ success: false, error: 'transactionId is required' }, { status: 400 });
		}

		const nextStatusMap: Record<string, 'paid' | 'reversed' | 'under_review' | null> = {
			mark_paid: 'paid',
			mark_reversed: 'reversed',
			mark_under_review: 'under_review'
		};
		const nextStatus = nextStatusMap[action] || null;
		if (!nextStatus) {
			return json(
				{ success: false, error: 'action must be mark_paid, mark_reversed, or mark_under_review' },
				{ status: 400 }
			);
		}
		if (nextStatus === 'paid' && !payoutReference) {
			return json(
				{ success: false, error: 'A bank transfer reference is required before marking paid.' },
				{ status: 400 }
			);
		}
		if (nextStatus === 'reversed' && !notes) {
			return json(
				{ success: false, error: 'A reason is required before reversing a payout.' },
				{ status: 400 }
			);
		}

		const transition = await prisma.$transaction(async (tx) => {
			// Serialize admin actions so two admins cannot both finalize the same payout
			// from a stale screen with conflicting outcomes.
			await tx.$queryRaw`SELECT id FROM wallet_transactions WHERE id = ${transactionId}::uuid FOR UPDATE`;

			const target = await tx.walletTransaction.findFirst({
				where: { id: transactionId, userId: id, type: 'affiliate_payout' },
				select: { id: true, status: true, amount: true, metadata: true, updatedAt: true }
			});
			if (!target) return { outcome: 'not_found' as const };

			const previousStatus = String(target.status || '').toLowerCase();
			if (previousStatus === nextStatus) {
				return { outcome: 'ok' as const, changed: false, previousStatus, updated: target };
			}
			if (!['requested', 'under_review'].includes(previousStatus)) {
				return { outcome: 'conflict' as const, previousStatus };
			}
			if (nextStatus === 'paid') {
				await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${id}::uuid FOR UPDATE`;
				const approvedBankDetails = await tx.affiliatePayoutDetails.findFirst({
					where: { userId: id, status: 'approved' },
					select: {
						userId: true,
						bankName: true,
						accountNumber: true,
						accountName: true,
						phone: true,
						feedback: true,
						encryptedPayload: true,
						encryptionKeyId: true,
						accountNumberLast4: true
					}
				});
				if (!approvedBankDetails) {
					return { outcome: 'bank_not_approved' as const, previousStatus };
				}
				try {
					decryptAffiliateBankDetails(approvedBankDetails);
				} catch {
					return { outcome: 'bank_unavailable' as const, previousStatus };
				}
				const maximumPayable = await getAffiliateMaximumPayable(id, tx);
				if (Number(target.amount || 0) > maximumPayable + 0.01) {
					return {
						outcome: 'stale_entitlement' as const,
						previousStatus,
						requestedAmount: Number(target.amount || 0),
						maximumPayable
					};
				}
			}

			const existingMeta =
				target.metadata && typeof target.metadata === 'object' && !Array.isArray(target.metadata)
					? (target.metadata as Record<string, unknown>)
					: {};
			const updatedMeta: Record<string, unknown> = {
				...existingMeta,
				lifecycleStatus: nextStatus,
				lastAdminAction: action,
				lastAdminActionBy: actorUserId,
				lastAdminActionAt: new Date().toISOString()
			};
			if (notes) updatedMeta.adminNotes = notes;
			if (payoutReference) updatedMeta.bankTransferReference = payoutReference;

			const updated = await tx.walletTransaction.update({
				where: { id: target.id },
				data: {
					status: nextStatus,
					metadata: updatedMeta as Prisma.InputJsonValue
				},
				select: { id: true, status: true, amount: true, updatedAt: true }
			});
			await recordAffiliateEvent(
				{
					type: `payout_${nextStatus}`,
					dedupeKey: `affiliate:payout:${target.id}:${nextStatus}`,
					affiliateUserId: id,
					source: 'admin',
					metadata: {
						payoutTransactionId: target.id,
						amount: Number(target.amount || 0),
						actorUserId
					}
				},
				tx
			);
			await createAdminAuditLog(
				{
					actorUserId,
					targetUserId: id,
					action: 'affiliate_payout_status_changed',
					resourceType: 'affiliate_payout',
					resourceId: updated.id,
					description: `Affiliate payout changed from ${previousStatus} to ${updated.status}`,
					metadata: {
						amount: Number(updated.amount || 0),
						previousStatus,
						nextStatus: updated.status,
						payoutReference: payoutReference || null,
						notes: notes || null
					},
					required: true
				},
				tx
			);
			return { outcome: 'ok' as const, changed: true, previousStatus, updated };
		});

		if (transition.outcome === 'not_found') {
			return json({ success: false, error: 'Payout request not found' }, { status: 404 });
		}
		if (transition.outcome === 'conflict') {
			return json(
				{
					success: false,
					error: `Payout request cannot transition from ${transition.previousStatus}. Refresh before taking another action.`
				},
				{ status: 409 }
			);
		}
		if (transition.outcome === 'bank_not_approved') {
			return json(
				{
					success: false,
					error: 'Approved bank details are required before a payout can be marked paid.'
				},
				{ status: 409 }
			);
		}
		if (transition.outcome === 'bank_unavailable') {
			return json(
				{
					success: false,
					error: 'The approved bank details cannot be verified securely. Review them before paying.'
				},
				{ status: 409 }
			);
		}
		if (transition.outcome === 'stale_entitlement') {
			return json(
				{
					success: false,
					error: `This request is now higher than the affiliate's available earnings (₦${transition.maximumPayable.toLocaleString()}). Reverse it and ask the affiliate to submit a new request.`
				},
				{ status: 409 }
			);
		}

		const updated = transition.updated;
		if (transition.changed) {
			await sendAffiliatePayoutStatusEmailIfNeeded({
				payoutTransactionId: updated.id,
				expectedStatus: updated.status
			}).catch((error) => console.error('Failed to send affiliate payout status email:', error));
		}

		return json({
			success: true,
			alreadyApplied: !transition.changed,
			payout: {
				id: updated.id,
				status: updated.status,
				amount: Number(updated.amount || 0),
				updatedAt: updated.updatedAt
			}
		});
	} catch (error) {
		console.error('Error updating affiliate payout request:', error);
		return json({ success: false, error: 'Failed to update payout request' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:affiliates:manage')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;

	if (!id) {
		return json({ success: false, error: 'Affiliate user ID is required' }, { status: 400 });
	}

	try {
		const payouts = await prisma.walletTransaction.findMany({
			where: {
				userId: id,
				type: 'affiliate_payout'
			},
			orderBy: { createdAt: 'desc' }
		});

		return json({
			success: true,
			payouts: payouts.map((p) => ({
				id: p.id,
				amount: Number(p.amount),
				status: p.status,
				description: p.description,
				reference: p.reference,
				metadata: p.metadata,
				createdAt: p.createdAt
			}))
		});
	} catch (error) {
		console.error('Error fetching payouts:', error);
		return json({ success: false, error: 'Failed to fetch payouts' }, { status: 500 });
	}
};
