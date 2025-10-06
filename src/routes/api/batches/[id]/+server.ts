import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// GET /api/batches/[id] - Get specific batch
export async function GET({ params }) {
	try {
		const data = await prisma.accountBatch.findUnique({
			where: { id: params.id },
			include: {
				category: true,
				accounts: true
			}
		});

		if (!data) {
			return json(
				{ data: null, error: 'Batch not found' },
				{ status: 404 }
			);
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

// PATCH /api/batches/[id] - Update batch
export async function PATCH({ params, request }) {
	try {
		const updateData = await request.json();

		const data = await prisma.accountBatch.update({
			where: { id: params.id },
			data: {
				...updateData,
				updatedAt: new Date()
			},
			include: {
				category: true,
				accounts: true
			}
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

// DELETE /api/batches/[id] - Delete batch
export async function DELETE({ params }) {
	try {
		// First delete related accounts
		await prisma.account.deleteMany({
			where: { batchId: params.id }
		});

		// Then delete the batch
		const data = await prisma.accountBatch.delete({
			where: { id: params.id }
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