<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Check, X, Loader2, Clock3 } from '$lib/icons';
	import { cart } from '$lib/stores/cart.svelte';
	import { showSuccess, showError, showWarning } from '$lib/stores/toasts';
	import {
		getFailureKind,
		isPendingPaymentStatus,
		normalizePaymentStatus
	} from '$lib/helpers/payment-status';
	import { trackSnapEvent } from '$lib/services/snap-pixel';
	import { recordAnalyticsEvent } from '$lib/services/analytics-events';
	import {
		clearGa4CheckoutSnapshot,
		readGa4CheckoutSnapshot,
		trackGa4Purchase
	} from '$lib/services/ga4';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	const MAX_GATEWAY_CONFIRMATION_WAIT_MS = 60_000;
	const MAX_STORE_CREDIT_CONFIRMATION_WAIT_MS = 20_000;
	const STATUS_REQUEST_TIMEOUT_MS = 12_000;
	const RETRY_INTERVAL_MS = 5_000;
	const PENDING_ORDER_STORAGE_KEY = 'fastaccs_pending_order_id';
	const CHECKOUT_SESSION_STORAGE_KEY = 'fastaccs_checkout_session';

	let verifying = $state(true);
	let pending = $state(false);
	let timedOut = $state(false);
	let success = $state(false);
	let cancelled = $state(false);
	let errorMessage = $state('');
	let pendingMessage = $state('');
	let statusCheckInterrupted = $state(false);
	let orderId = $state<string | null>(null);
	let attemptCount = $state(0);
	// Post-purchase boosting upsell (shown on the success screen for account orders).
	let showBoostUpsell = $state(false);
	let purchasesRedirectPath = $state('/dashboard?tab=purchases');

	let isDisposed = false;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let upsellRedirectTimer: ReturnType<typeof setTimeout> | null = null;
	// Store-credit orders are already settled — show a matching message, not Monnify's.
	let isStoreCredit = $state(false);
	const verifyingTitle = $derived(
		isStoreCredit ? 'Confirming your order' : 'Confirming your payment'
	);
	const verifyingBody = $derived(
		isStoreCredit
			? 'Applying your store credit and opening your order…'
			: 'This normally finishes automatically.'
	);
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
		localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
		clearGa4CheckoutSnapshot();
	}

	function preservePendingOrderStorage(): void {
		clearGa4CheckoutSnapshot();
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
		if (showPendingBanner) {
			preservePendingOrderStorage();
		} else {
			clearPendingOrderStorage();
		}
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
		isStoreCredit = $page.url.searchParams.get('method') === 'store_credit';

		console.info('[checkout.verify] callback_received', {
			hasPaymentReference: Boolean(paymentReference),
			hasTransactionReference: Boolean(transactionReference),
			hasOrderId: Boolean(orderIdParam),
			callbackStatus,
			callbackQueryKeys
		});

		const runVerification = async () => {
			const startedAt = Date.now();
			const maxConfirmationWaitMs = isStoreCredit
				? MAX_STORE_CREDIT_CONFIRMATION_WAIT_MS
				: MAX_GATEWAY_CONFIRMATION_WAIT_MS;

			const continueAfterTemporaryIssue = async (message: string) => {
				verifying = false;
				pending = true;
				cancelled = false;
				timedOut = false;
				statusCheckInterrupted = true;
				pendingMessage = message;
				if (Date.now() - startedAt < maxConfirmationWaitMs) {
					await sleep(RETRY_INTERVAL_MS);
					return true;
				}
				return false;
			};

			while (!isDisposed) {
				attemptCount += 1;

				try {
					const controller = new AbortController();
					const requestTimeout = window.setTimeout(
						() => controller.abort(),
						STATUS_REQUEST_TIMEOUT_MS
					);
					let response: Response;
					try {
						response = await fetch('/api/payments/verify', {
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
							}),
							signal: controller.signal
						});
					} finally {
						window.clearTimeout(requestTimeout);
					}

					const result = await response.json();

					if (isDisposed) return;

					if (result.success) {
						const resolvedOrderId = result.orderId || orderIdParam;
						const checkoutSnapshot = readGa4CheckoutSnapshot(resolvedOrderId);
						trackSnapEvent('PURCHASE', {
							transaction_id: resolvedOrderId,
							price: Number(result.amount || 0) || undefined,
							currency: result.currency || 'NGN',
							description: 'FastAccs order'
						});
						recordAnalyticsEvent('purchase', `${$page.url.pathname}${$page.url.search}`);
						if (resolvedOrderId) {
							trackGa4Purchase({
								transaction_id: resolvedOrderId,
								value: Number(result.amount || checkoutSnapshot?.value || 0),
								currency: result.currency || checkoutSnapshot?.currency || 'NGN',
								affiliation: checkoutSnapshot?.affiliation || 'FastAccs SMM',
								coupon: checkoutSnapshot?.coupon,
								items: checkoutSnapshot?.items || []
							});
						}
						success = true;
						pending = false;
						verifying = false;
						cancelled = false;
						timedOut = false;
						statusCheckInterrupted = false;
						orderId = resolvedOrderId;
						clearPendingOrderStorage();
						cart.clear();
						if (result.phone === true) {
							goto(`/order/${resolvedOrderId}`);
						} else if (result.boosting === true) {
							goto(getOrdersDashboardPath(resolvedOrderId));
						} else if (
							result.manualHandover === true ||
							String(result.status || '').toUpperCase() === 'PAID'
						) {
							goto(getOrdersDashboardPath(resolvedOrderId));
						} else {
							showSuccess('Payment successful!', 'Your order has been completed.');
							// Hold on the success screen with a boosting upsell instead of bouncing
							// straight to purchases; a fallback still redirects passive buyers.
							purchasesRedirectPath = getPurchasesDashboardPath(resolvedOrderId);
							showBoostUpsell = true;
							upsellRedirectTimer = setTimeout(() => {
								if (!isDisposed) goto(purchasesRedirectPath);
							}, 10000);
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
						errorMessage = cancelled
							? "No problem — you weren't charged, and your items are still in your cart whenever you're ready."
							: "If money left your account, your order will finish on its own in a few minutes — check your orders. If it didn't, nothing was taken. You can try again anytime.";
						clearPendingOrderStorage();

						if (cancelled) {
							showWarning('Payment cancelled', "You weren't charged. Your cart is safe.");
						} else {
							showError(
								"Payment didn't go through",
								"Check your orders — if you were charged, it'll complete shortly."
							);
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
						const shouldContinue = await continueAfterTemporaryIssue(
							isStoreCredit
								? 'Your order is confirmed. Reconnecting to open its latest status…'
								: 'Your order is saved. Reconnecting to confirm its latest payment status…'
						);
						if (shouldContinue) continue;
						break;
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
						statusCheckInterrupted = false;
						pendingMessage = result.message || 'Waiting for payment confirmation from Monnify.';

						if (!pendingToastShown) {
							showWarning(
								'Payment confirmation in progress',
								'Please wait while we confirm your payment with Monnify.'
							);
							pendingToastShown = true;
						}

						if (Date.now() - startedAt >= maxConfirmationWaitMs) {
							break;
						}

						await sleep(RETRY_INTERVAL_MS);
						continue;
					}

					const shouldContinue = await continueAfterTemporaryIssue(
						'Your order is saved. Rechecking its latest status…'
					);
					if (shouldContinue) continue;
					break;
				} catch (error) {
					if (isDisposed) return;
					void error;

					const shouldContinue = await continueAfterTemporaryIssue(
						isStoreCredit
							? 'Your order is confirmed. Reconnecting to open it…'
							: 'Your order is saved. Reconnecting to confirm its latest payment status…'
					);
					if (shouldContinue) continue;
					break;
				}
			}

			if (!isDisposed && !success) {
				verifying = false;
				pending = true;
				cancelled = false;
				timedOut = true;
				pendingMessage = isStoreCredit
					? 'Your order is confirmed and saved in My Orders. Opening it now…'
					: statusCheckInterrupted
						? 'Your order is saved in My Orders. Opening it now…'
						: 'Payment confirmation is still in progress. Your order is saved in My Orders.';
				showWarning(
					'Order saved',
					'Opening My Orders so you can continue from the durable order record.'
				);
				goToOrdersDashboard(true);
			}
		};

		void runVerification();

		return () => {
			isDisposed = true;
			clearRetryTimer();
			if (upsellRedirectTimer) {
				clearTimeout(upsellRedirectTimer);
				upsellRedirectTimer = null;
			}
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
					{verifyingTitle}
				</h1>
				<p
					class="text-sm sm:text-base"
					style="color: var(--text-muted); font-family: var(--font-body);"
				>
					{verifyingBody}
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
				{#if showBoostUpsell}
					<div
						class="mb-2 rounded-xl p-4 text-left"
						style="background: var(--bg); border: 1px solid var(--primary);"
					>
						<p
							class="mb-1 text-sm font-bold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Make your new account look established ⚡
						</p>
						<p
							class="mb-3 text-xs sm:text-sm"
							style="color: var(--text-muted); font-family: var(--font-body);"
						>
							Add real followers, likes &amp; views from our Boosting Services — grow it in minutes.
						</p>
						<button
							onclick={() => goto('/services')}
							class="mb-2 w-full rounded-full px-6 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[.98] sm:text-base"
							style="background: var(--btn-primary-gradient); color: #04140C; font-family: var(--font-head);"
						>
							Boost my account →
						</button>
						<button
							onclick={() => goto(purchasesRedirectPath)}
							class="w-full rounded-full px-6 py-2 text-xs sm:text-sm"
							style="color: var(--text-muted); font-family: var(--font-body);"
						>
							Continue to my purchases →
						</button>
					</div>
				{:else}
					<p
						class="text-xs sm:text-sm"
						style="color: var(--text-dim); font-family: var(--font-body);"
					>
						Redirecting to your purchases...
					</p>
				{/if}
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
					{cancelled ? 'Payment cancelled' : "Payment didn't go through"}
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
						Check my orders
					</button>
					<button
						onclick={retryCheckout}
						class="w-full rounded-full px-6 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[.98] sm:text-base"
						style="border: 1px solid var(--border); color: var(--text); font-family: var(--font-head);"
					>
						Try again
					</button>
				</div>
			{/if}
		</div>
	</div>
</main>
