<script lang="ts">
	import { goto } from '$app/navigation';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { showError } from '$lib/stores/toasts';
	import { getPlatformIcon } from '$lib/helpers/platformColors';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	if (data.error) {
		showError('Failed to load boosting services', data.error);
	}

	const platformGradients: Record<string, string> = {
		instagram: 'var(--gradient-instagram)',
		tiktok: 'var(--gradient-tiktok)',
		youtube: 'var(--gradient-youtube)',
		facebook: 'var(--gradient-facebook)',
		x: 'var(--gradient-twitter)'
	};

	let failedIcons = $state<Record<string, boolean>>({});

	function markIconFailed(platform: string) {
		failedIcons = { ...failedIcons, [platform]: true };
	}
</script>

<svelte:head>
	<title>Boosting Services | FastAccs</title>
	<meta
		name="description"
		content="Order followers, likes, and views for your social media. Pick a platform, paste your link, and pay securely."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background-color: var(--bg);">
	<section class="mx-auto max-w-4xl px-4 py-12 sm:py-16">
		<div class="mb-10 text-center">
			<p class="text-xs font-semibold tracking-[0.18em] uppercase" style="color: var(--primary);">
				Boosting Services
			</p>
			<p class="mx-auto mt-3 max-w-md text-sm" style="color: var(--text-muted);">
				Buy followers, likes, views, and more. Paste your link, we deliver — no passwords needed.
			</p>
			<h1
				class="mx-auto mt-4 text-2xl font-bold sm:text-3xl"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Pick a platform to get started
			</h1>
		</div>

		{#if data.platformTiles.length === 0}
			<div
				class="mx-auto max-w-xl rounded-[var(--r-md)] border p-10 text-center"
				style="border-color: var(--border); background: var(--bg-elev-1);"
			>
				<p style="color: var(--text-muted);">No boosting services are available right now. Check back soon.</p>
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
				{#each data.platformTiles as tile (tile.platform)}
					{@const PlatformIcon = getPlatformIcon(tile.platform)}
					<button
						type="button"
						onclick={() => goto(`/services/${tile.platform}`)}
						class="platform-tile relative flex flex-col items-center gap-3 rounded-[var(--r-md)] p-5 transition-transform active:scale-95"
						style={tile.allComingSoon ? 'opacity: 0.7;' : ''}
					>
						{#if tile.allComingSoon}
							<span
								class="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
								style="background: rgba(234,179,8,0.15); color: #eab308;"
							>
								Coming soon
							</span>
						{/if}
						<div
							class="flex h-16 w-16 items-center justify-center rounded-full sm:h-20 sm:w-20"
							style={`background: ${platformGradients[tile.platform]}; ${tile.allComingSoon ? 'filter: grayscale(0.6);' : ''}`}
						>
							{#if tile.iconUrl && !failedIcons[tile.platform]}
								<img
									src={tile.iconUrl}
									alt={tile.label}
									class="h-9 w-9 rounded-full object-cover sm:h-11 sm:w-11"
									onerror={() => markIconFailed(tile.platform)}
								/>
							{:else}
								<PlatformIcon class="h-8 w-8 text-white sm:h-10 sm:w-10" />
							{/if}
						</div>
						<span class="text-sm font-semibold" style="color: var(--text); font-family: var(--font-head);">
							{tile.label}
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
		border-color: var(--primary);
		transform: translateY(-2px);
	}
</style>
