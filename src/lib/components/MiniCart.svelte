<script lang="ts">
	import { cart, cartState, itemCount } from '$lib/stores/cart.svelte';
	import { ShoppingCart } from '@lucide/svelte';

	// Create local derived values from the functions
	const currentItemCount = $derived(itemCount());

	function toggleCart() {
		console.log('MiniCart toggleCart clicked');
		cart.toggle();
		console.log('cart.toggle called');
	}
</script>

<button
	onclick={toggleCart}
	class="relative flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-700"
	aria-label="Open shopping cart"
>
	<ShoppingCart size={20} />

	{#if currentItemCount > 0}
		<!-- Cart Badge -->
		<span
			class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white"
		>
			{currentItemCount > 99 ? '99+' : currentItemCount}
		</span>

		<!-- Desktop text -->
		<span class="hidden md:block">Cart ({currentItemCount})</span>
	{:else}
		<span class="hidden md:block">Cart</span>
	{/if}
</button>
