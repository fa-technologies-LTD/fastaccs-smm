import type { Account, AccountBatch, Category } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { buildCredentialPlainText } from '$lib/helpers/credential-contract';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { sendLowStockAdminAlertIfNeeded } from '$lib/services/admin-alerts';

const OFFLOAD_ELIGIBLE_STATUSES = ['available'];

type OffloadCategory = Category & {
	parent?: Pick<Category, 'id' | 'name' | 'slug'> | null;
};

type OffloadAccount = Pick<
	Account,
	| 'id'
	| 'linkUrl'
	| 'username'
	| 'password'
	| 'email'
	| 'emailPassword'
	| 'twoFa'
	| 'followers'
	| 'following'
	| 'postsCount'
	| 'engagementRate'
	| 'ageMonths'
	| 'niche'
	| 'qualityScore'
	| 'credentialExtras'
	| 'createdAt'
> & {
	batch: Pick<AccountBatch, 'id' | 'createdAt' | 'supplier' | 'notes'>;
	category: OffloadCategory;
};

export interface CategoryOffloadResult {
	category: OffloadCategory;
	accountCount: number;
	filename: string;
	text: string;
}

function formatTimestamp(value: Date): string {
	return new Intl.DateTimeFormat('en-NG', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Africa/Lagos'
	}).format(value);
}

function sanitizeFilenamePart(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

function formatDecimal(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	const text = String(value).trim();
	return text || undefined;
}

async function getCategoryForOffload(categoryId: string): Promise<OffloadCategory> {
	const category = await prisma.category.findUnique({
		where: { id: categoryId },
		include: {
			parent: {
				select: {
					id: true,
					name: true,
					slug: true
				}
			}
		}
	});

	if (!category) {
		throw new Error('Category not found.');
	}

	return category;
}

async function getOffloadAccounts(categoryId: string): Promise<OffloadAccount[]> {
	return prisma.account.findMany({
		where: {
			categoryId,
			status: { in: OFFLOAD_ELIGIBLE_STATUSES }
		},
		include: {
			batch: {
				select: {
					id: true,
					createdAt: true,
					supplier: true,
					notes: true
				}
			},
			category: {
				include: {
					parent: {
						select: {
							id: true,
							name: true,
							slug: true
						}
					}
				}
			}
		},
		orderBy: [{ batch: { createdAt: 'asc' } }, { createdAt: 'asc' }]
	});
}

export async function buildCategoryOffloadText(categoryId: string): Promise<CategoryOffloadResult> {
	const category = await getCategoryForOffload(categoryId);
	const accounts = await getOffloadAccounts(categoryId);
	const generatedAt = new Date();
	const platformLabel = category.parent?.name || 'All Platforms';
	const statusLabel = category.isActive ? 'Active' : 'Archived';

	const header = [
		'FASTACCS TIER OFFLOAD',
		`Tier: ${category.name}`,
		`Platform: ${platformLabel}`,
		`Status: ${statusLabel}`,
		`Generated: ${formatTimestamp(generatedAt)}`,
		`Included logs: ${accounts.length}`,
		'Scope: available/unsold logs only'
	];

	const accountBlocks = accounts.map((account, index) => {
		const headerLines = [
			`Account ${index + 1}`,
			`Batch Upload Date: ${formatTimestamp(account.batch.createdAt)}`,
			`Batch ID: ${account.batch.id}`
		];

		if (account.batch.supplier) {
			headerLines.push(`Supplier: ${account.batch.supplier}`);
		}

		return buildCredentialPlainText(
			{
				linkUrl: account.linkUrl,
				username: account.username,
				password: account.password,
				email: account.email,
				emailPassword: account.emailPassword,
				twoFa: account.twoFa,
				followers: account.followers,
				following: account.following,
				postsCount: account.postsCount,
				engagementRate: formatDecimal(account.engagementRate),
				ageMonths: account.ageMonths,
				niche: account.niche,
				qualityScore: account.qualityScore,
				credentialExtras: account.credentialExtras
			},
			{ headerLines }
		);
	});

	const emptyNote =
		accounts.length === 0
			? [
					'',
					'No available/unsold logs were found for this tier.',
					'Delivered, allocated, and reserved records are intentionally excluded.'
				]
			: [];

	const text = [...header, ...emptyNote, '', ...accountBlocks].join('\n\n').trim() + '\n';
	const filename = `fastaccs-offload-${sanitizeFilenamePart(category.name || 'tier')}-${generatedAt
		.toISOString()
		.slice(0, 10)}.txt`;

	return {
		category,
		accountCount: accounts.length,
		filename,
		text
	};
}

export async function deleteOffloadedAvailableLogs(categoryId: string): Promise<{
	deletedAccounts: number;
	recountedBatches: number;
	deletedEmptyBatches: number;
}> {
	const category = await getCategoryForOffload(categoryId);
	if (category.categoryType !== 'tier') {
		throw new Error('Only tiers can offload-delete logs from this screen.');
	}

	const accounts = await prisma.account.findMany({
		where: {
			categoryId,
			status: { in: OFFLOAD_ELIGIBLE_STATUSES }
		},
		select: {
			id: true,
			batchId: true
		}
	});

	if (accounts.length === 0) {
		return {
			deletedAccounts: 0,
			recountedBatches: 0,
			deletedEmptyBatches: 0
		};
	}

	const accountIds = accounts.map((account) => account.id);
	const batchIds = [...new Set(accounts.map((account) => account.batchId))];

	const result = await prisma.$transaction(async (tx) => {
		const deleteResult = await tx.account.deleteMany({
			where: {
				id: { in: accountIds },
				status: { in: OFFLOAD_ELIGIBLE_STATUSES }
			}
		});

		const remainingCounts = await tx.account.groupBy({
			by: ['batchId', 'status'],
			where: {
				batchId: { in: batchIds }
			},
			_count: {
				_all: true
			}
		});

		const countsByBatch = new Map<string, { total: number; available: number }>();
		for (const row of remainingCounts) {
			const current = countsByBatch.get(row.batchId) ?? { total: 0, available: 0 };
			current.total += row._count._all;
			if (row.status === 'available') {
				current.available += row._count._all;
			}
			countsByBatch.set(row.batchId, current);
		}

		let recountedBatches = 0;
		let deletedEmptyBatches = 0;

		for (const batchId of batchIds) {
			const counts = countsByBatch.get(batchId);
			if (!counts || counts.total === 0) {
				await tx.accountBatch.delete({
					where: { id: batchId }
				});
				deletedEmptyBatches += 1;
				continue;
			}

			await tx.accountBatch.update({
				where: { id: batchId },
				data: {
					totalUnits: counts.total,
					remainingUnits: counts.available
				}
			});
			recountedBatches += 1;
		}

		return {
			deletedAccounts: deleteResult.count,
			recountedBatches,
			deletedEmptyBatches
		};
	});

	invalidateAdminStatsCache();
	void sendLowStockAdminAlertIfNeeded('tier_offload_delete').catch((error) => {
		console.error('Failed to evaluate low-stock alert after offload-delete:', error);
	});

	return result;
}
