<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Check, X, Loader2 } from '@lucide/svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { showSuccess, showError } from '$lib/stores/toasts';

	let verifying = $state(true);
	let success = $state(false);
	let errorMessage = $state('');
	let orderId = $state<string | null>(null);

	onMount(async () => {
		// Monnify redirects back with ?paymentReference=ORD_...
		const paymentReference = $page.url.searchParams.get('paymentReference');
		const orderIdParam = $page.url.searchParams.get('orderId');

		try {
			const response = await fetch('/api/payments/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ paymentReference, orderId: orderIdParam })
			});

			const result = await response.json();

			if (result.success) {
				success = true;
				orderId = result.orderId;
				cart.clear();
				showSuccess('Payment successful!', 'Your order has been completed.');
				goto('/dashboard');
			} else {
				errorMessage = result.error || 'Payment verification failed';
				showError('Payment failed', errorMessage);
			}
		} catch (error) {
			console.error('Verification error:', error);
			errorMessage = error instanceof Error ? error.message : 'An error occurred';
			showError('Verification failed', errorMessage);
		} finally {
			verifying = false;
		}
	});
</script>

<svelte:head>
	<title>Payment Verification - FastAccs</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
	<div class="w-full max-w-md">
		<div class="rounded-lg bg-white p-8 text-center shadow-lg">
			{#if verifying}
				<!-- Verifying State -->
				<div class="mb-6 flex justify-center">
					<Loader2 size={64} class="animate-spin text-purple-600" />
				</div>
				<h1 class="mb-2 text-2xl font-bold text-gray-900">Verifying Payment</h1>
				<p class="text-gray-600">Please wait while we confirm your payment...</p>
			{:else if success}
				<!-- Success State -->
				<div class="mb-6 flex justify-center">
					<div class="rounded-full bg-green-100 p-4">
						<Check size={64} class="text-green-600" />
					</div>
				</div>
				<h1 class="mb-2 text-2xl font-bold text-gray-900">Payment Successful!</h1>
				<p class="mb-6 text-gray-600">
					Your payment has been confirmed and your order is being processed.
				</p>
				{#if orderId}
					<p class="mb-4 text-sm text-gray-500">Order ID: {orderId}</p>
				{/if}
				<p class="text-sm text-gray-500">Redirecting to your dashboard...</p>
			{:else}
				<!-- Error State -->
				<div class="mb-6 flex justify-center">
					<div class="rounded-full bg-red-100 p-4">
						<X size={64} class="text-red-600" />
					</div>
				</div>
				<h1 class="mb-2 text-2xl font-bold text-gray-900">Payment Failed</h1>
				<p class="mb-6 text-gray-600">{errorMessage}</p>
				<div class="space-y-3">
					<button
						onclick={() => goto('/checkout')}
						class="w-full rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white transition-all hover:bg-purple-700 active:scale-95"
					>
						Try Again
					</button>
					<button
						onclick={() => goto('/dashboard')}
						class="w-full rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
					>
						Go to Dashboard
					</button>
				</div>
			{/if}
		</div>
	</div>
</main>
