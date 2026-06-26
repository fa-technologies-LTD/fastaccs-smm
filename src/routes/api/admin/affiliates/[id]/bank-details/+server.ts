import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;
	if (!id) {
		return json({ success: false, error: 'Affiliate user ID is required' }, { status: 400 });
	}

	const submission = await prisma.affiliatePayoutDetails.findUnique({
		where: { userId: id }
	});

	return json({ success: true, submission });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;
	if (!id) {
		return json({ success: false, error: 'Affiliate user ID is required' }, { status: 400 });
	}

	const body = await request.json().catch(() => ({}));
	const action = String(body?.action || '').trim().toLowerCase();
	const reason = String(body?.reason || '').trim();

	if (!['approve', 'reject'].includes(action)) {
		return json({ success: false, error: 'action must be approve or reject' }, { status: 400 });
	}

	if (action === 'reject' && !reason) {
		return json({ success: false, error: 'A rejection reason is required.' }, { status: 400 });
	}

	const existing = await prisma.affiliatePayoutDetails.findUnique({
		where: { userId: id }
	});

	if (!existing) {
		return json({ success: false, error: 'No bank details submission found' }, { status: 404 });
	}

	if (existing.status !== 'pending') {
		return json(
			{ success: false, error: `Submission cannot transition from ${existing.status}.` },
			{ status: 400 }
		);
	}

	const nextStatus = action === 'approve' ? 'approved' : 'rejected';

	const updated = await prisma.affiliatePayoutDetails.update({
		where: { userId: id },
		data: {
			status: nextStatus,
			rejectionReason: action === 'reject' ? reason : null,
			reviewedAt: new Date(),
			reviewedBy: locals.user.id
		}
	});

	await prisma.notification.create({
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

	return json({ success: true, submission: updated });
};
