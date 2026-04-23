import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { applyTierSampleScreenshotSanitization } from '$lib/helpers/tierSampleScreenshots';
import { applyTierMerchandisingSanitization } from '$lib/helpers/tier-merchandising';

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
export async function PUT({ params, request, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const id = params.id;
		const updates = await request.json();
		const { parentId, metadata, ...rest } = updates;
		let nextMetadata = metadata;

		if (metadata !== undefined) {
			const existingCategory = await prisma.category.findUnique({
				where: { id },
				select: { categoryType: true }
			});

			if (!existingCategory) {
				return json({ data: null, error: 'Category not found' }, { status: 404 });
			}

			const targetCategoryType =
				typeof rest.categoryType === 'string' ? rest.categoryType : existingCategory.categoryType;

			if (targetCategoryType === 'tier') {
				const metadataObject =
					metadata && typeof metadata === 'object' && !Array.isArray(metadata)
						? (metadata as Record<string, unknown>)
						: {};
				nextMetadata = applyTierMerchandisingSanitization(
					applyTierSampleScreenshotSanitization(metadataObject)
				);
			}
		}

		const data = await prisma.category.update({
			where: { id },
			data: {
				...rest,
				...(metadata !== undefined && { metadata: JSON.parse(JSON.stringify(nextMetadata)) }),
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

		invalidateAdminStatsCache();

		return json({ data, error: null });
	} catch (error) {
		console.error('Failed to update category:', error);
		return json({ data: null, error: 'Failed to update category' }, { status: 500 });
	}
}

// DELETE /api/categories/[id] - Delete category
export async function DELETE({ params, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

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

		invalidateAdminStatsCache();

		return json({ data, error: null });
	} catch (error) {
		console.error('Failed to delete category:', error);
		return json({ data: null, error: 'Failed to delete category' }, { status: 500 });
	}
}
