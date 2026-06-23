<script lang="ts">
	import { cart } from '$lib/stores/cart.svelte';
	import { ShoppingCart, X, Trash2, ArrowRight, ShoppingBag, Loader } from '$lib/icons';
	import { goto } from '$app/navigation';
	import type { CartItem, CartItemWithTier } from '$lib/types/cart';
	import { formatPrice } from '$lib/helpers/utils';
	import { getPlatformIcon, isPlatformImageUrl } from '$lib/helpers/platformColors';

	// Reactive state
	const isOpen = $derived(cart.isOpen);
	const itemCount = $derived(cart.itemCount);
	const loading = $derived(cart.loading);
	const error = $derived(cart.error);
	const notice = $derived(cart.notice);

	let cartItems = $state<CartItemWithTier[]>([]);
	let total = $state<number>(0);
	let failedCustomIcons = $state<Record<string, boolean>>({});
	let isLoadingCartItems = $state(false);
	let lastLoadedCartKey = $state('');

	function getCartItemKey(item: Pick<CartItem, 'cartItemId' | 'tierId' | 'exactAccount'>): string {
		return (
			item.cartItemId ||
			(item.exactAccount ? `exact:${item.exactAccount.accountId}` : `tier:${item.tierId}`)
		);
	}

	function getCartSnapshotKey(items: CartItem[]): string {
		return items
			.map((item) =>
				[
					getCartItemKey(item),
					item.tierId,
					item.quantity,
					item.exactAccount?.reservedUntil || ''
				].join(':')
			)
			.join('|');
	}

	const cartSnapshotKey = $derived(getCartSnapshotKey(cart.items));

	// Load cart items when cart opens or items change
	$effect(() => {
		if (!isOpen) return;

		if (itemCount === 0) {
			cartItems = [];
			total = 0;
			lastLoadedCartKey = '';
			return;
		}

		if (isLoadingCartItems || cartSnapshotKey === lastLoadedCartKey) return;
		loadCartItems();
	});

	async function loadCartItems() {
		if (isLoadingCartItems) return;
		isLoadingCartItems = true;

		try {
			const refreshedItems = await cart.getItemsWithTiers();
			cartItems = refreshedItems;
			total = refreshedItems.reduce((sum, item) => sum + getItemPrice(item), 0);
			lastLoadedCartKey = getCartSnapshotKey(cart.items);
		} catch (error) {
			console.error('Failed to load cart items:', error);
		} finally {
			isLoadingCartItems = false;
		}
	}

	function closeCart() {
		cart.close();
	}

	function getCartLineKey(item: CartItemWithTier): string {
		return getCartItemKey(item);
	}

	function getItemPrice(item: CartItemWithTier): number {
		if (item.boosting && item.tier.boostingConfig) {
			const { stepQuantity, pricePerStep } = item.tier.boostingConfig;
			if (!stepQuantity) return 0;
			return Math.round((item.boosting.boostQuantity / stepQuantity) * pricePerStep * 100) / 100;
		}
		return item.tier.price * item.quantity;
	}

	function getItemQuantityLabel(item: CartItemWithTier): string {
		if (item.boosting) return `Qty: ${item.boosting.boostQuantity.toLocaleString()}`;
		return item.exactAccount ? 'Qty: 1 locked' : `Qty: ${item.quantity}`;
	}

	function removeItem(item: CartItemWithTier) {
		cart.removeItem(getCartLineKey(item));
	}

	function goToCheckout() {
		cart.close();
		goto('/checkout');
	}

	function continueShopping() {
		cart.close();
		goto('/platforms');
	}

	function shouldRenderPlatformImage(item: CartItemWithTier): boolean {
		return isPlatformImageUrl(item.tier.platformIcon) && !failedCustomIcons[item.tier.id];
	}

	function markPlatformImageFailed(tierId: string): void {
		failedCustomIcons = {
			...failedCustomIcons,
			[tierId]: true
		};
	}
</script>

<!-- Professional MiniCart Dropdown -->
{#if isOpen}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 z-40 transition-opacity"
		style="background: rgba(0, 0, 0, 0.6);"
		onclick={closeCart}
		aria-label="Close cart"
	></button>

	<!-- Cart Dropdown -->
	<div
		class="fixed inset-x-3 bottom-3 z-50 md:top-1/2 md:right-auto md:bottom-auto md:left-1/2 md:w-96 md:-translate-x-1/2 md:-translate-y-1/2 md:transform"
	>
		<div
			class="flex max-h-[82vh] flex-col overflow-hidden md:max-h-none"
			style="background: var(--bg-elev-2); border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow-2);"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between"
				style="background: var(--btn-primary-gradient); padding: var(--space-md) var(--space-lg); color: #04140C;"
			>
				<div class="flex items-center gap-2">
					<ShoppingBag size={20} />
					<h4 style="font-weight: 600; font-family: var(--font-head);">Shopping Cart</h4>
					{#if itemCount > 0}
						<span
							style="border-radius: var(--r-xs); background: rgba(0, 0, 0, 0.15); padding: 2px 8px; font-size: 0.75rem; font-weight: 500;"
						>
							{itemCount} item{itemCount > 1 ? 's' : ''}
						</span>
					{/if}
				</div>
				<button
					onclick={closeCart}
					style="border-radius: 50%; padding: 4px; transition: background 0.2s;"
					class="hover:bg-black/10"
					aria-label="Close cart"
				>
					<X size={18} />
				</button>
			</div>

			<!-- Cart Content -->
			<div class="max-h-[52vh] overflow-y-auto md:max-h-96">
				{#if error}
					<!-- Error State -->
					<div style="padding: var(--space-2xl) var(--space-lg); text-align: center;">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center"
							style="border-radius: 50%; background: var(--status-error-bg); border: 2px solid var(--status-error-border);"
						>
							<X size={24} style="color: var(--status-error);" />
						</div>
						<h4
							style="margin-bottom: var(--space-xs); font-weight: 500; color: var(--text); font-family: var(--font-head);"
						>
							Cart Error
						</h4>
						<p
							style="margin-bottom: var(--space-md); font-size: 0.875rem; color: var(--text-muted); font-family: var(--font-body);"
						>
							{error}
						</p>
						<div class="flex flex-col items-center gap-2">
							<button
								onclick={() => loadCartItems()}
								style="background: var(--btn-primary-gradient); border: none; border-radius: var(--r-sm); padding: var(--space-sm) var(--space-md); font-size: 0.875rem; font-weight: 600; color: #04140c; transition: opacity 0.2s;"
								class="hover:opacity-90 active:scale-95"
							>
								Retry cart
							</button>
							<button
								onclick={() => cart.clear()}
								style="background: transparent; border: none; padding: var(--space-xs) var(--space-sm); font-size: 0.75rem; font-weight: 500; color: var(--text-dim);"
								class="hover:underline"
							>
								Remove all saved items
							</button>
						</div>
					</div>
				{:else if itemCount === 0}
					<!-- Empty Cart -->
					<div style="padding: var(--space-2xl) var(--space-lg); text-align: center;">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center"
							style="border-radius: 50%; background: var(--bg-elev-1); border: 2px solid var(--border);"
						>
							<ShoppingCart size={24} style="color: var(--text-dim);" />
						</div>
						<h4
							style="margin-bottom: var(--space-xs); font-weight: 500; color: var(--text); font-family: var(--font-head);"
						>
							Your cart is empty
						</h4>
						<p
							style="margin-bottom: var(--space-md); font-size: 0.875rem; color: var(--text-muted); font-family: var(--font-body);"
						>
							Browse our accounts to get started!
						</p>
						<button
							onclick={continueShopping}
							class="btn-checkout"
							style="display: inline-flex; align-items: center; justify-content: center;"
						>
							Browse Accounts
						</button>
					</div>
				{:else}
					<!-- Loading State -->
					{#if loading}
						<div class="flex items-center justify-center" style="padding: var(--space-2xl);">
							<Loader size={24} class="animate-spin" style="color: var(--text-dim);" />
							<span
								style="margin-left: var(--space-xs); font-size: 0.875rem; color: var(--text-muted); font-family: var(--font-body);"
								>Loading cart...</span
							>
						</div>
					{:else}
						<!-- Cart Items -->
						{#if notice}
							<div
								class="mx-4 mt-4 rounded-lg px-3 py-2 text-xs leading-relaxed"
								style="background: rgba(202,219,46,0.10); border: 1px solid rgba(202,219,46,0.28); color: var(--text-muted);"
							>
								{notice}
							</div>
						{/if}
						<div style="border-top: 1px solid var(--border);">
							{#each cartItems as item (getCartLineKey(item))}
								{@const PlatformIcon = getPlatformIcon(item.tier.platformSlug)}
								{@const renderPlatformImage = shouldRenderPlatformImage(item)}
								<div
									class="flex items-center gap-3"
									style="padding: var(--space-md); border-bottom: 1px solid var(--border);"
								>
									<!-- Platform Icon with Gradient Background -->
									<div
										class="flex h-12 w-12 flex-shrink-0 items-center justify-center bg-gradient-to-br {item
											.tier.platformSlug === 'instagram' && !renderPlatformImage
											? 'from-pink-500 to-purple-600'
											: item.tier.platformSlug === 'tiktok' && !renderPlatformImage
												? 'from-black to-gray-800'
												: item.tier.platformSlug === 'facebook' && !renderPlatformImage
													? 'from-blue-600 to-blue-700'
													: (item.tier.platformSlug === 'twitter' ||
																item.tier.platformSlug === 'x') &&
														  !renderPlatformImage
														? 'from-blue-400 to-blue-500'
														: !renderPlatformImage
															? 'from-gray-500 to-gray-600'
															: ''}"
										style="border-radius: var(--r-sm); box-shadow: 0 2px 8px rgba(0,0,0,0.2);"
									>
										{#if renderPlatformImage}
											<img
												src={item.tier.platformIcon}
												alt={item.tier.platformName}
												class="h-full w-full object-contain p-2"
												style="background: rgba(255,255,255,0.06);"
												onerror={() => markPlatformImageFailed(item.tier.id)}
											/>
										{:else}
											<PlatformIcon size={24} class="text-white" />
										{/if}
									</div>

									<!-- Item Details -->
									<div class="min-w-0 flex-1">
										<h4
											class="truncate"
											style="font-size: 0.875rem; font-weight: 500; color: var(--text); font-family: var(--font-body);"
										>
											{item.tier.name}
										</h4>
										<p
											style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-body);"
										>
											{item.tier.platformName}
										</p>
										{#if item.exactAccount}
											<a
												href={item.exactAccount.profileUrl}
												target="_blank"
												rel="noopener noreferrer"
												class="mt-1 inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] font-semibold"
												style="background: rgba(5, 212, 113, 0.1); border: 1px solid rgba(5, 212, 113, 0.24); color: var(--primary);"
											>
												Exact: {item.exactAccount.displayLabel}
											</a>
										{/if}
										<p
											style="font-size: 0.875rem; color: var(--text-muted); font-family: var(--font-body);"
										>
											{getItemQuantityLabel(item)}
										</p>
									</div>

									<!-- Item Total & Remove -->
									<div class="flex flex-col items-end gap-1">
										<span
											style="font-size: 0.875rem; font-weight: 600; color: var(--text); font-family: var(--font-body);"
										>
											{formatPrice(getItemPrice(item))}
										</span>
										<button
											onclick={() => removeItem(item)}
											style="border-radius: var(--r-xs); padding: 4px; color: var(--text-dim); transition: all 0.2s;"
											class="hover:bg-red-500/10"
											aria-label="Remove item"
										>
											<Trash2 size={14} style="color: var(--status-error);" />
										</button>
									</div>
								</div>
							{/each}
						</div>

						<!-- Cart Footer -->
						<div
							style="border-top: 1px solid var(--border); background: var(--bg-elev-1); padding: var(--space-lg);"
						>
							<!-- Total -->
							<div class="mb-4 flex items-center justify-between">
								<span
									style="font-size: 1rem; font-weight: 500; color: var(--text); font-family: var(--font-body);"
									>Total:</span
								>
								<span
									style="font-size: 1.125rem; font-weight: 700; color: var(--primary); font-family: var(--font-body);"
									>{formatPrice(total)}</span
								>
							</div>

							<!-- Action Buttons -->
							<div class="space-y-2">
								<button
									onclick={goToCheckout}
									class="btn-checkout flex w-full items-center justify-center gap-2"
								>
									<span>Checkout</span>
									<ArrowRight size={16} />
								</button>
								<button
									onclick={continueShopping}
									class="btn-continue flex w-full items-center justify-center"
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

<style>
	.btn-checkout {
		background: var(--btn-primary-gradient);
		border: none;
		border-radius: 9999px;
		padding: var(--space-md) var(--space-lg);
		font-family: var(--font-body);
		font-weight: 600;
		color: #04140c;
		transition: all 0.2s ease;
	}

	.btn-checkout:hover {
		background: var(--btn-primary-gradient-hover);
		box-shadow: var(--glow-primary);
		transform: translateY(-1px);
	}

	.btn-checkout:active {
		transform: scale(0.98);
	}

	.btn-continue {
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 9999px;
		padding: var(--space-sm) var(--space-lg);
		font-family: var(--font-body);
		font-weight: 500;
		color: var(--text-muted);
		transition: all 0.2s ease;
	}

	.btn-continue:hover {
		background: var(--surface);
		border-color: var(--primary);
		color: var(--text);
	}
</style>
