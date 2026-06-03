<script lang="ts">
	import { ChevronRight, Home } from '$lib/icons';

	interface BreadcrumbItem {
		label: string;
		href?: string;
		active?: boolean;
	}

	interface Props {
		items: BreadcrumbItem[];
		compact?: boolean;
	}

	let { items, compact = false }: Props = $props();
</script>

<nav
	class={`flex items-center gap-1.5 ${compact ? 'text-xs sm:text-sm' : 'mb-4 text-sm sm:mb-6'}`}
	aria-label="Breadcrumb"
>
	<a
		href="/"
		class="flex items-center gap-1 text-white/80 transition-colors hover:text-white active:text-white"
		aria-label="Home"
	>
		<Home class={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
	</a>

	{#each items as item, index}
		<ChevronRight class={compact ? 'h-3.5 w-3.5 text-white/50' : 'h-4 w-4 text-white/50'} />
		{#if item.href && !item.active}
			<a
				href={item.href}
				class="text-white/80 transition-colors hover:text-white hover:underline active:text-white"
			>
				{item.label}
			</a>
		{:else}
			<span class="font-medium text-white" aria-current={item.active ? 'page' : undefined}>
				{item.label}
			</span>
		{/if}
	{/each}
</nav>
