<script lang="ts">
	import { onMount } from 'svelte';
	import type { getBoostingAnalytics } from '$lib/services/boosting-analytics';
	import { formatAdminMoney } from '$lib/helpers/admin-money';
	import { formatPrice } from '$lib/helpers/utils';

	/**
	 * Boosting Sales: the last 30 days of paid Boosting orders, recorded supplier cost and margin,
	 * by service, with supplier balances. Lives in Analytics; the order queue no longer carries it.
	 */
	type Report = Awaited<ReturnType<typeof getBoostingAnalytics>>;
	let {
		canViewRevenue = false,
		hideMonetaryAmounts = false,
		initial = null
	}: {
		canViewRevenue?: boolean;
		hideMonetaryAmounts?: boolean;
		initial?: Report | null;
	} = $props();

	let analytics = $state<Report | null>(null);
	let analyticsError = $state<string | null>(null);
	let loading = $state(false);
	let requestId = 0;

	function formatMonetaryAmount(amount: number): string {
		return formatAdminMoney(amount, {
			canView: canViewRevenue,
			hideMonetaryAmounts,
			format: formatPrice
		});
	}
	function formatDateTime(value: string | null | undefined): string {
		if (!value) return 'Unknown time';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown time';
		return date.toLocaleString('en-NG', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'Africa/Lagos'
		});
	}

	async function refresh() {
		const current = ++requestId;
		loading = true;
		try {
			const response = await fetch('/api/admin/boosting-orders/analytics');
			const result = await response.json();
			if (!response.ok || !result.success) throw new Error();
			if (current !== requestId) return;
			analytics = result.data;
			analyticsError = null;
		} catch {
			if (current === requestId)
				analyticsError = analytics
					? 'Could not refresh the report. Showing the last one that loaded.'
					: 'Boosting Sales is unavailable right now. Try Refresh.';
		} finally {
			if (current === requestId) loading = false;
		}
	}

	onMount(() => {
		if (initial) analytics = initial;
		else void refresh();
	});
</script>

<section class="report" aria-label="Boosting Sales">
	<div class="report-head">
		<h2>Boosting Sales</h2>
		<button type="button" onclick={refresh} disabled={loading}>
			{loading ? 'Refreshing…' : 'Refresh'}
		</button>
	</div>
	{#if analyticsError}<p role="status" class="text-sm" style="color: var(--text-muted);">
			{analyticsError}
		</p>{/if}
	{#if !analytics && loading}<p role="status" class="text-sm" style="color: var(--text-muted);">
			Loading…
		</p>{/if}
	{#if analytics}
		<p class="text-xs" style="color: var(--text-dim);">
			Last 30 days · paid orders, including later refunds
		</p>
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-6">
			{#each [['Paid orders', analytics.overall.orders.toLocaleString()], ['Boosting items', analytics.overall.items.toLocaleString()], ['Completed', analytics.overall.completionRate === null ? '—' : `${analytics.overall.completionRate}%`], ...(canViewRevenue ? [['Net sales', formatMonetaryAmount(analytics.overall.netSalesNgn ?? 0)], ['Recorded supplier cost', analytics.overall.supplierCostNgn === null ? '—' : formatMonetaryAmount(analytics.overall.supplierCostNgn)], ['Recorded margin', analytics.overall.recordedMarginNgn === null ? '—' : formatMonetaryAmount(analytics.overall.recordedMarginNgn)]] : [])] as metric (metric[0])}
				<div
					class="rounded-[var(--r-md)] border p-4"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<p class="text-xs" style="color: var(--text-muted);">{metric[0]}</p>
					<p class="mt-1 text-xl font-bold">{metric[1]}</p>
				</div>
			{/each}
		</div>
		{#if canViewRevenue && analytics.overall.items > 0}
			<p class="text-xs" style="color: var(--text-muted);">
				Recorded margin is after refunds and known supplier charges, before payment fees. It is not
				final profit. Actual payment fees are not recorded. Repeated polls are counted once per
				supplier order; missing charges remain unknown.
			</p>
		{/if}
		{#if canViewRevenue && analytics.overall.knownCostItems < analytics.overall.items}<p
				class="text-xs"
				style="color: var(--text-muted);"
			>
				Costs recorded for {analytics.overall.knownCostItems} of {analytics.overall.items} items. Margin
				covers those items only. Unknown costs aren’t treated as free.
			</p>{/if}
		<details
			class="rounded-[var(--r-md)] border p-4"
			style="border-color: var(--border); background: var(--bg-elev-1);"
		>
			<summary class="cursor-pointer font-semibold">By service · last 30 days</summary>
			<div class="mt-3 overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead
						><tr style="color: var(--text-muted);"
							><th class="p-2">Service</th><th class="p-2">Items</th><th class="p-2">Completed</th
							>{#if canViewRevenue}<th class="p-2">Net sales</th><th class="p-2">Recorded margin</th
								>{/if}</tr
						></thead
					>
					<tbody
						>{#each analytics.byService as row (`${row.categoryId}:${row.platform}:${row.outcome}`)}<tr
								style="border-top: 1px solid var(--border);"
								><td class="p-2">{row.name}</td><td class="p-2">{row.items}</td><td class="p-2"
									>{row.completed}</td
								>{#if canViewRevenue}<td class="p-2"
										>{formatMonetaryAmount(row.netSalesNgn ?? 0)}</td
									><td class="p-2"
										>{row.recordedMarginNgn === null
											? '—'
											: formatMonetaryAmount(row.recordedMarginNgn)}</td
									>{/if}</tr
							>{:else}<tr
								><td colspan={canViewRevenue ? 5 : 3} class="p-4" style="color: var(--text-muted);"
									>No paid Boosting items in this period.</td
								></tr
							>{/each}</tbody
					>
				</table>
			</div>
			{#if canViewRevenue}<div class="mt-4 flex flex-wrap gap-3">
					{#each analytics.providers as provider (provider.provider)}<div
							class="rounded-lg border px-3 py-2 text-sm"
							style="border-color: var(--border);"
						>
							<span style="color: var(--text-muted);">{provider.label} balance</span>
							<strong
								>{provider.balance === null
									? '—'
									: `${provider.currency ?? ''} ${provider.balance.toFixed(2)}`}</strong
							>
							<p class="text-xs" style="color: var(--text-dim);">
								{provider.lastBalanceSuccessAt
									? `Last checked ${formatDateTime(provider.lastBalanceSuccessAt)}`
									: 'Not checked yet'}{!provider.enabled || provider.circuitOpen
									? ' · Supplier paused'
									: ''}
							</p>
						</div>{/each}
				</div>{/if}
		</details>
	{/if}
</section>

<style>
	.report {
		display: grid;
		gap: 16px;
		padding: 16px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--bg-elev-1);
	}
	.report-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.report-head h2 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
	}
	.report-head button {
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 4px 12px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text);
		background: var(--surface);
	}
	.report-head button:disabled {
		opacity: 0.6;
	}
</style>
