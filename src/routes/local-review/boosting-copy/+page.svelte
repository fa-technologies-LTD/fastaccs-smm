<script lang="ts">
	import ManagedBoostingStorefront from '$lib/components/ManagedBoostingStorefront.svelte';
	import BoostingLaunchNotice from '$lib/components/BoostingLaunchNotice.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let showAnnouncement = $state(false);
</script>

<svelte:head>
	<title>Boosting copy preview | Local review</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="mx-auto max-w-4xl space-y-6 px-4 py-8">
	<header>
		<h1 class="text-2xl font-bold">Customer copy preview</h1>
		<p class="mt-2 text-sm" style="color: var(--text-muted);">
			Illustrative offers only. No saved prices, supplier settings or publication changes. Checkout
			is disabled.
		</p>
	</header>
	<button
		type="button"
		class="rounded-xl border px-4 py-3 text-sm font-semibold"
		onclick={() => {
			showAnnouncement = true;
		}}>Preview launch popup</button
	>
	<ManagedBoostingStorefront groups={data.groups} previewOnly />
</main>

{#if showAnnouncement}
	<BoostingLaunchNotice
		onClose={() => {
			showAnnouncement = false;
		}}
	/>
{/if}
