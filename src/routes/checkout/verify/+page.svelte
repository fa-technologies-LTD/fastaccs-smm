<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Check, X, Loader2, Clock3 } from '@lucide/svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { showSuccess, showError, showWarning } from '$lib/stores/toasts';
	import {
		getFailureKind,
		isPendingPaymentStatus,
		normalizePaymentStatus
	} from '$lib/helpers/payment-status';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	const MAX_CONFIRMATION_WAIT_MS = 10_000;
	const RETRY_INTERVAL_MS = 5_000;
	const PENDING_ORDER_STORAGE_KEY = 'fastaccs_pending_order_id';

	let verifying = $state(true);
	let pending = $state(false);
	let timedOut = $state(false);
	let success = $state(false);
	let cancelled = $state(false);
	let errorMessage = $state('');
	let pendingMessage = $state('');
	let orderId = $state<string | null>(null);
	let attemptCount = $state(0);

	let isDisposed = false;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingToastShown = false;

	function sanitizeOrderId(value: string | null): string | null {
		if (!value) return null;
		const stripped = value.split('?')[0].split('&')[0].trim();
		return stripped || null;
	}

	function extractCallbackStatusHint(searchParams: URLSearchParams): string | null {
		const statusKeys = ['paymentStatus', 'status', 'transactionStatus', 'txStatus'];

		for (const key of statusKeys) {
			const value = searchParams.get(key);
			if (value?.trim()) {
				return value.trim();
			}
		}

		return null;
	}

	function extractCallbackMessageHint(searchParams: URLSearchParams): string | null {
		const messageKeys = ['responseMessage', 'message', 'statusMessage'];

		for (const key of messageKeys) {
			const value = searchParams.get(key);
			if (value?.trim()) {
				return value.trim();
			}
		}

		return null;
	}

	function clearPendingOrderStorage(): void {
		sessionStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
	}

	function getOrdersDashboardPath(targetOrderId: string | null, showPendingBanner = false): string {
		const query = new SvelteURLSearchParams({ tab: 'orders' });
		if (targetOrderId) {
			query.set('orderId', targetOrderId);
		}
		if (showPendingBanner) {
			query.set('paymentPending', '1');
		}
		return `/dashboard?${query.toString()}`;
	}

	function getPurchasesDashboardPath(targetOrderId: string | null): string {
		return targetOrderId
			? `/dashboard?tab=purchases&orderId=${encodeURIComponent(targetOrderId)}`
			: '/dashboard?tab=purchases';
	}

	function goToOrdersDashboard(showPendingBanner = false): void {
		clearPendingOrderStorage();
		goto(getOrdersDashboardPath(orderId, showPendingBanner));
	}

	function closeVerificationScreen(): void {
		goToOrdersDashboard(verifying || pending);
	}

	function retryCheckout(): void {
		clearPendingOrderStorage();
		goto('/checkout');
	}

	function clearRetryTimer(): void {
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimer = null;
		}
	}

	function sleep(ms: number): Promise<void> {
		return new Promise((resolve) => {
			retryTimer = setTimeout(() => {
				retryTimer = null;
				resolve();
			}, ms);
		});
	}

	onMount(() => {
		const paymentReference = $page.url.searchParams.get('paymentReference');
		const transactionReference = $page.url.searchParams.get('transactionReference');
		const callbackStatus = extractCallbackStatusHint($page.url.searchParams);
		const callbackMessage = extractCallbackMessageHint($page.url.searchParams);
		const orderIdFromQuery = sanitizeOrderId($page.url.searchParams.get('orderId'));
		const orderIdFromSession = sanitizeOrderId(sessionStorage.getItem(PENDING_ORDER_STORAGE_KEY));
		const orderIdParam = orderIdFromQuery || orderIdFromSession;
		const callbackQueryKeys = Array.from($page.url.searchParams.keys());

		if (orderIdParam) {
			sessionStorage.setItem(PENDING_ORDER_STORAGE_KEY, orderIdParam);
		}

		orderId = orderIdParam;

		console.info('[checkout.verify] callback_received', {
			hasPaymentReference: Boolean(paymentReference),
			hasTransactionReference: Boolean(transactionReference),
			hasOrderId: Boolean(orderIdParam),
			callbackStatus,
			callbackQueryKeys
		});

		const runVerification = async () => {
			const startedAt = Date.now();

			while (!isDisposed) {
				attemptCount += 1;

				try {
					const response = await fetch('/api/payments/verify', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							paymentReference,
							transactionReference,
							orderId: orderIdParam,
							callbackStatus,
							callbackMessage,
							callbackContext: {
								queryKeys: callbackQueryKeys,
								queryLength: $page.url.search.length
							}
						})
					});

					const result = await response.json();

					if (isDisposed) return;

					if (result.success) {
						const resolvedOrderId = result.orderId || orderIdParam;
						success = true;
						pending = false;
						verifying = false;
						cancelled = false;
						timedOut = false;
						orderId = resolvedOrderId;
						clearPendingOrderStorage();
						cart.clear();
						if (result.manualHandover === true || String(result.status || '').toUpperCase() === 'PAID') {
							showSuccess(
								'Payment confirmed!',
								'Manual handover is now in progress. Continue on WhatsApp from your order details.'
							);
							goto(getOrdersDashboardPath(resolvedOrderId));
						} else {
							showSuccess('Payment successful!', 'Your order has been completed.');
							goto(getPurchasesDashboardPath(resolvedOrderId));
						}
						return;
					}

					const normalizedStatus = normalizePaymentStatus(result.status);
					const terminalFailure =
						result.cancelled === true || result.failed === true || getFailureKind(normalizedStatus);

					if (terminalFailure) {
						verifying = false;
						pending = false;
						timedOut = false;
						cancelled =
							result.cancelled === true ||
							['CANCELLED', 'CANCELED', 'EXPIRED', 'ABANDONED'].includes(normalizedStatus);
						errorMessage =
							result.error ||
							result.message ||
							(cancelled
								? 'Payment was cancelled before completion.'
								: 'Payment verification failed.');
						clearPendingOrderStorage();

						if (cancelled) {
							showWarning('Payment cancelled', errorMessage);
						} else {
							showError('Payment failed', errorMessage);
						}
						return;
					}

					if (response.status === 401) {
						clearPendingOrderStorage();
						showWarning('Session expired', 'Please log in again to complete payment verification.');
						const returnUrl = encodeURIComponent($page.url.pathname + $page.url.search);
						goto(`/auth/login?returnUrl=${returnUrl}`);
						return;
					}

					if (!response.ok && response.status !== 202) {
						verifying = false;
						pending = false;
						cancelled = false;
						timedOut = false;
						errorMessage =
							result.error ||
							result.message ||
							`Verification failed with status ${response.status}`;
						showError('Payment verification failed', errorMessage);
						return;
					}

					const pendingResponse =
						response.status === 202 ||
						result.pending === true ||
						isPendingPaymentStatus(normalizedStatus);

					if (pendingResponse) {
						verifying = false;
						pending = true;
						cancelled = false;
						timedOut = false;
						pendingMessage = result.message || 'Waiting for payment confirmation from Monnify.';

						if (!pendingToastShown) {
							showWarning(
								'Payment confirmation in progress',
								'Please wait while we confirm your payment with Monnify.'
							);
							pendingToastShown = true;
						}

						if (Date.now() - startedAt >= MAX_CONFIRMATION_WAIT_MS) {
							break;
						}

						await sleep(RETRY_INTERVAL_MS);
						continue;
					}

					verifying = false;
					pending = false;
					cancelled = false;
					timedOut = false;
					errorMessage = result.error || 'Payment verification failed';
					showError('Payment failed', errorMessage);
					return;
				} catch (error) {
					if (isDisposed) return;

					verifying = false;
					pending = false;
					cancelled = false;
					timedOut = false;
					errorMessage = error instanceof Error ? error.message : 'An error occurred';
					showError('Verification failed', errorMessage);
					return;
				}
			}

			if (!isDisposed && !success) {
				verifying = false;
				pending = true;
				cancelled = false;
				timedOut = true;
				pendingMessage = 'Waiting for payment confirmation from Monnify.';
				showWarning(
					'Payment confirmation pending',
					'We are still confirming with Monnify. You will now be redirected to your orders.'
				);
				goToOrdersDashboard(true);
			}
		};

		void runVerification();

		return () => {
			isDisposed = true;
			clearRetryTimer();
		};
	});
</script>

<svelte:head>
	<title>Payment Verification - FastAccs</title>
</svelte:head>

<main
	class="flex min-h-screen items-center justify-center px-4 py-6 sm:py-10"
	style="background: var(--bg);"
>
	<div class="w-full max-w-md">
		<div class="mb-4 flex justify-center">
			<span
				class="rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase"
				style="background: rgba(5,212,113,0.12); color: var(--primary); border: 1px solid rgba(5,212,113,0.3); font-family: var(--font-head);"
			>
				Secure Payment Check
			</span>
		</div>

		<div
			class="relative rounded-2xl p-6 text-center shadow-sm sm:p-8"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			{#if verifying || pending}
				<button
					onclick={closeVerificationScreen}
					aria-label="Close and view orders"
					class="absolute top-3 right-3 rounded-full p-2 transition hover:opacity-90"
					style="border: 1px solid var(--border); color: var(--text-muted);"
				>
					<X size={16} />
				</button>
			{/if}

			{#if verifying}
				<!-- Verifying State -->
				<div class="mb-6 flex justify-center">
					<div
						class="rounded-full p-4"
						style="background: rgba(170,173,255,0.15); border: 1px solid rgba(170,173,255,0.25);"
					>
						<Loader2 size={56} class="animate-spin" style="color: var(--status-info);" />
					</div>
				</div>
				<h1
					class="mb-2 text-2xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Verifying Payment
				</h1>
				<p
					class="text-sm sm:text-base"
					style="color: var(--text-muted); font-family: var(--font-body);"
				>
					Waiting for payment confirmation from Monnify.
				</p>
			{:else if success}
				<!-- Success State -->
				<div class="mb-6 flex justify-center">
					<div
						class="rounded-full p-4"
						style="background: var(--status-success-bg); border: 1px solid var(--status-success-border);"
					>
						<Check size={56} style="color: var(--status-success);" />
					</div>
				</div>
				<h1
					class="mb-2 text-2xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Payment Successful
				</h1>
				<p
					class="mb-5 text-sm sm:text-base"
					style="color: var(--text-muted); font-family: var(--font-body);"
				>
					Your payment has been confirmed and your order is now being finalized.
				</p>
				{#if orderId}
					<div
						class="mb-4 rounded-lg px-3 py-2 text-xs sm:text-sm"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text-muted);"
					>
						Order ID: <span style="color: var(--text); font-family: var(--font-head);"
							>{orderId}</span
						>
					</div>
				{/if}
				<p
					class="text-xs sm:text-sm"
					style="color: var(--text-dim); font-family: var(--font-body);"
				>
					Redirecting to your purchases...
				</p>
			{:else if pending}
				<!-- Pending State -->
				<div class="mb-6 flex justify-center">
					<div
						class="rounded-full p-4"
						style="background: rgba(202,219,46,0.14); border: 1px solid rgba(202,219,46,0.25);"
					>
						<Clock3 size={56} style="color: var(--fa-lime-700);" />
					</div>
				</div>
				<h1
					class="mb-2 text-2xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Transaction In Progress
				</h1>
				<p
					class="mb-4 text-sm sm:text-base"
					style="color: var(--text-muted); font-family: var(--font-body);"
				>
					{pendingMessage}
				</p>
				<div
					class="mb-6 flex items-center justify-center gap-2 text-xs sm:text-sm"
					style="color: var(--text-dim);"
				>
					<span
						class="rounded-full px-2 py-1"
						style="background: var(--bg); border: 1px solid var(--border);"
					>
						Attempt {attemptCount}
					</span>
					<span>Auto-check every 5s</span>
				</div>
				{#if timedOut}
					<div class="space-y-3">
						<button
							onclick={() => window.location.reload()}
							class="w-full rounded-full px-6 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[.98] sm:text-base"
							style="background: var(--btn-primary-gradient); color: #04140C; font-family: var(--font-head);"
						>
							Refresh Status
						</button>
						<button
							onclick={() => goToOrdersDashboard(true)}
							class="w-full rounded-full px-6 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[.98] sm:text-base"
							style="border: 1px solid var(--border); color: var(--text); font-family: var(--font-head);"
						>
							View Orders
						</button>
					</div>
				{:else}
					<div
						class="rounded-lg px-3 py-2 text-xs sm:text-sm"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text-muted);"
					>
						Still checking payment confirmation...
					</div>
				{/if}
			{:else}
				<!-- Error State -->
				<div class="mb-6 flex justify-center">
					<div
						class="rounded-full p-4"
						style="background: var(--status-error-bg); border: 1px solid var(--status-error-border);"
					>
						<X size={56} style="color: var(--status-error);" />
					</div>
				</div>
				<h1
					class="mb-2 text-2xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					{cancelled ? 'Payment Cancelled' : 'Payment Failed'}
				</h1>
				<p
					class="mb-6 text-sm sm:text-base"
					style="color: var(--text-muted); font-family: var(--font-body);"
				>
					{errorMessage}
				</p>
				<div class="space-y-3">
					<button
						onclick={() => goToOrdersDashboard(false)}
						class="w-full rounded-full px-6 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[.98] sm:text-base"
						style="background: var(--btn-primary-gradient); color: #04140C; font-family: var(--font-head);"
					>
						View Orders
					</button>
					<button
						onclick={retryCheckout}
						class="w-full rounded-full px-6 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[.98] sm:text-base"
						style="border: 1px solid var(--border); color: var(--text); font-family: var(--font-head);"
					>
						Retry Payment
					</button>
				</div>
			{/if}
		</div>
	</div>
</main>
