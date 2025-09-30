<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Instagram,
		Music,
		Facebook,
		Twitter,
		ShoppingCart,
		Star,
		Users,
		Package,
		ArrowLeft,
		Plus,
		Minus,
		Shield,
		CheckCircle
	} from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { cart } from '$lib/stores/cart';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Reactive state for quantity selection
	let selectedQuantity = $state(1);
	let addingToCart = $state(false);

	// Platform icons mapping
	const platformIcons: Record<string, any> = {
		instagram: Instagram,
		tiktok: Music,
		facebook: Facebook,
		twitter: Twitter
	};

	// Platform colors
	const platformColors: Record<string, string> = {
		instagram: 'from-pink-500 to-purple-600',
		tiktok: 'from-black to-gray-800',
		facebook: 'from-blue-600 to-blue-700',
		twitter: 'from-blue-400 to-blue-500'
	};

	function getPlatformIcon(platform: string) {
		return platformIcons[platform.toLowerCase()] || Package;
	}

	function getPlatformColor(platform: string): string {
		return platformColors[platform.toLowerCase()] || 'from-gray-500 to-gray-600';
	}

	// Format price to Nigerian Naira
	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN',
			minimumFractionDigits: 0
		}).format(price);
	}

	// Format follower count
	function formatFollowers(count: number): string {
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(1)}M`;
		} else if (count >= 1000) {
			return `${(count / 1000).toFixed(1)}K`;
		}
		return count.toString();
	}

	// Navigation functions
	function goBackToPlatform() {
		goto(`/platforms/${data.platform?.slug}`);
	}

	function goBackToPlatforms() {
		goto('/platforms');
	}

	// Quantity controls
	function decreaseQuantity() {
		if (selectedQuantity > 1) {
			selectedQuantity--;
		}
	}

	function increaseQuantity() {
		if (selectedQuantity < (data.tier?.visible_available || 0)) {
			selectedQuantity++;
		}
	}

	// Calculate total price
	const totalPrice = $derived((data.tier?.price || 0) * selectedQuantity);

	// Add to cart functionality
	async function addToCart() {
		if (!data.product || !data.tier || addingToCart) return;

		addingToCart = true;
		try {
			// Validate quantity doesn't exceed available
			if (selectedQuantity > data.tier.visible_available) {
				alert(`Only ${data.tier.visible_available} accounts available for this tier`);
				return;
			}

			// Use the existing cart system with the product data - now async with reservations
			await cart.addItem(data.product, selectedQuantity);

			// Success feedback
			alert(
				`Added ${selectedQuantity} ${data.tier.tier_name} account${selectedQuantity > 1 ? 's' : ''} to cart with 30-minute reservation!`
			);

			// Redirect to checkout
			goto('/checkout');
		} catch (error) {
			console.error('Error adding to cart:', error);
			alert('Failed to add items to cart. Please try again.');
		} finally {
			addingToCart = false;
		}
	}

	// Get tier features from metadata
	function getTierFeatures(metadata: Record<string, unknown>): string[] {
		const features = [];
		if (metadata?.typical_features && Array.isArray(metadata.typical_features)) {
			features.push(...metadata.typical_features);
		}
		return features;
	}

	// Get tier status
	function getTierStatus(available: number): { status: string; color: string; bgColor: string } {
		if (available === 0) {
			return { status: 'Out of Stock', color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' };
		} else if (available <= 10) {
			return {
				status: 'Low Stock',
				color: 'text-yellow-600',
				bgColor: 'bg-yellow-50 border-yellow-200'
			};
		} else {
			return {
				status: 'In Stock',
				color: 'text-green-600',
				bgColor: 'bg-green-50 border-green-200'
			};
		}
	}
</script>

<svelte:head>
	<title>{data.platform?.name} {data.tier?.tier_name} - FastAccs</title>
	<meta
		name="description"
		content="Buy {data.platform?.name} accounts with {data.tier?.metadata?.follower_count ||
			0} followers. Premium quality accounts with instant delivery and full access."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50">
	{#if !data.platform || !data.tier}
		<!-- Not found -->
		<section class="py-16">
			<div class="mx-auto max-w-4xl px-4 text-center">
				<Package class="mx-auto mb-4 h-16 w-16 text-gray-400" />
				<h1 class="mb-4 text-3xl font-bold text-gray-900">Tier Not Found</h1>
				<p class="mb-8 text-lg text-gray-600">
					The tier you're looking for doesn't exist or isn't available right now.
				</p>
				<div class="flex justify-center gap-4">
					<button
						onclick={goBackToPlatforms}
						class="rounded-lg bg-gray-600 px-6 py-3 font-semibold text-white hover:bg-gray-700"
					>
						All Platforms
					</button>
				</div>
			</div>
		</section>
	{:else}
		{@const PlatformIcon = getPlatformIcon(data.platform.slug)}
		{@const tierStatus = getTierStatus(data.tier.visible_available)}

		<!-- Breadcrumb -->
		<section class="bg-white py-6">
			<div class="mx-auto max-w-6xl px-4">
				<div class="flex items-center gap-2 text-sm text-gray-600">
					<button onclick={goBackToPlatforms} class="hover:text-purple-600"> All Platforms </button>
					<span>/</span>
					<button onclick={goBackToPlatform} class="hover:text-purple-600">
						{data.platform.name}
					</button>
					<span>/</span>
					<span class="font-medium text-gray-900">{data.tier.tier_name}</span>
				</div>
			</div>
		</section>

		<!-- Tier Header -->
		<section class={`bg-gradient-to-r ${getPlatformColor(data.platform.slug)} py-16 text-white`}>
			<div class="mx-auto max-w-6xl px-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-6">
						<div class="rounded-full bg-white/20 p-4">
							<PlatformIcon class="h-12 w-12" />
						</div>
						<div>
							<div class="mb-2 flex items-center gap-4">
								<h1 class="text-4xl font-bold">{data.tier.tier_name}</h1>
								<span
									class={`rounded-full border border-white/30 bg-white/20 px-3 py-1 text-sm font-medium`}
								>
									{tierStatus.status}
								</span>
							</div>
							<p class="text-xl opacity-90">
								{data.platform.name} accounts with {formatFollowers(
									(data.tier.metadata?.follower_count as number) || 0
								)} followers
							</p>
							<p class="mt-2 text-lg opacity-75">
								{data.tier.visible_available} accounts available
								{#if data.tier.reservations_active > 0}
									• {data.tier.reservations_active} reserved
								{/if}
							</p>
						</div>
					</div>

					<div class="text-right">
						<div class="text-4xl font-bold">{formatPrice(data.tier.price)}</div>
						<div class="text-lg opacity-75">per account</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Main Content -->
		<section class="py-16">
			<div class="mx-auto max-w-6xl px-4">
				<div class="grid grid-cols-1 gap-12 lg:grid-cols-3">
					<!-- Left Column - Details -->
					<div class="lg:col-span-2">
						<!-- Tier Description -->
						<div class="mb-8 rounded-xl bg-white p-8 shadow-sm">
							<h2 class="mb-4 text-2xl font-bold text-gray-900">Account Details</h2>
							<p class="mb-6 text-lg text-gray-700">
								{data.tier.category_name ||
									`Premium ${data.platform.name} accounts with ${formatFollowers((data.tier.metadata?.follower_count as number) || 0)} followers.`}
							</p>

							<!-- Features -->
							{#if getTierFeatures(data.tier.metadata).length > 0}
								{@const features = getTierFeatures(data.tier.metadata)}
								<div class="mb-6">
									<h3 class="mb-4 text-lg font-semibold text-gray-900">What's Included:</h3>
									<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
										{#each features as feature}
											<div class="flex items-center gap-3">
												<CheckCircle class="h-5 w-5 text-green-500" />
												<span class="text-gray-700">{feature}</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Standard Features -->
							<div class="mb-6">
								<h3 class="mb-4 text-lg font-semibold text-gray-900">Standard Features:</h3>
								<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-green-500" />
										<span class="text-gray-700">Full account access</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-green-500" />
										<span class="text-gray-700">Original email included</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-green-500" />
										<span class="text-gray-700">Password changeable</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-green-500" />
										<span class="text-gray-700">Instant delivery</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-green-500" />
										<span class="text-gray-700">24/7 support</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-green-500" />
										<span class="text-gray-700">No violations history</span>
									</div>
								</div>
							</div>

							<!-- Account Age Info -->
							{#if data.tier.metadata?.age_hint}
								<div class="rounded-lg bg-blue-50 p-4">
									<div class="flex items-center gap-3">
										<Users class="h-5 w-5 text-blue-600" />
										<span class="font-medium text-blue-900">Account Age:</span>
										<span class="text-blue-700">{data.tier.metadata.age_hint}</span>
									</div>
								</div>
							{/if}
						</div>

						<!-- Security Features -->
						<div class="rounded-xl bg-white p-8 shadow-sm">
							<h2 class="mb-6 text-2xl font-bold text-gray-900">Security & Safety</h2>
							<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div class="flex items-center gap-3 rounded-lg bg-green-50 p-4">
									<Shield class="h-6 w-6 text-green-600" />
									<div>
										<div class="font-semibold text-green-900">Secure Transfer</div>
										<div class="text-sm text-green-700">Safe account handover process</div>
									</div>
								</div>
								<div class="flex items-center gap-3 rounded-lg bg-blue-50 p-4">
									<CheckCircle class="h-6 w-6 text-blue-600" />
									<div>
										<div class="font-semibold text-blue-900">Quality Assured</div>
										<div class="text-sm text-blue-700">All accounts verified before sale</div>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Right Column - Purchase -->
					<div class="lg:col-span-1">
						<div class="sticky top-6 rounded-xl bg-white p-8 shadow-lg">
							<h3 class="mb-6 text-xl font-bold text-gray-900">Select Quantity</h3>

							<!-- Quantity Selector -->
							<div class="mb-6">
								<label class="mb-3 block text-sm font-medium text-gray-700" for="quantity-selector">
									How many accounts do you need?
								</label>
								<div
									class="flex items-center gap-4"
									role="group"
									aria-labelledby="quantity-selector"
								>
									<button
										onclick={decreaseQuantity}
										disabled={selectedQuantity <= 1}
										class="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
									>
										<Minus class="h-4 w-4" />
									</button>
									<div class="flex-1 text-center">
										<div class="text-2xl font-bold text-gray-900">{selectedQuantity}</div>
										<div class="text-sm text-gray-500">
											{selectedQuantity === 1 ? 'account' : 'accounts'}
										</div>
									</div>
									<button
										onclick={increaseQuantity}
										disabled={selectedQuantity >= data.tier.visible_available}
										class="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
									>
										<Plus class="h-4 w-4" />
									</button>
								</div>
								<div class="mt-2 text-center text-sm text-gray-500">
									Maximum: {data.tier.visible_available} available
								</div>
							</div>

							<!-- Price Summary -->
							<div class="mb-6 rounded-lg bg-gray-50 p-4">
								<div class="flex items-center justify-between text-sm text-gray-600">
									<span>Price per account:</span>
									<span>{formatPrice(data.tier.price)}</span>
								</div>
								<div class="flex items-center justify-between text-sm text-gray-600">
									<span>Quantity:</span>
									<span>×{selectedQuantity}</span>
								</div>
								<hr class="my-3" />
								<div class="flex items-center justify-between text-lg font-bold text-gray-900">
									<span>Total:</span>
									<span class="text-purple-600">{formatPrice(totalPrice)}</span>
								</div>
							</div>

							<!-- Add to Cart Button -->
							<button
								onclick={addToCart}
								disabled={data.tier.visible_available === 0 || addingToCart}
								class="w-full rounded-lg bg-purple-600 py-4 font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-300"
							>
								{#if addingToCart}
									<div class="flex items-center justify-center gap-2">
										<div
											class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
										></div>
										Adding to Cart...
									</div>
								{:else if data.tier.visible_available === 0}
									Out of Stock
								{:else}
									<div class="flex items-center justify-center gap-2">
										<ShoppingCart class="h-5 w-5" />
										Add to Cart - {formatPrice(totalPrice)}
									</div>
								{/if}
							</button>

							<!-- Stock Warning -->
							{#if data.tier.visible_available <= 10 && data.tier.visible_available > 0}
								<div class="mt-4 rounded-lg bg-yellow-50 p-3">
									<div class="text-sm text-yellow-800">
										⚠️ Only {data.tier.visible_available} accounts left in stock!
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</section>
	{/if}
</main>

<Footer />
