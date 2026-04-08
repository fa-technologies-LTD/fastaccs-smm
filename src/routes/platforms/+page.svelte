<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowRight, Users, Package } from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';
	import {
		getPlatformColor,
		getPlatformIcon,
		isPlatformImageUrl
	} from '$lib/helpers/platformColors';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let searchQuery = $state('');
	let filterQuery = $state('all');
	let failedPlatformIcons = $state<Record<string, boolean>>({});

	interface PlatformMetadata {
		icon?: unknown;
		color?: unknown;
	}

	function navigateToPlatform(platformSlug: string) {
		goto(`/platforms/${platformSlug}`);
	}

	function getPlatformMetadata(metadata: Record<string, unknown> | undefined): PlatformMetadata {
		return (metadata as PlatformMetadata | undefined) || {};
	}

	function shouldRenderCustomIcon(platformId: string, metadata: PlatformMetadata): boolean {
		return isPlatformImageUrl(metadata.icon) && !failedPlatformIcons[platformId];
	}

	function markPlatformIconFailed(platformId: string) {
		failedPlatformIcons = {
			...failedPlatformIcons,
			[platformId]: true
		};
	}

	function getPlatformHeaderStyle(metadata: PlatformMetadata | undefined): string | undefined {
		const color = typeof metadata?.color === 'string' ? metadata.color.trim() : '';
		if (!color) return undefined;

		return `background: linear-gradient(135deg, ${color} 0%, rgba(15, 22, 47, 0.88) 100%);`;
	}

	// Format numbers with commas
	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function handleSearch() {
		// Search logic can be implemented here if needed
		// For now, just reactive to searchQuery changes
	}

	// Filter platforms based on search and filter
	let filteredPlatforms = $derived(() => {
		let platforms = data.platforms || [];

		// Apply search filter
		if (searchQuery.trim()) {
			platforms = platforms.filter(
				(p) =>
					p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					(p.description || '').toLowerCase().includes(searchQuery.toLowerCase())
			);
		}

		// Apply category filter
		if (filterQuery !== 'all') {
			// You can implement specific filter logic here
			// For now, just return all platforms
		}

		return platforms;
	});
</script>

<svelte:head>
	<title>Choose Your Platform - FastAccs</title>
	<meta
		name="description"
		content="Browse available social media platforms and account tiers with current stock and pricing."
	/>
</svelte:head>

<Navigation />
<main class="min-h-screen" style="background: var(--bg);">
	<!-- Hero Section -->
	<section
		class="relative overflow-hidden"
		style="padding: var(--space-4xl) var(--space-md); background: var(--bg);"
	>
		<div class="mx-auto max-w-4xl px-4 text-center">
			<!-- All Platforms Label -->
			<div class="mb-6 flex items-center justify-center gap-2">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					style="color: var(--text-muted);"
				>
					<polygon
						points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
					></polygon>
				</svg>
				<span
					style="color: var(--text-muted); font-family: var(--font-body); font-size: 0.875rem; font-weight: 500;"
				>
					All Platforms
				</span>
			</div>

			<h1
				class="mb-4"
				style="font-size: clamp(2rem, 5vw, 3rem); font-weight: 700; color: var(--text); font-family: var(--font-head); line-height: 1.2;"
			>
				Choose Your Platform
			</h1>

			<p
				class="mx-auto mb-8 max-w-2xl"
				style="font-size: 1rem; color: var(--text-muted); font-family: var(--font-body); line-height: 1.6;"
			>
				Explore available account categories, compare tiers, and purchase through secure checkout.
			</p>

			<!-- Feature Badges -->
			<div class="mb-8 flex flex-wrap items-center justify-center gap-3">
				<div
					class="flex items-center gap-2 rounded-full px-4 py-2"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						style="color: var(--primary);"
					>
						<polyline points="20 6 9 17 4 12"></polyline>
					</svg>
					<span
						style="font-size: 0.875rem; color: var(--text); font-family: var(--font-body); font-weight: 500;"
					>
						Multiple Tiers
					</span>
				</div>
				<div
					class="flex items-center gap-2 rounded-full px-4 py-2"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						style="color: #3B82F6;"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<polyline points="12 6 12 12 16 14"></polyline>
					</svg>
					<span
						style="font-size: 0.875rem; color: var(--text); font-family: var(--font-body); font-weight: 500;"
					>
						Instant Delivery
					</span>
				</div>
				<div
					class="flex items-center gap-2 rounded-full px-4 py-2"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<span
						style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #FCD34D;"
					></span>
					<span
						style="font-size: 0.875rem; color: var(--text); font-family: var(--font-body); font-weight: 500;"
					>
						24/7 Support
					</span>
				</div>
			</div>

			<!-- Search and Filter Section -->
			<div
				class="mx-auto max-w-3xl rounded-2xl p-6"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<!-- Search Input -->
				<div class="mb-4">
					<div
						class="flex items-center gap-3 rounded-lg px-4 py-3"
						style="background: var(--bg-elev-2); border: 1px solid var(--border);"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							style="color: var(--text-muted);"
						>
							<circle cx="11" cy="11" r="8"></circle>
							<path d="m21 21-4.35-4.35"></path>
						</svg>
						<input
							type="text"
							placeholder="Search platforms..."
							bind:value={searchQuery}
							oninput={handleSearch}
							class="flex-1 bg-transparent outline-none"
							style="color: var(--text); font-family: var(--font-body); font-size: 0.9375rem;"
						/>
					</div>
				</div>

				<!-- Filter Buttons -->
				<div class="flex flex-wrap gap-2">
					<button
						onclick={() => (filterQuery = 'all')}
						class="rounded-full px-4 py-2 transition-all"
						style={filterQuery === 'all'
							? 'background: var(--primary); color: white; font-family: var(--font-body); font-size: 0.875rem; font-weight: 500;'
							: 'background: var(--bg-elev-2); color: var(--text-muted); font-family: var(--font-body); font-size: 0.875rem; font-weight: 500; border: 1px solid var(--border);'}
					>
						All
					</button>
					<button
						onclick={() => (filterQuery = 'popular')}
						class="rounded-full px-4 py-2 transition-all"
						style={filterQuery === 'popular'
							? 'background: var(--primary); color: white; font-family: var(--font-body); font-size: 0.875rem; font-weight: 500;'
							: 'background: var(--bg-elev-2); color: var(--text-muted); font-family: var(--font-body); font-size: 0.875rem; font-weight: 500; border: 1px solid var(--border);'}
					>
						Most Popular
					</button>
					<button
						onclick={() => (filterQuery = 'available')}
						class="rounded-full px-4 py-2 transition-all"
						style={filterQuery === 'available'
							? 'background: var(--primary); color: white; font-family: var(--font-body); font-size: 0.875rem; font-weight: 500;'
							: 'background: var(--bg-elev-2); color: var(--text-muted); font-family: var(--font-body); font-size: 0.875rem; font-weight: 500; border: 1px solid var(--border);'}
					>
						Available Now
					</button>
					<button
						onclick={() => (filterQuery = 'engagement')}
						class="rounded-full px-4 py-2 transition-all"
						style={filterQuery === 'engagement'
							? 'background: var(--primary); color: white; font-family: var(--font-body); font-size: 0.875rem; font-weight: 500;'
							: 'background: var(--bg-elev-2); color: var(--text-muted); font-family: var(--font-body); font-size: 0.875rem; font-weight: 500; border: 1px solid var(--border);'}
					>
						High Engagement
					</button>
				</div>
			</div>
		</div>
	</section>

	<!-- Platform Selection -->

	<section class="py-16">
		<div class="mx-auto max-w-6xl px-4">
			<div class="mb-12 text-center">
				<h2
					style="margin-bottom: var(--space-md); font-size: 2rem; font-weight: 700; color: var(--text); font-family: var(--font-head);"
				>
					Available Platforms
				</h2>
				<p style="font-size: 1.125rem; color: var(--text-muted); font-family: var(--font-body);">
					Choose from available account tiers across active platforms
				</p>
			</div>

			{#if filteredPlatforms().length === 0}
				<div
					style="border-radius: var(--r-md); background: var(--status-warning-bg); border: 1px solid var(--status-warning-border); padding: var(--space-2xl); text-align: center;"
				>
					<Package class="mx-auto mb-4 h-12 w-12" style="color: var(--status-warning);" />
					<h3
						style="margin-bottom: var(--space-xs); font-size: 1.125rem; font-weight: 600; color: var(--text); font-family: var(--font-head);"
					>
						No Platforms Found
					</h3>
					<p style="color: var(--text-muted); font-family: var(--font-body);">
						{searchQuery
							? 'Try adjusting your search query.'
							: 'No platforms available at the moment.'}
					</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-2">
					{#each filteredPlatforms() as platform}
						{@const PlatformIcon = getPlatformIcon(platform.slug)}
						{@const platformMeta = getPlatformMetadata(platform.metadata)}
						<div
							onclick={() => navigateToPlatform(platform.slug)}
							onkeydown={(e) => e.key === 'Enter' && navigateToPlatform(platform.slug)}
							role="button"
							tabindex="0"
							class="group relative cursor-pointer overflow-hidden transition-all duration-300 hover:-translate-y-2 active:scale-[0.98]"
							style="background: var(--bg-elev-1); border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow-1);"
						>
							<!-- Platform Gradient Header -->
							<div
								class={`p-8 text-white ${platformMeta?.color ? '' : `bg-gradient-to-r ${getPlatformColor(platform.slug)}`}`}
								style={getPlatformHeaderStyle(platformMeta)}
							>
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-4">
										<div class="rounded-full bg-white/20 p-3">
											{#if shouldRenderCustomIcon(platform.id, platformMeta)}
												<img
													src={platformMeta.icon as string}
													alt={platform.name}
													class="h-8 w-8"
													onerror={() => markPlatformIconFailed(platform.id)}
												/>
											{:else}
												<PlatformIcon class="h-8 w-8" />
											{/if}
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
							<div style="padding: var(--space-2xl);">
								<div class="mb-6 grid grid-cols-2 gap-4">
									<div class="text-center">
										<div
											style="font-size: 1.5rem; font-weight: 700; color: var(--text); font-family: var(--font-body);"
										>
											{platform.tier_count || 0}
										</div>
										<div
											style="font-size: 0.875rem; color: var(--text-muted); font-family: var(--font-body);"
										>
											Available Tiers
										</div>
									</div>
									<div class="text-center">
										<div
											style="font-size: 1.5rem; font-weight: 700; color: var(--text); font-family: var(--font-body);"
										>
											{formatNumber(platform.total_accounts || 0)}
										</div>
										<div
											style="font-size: 0.875rem; color: var(--text-muted); font-family: var(--font-body);"
										>
											Total Accounts
										</div>
									</div>
								</div>

								<!-- Tier Preview -->
								{#if platform.sample_tiers && platform.sample_tiers.length > 0}
									<div class="mb-6">
										<h4
											style="margin-bottom: var(--space-sm); font-size: 0.875rem; font-weight: 600; color: var(--text-muted); font-family: var(--font-head);"
										>
											Available Tiers:
										</h4>
										<div class="flex flex-wrap gap-2">
											{#each platform.sample_tiers.slice(0, 4) as tier}
												<span
													style="border-radius: var(--r-xs); background: var(--bg-elev-2); border: 1px solid var(--border); padding: 4px 12px; font-size: 0.75rem; font-weight: 500; color: var(--text-muted); font-family: var(--font-body);"
												>
													{tier.name}
												</span>
											{/each}
											{#if platform.sample_tiers.length > 4}
												<span
													style="border-radius: var(--r-xs); background: var(--bg-elev-2); border: 1px solid var(--border); padding: 4px 12px; font-size: 0.75rem; font-weight: 500; color: var(--text-dim); font-family: var(--font-body);"
												>
													+{platform.sample_tiers.length - 4} more
												</span>
											{/if}
										</div>
									</div>
								{/if}
								<!-- Browse Action Label -->
								<div
									class="flex items-center justify-center gap-2 transition-colors"
									style="font-size: 0.875rem; font-weight: 500; color: var(--text-muted); font-family: var(--font-body);"
								>
									<span>Browse {platform.name} Accounts</span>
									<ArrowRight class="h-4 w-4" />
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	
</main>
<Footer />
