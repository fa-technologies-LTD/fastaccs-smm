<script lang="ts">
	import {
		ANALYTICS_SECTIONS,
		visibleAnalyticsSections,
		isAnalyticsHubPanel,
		type AnalyticsSection
	} from '$lib/helpers/admin-analytics-navigation';
	let {
		active,
		permissions = [],
		onSelect
	}: {
		active: AnalyticsSection;
		permissions?: readonly string[];
		onSelect?: (section: AnalyticsSection, href: string) => void;
	} = $props();
	const sections = $derived(visibleAnalyticsSections(permissions));

	function select(event: MouseEvent, section: (typeof ANALYTICS_SECTIONS)[number]) {
		if (
			!onSelect ||
			!isAnalyticsHubPanel(section.id) ||
			event.button !== 0 ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		event.preventDefault();
		onSelect(section.id, section.href);
	}
</script>

<nav aria-label="Analytics sections" class="flex flex-wrap gap-2">
	{#each sections as section (section.id)}
		<a
			href={section.href}
			data-sveltekit-preload-data={onSelect && isAnalyticsHubPanel(section.id) ? 'off' : undefined}
			onclick={(event) => select(event, section)}
			aria-current={active === section.id ? 'page' : undefined}
			class="rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors"
			style={`background: var(--bg-elev-1); border-color: ${active === section.id ? 'var(--primary)' : 'var(--border)'}; color: ${active === section.id ? 'var(--primary)' : 'var(--text-muted)'};`}
		>
			{section.label}
		</a>
	{/each}
</nav>

<style>
	a:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 3px;
	}
</style>
