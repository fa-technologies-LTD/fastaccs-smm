<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getOrders } from '$lib/services/orders';
	import OrderTypeIcon from '$lib/components/admin/OrderTypeIcon.svelte';
	import { formatDate, formatPrice } from '$lib/helpers/utils';
	import OrderStageChip from '$lib/components/OrderStageChip.svelte';
	import { ADMIN_MONEY_VISIBILITY_KEY, formatAdminMoney } from '$lib/helpers/admin-money';
	import { countAccountsSoldOnOrder, isSaleOrder, toNetSales } from '$lib/helpers/order-revenue';
	import { getOrderStage } from '$lib/helpers/order-stage';

	// Props from page data
	let { data } = $props<{
		data: {
			orders: any[];
			error: string | null;
			canViewRevenue?: boolean;
			canViewOrderAmounts?: boolean;
			adminPermissions?: string[];
		};
	}>();

	// State
	const canViewRevenue = Boolean(data.canViewRevenue);
	const canViewOrderAmounts = Boolean(data.canViewOrderAmounts);
	let hideMonetaryAmounts = $state(false);
	let searchTerm = $state('');
	// Filters follow the same order stages customers see. Cancelled and Payment failed keep the
	// dashboard's meaning (the order's own status), so the counts match the tiles above.
	type StageFilter =
		| 'all'
		| 'needs_action'
		| 'awaiting_payment'
		| 'delivered'
		| 'refunded'
		| 'cancelled'
		| 'failed'
		| 'expired';
	const STAGE_FILTERS: Array<{ value: StageFilter; label: string }> = [
		{ value: 'needs_action', label: 'Needs action' },
		{ value: 'awaiting_payment', label: 'Awaiting payment' },
		{ value: 'delivered', label: 'Delivered' },
		{ value: 'refunded', label: 'Refunded' },
		{ value: 'cancelled', label: 'Cancelled' },
		{ value: 'failed', label: 'Payment failed' },
		{ value: 'expired', label: 'Payment expired' },
		{ value: 'all', label: 'All' }
	];
	let statusFilter = $state<StageFilter>('all');
	let currentPage = $state(1);
	const itemsPerPage = 20;
	let loading = $state(false);
	let orders = $state(data.orders || []);

	// Filter orders based on search
	const searchFilteredOrders = $derived.by(() => {
		if (!orders || !Array.isArray(orders)) return [];

		if (!searchTerm) return orders;

		const term = searchTerm.trim().toLowerCase();
		return orders.filter(
			(order: any) =>
				order.id?.toLowerCase().includes(term) ||
				order.guestEmail?.toLowerCase().includes(term) ||
				order.orderNumber?.toLowerCase().includes(term) ||
				order.affiliateCode?.toLowerCase().includes(term)
		);
	});

	function stageFilterOf(order: { status?: string | null }): StageFilter {
		const status = String(order.status || '').toLowerCase();
		if (status === 'cancelled') return 'cancelled';
		if (status === 'failed') return 'failed';
		switch (getOrderStage(order).key) {
			case 'awaiting_payment':
			case 'confirming_payment':
				return 'awaiting_payment';
			case 'delivered':
			case 'part_refunded':
				return 'delivered';
			case 'refunded':
				return 'refunded';
			case 'payment_expired':
				return 'expired';
			case 'cancelled':
				return 'failed';
			default:
				return 'needs_action';
		}
	}

	// Further filter by stage
	const filteredOrders = $derived.by(() => {
		if (statusFilter === 'all') return searchFilteredOrders;
		return searchFilteredOrders.filter((order: any) => stageFilterOf(order) === statusFilter);
	});

	/** "5 × USA Facebook" for the list: what was bought, repeats of one type added together. */
	type SummaryItem = {
		boostTargetUrl?: string | null;
		productName?: string | null;
		quantity?: number;
	};
	function orderSummary(order: { orderItems?: SummaryItem[] }): string {
		const items = Array.isArray(order.orderItems) ? order.orderItems : [];
		const byType: Record<string, number> = {};
		for (const item of items) {
			if (item.boostTargetUrl) continue;
			const name = String(item.productName || 'Account').trim();
			byType[name] = (byType[name] ?? 0) + Math.max(1, Number(item.quantity) || 1);
		}
		return Object.entries(byType)
			.map(([name, quantity]) => `${quantity} × ${name}`)
			.join(', ');
	}

	// Counts for each stage filter, scoped to the current search
	const statusCounts = $derived.by(() => {
		const counts: Record<StageFilter, number> = {
			all: searchFilteredOrders.length,
			needs_action: 0,
			awaiting_payment: 0,
			delivered: 0,
			refunded: 0,
			cancelled: 0,
			failed: 0,
			expired: 0
		};
		for (const order of searchFilteredOrders) counts[stageFilterOf(order)]++;
		return counts;
	});

	// Pin unresolved manual-handover orders (paid, awaiting WhatsApp handover) to
	// the top so they aren't missed; once delivered they fall back into date order.
	// Uses the shared order stage, so refunded, unpaid and cancelled orders never pin.
	function isUnresolvedManual(order: any): boolean {
		return order?.deliveryMethod === 'whatsapp' && getOrderStage(order).key === 'preparing';
	}
	const sortedForAttention = $derived.by(() =>
		[...filteredOrders].sort(
			(a: any, b: any) => (isUnresolvedManual(a) ? 0 : 1) - (isUnresolvedManual(b) ? 0 : 1)
		)
	);
	const needsActionCount = $derived(filteredOrders.filter(isUnresolvedManual).length);

	const paginatedOrders = $derived.by(() => {
		const startIndex = (currentPage - 1) * itemsPerPage;
		return sortedForAttention.slice(startIndex, startIndex + itemsPerPage);
	});

	const totalPages = $derived(Math.ceil(filteredOrders.length / itemsPerPage));

	// Same meaning as the dashboard: the order itself was cancelled. Failed payments are separate.
	function isCancelledOrder(order: any): boolean {
		return String(order.status || '').toLowerCase() === 'cancelled';
	}

	// Calculate summary stats from filtered orders
	const summaryStats = $derived.by(() => {
		const totalOrders = filteredOrders.length;
		const paidOrders = filteredOrders.filter((o: any) =>
			isSaleOrder({
				status: o.status,
				paymentStatus: o.paymentStatus,
				deliveryStatus: o.deliveryStatus,
				paymentChannel: o.paymentChannel
			})
		);
		const cancelledOrders = filteredOrders.filter(isCancelledOrder).length;
		const totalRevenue = paidOrders.reduce(
			(sum: number, o: any) => sum + toNetSales(o.totalAmount, o.refundedAmount),
			0
		);
		const unitsSold = paidOrders.reduce(
			(sum: number, order: any) => sum + countAccountsSoldOnOrder(order),
			0
		);

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
			const ordersResult = await getOrders({ type: 'account', view: 'list' });

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

	// Aggregate revenue (summary) — FULL_ADMIN only.
	function formatAdminAmount(amount: number): string {
		return formatAdminMoney(amount, {
			canView: canViewRevenue,
			hideMonetaryAmounts,
			format: formatPrice
		});
	}

	// Per-order amount (what the buyer paid) — visible to order managers/assistant.
	function formatOrderAmount(amount: number): string {
		return formatAdminMoney(amount, {
			canView: canViewOrderAmounts,
			hideMonetaryAmounts,
			format: formatPrice
		});
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
			<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text)">Account Orders</h1>
			<p class="mt-1 text-sm sm:text-base" style="color: var(--text-muted)">
				Accounts bought on the site, newest first.
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
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">Paid Orders</div>
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
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
				Net Sales · Accounts
			</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: var(--primary);">
				{formatAdminAmount(summaryStats.total_revenue)}
			</div>
		</div>
		<div
			class="rounded-lg p-3 sm:p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
				Accounts Sold
			</div>
			<div class="text-lg font-bold sm:text-2xl" style="color: var(--text)">
				{summaryStats.units_sold}
			</div>
		</div>
	</div>

	<!-- Stage Filter -->
	<div class="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by stage">
		{#each STAGE_FILTERS as filter (filter.value)}
			<button
				type="button"
				onclick={() => (statusFilter = filter.value)}
				aria-pressed={statusFilter === filter.value}
				class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
				style={statusFilter === filter.value
					? 'background: rgba(105,109,250,0.14); color: var(--link); border: 1px solid rgba(105,109,250,0.32);'
					: 'background: var(--bg-elev-1); color: var(--text-muted); border: 1px solid var(--border);'}
			>
				{filter.label} ({statusCounts[filter.value]})
			</button>
		{/each}
	</div>

	<!-- Search -->
	<div class="mb-4">
		<input
			type="text"
			placeholder="Search by order number, email or affiliate code"
			bind:value={searchTerm}
			class="w-full rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
			style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
		/>
	</div>

	{#if needsActionCount > 0}
		<div
			class="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs sm:text-sm"
			style="background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border);"
		>
			<span class="font-semibold"
				>{needsActionCount} manual handover{needsActionCount === 1 ? '' : 's'} awaiting delivery</span
			>
			<span style="opacity: 0.85;"
				>— pinned to the top; they return to date order once delivered.</span
			>
		</div>
	{/if}

	<!-- Orders Table -->
	<div class="space-y-5 lg:hidden">
		{#each paginatedOrders as order}
			<article
				class="rounded-xl p-4"
				style={isUnresolvedManual(order)
					? 'border: 1.5px solid var(--primary); background: var(--bg-elev-1); box-shadow: 0 0 0 1px rgba(5,212,113,0.25);'
					: 'border: 1px solid color-mix(in srgb, var(--text-muted) 32%, var(--border)); background: var(--bg-elev-1);'}
			>
				<div class="mb-2 flex items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="truncate text-sm font-semibold" style="color: var(--text);">
							{getDisplayOrderRef(order)}
						</div>
						<div class="truncate text-xs" style="color: var(--text-muted);">
							{order.guestEmail || 'N/A'}
						</div>
						{#if orderSummary(order)}
							<div class="truncate text-xs" style="color: var(--text);">{orderSummary(order)}</div>
						{/if}
					</div>
					<div class="flex flex-col items-end gap-1">
						<OrderStageChip stage={getOrderStage(order)} />
						{#if isUnresolvedManual(order)}
							<span
								class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
								style="background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border);"
							>
								Needs action
							</span>
						{/if}
					</div>
				</div>

				<div class="mb-3 grid grid-cols-2 gap-2 text-xs">
					<div>
						<div style="color: var(--text-dim);">
							{Number(order.refundedAmount || 0) > 0 ? 'Net retained' : 'Total'}
						</div>
						<div class="font-semibold" style="color: var(--text);">
							{formatOrderAmount(toNetSales(order.totalAmount, order.refundedAmount))}
						</div>
						{#if Number(order.refundedAmount || 0) > 0}
							<div class="text-[10px]" style="color: var(--status-warning);">
								{formatOrderAmount(Number(order.refundedAmount || 0))} refunded
							</div>
						{/if}
					</div>
					<div>
						<div style="color: var(--text-dim);">Date</div>
						<div style="color: var(--text);">{formatDate(order.createdAt)}</div>
					</div>
				</div>

				<div class="flex items-center justify-between gap-2">
					{#if order.affiliateCode}<div class="truncate text-xs" style="color: var(--text-muted);">
							Affiliate: {order.affiliateCode}
						</div>{/if}
					<a
						href={`/admin/orders/${order.id}`}
						onclick={(event) => {
							event.preventDefault();
							goto(`/admin/orders/${order.id}`);
						}}
						class="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold"
						style="background: rgba(105,109,250,0.14); border: 1px solid rgba(170,173,255,0.25); color: var(--link);"
					>
						Open order
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
							Stage
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
							style={isUnresolvedManual(order)
								? '--hover-bg: var(--bg-elev-2); box-shadow: inset 4px 0 0 0 var(--primary);'
								: '--hover-bg: var(--bg-elev-2);'}
							onmouseenter={(e) => (e.currentTarget.style.background = 'var(--bg-elev-2)')}
							onmouseleave={(e) => (e.currentTarget.style.background = 'transparent')}
						>
							<td class="px-6 py-4 whitespace-nowrap">
								<div
									class="flex items-center gap-1.5 text-sm font-medium"
									style="color: var(--text)"
								>
									<OrderTypeIcon {order} />
									<span>{order.orderNumber || `#${String(order.id).slice(0, 8)}`}</span>
								</div>
								{#if orderSummary(order)}
									<div
										class="max-w-xs truncate text-sm"
										style="color: var(--text-muted);"
										title={orderSummary(order)}
									>
										{orderSummary(order)}
									</div>
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
								<OrderStageChip stage={getOrderStage(order)} />
								{#if isUnresolvedManual(order)}
									<span
										class="ml-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold"
										style="background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border);"
										title="Manual handover awaiting delivery — pinned to the top until resolved"
									>
										Needs action
									</span>
								{/if}
							</td>
							<td class="px-6 py-4 text-sm whitespace-nowrap" style="color: var(--text);">
								{formatOrderAmount(toNetSales(order.totalAmount, order.refundedAmount))}
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
