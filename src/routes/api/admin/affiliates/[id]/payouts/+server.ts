import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	// Verify admin authentication
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;

	if (!id) {
		return json({ success: false, error: 'Affiliate program ID is required' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const { amount, payoutMethod, payoutReference, payoutDate, notes } = body;

		// Validate required fields
		if (typeof amount !== 'number' || amount <= 0) {
			return json({ success: false, error: 'Valid amount is required' }, { status: 400 });
		}

		if (!payoutMethod || typeof payoutMethod !== 'string') {
			return json({ success: false, error: 'Payout method is required' }, { status: 400 });
		}

		if (!payoutDate) {
			return json({ success: false, error: 'Payout date is required' }, { status: 400 });
		}

		// Find the affiliate program
		const affiliateProgram = await prisma.affiliateProgram.findUnique({
			where: { id }
		});

		if (!affiliateProgram) {
			return json({ success: false, error: 'Affiliate program not found' }, { status: 404 });
		}

		// Check if payout amount exceeds unpaid commission
		const currentPaid = Number(affiliateProgram.totalPaid || 0);
		const totalCommission = Number(affiliateProgram.totalCommission);
		const unpaidAmount = totalCommission - currentPaid;

		if (amount > unpaidAmount) {
			return json(
				{
					success: false,
					error: `Payout amount (${amount}) exceeds unpaid commission (${unpaidAmount.toFixed(2)})`
				},
				{ status: 400 }
			);
		}

		// Create payout record and update total paid in a transaction
		const result = await prisma.$transaction([
			prisma.commissionPayout.create({
				data: {
					affiliateProgramId: id,
					amount,
					payoutMethod,
					payoutReference: payoutReference || null,
					payoutDate: new Date(payoutDate),
					notes: notes || null,
					processedBy: locals.user.id
				}
			}),
			prisma.affiliateProgram.update({
				where: { id },
				data: {
					totalPaid: { increment: amount }
				}
			})
		]);

		return json({
			success: true,
			payout: {
				id: result[0].id,
				amount: Number(result[0].amount),
				payoutMethod: result[0].payoutMethod,
				payoutDate: result[0].payoutDate
			},
			newTotalPaid: Number(result[1].totalPaid)
		});
	} catch (error) {
		console.error('Error recording payout:', error);
		return json({ success: false, error: 'Failed to record payout' }, { status: 500 });
	}
};

// Get all payouts for an affiliate program
export const GET: RequestHandler = async ({ locals, params }) => {
	// Verify admin authentication
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;

	if (!id) {
		return json({ success: false, error: 'Affiliate program ID is required' }, { status: 400 });
	}

	try {
		const payouts = await prisma.commissionPayout.findMany({
			where: { affiliateProgramId: id },
			orderBy: { payoutDate: 'desc' }
		});

		return json({
			success: true,
			payouts: payouts.map((p) => ({
				id: p.id,
				amount: Number(p.amount),
				payoutMethod: p.payoutMethod,
				payoutReference: p.payoutReference,
				payoutDate: p.payoutDate,
				notes: p.notes,
				processedBy: p.processedBy,
				createdAt: p.createdAt
			}))
		});
	} catch (error) {
		console.error('Error fetching payouts:', error);
		return json({ success: false, error: 'Failed to fetch payouts' }, { status: 500 });
	}
};
