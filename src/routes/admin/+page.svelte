<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Package,
		ShoppingCart,
		Users,
		TrendingUp,
		DollarSign,
		AlertCircle
	} from '@lucide/svelte';
	import { getProductStats } from '$lib/services/products';

	// Reactive stats data
	let stats = {
		totalProducts: 0,
		availableProducts: 0,
		lowStockProducts: 0,
		soldProducts: 0,
		totalOrders: 0, // TODO: Add orders service
		totalUsers: 0, // TODO: Add users service
		revenue: 0 // TODO: Calculate from orders
	};

	let loading = true;
	let error = '';

	async function loadStats() {
		try {
			loading = true;

			// Load product statistics
			const productStatsResult = await getProductStats();
			if (productStatsResult.error) {
				throw new Error('Failed to load product statistics');
			}

			if (productStatsResult.data) {
				stats.totalProducts = productStatsResult.data.totalProducts;
				stats.availableProducts = productStatsResult.data.availableProducts;
				stats.lowStockProducts = productStatsResult.data.lowStockProducts;
				stats.soldProducts = productStatsResult.data.soldProducts;
			}

			// TODO: Load other stats (orders, users, revenue) when those services are ready
		} catch (err) {
			console.error('Error loading dashboard stats:', err);
			error = err instanceof Error ? err.message : 'Failed to load dashboard data';
		} finally {
			loading = false;
		}
	}

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN'
		}).format(amount);
	}

	onMount(() => {
		loadStats();
	});
</script>

<svelte:head>
	<title>Admin Dashboard - FastAccs</title>
</svelte:head>

<div class="space-y-4 sm:space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
		<div>
			<h1 class="text-xl font-bold text-gray-900 sm:text-2xl">Admin Dashboard</h1>
			<p class="text-sm text-gray-500 sm:text-base">Overview of your FastAccs business</p>
		</div>
		<div class="text-xs text-gray-500 sm:text-sm">
			Last updated: {new Date().toLocaleDateString()}
		</div>
	</div>

	<!-- Stats Cards -->
	{#if loading}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}
				<div class="animate-pulse rounded-lg bg-white p-6 shadow">
					<div class="flex items-center">
						<div class="h-12 w-12 rounded-full bg-gray-200 p-3"></div>
						<div class="ml-4 flex-1">
							<div class="mb-2 h-4 w-3/4 rounded bg-gray-200"></div>
							<div class="h-6 w-1/2 rounded bg-gray-200"></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if error}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4">
			<div class="flex">
				<AlertCircle class="h-5 w-5 text-red-400" />
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800">Error Loading Dashboard</h3>
					<div class="mt-2 text-sm text-red-700">{error}</div>
					<div class="mt-3">
						<button
							onclick={loadStats}
							class="rounded bg-red-100 px-2 py-1 text-sm text-red-800 hover:bg-red-200"
						>
							Retry
						</button>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			<!-- Total Products -->
			<div class="rounded-lg bg-white p-6 shadow">
				<div class="flex items-center">
					<div class="rounded-full bg-blue-100 p-3">
						<Package class="h-6 w-6 text-blue-600" />
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Total Products</p>
						<p class="text-2xl font-bold text-gray-900">{stats.totalProducts}</p>
					</div>
				</div>
			</div>

			<!-- Total Orders -->
			<div class="rounded-lg bg-white p-6 shadow">
				<div class="flex items-center">
					<div class="rounded-full bg-green-100 p-3">
						<ShoppingCart class="h-6 w-6 text-green-600" />
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Total Orders</p>
						<p class="text-2xl font-bold text-gray-900">{stats.totalOrders}</p>
					</div>
				</div>
			</div>

			<!-- Total Users -->
			<div class="rounded-lg bg-white p-6 shadow">
				<div class="flex items-center">
					<div class="rounded-full bg-purple-100 p-3">
						<Users class="h-6 w-6 text-purple-600" />
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Total Users</p>
						<p class="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
					</div>
				</div>
			</div>

			<!-- Revenue -->
			<div class="rounded-lg bg-white p-6 shadow">
				<div class="flex items-center">
					<div class="rounded-full bg-yellow-100 p-3">
						<DollarSign class="h-6 w-6 text-yellow-600" />
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Total Revenue</p>
						<p class="text-2xl font-bold text-gray-900">{formatCurrency(stats.revenue)}</p>
					</div>
				</div>
			</div>

			<!-- Low Stock Alert -->
			<div class="rounded-lg bg-white p-6 shadow">
				<div class="flex items-center">
					<div class="rounded-full bg-orange-100 p-3">
						<AlertCircle class="h-6 w-6 text-orange-600" />
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Low Stock Items</p>
						<p class="text-2xl font-bold text-gray-900">{stats.lowStockProducts}</p>
					</div>
				</div>
			</div>

			<!-- Sold Products -->
			<div class="rounded-lg bg-white p-6 shadow">
				<div class="flex items-center">
					<div class="rounded-full bg-red-100 p-3">
						<TrendingUp class="h-6 w-6 text-red-600" />
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Sold Products</p>
						<p class="text-2xl font-bold text-gray-900">{stats.soldProducts}</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
	<!-- Quick Actions -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Recent Activity -->
		<div class="rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 p-6">
				<h3 class="text-lg font-medium text-gray-900">Recent Activity</h3>
			</div>
			<div class="p-6">
				<div class="space-y-4">
					<div class="flex items-center">
						<div class="mr-3 h-2 w-2 rounded-full bg-green-500"></div>
						<span class="text-sm text-gray-600">New order #1234 received</span>
						<span class="ml-auto text-xs text-gray-400">2 hours ago</span>
					</div>
					<div class="flex items-center">
						<div class="mr-3 h-2 w-2 rounded-full bg-blue-500"></div>
						<span class="text-sm text-gray-600">Instagram account "influencer123" added</span>
						<span class="ml-auto text-xs text-gray-400">4 hours ago</span>
					</div>
					<div class="flex items-center">
						<div class="mr-3 h-2 w-2 rounded-full bg-orange-500"></div>
						<span class="text-sm text-gray-600">Low stock alert: TikTok Premium accounts</span>
						<span class="ml-auto text-xs text-gray-400">1 day ago</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Quick Actions Panel -->
		<div class="rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 p-6">
				<h3 class="text-lg font-medium text-gray-900">Quick Actions</h3>
			</div>
			<div class="p-6">
				<div class="space-y-3">
					<a
						href="/admin/inventory/new"
						class="block w-full rounded-lg bg-blue-600 px-4 py-2 text-center text-white transition-colors hover:bg-blue-700"
					>
						Add New Product
					</a>
					<a
						href="/admin/inventory"
						class="block w-full rounded-lg border border-gray-300 px-4 py-2 text-center text-gray-700 transition-colors hover:bg-gray-50"
					>
						Manage Inventory
					</a>
					<a
						href="/admin/orders"
						class="block w-full rounded-lg border border-gray-300 px-4 py-2 text-center text-gray-700 transition-colors hover:bg-gray-50"
					>
						View All Orders
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
