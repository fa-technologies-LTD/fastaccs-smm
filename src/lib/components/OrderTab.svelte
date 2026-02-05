<script lang="ts">
	import { CheckCircle, RefreshCw, Clock } from '@lucide/svelte';
	import { showSuccess, showError } from '$lib/stores/toasts';
	import { goto } from '$app/navigation';

	let { initialOrders } = $props();
	let orders = $state<any[]>(initialOrders);

	function reorderItems(order: any) {
		if (!order.items || order.items.length === 0) {
			showError('No items found in this order');
			return;
		}
		showSuccess('Items added to cart! Redirecting to checkout...');
		setTimeout(() => {
			goto('/platforms');
		}, 1500);
	}

	function viewOrderDetails(orderId: string) {
		goto(`/order/${orderId}`);
	}
</script>

<div
	class="rounded-[var(--r-md)] border border-[var(--border)]"
	style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
>
	<div class="border-b border-[var(--border)] p-6">
		<h2 class="text-base font-semibold" style="color: var(--text); font-family: var(--font-head);">
			Order History
		</h2>
		<p style="color: var(--text-muted);">Track your purchases and reorder items</p>
	</div>

	<div class="divide-y divide-[var(--border)]">
		{#each orders as order}
			<div class="p-6">
				<div class="mb-4 flex items-center justify-between gap-4">
					<div class="flex min-w-0 flex-1 items-center">
						{#if order.status === 'delivered' || order.status === 'completed'}
							<CheckCircle class="mr-2 h-5 w-5 flex-shrink-0" style="color: var(--primary);" />
						{:else if order.status === 'processing'}
							<RefreshCw class="mr-2 h-5 w-5 flex-shrink-0" style="color: var(--link);" />
						{:else}
							<Clock class="mr-2 h-5 w-5 flex-shrink-0" style="color: var(--status-warning);" />
						{/if}
						<div class="min-w-0 flex-1">
							<div
								class="truncate font-semibold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Order {order.id}
							</div>
							<div class="text-sm" style="color: var(--text-dim);">{order.date}</div>
						</div>
					</div>
					<div class="flex-shrink-0 text-right">
						<div class="font-semibold" style="color: var(--text); font-family: var(--font-head);">
							₦{order.totalAmount ? Number(order.totalAmount).toLocaleString() : '0'}
						</div>
						<div class="text-sm capitalize" style="color: var(--text-muted);">{order.status}</div>
					</div>
				</div>

				<div class="mb-4 space-y-2">
					{#each order.items as item}
						<div class="flex justify-between text-sm" style="color: var(--text-muted);">
							<span>{item.type}</span>
							<span style="color: var(--text-dim);">{item.details}</span>
						</div>
					{/each}
				</div>

				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="text-xs sm:text-sm" style="color: var(--text-dim);">
						Delivery: {order.deliveryMethod}
						{#if order.deliveredAt}
							• Delivered {order.deliveredAt}
						{:else if order.estimatedDelivery}
							• Est. {order.estimatedDelivery}
						{/if}
					</div>
					<div class="flex flex-col gap-2 text-sm sm:flex-row sm:text-base">
						<button
							onclick={() => reorderItems(order)}
							data-sveltekit-preload-data="hover"
							class="cursor-pointer rounded-full px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 sm:px-4 sm:text-sm"
							style="background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C;"
						>
							Order Again
						</button>
						<button
							onclick={() => viewOrderDetails(order.id)}
							data-sveltekit-preload-data="hover"
							class="cursor-pointer rounded-full px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 sm:px-4 sm:text-sm"
							style="background: linear-gradient(180deg, rgba(105,109,250,0.18), rgba(170,173,255,0.10)); border: 1px solid rgba(170,173,255,0.25); color: var(--text);"
						>
							View Details
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>
