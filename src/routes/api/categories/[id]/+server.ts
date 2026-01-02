import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// GET /api/categories/[id] - Get single category
export async function GET({ params }) {
	try {
		const id = params.id;

		if (!id) {
			return json({ error: 'Category ID is required' }, { status: 400 });
		}

		const category = await prisma.category.findUnique({
			where: { id }
		});

		if (!category) {
			return json({ error: 'Category not found' }, { status: 404 });
		}

		return json({
			success: true,
			data: category
		});
	} catch (error) {
		console.error('Error fetching category:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// PUT /api/categories/[id] - Update category
export async function PUT({ params, request }) {
	try {
		const id = params.id;
		const updates = await request.json();
		const { parentId, metadata, ...rest } = updates;

		const data = await prisma.category.update({
			where: { id },
			data: {
				...rest,
				...(metadata && { metadata: JSON.parse(JSON.stringify(metadata)) }),
				...(parentId !== undefined && {
					parent: parentId
						? {
								connect: { id: parentId }
							}
						: {
								disconnect: true
							}
				})
			}
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Failed to update category:', error);
		return json({ data: null, error: 'Failed to update category' }, { status: 500 });
	}
}

// DELETE /api/categories/[id] - Delete category
export async function DELETE({ params }) {
	try {
		const id = params.id;

		// Check if category has children (tiers, services, etc.)
		const childrenCount = await prisma.category.count({
			where: { parentId: id }
		});

		if (childrenCount > 0) {
			return json(
				{
					data: null,
					error: `Cannot delete this category. It has ${childrenCount} child ${childrenCount === 1 ? 'item' : 'items'} (tiers/services). Please delete or reassign them first.`
				},
				{ status: 400 }
			);
		}

		// Check if category has any related records (accounts, orders, etc.)
		const [accountsCount, orderItemsCount, accountBatchesCount] = await Promise.all([
			prisma.account.count({ where: { categoryId: id } }),
			prisma.orderItem.count({ where: { categoryId: id } }),
			prisma.accountBatch.count({ where: { categoryId: id } })
		]);

		const totalRelated = accountsCount + orderItemsCount + accountBatchesCount;
		if (totalRelated > 0) {
			return json(
				{
					data: null,
					error: `Cannot delete this category. It has ${accountsCount} accounts, ${orderItemsCount} orders, and ${accountBatchesCount} batches associated with it.`
				},
				{ status: 400 }
			);
		}

		const data = await prisma.category.delete({
			where: { id }
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Failed to delete category:', error);
		return json({ data: null, error: 'Failed to delete category' }, { status: 500 });
	}
}
