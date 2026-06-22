#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SERVICES = [
	{
		name: 'Instagram Followers',
		description: 'Grow your Instagram profile with real-looking followers.',
		platform: 'instagram',
		actionType: 'followers',
		minQuantity: 500,
		stepQuantity: 500,
		pricePerStep: 1900
	},
	{
		name: 'Instagram Likes',
		description: 'Boost engagement on any Instagram post.',
		platform: 'instagram',
		actionType: 'likes',
		minQuantity: 1000,
		stepQuantity: 1000,
		pricePerStep: 700
	},
	{
		name: 'Instagram Views (Reels)',
		description: 'Increase view counts on your Instagram Reels.',
		platform: 'instagram',
		actionType: 'views',
		minQuantity: 1000,
		stepQuantity: 1000,
		pricePerStep: 700
	},
	{
		name: 'TikTok Likes',
		description: 'Boost engagement on any TikTok video.',
		platform: 'tiktok',
		actionType: 'likes',
		minQuantity: 1000,
		stepQuantity: 1000,
		pricePerStep: 1500
	},
	{
		name: 'TikTok Views',
		description: 'Increase view counts on your TikTok videos.',
		platform: 'tiktok',
		actionType: 'views',
		minQuantity: 1000,
		stepQuantity: 1000,
		pricePerStep: 1500
	},
	{
		name: 'Facebook Page Followers',
		description: 'Grow your Facebook Page with real-looking followers.',
		platform: 'facebook',
		actionType: 'followers',
		minQuantity: 1000,
		stepQuantity: 1000,
		pricePerStep: 2000
	},
	{
		name: 'Facebook Post Likes',
		description: 'Boost engagement on any Facebook post.',
		platform: 'facebook',
		actionType: 'likes',
		minQuantity: 1000,
		stepQuantity: 1000,
		pricePerStep: 700
	},
	{
		name: 'X Followers',
		description: 'Grow your X (Twitter) profile with real-looking followers.',
		platform: 'x',
		actionType: 'followers',
		minQuantity: 500,
		stepQuantity: 500,
		pricePerStep: 6500
	},
	{
		name: 'X Likes',
		description: 'Boost engagement on any X (Twitter) post.',
		platform: 'x',
		actionType: 'likes',
		minQuantity: 1000,
		stepQuantity: 1000,
		pricePerStep: 1500
	},
	// Coming soon — created with pricePerStep: 0 until real pricing is set in admin.
	{
		name: 'TikTok Followers',
		description: 'Grow your TikTok profile with real-looking followers.',
		platform: 'tiktok',
		actionType: 'followers',
		minQuantity: 500,
		stepQuantity: 500,
		pricePerStep: 0
	},
	{
		name: 'YouTube Subscribers',
		description: 'Grow your YouTube channel with real-looking subscribers.',
		platform: 'youtube',
		actionType: 'subscribers',
		minQuantity: 100,
		stepQuantity: 100,
		pricePerStep: 0
	},
	{
		name: 'YouTube Views',
		description: 'Increase view counts on your YouTube videos.',
		platform: 'youtube',
		actionType: 'views',
		minQuantity: 1000,
		stepQuantity: 1000,
		pricePerStep: 0
	},
	{
		name: 'YouTube Likes',
		description: 'Boost engagement on any YouTube video.',
		platform: 'youtube',
		actionType: 'likes',
		minQuantity: 1000,
		stepQuantity: 1000,
		pricePerStep: 0
	},
	{
		name: 'YouTube Comments',
		description: 'Add comments to any YouTube video.',
		platform: 'youtube',
		actionType: 'comments',
		minQuantity: 100,
		stepQuantity: 100,
		pricePerStep: 0
	},
	{
		name: 'Instagram Comments',
		description: 'Add comments to any Instagram post or Reel.',
		platform: 'instagram',
		actionType: 'comments',
		minQuantity: 100,
		stepQuantity: 100,
		pricePerStep: 0
	},
	{
		name: 'TikTok Comments',
		description: 'Add comments to any TikTok video.',
		platform: 'tiktok',
		actionType: 'comments',
		minQuantity: 100,
		stepQuantity: 100,
		pricePerStep: 0
	},
	{
		name: 'Facebook Comments',
		description: 'Add comments to any Facebook post.',
		platform: 'facebook',
		actionType: 'comments',
		minQuantity: 100,
		stepQuantity: 100,
		pricePerStep: 0
	},
	{
		name: 'X Comments',
		description: 'Add comments to any X (Twitter) post.',
		platform: 'x',
		actionType: 'comments',
		minQuantity: 100,
		stepQuantity: 100,
		pricePerStep: 0
	},
	{
		name: 'X Reposts',
		description: 'Get reposts (retweets) on any X (Twitter) post.',
		platform: 'x',
		actionType: 'reposts',
		minQuantity: 500,
		stepQuantity: 500,
		pricePerStep: 0
	}
];

function generateSlug(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

async function main() {
	const existingCount = await prisma.category.count({
		where: { categoryType: 'boosting_service' }
	});

	let created = 0;
	let skipped = 0;

	for (const [index, service] of SERVICES.entries()) {
		const slug = generateSlug(service.name);
		const existing = await prisma.category.findFirst({
			where: { categoryType: 'boosting_service', slug }
		});

		if (existing) {
			console.log(`[seed-boosting-services] skipping "${service.name}" — already exists`);
			skipped += 1;
			continue;
		}

		await prisma.category.create({
			data: {
				name: service.name,
				slug,
				description: service.description,
				categoryType: 'boosting_service',
				isActive: true,
				sortOrder: existingCount + index + 1,
				metadata: {
					boosting_platform: service.platform,
					boosting_action_type: service.actionType,
					boosting_min_quantity: service.minQuantity,
					boosting_step_quantity: service.stepQuantity,
					boosting_price_per_step: service.pricePerStep,
					boosting_refill_available: false
				}
			}
		});

		console.log(`[seed-boosting-services] created "${service.name}" (${slug})`);
		created += 1;
	}

	console.log(`[seed-boosting-services] done. created=${created} skipped=${skipped}`);
}

main()
	.catch((error) => {
		console.error('[seed-boosting-services] failed', error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
