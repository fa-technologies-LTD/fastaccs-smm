<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Package,
		ShoppingCart,
		Users,
		TrendingUp,
		DollarSign,
		AlertCircle,
		Clock,
		CheckCircle,
		Activity,
		RefreshCw,
		Calendar,
		BarChart3,
		Eye,
		ArrowUpRight,
		ArrowDownRight
	} from '@lucide/svelte';
	import { getOrderStats } from '$lib/services/orders';
	import { getInventoryStats } from '$lib/services/inventory';

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

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
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

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mx-auto max-w-7xl">
		<!-- Enhanced Header -->
		<div class="mb-8">
			<div class="mb-6 flex items-center justify-between">
				<h1 class="text-2xl font-bold text-gray-600">
						Overview of your FastAccs
						{#if !loading}
							• <span class='text-sm'>Last updated: {formatRelativeTime(lastUpdated)}</span>
						{/if}
				</h1>

				<div class="flex items-center gap-3">
					<!-- Auto-refresh toggle -->
					<button
						onclick={toggleAutoRefresh}
						class="cursor-pointer hover:scale-[.95] flex items-center gap-2 rounded-lg border px-4 py-2 transition-colors {autoRefresh
							? 'border-green-200 bg-green-50 text-green-700'
							: 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}"
					>
						<Activity class="h-4 w-4" />
						Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
					</button>

					<!-- Manual refresh -->
					<button
						onclick={refreshData}
						disabled={loading}
						class="cursor-pointer hover:scale-[.95] flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
					>
						<RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
						Refresh
					</button>
				</div>
			</div>
		</div>

		<!-- Error Display -->
		{#if error}
			<div class="mb-8 rounded-lg border border-red-200 bg-red-50 p-4">
				<div class="flex items-center">
					<AlertCircle class="mr-2 h-5 w-5 text-red-600" />
					<div>
						<h3 class="text-sm font-medium text-red-800">Dashboard Loading Error</h3>
						<p class="mt-1 text-sm text-red-700">{error}</p>
						<button
							onclick={refreshData}
							class="mt-2 text-sm text-red-800 underline hover:text-red-900"
						>
							Try Again
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Main Statistics Grid -->
		<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			<!-- Total Orders -->
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center">
					<div class="rounded-lg bg-blue-50 p-3">
						<ShoppingCart class="size-6 text-blue-600" />
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Total Orders</p>
						<p class="text-2xl font-bold text-gray-900">{orderStats.total_orders}</p>
						<div class="mt-1 flex items-center">
							<span class="text-sm text-gray-600">Today: {orderStats.todays_orders}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Total Revenue -->
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center">
					<div class="rounded-lg bg-green-50 p-3">
						<DollarSign class="size-6 text-green-600" />
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Total Revenue</p>
						<p class="text-2xl font-bold text-gray-900">
							{formatCurrency(orderStats.total_revenue)}
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-sm text-gray-600"
								>Today: {formatCurrency(orderStats.todays_revenue)}</span
							>
						</div>
					</div>
				</div>
			</div>

			<!-- Inventory Items -->
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center">
					<div class="rounded-lg bg-purple-50 p-3">
						<Package class="size-6 text-purple-600" />
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Total Inventory</p>
						<p class="text-2xl font-bold text-gray-900">{inventoryStats.total_available}</p>
						<div class="mt-1 flex items-center">
							<span class="text-sm text-gray-600">Reserved: {inventoryStats.total_reserved}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Low Stock Alerts -->
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center">
					<div class="rounded-lg bg-orange-50 p-3">
						<AlertCircle class="size-6 text-orange-600" />
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Stock Issues</p>
						<p class="text-2xl font-bold text-gray-900">
							{inventoryStats.low_stock + inventoryStats.out_of_stock}
						</p>
						<div class="mt-1 flex items-center">
							{#if inventoryStats.low_stock + inventoryStats.out_of_stock > 0}
								<span class="text-sm text-orange-600">
									{inventoryStats.out_of_stock} out, {inventoryStats.low_stock} low
								</span>
							{:else}
								<span class="text-sm text-green-600">All good</span>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>

	
		<!-- System Overview -->
		<div class="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
			<!-- Platform Coverage -->
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-500">Platforms</p>
						<p class="text-2xl font-bold text-gray-900">{inventoryStats.platforms}</p>
						<div class="mt-1 flex items-center">
							<span class="text-sm text-gray-600">Active platforms</span>
						</div>
					</div>
					<div class="rounded-lg bg-indigo-50 p-3">
						<BarChart3 class="size-6 text-indigo-600" />
					</div>
				</div>
			</div>

			<!-- Total Tiers -->
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-500">Product Tiers</p>
						<p class="text-2xl font-bold text-gray-900">{inventoryStats.total_tiers}</p>
						<div class="mt-1 flex items-center">
							<span class="text-sm text-gray-600">Across all platforms</span>
						</div>
					</div>
					<div class="rounded-lg bg-purple-50 p-3">
						<Package class="size-6 text-purple-600" />
					</div>
				</div>
			</div>

			<!-- Success Rate -->
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-500">Success Rate</p>
						<p class="text-2xl font-bold text-gray-900">
							{orderStats.total_orders > 0
								? ((orderStats.completed_orders / orderStats.total_orders) * 100).toFixed(1)
								: 0}%
						</p>
						<div class="mt-1 flex items-center">
							<span class="text-sm text-gray-600">
								{orderStats.completed_orders}/{orderStats.total_orders} completed
							</span>
						</div>
					</div>
					<div class="rounded-lg bg-green-50 p-3">
						<TrendingUp class="size-6 text-green-600" />
					</div>
				</div>
			</div>
		</div>

		<!-- Quick Actions & Navigation -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Management Actions -->
			<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
				<div class="border-b border-gray-200 p-6">
					<h3 class="text-lg font-semibold text-gray-900">Management Center</h3>
					<p class="mt-1 text-sm text-gray-600">Access key administrative functions</p>
				</div>
				<div class="p-6">
					<div class="grid grid-cols-1 gap-3">
						<a
							href="/admin/orders"
							class="group flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"
						>
							<div class="flex items-center">
								<ShoppingCart class="mr-3 h-5 w-5 text-gray-400 group-hover:text-blue-600" />
								<div>
									<p class="font-medium text-gray-900">Order Management</p>
									<p class="text-sm text-gray-500">Process and track orders</p>
								</div>
							</div>
							<ArrowUpRight class="h-4 w-4 text-gray-400 group-hover:text-blue-600" />
						</a>

						<a
							href="/admin/inventory"
							class="group flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"
						>
							<div class="flex items-center">
								<Package class="mr-3 h-5 w-5 text-gray-400 group-hover:text-blue-600" />
								<div>
									<p class="font-medium text-gray-900">Inventory Dashboard</p>
									<p class="text-sm text-gray-500">Monitor stock levels</p>
								</div>
							</div>
							<ArrowUpRight class="h-4 w-4 text-gray-400 group-hover:text-blue-600" />
						</a>

						<a
							href="/admin/platforms"
							class="group flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"
						>
							<div class="flex items-center">
								<Users class="mr-3 h-5 w-5 text-gray-400 group-hover:text-blue-600" />
								<div>
									<p class="font-medium text-gray-900">Platform Management</p>
									<p class="text-sm text-gray-500">Manage platforms & tiers</p>
								</div>
							</div>
							<ArrowUpRight class="h-4 w-4 text-gray-400 group-hover:text-blue-600" />
						</a>

						<a
							href="/admin/batches"
							class="group flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"
						>
							<div class="flex items-center">
								<Activity class="mr-3 h-5 w-5 text-gray-400 group-hover:text-blue-600" />
								<div>
									<p class="font-medium text-gray-900">Batch Operations</p>
									<p class="text-sm text-gray-500">Bulk import accounts</p>
								</div>
							</div>
							<ArrowUpRight class="h-4 w-4 text-gray-400 group-hover:text-blue-600" />
						</a>
					</div>
				</div>
			</div>

			<!-- System Status -->
			<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
				<div class="border-b border-gray-200 p-6">
					<h3 class="text-lg font-semibold text-gray-900">System Status</h3>
					<p class="mt-1 text-sm text-gray-600">Current system health overview</p>
				</div>
				<div class="space-y-4 p-6">
					<!-- Order Processing Status -->
					<div class="flex items-center justify-between">
						<div class="flex items-center">
							<div class="mr-3 h-3 w-3 rounded-full bg-green-500"></div>
							<span class="text-sm font-medium text-gray-900">Order Processing</span>
						</div>
						<span class="text-sm text-green-600">Operational</span>
					</div>

					<!-- Inventory System -->
					<div class="flex items-center justify-between">
						<div class="flex items-center">
							<div
								class="h-3 w-3 rounded-full {inventoryStats.low_stock +
									inventoryStats.out_of_stock >
								0
									? 'bg-yellow-500'
									: 'bg-green-500'} mr-3"
							></div>
							<span class="text-sm font-medium text-gray-900">Inventory System</span>
						</div>
						<span
							class="text-sm {inventoryStats.low_stock + inventoryStats.out_of_stock > 0
								? 'text-yellow-600'
								: 'text-green-600'}"
						>
							{inventoryStats.low_stock + inventoryStats.out_of_stock > 0
								? `${inventoryStats.low_stock + inventoryStats.out_of_stock} Issues`
								: 'Healthy'}
						</span>
					</div>

					<!-- Database Status -->
					<div class="flex items-center justify-between">
						<div class="flex items-center">
							<div class="mr-3 h-3 w-3 rounded-full bg-green-500"></div>
							<span class="text-sm font-medium text-gray-900">Database</span>
						</div>
						<span class="text-sm text-green-600">Connected</span>
					</div>

					<!-- Last Update -->
					<div class="border-t border-gray-200 pt-4">
						<div class="flex items-center justify-between text-sm">
							<span class="text-gray-500">Last system update:</span>
							<span class="text-gray-900">{formatRelativeTime(lastUpdated)}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
