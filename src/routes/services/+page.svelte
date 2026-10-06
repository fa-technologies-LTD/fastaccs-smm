<script lang="ts">
	import { goto } from '$app/navigation';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import BrandIcon from '$lib/components/BrandIcon.svelte';
	import ManagedBoostingStorefront from '$lib/components/ManagedBoostingStorefront.svelte';
	import { showError } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const managedStorefrontPaused = $derived(
		data.managedRolloutActive && data.managedGroups.length === 0
	);

	if (data.error) {
		showError('Failed to load boosting services', data.error);
	}

	const platformGradients: Record<string, string> = {
		instagram: 'var(--gradient-instagram)',
		tiktok: 'var(--gradient-tiktok)',
		youtube: 'var(--gradient-youtube)',
		facebook: 'var(--gradient-facebook)',
		x: 'var(--gradient-twitter)',
		spotify: 'linear-gradient(135deg, #1ed760, #0f7a3b)',
		telegram: 'linear-gradient(135deg, #2aabee, #1474b8)'
	};
</script>

<svelte:head>
	<title>Boosting Services | FastAccs</title>
	<meta
		name="description"
		content={managedStorefrontPaused
			? 'Fast Accounts Boosting is being improved and will be back soon.'
			: 'Order followers, likes, and views for your social media. Pick a platform, paste your link, and pay securely.'}
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background-color: var(--bg);">
	<section class="mx-auto max-w-4xl px-4 py-8 sm:py-16">
		<div class="mb-7 text-center sm:mb-10">
			<p
				class="text-xs font-semibold tracking-[0.18em] uppercase"
				style="color: var(--fa-blue-300);"
			>
				Boosting Services
			</p>
			<h1
				class="mx-auto mt-3 text-2xl font-bold sm:text-3xl"
				style="color: var(--text); font-family: var(--font-head);"
			>
				{managedStorefrontPaused ? 'Boosting is getting better' : 'What would you like to grow?'}
			</h1>
			<p class="mx-auto mt-3 max-w-md text-sm leading-relaxed" style="color: var(--text-muted);">
				{managedStorefrontPaused
					? 'We’re improving speed, pricing and service quality. Check back soon.'
					: 'Choose a platform, paste your link and select an amount. No password needed.'}
			</p>
		</div>

		{#if managedStorefrontPaused}
			<!-- Keep the managed rollout active so the retired catalogue cannot reappear. -->
		{:else if data.managedRolloutActive}
			<ManagedBoostingStorefront groups={data.managedGroups} />
		{:else if data.platformTiles.length === 0}
			<div
				class="mx-auto max-w-xl rounded-[var(--r-md)] border p-10 text-center"
				style="border-color: var(--border); background: var(--bg-elev-1);"
			>
				<p style="color: var(--text-muted);">
					No boosting services are available right now. Check back soon.
				</p>
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-6">
				{#each data.platformTiles as tile (tile.platform)}
					<button
						type="button"
						onclick={() => goto(`/services/${tile.platform}`)}
						class="platform-tile relative flex min-h-40 flex-col items-center justify-center gap-3 rounded-[var(--r-md)] p-4 transition-transform active:scale-95 sm:min-h-0 sm:p-5"
						style={tile.allComingSoon ? 'opacity: 0.7;' : ''}
					>
						{#if tile.allComingSoon}
							<span
								class="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
								style="background: rgba(234,179,8,0.15); color: #eab308;"
							>
								Coming soon
							</span>
						{/if}
						<div
							class="flex h-16 w-16 items-center justify-center rounded-full sm:h-20 sm:w-20"
							style={`background: ${platformGradients[tile.platform]}; ${tile.allComingSoon ? 'filter: grayscale(0.6);' : ''}`}
						>
							<BrandIcon service={tile.label} size={38} mono={true} />
						</div>
						<span
							class="text-sm font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							{tile.label}
						</span>
						<span class="text-[11px]" style="color: var(--text-dim);">
							{tile.serviceCount} result{tile.serviceCount === 1 ? '' : 's'}
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</section>
</main>

<Footer />

<style>
	.platform-tile {
		background: var(--bg-elev-1);
		border: 1px solid var(--border);
		cursor: pointer;
	}

	.platform-tile:hover {
		border-color: var(--fa-blue-500);
		transform: translateY(-2px);
	}
</style>
