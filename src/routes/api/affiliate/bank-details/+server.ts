import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import {
	AffiliatePayoutEncryptionError,
	decryptAffiliateBankDetails,
	encryptAffiliateBankDetails
} from '$lib/services/affiliate-payout-details';

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
			userId: true,
			bankName: true,
			accountNumber: true,
			accountName: true,
			phone: true,
			feedback: true,
			encryptedPayload: true,
			encryptionKeyId: true,
			accountNumberLast4: true,
			status: true,
			rejectionReason: true,
			createdAt: true,
			updatedAt: true
		}
	});

	if (!submission) return json({ success: true, data: null });
	try {
		const details = decryptAffiliateBankDetails(submission);
		return json({
			success: true,
			data: {
				...details,
				status: submission.status,
				rejectionReason: submission.rejectionReason,
				createdAt: submission.createdAt,
				updatedAt: submission.updatedAt
			}
		});
	} catch (error) {
		console.error('Unable to read affiliate bank details:', error);
		return json(
			{ success: false, error: 'Bank details are temporarily unavailable.' },
			{ status: 503 }
		);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	const activeAffiliate = await prisma.user.findFirst({
		where: {
			id: locals.user.id,
			isActive: true,
			isAffiliateEnabled: true,
			affiliatePrograms: { some: { status: 'active' } }
		},
		select: { id: true }
	});
	if (!activeAffiliate) {
		return json(
			{ success: false, error: 'Active affiliate access is required before adding bank details.' },
			{ status: 403 }
		);
	}

	const payload = await request.json().catch(() => ({}));
	const bankName = cleanString(payload?.bankName, 100);
	const accountNumber = cleanString(payload?.accountNumber, 32).replace(/\s+/g, '');
	const accountName = cleanString(payload?.accountName, 150);
	const phone = cleanString(payload?.phone, 32);
	const feedback = cleanString(payload?.feedback, 2000);

	if (!bankName || !accountNumber || !accountName || !phone) {
		return json(
			{ success: false, error: 'Bank name, account number, account name, and phone are required.' },
			{ status: 400 }
		);
	}
	if (!/^\d{10}$/.test(accountNumber)) {
		return json(
			{ success: false, error: 'Enter a valid 10-digit Nigerian bank account number.' },
			{ status: 400 }
		);
	}

	let protectedDetails;
	try {
		protectedDetails = encryptAffiliateBankDetails(locals.user.id, {
			bankName,
			accountNumber,
			accountName,
			phone,
			feedback: feedback || null
		});
	} catch (error) {
		if (error instanceof AffiliatePayoutEncryptionError) {
			console.error('Affiliate payout encryption unavailable:', error.message);
			return json(
				{
					success: false,
					error: 'Bank details cannot be saved securely right now. Please try later.'
				},
				{ status: 503 }
			);
		}
		throw error;
	}

	const submission = await prisma.affiliatePayoutDetails.upsert({
		where: { userId: locals.user.id },
		update: {
			bankName: null,
			accountNumber: null,
			accountName: null,
			phone: null,
			feedback: null,
			...protectedDetails,
			status: 'pending',
			rejectionReason: null,
			reviewedAt: null,
			reviewedBy: null
		},
		create: {
			userId: locals.user.id,
			...protectedDetails
		},
		select: { id: true, status: true }
	});

	return json({
		success: true,
		message: 'Your bank details have been submitted for review.',
		data: submission
	});
};
