import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login?returnUrl=/affiliate/bank-details');
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
			updatedAt: true
		}
	});

	return {
		submission: submission
			? {
					...submission,
					updatedAt: submission.updatedAt.toISOString()
				}
			: null
	};
};
