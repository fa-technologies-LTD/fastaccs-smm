<script lang="ts">
	import { cart } from '$lib/stores/cart.svelte';
	import { ShoppingCart, X, Trash2, ArrowRight, ShoppingBag, Loader } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import type { CartItemWithTier } from '$lib/types/cart';

	// Reactive state
	const isOpen = $derived(cart.isOpen);
	const itemCount = $derived(cart.itemCount);
	const loading = $derived(cart.loading);
	const error = $derived(cart.error);

	let cartItems = $state<CartItemWithTier[]>([]);
	let total = $state<number>(0);

	// Load cart items when cart opens or items change
	$effect(() => {
		if (isOpen && itemCount > 0) {
			loadCartItems();
		} else if (itemCount === 0) {
			cartItems = [];
			total = 0;
		}
	});

	async function loadCartItems() {
		try {
			cartItems = await cart.getItemsWithTiers();
			total = await cart.getTotal();
		} catch (error) {
			console.error('Failed to load cart items:', error);
		}
	}

	function closeCart() {
		cart.close();
	}

	function removeItem(tierId: string) {
		cart.removeTier(tierId);
		loadCartItems(); // Refresh items
	}

	function goToCheckout() {
		cart.close();
		goto('/checkout');
	}

	function continueShopping() {
		cart.close();
		goto('/platforms');
	}

	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN',
			minimumFractionDigits: 0
		}).format(price);
	}
</script>

<!-- Professional MiniCart Dropdown -->
{#if isOpen}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 z-40 bg-black/20 transition-opacity"
		onclick={closeCart}
		aria-label="Close cart"
	></button>

	<!-- Cart Dropdown -->
	<div class="fixed top-1/2 left-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 transform sm:w-96">
		<div class="overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-black/5">
			<!-- Header -->
			<div class="bg-gradient-primary flex items-center justify-between px-4 py-3 text-white">
				<div class="flex items-center gap-2">
					<ShoppingBag size={20} />
					<h3 class="font-semibold">Shopping Cart</h3>
					{#if itemCount > 0}
						<span class="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
							{itemCount} item{itemCount > 1 ? 's' : ''}
						</span>
					{/if}
				</div>
				<button
					onclick={closeCart}
					class="rounded-full p-1 transition-colors hover:bg-white/20"
					aria-label="Close cart"
				>
					<X size={18} />
				</button>
			</div>

			<!-- Cart Content -->
			<div class="max-h-96 overflow-y-auto">
				{#if error}
					<!-- Error State -->
					<div class="px-4 py-8 text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100"
						>
							<X size={24} class="text-red-500" />
						</div>
						<h4 class="mb-2 font-medium text-gray-900">Cart Error</h4>
						<p class="mb-4 text-sm text-gray-600">{error}</p>
						<button
							onclick={() => cart.clear()}
							class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
						>
							Clear Cart
						</button>
					</div>
				{:else if itemCount === 0}
					<!-- Empty Cart -->
					<div class="px-4 py-8 text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100"
						>
							<ShoppingCart size={24} class="text-gray-400" />
						</div>
						<h4 class="mb-2 font-medium text-gray-900">Your cart is empty</h4>
						<p class="mb-4 text-sm text-gray-600">Browse our accounts to get started!</p>
						<button
							onclick={continueShopping}
							class="bg-primary hover:bg-primary-dark rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
						>
							Browse Accounts
						</button>
					</div>
				{:else}
					<!-- Loading State -->
					{#if loading}
						<div class="flex items-center justify-center py-8">
							<Loader size={24} class="animate-spin text-gray-400" />
							<span class="ml-2 text-sm text-gray-600">Loading cart...</span>
						</div>
					{:else}
						<!-- Cart Items -->
						<div class="divide-y divide-gray-100">
							{#each cartItems as item}
								<div class="flex items-center gap-3 p-4">
									<!-- Item Image/Icon Placeholder -->
									<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
										<ShoppingBag size={20} class="text-gray-500" />
									</div>

									<!-- Item Details -->
									<div class="min-w-0 flex-1">
										<h4 class="truncate text-sm font-medium text-gray-900">
											{item.tier.name}
										</h4>
										<p class="text-xs text-gray-500">{item.tier.platformName}</p>
										<p class="text-sm text-gray-600">
											Qty: {item.quantity} × {formatPrice(item.tier.price)}
										</p>
									</div>

									<!-- Item Total & Remove -->
									<div class="flex flex-col items-end gap-1">
										<span class="text-sm font-semibold text-gray-900">
											{formatPrice(item.tier.price * item.quantity)}
										</span>
										<button
											onclick={() => removeItem(item.tierId)}
											class="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
											aria-label="Remove item"
										>
											<Trash2 size={14} />
										</button>
									</div>
								</div>
							{/each}
						</div>

						<!-- Cart Footer -->
						<div class="border-t border-gray-100 bg-gray-50 p-4">
							<!-- Total -->
							<div class="mb-4 flex items-center justify-between">
								<span class="text-base font-medium text-gray-900">Total:</span>
								<span class="text-primary text-lg font-bold">{formatPrice(total)}</span>
							</div>

							<!-- Action Buttons -->
							<div class="space-y-2">
								<button
									onclick={goToCheckout}
									class="bg-primary hover:bg-primary-dark active:bg-primary-dark flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white transition-colors"
								>
									<span>Checkout</span>
									<ArrowRight size={16} />
								</button>
								<button
									onclick={continueShopping}
									class="flex w-full items-center justify-center rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
								>
									Continue Shopping
								</button>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}
