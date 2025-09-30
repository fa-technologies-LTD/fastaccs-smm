<script lang="ts">
	import { goto } from '$app/navigation';
	import { Instagram, Music, Facebook, Twitter, ArrowRight, Users, Package } from '@lucide/svelte';
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

	// Platform colors for gradients
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

	function navigateToPlatform(platformSlug: string) {
		goto(`/platforms/${platformSlug}`);
	}

	// Format numbers with commas
	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}
</script>

<svelte:head>
	<title>Choose Your Platform - FastAccs</title>
	<meta
		name="description"
		content="Select from our premium social media platforms: Instagram, TikTok, Twitter, and Facebook accounts with real followers and engagement."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50">
	<!-- Hero Section -->
	<section class="bg-gradient-to-r from-purple-600 to-blue-600 py-16 text-white">
		<div class="mx-auto max-w-4xl px-4 text-center">
			<h1 class="mb-4 text-4xl font-bold md:text-5xl">Choose Your Platform</h1>
			<p class="mb-8 text-xl text-purple-100">
				Premium social media accounts with real followers, authentic engagement, and instant
				delivery
			</p>
			<div class="flex items-center justify-center gap-8 text-sm">
				<div class="flex items-center gap-2">
					<Users class="h-5 w-5" />
					<span>Real Followers</span>
				</div>
				<div class="flex items-center gap-2">
					<Package class="h-5 w-5" />
					<span>Instant Delivery</span>
				</div>
				<div class="flex items-center gap-2">
					<ArrowRight class="h-5 w-5" />
					<span>24/7 Support</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Platform Selection -->
	<section class="py-16">
		<div class="mx-auto max-w-6xl px-4">
			<div class="mb-12 text-center">
				<h2 class="mb-4 text-3xl font-bold text-gray-900">Available Platforms</h2>
				<p class="text-lg text-gray-600">
					Choose from our collection of verified accounts with different follower tiers
				</p>
			</div>

			{#if data.platforms.length === 0}
				<div class="rounded-lg bg-yellow-50 p-8 text-center">
					<Package class="mx-auto mb-4 h-12 w-12 text-yellow-600" />
					<h3 class="mb-2 text-lg font-semibold text-yellow-800">No Platforms Available</h3>
					<p class="text-yellow-700">
						We're currently setting up our inventory. Please check back soon!
					</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-2">
					{#each data.platforms as platform}
						{@const PlatformIcon = getPlatformIcon(platform.slug)}
						<div
							class="group relative overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
						>
							<!-- Platform Gradient Header -->
							<div class={`bg-gradient-to-r ${getPlatformColor(platform.slug)} p-8 text-white`}>
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-4">
										<div class="rounded-full bg-white/20 p-3">
											<PlatformIcon class="h-8 w-8" />
										</div>
										<div>
											<h3 class="text-2xl font-bold">{platform.name}</h3>
											<p class="text-sm opacity-90">{platform.description}</p>
										</div>
									</div>
									<ArrowRight
										class="h-6 w-6 opacity-70 transition-transform group-hover:translate-x-1"
									/>
								</div>
							</div>

							<!-- Platform Stats -->
							<div class="p-8">
								<div class="mb-6 grid grid-cols-2 gap-4">
									<div class="text-center">
										<div class="text-2xl font-bold text-gray-900">
											{platform.tier_count || 0}
										</div>
										<div class="text-sm text-gray-600">Available Tiers</div>
									</div>
									<div class="text-center">
										<div class="text-2xl font-bold text-gray-900">
											{formatNumber(platform.total_accounts || 0)}
										</div>
										<div class="text-sm text-gray-600">Total Accounts</div>
									</div>
								</div>

								<!-- Tier Preview -->
								{#if platform.sample_tiers && platform.sample_tiers.length > 0}
									<div class="mb-6">
										<h4 class="mb-3 text-sm font-semibold text-gray-700">Available Tiers:</h4>
										<div class="flex flex-wrap gap-2">
											{#each platform.sample_tiers.slice(0, 4) as tier}
												<span
													class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
												>
													{tier.name}
												</span>
											{/each}
											{#if platform.sample_tiers.length > 4}
												<span
													class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500"
												>
													+{platform.sample_tiers.length - 4} more
												</span>
											{/if}
										</div>
									</div>
								{/if}

								<!-- Browse Button -->
								<button
									onclick={() => navigateToPlatform(platform.slug)}
									class="w-full rounded-lg bg-gray-900 py-3 font-semibold text-white transition-colors hover:bg-gray-800"
								>
									Browse {platform.name} Accounts
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- Features Section -->
	<section class="bg-white py-16">
		<div class="mx-auto max-w-4xl px-4 text-center">
			<h2 class="mb-8 text-3xl font-bold text-gray-900">Why Choose FastAccs?</h2>
			<div class="grid grid-cols-1 gap-8 md:grid-cols-3">
				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
					>
						<Users class="h-8 w-8 text-green-600" />
					</div>
					<h3 class="mb-2 text-lg font-semibold">Real Followers</h3>
					<p class="text-gray-600">
						All accounts come with genuine followers and authentic engagement rates
					</p>
				</div>

				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100"
					>
						<Package class="h-8 w-8 text-blue-600" />
					</div>
					<h3 class="mb-2 text-lg font-semibold">Instant Delivery</h3>
					<p class="text-gray-600">
						Receive your account credentials immediately after payment confirmation
					</p>
				</div>

				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100"
					>
						<ArrowRight class="h-8 w-8 text-purple-600" />
					</div>
					<h3 class="mb-2 text-lg font-semibold">24/7 Support</h3>
					<p class="text-gray-600">Get help anytime with our dedicated customer support team</p>
				</div>
			</div>
		</div>
	</section>
</main>

<Footer />
