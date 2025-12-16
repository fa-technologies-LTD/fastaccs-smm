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
		Wallet
	} from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { showSuccess, showError, showWarning } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { createOrder } from '$lib/services/orders';
	import type { CartItemWithTier } from '$lib/types/cart';

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
		if (cart.itemCount === 0) {
			goto('/platforms');
			return;
		}

		try {
			cartItems = await cart.getItemsWithTiers();
			cartTotal = await cart.getTotal();
		} catch (error) {
			console.error('Failed to load cart data:', error);
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

	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN'
		}).format(price);
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

<main class="min-h-screen bg-gray-50 py-4 sm:py-8">
	<div class="mx-auto max-w-4xl px-4 sm:px-6">
		<!-- Header -->
		<div class="mb-6 flex items-center gap-3 sm:mb-8 sm:gap-4">
			<button
				onclick={goBack}
				class="text-secondary hover:text-secondary-light active:text-secondary-light flex items-center gap-2"
			>
				<ArrowLeft size={18} class="sm:hidden" />
				<ArrowLeft size={20} class="hidden sm:block" />
				<span class="text-sm sm:text-base">Back</span>
			</button>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Checkout</h1>
		</div>

		{#if cartItems.length === 0}
			<div class="rounded-lg bg-white p-8 text-center shadow-sm sm:p-12">
				<ShoppingBag size={48} class="mx-auto mb-4 text-gray-300 sm:h-16 sm:w-16" />
				<h2 class="mb-2 text-lg font-semibold text-gray-900 sm:text-xl">Your cart is empty</h2>
				<p class="mb-6 text-sm text-gray-600 sm:text-base">
					Add some accounts to continue with checkout
				</p>
				<button
					onclick={() => goto('/platforms')}
					class="bg-primary hover:bg-primary-dark active:bg-primary-dark rounded-lg px-4 py-2.5 text-sm font-semibold text-white sm:px-6 sm:py-3 sm:text-base"
				>
					Browse Accounts
				</button>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
				<!-- Order Summary -->
				<div class="order-2 lg:order-1 lg:col-span-2">
					<!-- Customer Information -->
					<div class="mb-6 rounded-lg bg-white p-4 shadow-sm sm:mb-8 sm:p-6">
						<h2 class="mb-4 text-lg font-semibold sm:mb-6 sm:text-xl">Customer Information</h2>

						{#if user}
							<div class="rounded-lg bg-green-50 p-4">
								<div class="flex items-center gap-3">
									<Check size={20} class="text-green-600" />
									<div class="flex-1">
										<p class="font-medium text-green-800">
											Logged in as {user?.fullName || user?.email}
										</p>
										<p class="text-sm text-green-600">Your order will be saved to your account</p>
									</div>
									{#if user?.avatarUrl}
										<img src={user.avatarUrl} alt="Profile" class="h-10 w-10 rounded-full" />
									{/if}
								</div>
							</div>
						{:else}
							<!-- Login Required -->
							<div class="rounded-lg bg-yellow-50 p-4">
								<div class="flex items-center gap-3">
									<Lock size={20} class="text-yellow-600" />
									<div class="flex-1">
										<p class="font-medium text-yellow-800">Login Required</p>
										<p class="text-sm text-yellow-700">
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
									class="mt-3 rounded-lg bg-yellow-600 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-700"
								>
									Login to Continue
								</button>
							</div>
						{/if}
					</div>
				</div>

				<!-- Order Summary Sidebar -->
				<div class="order-1 lg:order-2 lg:col-span-1">
					<div class="rounded-lg bg-white p-4 shadow-sm sm:p-6">
						<h2 class="mb-4 text-lg font-semibold sm:mb-6 sm:text-xl">Order Summary</h2>

						<!-- Cart Items -->
						<div class="space-y-3 sm:space-y-4">
							{#each cartItems as item}
								<div class="flex gap-3">
									<div
										class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 sm:h-16 sm:w-16"
									>
										<div class="flex h-full w-full items-center justify-center">
											<ShoppingBag size={16} class="text-gray-400 sm:h-5 sm:w-5" />
										</div>
									</div>
									<div class="flex-1">
										<h3 class="line-clamp-2 text-sm font-medium text-gray-900 sm:text-base">
											{item.tier.name}
										</h3>
										<p class="text-sm text-gray-600">
											{item.tier.platformName} • Qty: {item.quantity}
										</p>

										<p class="font-semibold text-purple-600">
											{formatPrice(item.tier.price * item.quantity)}
										</p>
									</div>
								</div>
							{/each}
						</div>

						<hr class="my-6" />

						<!-- Total -->
						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<span class="text-gray-600">Subtotal</span>
								<span class="font-medium">{formatPrice(cartTotal)}</span>
							</div>
							{#if affiliateCode}
								<div class="flex justify-between text-sm font-semibold text-green-600">
									<span class="flex items-center gap-1">
										<Tag size={14} />
										Affiliate Discount ({affiliateDiscount}%)
									</span>
									<span>-{formatPrice((cartTotal * affiliateDiscount) / 100)}</span>
								</div>
								<div class="rounded-lg bg-green-50 p-2 text-xs text-green-700">
									Referred by: <strong>{affiliateCode}</strong>
								</div>
							{/if}
							<div class="flex justify-between text-sm">
								<span class="text-gray-600">Processing Fee</span>
								<span class="font-medium">Free</span>
							</div>
							<hr />
							<div class="flex justify-between text-lg font-bold">
								<span>Total</span>
								<span class="text-purple-600">
									{formatPrice(
										affiliateCode ? cartTotal - (cartTotal * affiliateDiscount) / 100 : cartTotal
									)}
								</span>
							</div>
						</div>

						<!-- Wallet Balance -->
						<div class="my-4 rounded-lg bg-blue-50 p-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<Wallet size={20} class="text-blue-600" />
									<span class="font-medium text-blue-900">Wallet Balance</span>
								</div>
								<span class="text-lg font-bold text-blue-600">
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
								class="bg-primary hover:bg-primary-dark active:bg-primary-dark flex w-full items-center justify-center gap-2 rounded-lg py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:py-4 sm:text-lg"
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

							<!-- Divider -->
							<div class="relative">
								<div class="absolute inset-0 flex items-center">
									<div class="w-full border-t border-gray-300"></div>
								</div>
								<div class="relative flex justify-center text-sm">
									<span class="bg-white px-2 text-gray-500">or</span>
								</div>
							</div>

							<!-- Pay with Card/Bank -->
							<button
								onclick={payWithKorapay}
								disabled={loading || !user}
								class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-purple-600 bg-white py-3 text-base font-semibold text-purple-600 hover:bg-purple-50 active:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 sm:py-4 sm:text-lg"
							>
								{#if !user}
									<Lock size={18} class="sm:h-5 sm:w-5" />
									<span class="text-sm sm:text-base">Login Required</span>
								{:else}
									<CreditCard size={18} class="sm:h-5 sm:w-5" />
									<span class="text-sm sm:text-base">Pay with Card/Bank</span>
								{/if}
							</button>
						</div>

						<!-- Security Notice -->
						<div class="mt-4 rounded-lg bg-green-50 p-3">
							<div class="flex items-start gap-2">
								<Lock size={16} class="mt-0.5 text-green-600" />
								<div class="text-sm text-green-800">
									<p class="font-medium">Secure Payment</p>
									<p>Instant delivery after payment confirmation</p>
								</div>
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
