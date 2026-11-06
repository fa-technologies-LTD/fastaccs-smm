<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import ManagedBoostingStorefront from '$lib/components/ManagedBoostingStorefront.svelte';
	import BoostingUpgradeNotice from '$lib/components/BoostingUpgradeNotice.svelte';
	import { showError } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// The old catalogue is retired; with no reviewed offer live, the page shows the upgrade pause.
	const managedStorefrontPaused = $derived(data.managedGroups.length === 0);

	// Toasts belong to the browser; this also reports again after navigating to a page that failed.
	$effect(() => {
		if (data.error) showError('Failed to load boosting services', data.error);
	});
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
				{managedStorefrontPaused ? 'We’re upgrading this section…' : 'What would you like to grow?'}
			</h1>
			<p class="mx-auto mt-3 max-w-md text-sm leading-relaxed" style="color: var(--text-muted);">
				{managedStorefrontPaused
					? 'Better options. Clearer prices.'
					: 'Choose a platform, paste your link and select an amount. No password needed.'}
			</p>
		</div>

		{#if managedStorefrontPaused}
			<BoostingUpgradeNotice />
		{:else}
			<ManagedBoostingStorefront groups={data.managedGroups} />
		{/if}
	</section>
</main>

<Footer />
