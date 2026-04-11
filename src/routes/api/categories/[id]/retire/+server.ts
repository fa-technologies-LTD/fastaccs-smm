import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

interface RetireRequestBody {
	targetCategoryId?: string;
	moveAvailableInventory?: boolean;
}

interface AvailableAccountRef {
	id: string;
	batchId: string;
}

function groupAvailableAccountsByBatch(accounts: AvailableAccountRef[]): Map<string, string[]> {
	const grouped = new Map<string, string[]>();

	for (const account of accounts) {
		const existing = grouped.get(account.batchId) ?? [];
		existing.push(account.id);
		grouped.set(account.batchId, existing);
	}

	return grouped;
}

// POST /api/categories/[id]/retire - Archive category/platform and optionally move available inventory
export async function POST({ params, request }) {
	try {
		const id = params.id;

		if (!id) {
			return json({ data: null, error: 'Category ID is required' }, { status: 400 });
		}

		const body = (await request.json().catch(() => ({}))) as RetireRequestBody;
		const moveAvailableInventory = body.moveAvailableInventory === true;
		const targetCategoryId = typeof body.targetCategoryId === 'string' ? body.targetCategoryId : undefined;

		const sourceCategory = await prisma.category.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				categoryType: true,
				isActive: true
			}
		});

		if (!sourceCategory) {
			return json({ data: null, error: 'Category not found' }, { status: 404 });
		}

		const childTiers =
			sourceCategory.categoryType === 'platform'
				? await prisma.category.findMany({
						where: {
							parentId: id,
							categoryType: 'tier'
						},
						select: {
							id: true
						}
					})
				: [];

		const sourceCategoryIds =
			sourceCategory.categoryType === 'platform'
				? [sourceCategory.id, ...childTiers.map((tier) => tier.id)]
				: [sourceCategory.id];

		if (moveAvailableInventory && !targetCategoryId) {
			return json(
				{
					data: null,
					error: 'targetCategoryId is required when moveAvailableInventory is enabled.'
				},
				{ status: 400 }
			);
		}

		if (targetCategoryId) {
			if (sourceCategoryIds.includes(targetCategoryId)) {
				return json(
					{
						data: null,
						error: 'Cannot move inventory into the category being retired.'
					},
					{ status: 400 }
				);
			}

			const targetCategory = await prisma.category.findUnique({
				where: { id: targetCategoryId },
				select: {
					id: true,
					name: true,
					categoryType: true,
					isActive: true
				}
			});

			if (!targetCategory) {
				return json({ data: null, error: 'Target category not found.' }, { status: 404 });
			}

			if (!targetCategory.isActive) {
				return json(
					{
						data: null,
						error: 'Target category must be active before inventory can be moved.'
					},
					{ status: 400 }
				);
			}

			if (!['tier', 'platform'].includes(targetCategory.categoryType)) {
				return json(
					{
						data: null,
						error: 'Target category must be a platform or tier.'
					},
					{ status: 400 }
				);
			}
		}

		const result = await prisma.$transaction(async (tx) => {
			let accountsMoved = 0;
			let fullBatchesMoved = 0;
			let splitBatchesCreated = 0;
			let sourceBatchesRecounted = 0;

			if (moveAvailableInventory && targetCategoryId) {
				const availableAccounts = await tx.account.findMany({
					where: {
						categoryId: { in: sourceCategoryIds },
						status: 'available'
					},
					select: {
						id: true,
						batchId: true
					}
				});

				accountsMoved = availableAccounts.length;

				if (availableAccounts.length > 0) {
					const accountsByBatch = groupAvailableAccountsByBatch(availableAccounts);
					const sourceBatchIds = [...accountsByBatch.keys()];
					const partialMoveBatchIds = new Set<string>();

					const batchTotals = await tx.account.groupBy({
						by: ['batchId'],
						where: {
							batchId: { in: sourceBatchIds }
						},
						_count: {
							_all: true
						}
					});

					const totalByBatch = new Map(
						batchTotals.map((batch) => [batch.batchId, batch._count._all])
					);

					const sourceBatches = await tx.accountBatch.findMany({
						where: { id: { in: sourceBatchIds } },
						select: {
							id: true,
							supplier: true,
							costPerUnit: true,
							descriptors: true,
							linksRaw: true,
							logsRaw: true,
							notes: true,
							importStatus: true
						}
					});

					const sourceBatchById = new Map(sourceBatches.map((batch) => [batch.id, batch]));

					for (const [batchId, accountIds] of accountsByBatch.entries()) {
						const totalInBatch = totalByBatch.get(batchId) ?? 0;
						if (totalInBatch === accountIds.length) {
							await tx.accountBatch.update({
								where: { id: batchId },
								data: { categoryId: targetCategoryId }
							});

							await tx.account.updateMany({
								where: { id: { in: accountIds } },
								data: { categoryId: targetCategoryId }
							});

							fullBatchesMoved += 1;
							continue;
						}

						const sourceBatch = sourceBatchById.get(batchId);
						if (!sourceBatch) {
							continue;
						}

						const splitBatch = await tx.accountBatch.create({
							data: {
								categoryId: targetCategoryId,
								supplier: sourceBatch.supplier,
								costPerUnit: sourceBatch.costPerUnit,
								descriptors: JSON.parse(JSON.stringify(sourceBatch.descriptors ?? {})),
								linksRaw: sourceBatch.linksRaw,
								logsRaw: sourceBatch.logsRaw,
								notes: sourceBatch.notes,
								totalUnits: accountIds.length,
								remainingUnits: accountIds.length,
								importStatus: sourceBatch.importStatus
							},
							select: { id: true }
						});

						await tx.account.updateMany({
							where: { id: { in: accountIds } },
							data: {
								categoryId: targetCategoryId,
								batchId: splitBatch.id
							}
						});

						partialMoveBatchIds.add(batchId);
						splitBatchesCreated += 1;
					}

					const batchesToRecount = [...partialMoveBatchIds];
					sourceBatchesRecounted = batchesToRecount.length;

					if (batchesToRecount.length > 0) {
						const batchStatusRows = await tx.account.groupBy({
							by: ['batchId', 'status'],
							where: {
								batchId: { in: batchesToRecount }
							},
							_count: {
								_all: true
							}
						});

						const batchCounts = new Map<string, { total: number; available: number }>();

						for (const row of batchStatusRows) {
							const current = batchCounts.get(row.batchId) ?? { total: 0, available: 0 };
							current.total += row._count._all;
							if (row.status === 'available') {
								current.available += row._count._all;
							}
							batchCounts.set(row.batchId, current);
						}

						for (const batchId of batchesToRecount) {
							const counts = batchCounts.get(batchId) ?? { total: 0, available: 0 };
							await tx.accountBatch.update({
								where: { id: batchId },
								data: {
									totalUnits: counts.total,
									remainingUnits: counts.available
								}
							});
						}
					}
				}
			}

			const retiredCategories = await tx.category.updateMany({
				where: {
					id: { in: sourceCategoryIds }
				},
				data: {
					isActive: false
				}
			});

			return {
				retiredCategoryId: sourceCategory.id,
				retiredCategoryIds: sourceCategoryIds,
				retiredCount: retiredCategories.count,
				inventoryMove: {
					attempted: moveAvailableInventory,
					targetCategoryId: moveAvailableInventory ? targetCategoryId ?? null : null,
					accountsMoved,
					fullBatchesMoved,
					splitBatchesCreated,
					sourceBatchesRecounted
				}
			};
		});

		return json({ data: result, error: null });
	} catch (error) {
		console.error('Failed to retire category:', error);
		return json({ data: null, error: 'Failed to retire category' }, { status: 500 });
	}
}
