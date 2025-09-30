<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { showSuccess, showError, showWarning } from '$lib/stores/toasts';
	import {
		ShoppingCart,
		AlertCircle,
		CheckCircle,
		Clock,
		X,
		Eye,
		Package,
		DollarSign,
		Users,
		Search,
		Filter,
		RefreshCw,
		TrendingUp,
		Calendar,
		Mail,
		User,
		Send,
		Activity,
		FileText,
		Download,
		MoreVertical,
		Copy,
		Printer
	} from '@lucide/svelte';
	import {
		updateOrderStatus,
		processOrder,
		getOrders,
		getOrderStats,
		processOrderDelivery
	} from '$lib/services/orders';
	import type { OrderMetadata } from '$lib/services/orders';

	// Props from load function
	interface Props {
		data: {
			orders: OrderMetadata[];
			error: string | null;
		};
	}

	let { data }: Props = $props();

	let orders = $state(data.orders);
	let filterStatus = $state('all');
	let searchTerm = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');
	let isProcessing = $state(false);
	let loading = $state(false);
	let autoRefresh = $state(false);
	let refreshInterval: NodeJS.Timeout | null = null;
	let lastUpdated = $state<Date>(new Date());

	// Order statistics
	let stats = $state({
		total_orders: 0,
		pending_orders: 0,
		processing_orders: 0,
		completed_orders: 0,
		failed_orders: 0,
		todays_orders: 0,
		total_revenue: 0,
		todays_revenue: 0
	});

	// Enhanced filter orders based on status, search, and date range
	const filteredOrders = $derived(() => {
		let filtered = orders;

		// Filter by status
		if (filterStatus !== 'all') {
			filtered = filtered.filter((order) => order.status === filterStatus);
		}

		// Filter by search term (order ID, customer email, customer name)
		if (searchTerm.trim()) {
			const term = searchTerm.toLowerCase();
			filtered = filtered.filter(
				(order) =>
					order.customer_email?.toLowerCase().includes(term) ||
					order.customer_name?.toLowerCase().includes(term) ||
					order.id.toString().toLowerCase().includes(term) ||
					order.payment_id?.toLowerCase().includes(term)
			);
		}

		// Filter by date range
		if (dateFrom) {
			const fromDate = new Date(dateFrom);
			fromDate.setHours(0, 0, 0, 0);
			filtered = filtered.filter((order) => new Date(order.created_at) >= fromDate);
		}

		if (dateTo) {
			const toDate = new Date(dateTo);
			toDate.setHours(23, 59, 59, 999);
			filtered = filtered.filter((order) => new Date(order.created_at) <= toDate);
		}

		return filtered.sort(
			(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
		);
	});

	onMount(async () => {
		await loadStats();
		if (autoRefresh) {
			startAutoRefresh();
		}

		// Add click outside listener for order menus
		document.addEventListener('click', handleClickOutside);
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}

		// Remove click outside listener
		document.removeEventListener('click', handleClickOutside);
	});

	// Enhanced functions
	async function loadStats() {
		try {
			const result = await getOrderStats();
			if (result.data) {
				stats = result.data;
			}
		} catch (error) {
			console.error('Failed to load order stats:', error);
		}
	}

	async function refreshData() {
		loading = true;
		try {
			const [ordersResult, statsResult] = await Promise.all([getOrders(), getOrderStats()]);

			if (ordersResult.data) {
				orders = ordersResult.data;
			}
			if (statsResult.data) {
				stats = statsResult.data;
			}
			lastUpdated = new Date();
		} catch (error) {
			console.error('Failed to refresh data:', error);
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

	// Helper functions
	function formatRelativeTime(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
		return `${Math.floor(diffMins / 1440)}d ago`;
	}

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'completed':
				return CheckCircle;
			case 'processing':
				return Clock;
			case 'pending':
				return Package;
			case 'failed':
				return X;
			case 'cancelled':
				return X;
			default:
				return ShoppingCart;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'completed':
				return 'text-green-600 bg-green-50';
			case 'processing':
				return 'text-yellow-600 bg-yellow-50';
			case 'pending':
				return 'text-blue-600 bg-blue-50';
			case 'failed':
				return 'text-red-600 bg-red-50';
			case 'cancelled':
				return 'text-gray-600 bg-gray-50';
			default:
				return 'text-gray-600 bg-gray-50';
		}
	};

	const handleStatusChange = async (orderId: string, newStatus: string) => {
		isProcessing = true;
		try {
			const result = await updateOrderStatus(orderId, newStatus);
			if (result.error) {
				showError('Failed to update order status', result.error.message);
			} else {
				// Update local state
				orders = orders.map((order) =>
					order.id === orderId
						? {
								...order,
								status: newStatus as 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
							}
						: order
				);
				// Refresh stats after status change
				await refreshData();
			}
		} catch (error) {
			console.error('Failed to update order status:', error);
			showError('Failed to update order status', 'An unexpected error occurred.');
		} finally {
			isProcessing = false;
		}
	};

	const handleQuickStatusChange = async (orderId: string, newStatus: string) => {
		await handleStatusChange(orderId, newStatus);
	};

	// Enhanced filtering functions
	const clearFilters = () => {
		searchTerm = '';
		filterStatus = 'all';
		dateFrom = '';
		dateTo = '';
	};

	const exportOrders = () => {
		const ordersToExport = filteredOrders();
		const csvContent = [
			['Order ID', 'Customer Email', 'Status', 'Total Amount', 'Date Created'],
			...ordersToExport.map((order) => [
				order.id,
				order.customer_email || 'N/A',
				order.status,
				order.total_amount?.toString() || '0',
				new Date(order.created_at).toLocaleDateString()
			])
		]
			.map((row) => row.join(','))
			.join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	};

	// Order menu functions
	let activeOrderMenu = $state<string | null>(null);

	const toggleOrderMenu = (orderId: string) => {
		activeOrderMenu = activeOrderMenu === orderId ? null : orderId;
	};

	const duplicateOrder = async (orderId: string) => {
		console.log('Duplicating order:', orderId);
		activeOrderMenu = null;
		// TODO: Implement order duplication
		showWarning('Feature not implemented', 'Order duplication feature will be implemented soon.');
	};

	const printOrder = (orderId: string) => {
		window.open(`/admin/orders/${orderId}?print=true`, '_blank');
		activeOrderMenu = null;
	};

	const sendOrderEmail = async (orderId: string) => {
		console.log('Sending order email:', orderId);
		activeOrderMenu = null;
		// TODO: Implement email sending
		showWarning('Feature not implemented', 'Email sending feature will be implemented soon.');
	};

	const cancelOrder = async (orderId: string) => {
		if (confirm('Are you sure you want to cancel this order? This action cannot be undone.')) {
			await handleStatusChange(orderId, 'cancelled');
		}
		activeOrderMenu = null;
	};

	// Close menu when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (activeOrderMenu && !(event.target as Element).closest('.relative')) {
			activeOrderMenu = null;
		}
	}

	const handleProcessOrder = async (orderId: string) => {
		if (
			!confirm(
				'Are you sure you want to process this order? This will allocate accounts and cannot be undone.'
			)
		) {
			return;
		}

		isProcessing = true;
		try {
			const result = await processOrder(orderId);
			if (result.error) {
				showError('Failed to process order', result.error.message);
			} else {
				// Update local state
				orders = orders.map((order) =>
					order.id === orderId ? { ...order, status: 'processing' } : order
				);
				showSuccess('Order processing started', 'The order is now being processed.');
			}
		} catch (error) {
			console.error('Failed to process order:', error);
			showError('Failed to process order', 'An unexpected error occurred.');
		} finally {
			isProcessing = false;
		}
	};

	const viewOrderDetails = (order: OrderMetadata) => {
		goto(`/admin/orders/${order.id}`);
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	};

	// Calculate summary stats
	const summaryStats = $derived(() => {
		const totalOrders = orders.length;
		const pendingOrders = orders.filter((o) => o.status === 'pending').length;
		const processingOrders = orders.filter((o) => o.status === 'processing').length;
		const completedOrders = orders.filter((o) => o.status === 'completed').length;
		const totalRevenue = orders
			.filter((o) => o.status === 'completed')
			.reduce((sum, o) => sum + (o.total_amount || 0), 0);

		return {
			totalOrders,
			pendingOrders,
			processingOrders,
			completedOrders,
			totalRevenue
		};
	});
</script>

<svelte:head>
	<title>Order Management System - Admin Panel</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mx-auto max-w-7xl">
		<!-- Enhanced Header -->
		<div class="mb-8">
			<div class="mb-6 flex items-center justify-between">
				<div>
					<h1 class="text-3xl font-bold text-gray-900">Order Management System</h1>
					<p class="mt-1 text-gray-600">
						Comprehensive order processing and delivery management
						{#if !loading}
							• Last updated: {formatRelativeTime(lastUpdated)}
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-3">
					<!-- Auto-refresh toggle -->
					<button
						onclick={toggleAutoRefresh}
						class="flex items-center gap-2 rounded-lg border px-4 py-2 transition-colors {autoRefresh
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
						class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
					>
						<RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
						Refresh
					</button>
				</div>
			</div>
		</div>

		<!-- Error Display -->
		{#if data.error}
			<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
				<div class="flex items-center">
					<AlertCircle class="mr-2 h-5 w-5 text-red-600" />
					<p class="text-red-800">{data.error}</p>
				</div>
			</div>
		{/if}

		<!-- Summary Stats -->
		<div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
			<!-- Total Orders -->
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<div class="flex items-center">
					<ShoppingCart class="h-8 w-8 text-blue-600" />
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-600">Total Orders</p>
						<p class="text-2xl font-bold text-gray-900">{summaryStats().totalOrders}</p>
					</div>
				</div>
			</div>

			<!-- Pending Orders -->
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<div class="flex items-center">
					<Package class="h-8 w-8 text-blue-600" />
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-600">Pending</p>
						<p class="text-2xl font-bold text-gray-900">{summaryStats().pendingOrders}</p>
					</div>
				</div>
			</div>

			<!-- Processing Orders -->
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<div class="flex items-center">
					<Clock class="h-8 w-8 text-yellow-600" />
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-600">Processing</p>
						<p class="text-2xl font-bold text-gray-900">{summaryStats().processingOrders}</p>
					</div>
				</div>
			</div>

			<!-- Completed Orders -->
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<div class="flex items-center">
					<CheckCircle class="h-8 w-8 text-green-600" />
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-600">Completed</p>
						<p class="text-2xl font-bold text-gray-900">{summaryStats().completedOrders}</p>
					</div>
				</div>
			</div>

			<!-- Total Revenue -->
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<div class="flex items-center">
					<DollarSign class="h-8 w-8 text-green-600" />
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-600">Revenue</p>
						<p class="text-2xl font-bold text-gray-900">
							{formatCurrency(summaryStats().totalRevenue)}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Orders List -->
		<!-- Enhanced Search and Filters -->
		<div class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<h3 class="mb-4 text-lg font-semibold text-gray-900">Search & Filter Orders</h3>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
				<!-- Search -->
				<div class="lg:col-span-2">
					<label for="search-orders" class="mb-2 block text-sm font-medium text-gray-700"
						>Search Orders</label
					>
					<div class="relative">
						<Search class="absolute top-3 left-3 h-5 w-5 text-gray-400" />
						<input
							id="search-orders"
							type="text"
							placeholder="Search by order ID, customer, or email..."
							bind:value={searchTerm}
							class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:border-transparent focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>

				<!-- Status Filter -->
				<div>
					<label for="filter-status" class="mb-2 block text-sm font-medium text-gray-700"
						>Status</label
					>
					<select
						id="filter-status"
						bind:value={filterStatus}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
					>
						<option value="all">All Status</option>
						<option value="pending">Pending</option>
						<option value="processing">Processing</option>
						<option value="completed">Completed</option>
						<option value="failed">Failed</option>
						<option value="cancelled">Cancelled</option>
					</select>
				</div>

				<!-- Date Range -->
				<div>
					<label for="date-from" class="mb-2 block text-sm font-medium text-gray-700"
						>Date From</label
					>
					<input
						id="date-from"
						type="date"
						bind:value={dateFrom}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label for="date-to" class="mb-2 block text-sm font-medium text-gray-700">Date To</label>
					<input
						id="date-to"
						type="date"
						bind:value={dateTo}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			</div>

			<!-- Filter Actions -->
			<div class="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
				<div class="text-sm text-gray-600">
					Showing {filteredOrders().length} of {orders.length} orders
				</div>
				<div class="flex gap-2">
					<button
						onclick={clearFilters}
						class="px-4 py-2 text-sm text-gray-600 transition-colors hover:text-gray-800"
					>
						Clear Filters
					</button>
					<button
						onclick={exportOrders}
						class="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
					>
						<Download class="h-4 w-4" />
						Export
					</button>
				</div>
			</div>
		</div>

		<!-- Orders Table -->
		<div class="rounded-lg border border-gray-200 bg-white">
			<div class="border-b border-gray-200 px-6 py-4">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-semibold text-gray-900">
						Orders ({filteredOrders().length})
					</h2>
					<div class="text-sm text-gray-500">
						{#if loading}
							<div class="flex items-center gap-2">
								<RefreshCw class="h-4 w-4 animate-spin" />
								Loading...
							</div>
						{:else}
							Last updated: {formatRelativeTime(lastUpdated)}
						{/if}
					</div>
				</div>
			</div>

			{#if filteredOrders().length === 0}
				<div class="py-12 text-center">
					<ShoppingCart class="mx-auto mb-4 h-12 w-12 text-gray-400" />
					<h3 class="mb-2 text-lg font-medium text-gray-900">No orders found</h3>
					<p class="text-gray-500">Orders will appear here when customers make purchases.</p>
				</div>
			{:else}
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
									Items
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Total
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Status
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
							{#each filteredOrders() as order}
								{@const StatusIcon = getStatusIcon(order.status)}
								<tr class="hover:bg-gray-50">
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center">
											<StatusIcon
												class="h-4 w-4 {getStatusColor(order.status).split(' ')[0]} mr-3"
											/>
											<div>
												<div class="text-sm font-medium text-gray-900">#{order.id}</div>
												{#if order.payment_id}
													<div class="text-sm text-gray-500">Payment: {order.payment_id}</div>
												{/if}
											</div>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm text-gray-900">{order.customer_email || 'N/A'}</div>
										{#if order.customer_name}
											<div class="text-sm text-gray-500">{order.customer_name}</div>
										{/if}
									</td>
									<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
										{order.item_count || 0} items
									</td>
									<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
										{formatCurrency(order.total_amount || 0)}
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span
											class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(
												order.status
											)}"
										>
											{order.status.charAt(0).toUpperCase() + order.status.slice(1)}
										</span>
									</td>
									<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
										{new Date(order.created_at).toLocaleDateString()}
									</td>
									<td class="px-6 py-4 text-sm font-medium whitespace-nowrap">
										<div class="flex items-center gap-2">
											<!-- View Details Button -->
											<a
												href="/admin/orders/{order.id}"
												class="inline-flex items-center rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100"
												title="View Order Details"
											>
												<Eye class="mr-1 h-4 w-4" />
												View
											</a>

											<!-- Quick Actions based on Status -->
											{#if order.status === 'pending'}
												<button
													onclick={() => handleQuickStatusChange(order.id, 'processing')}
													disabled={isProcessing}
													class="inline-flex items-center rounded-lg bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-600 transition-colors hover:bg-yellow-100 disabled:opacity-50"
													title="Start Processing"
												>
													<Activity class="mr-1 h-4 w-4" />
													Process
												</button>
											{:else if order.status === 'processing'}
												<button
													onclick={() => handleQuickStatusChange(order.id, 'completed')}
													disabled={isProcessing}
													class="inline-flex items-center rounded-lg bg-green-50 px-2 py-1 text-xs font-medium text-green-600 transition-colors hover:bg-green-100 disabled:opacity-50"
													title="Mark as Completed"
												>
													<CheckCircle class="mr-1 h-4 w-4" />
													Complete
												</button>
											{/if}

											<!-- Status Dropdown for Advanced Management -->
											{#if order.status !== 'completed' && order.status !== 'cancelled'}
												<select
													value={order.status}
													onchange={(e) =>
														handleStatusChange(order.id, (e.target as HTMLSelectElement).value)}
													disabled={isProcessing}
													class="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
													title="Change Status"
												>
													<option value="pending">Pending</option>
													<option value="processing">Processing</option>
													<option value="completed">Completed</option>
													<option value="failed">Failed</option>
													<option value="cancelled">Cancelled</option>
												</select>
											{/if}

											<!-- More Actions Menu -->
											<div class="relative">
												<button
													onclick={() => toggleOrderMenu(order.id)}
													class="inline-flex items-center rounded-lg bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
													title="More Actions"
												>
													<MoreVertical class="h-4 w-4" />
												</button>

												{#if activeOrderMenu === order.id}
													<div
														class="absolute top-8 right-0 z-10 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
													>
														<button
															onclick={() => duplicateOrder(order.id)}
															class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
														>
															<Copy class="h-4 w-4" />
															Duplicate Order
														</button>
														<button
															onclick={() => printOrder(order.id)}
															class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
														>
															<Printer class="h-4 w-4" />
															Print Order
														</button>
														<button
															onclick={() => sendOrderEmail(order.id)}
															class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
														>
															<Mail class="h-4 w-4" />
															Send Email
														</button>
														{#if order.status !== 'cancelled'}
															<button
																onclick={() => cancelOrder(order.id)}
																class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50"
															>
																<X class="h-4 w-4" />
																Cancel Order
															</button>
														{/if}
													</div>
												{/if}
											</div>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</div>
