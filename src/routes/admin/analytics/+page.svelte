<script lang="ts">
	import { formatPrice } from '$lib/helpers/utils';
	import type { PageData } from './$types';
	import { ArrowDown, ArrowUp } from '$lib/icons';
	import { ADMIN_MONEY_VISIBILITY_KEY, formatAdminMoney } from '$lib/helpers/admin-money';
	import AreaLineChart from '$lib/components/charts/AreaLineChart.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import Sparkline from '$lib/components/charts/Sparkline.svelte';
	import { STATUS_COLOR_MAP } from '$lib/components/charts/chart-theme';

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

	let granularity = $state<'day' | 'week' | 'month'>('day');
	const granularityData = $derived.by(() => {
		const key =
			granularity === 'day' ? 'byDay' : granularity === 'week' ? 'byWeek' : 'byMonth';
		const rows = (stats.revenueBreakdown?.[key] || []) as Array<{ key: string; revenue: number }>;
		return rows.slice(-12).map((row) => ({ label: row.key, value: row.revenue }));
	});
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
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
		class="rounded-lg border p-3"
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

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
		<div
			class="rounded-lg p-3"
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
			<div class="mt-2">
				<Sparkline
					data={(stats.revenueBreakdown?.lineTrend || []).map(
						(p: { revenue: number }) => p.revenue
					)}
				/>
			</div>
		</div>
		<div
			class="rounded-lg p-3"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<p class="text-sm" style="color: var(--text-muted)">Total Orders</p>
			<p class="mt-1 text-2xl font-bold" style="color: var(--text)">{stats.totalOrders || 0}</p>
			<p class="mt-1 text-xs" style="color: var(--text-muted)">
				{formatPct(stats.ordersChange || 0)} vs last month
			</p>
			<div class="mt-2">
				<Sparkline
					data={(stats.revenueBreakdown?.lineTrend || []).map(
						(p: { orderCount: number }) => p.orderCount
					)}
					color="var(--status-info)"
				/>
			</div>
		</div>
		<div
			class="rounded-lg p-3"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<p class="text-sm" style="color: var(--text-muted)">Total Customers</p>
			<p class="mt-1 text-2xl font-bold" style="color: var(--text)">{stats.totalCustomers || 0}</p>
			<p class="mt-1 text-xs" style="color: var(--text-muted)">
				{formatPct(stats.customersChange || 0)} vs last month
			</p>
		</div>
		<div
			class="rounded-lg p-3"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<p class="text-sm" style="color: var(--text-muted)">Accounts Sold</p>
			<p class="mt-1 text-2xl font-bold" style="color: var(--text)">{stats.accountsSold || 0}</p>
			<p class="mt-1 text-xs" style="color: var(--text-muted)">
				{formatPct(stats.accountsChange || 0)} vs last month
			</p>
		</div>
		<div
			class="rounded-lg p-3"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<p class="text-sm" style="color: var(--text-muted)">Average Order Value</p>
			<p class="mt-1 text-2xl font-bold" style="color: var(--text)">
				{formatMoney(stats.aov || 0)}
			</p>
			<div class="mt-1 flex items-center gap-1 text-xs" style="color: var(--text-muted);">
				{#if Number(stats.aovChange || 0) >= 0}
					<ArrowUp class="h-3.5 w-3.5 text-green-600" />
				{:else}
					<ArrowDown class="h-3.5 w-3.5 text-red-600" />
				{/if}
				<span>{formatPct(stats.aovChange || 0)} vs last month</span>
			</div>
		</div>
	</div>

	{#if stats.advancedAnalyticsEnabled}
		<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<section
				class="rounded-lg p-3"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">
					Revenue Breakdown by Platform
				</h2>
				<div class="mt-3">
					<BarChart
						orientation="horizontal"
						data={(stats.revenueBreakdown?.byPlatform || [])
							.slice(0, 8)
							.map((row: { name: string; revenue: number }) => ({
								label: row.name,
								value: row.revenue
							}))}
						formatValue={formatMoney}
						emptyMessage="No revenue data available."
					/>
				</div>
			</section>

			<section
				class="rounded-lg p-3"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">Top Tier Revenue</h2>
				<div class="mt-3">
					<BarChart
						orientation="horizontal"
						data={(stats.revenueBreakdown?.byTier || [])
							.slice(0, 8)
							.map((row: { platformName: string; name: string; revenue: number }) => ({
								label: `${row.platformName} / ${row.name}`,
								value: row.revenue
							}))}
						formatValue={formatMoney}
						emptyMessage="No tier revenue data available."
					/>
				</div>
			</section>
		</div>

		<section
			class="rounded-lg p-3"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-base font-semibold" style="color: var(--text)">
				Revenue Trend (Last 30 Days)
			</h2>
			<div class="mt-3">
				<AreaLineChart
					data={(stats.revenueBreakdown?.lineTrend || []).map(
						(point: { key: string; revenue: number }) => ({
							key: point.key,
							value: point.revenue
						})
					)}
					formatLabel={(key) => key.slice(5)}
					emptyMessage="No revenue data available."
				/>
			</div>
		</section>

		<section
			class="rounded-lg p-3"
			style="border: 1px solid rgba(105,109,250,0.3); background: var(--bg-elev-1);"
		>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-base font-semibold" style="color: var(--fa-blue-300);">
					Boosting Services
				</h2>
				<div class="flex flex-wrap gap-4 text-sm" style="color: var(--text-muted);">
					<span
						>Orders: <strong style="color: var(--text);">{stats.boosting?.totalOrders || 0}</strong
						></span
					>
					<span
						>Lifetime revenue: <strong style="color: var(--text);"
							>{formatMoney(stats.boosting?.totalRevenue || 0)}</strong
						></span
					>
					<span
						>This month: <strong style="color: var(--text);"
							>{formatMoney(stats.boosting?.thisMonthRevenue || 0)}</strong
						></span
					>
				</div>
			</div>
			<div class="mt-3">
				<AreaLineChart
					data={(stats.boosting?.revenueBreakdown?.lineTrend || []).map(
						(point: { key: string; revenue: number }) => ({
							key: point.key,
							value: point.revenue
						})
					)}
					formatLabel={(key) => key.slice(5)}
					emptyMessage="No boosting revenue data yet."
				/>
			</div>
		</section>

		<section
			class="rounded-lg p-3"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-base font-semibold" style="color: var(--text)">Revenue by Period</h2>
				<div class="flex gap-1">
					{#each [['day', 'Day'], ['week', 'Week'], ['month', 'Month']] as [value, label]}
						<button
							type="button"
							class="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
							style={granularity === value
								? 'background: var(--primary); color: var(--bg);'
								: 'background: var(--bg-elev-2); color: var(--text-muted); border: 1px solid var(--border);'}
							onclick={() => (granularity = value as 'day' | 'week' | 'month')}
						>
							{label}
						</button>
					{/each}
				</div>
			</div>
			<div class="mt-3">
				<BarChart
					orientation="vertical"
					data={granularityData}
					formatValue={formatMoney}
					emptyMessage="No revenue data available."
				/>
			</div>
		</section>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<section
				class="rounded-lg p-3"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">Order Status</h2>
				<div class="mt-3">
					<DonutChart
						data={(stats.insights?.orderStatusBreakdown || []).map(
							(row: { status: string; label: string; count: number }) => ({
								label: row.label,
								value: row.count,
								color: STATUS_COLOR_MAP[row.status]
							})
						)}
						emptyMessage="No order data available."
					/>
				</div>
			</section>

			<section
				class="rounded-lg p-3"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">Payment Channel</h2>
				<div class="mt-3">
					<DonutChart
						data={(stats.insights?.paymentChannelBreakdown || []).map(
							(row: { channel: string; count: number }) => ({
								label: row.channel,
								value: row.count
							})
						)}
						emptyMessage="No payment data available."
					/>
				</div>
			</section>

			<section
				class="rounded-lg p-3"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">
					Affiliate vs Direct Revenue
				</h2>
				<div class="mt-3">
					<DonutChart
						data={[
							{
								label: 'Affiliate',
								value: stats.insights?.affiliateRevenueSplit?.affiliate || 0,
								color: 'var(--status-info)'
							},
							{
								label: 'Direct',
								value: stats.insights?.affiliateRevenueSplit?.nonAffiliate || 0,
								color: 'var(--primary)'
							}
						]}
						formatValue={formatMoney}
						emptyMessage="No revenue data available."
					/>
				</div>
			</section>

			<section
				class="rounded-lg p-3"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">
					Repeat vs First-Time Buyers
				</h2>
				<div class="mt-3">
					<DonutChart
						data={[
							{
								label: 'Repeat',
								value: stats.insights?.buyerComposition?.repeatCustomers || 0,
								color: 'var(--primary)'
							},
							{
								label: 'First-time',
								value: stats.insights?.buyerComposition?.firstTimeBuyers || 0,
								color: 'var(--status-info)'
							}
						]}
						emptyMessage="No buyer data available."
					/>
				</div>
			</section>
		</div>

		<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<section
				class="rounded-lg p-3"
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
				class="rounded-lg p-3"
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
				<div class="mt-3">
					<BarChart
						orientation="horizontal"
						data={(stats.stockVelocity?.tiers || [])
							.slice(0, 8)
							.map((tier: { platformName: string; tierName: string; rollingSellThroughRate: number }) => ({
								label: `${tier.platformName} / ${tier.tierName}`,
								value: tier.rollingSellThroughRate
							}))}
						formatValue={formatPct}
						emptyMessage="No stock velocity data available."
					/>
				</div>
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

		<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<section
				class="rounded-lg p-3"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">
					Traffic & Funnel (Last 30 Days)
				</h2>
				{#if stats.trafficFunnel?.funnel?.length}
					<div class="mt-3 space-y-2">
						{#each stats.trafficFunnel.funnel as step}
							<div
								class="flex items-center justify-between rounded-lg p-3"
								style="background: var(--bg); border: 1px solid var(--border);"
							>
								<div>
									<p class="text-sm font-semibold" style="color: var(--text)">{step.label}</p>
									{#if step.conversionRate !== null}
										<p class="text-xs" style="color: var(--text-muted);">
											{formatPct(step.conversionRate)} of previous step
										</p>
									{/if}
								</div>
								<p class="text-lg font-bold" style="color: var(--text)">
									{step.count.toLocaleString()}
								</p>
							</div>
						{/each}
					</div>
				{:else}
					<p class="mt-3 text-sm" style="color: var(--text-muted);">
						No traffic data recorded yet.
					</p>
				{/if}
			</section>

			<section
				class="rounded-lg p-3"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<h2 class="text-base font-semibold" style="color: var(--text)">
					Top Pages (Last 30 Days)
				</h2>
				{#if stats.trafficFunnel?.topPages?.length}
					<div class="mt-3 space-y-2">
						{#each stats.trafficFunnel.topPages as row}
							<div
								class="flex items-center justify-between rounded-lg p-3"
								style="background: var(--bg); border: 1px solid var(--border);"
							>
								<span class="truncate text-sm" style="color: var(--text)">{row.path}</span>
								<span class="text-sm font-semibold" style="color: var(--text)"
									>{row.views.toLocaleString()}</span
								>
							</div>
						{/each}
					</div>
				{:else}
					<p class="mt-3 text-sm" style="color: var(--text-muted);">
						No page view data recorded yet.
					</p>
				{/if}
			</section>
		</div>
	{/if}
</div>
