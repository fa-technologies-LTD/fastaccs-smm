<script lang="ts">
	import { ChevronRight, Home } from '@lucide/svelte';

	interface BreadcrumbItem {
		label: string;
		href?: string;
		active?: boolean;
	}

	interface Props {
		items: BreadcrumbItem[];
	}

	let { items }: Props = $props();
</script>

<nav class="mb-4 flex items-center gap-2 text-sm sm:mb-6" aria-label="Breadcrumb">
	<a
		href="/"
		class="flex items-center gap-1 text-white/80 transition-colors hover:text-white active:text-white"
		aria-label="Home"
	>
		<Home class="h-4 w-4" />
	</a>

	{#each items as item, index}
		<ChevronRight class="h-4 w-4 text-white/50" />
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
