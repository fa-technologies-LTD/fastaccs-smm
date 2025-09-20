<script lang="ts">
	import { cart } from '$lib/stores/cart';
	import { ShoppingCart } from '@lucide/svelte';

	$: cartState = $cart;
	$: itemCount = cartState.items.reduce((total, item) => total + item.quantity, 0);

	function toggleCart() {
		cart.toggle();
	}
</script>

<button
	onclick={toggleCart}
	class="relative flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-700"
	aria-label="Open shopping cart"
>
	<ShoppingCart size={20} />

	{#if itemCount > 0}
		<!-- Cart Badge -->
		<span
			class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white"
		>
			{itemCount > 99 ? '99+' : itemCount}
		</span>

		<!-- Desktop text -->
		<span class="hidden md:block">Cart ({itemCount})</span>
	{:else}
		<span class="hidden md:block">Cart</span>
	{/if}
</button>
