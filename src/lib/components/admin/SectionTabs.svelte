<script lang="ts">
	import type { AdminSection } from '$lib/helpers/admin-sections';

	/**
	 * The switcher above every page in a section with more than one page: the same look and order
	 * everywhere. On a phone the strip scrolls sideways and keeps the current tab in view.
	 */
	let {
		section,
		activeHref,
		counts = {}
	}: {
		section: AdminSection;
		activeHref: string | null;
		counts?: Record<string, number>;
	} = $props();

	let strip = $state<HTMLElement | null>(null);

	$effect(() => {
		void activeHref;
		strip
			?.querySelector('[aria-current="page"]')
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
</script>

<nav aria-label={`${section.label} pages`} class="section-tabs" bind:this={strip}>
	{#each section.tabs as tab (tab.href)}
		<a
			href={tab.href}
			data-sveltekit-preload-data="hover"
			aria-current={tab.href === activeHref ? 'page' : undefined}
		>
			{tab.label}
			{#if (counts[tab.href] ?? 0) > 0}
				<span class="count" title="Needs attention">{counts[tab.href]}</span>
			{/if}
		</a>
	{/each}
</nav>

<style>
	.section-tabs {
		display: flex;
		gap: 4px;
		width: max-content;
		max-width: 100%;
		margin-bottom: 0.9rem;
		padding: 4px;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--bg-elev-1);
	}
	.section-tabs::-webkit-scrollbar {
		display: none;
	}
	a {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 9px;
		font-size: 0.84rem;
		font-weight: 600;
		white-space: nowrap;
		color: var(--text-muted);
		scroll-snap-align: center;
		transition:
			background 0.15s,
			color 0.15s;
	}
	a:hover {
		color: var(--text);
	}
	a[aria-current='page'] {
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
	}
	a:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	.count {
		border-radius: 999px;
		padding: 1px 6px;
		font-size: 10px;
		font-weight: 700;
		line-height: 1.4;
		background: var(--fa-lime-700);
		color: #0a0a0a;
	}
</style>
