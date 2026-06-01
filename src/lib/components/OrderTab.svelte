<script lang="ts">
	import { CheckCircle, RefreshCw, Clock } from '$lib/icons';
	import { showSuccess, showError, showWarning } from '$lib/stores/toasts';
	import { goto } from '$app/navigation';
	import { cart } from '$lib/stores/cart.svelte';
	import { normalizePaymentStatus } from '$lib/helpers/payment-status';
	import {
		getTierDeliveryModeLabel,
		normalizeTierDeliveryMode,
		type TierDeliveryMode
	} from '$lib/helpers/tier-delivery-config';

	interface OrderItem {
		id?: string;
		categoryId?: string;
		productName?: string;
		productCategory?: string;
		quantity?: number;
		type?: string;
		details?: string;
	}

	interface OrderRecord {
		id: string;
		orderNumber?: string | null;
		totalAmount?: number | string | null;
		status?: string | null;
		paymentStatus?: string | null;
		paymentReference?: string | null;
		deliveryStatus?: string | null;
		createdAt?: string | Date;
		date?: string;
		orderItems?: OrderItem[];
		items?: OrderItem[];
		deliveryMethod?: string;
		deliveredAt?: string | Date | null;
		estimatedDelivery?: string | null;
	}

	let {
		initialOrders = [],
		focusOrderId = null
	}: { initialOrders?: OrderRecord[]; focusOrderId?: string | null } = $props();
	let orders = $state<OrderRecord[]>(initialOrders);
	let checkingPaymentByOrderId = $state<Record<string, boolean>>({});

	$effect(() => {
		if (!focusOrderId) return;
		if (typeof document === 'undefined') return;
		const target = document.getElementById(`order-${focusOrderId}`);
		if (!target) return;

		target.scrollIntoView({ behavior: 'smooth', block: 'center' });
	});

	function formatOrderDate(order: OrderRecord): string {
		const source = order.createdAt || order.date;
		if (!source) return 'Date unavailable';
		const date = new Date(source);
		if (Number.isNaN(date.getTime())) return 'Date unavailable';
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getDisplayOrderNumber(order: OrderRecord): string {
		if (order.orderNumber && order.orderNumber.trim()) {
			return order.orderNumber;
		}
		return `ORD-${order.id.slice(0, 8).toUpperCase()}`;
	}

	function normalizeLower(value: string | null | undefined): string {
		return String(value || '')
			.trim()
			.toLowerCase();
	}

	function getPaymentState(order: OrderRecord): {
		label: string;
		tone: 'success' | 'pending' | 'failure';
	} {
		const orderStatus = normalizeLower(order.status);
		const paymentStatus = normalizeLower(order.paymentStatus);

		if (
			['paid', 'completed'].includes(orderStatus) ||
			['paid', 'success'].includes(paymentStatus)
		) {
			return { label: 'Payment Confirmed', tone: 'success' };
		}

		if (
			['failed'].includes(orderStatus) ||
			['failed', 'rejected', 'rejected_payment', 'reversed'].includes(paymentStatus)
		) {
			return { label: 'Payment Failed', tone: 'failure' };
		}

		if (
			['cancelled', 'abandoned', 'expired'].includes(orderStatus) ||
			['cancelled', 'canceled', 'abandoned', 'expired', 'user_cancelled'].includes(paymentStatus)
		) {
			return { label: 'Payment Cancelled', tone: 'failure' };
		}

		if (orderStatus === 'pending_payment') {
			if (paymentStatus === 'processing') {
				return { label: 'Confirming with Monnify', tone: 'pending' };
			}
			return { label: 'Awaiting Payment', tone: 'pending' };
		}

		return { label: 'Awaiting Payment', tone: 'pending' };
	}

	function getFulfillmentState(order: OrderRecord): string {
		const payment = getPaymentState(order);
		if (payment.tone !== 'success') {
			return 'Not Started';
		}

		const orderStatus = normalizeLower(order.status);
		const deliveryStatus = normalizeLower(order.deliveryStatus);
		const deliveryMethod = normalizeLower(order.deliveryMethod);

		if (deliveryMethod === 'whatsapp' && deliveryStatus === 'processing') {
			return 'Manual Handover (WhatsApp)';
		}

		if (deliveryStatus === 'delivered' || orderStatus === 'completed') {
			return 'Completed';
		}
		if (deliveryStatus === 'processing' || orderStatus === 'processing') {
			return 'Processing';
		}
		if (deliveryStatus === 'failed') {
			return 'Failed';
		}
		return 'Processing';
	}

	function getOrderItems(order: OrderRecord): OrderItem[] {
		if (Array.isArray(order.orderItems) && order.orderItems.length > 0) return order.orderItems;
		if (Array.isArray(order.items) && order.items.length > 0) return order.items;
		return [];
	}

	function isPaymentRecheckable(order: OrderRecord): boolean {
		return getPaymentState(order).tone === 'pending' && Boolean(order.id);
	}

	function patchOrder(orderId: string, patch: Partial<OrderRecord>): void {
		orders = orders.map((order) => (order.id === orderId ? { ...order, ...patch } : order));
	}

	async function checkPaymentStatus(order: OrderRecord): Promise<void> {
		if (checkingPaymentByOrderId[order.id]) return;

		checkingPaymentByOrderId = {
			...checkingPaymentByOrderId,
			[order.id]: true
		};

		try {
			const response = await fetch('/api/payments/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orderId: order.id,
					paymentReference: order.paymentReference || null
				})
			});

			const result = await response.json().catch(() => ({}));
			const normalizedStatus = normalizePaymentStatus(result.status);

			if (result.success) {
				const nextStatus = normalizedStatus === 'COMPLETED' ? 'completed' : 'paid';
				patchOrder(order.id, {
					status: nextStatus,
					paymentStatus: 'paid'
				});
				showSuccess(
					'Payment confirmed',
					nextStatus === 'completed'
						? 'Your order has been completed.'
						: 'Payment is confirmed. Fulfillment is now in progress.'
				);
				return;
			}

			if (result.cancelled === true || normalizedStatus === 'CANCELLED' || normalizedStatus === 'EXPIRED') {
				patchOrder(order.id, {
					status: 'cancelled',
					paymentStatus: 'cancelled'
				});
				showWarning(
					'Payment expired',
					result.message || 'Payment was not confirmed in time. Please place a fresh order.'
				);
				return;
			}

			if (result.failed === true || normalizedStatus === 'FAILED') {
				patchOrder(order.id, {
					status: 'failed',
					paymentStatus: 'failed'
				});
				showError('Payment failed', result.error || result.message || 'Please try again.');
				return;
			}

			if (response.status === 202 || result.pending === true) {
				patchOrder(order.id, {
					status: 'pending_payment',
					paymentStatus: normalizedStatus === 'PROCESSING' ? 'processing' : 'pending'
				});
				showWarning(
					'Still confirming',
					result.message || 'Monnify has not confirmed this payment yet.'
				);
				return;
			}

			showError('Could not check payment', result.error || 'Please try again.');
		} catch (error) {
			console.error('Payment recheck failed:', error);
			showError('Could not check payment', 'Please try again.');
		} finally {
			checkingPaymentByOrderId = {
				...checkingPaymentByOrderId,
				[order.id]: false
			};
		}
	}

	async function fetchIncomingDeliveryMode(
		reorderableItems: Array<OrderItem & { categoryId: string }>
	): Promise<TierDeliveryMode | null> {
		const ids = Array.from(new Set(reorderableItems.map((item) => item.categoryId)));
		if (ids.length === 0) return null;

		const response = await fetch('/api/categories/tiers/batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids })
		});

		if (!response.ok) {
			throw new Error('Failed to validate delivery mode for reorder');
		}

		const payload = (await response.json()) as {
			data?: Array<{ id: string; metadata?: { delivery_mode?: string | null } | null }>;
		};
		const rows = Array.isArray(payload.data) ? payload.data : [];
		const modeById = new Map(
			rows.map((row) => [row.id, normalizeTierDeliveryMode(row.metadata?.delivery_mode)])
		);

		const incomingModes = reorderableItems.map(
			(item) => modeById.get(item.categoryId) || 'instant_auto'
		);
		const firstMode = incomingModes[0] || 'instant_auto';

		if (incomingModes.some((mode) => mode !== firstMode)) {
			return null;
		}

		return firstMode === 'manual_handover' ? 'manual_handover' : 'instant_auto';
	}

	async function reorderItems(order: OrderRecord) {
		const items = getOrderItems(order);
		if (items.length === 0) {
			showError('No items found in this order');
			return;
		}

		const reorderableItems = items.filter(
			(item) => typeof item.categoryId === 'string' && item.categoryId.trim().length > 0
		);

		if (reorderableItems.length === 0) {
			showError('This order cannot be reordered yet');
			return;
		}

		let incomingMode: TierDeliveryMode | null = null;
		try {
			incomingMode = await fetchIncomingDeliveryMode(
				reorderableItems as Array<OrderItem & { categoryId: string }>
			);
		} catch (error) {
			console.error('Failed to validate reorder delivery mode:', error);
			showError('Could not reorder now', 'Please try again.');
			return;
		}

		if (!incomingMode) {
			showError(
				'Reorder blocked',
				'This order contains mixed delivery modes and must be added manually.'
			);
			return;
		}

		const compatibility = await cart.ensureDeliveryModeCompatibility(
			reorderableItems[0].categoryId!,
			incomingMode
		);
		if (!compatibility.compatible) {
			const incomingLabel = getTierDeliveryModeLabel(incomingMode);
			const existingLabel = compatibility.existingMode
				? getTierDeliveryModeLabel(compatibility.existingMode)
				: getTierDeliveryModeLabel('instant_auto');
			const shouldReplace = window.confirm(
				`You already have ${existingLabel} item(s) in your cart.\n\n${incomingLabel} items must be checked out separately.\n\nPress OK to clear your cart and continue, or Cancel to keep your current cart.`
			);
			if (!shouldReplace) return;
			cart.clear();
		}

		for (const item of reorderableItems) {
			const quantity = Number(item.quantity || 1);
			cart.addTier(item.categoryId!, Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
		}

		showSuccess('Items added to cart. Redirecting to checkout...');
		goto('/checkout');
	}

	function viewOrderDetails(orderId: string) {
		goto(`/order/${orderId}?fromTab=orders`);
	}
</script>

<div
	class="rounded-[var(--r-md)] border border-[var(--border)]"
	style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
>
	{#if orders.length === 0}
		<div class="p-10 text-center">
			<Clock class="mx-auto mb-3 h-10 w-10" style="color: var(--text-dim);" />
			<p class="text-base font-semibold" style="color: var(--text); font-family: var(--font-head);">
				No orders yet
			</p>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				Your new orders will show up here.
			</p>
		</div>
	{:else}
		<div class="divide-y divide-[var(--border)]">
			{#each orders as order (order.id)}
				<div
					id={`order-${order.id}`}
					class="p-4 sm:p-6 {focusOrderId === order.id ? 'rounded-[var(--r-sm)]' : ''}"
					style={focusOrderId === order.id
						? 'border: 1px solid rgba(5,212,113,0.35); background: rgba(5,212,113,0.06);'
						: undefined}
				>
					<div class="mb-3 flex items-center justify-between gap-4">
						<div class="flex min-w-0 flex-1 items-center">
							{#if getPaymentState(order).tone === 'success'}
								<CheckCircle class="mr-2 h-5 w-5 flex-shrink-0" style="color: var(--primary);" />
							{:else if getPaymentState(order).label === 'Confirming with Monnify'}
								<RefreshCw class="mr-2 h-5 w-5 flex-shrink-0" style="color: var(--link);" />
							{:else}
								<Clock class="mr-2 h-5 w-5 flex-shrink-0" style="color: var(--status-warning);" />
							{/if}
							<div class="min-w-0 flex-1">
								<div
									class="truncate font-semibold"
									style="color: var(--text); font-family: var(--font-head);"
								>
									{getDisplayOrderNumber(order)}
								</div>
								<div class="text-xs sm:text-sm" style="color: var(--text-dim);">
									{formatOrderDate(order)}
								</div>
							</div>
						</div>
						<div class="flex-shrink-0 text-right">
							<div class="font-semibold" style="color: var(--text); font-family: var(--font-head);">
								₦{Number(order.totalAmount || 0).toLocaleString()}
							</div>
							<div class="text-xs sm:text-sm" style="color: var(--text-muted);">
								{getPaymentState(order).label}
							</div>
						</div>
					</div>

					<div class="mb-4 space-y-2">
						{#each getOrderItems(order) as item, index (item.id || item.categoryId || `${order.id}-${index}`)}
							<div
								class="flex items-start justify-between gap-3 text-sm"
								style="color: var(--text-muted);"
							>
								<span class="font-medium">{item.productName || item.type || 'Order item'}</span>
								<span class="text-right text-xs sm:text-sm" style="color: var(--text-dim);">
									Qty {item.quantity || 1}
								</span>
							</div>
						{/each}
					</div>

					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div class="text-xs sm:text-sm" style="color: var(--text-dim);">
							Fulfillment: {getFulfillmentState(order)}
						</div>
						<div class="grid grid-cols-2 gap-2 text-sm sm:flex sm:flex-row sm:text-base">
							{#if isPaymentRecheckable(order)}
								<button
									type="button"
									onclick={() => checkPaymentStatus(order)}
									disabled={checkingPaymentByOrderId[order.id]}
									class="col-span-2 cursor-pointer rounded-full px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-1 sm:px-4 sm:text-sm"
									style="background: rgba(202,219,46,0.12); border: 1px solid rgba(202,219,46,0.32); color: var(--text);"
								>
									{checkingPaymentByOrderId[order.id] ? 'Checking...' : 'Refresh payment'}
								</button>
							{/if}
							<button
								onclick={() => reorderItems(order)}
								data-sveltekit-preload-data="hover"
								class="cursor-pointer rounded-full px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 sm:px-4 sm:text-sm"
								style="background: var(--btn-primary-gradient); border: 1px solid var(--btn-primary-border); color: var(--btn-primary-text);"
							>
								Order Again
							</button>
							<button
								onclick={() => viewOrderDetails(order.id)}
								data-sveltekit-preload-data="hover"
								class="cursor-pointer rounded-full px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 sm:px-4 sm:text-sm"
								style="background: linear-gradient(180deg, rgba(105,109,250,0.18), rgba(170,173,255,0.10)); border: 1px solid rgba(170,173,255,0.25); color: var(--text);"
							>
								View Details
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
