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
			canView: canViewRevenue,
			hideMonetaryAmounts,
			format: formatPrice
		});
	}

	function formatPct(value: number | null): string {
		// null = no prior baseline this metric could grow from.
		if (value === null || value === undefined) return 'New';
		return `${Number(value).toFixed(1)}%`;
	}

	type AnalyticsTab = 'overview' | 'users' | 'numbers';
	let activeTab = $state<AnalyticsTab>('overview');
	const ua = $derived((data.userAnalytics ?? null) as Record<string, any> | null);
	const acq = $derived(
		(data.acquisition ?? null) as {
			rows: Array<{
				source: string;
				signups: number;
				buyers: number;
				revenueNgn: number;
				convPct: number;
			}>;
			totalSignups: number;
			attributedSignups: number;
			windowDays: number;
		} | null
	);
	const uaMaxSignup = $derived(
		ua?.signupsByDay?.length ? Math.max(1, ...ua.signupsByDay.map((d: any) => d.count)) : 1
	);
	let hoveredSignup = $state<{ key: string; count: number } | null>(null);
	const uaRt = $derived(
		(ua?.revenueByType ?? { account: 0, numbers: 0, boosting: 0 }) as {
			account: number;
			numbers: number;
			boosting: number;
		}
	);
	const uaTotalRt = $derived(Math.max(1, uaRt.account + uaRt.numbers + uaRt.boosting));
	const ANALYTICS_TABS: { id: AnalyticsTab; label: string }[] = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'users', label: 'Users' },
		{ id: 'numbers', label: 'Numbers' }
	];

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

	<!-- Analytics hub tabs -->
	<div class="flex flex-wrap gap-2">
		{#each ANALYTICS_TABS as tab (tab.id)}
			<button
				type="button"
				onclick={() => (activeTab = tab.id)}
				class="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
				style={activeTab === tab.id
					? 'background: var(--fa-lime-700); color: #0a0a0a;'
					: 'background: var(--bg-elev-1); color: var(--text-muted); border: 1px solid var(--border);'}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	{#if activeTab === 'overview'}
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
				{#if stats.revenueChange === null || stats.revenueChange === undefined}
				{:else if stats.revenueChange >= 0}
					<ArrowUp class="h-3.5 w-3.5 text-green-600" />
				{:else}
					<ArrowDown class="h-3.5 w-3.5 text-red-600" />
				{/if}
				<span>{formatPct(stats.revenueChange)} vs last month</span>
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
				{formatPct(stats.ordersChange)} vs last month
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
				{formatPct(stats.customersChange)} vs last month
			</p>
		</div>
		<div
			class="rounded-lg p-3"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<p class="text-sm" style="color: var(--text-muted)">Accounts Sold</p>
			<p class="mt-1 text-2xl font-bold" style="color: var(--text)">{stats.accountsSold || 0}</p>
			<p class="mt-1 text-xs" style="color: var(--text-muted)">
				{formatPct(stats.accountsChange)} vs last month
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
				{#if stats.aovChange === null || stats.aovChange === undefined}
				{:else if stats.aovChange >= 0}
					<ArrowUp class="h-3.5 w-3.5 text-green-600" />
				{:else}
					<ArrowDown class="h-3.5 w-3.5 text-red-600" />
				{/if}
				<span>{formatPct(stats.aovChange)} vs last month</span>
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
					formatValue={formatMoney}
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

		{#if acq}
			<section
				class="mb-4 rounded-lg p-3"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<div class="flex items-baseline justify-between gap-2">
					<h2 class="text-base font-semibold" style="color: var(--text)">
						Signups &amp; Revenue by Source (Last {acq.windowDays} Days)
					</h2>
					<span class="text-xs" style="color: var(--text-muted);"
						>{acq.attributedSignups}/{acq.totalSignups} attributed</span
					>
				</div>
				{#if acq.rows.length}
					<div class="mt-3 overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr
									class="text-left text-xs uppercase tracking-wide"
									style="color: var(--text-muted);"
								>
									<th class="py-2 pr-3 font-medium">Source</th>
									<th class="px-3 py-2 text-right font-medium">Signups</th>
									<th class="px-3 py-2 text-right font-medium">Buyers</th>
									<th class="px-3 py-2 text-right font-medium">Conv.</th>
									<th class="py-2 pl-3 text-right font-medium">Revenue</th>
								</tr>
							</thead>
							<tbody>
								{#each acq.rows as r}
									<tr style="border-top: 1px solid var(--border);">
										<td
											class="py-2 pr-3 font-medium"
											style="color: {r.source === 'untracked'
												? 'var(--text-dim)'
												: 'var(--text)'};">{r.source}</td
										>
										<td class="px-3 py-2 text-right" style="color: var(--text-muted);">{r.signups}</td>
										<td class="px-3 py-2 text-right" style="color: var(--text-muted);">{r.buyers}</td>
										<td class="px-3 py-2 text-right" style="color: var(--text-muted);"
											>{r.convPct.toFixed(0)}%</td
										>
										<td
											class="py-2 pl-3 text-right font-semibold"
											style="color: var(--fa-green-500);">{formatMoney(r.revenueNgn)}</td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if acq.attributedSignups === 0}
						<p class="mt-3 text-xs" style="color: var(--text-dim);">
							Attribution just went live — new signups will show their real source here (existing
							users are “untracked”).
						</p>
					{/if}
				{:else}
					<p class="mt-3 text-sm" style="color: var(--text-muted);">No signups in this window yet.</p>
				{/if}
			</section>
		{/if}

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
	{:else if activeTab === 'users'}
		{#if ua}
			<!-- Insight callouts -->
			{#if ua.insights?.length}
				<div class="grid gap-2 sm:grid-cols-2">
					{#each ua.insights as insight}
						<div
							class="rounded-lg p-3 text-sm"
							style="background: var(--bg-elev-1); border: 1px solid var(--border); color: var(--text);"
						>
							💡 {insight}
						</div>
					{/each}
				</div>
			{/if}

			<!-- User KPIs -->
			<div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
				{#snippet ukpi(label: string, value: string, sub = '')}
					<div class="rounded-lg p-4" style="background: var(--bg-elev-1); border: 1px solid var(--border);">
						<p class="text-xs" style="color: var(--text-muted);">{label}</p>
						<p class="text-xl font-bold" style="color: var(--text);">{value}</p>
						{#if sub}<p class="text-xs" style="color: var(--text-dim);">{sub}</p>{/if}
					</div>
				{/snippet}
				{@render ukpi('Total users', ua.totalUsers.toLocaleString(), `${ua.newUsers30d} new (30d)`)}
				{@render ukpi('Buyers', ua.buyers.toLocaleString(), `${ua.buyerConversionRate}% of signups`)}
				{@render ukpi('Repeat rate', `${ua.repeatRate}%`, `${ua.repeatBuyers} repeat`)}
				{@render ukpi('Avg orders/buyer', String(ua.avgOrdersPerBuyer))}
				{@render ukpi('Days to 1st buy', ua.avgDaysToFirstPurchase == null ? '—' : String(ua.avgDaysToFirstPurchase))}
				{@render ukpi('Returning rev.', formatMoney(ua.returningRevenue), `New: ${formatMoney(ua.newRevenue)}`)}
			</div>

			<!-- Signups (30d) -->
			<section class="rounded-lg border p-4" style="background: var(--surface); border-color: var(--border);">
				<div class="mb-3 flex items-baseline justify-between">
					<h2 class="text-base font-semibold" style="color: var(--text);">Signups — last 30 days</h2>
					<span class="text-xs" style="color: var(--text-muted);">
						{#if hoveredSignup}
							{hoveredSignup.key}: <strong style="color: var(--text);">{hoveredSignup.count}</strong>
						{:else}
							hover a bar for the count
						{/if}
					</span>
				</div>
				<div class="flex items-end gap-1" style="height: 90px;">
					{#each ua.signupsByDay as d (d.key)}
						<div
							class="flex-1 rounded-t transition-opacity"
							style="height: {Math.round((d.count / uaMaxSignup) * 100)}%; min-height: 2px; background: #38bdf8; opacity: {hoveredSignup &&
							hoveredSignup.key !== d.key
								? 0.45
								: 1}; cursor: pointer;"
							role="presentation"
							onpointerenter={() => (hoveredSignup = d)}
							onpointerleave={() => (hoveredSignup = null)}
						></div>
					{/each}
				</div>
			</section>

			<div class="grid gap-4 lg:grid-cols-2">
				<!-- Cohorts -->
				<section class="rounded-lg border p-4" style="background: var(--surface); border-color: var(--border);">
					<h2 class="mb-3 text-base font-semibold" style="color: var(--text);">Signup cohorts → conversion</h2>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
									<th class="py-2">Month</th>
									<th class="py-2 text-right">Signups</th>
									<th class="py-2 text-right">Converted</th>
									<th class="py-2 text-right">Rate</th>
								</tr>
							</thead>
							<tbody>
								{#each ua.cohorts as c (c.month)}
									<tr style="border-top: 1px solid var(--border);">
										<td class="py-2" style="color: var(--text);">{c.month}</td>
										<td class="py-2 text-right" style="color: var(--text);">{c.signups}</td>
										<td class="py-2 text-right" style="color: var(--text);">{c.converted}</td>
										<td class="py-2 text-right" style="color: #34d399;">{c.rate}%</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>

				<!-- Revenue mix by service -->
				<section class="rounded-lg border p-4" style="background: var(--surface); border-color: var(--border);">
					<h2 class="mb-3 text-base font-semibold" style="color: var(--text);">Revenue by service</h2>
					{#each [{ k: 'Accounts', v: uaRt.account, c: '#84cc16' }, { k: 'Numbers', v: uaRt.numbers, c: '#38bdf8' }, { k: 'Boosting', v: uaRt.boosting, c: '#a78bfa' }] as row}
						<div class="mb-2">
							<div class="mb-1 flex justify-between text-sm">
								<span style="color: var(--text);">{row.k}</span>
								<span style="color: var(--text-muted);">{formatMoney(row.v)} · {Math.round((row.v / uaTotalRt) * 100)}%</span>
							</div>
							<div class="h-2 rounded-full" style="background: var(--bg-elev-2);">
								<div class="h-2 rounded-full" style="width: {Math.round((row.v / uaTotalRt) * 100)}%; background: {row.c};"></div>
							</div>
						</div>
					{/each}
				</section>
			</div>

			<!-- Top customers -->
			<section class="rounded-lg border p-4" style="background: var(--surface); border-color: var(--border);">
				<h2 class="mb-3 text-base font-semibold" style="color: var(--text);">Top customers by lifetime spend</h2>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
								<th class="py-2">Customer</th>
								<th class="py-2 text-right">Orders</th>
								<th class="py-2 text-right">Lifetime spend</th>
							</tr>
						</thead>
						<tbody>
							{#each ua.topCustomers as c (c.userId)}
								<tr style="border-top: 1px solid var(--border);">
									<td class="py-2">
										<a href="/admin/users?q={encodeURIComponent(c.name)}" class="hover:underline" style="color: #38bdf8;">{c.name}</a>
									</td>
									<td class="py-2 text-right" style="color: var(--text);">{c.orders}</td>
									<td class="py-2 text-right" style="color: var(--text);">{formatMoney(c.spent)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{:else}
			<p class="text-sm" style="color: var(--text-muted);">User analytics are unavailable right now.</p>
		{/if}
	{:else if activeTab === 'numbers'}
		<section
			class="rounded-lg border p-6 text-center"
			style="background: var(--surface); border-color: var(--border);"
		>
			<p class="mb-2 text-base font-semibold" style="color: var(--text);">Numbers analytics live in their own dashboard</p>
			<p class="mb-4 text-sm" style="color: var(--text-muted);">
				Rents, success rate, revenue, margin, hub-man balance, buyer attribution and recent rentals.
			</p>
			<a
				href="/admin/numbers/analytics"
				class="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold"
				style="background: #0ea5e9; color: #ffffff;"
			>
				Open Numbers analytics →
			</a>
		</section>
	{/if}
</div>
