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

<div class="rounded-lg border border-gray-200 bg-white">
	<div class="border-b border-gray-200 p-6">
		<h2 class="text-xl font-semibold">Order History</h2>
		<p class="text-gray-600">Track your purchases and reorder items</p>
	</div>

	<div class="divide-y divide-gray-200">
		{#each orders as order}
			<div class="p-6">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center">
						{#if order.status === 'delivered' || order.status === 'completed'}
							<CheckCircle class="mr-2 h-5 w-5 text-green-600" />
						{:else if order.status === 'processing'}
							<RefreshCw class="mr-2 h-5 w-5 text-blue-600" />
						{:else}
							<Clock class="mr-2 h-5 w-5 text-yellow-600" />
						{/if}
						<div>
							<div class="font-semibold">Order {order.id}</div>
							<div class="text-sm text-gray-600">{order.date}</div>
						</div>
					</div>
					<div class="text-right">
						<div class="font-semibold">
							₦{order.totalAmount ? Number(order.totalAmount).toLocaleString() : '0'}
						</div>
						<div class="text-sm text-gray-600 capitalize">{order.status}</div>
					</div>
				</div>

				<div class="mb-4 space-y-2">
					{#each order.items as item}
						<div class="flex justify-between text-sm">
							<span>{item.type}</span>
							<span class="text-gray-600">{item.details}</span>
						</div>
					{/each}
				</div>

				<div class="flex items-center justify-between">
					<div class="text-sm text-gray-600">
						Delivery: {order.deliveryMethod}
						{#if order.deliveredAt}
							• Delivered {order.deliveredAt}
						{:else if order.estimatedDelivery}
							• Est. {order.estimatedDelivery}
						{/if}
					</div>
					<div class="flex gap-2">
						<button
							onclick={() => reorderItems(order)}
              data-sveltekit-preload-data="hover"
							class="cursor-pointer active:scale-95 hover:scale-101 rounded-lg border border-blue-600 px-4 py-2 text-blue-600 transition-colors hover:bg-blue-50"
						>
							Order Again
						</button>
						<button
							onclick={() => viewOrderDetails(order.id)}
              data-sveltekit-preload-data="hover"
							class="cursor-pointer active:scale-95 hover:scale-101 rounded-lg border border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-50"
						>
							View Details
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>
