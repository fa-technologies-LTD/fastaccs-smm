<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Package,
		ShoppingCart,
		Users,
		TrendingUp,
		DollarSign,
		Eye,
		EyeOff,
		AlertCircle,
		Activity,
		RefreshCw,
		BarChart3,
		ArrowUpRight
	} from '@lucide/svelte';
	import { getOrderStats } from '$lib/services/orders';
	import { getInventoryStats } from '$lib/services/inventory';
	import { formatPrice } from '$lib/helpers/utils';

	// Props from load function
	interface Props {
		data: {
			orderStats: {
				total_orders: number;
				pending_orders: number;
				processing_orders: number;
				completed_orders: number;
				failed_orders: number;
				todays_orders: number;
				total_revenue: number;
				todays_revenue: number;
			};
			inventoryStats: {
				total_tiers: number;
				total_available: number;
				total_reserved: number;
				out_of_stock: number;
				low_stock: number;
				platforms: number;
				accountsInOutOfStockTiers: number;
				outOfStockTiersCount: number;
			};
			error: string | null;
		};
	}

	let { data }: Props = $props();

	let orderStats = $state(data.orderStats);
	let inventoryStats = $state(data.inventoryStats);
	let loading = $state(false);
	let error = $state(data.error);
	let autoRefresh = $state(false);
	let refreshInterval: NodeJS.Timeout | null = null;
	let lastUpdated = $state<Date>(new Date());
	let hideMonetaryAmounts = $state(false);
	const ADMIN_MONEY_VISIBILITY_KEY = 'fastaccs-admin-hide-monetary-amounts';

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
		hideMonetaryAmounts = !hideMonetaryAmounts;
		localStorage.setItem(ADMIN_MONEY_VISIBILITY_KEY, hideMonetaryAmounts ? 'true' : 'false');
	}

	function formatMonetaryAmount(amount: number): string {
		const formatted = formatPrice(amount);
		if (!hideMonetaryAmounts) {
			return formatted;
		}
		return formatted.replace(/[0-9]/g, '•');
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
		hideMonetaryAmounts = localStorage.getItem(ADMIN_MONEY_VISIBILITY_KEY) === 'true';
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

<div class="min-h-screen p-3 sm:p-6">
	<div class="mx-auto max-w-7xl">
		<!-- Enhanced Header -->
		<div class="mb-6 sm:mb-8">
			<div class="mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
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

					<div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
						<!-- Money visibility toggle -->
						<button
							onclick={toggleMonetaryVisibility}
							class="flex cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-2 text-sm transition-all hover:scale-[.95] active:scale-90 sm:px-4"
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

						<!-- Auto-refresh toggle -->
						<button
							onclick={toggleAutoRefresh}
						class="flex cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-2 text-sm transition-all hover:scale-[.95] active:scale-90 sm:px-4"
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
						class="flex cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-2 text-sm text-white transition-all hover:scale-[.95] active:scale-90 disabled:opacity-50 disabled:active:scale-100 sm:px-4"
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
		<div class=" mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
			<!-- Total Orders -->
			<div
				class="group rounded-lg p-4 sm:p-6"
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
							Total Orders
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{orderStats.total_orders}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-xs sm:text-sm" style="color: var(--text-muted)"
								>Today: {orderStats.todays_orders}</span
							>
						</div>
					</div>
				</div>
			</div>
			<!-- <AdminDashStatsCard title="Total Orders" status={orderStats.total_orders} subtitle={`Today: ${orderStats.todays_orders}`}>
				<ShoppingCart
							class="size-5 text-blue-600 transition-all group-hover:scale-80 group-hover:-rotate-20 sm:size-6"
						/>
			</AdminDashStatsCard> -->

			<!-- Total Revenue -->
			<div
				class="group rounded-lg p-4 sm:p-6"
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
								Total Revenue
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

			<!-- Inventory Items -->
			<div
				class="group rounded-lg p-4 sm:p-6"
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
							Total Inventory
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{inventoryStats.total_available}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-xs sm:text-sm" style="color: var(--text-muted)"
								>Reserved: {inventoryStats.total_reserved}</span
							>
						</div>
					</div>
				</div>
			</div>

			<!-- Stock Issues -->
			<div
				class="group rounded-lg p-4 sm:p-6"
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
							Stock Issues
						</p>
						<p class="text-xl font-bold sm:text-2xl" style="color: var(--text)">
							{inventoryStats.accountsInOutOfStockTiers || 0}
						</p>
						<div class="mt-1 flex items-center">
							{#if (inventoryStats.outOfStockTiersCount || 0) > 0}
								<span class="text-xs sm:text-sm" style="color: #f97316;">
									{inventoryStats.accountsInOutOfStockTiers || 0} accounts in {inventoryStats.outOfStockTiersCount}
									tiers
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
		</div>

		<!-- System Overview -->
		<div class="mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
			<!-- Platform Coverage -->
			<div
				class="group rounded-lg p-6"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium" style="color: var(--text-muted)">Platforms</p>
						<p class="text-2xl font-bold" style="color: var(--text)">{inventoryStats.platforms}</p>
						<div class="mt-1 flex items-center">
							<span class="text-sm" style="color: var(--text-muted)">Active platforms</span>
						</div>
					</div>
					<div class="rounded-lg p-3" style="background: rgba(99,102,241,0.12);">
						<BarChart3
							class="size-6 transition-all group-hover:scale-80 group-hover:-rotate-20"
							style="color: #6366f1;"
						/>
					</div>
				</div>
			</div>

			<!-- Total Tiers -->
			<div
				class="group rounded-lg p-6"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium" style="color: var(--text-muted)">Product Tiers</p>
						<p class="text-2xl font-bold" style="color: var(--text)">
							{inventoryStats.total_tiers}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-sm" style="color: var(--text-muted)">Across all platforms</span>
						</div>
					</div>
					<div class="rounded-lg p-3" style="background: rgba(168,85,247,0.12);">
						<Package
							class="size-6 transition-all group-hover:scale-80 group-hover:-rotate-20"
							style="color: #a855f7;"
						/>
					</div>
				</div>
			</div>

			<!-- Success Rate -->
			<div
				class="group rounded-lg p-6"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium" style="color: var(--text-muted)">Success Rate</p>
						<p class="text-2xl font-bold" style="color: var(--text)">
							{orderStats.total_orders > 0
								? ((orderStats.completed_orders / orderStats.total_orders) * 100).toFixed(1)
								: 0}%
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-sm" style="color: var(--text-muted);">
								{orderStats.completed_orders}/{orderStats.total_orders} completed
							</span>
						</div>
					</div>
					<div class="rounded-lg p-3" style="background: rgba(5,212,113,0.12);">
						<TrendingUp
							class="size-6 transition-all group-hover:scale-80 group-hover:-rotate-20"
							style="color: var(--primary);"
						/>
					</div>
				</div>
			</div>
		</div>

		<!-- Quick Actions & Navigation -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Management Actions -->
			<div class="rounded-lg" style="background: var(--bg-elev-1); border: 1px solid var(--border)">
				<div class="p-6" style="border-bottom: 1px solid var(--border)">
					<h3 class="text-lg font-semibold" style="color: var(--text)">Management Center</h3>
					<p class="mt-1 text-sm" style="color: var(--text-muted)">
						Access key administrative functions
					</p>
				</div>
				<div class="p-6">
					<div class="grid grid-cols-1 gap-3">
						<a
							href="/admin/orders"
							data-sveltekit-preload-data="hover"
							class="group flex items-center justify-between rounded-lg p-4 transition-all hover:scale-95"
							style="border: 1px solid var(--border)"
						>
							<div class="flex items-center">
								<ShoppingCart class="mr-3 h-5 w-5" style="color: var(--text-dim);" />
								<div>
									<p class="font-medium" style="color: var(--text)">Order Management</p>
									<p class="text-sm" style="color: var(--text-muted)">Process and track orders</p>
								</div>
							</div>
							<ArrowUpRight class="h-4 w-4 transition-all" style="color: var(--text-dim);" />
						</a>

						<a
							href="/admin/inventory"
							data-sveltekit-preload-data="hover"
							class="group flex items-center justify-between rounded-lg p-4 transition-all hover:scale-95"
							style="border: 1px solid var(--border)"
						>
							<div class="flex items-center">
								<Package class="mr-3 h-5 w-5" style="color: var(--text-dim);" />
								<div>
									<p class="font-medium" style="color: var(--text)">Inventory Dashboard</p>
									<p class="text-sm" style="color: var(--text-muted)">Monitor stock levels</p>
								</div>
							</div>
							<ArrowUpRight class="h-4 w-4 transition-all" style="color: var(--text-dim);" />
						</a>

						<a
							href="/admin/platforms"
							data-sveltekit-preload-data="hover"
							class="group flex items-center justify-between rounded-lg p-4 transition-all hover:scale-95"
							style="border: 1px solid var(--border)"
						>
							<div class="flex items-center">
								<Users class="mr-3 h-5 w-5" style="color: var(--text-dim);" />
								<div>
									<p class="font-medium" style="color: var(--text)">Platform Management</p>
									<p class="text-sm" style="color: var(--text-muted)">Manage platforms & tiers</p>
								</div>
							</div>
							<ArrowUpRight class="h-4 w-4 transition-all" style="color: var(--text-dim);" />
						</a>

						<a
							href="/admin/batches"
							data-sveltekit-preload-data="hover"
							class="group flex items-center justify-between rounded-lg p-4 transition-all hover:scale-95"
							style="border: 1px solid var(--border)"
						>
							<div class="flex items-center">
								<Activity class="mr-3 h-5 w-5" style="color: var(--text-dim);" />
								<div>
									<p class="font-medium" style="color: var(--text)">Batch Operations</p>
									<p class="text-sm" style="color: var(--text-muted)">Bulk import accounts</p>
								</div>
							</div>
							<ArrowUpRight class="h-4 w-4 transition-all" style="color: var(--text-dim);" />
						</a>
					</div>
				</div>
			</div>

			<!-- System Status -->
			<div class="rounded-lg" style="background: var(--bg-elev-1); border: 1px solid var(--border)">
				<div class="p-6" style="border-bottom: 1px solid var(--border)">
					<h3 class="text-lg font-semibold" style="color: var(--text)">System Status</h3>
					<p class="mt-1 text-sm" style="color: var(--text-muted)">
						Current system health overview
					</p>
				</div>
				<div class="space-y-4 p-6">
					<!-- Order Processing Status -->
					<div class="flex items-center justify-between">
						<div class="flex items-center">
							<div
								class="mr-3 h-3 w-3 rounded-full"
								style="background: var(--status-success);"
							></div>
							<span class="text-sm font-medium" style="color: var(--text)">Order Processing</span>
						</div>
						<span class="text-sm" style="color: var(--status-success);">Operational</span>
					</div>

					<!-- Inventory System -->
					<div class="flex items-center justify-between">
						<div class="flex items-center">
							<div
								class="mr-3 h-3 w-3 rounded-full"
								style="background: {inventoryStats.low_stock + inventoryStats.out_of_stock > 0
									? 'var(--status-warning)'
									: 'var(--status-success)'};"
							></div>
							<span class="text-sm font-medium" style="color: var(--text)">Inventory System</span>
						</div>
						<span
							class="text-sm"
							style="color: {inventoryStats.low_stock + inventoryStats.out_of_stock > 0
								? 'var(--status-warning)'
								: 'var(--status-success)'};"
						>
							{inventoryStats.low_stock + inventoryStats.out_of_stock > 0
								? `${inventoryStats.low_stock + inventoryStats.out_of_stock} Issues`
								: 'Healthy'}
						</span>
					</div>

					<!-- Database Status -->
					<div class="flex items-center justify-between">
						<div class="flex items-center">
							<div
								class="mr-3 h-3 w-3 rounded-full"
								style="background: var(--status-success);"
							></div>
							<span class="text-sm font-medium" style="color: var(--text)">Database</span>
						</div>
						<span class="text-sm" style="color: var(--status-success);">Connected</span>
					</div>

					<!-- Last Update -->
					<div style="border-top: 1px solid var(--border)" class="pt-4">
						<div class="flex items-center justify-between text-sm">
							<span style="color: var(--text-muted)">Last system update:</span>
							<span style="color: var(--text)">{formatRelativeTime(lastUpdated)}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
		</div>
	</div>
