<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { ArrowRight, Check, Zap, Search, SearchX, Package } from '@lucide/svelte';
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

	interface PlatformMetadata {
		icon?: unknown;
		color?: unknown;
	}

	type FilterKey = 'all' | 'popular' | 'in-stock' | 'high-engagement';

	interface FilterConfig {
		key: FilterKey;
		label: string;
	}

	let { data }: Props = $props();

	let searchQuery = $state('');
	let activeFilter = $state<FilterKey>('all');
	let failedPlatformIcons = $state<Record<string, boolean>>({});
	let showInitialSkeleton = $state(true);

	const filters: FilterConfig[] = [
		{ key: 'all', label: 'All' },
		{ key: 'popular', label: 'Popular' },
		{ key: 'in-stock', label: 'In Stock' },
		{ key: 'high-engagement', label: 'High Engagement' }
	];

	const HIGH_ENGAGEMENT_PATTERN =
		/(engage|engagement|follower|followers|likes|views|subscriber|subscribers|reach|boost)/i;

	onMount(() => {
		const timer = setTimeout(() => {
			showInitialSkeleton = false;
		}, 180);
		return () => clearTimeout(timer);
	});

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

	function getPlatformSubLabel(platform: PageData['platforms'][number]): string {
		return platform.description?.trim() || `${platform.name} accounts`;
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num || 0);
	}

	function getSearchableText(platform: PageData['platforms'][number]): string {
		return [
			platform.name,
			platform.slug,
			platform.description || '',
			...(platform.sample_tiers?.map((tier) => tier.name) || [])
		]
			.join(' ')
			.toLowerCase();
	}

	function isHighEngagementPlatform(platform: PageData['platforms'][number]): boolean {
		return HIGH_ENGAGEMENT_PATTERN.test(getSearchableText(platform));
	}

	function baseSort(
		a: PageData['platforms'][number],
		b: PageData['platforms'][number]
	): number {
		const inStockA = (a.total_accounts || 0) > 0 ? 1 : 0;
		const inStockB = (b.total_accounts || 0) > 0 ? 1 : 0;
		if (inStockA !== inStockB) return inStockB - inStockA;

		const stockDiff = (b.total_accounts || 0) - (a.total_accounts || 0);
		if (stockDiff !== 0) return stockDiff;

		return a.name.localeCompare(b.name);
	}

	const allPlatforms = $derived(data.platforms || []);
	const hasAnyPlatforms = $derived(allPlatforms.length > 0);

	const filteredPlatforms = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		let platforms = [...allPlatforms];

		if (query) {
			platforms = platforms.filter((p) => getSearchableText(p).includes(query));
		}

		if (activeFilter === 'in-stock') {
			platforms = platforms.filter((p) => (p.total_accounts || 0) > 0);
		}

		if (activeFilter === 'high-engagement') {
			platforms = platforms.filter(isHighEngagementPlatform);
		}

		if (activeFilter === 'popular') {
			platforms.sort((a, b) => {
				const inStockA = (a.total_accounts || 0) > 0 ? 1 : 0;
				const inStockB = (b.total_accounts || 0) > 0 ? 1 : 0;
				if (inStockA !== inStockB) return inStockB - inStockA;

				const tierDiff = (b.tier_count || 0) - (a.tier_count || 0);
				if (tierDiff !== 0) return tierDiff;

				const stockDiff = (b.total_accounts || 0) - (a.total_accounts || 0);
				if (stockDiff !== 0) return stockDiff;

				return a.name.localeCompare(b.name);
			});
			return platforms;
		}

		platforms.sort(baseSort);
		return platforms;
	});

	function clearSearch() {
		searchQuery = '';
		activeFilter = 'all';
	}
</script>

<svelte:head>
	<title>Browse Accounts - FastAccs</title>
	<meta
		name="description"
		content="Browse available social media platforms and account tiers with current stock and pricing."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background: var(--bg);">
	<section class="mx-auto w-full max-w-6xl px-4 pb-3 pt-4 sm:pt-5">
		<div class="filter-row">
			{#each filters as filter}
				<button
					type="button"
					class={`filter-chip ${activeFilter === filter.key ? 'active' : ''}`}
					onclick={() => (activeFilter = filter.key)}
				>
					{filter.label}
				</button>
			{/each}
		</div>

		<div class="search-wrap">
			<div class="search-control">
				<Search size={16} class="search-icon" />
				<input
					type="text"
					placeholder="Search platforms..."
					bind:value={searchQuery}
					class="search-input"
				/>
			</div>
		</div>

		<div class="trust-strip">
			<span><Check size={12} class="trust-icon" /> Multiple tiers</span>
			<span><Zap size={12} class="trust-icon" /> Instant delivery</span>
			<span><span class="support-dot"></span> 24/7 support</span>
		</div>
	</section>

	<section class="mx-auto w-full max-w-6xl px-4 pb-16">
		{#if showInitialSkeleton}
			<div class="platform-grid">
				{#each Array.from({ length: 4 }) as _, index}
					<div class="platform-skeleton" style={`animation-delay: ${index * 70}ms;`}></div>
				{/each}
			</div>
		{:else if !hasAnyPlatforms}
			<div class="empty-state">
				<Package size={46} />
				<p class="empty-title">No platforms available right now</p>
				<p class="empty-subtitle">Check back soon - new stock is added regularly.</p>
			</div>
		{:else if filteredPlatforms.length === 0}
			<div class="empty-state">
				<SearchX size={46} />
				<p class="empty-title">No platforms match your search</p>
				<p class="empty-subtitle">Try a different term or browse all platforms.</p>
				<button type="button" class="clear-search-btn" onclick={clearSearch}>Clear search</button>
			</div>
		{:else}
			<div class="platform-grid">
				{#each filteredPlatforms as platform, index (platform.id)}
					{@const PlatformIcon = getPlatformIcon(platform.slug)}
					{@const platformMeta = getPlatformMetadata(platform.metadata)}
					{@const previewTiers = platform.sample_tiers?.slice(0, 4) || []}
					<button
						type="button"
						class={`platform-card group ${(platform.total_accounts || 0) <= 0 ? 'sold-out' : ''}`}
						onclick={() => navigateToPlatform(platform.slug)}
						style={`animation-delay: ${index * 80}ms;`}
						aria-label={`Browse ${platform.name} accounts`}
					>
						<div
							class={`platform-header ${platformMeta?.color ? '' : `bg-gradient-to-r ${getPlatformColor(platform.slug)}`}`}
							style={getPlatformHeaderStyle(platformMeta)}
						>
							<div class="flex items-center justify-between gap-3">
								<div class="flex min-w-0 items-center gap-3 sm:gap-4">
									<div class="icon-shell">
										{#if shouldRenderCustomIcon(platform.id, platformMeta)}
											<img
												src={platformMeta.icon as string}
												alt={platform.name}
												class="h-8 w-8"
												onerror={() => markPlatformIconFailed(platform.id)}
											/>
										{:else}
											<PlatformIcon class="h-7 w-7 sm:h-8 sm:w-8" />
										{/if}
									</div>
									<div class="min-w-0 text-left">
										<h3 class="platform-title">{platform.name}</h3>
										<p class="platform-subtitle">{getPlatformSubLabel(platform)}</p>
									</div>
								</div>
								<ArrowRight
									class="h-5 w-5 opacity-70 transition-transform group-hover:translate-x-1 sm:h-6 sm:w-6"
								/>
							</div>
						</div>

						<div class="platform-body">
							<div class="stats-grid">
								<div class="text-center">
									<div class="stat-value">{platform.tier_count || 0}</div>
									<div class="stat-label">Available Tiers</div>
								</div>
								<div class="text-center">
									<div class="stat-value">{formatNumber(platform.total_accounts || 0)}</div>
									<div class="stat-label">Total Accounts</div>
								</div>
							</div>

							{#if previewTiers.length > 0}
								<div class="tiers-wrap">
									<h4 class="tiers-label">Available Tiers:</h4>
									<div class="flex flex-wrap gap-2">
										{#each previewTiers as tier}
											<span class="tier-pill">{tier.name}</span>
										{/each}
										{#if (platform.sample_tiers?.length || 0) > 4}
											<span class="tier-pill dim">+{(platform.sample_tiers?.length || 0) - 4} more</span>
										{/if}
									</div>
								</div>
							{/if}

							<div class="browse-row">
								<span>Browse {platform.name} Accounts</span>
								<ArrowRight class="h-4 w-4" />
							</div>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</section>
</main>

<Footer />

<style>
	.filter-row {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding: 8px 0;
		scrollbar-width: none;
	}

	.filter-row::-webkit-scrollbar {
		display: none;
	}

	.filter-chip {
		white-space: nowrap;
		padding: 6px 14px;
		border-radius: 20px;
		font-size: 12px;
		font-weight: 500;
		font-family: var(--font-body);
		color: #ccc;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: all 180ms ease;
		cursor: pointer;
	}

	.filter-chip.active {
		background: #25b570;
		color: #fff;
		border-color: #25b570;
	}

	.search-wrap {
		margin: 0 0 8px;
	}

	.search-control {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 14px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		transition: border-color 150ms ease, box-shadow 150ms ease;
	}

	.search-control:focus-within {
		border-color: rgba(37, 181, 112, 0.4);
		box-shadow: 0 0 0 2px rgba(37, 181, 112, 0.12);
	}

	.search-icon {
		color: #555;
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--text);
		font-size: 13px;
		font-family: var(--font-body);
		outline: none;
	}

	.search-input::placeholder {
		color: #555;
		font-size: 13px;
	}

	.trust-strip {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 4px 0 10px;
		flex-wrap: wrap;
	}

	.trust-strip span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		color: #777;
		font-family: var(--font-body);
		white-space: nowrap;
	}

	.trust-icon {
		color: #22c55e;
	}

	.support-dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: #facc15;
	}

	.platform-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 14px;
	}

	.platform-card {
		position: relative;
		overflow: hidden;
		cursor: pointer;
		border-radius: var(--r-md);
		border: 1px solid var(--border);
		background: var(--bg-elev-1);
		box-shadow: var(--shadow-1);
		transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
		animation: card-enter 300ms ease-out both;
	}

	.platform-card:hover {
		border-color: var(--primary);
		box-shadow: var(--shadow-1);
		transform: scale(1.02);
	}

	.platform-card:active {
		transform: scale(0.98);
	}

	.platform-card:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}

	.sold-out {
		opacity: 0.6;
	}

	.platform-header {
		padding: 1rem;
		color: #fff;
	}

	.icon-shell {
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		padding: 0.6rem;
		flex-shrink: 0;
	}

	.platform-title {
		font-size: 1.2rem;
		font-weight: 700;
		font-family: var(--font-head);
		line-height: 1.15;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.platform-subtitle {
		font-size: 0.85rem;
		opacity: 0.92;
		font-family: var(--font-body);
		margin-top: 0.2rem;
	}

	.platform-body {
		padding: 1rem;
	}

	.stats-grid {
		margin-bottom: 1rem;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.stat-value {
		font-size: 1.45rem;
		font-weight: 700;
		color: var(--text);
		font-family: var(--font-body);
	}

	.stat-label {
		font-size: 0.82rem;
		color: var(--text-muted);
		font-family: var(--font-body);
	}

	.tiers-wrap {
		margin-bottom: 1rem;
	}

	.tiers-label {
		margin-bottom: 0.5rem;
		font-size: 0.84rem;
		font-weight: 600;
		color: var(--text-muted);
		font-family: var(--font-head);
	}

	.tier-pill {
		border-radius: var(--r-xs);
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		padding: 4px 12px;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-muted);
		font-family: var(--font-body);
	}

	.tier-pill.dim {
		color: var(--text-dim);
	}

	.browse-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text-muted);
		font-family: var(--font-body);
	}

	.platform-skeleton {
		height: 270px;
		border-radius: var(--r-md);
		border: 1px solid var(--border);
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0.05) 0%,
			rgba(255, 255, 255, 0.11) 50%,
			rgba(255, 255, 255, 0.05) 100%
		);
		background-size: 220% 100%;
		animation: shimmer 1.2s infinite linear, card-enter 300ms ease-out both;
	}

	.empty-state {
		min-height: 220px;
		border-radius: var(--r-md);
		border: 1px solid var(--border);
		background: var(--bg-elev-1);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 20px;
		color: #7b7b7b;
	}

	.empty-title {
		margin-top: 8px;
		font-size: 14px;
		font-weight: 600;
		color: #9ca3af;
	}

	.empty-subtitle {
		margin-top: 4px;
		font-size: 12px;
		color: #6b7280;
	}

	.clear-search-btn {
		margin-top: 12px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.06);
		color: var(--text);
		font-size: 12px;
		border-radius: 999px;
		padding: 6px 12px;
		font-family: var(--font-body);
		cursor: pointer;
	}

	@keyframes shimmer {
		0% {
			background-position: 220% 0;
		}
		100% {
			background-position: -220% 0;
		}
	}

	@keyframes card-enter {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (min-width: 640px) {
		.platform-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 16px;
		}

		.filter-chip {
			font-size: 13px;
			padding: 7px 15px;
		}

		.search-input {
			font-size: 14px;
		}
	}

	@media (min-width: 1024px) {
		.filter-row {
			justify-content: center;
		}

		.platform-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.search-wrap {
			max-width: 520px;
			margin-left: auto;
			margin-right: auto;
		}

		.platform-header {
			padding: 1.25rem;
		}

		.platform-body {
			padding: 1.25rem;
		}

		.platform-title {
			font-size: 1.38rem;
		}

		.platform-subtitle {
			font-size: 0.95rem;
		}
	}
</style>
