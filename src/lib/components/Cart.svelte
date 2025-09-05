<script lang="ts">
	import { cart, cartState, isEmpty, itemCount } from '$lib/stores/cart.svelte';
	import { X, Plus, Minus, ShoppingBag, Trash2 } from '@lucide/svelte';
	import { goto } from '$app/navigation';

	// Create local derived values from the functions
	const currentItemCount = $derived(itemCount());

	function closeCart() {
		cart.close();
	}

	function removeItem(productId: string) {
		cart.removeItem(productId);
	}

	function updateQuantity(productId: string, quantity: number) {
		cart.updateQuantity(productId, quantity);
	}

	function proceedToCheckout() {
		cart.close();
		goto('/checkout');
	}

	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN'
		}).format(price);
	}
</script>

<!-- Cart Dropdown Overlay -->
{#if cartState.isOpen}
	<div class="fixed inset-0 z-50 overflow-hidden">
		<!-- Background overlay -->
		<div
			class="bg-opacity-50 absolute inset-0 bg-black"
			onclick={closeCart}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && closeCart()}
		></div>

		<!-- Cart Panel -->
		<div class="absolute top-0 right-0 z-10 h-full w-full max-w-md bg-white shadow-xl">
			<div class="flex h-full flex-col">
				<!-- Cart Header -->
				<div class="flex items-center justify-between border-b p-4">
					<h2 class="text-lg font-semibold">Shopping Cart ({currentItemCount})</h2>
					<button
						onclick={closeCart}
						class="text-gray-400 hover:text-gray-600"
						aria-label="Close cart"
					>
						<X size={24} />
					</button>
				</div>

				<!-- Cart Items -->
				<div class="flex-1 overflow-y-auto p-4">
					{#if cartState.items.length === 0}
						<div class="flex h-full flex-col items-center justify-center text-gray-500">
							<ShoppingBag size={48} class="mb-4" />
							<p class="text-lg font-medium">Your cart is empty</p>
							<p class="text-sm">Add some products to get started</p>
						</div>
					{:else}
						<div class="space-y-4">
							{#each cartState.items as item (item.id)}
								<div class="flex gap-3 rounded-lg border p-3">
									<!-- Product Image -->
									<div class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
										{#if item.product.thumbnail_url}
											<img
												src={item.product.thumbnail_url}
												alt={item.product.title}
												class="h-full w-full object-cover"
											/>
										{:else}
											<div class="flex h-full w-full items-center justify-center bg-gray-200">
												<ShoppingBag size={20} class="text-gray-400" />
											</div>
										{/if}
									</div>

									<!-- Product Details -->
									<div class="flex flex-1 flex-col">
										<h3 class="text-sm font-medium text-gray-900">
											{item.product.title}
										</h3>
										<p class="text-xs text-gray-500">
											{item.product.platform} • {item.product.follower_count?.toLocaleString()} followers
										</p>
										<div class="mt-1 flex items-center justify-between">
											<span class="text-sm font-semibold text-blue-600">
												{formatPrice(item.product.price)}
											</span>

											<!-- Quantity Controls -->
											<div class="flex items-center gap-2">
												<button
													onclick={() => updateQuantity(item.id, item.quantity - 1)}
													class="flex h-6 w-6 items-center justify-center rounded border hover:bg-gray-50"
													disabled={item.quantity <= 1}
												>
													<Minus size={12} />
												</button>
												<span class="text-sm font-medium">{item.quantity}</span>
												<button
													onclick={() => updateQuantity(item.id, item.quantity + 1)}
													class="flex h-6 w-6 items-center justify-center rounded border hover:bg-gray-50"
												>
													<Plus size={12} />
												</button>
											</div>
										</div>
									</div>

									<!-- Remove Button -->
									<button
										onclick={() => removeItem(item.id)}
										class="flex-shrink-0 text-red-400 hover:text-red-600"
										aria-label="Remove item"
									>
										<Trash2 size={16} />
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Cart Footer -->
				{#if cartState.items.length > 0}
					<div class="border-t p-4">
						<!-- Total -->
						<div class="mb-4 flex items-center justify-between">
							<span class="text-lg font-medium">Total:</span>
							<span class="text-xl font-bold text-blue-600">{formatPrice(cartState.total)}</span>
						</div>

						<!-- Checkout Button -->
						<button
							onclick={proceedToCheckout}
							class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700"
							disabled={cartState.loading}
						>
							{#if cartState.loading}
								Processing...
							{:else}
								Proceed to Checkout
							{/if}
						</button>

						<!-- Continue Shopping -->
						<button
							onclick={closeCart}
							class="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50"
						>
							Continue Shopping
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
