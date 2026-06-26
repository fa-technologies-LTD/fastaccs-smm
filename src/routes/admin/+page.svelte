<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Package,
		ShoppingCart,
		Users,
		DollarSign,
		Eye,
		EyeOff,
		AlertCircle,
		AlertTriangle,
		Activity,
		RefreshCw,
		BarChart3,
		ArrowUpRight,
		ChevronDown,
		ChevronUp,
		Mail,
		Zap
	} from '$lib/icons';
	import { getOrderStats } from '$lib/services/orders';
	import { getInventoryStats } from '$lib/services/inventory';
	import { formatPrice } from '$lib/helpers/utils';
	import { ADMIN_MONEY_VISIBILITY_KEY, formatAdminMoney } from '$lib/helpers/admin-money';
	import { ADMIN_DASHBOARD_SECTIONS } from '$lib/admin/dashboard-sections';
	import type { AdminPermission } from '$lib/auth/admin-roles';
	import type { RecentActivityItem, DashboardIssues } from '$lib/services/admin-dashboard';
	import type { FeatureFlagSnapshot } from '$lib/services/feature-flags';

	// Props from load function
	interface Props {
		data: {
			orderStats: {
				total_orders: number;
				paid_orders: number;
				pending_orders: number;
				processing_orders: number;
				completed_orders: number;
				cancelled_orders: number;
				failed_orders: number;
				todays_orders: number;
				total_revenue: number;
				todays_revenue: number;
				units_sold: number;
				total_users: number;
			};
			inventoryStats: {
				total_tiers: number;
				total_available: number;
				total_reserved: number;
				total_sold: number;
				lifetime_sold_stock: number;
				out_of_stock: number;
				low_stock: number;
				platforms: number;
				product_types: number;
				accountsInOutOfStockTiers: number;
				outOfStockTiersCount: number;
			};
			boostingStats: {
				total_orders: number;
				pending_fulfillment: number;
				in_progress_fulfillment: number;
				completed_fulfillment: number;
				total_revenue: number;
				todays_revenue: number;
				this_month_revenue: number;
			};
			error: string | null;
			canViewRevenue?: boolean;
			recentActivity?: RecentActivityItem[];
			dashboardIssues?: DashboardIssues;
			adminPermissions?: AdminPermission[];
			featureFlags?: FeatureFlagSnapshot;
		};
	}

	let { data }: Props = $props();

	let orderStats = $state(data.orderStats);
	let inventoryStats = $state(data.inventoryStats);
	let boostingStats = $state(data.boostingStats);
	let loading = $state(false);
	let error = $state(data.error);
	let autoRefresh = $state(false);
	let refreshInterval: NodeJS.Timeout | null = null;
	let lastUpdated = $state<Date>(new Date());
	const canViewRevenue = Boolean(data.canViewRevenue);
	let hideMonetaryAmounts = $state(false);

	const adminPermissionSet = $derived(new Set(data.adminPermissions ?? []));
	const featureFlags = $derived(data.featureFlags);
	const visibleSections = $derived(
		ADMIN_DASHBOARD_SECTIONS.filter((section) => {
			if (section.permission && !adminPermissionSet.has(section.permission)) return false;
			if (section.featureFlag && !featureFlags?.[section.featureFlag]) return false;
			return true;
		})
	);

	const recentActivity = $derived(data.recentActivity ?? []);
	const dashboardIssues = $derived(data.dashboardIssues ?? { failedEmails: [], unhealthyJobs: [] });
	let issuesExpanded = $state(false);
	let managementExpanded = $state(true);
	let activityExpanded = $state(true);
	const outOfStockCount = $derived(
		inventoryStats.outOfStockTiersCount || inventoryStats.out_of_stock || 0
	);
	const totalIssueCount = $derived(
		outOfStockCount + dashboardIssues.failedEmails.length + dashboardIssues.unhealthyJobs.length
	);

	async function refreshData() {
		loading = true;
		try {
			// Handle services individually to get partial data if one fails
			const orderStatsPromise = getOrderStats().catch((err) => {
				console.warn('Order stats refresh failed:', err);
				return { data: null, error: err };
			});

			const inventoryStatsPromise = getInventoryStats().catch((err) => {
				console.warn('Inventory stats refresh failed:', err);
				return { data: null, error: err };
			});

			const [orderStatsResult, inventoryStatsResult] = await Promise.all([
				orderStatsPromise,
				inventoryStatsPromise
			]);

			// Update what we can
			if (orderStatsResult.data) {
				orderStats = orderStatsResult.data;
			}
			if (orderStatsResult.boostingData) {
				boostingStats = orderStatsResult.boostingData;
			}
			if (inventoryStatsResult.data) {
				inventoryStats = inventoryStatsResult.data;
			}

			// Collect any errors
			const errors = [];
			if (orderStatsResult.error) {
				errors.push('Order stats unavailable');
			}
			if (inventoryStatsResult.error) {
				errors.push('Inventory stats unavailable');
			}

			lastUpdated = new Date();
			error = errors.length > 0 ? errors.join(', ') : null;
		} catch (err) {
			console.error('Error refreshing dashboard:', err);
			error = err instanceof Error ? err.message : 'Failed to refresh dashboard data';
		} finally {
			loading = false;
		}
	}

	function startAutoRefresh() {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
		refreshInterval = setInterval(refreshData, 30000); // Refresh every 30 seconds
	}

	function toggleAutoRefresh() {
		autoRefresh = !autoRefresh;
		if (autoRefresh) {
			startAutoRefresh();
		} else if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	}

	function toggleMonetaryVisibility() {
		if (!canViewRevenue) return;
		hideMonetaryAmounts = !hideMonetaryAmounts;
		localStorage.setItem(ADMIN_MONEY_VISIBILITY_KEY, hideMonetaryAmounts ? 'true' : 'false');
	}

	function formatMonetaryAmount(amount: number): string {
		return formatAdminMoney(amount, {
			canViewRevenue,
			hideMonetaryAmounts,
			format: formatPrice
		});
	}

	function formatRelativeTime(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
		return `${Math.floor(diffMins / 1440)}d ago`;
	}

	onMount(() => {
		hideMonetaryAmounts = canViewRevenue
			? localStorage.getItem(ADMIN_MONEY_VISIBILITY_KEY) === 'true'
			: false;
		if (autoRefresh) {
			startAutoRefresh();
		}
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});
</script>

<svelte:head>
	<title>Admin Dashboard - FastAccs</title>
</svelte:head>

<div class="p-2 sm:p-4">
	<div class="mx-auto max-w-7xl">
		<!-- Enhanced Header -->
		<div class="mb-4 sm:mb-6">
			<div class="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
						Overview of your FastAccs
					</h1>
					{#if !loading}
						<span class="mt-1 block text-xs sm:text-sm" style="color: var(--text-muted)">
							Last updated: {formatRelativeTime(lastUpdated)}
						</span>
					{/if}
				</div>

				<div class="flex flex-row flex-wrap items-center gap-1.5 sm:gap-2">
					<!-- Money visibility toggle -->
					{#if canViewRevenue}
						<button
							onclick={toggleMonetaryVisibility}
							class="flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs transition-all hover:scale-[.98] active:scale-95 sm:px-3 sm:text-sm"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text)"
						>
							{#if hideMonetaryAmounts}
								<Eye class="h-4 w-4" />
								<span class="hidden sm:inline">Show Amounts</span>
								<span class="sm:hidden">Show</span>
							{:else}
								<EyeOff class="h-4 w-4" />
								<span class="hidden sm:inline">Hide Amounts</span>
								<span class="sm:hidden">Hide</span>
							{/if}
						</button>
					{:else}
						<div
							class="flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs sm:px-3 sm:text-sm"
							style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text-dim)"
						>
							<EyeOff class="h-4 w-4" />
							<span class="hidden sm:inline">Revenue Restricted</span>
							<span class="sm:hidden">Restricted</span>
						</div>
					{/if}

					<!-- Auto-refresh toggle -->
					<button
						onclick={toggleAutoRefresh}
						class="flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs transition-all hover:scale-[.98] active:scale-95 sm:px-3 sm:text-sm"
						style={autoRefresh
							? 'border: 1px solid var(--status-success-border); background: var(--status-success-bg); color: var(--status-success)'
							: 'background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text)'}
					>
						<Activity class="h-4 w-4" />
						<span class="hidden sm:inline">Auto-refresh</span>
						<span class="sm:hidden">Auto</span>
						{autoRefresh ? 'ON' : 'OFF'}
					</button>

					<!-- Manual refresh -->
					<button
						onclick={refreshData}
						disabled={loading}
						class="flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-white transition-all hover:scale-[.98] active:scale-95 disabled:opacity-50 disabled:active:scale-100 sm:px-3 sm:text-sm"
						style="background: var(--btn-primary-gradient)"
					>
						<RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
						Refresh
					</button>
				</div>
			</div>
		</div>

		<!-- Error Display -->
		{#if error}
			<div
				class="mb-8 rounded-lg p-4"
				style="border: 1px solid var(--status-error-border); background: var(--status-error-bg);"
			>
				<div class="flex items-center">
					<AlertCircle class="mr-2 h-5 w-5" style="color: var(--status-error);" />
					<div>
						<h3 class="text-sm font-medium" style="color: var(--status-error);">
							Dashboard Loading Error
						</h3>
						<p class="mt-1 text-sm" style="color: var(--text-muted);">{error}</p>
						<button
							onclick={refreshData}
							class="mt-2 text-sm underline"
							style="color: var(--status-error);"
						>
							Try Again
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Main Statistics Grid -->
		<div class="mb-4 grid grid-cols-2 gap-2.5 sm:mb-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
			<!-- Completed Orders -->
			<div
				class="group rounded-lg p-3 sm:p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center">
					<div class="rounded-lg p-2 sm:p-3" style="background: rgba(105,109,250,0.12);">
						<ShoppingCart
							class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
							style="color: var(--link);"
						/>
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
							Completed Orders
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{orderStats.completed_orders}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-xs sm:text-sm" style="color: var(--text-muted)"
								>Paid-confirmed: {orderStats.paid_orders}</span
							>
						</div>
					</div>
				</div>
			</div>

			<!-- Cancelled Orders -->
			<div
				class="group rounded-lg p-3 sm:p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center">
					<div class="rounded-lg p-2 sm:p-3" style="background: rgba(239,68,68,0.12);">
						<AlertCircle
							class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
							style="color: rgb(248, 113, 113);"
						/>
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
							Cancelled Orders
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{orderStats.cancelled_orders}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-xs sm:text-sm" style="color: var(--text-muted)">
								Failed total: {orderStats.failed_orders}
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Total Revenue -->
			<div
				class="group rounded-lg p-3 sm:p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center">
					<div class="rounded-lg p-2 sm:p-3" style="background: rgba(5,212,113,0.12);">
						<DollarSign
							class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
							style="color: var(--primary);"
						/>
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
							Paid Revenue
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{formatMonetaryAmount(orderStats.total_revenue)}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-xs sm:text-sm" style="color: var(--text-muted)"
								>Today:
								{formatMonetaryAmount(orderStats.todays_revenue)}</span
							>
						</div>
					</div>
				</div>
			</div>

			<!-- Lifetime Sold Stock -->
			<div
				class="group rounded-lg p-3 sm:p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center">
					<div class="rounded-lg p-2 sm:p-3" style="background: rgba(168,85,247,0.12);">
						<Package
							class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
							style="color: #a855f7;"
						/>
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
							Lifetime Sold Stock
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{inventoryStats.lifetime_sold_stock || inventoryStats.total_sold || 0}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-xs sm:text-sm" style="color: var(--text-muted)"
								>SKU units sold: {orderStats.units_sold || 0}</span
							>
						</div>
					</div>
				</div>
			</div>

			<!-- Total Users -->
			<div
				class="group rounded-lg p-3 sm:p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center">
					<div class="rounded-lg p-2 sm:p-3" style="background: rgba(99,102,241,0.12);">
						<Users
							class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
							style="color: #818cf8;"
						/>
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
							Total Users
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{orderStats.total_users || 0}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-xs sm:text-sm" style="color: var(--text-muted)">
								All accounts
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Out of Stock -->
			<div
				class="group rounded-lg p-3 sm:p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center">
					<div class="rounded-lg p-2 sm:p-3" style="background: rgba(249,115,22,0.12);">
						<AlertCircle
							class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
							style="color: #f97316;"
						/>
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
							Out of Stock
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{inventoryStats.outOfStockTiersCount || inventoryStats.out_of_stock || 0}
						</p>
						<div class="mt-1 flex items-center">
							{#if (inventoryStats.outOfStockTiersCount || inventoryStats.out_of_stock || 0) > 0}
								<span class="text-xs sm:text-sm" style="color: #f97316;">
									{inventoryStats.outOfStockTiersCount || inventoryStats.out_of_stock || 0} account
									{(inventoryStats.outOfStockTiersCount || inventoryStats.out_of_stock || 0) === 1
										? ' type is'
										: ' types are'} out of stock
								</span>
							{:else}
								<span class="text-xs sm:text-sm" style="color: var(--status-success);"
									>All tiers have stock</span
								>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Product Types -->
			<div
				class="group rounded-lg p-3 sm:p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center">
					<div class="rounded-lg p-2 sm:p-3" style="background: rgba(168,85,247,0.12);">
						<Package
							class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
							style="color: #a855f7;"
						/>
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
							Account Types
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{inventoryStats.product_types || inventoryStats.total_tiers}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-xs sm:text-sm" style="color: var(--text-muted)"
								>{inventoryStats.platforms} active platforms</span
							>
						</div>
					</div>
				</div>
			</div>

			<!-- Reserved Stock -->
			<div
				class="group rounded-lg p-3 sm:p-4"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center">
					<div class="rounded-lg p-2 sm:p-3" style="background: rgba(202,219,46,0.12);">
						<BarChart3
							class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
							style="color: var(--fa-lime-700);"
						/>
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
							Reserved Stock
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{inventoryStats.total_reserved || 0}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-xs sm:text-sm" style="color: var(--text-muted);">
								Available: {inventoryStats.total_available}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Boosting Services -->
		<div class="mb-4 sm:mb-6">
			<p
				class="mb-2 text-xs font-semibold tracking-[0.1em] uppercase sm:mb-3"
				style="color: var(--fa-blue-300);"
			>
				Boosting Services
			</p>
			<div class="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
				<div
					class="group rounded-lg p-3 sm:p-4"
					style="background: var(--bg-elev-1); border: 1px solid rgba(105,109,250,0.3)"
				>
					<div class="flex items-center">
						<div class="rounded-lg p-2 sm:p-3" style="background: rgba(105,109,250,0.14);">
							<Zap
								class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
								style="color: var(--fa-blue-300);"
							/>
						</div>
						<div class="ml-3 min-w-0 flex-1 sm:ml-4">
							<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
								Boosting Orders
							</p>
							<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
								{boostingStats.total_orders}
							</p>
							<div class="mt-1 flex items-center">
								<span class="text-xs sm:text-sm" style="color: var(--text-muted);">
									{boostingStats.pending_fulfillment + boostingStats.in_progress_fulfillment} awaiting
									fulfillment
								</span>
							</div>
						</div>
					</div>
				</div>

				<div
					class="group rounded-lg p-3 sm:p-4"
					style="background: var(--bg-elev-1); border: 1px solid rgba(105,109,250,0.3)"
				>
					<div class="flex items-center">
						<div class="rounded-lg p-2 sm:p-3" style="background: rgba(105,109,250,0.14);">
							<DollarSign
								class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
								style="color: var(--fa-blue-300);"
							/>
						</div>
						<div class="ml-3 min-w-0 flex-1 sm:ml-4">
							<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
								Boosting Revenue
							</p>
							<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
								{formatMonetaryAmount(boostingStats.total_revenue)}
							</p>
							<div class="mt-1 flex items-center">
								<span class="text-xs sm:text-sm" style="color: var(--text-muted)">
									This month: {formatMonetaryAmount(boostingStats.this_month_revenue)}
								</span>
							</div>
						</div>
					</div>
				</div>

				<div
					class="group rounded-lg p-3 sm:p-4"
					style="background: var(--bg-elev-1); border: 1px solid rgba(105,109,250,0.3)"
				>
					<div class="flex items-center">
						<div class="rounded-lg p-2 sm:p-3" style="background: rgba(105,109,250,0.14);">
							<Activity
								class="size-5 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
								style="color: var(--fa-blue-300);"
							/>
						</div>
						<div class="ml-3 min-w-0 flex-1 sm:ml-4">
							<p class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
								Fulfillment Status
							</p>
							<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
								{boostingStats.completed_fulfillment} done
							</p>
							<div class="mt-1 flex items-center">
								<span class="text-xs sm:text-sm" style="color: var(--text-muted);">
									{boostingStats.pending_fulfillment} pending · {boostingStats.in_progress_fulfillment}
									in progress
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Management Center -->
		<div
			class="mb-4 rounded-lg sm:mb-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<button
				onclick={() => (managementExpanded = !managementExpanded)}
				class="flex w-full cursor-pointer items-center justify-between p-4 text-left"
				style={managementExpanded ? 'border-bottom: 1px solid var(--border)' : ''}
			>
				<div>
					<h3 class="text-lg font-semibold" style="color: var(--text)">Management Center</h3>
					<p class="mt-1 text-sm" style="color: var(--text-muted)">
						Access key administrative functions
					</p>
				</div>
				{#if managementExpanded}
					<ChevronUp class="h-5 w-5 flex-shrink-0" style="color: var(--text-dim);" />
				{:else}
					<ChevronDown class="h-5 w-5 flex-shrink-0" style="color: var(--text-dim);" />
				{/if}
			</button>
			{#if managementExpanded}
				<div class="p-4">
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each visibleSections as section (section.href)}
							{@const SectionIcon = section.icon}
							<a
								href={section.href}
								data-sveltekit-preload-data="hover"
								class="group flex items-center justify-between rounded-lg p-3 transition-all hover:scale-[.99]"
								style="border: 1px solid var(--border)"
							>
								<div class="flex items-center">
									<SectionIcon class="mr-3 h-5 w-5 flex-shrink-0" style="color: var(--text-dim);" />
									<div>
										<p class="font-medium" style="color: var(--text)">{section.label}</p>
										<p class="text-sm" style="color: var(--text-muted)">{section.description}</p>
									</div>
								</div>
								<ArrowUpRight
									class="h-4 w-4 flex-shrink-0 transition-all"
									style="color: var(--text-dim);"
								/>
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Recent Activity -->
		<div
			class="mb-4 rounded-lg sm:mb-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<button
				onclick={() => (activityExpanded = !activityExpanded)}
				class="flex w-full cursor-pointer items-center justify-between p-4 text-left"
				style={activityExpanded ? 'border-bottom: 1px solid var(--border)' : ''}
			>
				<div>
					<h3 class="text-lg font-semibold" style="color: var(--text)">Recent Activity</h3>
					<p class="mt-1 text-sm" style="color: var(--text-muted)">What's happened recently</p>
				</div>
				{#if activityExpanded}
					<ChevronUp class="h-5 w-5 flex-shrink-0" style="color: var(--text-dim);" />
				{:else}
					<ChevronDown class="h-5 w-5 flex-shrink-0" style="color: var(--text-dim);" />
				{/if}
			</button>
			{#if activityExpanded}
				<div class="p-4">
					{#if recentActivity.length > 0}
						<div class="space-y-2">
							{#each recentActivity as activity (activity.id)}
								{@const ActivityIcon =
									activity.type === 'order'
										? ShoppingCart
										: activity.type === 'signup'
											? Users
											: Activity}
								{#if activity.href}
									<a
										href={activity.href}
										class="flex items-center justify-between gap-3 rounded-lg p-2 transition-all hover:scale-[.99]"
										style="border: 1px solid var(--border)"
									>
										<div class="flex min-w-0 items-center gap-3">
											<ActivityIcon class="h-4 w-4 flex-shrink-0" style="color: var(--text-dim);" />
											<span class="truncate text-sm" style="color: var(--text)"
												>{activity.label}</span
											>
										</div>
										<span class="flex-shrink-0 text-xs" style="color: var(--text-muted)">
											{formatRelativeTime(activity.timestamp)}
										</span>
									</a>
								{:else}
									<div
										class="flex items-center justify-between gap-3 rounded-lg p-2"
										style="border: 1px solid var(--border)"
									>
										<div class="flex min-w-0 items-center gap-3">
											<ActivityIcon class="h-4 w-4 flex-shrink-0" style="color: var(--text-dim);" />
											<span class="truncate text-sm" style="color: var(--text)"
												>{activity.label}</span
											>
										</div>
										<span class="flex-shrink-0 text-xs" style="color: var(--text-muted)">
											{formatRelativeTime(activity.timestamp)}
										</span>
									</div>
								{/if}
							{/each}
						</div>
					{:else}
						<p class="text-sm" style="color: var(--text-muted)">No recent activity.</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Issues & Alerts -->
		<div class="rounded-lg" style="background: var(--bg-elev-1); border: 1px solid var(--border)">
			<button
				onclick={() => (issuesExpanded = !issuesExpanded)}
				class="flex w-full cursor-pointer items-center justify-between p-4 text-left"
			>
				<div>
					<h3 class="text-lg font-semibold" style="color: var(--text)">Issues & Alerts</h3>
					<p class="mt-1 text-sm" style="color: var(--text-muted)">
						{totalIssueCount > 0
							? `${totalIssueCount} item${totalIssueCount === 1 ? '' : 's'} need attention`
							: 'All clear'}
					</p>
				</div>
				{#if issuesExpanded}
					<ChevronUp class="h-5 w-5 flex-shrink-0" style="color: var(--text-dim);" />
				{:else}
					<ChevronDown class="h-5 w-5 flex-shrink-0" style="color: var(--text-dim);" />
				{/if}
			</button>
			{#if issuesExpanded}
				<div class="space-y-3 p-4" style="border-top: 1px solid var(--border)">
					{#if totalIssueCount === 0}
						<p class="text-sm" style="color: var(--status-success);">
							No failed emails, automation issues, or low-stock alerts.
						</p>
					{:else}
						{#if outOfStockCount > 0}
							<a
								href="/admin/inventory"
								class="flex items-center justify-between gap-3 rounded-lg p-2 transition-all hover:scale-[.99]"
								style="border: 1px solid var(--border)"
							>
								<div class="flex items-center gap-3">
									<AlertCircle class="h-4 w-4 flex-shrink-0" style="color: #f97316;" />
									<span class="text-sm" style="color: var(--text)">
										{outOfStockCount} account {outOfStockCount === 1 ? 'type' : 'types'} out of stock
									</span>
								</div>
								<ArrowUpRight class="h-4 w-4 flex-shrink-0" style="color: var(--text-dim);" />
							</a>
						{/if}

						{#each dashboardIssues.failedEmails as item (item.id)}
							<div class="rounded-lg p-2" style="border: 1px solid var(--border)">
								<div class="flex items-center justify-between gap-3">
									<div class="flex min-w-0 items-center gap-3">
										<Mail class="h-4 w-4 flex-shrink-0" style="color: var(--status-error);" />
										<span class="truncate text-sm" style="color: var(--text)">
											{item.email} — {item.notificationType}
										</span>
									</div>
									{#if item.failedAt}
										<span class="flex-shrink-0 text-xs" style="color: var(--text-muted)">
											{formatRelativeTime(item.failedAt)}
										</span>
									{/if}
								</div>
								{#if item.errorMessage}
									<p class="mt-1 truncate text-xs" style="color: var(--text-muted)">
										{item.errorMessage}
									</p>
								{/if}
							</div>
						{/each}
						{#if dashboardIssues.failedEmails.length > 0}
							<a
								href="/admin/broadcast"
								class="inline-block text-xs underline"
								style="color: var(--link)"
							>
								View email activity
							</a>
						{/if}

						{#each dashboardIssues.unhealthyJobs as job (job.id)}
							<div class="rounded-lg p-2" style="border: 1px solid var(--border)">
								<div class="flex items-center justify-between gap-3">
									<div class="flex min-w-0 items-center gap-3">
										<AlertTriangle
											class="h-4 w-4 flex-shrink-0"
											style="color: var(--status-warning);"
										/>
										<span class="truncate text-sm" style="color: var(--text)">
											{job.jobName} — {job.status}
										</span>
									</div>
									<span class="flex-shrink-0 text-xs" style="color: var(--text-muted)">
										{formatRelativeTime(job.startedAt)}
									</span>
								</div>
								{#if job.errorSummary}
									<p class="mt-1 truncate text-xs" style="color: var(--text-muted)">
										{job.errorSummary}
									</p>
								{/if}
							</div>
						{/each}
						{#if dashboardIssues.unhealthyJobs.length > 0}
							<a
								href="/admin/automation"
								class="inline-block text-xs underline"
								style="color: var(--link)"
							>
								View automation
							</a>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
