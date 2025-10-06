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
		ArrowLeft
	} from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

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
			const millions = count / 1000000;
			return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
		} else if (count >= 1000) {
			const thousands = count / 1000;
			return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
		}
		return count.toString();
	}

	function navigateToTier(tierSlug: string) {
		goto(`/platforms/${data.platform?.slug}/tiers/${tierSlug}`);
	}

	function goBack() {
		goto('/platforms');
	}

	// Get tier status based on availability
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

	// Get tier features based on metadata
	function getTierFeatures(metadata: any): string[] {
		const features = [];
		if (metadata?.typical_features) {
			features.push(...metadata.typical_features);
		}
		if (metadata?.age_hint) {
			features.push(metadata.age_hint);
		}
		return features;
	}
</script>

<svelte:head>
	<title>{data.platform?.name} Accounts - FastAccs</title>
	<meta
		name="description"
		content="Premium {data.platform
			?.name} accounts with real followers. Choose from different tiers and get instant delivery with full account access."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50">
	{#if !data.platform}
		<!-- Platform not found -->
		<section class="py-16">
			<div class="mx-auto max-w-4xl px-4 text-center">
				<Package class="mx-auto mb-4 h-16 w-16 text-gray-400" />
				<h1 class="mb-4 text-3xl font-bold text-gray-900">Platform Not Found</h1>
				<p class="mb-8 text-lg text-gray-600">
					The platform you're looking for doesn't exist or isn't available right now.
				</p>
				<button
					onclick={goBack}
					class="rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white hover:bg-purple-700"
				>
					Back to Platforms
				</button>
			</div>
		</section>
	{:else}
		{@const PlatformIcon = getPlatformIcon(data.platform.slug)}

		<!-- Platform Header -->
		<section class={`bg-gradient-to-r ${getPlatformColor(data.platform.slug)} py-16 text-white`}>
			<div class="mx-auto max-w-6xl px-4">
				<!-- Breadcrumb -->
				<div class="mb-8 flex items-center gap-2 text-sm">
					<button onclick={goBack} class="flex items-center gap-2 hover:underline">
						<ArrowLeft class="h-4 w-4" />
						All Platforms
					</button>
					<span>/</span>
					<span class="font-medium">{data.platform.name}</span>
				</div>

				<div class="flex items-center justify-between">
					<div class="flex items-center gap-6">
						<div class="rounded-full bg-white/20 p-4">
							<PlatformIcon class="h-12 w-12" />
						</div>
						<div>
							<h1 class="mb-2 text-4xl font-bold">{data.platform.name} Accounts</h1>
							<p class="text-xl opacity-90">{data.platform.description}</p>
						</div>
					</div>

					<div class="text-right">
						<div class="text-3xl font-bold">{data.tiers.length}</div>
						<div class="text-sm opacity-75">Available Tiers</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Tier Selection -->
		<section class="py-16">
			<div class="mx-auto max-w-6xl px-4">
				<div class="mb-12 text-center">
					<h2 class="mb-4 text-3xl font-bold text-gray-900">Choose Your Tier</h2>
					<p class="text-lg text-gray-600">
						Select the follower count that matches your needs. All accounts come with full access.
					</p>
				</div>

				{#if data.tiers.length === 0}
					<div class="rounded-lg bg-yellow-50 p-8 text-center">
						<Package class="mx-auto mb-4 h-12 w-12 text-yellow-600" />
						<h3 class="mb-2 text-lg font-semibold text-yellow-800">No Tiers Available</h3>
						<p class="text-yellow-700">
							We're currently restocking {data.platform.name} accounts. Please check back soon!
						</p>
						<button
							onclick={goBack}
							class="mt-4 rounded-lg bg-yellow-600 px-6 py-2 text-white hover:bg-yellow-700"
						>
							Browse Other Platforms
						</button>
					</div>
				{:else}
					<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
						{#each data.tiers as tier}
							{@const tierStatus = getTierStatus(tier.visible_available)}
							{@const tierFeatures = getTierFeatures(tier.metadata)}
							<div
								class="group relative overflow-hidden rounded-xl bg-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
							>
								<!-- Stock Status Badge -->
								<div class="absolute top-4 right-4 z-10">
									<span
										class={`rounded-full border px-3 py-1 text-xs font-medium ${tierStatus.bgColor} ${tierStatus.color}`}
									>
										{tierStatus.status}
									</span>
								</div>

								<!-- Tier Header -->
								<div class="p-6">
									<div class="mb-4 flex items-center justify-between">
										<div>
											<h3 class="text-xl font-bold text-gray-900">{tier.tier_name}</h3>
											<p class="text-sm text-gray-600">
												{#if tier.metadata?.followers_range}
													{@const range = (tier.metadata as any).followers_range}
													{#if Array.isArray(range) && range.length >= 2}
														{formatFollowers(range[0])} - {formatFollowers(range[1])} followers
													{:else if typeof range === 'object' && range.min && range.max}
														{formatFollowers(range.min)} - {formatFollowers(range.max)} followers
													{:else}
														{formatFollowers((tier.metadata?.follower_count as number) || 0)} followers
													{/if}
												{:else}
													{formatFollowers((tier.metadata?.follower_count as number) || 0)} followers
												{/if}
											</p>
										</div>
										<div class="text-right">
											<div class="text-2xl font-bold text-purple-600">
												{formatPrice(tier.price)}
											</div>
											<div class="text-sm text-gray-500">per account</div>
										</div>
									</div>

									<!-- Availability -->
									<div class="mb-4 text-sm text-gray-600">
										<span class="font-medium">{tier.visible_available}</span> accounts available
										{#if tier.reservations_active > 0}
											<span class="text-yellow-600">
												• {tier.reservations_active} reserved
											</span>
										{/if}
									</div>

									<!-- Features -->
									{#if tierFeatures.length > 0}
										<div class="mb-6">
											<h4 class="mb-2 text-sm font-semibold text-gray-700">Features:</h4>
											<div class="space-y-1">
												{#each tierFeatures.slice(0, 3) as feature}
													<div class="flex items-center gap-2 text-sm text-gray-600">
														<Star class="h-3 w-3 text-green-500" />
														<span>{feature}</span>
													</div>
												{/each}
											</div>
										</div>
									{/if}

									<!-- Age Hint -->
									{#if tier.metadata?.age_hint}
										<div class="mb-4 rounded-lg bg-blue-50 p-3">
											<div class="flex items-center gap-2 text-sm text-blue-700">
												<Users class="h-4 w-4" />
												<span class="font-medium">Account Age:</span>
												<span>{tier.metadata.age_hint}</span>
											</div>
										</div>
									{/if}

									<!-- Action Button -->
									<button
										onclick={() => navigateToTier(tier.tier_slug)}
										disabled={tier.visible_available === 0}
										class="w-full rounded-lg bg-gray-900 py-3 font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
									>
										{#if tier.visible_available === 0}
											Out of Stock
										{:else}
											Select This Tier
										{/if}
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		<!-- Platform Benefits -->
		<section class="bg-white py-16">
			<div class="mx-auto max-w-4xl px-4 text-center">
				<h2 class="mb-8 text-3xl font-bold text-gray-900">
					Why Choose {data.platform.name} Accounts?
				</h2>
				<div class="grid grid-cols-1 gap-8 md:grid-cols-3">
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
						>
							<Users class="h-8 w-8 text-green-600" />
						</div>
						<h3 class="mb-2 text-lg font-semibold">Authentic Followers</h3>
						<p class="text-gray-600">
							Real {data.platform.name} followers with genuine engagement and activity
						</p>
					</div>

					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100"
						>
							<Package class="h-8 w-8 text-purple-600" />
						</div>
						<h3 class="mb-2 text-lg font-semibold">Full Account Access</h3>
						<p class="text-gray-600">
							Complete credentials including email access and password change ability
						</p>
					</div>

					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100"
						>
							<ShoppingCart class="h-8 w-8 text-blue-600" />
						</div>
						<h3 class="mb-2 text-lg font-semibold">Instant Delivery</h3>
						<p class="text-gray-600">
							Receive your account details immediately after payment confirmation
						</p>
					</div>
				</div>
			</div>
		</section>
	{/if}
</main>

<Footer />
