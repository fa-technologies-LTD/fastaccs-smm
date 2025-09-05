<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { cart } from '$lib/stores/cart.svelte';

	// Sample product data
	const sampleProducts = [
		{
			id: '1',
			category_id: null,
			title: 'Instagram Fashion Account',
			description: '45K followers, fashion niche, high engagement',
			platform: 'instagram',
			follower_count: 45000,
			following_count: 1200,
			posts_count: 450,
			engagement_rate: 4.25,
			account_age_months: 18,
			niche: 'fashion',
			price: 22000,
			original_price: 28000,
			currency: 'NGN',
			stock_quantity: 1,
			is_sold: false,
			reserved_until: null,
			thumbnail_url: null,
			screenshot_urls: null,
			verification_status: 'verified' as const,
			account_quality_score: 8,
			tags: ['fashion', 'lifestyle', 'influencer'],
			featured: true,
			status: 'active' as const,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		},
		{
			id: '2',
			category_id: null,
			title: 'Tech Instagram Account',
			description: '25K followers, technology niche, active community',
			platform: 'instagram',
			follower_count: 25000,
			following_count: 800,
			posts_count: 320,
			engagement_rate: 5.1,
			account_age_months: 12,
			niche: 'tech',
			price: 15000,
			original_price: 18000,
			currency: 'NGN',
			stock_quantity: 1,
			is_sold: false,
			reserved_until: null,
			thumbnail_url: null,
			screenshot_urls: null,
			verification_status: 'verified' as const,
			account_quality_score: 9,
			tags: ['tech', 'reviews', 'gadgets'],
			featured: false,
			status: 'active' as const,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		},
		{
			id: '3',
			category_id: null,
			title: 'Fitness Instagram Account',
			description: '35K followers, fitness niche, engaged audience',
			platform: 'instagram',
			follower_count: 35000,
			following_count: 950,
			posts_count: 680,
			engagement_rate: 3.85,
			account_age_months: 24,
			niche: 'fitness',
			price: 18000,
			original_price: 22000,
			currency: 'NGN',
			stock_quantity: 1,
			is_sold: false,
			reserved_until: null,
			thumbnail_url: null,
			screenshot_urls: null,
			verification_status: 'verified' as const,
			account_quality_score: 7,
			tags: ['fitness', 'health', 'workout'],
			featured: true,
			status: 'active' as const,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		}
	];

	function addToCart(product: (typeof sampleProducts)[0]) {
		cart.addItem(product);
	}
</script>

<svelte:head>
	<title>Social Media Accounts - FastAccs</title>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50 py-8">
	<div class="mx-auto max-w-7xl px-4">
		<div class="mb-8">
			<h1 class="mb-4 text-4xl font-bold text-gray-900">Social Media Accounts</h1>
			<p class="text-xl text-gray-600">
				Premium verified social media accounts ready for immediate use
			</p>
		</div>

		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each sampleProducts as product}
				<div class="rounded-lg bg-white p-6 shadow-sm">
					<div class="mb-4 h-48 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600"></div>
					<h3 class="mb-2 text-lg font-semibold">{product.title}</h3>
					<p class="mb-4 text-gray-600">{product.description}</p>
					<div class="mb-2 text-sm text-gray-500">
						{product.follower_count?.toLocaleString()} followers • {product.engagement_rate}%
						engagement
					</div>
					<div class="mb-4 flex items-center justify-between">
						<span class="text-2xl font-bold text-purple-600">₦{product.price.toLocaleString()}</span
						>
						{#if product.original_price && product.original_price > product.price}
							<span class="text-sm text-gray-500 line-through"
								>₦{product.original_price.toLocaleString()}</span
							>
						{/if}
					</div>
					<button
						onclick={() => addToCart(product)}
						class="w-full rounded-lg bg-purple-600 py-2 text-white transition-colors hover:bg-purple-700"
					>
						Add to Cart
					</button>
				</div>
			{/each}
		</div>
	</div>
</main>

<Footer />
