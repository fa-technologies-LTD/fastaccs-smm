<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowLeft,
		ShoppingBag,
		CreditCard,
		Mail,
		Check,
		Lock,
		Tag,
		Wallet,
		Shield,
		X,
		Minus,
		Plus
	} from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { showSuccess, showError, showWarning } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { createOrder } from '$lib/services/orders';
	import type { CartItemWithTier } from '$lib/types/cart';
	import { formatPrice } from '$lib/helpers/utils';
	import { getPlatformIcon } from '$lib/helpers/platformColors';

	let { data }: { data: PageData } = $props();

	// Reactive state
	let loading = $state(false);
	let processingPayment = $state(false);
	let currentOrderId = $state<string | null>(null);
	let affiliateCode = $state<string | null>(null);
	let affiliateDiscount = $state<number>(0);
	let validatingAffiliate = $state(false);
	let walletBalance = $state<number>(0);
	let loadingBalance = $state(true);
	let loadingCartData = $state(true);

	// Use user data directly from page data
	const user = $derived(data.user);

	// Cart items and total
	let cartItems = $state<CartItemWithTier[]>([]);
	let cartTotal = $state(0);

	// Load cart data and redirect if empty
	$effect(() => {
		loadCartData();
		loadWalletBalance();
		// Extract affiliate code from URL
		const refCode = page.url.searchParams.get('ref');
		if (refCode && !affiliateCode) {
			validateAffiliateCode(refCode);
		}
	});

	async function loadCartData() {
		loadingCartData = true;
		if (cart.itemCount === 0) {
			goto('/platforms');
			return;
		}

		try {
			cartItems = await cart.getItemsWithTiers();
			cartTotal = await cart.getTotal();
		} catch (error) {
			console.error('Failed to load cart data:', error);
		} finally {
			loadingCartData = false;
		}
	}

	async function loadWalletBalance() {
		if (!user) return;

		try {
			const response = await fetch('/api/wallet/balance');
			const data = await response.json();
			if (data.success) {
				walletBalance = data.balance || 0;
			}
		} catch (error) {
			console.error('Failed to load wallet balance:', error);
		} finally {
			loadingBalance = false;
		}
	}

	async function validateAffiliateCode(code: string) {
		validatingAffiliate = true;
		try {
			const response = await fetch(`/api/affiliate/validate?code=${encodeURIComponent(code)}`);
			const result = await response.json();

			if (result.valid) {
				affiliateCode = code.toUpperCase();
				affiliateDiscount = result.commissionRate || 10;
				showSuccess('Affiliate code applied!', `You'll receive ${affiliateDiscount}% discount`);
			} else {
				showWarning('Invalid affiliate code', 'The code you entered is not valid');
			}
		} catch (error) {
			console.error('Error validating affiliate code:', error);
		} finally {
			validatingAffiliate = false;
		}
	}

	function validateForm(): boolean {
		// Since authentication is required, just check if user exists
		return user !== null;
	}

	async function processCheckout() {
		// Check authentication first
		if (!user) {
			// Store current page for redirect after login
			const currentUrl = new URL(window.location.href);
			const returnUrl = encodeURIComponent(currentUrl.pathname + currentUrl.search);
			goto(`/auth/login?returnUrl=${returnUrl}`);
			return;
		}

		if (!validateForm()) return;

		loading = true;
		try {
			// Calculate final total with affiliate discount
			const discountAmount = affiliateCode ? (cartTotal * affiliateDiscount) / 100 : 0;
			const finalTotal = cartTotal - discountAmount;

			// Check wallet balance
			if (walletBalance < finalTotal) {
				showError(
					'Insufficient balance',
					`Your wallet balance (₦${walletBalance.toLocaleString()}) is insufficient. Please fund your wallet first.`
				);
				loading = false;
				return;
			}

			// Stock validation to prevent overselling
			for (const item of cartItems) {
				const stockResponse = await fetch(`/api/categories/${item.tierId}/stock`);
				if (stockResponse.ok) {
					const stockData = await stockResponse.json();
					if (stockData.available < item.quantity) {
						showWarning(
							'Insufficient stock',
							`Sorry, only ${stockData.available} ${item.tier.name} accounts are currently available. Please reduce your quantity.`
						);
						loading = false;
						return;
					}
				}
			}

			// Create order with wallet payment
			const orderResult = await createOrder({
				userId: user.id,
				email: user.email || '',
				phone: user.phone || '',
				items: cartItems.map((item) => ({
					categoryId: item.tierId,
					quantity: item.quantity,
					price: item.tier.price
				})),
				totalAmount: finalTotal,
				currency: 'NGN',
				paymentMethod: 'wallet',
				affiliateCode: affiliateCode || undefined
			});

			if (!orderResult.success) {
				throw new Error(orderResult.error || 'Failed to create order');
			}

			// Debit wallet
			const debitResponse = await fetch('/api/wallet/debit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					amount: finalTotal,
					orderId: orderResult.orderId
				})
			});

			const debitResult = await debitResponse.json();

			if (!debitResult.success) {
				throw new Error(debitResult.error || 'Failed to debit wallet');
			}

			// Clear cart and redirect to success
			cart.clear();
			showSuccess('Order successful!', 'Your accounts have been delivered to your dashboard');
			goto('/dashboard');
		} catch (error) {
			console.error('Checkout error:', error);
			showError(
				'Order failed',
				`Failed to process order: ${error instanceof Error ? error.message : 'Please try again.'}`
			);
		} finally {
			loading = false;
		}
	}

	function goBack() {
		history.back();
	}

	async function payWithKorapay() {
		if (!user) {
			const currentUrl = new URL(window.location.href);
			const returnUrl = encodeURIComponent(currentUrl.pathname + currentUrl.search);
			goto(`/auth/login?returnUrl=${returnUrl}`);
			return;
		}

		loading = true;
		try {
			// Calculate final total with affiliate discount
			const discountAmount = affiliateCode ? (cartTotal * affiliateDiscount) / 100 : 0;
			const finalTotal = cartTotal - discountAmount;

			// Verify stock availability for all items
			for (const item of cartItems) {
				const stockResponse = await fetch(`/api/categories/${item.tierId}/stock`);
				const stockData = await stockResponse.json();

				if (stockData.available < item.quantity) {
					showError(
						'Insufficient stock',
						`Sorry, only ${stockData.available} ${item.tier.name} accounts are currently available. Please reduce your quantity.`
					);
					loading = false;
					return;
				}
			}

			// Create order with korapay payment method
			const orderResult = await createOrder({
				userId: user.id,
				email: user.email || '',
				phone: user.phone || '',
				items: cartItems.map((item) => ({
					categoryId: item.tierId,
					quantity: item.quantity,
					price: item.tier.price
				})),
				totalAmount: finalTotal,
				currency: 'NGN',
				paymentMethod: 'korapay',
				affiliateCode: affiliateCode || undefined
			});

			if (!orderResult.success) {
				throw new Error(orderResult.error || 'Failed to create order');
			}

			// Initialize Korapay payment
			const paymentResponse = await fetch('/api/payments/initialize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orderId: orderResult.orderId
				})
			});

			const paymentResult = await paymentResponse.json();

			if (!paymentResult.success) {
				throw new Error(paymentResult.error || 'Failed to initialize payment');
			}

			// Redirect to Korapay checkout
			goto(paymentResult.authorizationUrl);
		} catch (error) {
			console.error('Payment initialization error:', error);
			showError(
				'Payment failed',
				`Failed to initialize payment: ${error instanceof Error ? error.message : 'Please try again.'}`
			);
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Checkout - FastAccs</title>
	<meta name="description" content="Complete your purchase securely on FastAccs" />
</svelte:head>

<Navigation />

<main class="min-h-screen py-4 sm:py-8" style="background: var(--bg);">
	<div class="mx-auto max-w-6xl px-4 sm:px-6">
		<!-- Header -->
		<div class="mb-6 sm:mb-8">
			<h1
				style="font-size: 1.25rem; font-weight: 700; color: var(--text); font-family: var(--font-head);"
				class="sm:text-xl"
			>
				Checkout
			</h1>
		</div>

		{#if loadingCartData}
			<!-- Loading Spinner -->
			<div
				class="rounded-lg p-12 text-center shadow-sm sm:p-16"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<div class="mx-auto mb-6 flex items-center justify-center">
					<svg
						class="animate-spin"
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<circle
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							style="opacity: 0.25; color: var(--primary);"
						/>
						<path
							d="M12 2a10 10 0 0 1 10 10"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							style="color: var(--primary);"
						/>
					</svg>
				</div>
				<h2
					class="mb-2 text-lg font-semibold sm:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Loading your cart...
				</h2>
				<p
					class="text-sm sm:text-base"
					style="color: var(--text-muted); font-family: var(--font-body);"
				>
					Please wait while we prepare your checkout
				</p>
			</div>
		{:else if cartItems.length === 0}
			<div
				class="rounded-lg p-8 text-center shadow-sm sm:p-12"
				style="background: var(--bg-elev-1); border: 1px solid var(--border);"
			>
				<ShoppingBag
					size={48}
					class="mx-auto mb-4 sm:h-16 sm:w-16"
					style="color: var(--text-dim);"
				/>
				<h2
					class="mb-2 text-lg font-semibold sm:text-xl"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Your cart is empty
				</h2>
				<p
					class="mb-6 text-sm sm:text-base"
					style="color: var(--text-muted); font-family: var(--font-body);"
				>
					Add some accounts to continue with checkout
				</p>
				<button
					onclick={() => goto('/platforms')}
					class="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-all sm:px-8 sm:py-3 sm:text-base"
					style="background: var(--btn-primary-gradient);"
				>
					Browse Accounts
				</button>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
				<!-- Order Summary -->
				<div class="order-2 lg:order-1 lg:col-span-2">
					<!-- Customer Information -->
					<div
						class="mb-6 rounded-lg p-4 shadow-sm sm:mb-8 sm:p-6"
						style="background: var(--bg-elev-1); border: 1px solid var(--border);"
					>
						<h3
							class="mb-4 text-base font-semibold sm:mb-6 sm:text-lg"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Customer Information
						</h3>
						{#if user}
							<div
								class="rounded-lg p-4"
								style="background: rgba(5,212,113,0.12); border: 1px solid rgba(5,212,113,0.3);"
							>
								<div class="flex items-center gap-3">
									<Check size={20} style="color: var(--primary);" />
									<div class="flex-1">
										<p
											class="font-medium"
											style="color: var(--text); font-family: var(--font-body);"
										>
											Logged in as {user?.fullName || user?.email}
										</p>
										<p
											class="text-sm"
											style="color: var(--text-muted); font-family: var(--font-body);"
										>
											Your order will be saved to your account
										</p>
									</div>
									{#if user?.avatarUrl}
										<img src={user.avatarUrl} alt="Profile" class="h-10 w-10 rounded-full" />
									{/if}
								</div>
							</div>
						{:else}
							<!-- Login Required -->
							<div
								class="rounded-lg p-4"
								style="background: rgba(202,219,46,0.12); border: 1px solid rgba(202,219,46,0.3);"
							>
								<div class="flex items-center gap-3">
									<Lock size={20} style="color: var(--fa-lime-700);" />
									<div class="flex-1">
										<p
											class="font-medium"
											style="color: var(--text); font-family: var(--font-head);"
										>
											Login Required
										</p>
										<p
											class="text-sm"
											style="color: var(--text-muted); font-family: var(--font-body);"
										>
											Please log in to continue with your purchase
										</p>
									</div>
								</div>
								<button
									onclick={() => {
										const currentUrl = new URL(window.location.href);
										const returnUrl = encodeURIComponent(currentUrl.pathname + currentUrl.search);
										goto(`/auth/login?returnUrl=${returnUrl}`);
									}}
									style="background: var(--fa-lime-700); color: var(--bg); font-family: var(--font-head);"
									class="mt-3 rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
								>
									Login to Continue
								</button>
							</div>
						{/if}
					</div>
				</div>

				<!-- Order Summary Sidebar -->
				<div class="order-1 lg:order-2 lg:col-span-1">
					<div
						class="rounded-lg p-6 shadow-sm sm:p-8"
						style="background: var(--bg-elev-1); border: 1px solid var(--border);"
					>
						<h3
							class="mb-6 text-base font-semibold sm:text-lg"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Order Summary
						</h3>

						<!-- Cart Items -->
						<div class="space-y-4 sm:space-y-5">
							{#each cartItems as item}
								{@const PlatformIcon = getPlatformIcon(item.tier.platformSlug)}
								<div class="flex gap-3">
									<div
										class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br sm:h-16 sm:w-16 {item
											.tier.platformSlug === 'instagram'
											? 'from-pink-500 to-purple-600'
											: item.tier.platformSlug === 'tiktok'
												? 'from-black to-gray-800'
												: item.tier.platformSlug === 'facebook'
													? 'from-blue-600 to-blue-700'
													: item.tier.platformSlug === 'twitter'
														? 'from-blue-400 to-blue-500'
														: 'from-gray-500 to-gray-600'}"
									>
										<div class="flex h-full w-full items-center justify-center">
											<PlatformIcon size={20} class="text-white sm:h-6 sm:w-6" />
										</div>
									</div>
									<div class="flex-1">
										<div class="flex items-start justify-between">
											<div class="flex-1">
												<h4
													class="line-clamp-2 text-xs font-medium sm:text-sm"
													style="color: var(--text); font-family: var(--font-head);"
												>
													{item.tier.name}
												</h4>
												<p
													class="text-xs"
													style="color: var(--text-muted); font-family: var(--font-body);"
												>
													{item.tier.platformName}
												</p>
											</div>
											<button
												onclick={async () => {
													cart.removeTier(item.tier.id);
													await loadCartData();
												}}
												style="color: var(--text-dim);"
												class="hover:text-red-600"
												title="Remove item"
											>
												<X size={16} />
											</button>
										</div>

										<!-- Quantity Controls -->
										<div class="mt-2 flex items-center gap-2">
											<div
												class="flex items-center gap-1 rounded-md"
												style="border: 1px solid var(--border);"
											>
												<button
													onclick={async () => {
														if (item.quantity > 1) {
															cart.updateQuantity(item.tier.id, item.quantity - 1);
															await loadCartData();
														}
													}}
													disabled={item.quantity <= 1}
													style="color: var(--text-muted); background: transparent;"
													class="px-2 py-1 hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
												>
													<Minus size={14} />
												</button>
												<span
													class="min-w-[2rem] text-center text-sm font-medium"
													style="color: var(--text); font-family: var(--font-body);"
												>
													{item.quantity}
												</span>
												<button
													onclick={async () => {
														cart.updateQuantity(item.tier.id, item.quantity + 1);
														await loadCartData();
													}}
													style="color: var(--text-muted); background: transparent;"
													class="px-2 py-1 hover:bg-[var(--surface)]"
												>
													<Plus size={14} />
												</button>
											</div>
											<p
												class="text-sm font-semibold"
												style="color: var(--primary); font-family: var(--font-body);"
											>
												{formatPrice(item.tier.price * item.quantity)}
											</p>
										</div>
									</div>
								</div>
							{/each}
						</div>

						<hr class="my-8" style="border-color: var(--border);" />

						<!-- Total -->
						<div class="space-y-3">
							<div class="flex justify-between text-xs sm:text-sm">
								<span style="color: var(--text-muted); font-family: var(--font-body);"
									>Subtotal</span
								>
								<span class="font-medium" style="color: var(--text); font-family: var(--font-body);"
									>{formatPrice(cartTotal)}</span
								>
							</div>
							{#if affiliateCode}
								<div
									class="flex justify-between text-xs font-semibold sm:text-sm"
									style="color: var(--primary); font-family: var(--font-body);"
								>
									<span class="flex items-center gap-1">
										<Tag size={14} />
										Affiliate Discount ({affiliateDiscount}%)
									</span>
									<span>-{formatPrice((cartTotal * affiliateDiscount) / 100)}</span>
								</div>
								<div
									class="rounded-lg p-2 text-xs"
									style="background: rgba(5,212,113,0.12); border: 1px solid rgba(5,212,113,0.3); color: var(--primary); font-family: var(--font-body);"
								>
									Referred by: <strong>{affiliateCode}</strong>
								</div>
							{/if}
							<div class="flex justify-between text-xs sm:text-sm">
								<span style="color: var(--text-muted); font-family: var(--font-body);"
									>Processing Fee</span
								>
								<span class="font-medium" style="color: var(--text); font-family: var(--font-body);"
									>Free</span
								>
							</div>
							<hr style="border-color: var(--border);" />
							<div class="flex justify-between text-base font-bold sm:text-lg">
								<span style="color: var(--text); font-family: var(--font-head);">Total</span>
								<span style="color: var(--primary); font-family: var(--font-head);">
									{formatPrice(
										affiliateCode ? cartTotal - (cartTotal * affiliateDiscount) / 100 : cartTotal
									)}
								</span>
							</div>
						</div>
						<!-- Security Banner -->
						<div
							class="mb-4 flex items-center justify-between rounded-lg p-3"
							style="background: var(--bg-elev-2); border: 1px solid var(--border-2);"
						>
							<div class="flex items-center gap-2">
								<Shield size={20} style="color: var(--fa-blue-300);" />
								<span
									class="text-sm font-medium"
									style="color: var(--text); font-family: var(--font-body);"
									>Payments secured by Korapay</span
								>
							</div>
							<a
								href="/support"
								class="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
							>
								Payment FAQ
							</a>
						</div>
						<!-- Wallet Balance -->
						<div
							class="my-6 rounded-lg p-4"
							style="background: var(--bg-elev-2); border: 1px solid var(--border-2);"
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<Wallet size={18} style="color: var(--primary);" />
									<span
										class="text-sm font-medium"
										style="color: var(--text); font-family: var(--font-body);">Wallet Balance</span
									>
								</div>
								<span
									class="text-base font-bold sm:text-lg"
									style="color: var(--primary); font-family: var(--font-head);"
								>
									{loadingBalance ? '...' : formatPrice(walletBalance)}
								</span>
							</div>
						</div>

						<!-- Payment Options -->
						<div class="space-y-3">
							<!-- Pay with Wallet -->
							<button
								onclick={processCheckout}
								disabled={loading ||
									!user ||
									loadingBalance ||
									walletBalance <
										(affiliateCode ? cartTotal - (cartTotal * affiliateDiscount) / 100 : cartTotal)}
								style="background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C; font-family: var(--font-head);"
								class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:py-4 sm:text-base"
							>
								{#if loading}
									<div
										class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent sm:h-5 sm:w-5"
									></div>
									<span class="text-sm sm:text-base">Processing...</span>
								{:else if !user}
									<Lock size={18} class="sm:h-5 sm:w-5" />
									<span class="text-sm sm:text-base">Login Required</span>
								{:else}
									<Wallet size={18} class="sm:h-5 sm:w-5" />
									<span class="text-sm sm:text-base">Pay with Wallet</span>
								{/if}
							</button>
						</div>

						<!-- Security Notice -->
						<div class="mt-6 space-y-2">
							<div
								class="rounded-lg p-3"
								style="background: rgba(5,212,113,0.12); border: 1px solid rgba(5,212,113,0.3);"
							>
								<div class="flex items-start gap-2">
									<Shield size={14} class="mt-0.5" style="color: var(--primary);" />
									<div class="text-xs" style="color: var(--text); font-family: var(--font-body);">
										<p class="font-medium">Secure Payment & Instant Delivery</p>
										<p>
											Your purchase is protected. Accounts delivered within 2 hours or full refund.
										</p>
									</div>
								</div>
							</div>
							<div
								class="flex items-center justify-center gap-2 text-xs"
								style="color: var(--text-dim); font-family: var(--font-body);"
							>
								<Lock size={12} />
								<span>256-bit SSL encryption</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</main>

<Footer />

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
