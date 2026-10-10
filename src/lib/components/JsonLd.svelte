<script lang="ts">
	import { serializeJsonLd } from '$lib/helpers/structured-data';

	let { data }: { data: Record<string, unknown> | null } = $props();

	// The closing tag is split so it can't end this component's own <script> block.
	const tag = $derived(
		data ? '<script type="application/ld+json">' + serializeJsonLd(data) + '</' + 'script>' : ''
	);
</script>

<svelte:head>
	{#if tag}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html tag}
	{/if}
</svelte:head>
