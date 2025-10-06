import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// PUT /api/accounts/[id] - Update account
export async function PUT({ params, request }) {
	try {
		const id = params.id;
		const updates = await request.json();

		const data = await prisma.account.update({
			where: { id },
			data: {
				...updates,
				...(updates.metadata && { metadata: JSON.parse(JSON.stringify(updates.metadata)) })
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
