<script lang="ts">
	import { onMount } from 'svelte';
	import { getOrders, getOrderStats } from '$lib/services/orders';
	import { formatDate, formatPrice } from '$lib/helpers/utils';

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
		const pendingStatuses = new Set(['pending', 'pending_payment']);
		const processingStatuses = new Set(['processing', 'paid']);
		const completedStatuses = new Set(['completed']);
		const revenueStatuses = new Set(['paid', 'completed']);

		const totalOrders = filteredOrders.length;
		const pendingOrders = filteredOrders.filter((o: any) => pendingStatuses.has(o.status)).length;
		const processingOrders = filteredOrders.filter((o: any) => processingStatuses.has(o.status)).length;
		const completedOrders = filteredOrders.filter((o: any) => completedStatuses.has(o.status)).length;
		const totalRevenue = filteredOrders
			.filter((o: any) => revenueStatuses.has(o.status))
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
		return String(status || '')
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	function getDisplayOrderRef(order: any): string {
		if (order.orderNumber) return order.orderNumber;
		return `ORD-${String(order.id || '').slice(0, 8).toUpperCase()}`;
	}
</script>

<div class="min-h-screen p-3 sm:p-6">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0 flex-1">
			<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text)">Order Management</h1>
			<p class="mt-1 text-sm sm:text-base" style="color: var(--text-muted)">
				Manage customer orders and processing status
			</p>
		</div>
		<div class="flex space-x-3">
			<button
				onclick={loadOrders}
				disabled={loading}
				class="w-full cursor-pointer rounded-full px-4 py-3 text-white transition-all hover:scale-95 active:scale-90 disabled:opacity-50 disabled:active:scale-100 sm:w-auto sm:py-2"
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
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
		<div
			class="rounded-lg p-4 sm:p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
				Total Orders
			</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: var(--text)">
				{summaryStats.total_orders}
			</div>
		</div>
		<div
			class="rounded-lg p-4 sm:p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">Pending</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: var(--status-warning);">
				{summaryStats.pending_orders}
			</div>
		</div>
		<div
			class="rounded-lg p-4 sm:p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">Processing</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: var(--link);">
				{summaryStats.processing_orders}
			</div>
		</div>
		<div
			class="rounded-lg p-4 sm:p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">Completed</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: var(--status-success);">
				{summaryStats.completed_orders}
			</div>
		</div>
		<div
			class="col-span-2 rounded-lg p-4 sm:col-span-1 sm:p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">Revenue</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: var(--primary);">
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
			class="w-full rounded-lg px-4 py-2 focus:ring-1 focus:outline-none"
			style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
		/>
	</div>

	<!-- Orders Table -->
	<div class="space-y-3 lg:hidden">
		{#each filteredOrders as order}
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
							{formatPrice(Number(order.totalAmount || 0))}
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
					{#each filteredOrders as order}
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
								{formatPrice(Number(order.totalAmount || 0))}
							</td>
							<td class="px-6 py-4 text-sm whitespace-nowrap" style="color: var(--text);">
								{formatDate(order.createdAt)}
							</td>
								<td class="px-6 py-4 text-sm font-medium whitespace-nowrap">
									<a
										href={`/admin/orders/${order.id}`}
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

	{#if filteredOrders.length > 0}
		<div class="mt-4 text-sm" style="color: var(--text-muted);">
			Showing {filteredOrders.length} of {orders.length} orders
		</div>
	{/if}
</div>
