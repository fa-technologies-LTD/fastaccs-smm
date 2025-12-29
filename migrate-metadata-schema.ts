/**
 * Migration Script: Standardize Metadata Schema
 *
 * This script migrates all Category metadata from the old schema to the new standardized schema.
 *
 * OLD SCHEMA (platforms):
 * {
 *   price: number,
 *   followers_range: [min, max],
 *   age_months: number,
 *   engagement_rate: number
 * }
 *
 * NEW SCHEMA (standardized):
 * {
 *   follower_range: { min: number, max: number, display: string },
 *   pricing: { base_price: number, bulk_discount: number, currency: string },
 *   features: string[],
 *   quality_score: number,
 *   delivery_time: string,
 *   replacement_guarantee: boolean,
 *   age_months?: number,
 *   engagement_rate?: number
 * }
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface OldMetadata {
	price?: number;
	followers_range?: [number, number];
	age_months?: number;
	engagement_rate?: number;
	[key: string]: any;
}

interface NewMetadata {
	follower_range: {
		min: number;
		max: number;
		display: string;
	};
	pricing: {
		base_price: number;
		bulk_discount: number;
		currency: string;
	};
	features: string[];
	quality_score: number;
	delivery_time: string;
	replacement_guarantee: boolean;
	age_months?: number;
	engagement_rate?: number;
	[key: string]: any;
}

function formatFollowers(num: number): string {
	if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
	if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
	return num.toString();
}

function migrateMetadata(oldMetadata: any): NewMetadata {
	const old = oldMetadata as OldMetadata;

	// Check if already in new format
	if (old.follower_range && typeof old.follower_range === 'object' && 'min' in old.follower_range) {
		return oldMetadata as NewMetadata;
	}

	// Migrate from old format
	const min = old.followers_range?.[0] || 0;
	const max = old.followers_range?.[1] || 0;

	const newMetadata: NewMetadata = {
		follower_range: {
			min,
			max,
			display: `${formatFollowers(min)}-${formatFollowers(max)}`
		},
		pricing: {
			base_price: old.price || 0,
			bulk_discount: 0,
			currency: 'USD'
		},
		features: old.features || [],
		quality_score: old.quality_score || 5,
		delivery_time: old.delivery_time || '24-48 hours',
		replacement_guarantee: old.replacement_guarantee ?? true
	};

	// Preserve additional fields
	if (old.age_months !== undefined) {
		newMetadata.age_months = old.age_months;
	}
	if (old.engagement_rate !== undefined) {
		newMetadata.engagement_rate = old.engagement_rate;
	}

	// Preserve any other fields not in the standard schema
	for (const key in old) {
		if (
			![
				'price',
				'followers_range',
				'age_months',
				'engagement_rate',
				'features',
				'quality_score',
				'delivery_time',
				'replacement_guarantee'
			].includes(key) &&
			!(key in newMetadata)
		) {
			newMetadata[key] = old[key];
		}
	}

	return newMetadata;
}

async function main() {
	console.log('🔄 Starting metadata schema migration...\n');

	try {
		// Fetch all categories with metadata
		const categories = await prisma.category.findMany({
			where: {
				metadata: {
					not: null
				}
			},
			select: {
				id: true,
				name: true,
				slug: true,
				categoryType: true,
				metadata: true
			}
		});

		console.log(`📊 Found ${categories.length} categories with metadata\n`);

		let migratedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		for (const category of categories) {
			try {
				const oldMetadata = category.metadata as any;

				// Check if migration is needed
				const needsMigration =
					oldMetadata.followers_range && Array.isArray(oldMetadata.followers_range);

				if (!needsMigration) {
					console.log(
						`⏭️  Skipping ${category.name} (${category.categoryType}) - already migrated`
					);
					skippedCount++;
					continue;
				}

				const newMetadata = migrateMetadata(oldMetadata);

				// Update the category
				await prisma.category.update({
					where: { id: category.id },
					data: { metadata: newMetadata as any }
				});

				console.log(`✅ Migrated ${category.name} (${category.categoryType})`);
				console.log(
					`   Old: followers_range: [${oldMetadata.followers_range[0]}, ${oldMetadata.followers_range[1]}], price: ${oldMetadata.price}`
				);
				console.log(
					`   New: follower_range: {min: ${newMetadata.follower_range.min}, max: ${newMetadata.follower_range.max}, display: "${newMetadata.follower_range.display}"}, base_price: ${newMetadata.pricing.base_price}\n`
				);

				migratedCount++;
			} catch (error) {
				console.error(`❌ Error migrating ${category.name}:`, error);
				errorCount++;
			}
		}

		console.log('\n📈 Migration Summary:');
		console.log(`   ✅ Migrated: ${migratedCount}`);
		console.log(`   ⏭️  Skipped: ${skippedCount}`);
		console.log(`   ❌ Errors: ${errorCount}`);
		console.log(`   📊 Total: ${categories.length}\n`);

		if (errorCount === 0) {
			console.log('✨ Migration completed successfully!');
		} else {
			console.log('⚠️  Migration completed with errors. Please review the errors above.');
		}
	} catch (error) {
		console.error('💥 Fatal error during migration:', error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

main();
