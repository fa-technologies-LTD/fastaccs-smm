<script lang="ts">
	// Segmented switcher across the three order kinds under the admin Orders area.
	let { active }: { active: 'accounts' | 'boosting' | 'numbers' } = $props();

	const tabs = [
		{ key: 'accounts', label: 'Accounts', href: '/admin/orders' },
		{ key: 'boosting', label: 'Boosting', href: '/admin/boosting-orders' },
		{ key: 'numbers', label: 'Numbers', href: '/admin/numbers/analytics' }
	] as const;
</script>

<div
	class="inline-flex gap-1 rounded-lg p-1"
	style="background: var(--bg-elev-1); border: 1px solid var(--border);"
>
	{#each tabs as tab (tab.key)}
		{#if tab.key === active}
			<span
				class="rounded-md px-3 py-1 text-xs font-semibold"
				style="background: var(--surface); color: var(--text);"
			>
				{tab.label}
			</span>
		{:else}
			<a
				href={tab.href}
				class="rounded-md px-3 py-1 text-xs font-medium transition-colors hover:opacity-80"
				style="color: var(--text-muted);"
			>
				{tab.label}
			</a>
		{/if}
	{/each}
</div>
