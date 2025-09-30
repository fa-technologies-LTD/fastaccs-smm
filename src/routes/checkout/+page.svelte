<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		ShoppingBag,
		CreditCard,
		Phone,
		Mail,
		MessageSquare,
		Check,
		Lock
	} from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { cart } from '$lib/stores/cart';
	import { auth, setAuth } from '$lib/stores/auth';
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { createTierOrder } from '$lib/services/orders';
	import ReservationCountdown from '$lib/components/ReservationCountdown.svelte';

	let { data }: { data: PageData } = $props();

	// Reactive state
	let cartState = $state($cart);
	let authState = $state($auth);
	let loading = $state(false);

	// Initialize auth state from layout data
	onMount(() => {
		if (data.user && data.session) {
			setAuth(data.user, data.session);
		}
		authState = $auth;
	});

	// Form state
	let guestEmail = $state('');
	let guestName = $state('');
	let guestPhone = $state('');
	let deliveryMethod: 'email' | 'whatsapp' | 'telegram' = $state('email');
	let whatsappNumber = $state('');
	let telegramUsername = $state('');

	// Validation
	let errors = $state({
		email: '',
		name: '',
		phone: '',
		whatsapp: '',
		telegram: ''
	});

	// Auto-initialize auth and redirect if cart is empty
	$effect(() => {
		// Keep local state in sync with stores
		authState = $auth;
		cartState = $cart;

		// Redirect if cart is empty and not loading
		if (!authState.loading && cartState.items.length === 0) {
			goto('/platforms');
		}
	});

	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN'
		}).format(price);
	}

	function validateForm(): boolean {
		errors = { email: '', name: '', phone: '', whatsapp: '', telegram: '' };
		let isValid = true;

		if (!authState.user) {
			if (!guestEmail.trim()) {
				errors.email = 'Email is required';
				isValid = false;
			} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
				errors.email = 'Please enter a valid email';
				isValid = false;
			}

			if (!guestName.trim()) {
				errors.name = 'Full name is required';
				isValid = false;
			}

			if (!guestPhone.trim()) {
				errors.phone = 'Phone number is required';
				isValid = false;
			}
		}

		// Validate delivery method specific fields
		if (deliveryMethod === 'whatsapp' && !whatsappNumber.trim()) {
			errors.whatsapp = 'WhatsApp number is required';
			isValid = false;
		}

		if (deliveryMethod === 'telegram' && !telegramUsername.trim()) {
			errors.telegram = 'Telegram username is required';
			isValid = false;
		}

		return isValid;
	}

	async function processCheckout() {
		if (!validateForm()) return;

		loading = true;
		try {
			// Create tier-based order with account allocation
			const orderResult = await createTierOrder({
				userId: authState.user?.id,
				guestEmail: authState.user ? undefined : guestEmail,
				guestName: authState.user ? undefined : guestName,
				deliveryMethod,
				whatsappNumber: deliveryMethod === 'whatsapp' ? whatsappNumber : undefined,
				telegramUsername: deliveryMethod === 'telegram' ? telegramUsername : undefined,
				items: cartState.items,
				total: cartState.total
			});

			if (orderResult.success) {
				alert(
					'Order submitted successfully! Accounts have been allocated and you will receive them shortly.'
				);
				await cart.clear();

				// Redirect based on user status
				if (authState.user) {
					goto('/dashboard');
				} else {
					goto(`/order/${orderResult.orderId}`);
				}
			} else {
				throw new Error(orderResult.error || 'Failed to process order');
			}
		} catch (error) {
			console.error('Checkout error:', error);
			alert(
				`Failed to process order: ${error instanceof Error ? error.message : 'Please try again.'}`
			);
		} finally {
			loading = false;
		}
	}

	function goBack() {
		history.back();
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

		{#if cartState.items.length === 0}
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

						{#if authState.user}
							<div class="rounded-lg bg-green-50 p-4">
								<div class="flex items-center gap-3">
									<Check size={20} class="text-green-600" />
									<div class="flex-1">
										<p class="font-medium text-green-800">
											Logged in as {authState.user?.user_metadata?.full_name ||
												authState.user?.email}
										</p>
										<p class="text-sm text-green-600">Your order will be saved to your account</p>
									</div>
									{#if authState.user?.user_metadata?.avatar_url}
										<img
											src={authState.user.user_metadata.avatar_url}
											alt="Profile"
											class="h-10 w-10 rounded-full"
										/>
									{/if}
								</div>
							</div>
						{:else}
							<!-- Guest Form -->
							<div class="space-y-4">
								<div>
									<label for="guest-email" class="mb-2 block text-sm font-medium text-gray-700">
										Email Address *
									</label>
									<input
										id="guest-email"
										type="email"
										bind:value={guestEmail}
										class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
										placeholder="Enter your email"
									/>
									{#if errors.email}
										<p class="mt-1 text-sm text-red-600">{errors.email}</p>
									{/if}
								</div>

								<div>
									<label for="guest-name" class="mb-2 block text-sm font-medium text-gray-700">
										Full Name *
									</label>
									<input
										id="guest-name"
										type="text"
										bind:value={guestName}
										class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
										placeholder="Enter your full name"
									/>
									{#if errors.name}
										<p class="mt-1 text-sm text-red-600">{errors.name}</p>
									{/if}
								</div>

								<div>
									<label for="guest-phone" class="mb-2 block text-sm font-medium text-gray-700">
										Phone Number *
									</label>
									<input
										id="guest-phone"
										type="tel"
										bind:value={guestPhone}
										class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
										placeholder="+234 xxx xxx xxxx"
									/>
									{#if errors.phone}
										<p class="mt-1 text-sm text-red-600">{errors.phone}</p>
									{/if}
								</div>
							</div>
						{/if}
					</div>

					<!-- Delivery Method -->
					<div class="mb-8 rounded-lg bg-white p-6 shadow-sm">
						<h2 class="mb-6 text-xl font-semibold">Delivery Method</h2>

						<div class="space-y-3">
							<label
								class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:bg-gray-50 {deliveryMethod ===
								'email'
									? 'border-purple-500 bg-purple-50'
									: ''}"
							>
								<input
									type="radio"
									bind:group={deliveryMethod}
									value="email"
									class="text-purple-600"
								/>
								<Mail size={20} class="text-purple-600" />
								<div>
									<div class="font-medium">Email</div>
									<div class="text-sm text-gray-600">Receive account details via email</div>
								</div>
							</label>

							<label
								class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:bg-gray-50 {deliveryMethod ===
								'whatsapp'
									? 'border-purple-500 bg-purple-50'
									: ''}"
							>
								<input
									type="radio"
									bind:group={deliveryMethod}
									value="whatsapp"
									class="text-purple-600"
								/>
								<Phone size={20} class="text-green-600" />
								<div>
									<div class="font-medium">WhatsApp</div>
									<div class="text-sm text-gray-600">Get instant delivery via WhatsApp</div>
								</div>
							</label>

							<label
								class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:bg-gray-50 {deliveryMethod ===
								'telegram'
									? 'border-purple-500 bg-purple-50'
									: ''}"
							>
								<input
									type="radio"
									bind:group={deliveryMethod}
									value="telegram"
									class="text-purple-600"
								/>
								<MessageSquare size={20} class="text-blue-600" />
								<div>
									<div class="font-medium">Telegram</div>
									<div class="text-sm text-gray-600">Secure delivery via Telegram</div>
								</div>
							</label>
						</div>

						<!-- Additional fields based on delivery method -->
						{#if deliveryMethod === 'whatsapp'}
							<div class="mt-4">
								<label for="whatsapp-number" class="mb-2 block text-sm font-medium text-gray-700">
									WhatsApp Number *
								</label>
								<input
									id="whatsapp-number"
									type="tel"
									bind:value={whatsappNumber}
									class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
									placeholder="+234 xxx xxx xxxx"
								/>
								{#if errors.whatsapp}
									<p class="mt-1 text-sm text-red-600">{errors.whatsapp}</p>
								{/if}
							</div>
						{/if}

						{#if deliveryMethod === 'telegram'}
							<div class="mt-4">
								<label for="telegram-username" class="mb-2 block text-sm font-medium text-gray-700">
									Telegram Username *
								</label>
								<input
									id="telegram-username"
									type="text"
									bind:value={telegramUsername}
									class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
									placeholder="@username"
								/>
								{#if errors.telegram}
									<p class="mt-1 text-sm text-red-600">{errors.telegram}</p>
								{/if}
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
							{#each cartState.items as item}
								<div class="flex gap-3">
									<div
										class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-16 sm:w-16"
									>
										{#if item.product.thumbnail_url}
											<img
												src={item.product.thumbnail_url}
												alt={item.product.title}
												class="h-full w-full object-cover"
											/>
										{:else}
											<div class="flex h-full w-full items-center justify-center">
												<ShoppingBag size={16} class="text-gray-400 sm:h-5 sm:w-5" />
											</div>
										{/if}
									</div>
									<div class="flex-1">
										<h3 class="line-clamp-2 text-sm font-medium text-gray-900 sm:text-base">
											{item.product.title}
										</h3>
										<p class="text-sm text-gray-600">
											{item.product.platform} • Qty: {item.quantity}
										</p>

										<!-- Reservation Countdown -->
										{#if item.reservationExpiry}
											<div class="mt-1">
												<ReservationCountdown
													expiresAt={item.reservationExpiry}
													onExpired={() => cart.cleanupExpired()}
												/>
											</div>
										{/if}

										<p class="font-semibold text-purple-600">
											{formatPrice(item.product.price * item.quantity)}
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
								<span class="font-medium">{formatPrice(cartState.total)}</span>
							</div>
							<div class="flex justify-between text-sm">
								<span class="text-gray-600">Processing Fee</span>
								<span class="font-medium">Free</span>
							</div>
							<hr />
							<div class="flex justify-between text-lg font-bold">
								<span>Total</span>
								<span class="text-purple-600">{formatPrice(cartState.total)}</span>
							</div>
						</div>

						<!-- Checkout Button -->
						<button
							onclick={processCheckout}
							disabled={loading}
							class="bg-primary hover:bg-primary-dark active:bg-primary-dark mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-base font-semibold text-white disabled:opacity-50 sm:mt-6 sm:py-4 sm:text-lg"
						>
							{#if loading}
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent sm:h-5 sm:w-5"
								></div>
								<span class="text-sm sm:text-base">Processing...</span>
							{:else}
								<Lock size={18} class="sm:h-5 sm:w-5" />
								<span class="text-sm sm:text-base">Complete Order</span>
							{/if}
						</button>

						<!-- Security Notice -->
						<div class="mt-4 rounded-lg bg-green-50 p-3">
							<div class="flex items-start gap-2">
								<Lock size={16} class="mt-0.5 text-green-600" />
								<div class="text-sm text-green-800">
									<p class="font-medium">Secure Checkout</p>
									<p>Your payment information is encrypted and secure</p>
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
