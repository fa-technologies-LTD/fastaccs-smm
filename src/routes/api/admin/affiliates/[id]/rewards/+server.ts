import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { createAdminAuditLog } from '$lib/services/admin-audit';
import { recordAffiliateEvent } from '$lib/services/affiliate-events';
import { reconcileSuperMonthlyTierForActivation } from '$lib/services/affiliate';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:affiliates:manage')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	const actorUserId = locals.user.id;
	const affiliateUserId = String(params.id || '').trim();
	const body = await request.json().catch(() => ({}));
	const transactionId = String(body?.transactionId || '').trim();
	const action = String(body?.action || '')
		.trim()
		.toLowerCase();
	const reason = String(body?.reason || '')
		.trim()
		.slice(0, 1_000);

	if (!affiliateUserId || !isUuid(transactionId)) {
		return json(
			{ success: false, error: 'A valid reward transaction is required.' },
			{ status: 400 }
		);
	}
	if (!['approve', 'reject'].includes(action)) {
		return json({ success: false, error: 'action must be approve or reject' }, { status: 400 });
	}
	if (action === 'reject' && !reason) {
		return json({ success: false, error: 'A rejection reason is required.' }, { status: 400 });
	}

	const result = await prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM wallet_transactions WHERE id = ${transactionId}::uuid FOR UPDATE`;
		const reward = await tx.walletTransaction.findFirst({
			where: { id: transactionId, userId: affiliateUserId, type: 'affiliate_credit' },
			select: { id: true, status: true, amount: true, metadata: true, createdAt: true }
		});
		if (!reward) return { outcome: 'not_found' as const };
		const metadata =
			reward.metadata && typeof reward.metadata === 'object' && !Array.isArray(reward.metadata)
				? (reward.metadata as Record<string, unknown>)
				: {};
		if (reward.status !== 'pending' || metadata.suspectedSelfReferral !== true) {
			return { outcome: 'conflict' as const, status: reward.status };
		}

		const nextStatus = action === 'approve' ? 'pending' : 'reversed';
		const reviewedMetadata = {
			...metadata,
			suspectedSelfReferral: false,
			identityReview: {
				decision: action,
				reason: reason || null,
				reviewedBy: actorUserId,
				reviewedAt: new Date().toISOString()
			},
			lifecycleStatus: nextStatus
		};
		const updated = await tx.walletTransaction.update({
			where: { id: reward.id },
			data: {
				status: nextStatus,
				metadata: reviewedMetadata as Prisma.InputJsonValue
			},
			select: { id: true, amount: true, status: true }
		});
		await recordAffiliateEvent(
			{
				type:
					action === 'approve'
						? 'reward_identity_review_approved'
						: 'reward_identity_review_rejected',
				dedupeKey: `affiliate:reward_identity_review:${reward.id}`,
				affiliateUserId,
				orderId: typeof metadata.orderId === 'string' ? metadata.orderId : null,
				source: 'admin',
				metadata: {
					rewardTransactionId: reward.id,
					amount: Number(reward.amount || 0),
					reason: reason || null
				}
			},
			tx
		);
		await tx.notification.create({
			data: {
				userId: affiliateUserId,
				type: 'affiliate_store_credit',
				title: action === 'approve' ? 'Reward review completed' : 'Reward not approved',
				message:
					action === 'approve'
						? 'A pending referral reward passed review and will follow the normal return-window process.'
						: 'A pending referral reward did not pass review and was cancelled.'
			}
		});
		await createAdminAuditLog(
			{
				actorUserId,
				targetUserId: affiliateUserId,
				action: `affiliate_reward_identity_${action}`,
				resourceType: 'affiliate_reward',
				resourceId: updated.id,
				description: `Flagged affiliate reward identity review: ${action}`,
				metadata: { amount: Number(updated.amount || 0), reason: reason || null },
				required: true
			},
			tx
		);
		return {
			outcome: 'ok' as const,
			updated,
			reconcileSuperMonthlyTier: action === 'approve' && metadata.kind === 'super_activation',
			activationCreatedAt: reward.createdAt
		};
	});

	if (result.outcome === 'not_found') {
		return json({ success: false, error: 'Reward not found.' }, { status: 404 });
	}
	if (result.outcome === 'conflict') {
		return json(
			{
				success: false,
				error: `This reward cannot be reviewed from ${result.status}. Refresh first.`
			},
			{ status: 409 }
		);
	}

	let monthlyTierReconciliationPending = false;
	if (result.reconcileSuperMonthlyTier) {
		try {
			await reconcileSuperMonthlyTierForActivation(affiliateUserId, result.activationCreatedAt);
		} catch (error) {
			// The approval itself is durable. The scheduled affiliate-integrity recovery
			// retries this independently idempotent monthly obligation.
			monthlyTierReconciliationPending = true;
			console.error('Failed to reconcile Super monthly tier after identity approval:', error);
		}
	}

	return json({
		success: true,
		reward: result.updated,
		monthlyTierReconciliationPending
	});
};
