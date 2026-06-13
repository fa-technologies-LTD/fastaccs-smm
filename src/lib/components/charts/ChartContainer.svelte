<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CHART_FALLBACK_WIDTH, DEFAULT_CHART_HEIGHT } from './chart-theme';

	let {
		height = DEFAULT_CHART_HEIGHT,
		empty = false,
		emptyMessage = 'No data available.',
		ariaLabel,
		children
	}: {
		height?: number;
		empty?: boolean;
		emptyMessage?: string;
		ariaLabel: string;
		children: Snippet<[{ width: number; height: number }]>;
	} = $props();

	let measuredWidth = $state(0);

	const width = $derived(measuredWidth > 0 ? measuredWidth : CHART_FALLBACK_WIDTH);
</script>

<div bind:clientWidth={measuredWidth} class="w-full" role="img" aria-label={ariaLabel}>
	{#if empty}
		<div
			class="flex items-center justify-center text-sm"
			style="height: {height}px; color: var(--text-muted);"
		>
			{emptyMessage}
		</div>
	{:else}
		<svg width="100%" height={height} viewBox="0 0 {width} {height}" preserveAspectRatio="none">
			{@render children({ width, height })}
		</svg>
	{/if}
</div>
