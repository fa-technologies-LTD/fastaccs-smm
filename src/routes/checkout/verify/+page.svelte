<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Check, X, Loader2, Clock3 } from '@lucide/svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { showSuccess, showError, showWarning } from '$lib/stores/toasts';

	const MAX_CONFIRMATION_WAIT_MS = 90_000;
	const RETRY_INTERVAL_MS = 5_000;
	const PENDING_ORDER_STORAGE_KEY = 'fastaccs_pending_order_id';
	const TERMINAL_FAILURE_STATUSES = ['FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'ABANDONED'];

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

	function normalizeStatus(value: unknown): string {
		if (typeof value !== 'string') return '';
		return value.trim().toUpperCase();
	}

	function isPendingStatus(status: string): boolean {
		return (
			status === '' ||
			['PENDING', 'PROCESSING', 'PENDING_PAYMENT', 'ERROR', 'NOT_FOUND', 'UNKNOWN'].includes(status)
		);
	}

	function isTerminalFailureStatus(status: string): boolean {
		return TERMINAL_FAILURE_STATUSES.includes(status);
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

	function getOrdersDashboardPath(targetOrderId: string | null): string {
		return targetOrderId
			? `/dashboard?tab=orders&orderId=${encodeURIComponent(targetOrderId)}`
			: '/dashboard?tab=orders';
	}

	function getPurchasesDashboardPath(targetOrderId: string | null): string {
		return targetOrderId
			? `/dashboard?tab=purchases&orderId=${encodeURIComponent(targetOrderId)}`
			: '/dashboard?tab=purchases';
	}

	function goToOrdersDashboard(): void {
		clearPendingOrderStorage();
		goto(getOrdersDashboardPath(orderId));
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
						success = true;
						pending = false;
						verifying = false;
						cancelled = false;
						timedOut = false;
						orderId = result.orderId || orderIdParam;
						clearPendingOrderStorage();
						cart.clear();
						showSuccess('Payment successful!', 'Your order has been completed.');
						goto(getPurchasesDashboardPath(orderId));
						return;
					}

					const normalizedStatus = normalizeStatus(result.status);
					const terminalFailure =
						result.cancelled === true ||
						result.failed === true ||
						isTerminalFailureStatus(normalizedStatus);

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

					const pendingResponse =
						response.status === 202 || result.pending === true || isPendingStatus(normalizedStatus);

					if (pendingResponse) {
						verifying = false;
						pending = true;
						cancelled = false;
						timedOut = false;
						pendingMessage =
							result.message || 'We are still confirming your payment status with Monnify.';

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
				pendingMessage =
					'Payment is still being confirmed. Please check your dashboard shortly while processing completes in the background.';
				showWarning(
					'Payment confirmation pending',
					'You can refresh this page or check your dashboard in a moment.'
				);
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
			class="rounded-2xl p-6 text-center shadow-sm sm:p-8"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
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
					Please wait while we confirm your payment with Monnify.
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
							onclick={goToOrdersDashboard}
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
						onclick={goToOrdersDashboard}
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
