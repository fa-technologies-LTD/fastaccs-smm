<script lang="ts">
	import { formatPrice } from '$lib/helpers/utils';
	import type { PageData } from './$types';
	import { ArrowDown, ArrowUp } from '@lucide/svelte';
	import { ADMIN_MONEY_VISIBILITY_KEY, formatAdminMoney } from '$lib/helpers/admin-money';

	let { data }: { data: PageData } = $props();

	const canViewRevenue = Boolean(data.canViewRevenue);
	let hideMonetaryAmounts = $state(false);
	const stats = $derived((data.stats || {}) as Record<string, any>);
	const integrity = $derived(
		(data.integrity || {
			ok: true,
			checks: [],
			mismatches: []
		}) as {
			ok: boolean;
			checks: Array<Record<string, any>>;
			mismatches: Array<{
				label: string;
				expected: number;
				actual: number;
			}>;
		}
	);

	if (typeof window !== 'undefined') {
		hideMonetaryAmounts = localStorage.getItem(ADMIN_MONEY_VISIBILITY_KEY) === 'true';
	}

	function formatMoney(value: number): string {
		return formatAdminMoney(Number(value || 0), {
			canViewRevenue,
			hideMonetaryAmounts,
			format: formatPrice
		});
	}

	function formatPct(value: number): string {
		return `${Number(value || 0).toFixed(1)}%`;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold" style="color: var(--text)">Analytics Dashboard</h1>
				<p class="mt-1 text-sm" style="color: var(--text-muted)">
					Business timezone: <span class="font-semibold">{stats.timezone || 'Africa/Lagos'}</span>
				</p>
				<p class="mt-1 text-xs" style="color: var(--text-dim)">
					Order KPIs use <span class="font-semibold">createdAt</span>; revenue timing KPIs use
					<span class="font-semibold">paidAt</span> (legacy fallback to createdAt when paidAt is missing).
				</p>
			</div>
		{#if !canViewRevenue}
			<span
				class="rounded-full px-3 py-1 text-xs font-semibold"
				style="background: var(--bg-elev-2); color: var(--text-dim); border: 1px solid var(--border);"
			>
				Revenue fields restricted for this role
			</span>
		{/if}
	</div>

	<div
		class="rounded-lg border p-4"
		style={`background: ${integrity.ok ? 'var(--status-success-bg)' : 'var(--status-warning-bg)'}; border-color: ${integrity.ok ? 'var(--status-success-border)' : 'var(--status-warning-border)'}`}
	>
		<p
			class="text-sm font-semibold"
			style={`color: ${integrity.ok ? 'var(--status-success)' : 'var(--status-warning)'}`}
		>
			{integrity.ok
				? 'Metrics integrity checks passed'
				: `${integrity.mismatches.length} integrity checks need attention`}
		</p>
		{#if !integrity.ok}
			<div class="mt-2 space-y-1 text-sm" style="color: var(--text);">
				{#each integrity.mismatches as check}
					<div>{check.label}: expected {check.expected}, actual {check.actual}</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<p class="text-sm" style="color: var(--text-muted)">Total Revenue</p>
			<p class="mt-1 text-2xl font-bold" style="color: var(--text)">
				{formatMoney(stats.totalRevenue || 0)}
			</p>
			<div class="mt-1 flex items-center gap-1 text-xs" style="color: var(--text-muted);">
				{#if Number(stats.revenueChange || 0) >= 0}
					<ArrowUp class="h-3.5 w-3.5 text-green-600" />
				{:else}
					<ArrowDown class="h-3.5 w-3.5 text-red-600" />
				{/if}
				<span>{formatPct(stats.revenueChange || 0)} vs last month</span>
			</div>
		</div>
		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<p class="text-sm" style="color: var(--text-muted)">Total Orders</p>
			<p class="mt-1 text-2xl font-bold" style="color: var(--text)">{stats.totalOrders || 0}</p>
			<p class="mt-1 text-xs" style="color: var(--text-muted)">
				{formatPct(stats.ordersChange || 0)} vs last month
			</p>
		</div>
		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<p class="text-sm" style="color: var(--text-muted)">Total Customers</p>
			<p class="mt-1 text-2xl font-bold" style="color: var(--text)">{stats.totalCustomers || 0}</p>
			<p class="mt-1 text-xs" style="color: var(--text-muted)">
				{formatPct(stats.customersChange || 0)} vs last month
			</p>
		</div>
		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<p class="text-sm" style="color: var(--text-muted)">Accounts Sold</p>
			<p class="mt-1 text-2xl font-bold" style="color: var(--text)">{stats.accountsSold || 0}</p>
			<p class="mt-1 text-xs" style="color: var(--text-muted)">
				{formatPct(stats.accountsChange || 0)} vs last month
			</p>
		</div>
	</div>

	{#if stats.advancedAnalyticsEnabled}
		<div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
			<section
				class="rounded-lg p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">
					Revenue Breakdown by Platform
				</h2>
				{#if stats.revenueBreakdown?.byPlatform?.length}
					<div class="mt-3 space-y-2">
						{#each stats.revenueBreakdown.byPlatform.slice(0, 8) as row}
							<div
								class="flex items-center justify-between rounded-lg p-3"
								style="background: var(--bg); border: 1px solid var(--border);"
							>
								<div>
									<p class="text-sm font-semibold" style="color: var(--text)">{row.name}</p>
									<p class="text-xs" style="color: var(--text-muted);">
										{row.orderCount} orders • {row.unitsSold} sold
									</p>
								</div>
								<p class="text-sm font-semibold" style="color: var(--text)">
									{formatMoney(row.revenue)}
								</p>
							</div>
						{/each}
					</div>
				{:else}
					<p class="mt-3 text-sm" style="color: var(--text-muted);">No revenue data available.</p>
				{/if}
			</section>

			<section
				class="rounded-lg p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">Top Tier Revenue</h2>
				{#if stats.revenueBreakdown?.byTier?.length}
					<div class="mt-3 space-y-2">
						{#each stats.revenueBreakdown.byTier.slice(0, 8) as row}
							<div
								class="flex items-center justify-between rounded-lg p-3"
								style="background: var(--bg); border: 1px solid var(--border);"
							>
								<div>
									<p class="text-sm font-semibold" style="color: var(--text)">
										{row.platformName} / {row.name}
									</p>
									<p class="text-xs" style="color: var(--text-muted);">
										{row.orderCount} orders • {row.unitsSold} sold
									</p>
								</div>
								<p class="text-sm font-semibold" style="color: var(--text)">
									{formatMoney(row.revenue)}
								</p>
							</div>
						{/each}
					</div>
				{:else}
					<p class="mt-3 text-sm" style="color: var(--text-muted);">
						No tier revenue data available.
					</p>
				{/if}
			</section>
		</div>

		<section
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-base font-semibold" style="color: var(--text)">
				Revenue Trend (Last 30 Days)
			</h2>
			{#if stats.revenueBreakdown?.lineTrend?.length}
				<div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5 xl:grid-cols-10">
					{#each stats.revenueBreakdown.lineTrend.slice(-20) as point}
						<div
							class="rounded-lg p-2"
							style="background: var(--bg); border: 1px solid var(--border);"
						>
							<p class="text-[10px]" style="color: var(--text-dim);">{point.key.slice(5)}</p>
							<p class="mt-1 text-xs font-semibold" style="color: var(--text);">
								{formatMoney(point.revenue)}
							</p>
							<p class="text-[10px]" style="color: var(--text-muted);">{point.orderCount} orders</p>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<section
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-base font-semibold" style="color: var(--text)">
				Revenue by Day / Week / Month
			</h2>
			<div class="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
				<div class="space-y-2">
					<p class="text-xs font-semibold uppercase" style="color: var(--text-dim);">Day</p>
					{#each (stats.revenueBreakdown?.byDay || []).slice(-5) as row}
						<div
							class="flex items-center justify-between rounded-lg p-2"
							style="background: var(--bg); border: 1px solid var(--border);"
						>
							<span class="text-xs" style="color: var(--text-muted);">{row.key}</span>
							<span class="text-xs font-semibold" style="color: var(--text);"
								>{formatMoney(row.revenue)}</span
							>
						</div>
					{/each}
				</div>
				<div class="space-y-2">
					<p class="text-xs font-semibold uppercase" style="color: var(--text-dim);">Week</p>
					{#each (stats.revenueBreakdown?.byWeek || []).slice(-5) as row}
						<div
							class="flex items-center justify-between rounded-lg p-2"
							style="background: var(--bg); border: 1px solid var(--border);"
						>
							<span class="text-xs" style="color: var(--text-muted);">{row.key}</span>
							<span class="text-xs font-semibold" style="color: var(--text);"
								>{formatMoney(row.revenue)}</span
							>
						</div>
					{/each}
				</div>
				<div class="space-y-2">
					<p class="text-xs font-semibold uppercase" style="color: var(--text-dim);">Month</p>
					{#each (stats.revenueBreakdown?.byMonth || []).slice(-5) as row}
						<div
							class="flex items-center justify-between rounded-lg p-2"
							style="background: var(--bg); border: 1px solid var(--border);"
						>
							<span class="text-xs" style="color: var(--text-muted);">{row.key}</span>
							<span class="text-xs font-semibold" style="color: var(--text);"
								>{formatMoney(row.revenue)}</span
							>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
			<section
				class="rounded-lg p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">Sales Performance</h2>
				<div class="mt-3 space-y-2">
					<div
						class="flex items-center justify-between rounded-lg p-3"
						style="background: var(--bg); border: 1px solid var(--border);"
					>
						<span class="text-sm" style="color: var(--text-muted)">Paid orders</span>
						<span class="text-sm font-semibold" style="color: var(--text)"
							>{stats.salesPerformance?.paidOrderCount || 0}</span
						>
					</div>
					<div
						class="flex items-center justify-between rounded-lg p-3"
						style="background: var(--bg); border: 1px solid var(--border);"
					>
						<span class="text-sm" style="color: var(--text-muted)">Cancelled/failed orders</span>
						<span class="text-sm font-semibold" style="color: var(--text)"
							>{stats.salesPerformance?.cancelledFailedOrderCount || 0}</span
						>
					</div>
					<div
						class="flex items-center justify-between rounded-lg p-3"
						style="background: var(--bg); border: 1px solid var(--border);"
					>
						<span class="text-sm" style="color: var(--text-muted)">Paid conversion</span>
						<span class="text-sm font-semibold" style="color: var(--text)"
							>{formatPct(stats.salesPerformance?.paidConversionRate || 0)}</span
						>
					</div>
				</div>
			</section>

			<section
				class="rounded-lg p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">Stock Velocity</h2>
				<div class="mt-3 grid grid-cols-2 gap-2">
					<div
						class="rounded-lg p-3"
						style="background: var(--bg); border: 1px solid var(--border);"
					>
						<p class="text-xs" style="color: var(--text-muted)">Avg sell-through rate</p>
						<p class="mt-1 text-lg font-semibold" style="color: var(--text);">
							{formatPct(stats.stockVelocity?.averageSellThroughRate || 0)}
						</p>
					</div>
					<div
						class="rounded-lg p-3"
						style="background: var(--bg); border: 1px solid var(--border);"
					>
						<p class="text-xs" style="color: var(--text-muted)">Avg days to sell out</p>
						<p class="mt-1 text-lg font-semibold" style="color: var(--text);">
							{stats.stockVelocity?.averageDaysToSellOut ?? 'N/A'}
						</p>
					</div>
				</div>
				{#if stats.stockVelocity?.tiers?.length}
					<div class="mt-3 space-y-2">
						{#each stats.stockVelocity.tiers.slice(0, 8) as tier}
							<div
								class="rounded-lg p-3 text-sm"
								style="background: var(--bg); border: 1px solid var(--border);"
							>
								<p class="font-semibold" style="color: var(--text);">
									{tier.platformName} / {tier.tierName}
								</p>
								<p class="text-xs" style="color: var(--text-muted);">
									Sold (30d): {tier.soldLast30Days} • Available: {tier.available}
								</p>
								<p class="text-xs" style="color: var(--text-muted);">
									Sell-through: {formatPct(tier.rollingSellThroughRate)} • Days to sell out: {tier.daysToSellOut ??
										'N/A'}
								</p>
							</div>
						{/each}
					</div>
				{/if}
				{#if stats.stockVelocity?.stagnantTiers?.length}
					<div class="mt-3 space-y-2">
						{#each stats.stockVelocity.stagnantTiers.slice(0, 6) as tier}
							<div
								class="rounded-lg p-3 text-sm"
								style="background: var(--status-warning-bg); border: 1px solid var(--status-warning-border); color: var(--status-warning);"
							>
								{tier.platformName} / {tier.tierName}: stagnant stock ({tier.available} available, 0
								sold in 30d)
							</div>
						{/each}
					</div>
				{/if}
			</section>
		</div>
	{/if}
</div>
