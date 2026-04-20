import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { triggerRestockNotificationsForTier } from '$lib/services/restock-notifications';

// PUT /api/accounts/[id] - Update account
export async function PUT({ params, request }) {
	try {
		const id = params.id;
		const updates = await request.json();
		const existing = await prisma.account.findUnique({
			where: { id },
			select: {
				id: true,
				categoryId: true,
				status: true
			}
		});

		if (!existing) {
			return json({ data: null, error: 'Account not found' }, { status: 404 });
		}

		const targetCategoryId =
			typeof updates.categoryId === 'string' && updates.categoryId.trim()
				? updates.categoryId.trim()
				: existing.categoryId;
		const targetStatus =
			typeof updates.status === 'string' && updates.status.trim()
				? updates.status.trim()
				: existing.status;

		let availableBefore = 0;
		if (targetCategoryId) {
			availableBefore = await prisma.account.count({
				where: {
					categoryId: targetCategoryId,
					status: 'available'
				}
			});
		}

		const data = await prisma.account.update({
			where: { id },
			data: {
				...updates,
				...(updates.metadata && { metadata: JSON.parse(JSON.stringify(updates.metadata)) })
			}
		});

		if (targetCategoryId && targetStatus === 'available' && availableBefore === 0) {
			void triggerRestockNotificationsForTier(targetCategoryId).catch((error) => {
				console.error('Failed to trigger restock notifications:', error);
			});
		}

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

// DELETE /api/accounts/[id] - Delete account
export async function DELETE({ params }) {
	try {
		const id = params.id;

		const data = await prisma.account.delete({
			where: { id }
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
