import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

function cleanString(value: unknown, maxLength: number): string {
	return String(value || '')
		.trim()
		.slice(0, maxLength);
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const submission = await prisma.affiliatePayoutDetails.findUnique({
		where: { userId: locals.user.id },
		select: {
			bankName: true,
			accountNumber: true,
			accountName: true,
			phone: true,
			feedback: true,
			status: true,
			rejectionReason: true,
			createdAt: true,
			updatedAt: true
		}
	});

	return json({ success: true, data: submission });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const payload = await request.json().catch(() => ({}));
	const bankName = cleanString(payload?.bankName, 100);
	const accountNumber = cleanString(payload?.accountNumber, 32);
	const accountName = cleanString(payload?.accountName, 150);
	const phone = cleanString(payload?.phone, 32);
	const feedback = cleanString(payload?.feedback, 2000);

	if (!bankName || !accountNumber || !accountName || !phone) {
		return json(
			{ success: false, error: 'Bank name, account number, account name, and phone are required.' },
			{ status: 400 }
		);
	}

	const submission = await prisma.affiliatePayoutDetails.upsert({
		where: { userId: locals.user.id },
		update: {
			bankName,
			accountNumber,
			accountName,
			phone,
			feedback: feedback || null,
			status: 'pending',
			rejectionReason: null,
			reviewedAt: null,
			reviewedBy: null
		},
		create: {
			userId: locals.user.id,
			bankName,
			accountNumber,
			accountName,
			phone,
			feedback: feedback || null
		},
		select: { id: true, status: true }
	});

	return json({
		success: true,
		message: 'Your bank details have been submitted for review.',
		data: submission
	});
};
