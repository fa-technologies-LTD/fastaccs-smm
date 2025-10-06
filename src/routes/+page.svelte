<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import HeroBanner from '$lib/components/HeroBanner.svelte';
	import FeaturedCategories from '$lib/components/FeaturedCategories.svelte';
	import SocialProof from '$lib/components/SocialProof.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { Instagram, Music, Facebook, Twitter, Star, Eye, Youtube } from '@lucide/svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	const platformIcons = {
		twitter: Twitter,
		instagram: Instagram,
		youtube: Youtube,
		facebook: Facebook,
		tiktok: Music // Use Music as TikTok doesn't exist in lucide
	};

	// Get platform icon
	function getPlatformIcon(platform: string) {
		return platformIcons[platform?.toLowerCase() as keyof typeof platformIcons] || Twitter;
	}

	// Format price to Nigerian Naira
	function formatPrice(price: number) {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(price);
	}

	// Add to cart
	function addToCart(product: any) {
		cart.addItem(product, 1);
	}
</script>

<svelte:head>
	<title>FastAccs - Premium Social Media Accounts & Boosting Services</title>
	<meta
		name="description"
		content="Nigeria's most trusted marketplace for verified social media accounts and boosting services. Fast, secure, and reliable delivery guaranteed."
	/>
</svelte:head>

<Navigation />

<main>
	<HeroBanner />
	<FeaturedCategories />

	<!-- Featured Products Section -->
	{#if data.featuredProducts && data.featuredProducts.length > 0}
		<section class="bg-white px-4 py-12 sm:py-16">
			<div class="mx-auto max-w-6xl">
				<h2 class="mb-8 text-center text-2xl font-bold text-gray-800 sm:mb-12 md:text-3xl">
					Featured Social Media Accounts
				</h2>

				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
					{#each data.featuredProducts.slice(0, 4) as product}
						<div
							class="overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300 hover:shadow-xl"
						>
							<div
								class="flex aspect-square items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-6"
							>
								<svelte:component
									this={getPlatformIcon(product.platform)}
									class="h-16 w-16 text-white"
								/>
							</div>

							<div class="p-4">
								<div class="mb-2 flex items-center justify-between">
									<span
										class="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 capitalize"
									>
										{product.platform}
									</span>
									{#if product.verification_status === 'verified'}
										<div class="flex items-center text-green-600">
											<Star class="h-4 w-4 fill-current" />
											<span class="ml-1 text-xs">Verified</span>
										</div>
									{/if}
								</div>

								<h3 class="mb-2 line-clamp-2 font-semibold text-gray-800">
									{product.title}
								</h3>

								<div class="mb-3 flex items-center text-sm text-gray-600">
									<Eye class="mr-1 h-4 w-4" />
									{product.follower_count?.toLocaleString() || 'N/A'} followers
								</div>

								<div class="flex items-center justify-between">
									<div>
										<div class="text-lg font-bold text-gray-900">
											{formatPrice(product.price)}
										</div>
										{#if product.original_price && product.original_price > product.price}
											<div class="text-sm text-gray-500 line-through">
												{formatPrice(product.original_price)}
											</div>
										{/if}
									</div>

									<button
										onclick={() => addToCart(product)}
										class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
									>
										Add to Cart
									</button>
								</div>
							</div>
						</div>
					{/each}
				</div>

				<div class="mt-8 text-center">
					<a
						href="/products"
						class="inline-flex items-center rounded-lg bg-gray-100 px-6 py-3 font-medium text-gray-800 transition-colors hover:bg-gray-200"
					>
						View All Products →
					</a>
				</div>
			</div>
		</section>
	{/if}

	<SocialProof />
</main>
<Footer />

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
