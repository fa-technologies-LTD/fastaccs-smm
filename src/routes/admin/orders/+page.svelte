<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getOrders } from '$lib/services/orders';
	import { formatDate, formatPrice } from '$lib/helpers/utils';
	import { getOrderStatusLabel, isOrderStatusInGroup } from '$lib/helpers/order-status';
	import { ADMIN_MONEY_VISIBILITY_KEY, formatAdminMoney } from '$lib/helpers/admin-money';
	import { isRevenueOrder } from '$lib/helpers/order-revenue';

	// Props from page data
	let { data } = $props<{
		data: {
			orders: any[];
			error: string | null;
			canViewRevenue?: boolean;
		};
	}>();

	// State
	const canViewRevenue = Boolean(data.canViewRevenue);
	let hideMonetaryAmounts = $state(false);
	let searchTerm = $state('');
	let statusFilter = $state<'all' | 'pending' | 'processing' | 'completed' | 'cancelled'>('all');
	let currentPage = $state(1);
	const itemsPerPage = 20;
	let loading = $state(false);
	let orders = $state(data.orders || []);

	// Filter orders based on search
	const searchFilteredOrders = $derived.by(() => {
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

	function matchesStatusFilter(order: any, filter: typeof statusFilter): boolean {
		if (filter === 'all') return true;
		if (filter === 'cancelled') return isOrderStatusInGroup(order.status, 'failed');
		return isOrderStatusInGroup(order.status, filter);
	}

	// Further filter by status tab
	const filteredOrders = $derived.by(() => {
		if (statusFilter === 'all') return searchFilteredOrders;
		return searchFilteredOrders.filter((order: any) => matchesStatusFilter(order, statusFilter));
	});

	// Counts for each status tab, scoped to the current search
	const statusCounts = $derived.by(() => {
		const counts = {
			all: searchFilteredOrders.length,
			pending: 0,
			processing: 0,
			completed: 0,
			cancelled: 0
		};
		for (const order of searchFilteredOrders) {
			if (isOrderStatusInGroup(order.status, 'pending')) counts.pending++;
			if (isOrderStatusInGroup(order.status, 'processing')) counts.processing++;
			if (isOrderStatusInGroup(order.status, 'completed')) counts.completed++;
			if (isOrderStatusInGroup(order.status, 'failed')) counts.cancelled++;
		}
		return counts;
	});

	const paginatedOrders = $derived.by(() => {
		const startIndex = (currentPage - 1) * itemsPerPage;
		return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
	});

	const totalPages = $derived(Math.ceil(filteredOrders.length / itemsPerPage));

	function isCancelledOrder(order: any): boolean {
		return (
			String(order.status || '').toLowerCase() === 'cancelled' ||
			String(order.paymentStatus || '').toLowerCase() === 'cancelled'
		);
	}

	function getOrderItems(order: any): any[] {
		if (Array.isArray(order.orderItems)) return order.orderItems;
		if (Array.isArray(order.items)) return order.items;
		return [];
	}

	function getOrderUnits(order: any): number {
		return getOrderItems(order).reduce((sum: number, item: any) => {
			const quantity = Number(item.quantity || 0);
			return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
		}, 0);
	}

	// Calculate summary stats from filtered orders
	const summaryStats = $derived.by(() => {
		const totalOrders = filteredOrders.length;
		const paidOrders = filteredOrders.filter((o: any) =>
			isRevenueOrder({
				status: o.status,
				paymentStatus: o.paymentStatus
			})
		);
		const cancelledOrders = filteredOrders.filter(isCancelledOrder).length;
		const totalRevenue = paidOrders.reduce(
			(sum: number, o: any) => sum + Number(o.totalAmount || 0),
			0
		);
		const unitsSold = paidOrders.reduce((sum: number, order: any) => sum + getOrderUnits(order), 0);

		return {
			total_orders: totalOrders,
			paid_orders: paidOrders.length,
			cancelled_orders: cancelledOrders,
			total_revenue: totalRevenue,
			units_sold: unitsSold
		};
	});

	// Load orders data
	async function loadOrders() {
		loading = true;
		try {
			const ordersResult = await getOrders();

			if (ordersResult.data) {
				orders = ordersResult.data;
			}
		} catch (error) {
			console.error('Failed to load orders:', error);
		} finally {
			loading = false;
		}
	}

	// Initialize data
	onMount(() => {
		hideMonetaryAmounts = localStorage.getItem(ADMIN_MONEY_VISIBILITY_KEY) === 'true';
		if (!data.orders || data.orders.length === 0) {
			loadOrders();
		}
	});

	$effect(() => {
		searchTerm;
		statusFilter;
		currentPage = 1;
	});

	function formatAdminAmount(amount: number): string {
		return formatAdminMoney(amount, {
			canViewRevenue,
			hideMonetaryAmounts,
			format: formatPrice
		});
	}

	// Get status color
	function getStatusStyle(status: string): string {
		switch (status) {
			case 'completed':
				return 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border)';
			case 'paid':
			case 'processing':
				return 'background: rgba(105,109,250,0.12); color: var(--link); border: 1px solid var(--link)';
			case 'pending_payment':
			case 'pending':
				return 'background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border)';
			case 'failed':
				return 'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border)';
			case 'cancelled':
				return 'background: var(--bg-elev-2); color: var(--text-muted); border: 1px solid var(--border)';
			default:
				return 'background: var(--bg-elev-2); color: var(--text-muted); border: 1px solid var(--border)';
		}
	}

	function formatStatusLabel(status: string): string {
		return getOrderStatusLabel(status);
	}

	function getDisplayOrderRef(order: any): string {
		if (order.orderNumber) return order.orderNumber;
		return `ORD-${String(order.id || '')
			.slice(0, 8)
			.toUpperCase()}`;
	}
</script>

<div class="p-2 sm:p-4">
	<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0 flex-1">
			<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text)">Order Management</h1>
			<p class="mt-1 text-sm sm:text-base" style="color: var(--text-muted)">
				Manage customer orders and processing status
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				onclick={loadOrders}
				disabled={loading}
				class="cursor-pointer rounded-full px-3 py-1.5 text-xs text-white transition-all hover:scale-[.98] active:scale-95 disabled:opacity-50 disabled:active:scale-100 sm:text-sm"
				style="background: var(--btn-primary-gradient)"
			>
				{loading ? 'Refreshing...' : 'Refresh'}
			</button>
		</div>
	</div>

	<!-- Error Display -->
	{#if data.error}
		<div
			class="mb-6 rounded-lg p-4"
			style="border: 1px solid var(--status-error-border); background: var(--status-error-bg);"
		>
			<p class="font-medium" style="color: var(--status-error);">Error: {data.error}</p>
		</div>
	{/if}

	<!-- Stats Cards -->
	<div class="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
		<div
			class="rounded-lg p-3 sm:p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
				Total Paid Orders
			</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: var(--status-success);">
				{summaryStats.paid_orders}
			</div>
		</div>
		<div
			class="rounded-lg p-3 sm:p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">Cancelled</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: rgb(248, 113, 113);">
				{summaryStats.cancelled_orders}
			</div>
		</div>
		<div
			class="rounded-lg p-3 sm:p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">Revenue</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: var(--primary);">
				{formatAdminAmount(summaryStats.total_revenue)}
			</div>
		</div>
		<div
			class="rounded-lg p-3 sm:p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
				Account Units Sold
			</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: var(--text)">
				{summaryStats.units_sold}
			</div>
		</div>
	</div>

	<!-- Status Filter -->
	<div class="mb-3 flex flex-wrap items-center gap-2">
		<button
			type="button"
			onclick={() => (statusFilter = 'pending')}
			class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
			style={statusFilter === 'pending'
				? 'background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border);'
				: 'background: var(--bg-elev-1); color: var(--text-muted); border: 1px solid var(--border);'}
		>
			Pending ({statusCounts.pending})
		</button>
		<button
			type="button"
			onclick={() => (statusFilter = 'processing')}
			class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
			style={statusFilter === 'processing'
				? 'background: rgba(105,109,250,0.12); color: var(--link); border: 1px solid var(--link);'
				: 'background: var(--bg-elev-1); color: var(--text-muted); border: 1px solid var(--border);'}
		>
			Processing ({statusCounts.processing})
		</button>
		<button
			type="button"
			onclick={() => (statusFilter = 'completed')}
			class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
			style={statusFilter === 'completed'
				? 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border);'
				: 'background: var(--bg-elev-1); color: var(--text-muted); border: 1px solid var(--border);'}
		>
			Completed ({statusCounts.completed})
		</button>
		<button
			type="button"
			onclick={() => (statusFilter = 'cancelled')}
			class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
			style={statusFilter === 'cancelled'
				? 'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border);'
				: 'background: var(--bg-elev-1); color: var(--text-muted); border: 1px solid var(--border);'}
		>
			Cancelled ({statusCounts.cancelled})
		</button>
		<button
			type="button"
			onclick={() => (statusFilter = 'all')}
			class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
			style={statusFilter === 'all'
				? 'background: rgba(105,109,250,0.14); color: var(--link); border: 1px solid rgba(105,109,250,0.32);'
				: 'background: var(--bg-elev-1); color: var(--text-muted); border: 1px solid var(--border);'}
		>
			All ({statusCounts.all})
		</button>
	</div>

	<!-- Search -->
	<div class="mb-4">
		<input
			type="text"
			placeholder="Search orders by ID, email, or order number..."
			bind:value={searchTerm}
			class="w-full rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
			style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
		/>
	</div>

	<!-- Orders Table -->
	<div class="space-y-3 lg:hidden">
		{#each paginatedOrders as order}
			<article
				class="rounded-lg p-3"
				style="border: 1px solid var(--border); background: var(--bg-elev-1);"
			>
				<div class="mb-2 flex items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="truncate text-sm font-semibold" style="color: var(--text);">
							{getDisplayOrderRef(order)}
						</div>
						<div class="truncate text-xs" style="color: var(--text-muted);">
							{order.guestEmail || 'N/A'}
						</div>
					</div>
					<span
						class="inline-flex rounded-full px-2 py-1 text-[11px] font-semibold"
						style={getStatusStyle(order.status)}
					>
						{formatStatusLabel(order.status)}
					</span>
				</div>

				<div class="mb-3 grid grid-cols-2 gap-2 text-xs">
					<div>
						<div style="color: var(--text-dim);">Total</div>
						<div class="font-semibold" style="color: var(--text);">
							{formatAdminAmount(Number(order.totalAmount || 0))}
						</div>
					</div>
					<div>
						<div style="color: var(--text-dim);">Date</div>
						<div style="color: var(--text);">{formatDate(order.createdAt)}</div>
					</div>
				</div>

				<div class="flex items-center justify-between gap-2">
					<div class="truncate text-xs" style="color: var(--text-muted);">
						{order.affiliateCode ? `Affiliate: ${order.affiliateCode}` : 'No affiliate'}
					</div>
					<a
						href={`/admin/orders/${order.id}`}
						onclick={(event) => {
							event.preventDefault();
							goto(`/admin/orders/${order.id}`);
						}}
						class="rounded-full px-3 py-1.5 text-xs font-semibold"
						style="background: rgba(105,109,250,0.14); border: 1px solid rgba(170,173,255,0.25); color: var(--link);"
					>
						View
					</a>
				</div>
			</article>
		{/each}
	</div>

	<div
		class="hidden overflow-hidden rounded-lg lg:block"
		style="border: 1px solid var(--border); background: var(--bg-elev-1);"
	>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y" style="border-color: var(--border);">
				<thead style="background: var(--bg-elev-2);">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Order
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Customer
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Affiliate
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Total
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Date
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y" style="border-color: var(--border); background: var(--bg-elev-1);">
					{#each paginatedOrders as order}
						<tr
							class="transition-colors"
							style="--hover-bg: var(--bg-elev-2);"
							onmouseenter={(e) => (e.currentTarget.style.background = 'var(--bg-elev-2)')}
							onmouseleave={(e) => (e.currentTarget.style.background = 'transparent')}
						>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm font-medium" style="color: var(--text)">#{order.id}</div>
								{#if order.orderNumber}
									<div class="text-sm" style="color: var(--text-muted);">{order.orderNumber}</div>
								{/if}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm" style="color: var(--text);">{order.guestEmail || 'N/A'}</div>
								{#if order.guestPhone}
									<div class="text-sm" style="color: var(--text-muted);">{order.guestPhone}</div>
								{/if}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								{#if order.affiliateCode}
									<a
										href={`/admin/affiliates?code=${order.affiliateCode}`}
										class="font-mono text-sm font-medium transition-colors"
										style="color: var(--link);"
									>
										{order.affiliateCode}
									</a>
								{:else}
									<span class="text-sm" style="color: var(--text-dim);">—</span>
								{/if}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex rounded-full px-2 py-1 text-xs font-semibold"
									style={getStatusStyle(order.status)}
								>
									{formatStatusLabel(order.status)}
								</span>
							</td>
							<td class="px-6 py-4 text-sm whitespace-nowrap" style="color: var(--text);">
								{formatAdminAmount(Number(order.totalAmount || 0))}
							</td>
							<td class="px-6 py-4 text-sm whitespace-nowrap" style="color: var(--text);">
								{formatDate(order.createdAt)}
							</td>
							<td class="px-6 py-4 text-sm font-medium whitespace-nowrap">
								<a
									href={`/admin/orders/${order.id}`}
									onclick={(event) => {
										event.preventDefault();
										goto(`/admin/orders/${order.id}`);
									}}
									style="color: var(--link);"
									class="transition-opacity hover:opacity-80"
								>
									View
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if totalPages > 1}
		<div class="mt-4 flex items-center justify-between gap-2">
			<div class="text-sm" style="color: var(--text-muted);">
				Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(
					currentPage * itemsPerPage,
					filteredOrders.length
				)} of {filteredOrders.length} orders
			</div>
			<div class="flex gap-2">
				<button
					onclick={() => (currentPage = Math.max(1, currentPage - 1))}
					disabled={currentPage === 1}
					class="rounded-full px-3 py-1 text-sm font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
				>
					Previous
				</button>
				<div class="flex gap-1">
					{#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
						const pageNum = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
						return pageNum;
					}) as pageNum}
						<button
							onclick={() => (currentPage = pageNum)}
							class="rounded-full px-3 py-1 text-sm font-medium transition-opacity hover:opacity-80"
							style={currentPage === pageNum
								? 'background: rgba(105,109,250,0.12); color: var(--link); border: 1px solid var(--link)'
								: 'background: var(--bg); color: var(--text); border: 1px solid var(--border)'}
						>
							{pageNum}
						</button>
					{/each}
				</div>
				<button
					onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
					disabled={currentPage === totalPages}
					class="rounded-full px-3 py-1 text-sm font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
				>
					Next
				</button>
			</div>
		</div>
	{:else if filteredOrders.length > 0}
		<div class="mt-4 text-sm" style="color: var(--text-muted);">
			Showing {filteredOrders.length} of {orders.length} orders
		</div>
	{/if}
</div>
