<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { ArrowRight, Check, Zap, Search, SearchX, Package, ShieldCheck } from '$lib/icons';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';
	import { formatPrice } from '$lib/helpers/utils';
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
		icon_url?: unknown;
		iconUrl?: unknown;
		logo?: unknown;
		logo_url?: unknown;
		image?: unknown;
		image_url?: unknown;
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
		return isPlatformImageUrl(getPlatformImageValue(metadata)) && !failedPlatformIcons[platformId];
	}

	function getPlatformImageValue(metadata: PlatformMetadata): string | null {
		const candidates = [
			metadata.icon,
			metadata.iconUrl,
			metadata.icon_url,
			metadata.logo,
			metadata.logo_url,
			metadata.image,
			metadata.image_url
		];
		const match = candidates.find((value) => isPlatformImageUrl(value));
		return typeof match === 'string' ? match : null;
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

	function getTypeLabel(count: number): string {
		return count === 1 ? 'Account Type' : 'Account Types';
	}

	function getStartingPriceLabel(platform: PageData['platforms'][number]): string {
		const minPrice = Number(platform.min_price || 0);
		return minPrice > 0 ? `From ${formatPrice(minPrice)}` : 'Price updates soon';
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
		content="Browse available social media platforms and account types with current stock and pricing."
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
			<span><Check size={12} class="trust-icon" /> Account types</span>
			<span><Zap size={12} class="trust-icon" /> Instant delivery</span>
			<span><ShieldCheck size={12} class="trust-icon" /> Support ready</span>
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
												src={getPlatformImageValue(platformMeta) as string}
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
								<div class="stat-group">
									<div class="stat-value">{platform.tier_count || 0}</div>
									<div class="stat-label">{getTypeLabel(platform.tier_count || 0)}</div>
								</div>
								<div class="stat-group stat-group--price">
									<div class="stat-price-label">Starting price</div>
									<div class="stat-price">{getStartingPriceLabel(platform)}</div>
								</div>
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
		gap: 8px;
		padding: 4px 0 10px;
		flex-wrap: wrap;
	}

	.trust-strip span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.035);
		padding: 5px 9px;
		font-size: 10.5px;
		color: rgba(255, 255, 255, 0.58);
		font-family: var(--font-body);
		white-space: nowrap;
	}

	.trust-icon {
		color: #22c55e;
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
		padding: 0.85rem;
		color: #fff;
	}

	.icon-shell {
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		padding: 0.5rem;
		flex-shrink: 0;
	}

	.platform-title {
		font-size: 1.06rem;
		font-weight: 700;
		font-family: var(--font-head);
		line-height: 1.15;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.platform-subtitle {
		font-size: 0.78rem;
		opacity: 0.92;
		font-family: var(--font-body);
		margin-top: 0.2rem;
	}

	.platform-body {
		padding: 0.9rem;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}

	.stat-group {
		min-width: 0;
	}

	.stat-group--price {
		text-align: right;
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text);
		font-family: var(--font-body);
	}

	.stat-label {
		font-size: 0.82rem;
		color: var(--text-muted);
		font-family: var(--font-body);
	}

	.stat-price {
		font-size: 0.93rem;
		font-weight: 700;
		color: var(--primary);
		font-family: var(--font-body);
		line-height: 1.2;
	}

	.stat-price-label {
		font-size: 0.66rem;
		color: var(--text-muted);
		font-family: var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.1rem;
	}

	.platform-skeleton {
		height: 210px;
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
				padding: 1rem;
			}

			.platform-body {
				padding: 0.9rem 1rem;
			}

			.platform-title {
				font-size: 1.16rem;
			}

			.platform-subtitle {
				font-size: 0.84rem;
			}
	}
</style>
