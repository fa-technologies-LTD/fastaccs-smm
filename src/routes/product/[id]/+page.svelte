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
		Shield,
		Calendar,
		TrendingUp,
		ShoppingCart,
		Share2,
		CheckCircle,
		AlertCircle,
		Users,
		MessageCircle
	} from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import ImagePreviewModal from '$lib/components/ImagePreviewModal.svelte';

	import { cart } from '$lib/stores/cart';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let selectedImage = $state(0);
	let addingToCart = $state(false);
	let showFullDescription = $state(false);
	let showImagePreview = $state(false);

	// Platform icons mapping
	const platformIcons: Record<string, any> = {
		instagram: Instagram,
		tiktok: Music,
		facebook: Facebook,
		twitter: Twitter
	};

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

	// Get platform icon component
	function getPlatformIcon(platform: string) {
		return platformIcons[platform] || Instagram;
	}
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

	// Add to cart function
	async function handleAddToCart() {
		addingToCart = true;

		try {
			cart.addItem(data.product);
			// Show success message or animation
			console.log('Added to cart:', data.product.title);
		} catch (error) {
			console.error('Error adding to cart:', error);
		} finally {
			addingToCart = false;
		}
	}

	// Share product
	async function shareProduct() {
		if (navigator.share) {
			try {
				await navigator.share({
					title: data.product.title,
					text: `Check out this ${data.product.platform} account on FastAccs`,
					url: window.location.href
				});
			} catch (error) {
				// User cancelled sharing
			}
		} else {
			// Fallback: copy to clipboard
			await navigator.clipboard.writeText(window.location.href);
			alert('Link copied to clipboard!');
		}
	}

	// Calculate savings percentage
	function getSavingsPercentage() {
		if (!data.product.original_price || data.product.original_price <= data.product.price) {
			return 0;
		}
		return Math.round(
			((data.product.original_price - data.product.price) / data.product.original_price) * 100
		);
	}
</script>

<svelte:head>
	<title>{data.product.title} - FastAccs</title>
	<meta
		name="description"
		content={data.product.description ||
			`Premium ${data.product.platform} account with ${formatFollowers(data.product.follower_count || 0)} followers`}
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50">
	<div class="mx-auto max-w-6xl px-4 py-8">
		<!-- Breadcrumb -->
		<nav class="mb-6 flex items-center space-x-2 text-sm text-gray-600">
			<a href="/" class="hover:text-purple-600">Home</a>
			<span>/</span>
			<a href="/products" class="hover:text-purple-600">Products</a>
			<span>/</span>
			<a href="/products?platform={data.product.platform}" class="capitalize hover:text-purple-600">
				{data.product.platform}
			</a>
			<span>/</span>
			<span class="text-gray-900">{data.product.title}</span>
		</nav>

		<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
			<!-- Images Section -->
			<div>
				<!-- Main Image -->
				<div class="mb-4 aspect-square overflow-hidden rounded-xl bg-gray-100">
					{#if data.product.screenshot_urls && data.product.screenshot_urls.length > 0}
						<img
							src={data.product.screenshot_urls[selectedImage]}
							alt={data.product.title}
							class="h-full w-full object-cover"
						/>
					{:else if data.product.thumbnail_url}
						<img
							src={data.product.thumbnail_url}
							alt={data.product.title}
							class="h-full w-full object-cover"
						/>
					{:else}
						<div class="flex h-full items-center justify-center">
							{#if getPlatformIcon(data.product.platform)}
								{@const PlatformIcon = getPlatformIcon(data.product.platform)}
								<PlatformIcon class="h-20 w-20 text-gray-400" />
							{/if}
						</div>
					{/if}
				</div>

				<!-- Thumbnail Gallery -->
				{#if data.product.screenshot_urls && data.product.screenshot_urls.length > 1}
					<div class="mb-4 grid grid-cols-4 gap-2">
						{#each data.product.screenshot_urls as image, index}
							<button
								onclick={() => (selectedImage = index)}
								class="aspect-square overflow-hidden rounded-lg border-2 {selectedImage === index
									? 'border-purple-500'
									: 'border-gray-200'}"
							>
								<img src={image} alt="Screenshot {index + 1}" class="h-full w-full object-cover" />
							</button>
						{/each}
					</div>

					<!-- Preview All Images Button -->
					<button
						onclick={() => (showImagePreview = true)}
						class="w-full rounded-lg border-2 border-purple-300 bg-purple-50 px-4 py-3 font-medium text-purple-700 transition-colors hover:bg-purple-100"
					>
						<Eye class="mr-2 inline h-4 w-4" />
						Preview All Images ({data.product.screenshot_urls.length})
					</button>
				{/if}
			</div>

			<!-- Product Info -->
			<div>
				<!-- Platform Badge -->
				<div class="mb-4 flex items-center justify-between">
					<span
						class={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${getPlatformColor(data.product.platform)} px-4 py-2 text-sm font-medium text-white`}
					>
						{#if getPlatformIcon(data.product.platform)}
							{@const PlatformIcon = getPlatformIcon(data.product.platform)}
							<PlatformIcon class="h-4 w-4" />
						{/if}
						{data.product.platform.charAt(0).toUpperCase() + data.product.platform.slice(1)} Account
					</span>

					<button
						onclick={shareProduct}
						class="rounded-full bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
					>
						<Share2 class="h-4 w-4" />
					</button>
				</div>

				<h1 class="mb-4 text-3xl font-bold text-gray-900">{data.product.title}</h1>

				{#if data.product.niche}
					<p class="mb-4 text-lg font-medium text-purple-600">{data.product.niche}</p>
				{/if}

				<!-- Price -->
				<div class="mb-6">
					<div class="flex items-baseline gap-3">
						<span class="text-3xl font-bold text-gray-900">{formatPrice(data.product.price)}</span>
						{#if data.product.original_price && data.product.original_price > data.product.price}
							<span class="text-base text-gray-500 line-through"
								>{formatPrice(data.product.original_price)}</span
							>
							<span class="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
								Save {getSavingsPercentage()}%
							</span>
						{/if}
					</div>
				</div>

				<!-- Key Stats -->
				<div class="mb-6 grid grid-cols-2 gap-4 rounded-xl bg-white p-6 shadow-sm">
					<div class="text-center">
						<div class="mb-1 flex items-center justify-center gap-2 text-gray-600">
							<Heart class="h-4 w-4" />
							<span class="text-sm">Followers</span>
						</div>
						<div class="text-xl font-bold text-gray-900">
							{formatFollowers(data.product.follower_count || 0)}
						</div>
					</div>

					<div class="text-center">
						<div class="mb-1 flex items-center justify-center gap-2 text-gray-600">
							<Eye class="h-4 w-4" />
							<span class="text-sm">Following</span>
						</div>
						<div class="text-xl font-bold text-gray-900">
							{formatFollowers(data.product.following_count || 0)}
						</div>
					</div>

					{#if data.product.posts_count}
						<div class="text-center">
							<div class="mb-1 flex items-center justify-center gap-2 text-gray-600">
								<MessageCircle class="h-4 w-4" />
								<span class="text-sm">Posts</span>
							</div>
							<div class="text-xl font-bold text-gray-900">
								{formatFollowers(data.product.posts_count)}
							</div>
						</div>
					{/if}

					{#if data.product.engagement_rate}
						<div class="text-center">
							<div class="mb-1 flex items-center justify-center gap-2 text-gray-600">
								<TrendingUp class="h-4 w-4" />
								<span class="text-sm">Engagement</span>
							</div>
							<div class="text-xl font-bold text-gray-900">
								{data.product.engagement_rate.toFixed(1)}%
							</div>
						</div>
					{/if}
				</div>

				<!-- Quality Indicators -->
				<div class="mb-6 space-y-3">
					{#if data.product.verification_status === 'verified'}
						<div class="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
							<CheckCircle class="h-5 w-5 text-green-600" />
							<span class="font-medium text-green-800">Verified Account</span>
						</div>
					{/if}

					{#if data.product.account_quality_score}
						<div class="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
							<Star class="h-5 w-5 text-blue-600" />
							<span class="font-medium text-blue-800"
								>Quality Score: {data.product.account_quality_score}/10</span
							>
						</div>
					{/if}

					{#if data.product.account_age_months}
						<div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
							<Calendar class="h-5 w-5 text-gray-600" />
							<span class="font-medium text-gray-800">
								Account Age: {Math.floor(data.product.account_age_months / 12)} years, {data.product
									.account_age_months % 12} months
							</span>
						</div>
					{/if}
				</div>

				<!-- Stock Status -->
				{#if data.product.stock_quantity <= 1}
					<div
						class="mb-6 flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3"
					>
						<AlertCircle class="h-5 w-5 text-orange-600" />
						<span class="font-medium text-orange-800"
							>Only {data.product.stock_quantity} left in stock!</span
						>
					</div>
				{/if}

				<!-- Purchase Disclaimer -->
				<div class="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
					<div class="mb-2 flex items-center gap-3">
						<AlertCircle class="h-5 w-5 text-amber-600" />
						<span class="font-semibold text-amber-800">Important Notice</span>
					</div>
					<div class="space-y-2 text-sm text-amber-700">
						<p>
							• By purchasing this account, you acknowledge that social media platforms may have
							policies regarding account transfers.
						</p>
						<p>
							• We recommend changing the password and security settings immediately upon receipt.
						</p>
						<p>
							• Account performance (followers, engagement) may vary after transfer due to platform
							algorithms.
						</p>
						<p>
							• FastAccs provides the account "as-is" and cannot guarantee future performance
							metrics.
						</p>
						<p class="font-medium">
							• All sales are final. Please review account details carefully before purchase.
						</p>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="mb-8 space-y-3">
					<button
						onclick={handleAddToCart}
						disabled={addingToCart || data.product.is_sold || data.product.stock_quantity <= 0}
						class="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2 text-base font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if addingToCart}
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
							></div>
							Adding to Cart...
						{:else if data.product.is_sold || data.product.stock_quantity <= 0}
							Sold Out
						{:else}
							<ShoppingCart class="h-5 w-5" />
							Add to Cart
						{/if}
					</button>

					<button
						class="w-full rounded-xl border-2 border-purple-600 py-2 text-base font-semibold text-purple-600 transition-colors hover:bg-purple-50"
					>
						Buy Now
					</button>
				</div>

				<!-- Guarantee -->
				<div class="rounded-lg border border-green-200 bg-green-50 p-4">
					<div class="mb-2 flex items-center gap-3">
						<Shield class="h-5 w-5 text-green-600" />
						<span class="font-semibold text-green-800">FastAccs Guarantee</span>
					</div>
					<ul class="space-y-1 text-sm text-green-700">
						<li>• Instant delivery after payment confirmation</li>
						<li>• 100% authentic account with real followers</li>
						<li>• 7-day money-back guarantee</li>
						<li>• 24/7 customer support</li>
					</ul>
				</div>
			</div>
		</div>

		<!-- Description & Details -->
		<div class="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
			<div class="lg:col-span-2">
				<div class="rounded-xl bg-white p-6 shadow-sm">
					<h2 class="mb-4 text-2xl font-bold">Account Details</h2>

					{#if data.product.description}
						<div class="prose max-w-none">
							<div class={showFullDescription ? '' : 'line-clamp-3'}>
								{data.product.description}
							</div>
							{#if data.product.description.length > 200}
								<button
									onclick={() => (showFullDescription = !showFullDescription)}
									class="mt-2 font-medium text-purple-600 hover:text-purple-700"
								>
									{showFullDescription ? 'Show Less' : 'Read More'}
								</button>
							{/if}
						</div>
					{/if}

					{#if data.product.tags && data.product.tags.length > 0}
						<div class="mt-6">
							<h3 class="mb-3 font-semibold">Tags</h3>
							<div class="flex flex-wrap gap-2">
								{#each data.product.tags as tag}
									<span class="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
										{tag}
									</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="space-y-6">
				<!-- Account Specs -->
				<div class="rounded-xl bg-white p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-bold">Account Specifications</h3>
					<dl class="space-y-3">
						<div class="flex justify-between">
							<dt class="text-gray-600">Platform</dt>
							<dd class="font-medium capitalize">{data.product.platform}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-gray-600">Followers</dt>
							<dd class="font-medium">{formatFollowers(data.product.follower_count || 0)}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-gray-600">Following</dt>
							<dd class="font-medium">{formatFollowers(data.product.following_count || 0)}</dd>
						</div>
						{#if data.product.posts_count}
							<div class="flex justify-between">
								<dt class="text-gray-600">Posts</dt>
								<dd class="font-medium">{formatFollowers(data.product.posts_count)}</dd>
							</div>
						{/if}
						{#if data.product.engagement_rate}
							<div class="flex justify-between">
								<dt class="text-gray-600">Engagement Rate</dt>
								<dd class="font-medium">{data.product.engagement_rate.toFixed(1)}%</dd>
							</div>
						{/if}
						{#if data.product.account_age_months}
							<div class="flex justify-between">
								<dt class="text-gray-600">Account Age</dt>
								<dd class="font-medium">
									{Math.floor(data.product.account_age_months / 12)}y {data.product
										.account_age_months % 12}m
								</dd>
							</div>
						{/if}
					</dl>
				</div>

				<!-- Security -->
				<div class="rounded-xl bg-white p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-bold">Security Features</h3>
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-gray-600">2FA Enabled</span>
							<span
								class={`font-medium ${data.product.two_factor_enabled ? 'text-green-600' : 'text-red-500'}`}
							>
								{data.product.two_factor_enabled ? 'Yes' : 'No'}
							</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-gray-600">Easy Login</span>
							<span
								class={`font-medium ${data.product.easy_login_enabled ? 'text-green-600' : 'text-red-500'}`}
							>
								{data.product.easy_login_enabled ? 'Yes' : 'No'}
							</span>
						</div>
					</div>

					<hr class="my-4" />

					<h4 class="mb-3 font-medium">Delivery Includes</h4>
					<ul class="space-y-2 text-sm text-gray-700">
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-green-600" />
							Original email access included
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-green-600" />
							Password can be changed
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-green-600" />
							Account details via WhatsApp/Email
						</li>
						<li class="flex items-center gap-2">
							<CheckCircle class="h-4 w-4 text-green-600" />
							24/7 support included
						</li>
					</ul>
				</div>
			</div>
		</div>

		<!-- Related Products -->
		{#if data.relatedProducts.length > 0}
			<div class="mt-12">
				<h2 class="mb-6 text-2xl font-bold">
					Related {data.product.platform.charAt(0).toUpperCase() + data.product.platform.slice(1)} Accounts
				</h2>

				<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
					{#each data.relatedProducts as product}
						<div
							class="overflow-hidden rounded-xl bg-white shadow-sm transition-all duration-300 hover:shadow-lg"
						>
							<div class="aspect-video bg-gray-100">
								{#if product.thumbnail_url}
									<img
										src={product.thumbnail_url}
										alt={product.title}
										class="h-full w-full object-cover"
									/>
								{:else}
									<div class="flex h-full items-center justify-center">
										{#if getPlatformIcon(product.platform)}
											{@const PlatformIcon = getPlatformIcon(product.platform)}
											<PlatformIcon class="h-8 w-8 text-gray-400" />
										{/if}
									</div>
								{/if}
							</div>

							<div class="p-4">
								<h3 class="mb-2 line-clamp-2 font-semibold">{product.title}</h3>
								<div class="mb-3 flex items-center justify-between text-sm text-gray-600">
									<span>{formatFollowers(product.follower_count || 0)} followers</span>
									<span class="font-bold text-gray-900">{formatPrice(product.price)}</span>
								</div>
								<button
									onclick={() => goto(`/product/${product.id}`)}
									class="w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-700"
								>
									View Details
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</main>

<!-- Image Preview Modal -->
{#if data.product.screenshot_urls && data.product.screenshot_urls.length > 0}
	<ImagePreviewModal
		images={data.product.screenshot_urls}
		isOpen={showImagePreview}
		onClose={() => (showImagePreview = false)}
		initialIndex={selectedImage}
	/>
{/if}

<Footer />

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
