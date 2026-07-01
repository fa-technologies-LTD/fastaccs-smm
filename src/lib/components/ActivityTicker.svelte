<script lang="ts">
	import { Zap } from '$lib/icons';
	import { browser } from '$app/environment';

	// Show the "orders fulfilled" ticker only once, on a visitor's first visit.
	const SEEN_KEY = 'fa_orders_ticker_seen';
	let ordersFulfilled = $state<number | null>(null);

	$effect(() => {
		if (!browser || localStorage.getItem(SEEN_KEY)) return;

		fetch('/api/homepage/activity-stats')
			.then((res) => (res.ok ? res.json() : null))
			.then((result) => {
				const count = result?.data?.ordersFulfilled;
				if (typeof count === 'number' && count > 0) {
					ordersFulfilled = count;
					localStorage.setItem(SEEN_KEY, '1');
				}
			})
			.catch(() => {});
	});
</script>

{#if ordersFulfilled !== null && ordersFulfilled > 0}
	<div
		class="flex items-center justify-center gap-2 px-4 py-2.5 text-center text-sm"
		style="background: var(--bg-elev-1); border-bottom: 1px solid var(--border); color: var(--text-muted); font-family: var(--font-body);"
	>
		<Zap size={15} style="color: var(--fa-lime-700); flex-shrink: 0;" />
		<span>
			<strong style="color: var(--text); font-family: var(--font-head);"
				>{ordersFulfilled.toLocaleString()}+</strong
			>
			orders fulfilled
		</span>
	</div>
{/if}
