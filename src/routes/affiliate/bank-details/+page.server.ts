import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { decryptAffiliateBankDetails } from '$lib/services/affiliate-payout-details';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login?returnUrl=/affiliate/bank-details');
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
			updatedAt: true
		}
	});

	if (!submission) return { submission: null, submissionError: null };
	try {
		const details = decryptAffiliateBankDetails(submission);
		return {
			submission: {
				...details,
				status: submission.status,
				rejectionReason: submission.rejectionReason,
				updatedAt: submission.updatedAt.toISOString()
			},
			submissionError: null
		};
	} catch (error) {
		console.error('Unable to load protected affiliate bank details:', error);
		return {
			submission: null,
			submissionError:
				'Your saved bank details are temporarily unavailable. Nothing has been changed; please try again later.'
		};
	}
};
