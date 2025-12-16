<script lang="ts">
	import { onMount } from 'svelte';
	import { getOrders, getOrderStats } from '$lib/services/orders';

	// Props from page data
	let { data } = $props<{
		data: {
			orders: any[];
			error: string | null;
		};
	}>();

	// State
	let searchTerm = $state('');
	let loading = $state(false);
	let orders = $state(data.orders || []);
	let stats = $state({
		total_orders: 0,
		pending_orders: 0,
		processing_orders: 0,
		completed_orders: 0,
		total_revenue: 0
	});

	// Filter orders based on search
	const filteredOrders = $derived.by(() => {
		if (!orders || !Array.isArray(orders)) return [];

		if (!searchTerm) return orders;

		return orders.filter(
			(order: any) =>
				order.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
				order.guestEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
				order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
				order.affiliateCode?.toLowerCase().includes(searchTerm.toLowerCase())
		);
	});

	// Calculate summary stats from filtered orders
	const summaryStats = $derived.by(() => {
		const totalOrders = filteredOrders.length;
		const pendingOrders = filteredOrders.filter((o: any) => o.status === 'pending').length;
		const processingOrders = filteredOrders.filter((o: any) => o.status === 'processing').length;
		const completedOrders = filteredOrders.filter((o: any) => o.status === 'completed').length;
		const totalRevenue = filteredOrders
			.filter((o: any) => o.status === 'completed')
			.reduce((sum: number, o: any) => sum + Number(o.totalAmount || 0), 0);

		return {
			total_orders: totalOrders,
			pending_orders: pendingOrders,
			processing_orders: processingOrders,
			completed_orders: completedOrders,
			total_revenue: totalRevenue
		};
	});

	// Load orders data
	async function loadOrders() {
		loading = true;
		try {
			const [ordersResult, statsResult] = await Promise.all([getOrders(), getOrderStats()]);

			if (ordersResult.data) {
				orders = ordersResult.data;
			}
			if (statsResult.data) {
				stats = statsResult.data;
			}
		} catch (error) {
			console.error('Failed to load orders:', error);
		} finally {
			loading = false;
		}
	}

	// Initialize data
	onMount(() => {
		if (!data.orders || data.orders.length === 0) {
			loadOrders();
		}
	});

	// Get status color
	function getStatusColor(status: string): string {
		switch (status) {
			case 'completed':
				return 'bg-green-100 text-green-800';
			case 'processing':
				return 'bg-blue-100 text-blue-800';
			case 'pending':
				return 'bg-yellow-100 text-yellow-800';
			case 'failed':
				return 'bg-red-100 text-red-800';
			case 'cancelled':
				return 'bg-gray-100 text-gray-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	// Format currency
	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(price);
	}

	// Format date
	function formatDate(date: string | Date): string {
		if (!date) return 'N/A';
		const dateObj = typeof date === 'string' ? new Date(date) : date;
		return dateObj.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="min-h-screen bg-gray-50 p-4 sm:p-6">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0 flex-1">
			<h1 class="text-xl font-bold text-gray-900 sm:text-2xl">Order Management</h1>
			<p class="mt-1 text-sm text-gray-500 sm:text-base">
				Manage customer orders and processing status
			</p>
		</div>
		<div class="flex space-x-3">
			<button
				onclick={loadOrders}
				disabled={loading}
				class="w-full rounded-lg bg-blue-600 px-4 py-3 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
			>
				{loading ? 'Refreshing...' : 'Refresh'}
			</button>
		</div>
	</div>

	<!-- Error Display -->
	{#if data.error}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
			<p class="font-medium">Error: {data.error}</p>
		</div>
	{/if}

	<!-- Stats Cards -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
		<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
			<div class="text-xs font-medium text-gray-600 sm:text-sm">Total Orders</div>
			<div class="text-lg font-bold text-gray-900 sm:text-2xl">{summaryStats.total_orders}</div>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
			<div class="text-xs font-medium text-gray-600 sm:text-sm">Pending</div>
			<div class="text-lg font-bold text-yellow-600 sm:text-2xl">{summaryStats.pending_orders}</div>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
			<div class="text-xs font-medium text-gray-600 sm:text-sm">Processing</div>
			<div class="text-lg font-bold text-blue-600 sm:text-2xl">
				{summaryStats.processing_orders}
			</div>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
			<div class="text-xs font-medium text-gray-600 sm:text-sm">Completed</div>
			<div class="text-lg font-bold text-green-600 sm:text-2xl">
				{summaryStats.completed_orders}
			</div>
		</div>
		<div
			class="col-span-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:col-span-1 sm:p-6"
		>
			<div class="text-xs font-medium text-gray-600 sm:text-sm">Revenue</div>
			<div class="text-lg font-bold text-gray-900 sm:text-2xl">
				{formatPrice(summaryStats.total_revenue)}
			</div>
		</div>
	</div>

	<!-- Search -->
	<div class="mb-6">
		<input
			type="text"
			placeholder="Search orders by ID, email, or order number..."
			bind:value={searchTerm}
			class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
		/>
	</div>

	<!-- Orders Table -->
	<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Order
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Customer
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Affiliate
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Total
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Date
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each filteredOrders as order}
						<tr class="hover:bg-gray-50">
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm font-medium text-gray-900">#{order.id}</div>
								{#if order.orderNumber}
									<div class="text-sm text-gray-500">{order.orderNumber}</div>
								{/if}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-900">{order.guestEmail || 'N/A'}</div>
								{#if order.guestPhone}
									<div class="text-sm text-gray-500">{order.guestPhone}</div>
								{/if}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								{#if order.affiliateCode}
									<a
										href="/admin/affiliates?code={order.affiliateCode}"
										class="font-mono text-sm font-medium text-blue-600 transition-colors hover:text-blue-900"
									>
										{order.affiliateCode}
									</a>
								{:else}
									<span class="text-sm text-gray-400">—</span>
								{/if}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getStatusColor(
										order.status
									)}"
								>
									{order.status}
								</span>
							</td>
							<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
								{formatPrice(Number(order.totalAmount || 0))}
							</td>
							<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
								{formatDate(order.createdAt)}
							</td>
							<td class="px-6 py-4 text-sm font-medium whitespace-nowrap">
								<a href="/admin/orders/{order.id}" class="text-blue-600 hover:text-blue-900">
									View
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if filteredOrders.length > 0}
		<div class="mt-4 text-sm text-gray-500">
			Showing {filteredOrders.length} of {orders.length} orders
		</div>
	{/if}
</div>
