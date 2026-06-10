import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import type { Prisma } from '@prisma/client';
import { sendAffiliatePayoutStatusEmailIfNeeded } from '$lib/services/affiliate-payout-email';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

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
		const notes = String(body?.notes || '').trim();

		if (!transactionId) {
			return json({ success: false, error: 'transactionId is required' }, { status: 400 });
		}

		const target = await prisma.walletTransaction.findFirst({
			where: {
				id: transactionId,
				userId: id,
				type: 'affiliate_payout'
			},
			select: {
				id: true,
				status: true,
				metadata: true
			}
		});

		if (!target) {
			return json({ success: false, error: 'Payout request not found' }, { status: 404 });
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

		if (!['requested', 'under_review'].includes(String(target.status || '').toLowerCase())) {
			return json(
				{ success: false, error: `Payout request cannot transition from ${target.status}.` },
				{ status: 400 }
			);
		}

		const existingMeta =
			target.metadata && typeof target.metadata === 'object' && !Array.isArray(target.metadata)
				? (target.metadata as Record<string, unknown>)
				: {};
		const updatedMeta: Record<string, unknown> = {
			...existingMeta,
			lifecycleStatus: nextStatus,
			lastAdminAction: action,
			lastAdminActionBy: locals.user.id,
			lastAdminActionAt: new Date().toISOString()
		};
		if (notes) {
			updatedMeta.adminNotes = notes;
		}

		const updated = await prisma.walletTransaction.update({
			where: { id: target.id },
			data: {
				status: nextStatus,
				metadata: updatedMeta as Prisma.InputJsonValue
			},
			select: {
				id: true,
				status: true,
				amount: true,
				updatedAt: true
			}
		});
		await sendAffiliatePayoutStatusEmailIfNeeded({
			payoutTransactionId: updated.id,
			expectedStatus: updated.status
		}).catch((emailError) => {
			console.error('Failed to send affiliate payout status email:', emailError);
		});

		return json({
			success: true,
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
	if (!locals.user || locals.user.userType !== 'ADMIN') {
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
