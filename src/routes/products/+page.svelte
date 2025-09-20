<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Instagram,
		Music,
		Facebook,
		Twitter,
		Heart,
		Eye,
		Star,
		Filter,
		Search,
		ShoppingCart
	} from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { cart } from '$lib/stores/cart';
	import type { PageData } from './$types';

	export let data: PageData;

	// Filter state
	let searchTerm = '';
	let selectedPlatform = data.filters?.platform || '';
	let selectedCategory = data.filters?.category || '';
	let sortBy = 'newest';
	let priceRange = [0, 100000];

	// Platform icons mapping
	const platformIcons: Record<string, any> = {
		instagram: Instagram,
		tiktok: Music,
		facebook: Facebook,
		twitter: Twitter
	};

	// Apply filters
	function applyFilters() {
		const params = new URLSearchParams();

		if (selectedCategory) params.set('category', selectedCategory);
		if (selectedPlatform) params.set('platform', selectedPlatform);
		if (searchTerm) params.set('search', searchTerm);
		if (sortBy !== 'newest') params.set('sort', sortBy);

		goto(`/products?${params.toString()}`);
	}

	// Format price to Nigerian Naira
	function formatPrice(price: number) {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN',
			minimumFractionDigits: 0
		}).format(price);
	}

	// Format follower count
	function formatFollowers(count: number) {
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(1)}M`;
		} else if (count >= 1000) {
			return `${(count / 1000).toFixed(1)}K`;
		}
		return count.toString();
	}

	// Add to cart function
	function addToCart(product: any) {
		cart.addItem(product);
	}

	// Get platform color
	function getPlatformColor(platform: string): string {
		const colors: Record<string, string> = {
			instagram: 'from-pink-500 to-purple-600',
			tiktok: 'from-black to-gray-800',
			facebook: 'from-blue-600 to-blue-700',
			twitter: 'from-blue-400 to-blue-500',
			youtube: 'from-red-500 to-red-600'
		};
		return colors[platform] || 'from-gray-500 to-gray-600';
	}
</script>

<svelte:head>
	<title>Premium Social Media Accounts - FastAccs</title>
	<meta
		name="description"
		content="Browse our collection of verified social media accounts with real followers. Instagram, TikTok, Facebook, Twitter and more."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50">
	<!-- Hero Section -->
	<section class="bg-gradient-to-r from-purple-600 to-blue-600 py-16 text-white">
		<div class="mx-auto max-w-6xl px-4">
			<h1 class="mb-4 text-4xl font-bold md:text-5xl">Premium Social Media Accounts</h1>
			<p class="text-xl text-purple-100">
				Verified accounts with real followers, ready for immediate use
			</p>
		</div>
	</section>

	<div class="mx-auto max-w-6xl px-4 py-8">
		<!-- Filters -->
		<div class="mb-8 rounded-xl bg-white p-6 shadow-sm">
			<div class="mb-4 flex items-center gap-2">
				<Filter class="h-5 w-5 text-gray-600" />
				<h2 class="text-lg font-semibold">Filters</h2>
			</div>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
				<!-- Search -->
				<div>
					<label for="search-input" class="mb-2 block text-sm font-medium text-gray-700"
						>Search</label
					>
					<div class="relative">
						<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
						<input
							id="search-input"
							type="text"
							bind:value={searchTerm}
							placeholder="Search accounts..."
							class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
						/>
					</div>
				</div>

				<!-- Category -->
				<div>
					<label for="category-select" class="mb-2 block text-sm font-medium text-gray-700"
						>Category</label
					>
					<select
						id="category-select"
						bind:value={selectedCategory}
						class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
					>
						<option value="">All Categories</option>
						{#each data.categories as category}
							<option value={category.slug}>{category.name}</option>
						{/each}
					</select>
				</div>

				<!-- Platform -->
				<div>
					<label for="platform-select" class="mb-2 block text-sm font-medium text-gray-700"
						>Platform</label
					>
					<select
						id="platform-select"
						bind:value={selectedPlatform}
						class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
					>
						<option value="">All Platforms</option>
						<option value="instagram">Instagram</option>
						<option value="tiktok">TikTok</option>
						<option value="facebook">Facebook</option>
						<option value="twitter">Twitter</option>
						<option value="youtube">YouTube</option>
					</select>
				</div>

				<!-- Sort -->
				<div>
					<label for="sort-select" class="mb-2 block text-sm font-medium text-gray-700"
						>Sort By</label
					>
					<select
						id="sort-select"
						bind:value={sortBy}
						class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
					>
						<option value="newest">Newest First</option>
						<option value="price_low">Price: Low to High</option>
						<option value="price_high">Price: High to Low</option>
						<option value="followers">Most Followers</option>
						<option value="popular">Most Popular</option>
					</select>
				</div>
			</div>

			<div class="mt-4 flex justify-end">
				<button
					onclick={applyFilters}
					class="rounded-lg bg-purple-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-purple-700"
				>
					Apply Filters
				</button>
			</div>
		</div>

		<!-- Products Grid -->
		{#if data.error}
			<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
				<p class="text-red-600">{data.error}</p>
				<button
					onclick={() => window.location.reload()}
					class="mt-4 font-medium text-red-700 hover:text-red-800"
				>
					Try Again
				</button>
			</div>
		{:else if data.products.length === 0}
			<div class="rounded-lg bg-gray-100 p-12 text-center">
				<p class="mb-4 text-xl text-gray-600">No accounts found matching your criteria</p>
				<button
					onclick={() => goto('/products')}
					class="font-medium text-purple-600 hover:text-purple-700"
				>
					Clear all filters
				</button>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
				{#each data.products as product}
					<div
						class="overflow-hidden rounded-xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
					>
						<!-- Platform Badge -->
						<div class="relative">
							<div class="absolute top-3 left-3 z-10">
								<span
									class={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${getPlatformColor(product.platform)} px-3 py-1 text-xs font-medium text-white`}
								>
									<svelte:component
										this={platformIcons[product.platform] || Instagram}
										class="h-3 w-3"
									/>
									{product.platform.charAt(0).toUpperCase() + product.platform.slice(1)}
								</span>
							</div>

							{#if product.featured}
								<div class="absolute top-3 right-3 z-10">
									<span
										class="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800"
									>
										<Star class="mr-1 h-3 w-3 fill-current" />
										Featured
									</span>
								</div>
							{/if}

							<!-- Account Screenshot/Thumbnail -->
							<div class="aspect-video bg-gradient-to-br from-gray-100 to-gray-200">
								{#if product.thumbnail_url}
									<img
										src={product.thumbnail_url}
										alt={product.title}
										class="h-full w-full object-cover"
										loading="lazy"
									/>
								{:else}
									<div class="flex h-full items-center justify-center">
										<svelte:component
											this={platformIcons[product.platform] || Instagram}
											class="h-12 w-12 text-gray-400"
										/>
									</div>
								{/if}
							</div>
						</div>

						<!-- Content -->
						<div class="p-6">
							<h3 class="mb-2 line-clamp-2 text-lg font-bold text-gray-900">
								{product.title}
							</h3>

							{#if product.niche}
								<p class="mb-3 text-sm font-medium text-purple-600">
									{product.niche}
								</p>
							{/if}

							<!-- Stats -->
							<div class="mb-4 grid grid-cols-2 gap-4 text-sm">
								<div>
									<div class="flex items-center gap-1 text-gray-600">
										<Heart class="h-4 w-4" />
										<span>Followers</span>
									</div>
									<div class="font-semibold text-gray-900">
										{formatFollowers(product.follower_count || 0)}
									</div>
								</div>

								<div>
									<div class="flex items-center gap-1 text-gray-600">
										<Eye class="h-4 w-4" />
										<span>Following</span>
									</div>
									<div class="font-semibold text-gray-900">
										{formatFollowers(product.following_count || 0)}
									</div>
								</div>
							</div>

							<!-- Quality Indicators -->
							<div class="mb-4 flex flex-wrap gap-2">
								{#if product.verification_status === 'verified'}
									<span
										class="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800"
									>
										✓ Verified
									</span>
								{/if}

								{#if product.engagement_rate && product.engagement_rate > 3}
									<span
										class="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800"
									>
										High Engagement
									</span>
								{/if}

								{#if product.account_age_months && product.account_age_months > 12}
									<span
										class="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800"
									>
										{Math.floor(product.account_age_months / 12)}y old
									</span>
								{/if}
							</div>

							<!-- Price -->
							<div class="mb-4 flex items-center justify-between">
								<div>
									<div class="text-2xl font-bold text-gray-900">
										{formatPrice(product.price)}
									</div>
									{#if product.original_price && product.original_price > product.price}
										<div class="text-sm text-gray-500 line-through">
											{formatPrice(product.original_price)}
										</div>
									{/if}
								</div>

								{#if product.account_quality_score}
									<div class="flex items-center gap-1">
										<Star class="h-4 w-4 fill-yellow-400 text-yellow-400" />
										<span class="text-sm font-medium">{product.account_quality_score}/10</span>
									</div>
								{/if}
							</div>

							<!-- Actions -->
							<div class="flex gap-2">
								<button
									onclick={() => addToCart(product)}
									class="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
								>
									<ShoppingCart class="h-4 w-4" />
									Add to Cart
								</button>

								<button
									onclick={() => goto(`/product/${product.id}`)}
									class="flex-1 rounded-lg border-2 border-purple-600 py-3 font-semibold text-purple-600 transition-colors hover:bg-purple-50"
								>
									View Details
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Pagination -->
			<div class="mt-12 flex justify-center">
				<div class="flex items-center gap-2">
					<button
						class="rounded-lg border border-gray-300 px-4 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
						disabled={(data.currentPage || 1) <= 1}
					>
						Previous
					</button>

					<span class="px-4 py-2 text-sm text-gray-600">
						Page {data.currentPage || 1}
					</span>
					<button
						class="rounded-lg border border-gray-300 px-4 py-2 text-gray-600 hover:bg-gray-50"
					>
						Next
					</button>
				</div>
			</div>
		{/if}
	</div>
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
