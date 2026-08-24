<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import {
		ArrowLeft,
		User,
		Mail,
		Calendar,
		Package,
		CreditCard,
		Send,
		MessageCircle,
		Phone,
		Copy,
		CheckCircle,
		Clock,
		AlertTriangle,
		X,
		RefreshCw,
		Download,
		Eye,
		EyeOff,
		ExternalLink
	} from '$lib/icons';
	import { updateOrderStatus, processOrderDelivery, addOrderNote } from '$lib/services/orders';
	import { addToast } from '$lib/stores/toasts';
	import type { OrderMetadata, OrderItemWithDetails } from '$lib/services/orders';
	import { formatPrice } from '$lib/helpers/utils';
	import { ADMIN_MONEY_VISIBILITY_KEY, formatAdminMoney } from '$lib/helpers/admin-money';
	import {
		buildCredentialPlainText,
		getCanonicalCredentialEntries
	} from '$lib/helpers/credential-contract';
	import { normalizeAccountStatus } from '$lib/helpers/account-status';

	// Props from load function
	interface Props {
		data: {
			order: OrderMetadata;
			items: OrderItemWithDetails[];
			orderedItems?: Array<{ tierName: string; platformName: string; quantity: number }>;
			error: string | null;
			canViewRevenue?: boolean;
			canViewOrderAmounts?: boolean;
			adminRole?: string;
		};
	}

	let { data }: Props = $props();
	// Order detail shows per-order amounts (what the buyer paid) — visible to the
	// assistant so she can process refunds. Not gated on canViewRevenue.
	const canViewOrderAmounts = Boolean(data.canViewOrderAmounts);
	let hideMonetaryAmounts = $state(false);

	let order = $state(data.order);
	let items = $state<OrderItemWithDetails[]>(data.items);
	const orderedItems = $derived(data.orderedItems || []);
	const isBoostingOrder = $derived(
		Array.isArray(
			(order as unknown as { orderItems?: Array<{ boostTargetUrl?: string | null }> }).orderItems
		) &&
			(
				order as unknown as { orderItems: Array<{ boostTargetUrl?: string | null }> }
			).orderItems.some((item) => Boolean(item.boostTargetUrl))
	);
	let isProcessing = $state(false);
	let showCredentials = $state(false);
	let newNote = $state('');
	let selectedDeliveryMethod = $state<'email' | 'whatsapp' | 'telegram'>('email');
	if (typeof window !== 'undefined') {
		hideMonetaryAmounts = localStorage.getItem(ADMIN_MONEY_VISIBILITY_KEY) === 'true';
	}

	// Helper functions
	function getStatusIcon(status: string) {
		switch (status) {
			case 'completed':
				return CheckCircle;
			case 'processing':
				return Clock;
			case 'failed':
				return X;
			case 'cancelled':
				return X;
			default:
				return AlertTriangle;
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'completed':
				return 'text-[var(--status-success)] bg-[var(--status-success-bg)]';
			case 'processing':
				return 'text-[var(--link)] bg-[var(--bg-elev-2)]';
			case 'pending':
			case 'pending_payment':
				return 'text-[var(--status-warning)] bg-[var(--status-warning-bg)]';
			case 'failed':
				return 'text-[var(--status-error)] bg-[var(--status-error-bg)]';
			case 'cancelled':
				return 'text-[var(--text-muted)] bg-[var(--bg-elev-2)]';
			default:
				return 'text-[var(--status-warning)] bg-[var(--status-warning-bg)]';
		}
	}

	function formatStatusLabel(status: string) {
		return String(status || '')
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	function getDisplayOrderId(id: string): string {
		if (!id) return '';
		if (id.length <= 18) return id;
		return `${id.slice(0, 8)}...${id.slice(-6)}`;
	}

	function formatDeliveryMethod(method: string) {
		switch (method) {
			case 'whatsapp':
				return 'WhatsApp';
			case 'telegram':
				return 'Telegram';
			case 'email':
				return 'Email';
			default:
				return 'Email';
		}
	}

	function formatAdminAmount(amount: number): string {
		return formatAdminMoney(amount, {
			canView: canViewOrderAmounts,
			hideMonetaryAmounts,
			format: formatPrice
		});
	}

	function formatDateTime(value: string | Date | null | undefined): string {
		if (!value) return 'N/A';
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return 'N/A';
		return date.toLocaleString();
	}

	function getAccountStatus(item: OrderItemWithDetails): string {
		const status = normalizeAccountStatus(item.account_status);
		return status || 'allocated';
	}

	function getAccountStatusColor(status: string): string {
		switch (status) {
			case 'delivered':
			case 'completed':
			case 'sold':
				return 'text-[var(--status-success)] bg-[var(--status-success-bg)]';
			case 'reserved':
			case 'processing':
				return 'text-[var(--status-warning)] bg-[var(--status-warning-bg)]';
			case 'failed':
			case 'retired':
			case 'unavailable':
				return 'text-[var(--status-error)] bg-[var(--status-error-bg)]';
			case 'assigned':
			case 'allocated':
				return 'text-[var(--link)] bg-[var(--bg-elev-2)]';
			default:
				return 'text-[var(--text-muted)] bg-[var(--bg-elev-2)]';
		}
	}

	function buildAccountLogText(item: OrderItemWithDetails): string {
		const status = getAccountStatus(item);
		return buildCredentialPlainText(
			{
				username: item.account_username,
				password: item.account_password,
				email: item.account_email,
				emailPassword: item.account_email_password,
				twoFa: item.account_two_fa,
				linkUrl: item.account_link_url,
				deliveryNotes: item.account_delivery_notes,
				credentialExtras: item.account_credential_extras || {}
			},
			{
				footerLines: [
					`Status: ${status}`,
					`Created At: ${item.account_created_at ? formatDateTime(item.account_created_at) : ''}`,
					`Delivered At: ${item.account_delivered_at ? formatDateTime(item.account_delivered_at) : ''}`,
					`Platform: ${item.platform_name || ''}`,
					`Tier: ${item.tier_name || ''}`
				]
			}
		);
	}

	// Actions
	async function updateStatus(
		newStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
	) {
		if (isProcessing) return;

		// Cancelling a PAID order: offer to refund it to store credit in the same step.
		if (
			newStatus === 'cancelled' &&
			order.paymentStatus === 'paid' &&
			String(order.status) !== 'refunded' &&
			String(order.status) !== 'completed'
		) {
			const amount = Number(order.total_amount || 0);
			const doRefund = confirm(
				`This order was paid ₦${amount.toLocaleString()}.\n\nOK = refund it to the buyer's store credit (recommended).\nCancel = cancel the order WITHOUT a refund.`
			);
			if (doRefund) {
				await refundOrder();
				return;
			}
		}

		isProcessing = true;
		try {
			const result = await updateOrderStatus(order.id, newStatus);
			if (result.error) {
				addToast({
					type: 'error',
					title: 'Failed to update order status',
					message: result.error,
					duration: 4000
				});
			} else {
				order = { ...order, status: newStatus };
				addToast({
					type: 'success',
					title: 'Order status updated',
					duration: 3000
				});
			}
		} catch (error) {
			console.error('Failed to update order status:', error);
			addToast({
				type: 'error',
				title: 'Failed to update order status',
				duration: 3000
			});
		} finally {
			isProcessing = false;
		}
	}

	// Owner-only: mark a pending order paid and allocate its logs to the buyer's
	// profile, WITHOUT counting as revenue. Used to self-offload specific logs.
	async function releaseToProfile() {
		if (isProcessing) return;
		if (
			!confirm(
				"Release this order's logs to the buyer's profile as PAID, with NO revenue counted? This allocates real inventory."
			)
		)
			return;

		isProcessing = true;
		try {
			const res = await fetch(`/api/orders/${order.id}/release-to-profile`, { method: 'POST' });
			const result = await res.json();
			if (!res.ok || !result.success) {
				addToast({
					type: 'error',
					title: 'Release failed',
					message: result.error || 'Unknown error',
					duration: 4000
				});
			} else {
				addToast({
					type: 'success',
					title: 'Logs released to profile',
					message: 'Marked paid (no revenue) and logs allocated.',
					duration: 3000
				});
				await invalidateAll();
			}
		} catch (error) {
			addToast({
				type: 'error',
				title: 'Release failed',
				message: error instanceof Error ? error.message : 'Unknown error',
				duration: 3000
			});
		} finally {
			isProcessing = false;
		}
	}

	// Cancel-with-refund: returns the paid amount to the buyer as Store Credit.
	// Two-step: the button must be "armed" first (see template) so it can't be
	// triggered by an accidental single click.
	let refundArmed = $state(false);
	async function refundOrder() {
		if (isProcessing) return;
		refundArmed = false;
		isProcessing = true;
		try {
			const res = await fetch(`/api/orders/${order.id}/refund`, { method: 'POST' });
			const result = await res.json();
			if (!res.ok || !result.success) {
				addToast({
					type: 'error',
					title: 'Refund failed',
					message: result.error || 'Unknown error',
					duration: 4000
				});
			} else {
				addToast({
					type: 'success',
					title: 'Refunded to store credit',
					message: `₦${Number(result.refundedAmount || 0).toLocaleString()} credited to the buyer.`,
					duration: 3000
				});
				await invalidateAll();
			}
		} catch (error) {
			addToast({
				type: 'error',
				title: 'Refund failed',
				message: error instanceof Error ? error.message : 'Unknown error',
				duration: 3000
			});
		} finally {
			isProcessing = false;
		}
	}

	// Per-account faulty refund: flag one bad account and refund its unit price to store credit.
	let refundingAccountId = $state<string | null>(null);
	async function refundFaultyAccount(accountId: string | undefined, username: string | undefined) {
		if (!accountId || refundingAccountId) return;
		const reason = prompt(
			`Mark @${username || 'this account'} as faulty and refund the buyer to store credit?\n\nOptional reason (shown in the audit log):`
		);
		if (reason === null) return; // cancelled
		refundingAccountId = accountId;
		try {
			const res = await fetch(`/api/orders/${order.id}/refund-account`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountId, reason })
			});
			const result = await res.json();
			if (!res.ok || !result.success) throw new Error(result.error || 'Refund failed');
			addToast({
				type: 'success',
				title: 'Faulty account refunded',
				message: `₦${Number(result.refundedAmount || 0).toLocaleString()} to store credit.${result.orderFullyRefunded ? ' Order fully refunded.' : ''}`,
				duration: 3500
			});
			// Optimistically reflect the refund so the button hides immediately (the local
			// `items`/`order` are $state copies that invalidateAll can't refresh in place).
			items = items.map((it) => (it.id === accountId ? { ...it, account_status: 'faulty' } : it));
			if (result.orderFullyRefunded) {
				order = { ...order, status: 'refunded', paymentStatus: 'refunded' };
			}
			await invalidateAll();
		} catch (error) {
			addToast({
				type: 'error',
				title: 'Refund failed',
				message: error instanceof Error ? error.message : 'Unknown error',
				duration: 4000
			});
		} finally {
			refundingAccountId = null;
		}
	}

	async function processDelivery() {
		if (isProcessing) return;

		isProcessing = true;
		try {
			const result = await processOrderDelivery(order.id, selectedDeliveryMethod);
			if (result.error) {
				addToast({
					type: 'error',
					title: 'Failed to process delivery',
					message: result.error,
					duration: 4000
				});
			} else {
				addToast({
					type: 'success',
					title: 'Delivery initiated successfully!',
					duration: 3000
				});
				order = { ...order, deliveryStatus: 'delivered' };
			}
		} catch (error) {
			console.error('Failed to process delivery:', error);
			addToast({
				type: 'error',
				title: 'Failed to process delivery',
				duration: 3000
			});
		} finally {
			isProcessing = false;
		}
	}

	async function addNote() {
		if (!newNote.trim() || isProcessing) return;

		isProcessing = true;
		try {
			const result = await addOrderNote(order.id, newNote.trim());
			if (result.error) {
				addToast({
					type: 'error',
					title: 'Failed to add note',
					message: result.error,
					duration: 4000
				});
			} else {
				// Update order metadata with new note
				const currentNotes = order.metadata?.notes || [];
				order.metadata = {
					...order.metadata,
					notes: [
						...currentNotes,
						{
							note: newNote.trim(),
							created_at: new Date().toISOString(),
							author: 'Admin'
						}
					]
				};
				newNote = '';
				addToast({
					type: 'success',
					title: 'Note added successfully',
					duration: 3000
				});
			}
		} catch (error) {
			console.error('Failed to add note:', error);
			addToast({
				type: 'error',
				title: 'Failed to add note',
				duration: 3000
			});
		} finally {
			isProcessing = false;
		}
	}

	function copyToClipboard(text: string) {
		navigator.clipboard
			.writeText(text)
			.then(() => {
				addToast({
					type: 'success',
					title: 'Copied to clipboard!',
					duration: 2000
				});
			})
			.catch(() => {
				addToast({
					type: 'error',
					title: 'Failed to copy to clipboard',
					duration: 3000
				});
			});
	}

	function goBack() {
		goto('/admin/orders');
	}
</script>

<svelte:head>
	<title>Order #{order.id} - Order Details - Admin Panel</title>
</svelte:head>

<div class="admin-order-page min-h-screen p-3 sm:p-6">
	<div class="mx-auto max-w-7xl">
		<!-- Header -->
		<div class="mb-8">
			<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center">
				<div class="flex items-start gap-3 sm:gap-4">
					<button
						onclick={goBack}
						class="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] transition-colors hover:bg-[var(--bg-elev-2)]"
					>
						<ArrowLeft class="h-5 w-5" />
					</button>
					<div class="flex-1">
						<div class="mb-2 flex items-center gap-3">
							{#if order}
								{@const StatusIcon = getStatusIcon(order.status)}
								<StatusIcon class="h-6 w-6 {getStatusColor(order.status).split(' ')[0]}" />
								<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text);">
									Order #{getDisplayOrderId(order.id)}
								</h1>
								<span
									class="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium {getStatusColor(
										order.status
									)}"
								>
									{formatStatusLabel(order.status)}
								</span>
							{/if}
						</div>
						<p style="color: var(--text-muted);">
							Placed on {new Date(order.created_at).toLocaleDateString()} at {new Date(
								order.created_at
							).toLocaleTimeString()}
						</p>
					</div>
				</div>

				<!-- Quick Actions -->
				<div class="flex flex-wrap items-center gap-2 sm:gap-3">
					{#if order.status === 'pending' || order.status === 'pending_payment'}
						<button
							onclick={() => updateStatus('processing')}
							disabled={isProcessing}
							class="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700 disabled:opacity-50 sm:px-4 sm:text-sm"
						>
							<Clock class="h-4 w-4" />
							Start Processing
						</button>
						{#if data.adminRole === 'FULL_ADMIN'}
							<button
								onclick={releaseToProfile}
								disabled={isProcessing}
								class="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 sm:px-4 sm:text-sm"
								title="Owner only: mark paid & allocate logs to the buyer, excluded from revenue"
							>
								Release logs to my profile
							</button>
						{/if}
					{/if}

					{#if order.status === 'processing'}
						<button
							onclick={processDelivery}
							disabled={isProcessing}
							class="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs text-white hover:bg-green-700 disabled:opacity-50 sm:px-4 sm:text-sm"
						>
							<Send class="h-4 w-4" />
							Deliver Now
						</button>
					{/if}

					{#if order.status !== 'completed' && order.status !== 'cancelled'}
						<button
							onclick={() => updateStatus('completed')}
							disabled={isProcessing}
							class="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs text-white hover:bg-green-700 disabled:opacity-50 sm:px-4 sm:text-sm"
						>
							<CheckCircle class="h-4 w-4" />
							Mark Complete
						</button>
					{/if}

					<!-- Refund: only while payment is received but the order is NOT yet
					     completed/delivered (hard-blocked once completed). Two-step to
					     avoid accidental clicks. -->
					{#if order.paymentStatus === 'paid' && String(order.status) !== 'completed' && String(order.status) !== 'refunded'}
						{#if refundArmed}
							<button
								onclick={refundOrder}
								disabled={isProcessing}
								class="flex items-center gap-2 rounded-lg border border-rose-500 bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 sm:px-4 sm:text-sm"
								title="Confirm: refund the paid amount to the buyer's store credit"
							>
								<RefreshCw class="h-4 w-4" />
								Confirm refund
							</button>
							<button
								onclick={() => (refundArmed = false)}
								disabled={isProcessing}
								class="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elev-2)] disabled:opacity-50 sm:px-4 sm:text-sm"
							>
								Cancel
							</button>
						{:else}
							<button
								onclick={() => (refundArmed = true)}
								disabled={isProcessing}
								class="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 sm:px-4 sm:text-sm"
								title="Refund the paid amount to the buyer's store credit"
							>
								<RefreshCw class="h-4 w-4" />
								Refund to store credit
							</button>
						{/if}
					{:else if String(order.status) === 'refunded' || String(order.paymentStatus) === 'refunded'}
						<span
							class="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold sm:px-4 sm:text-sm"
							style="border-color: var(--status-success-border); background: var(--status-success-bg); color: var(--status-success);"
							title="This order was refunded to the buyer's store credit"
						>
							<CheckCircle class="h-4 w-4" />
							Refunded to store credit
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Error Display -->
		{#if data.error}
			<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
				<div class="flex items-center">
					<AlertTriangle class="mr-2 h-5 w-5 text-red-600" />
					<p class="text-red-800">{data.error}</p>
				</div>
			</div>
		{/if}

		<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
			<!-- Main Content -->
			<div class="space-y-6 lg:col-span-2">
				<!-- Order Summary -->
				<div class="rounded-lg border border-[var(--border)] bg-[var(--bg-elev-1)] p-6 shadow-sm">
					<h2 class="mb-4 text-lg font-semibold text-[var(--text)]">Order Summary</h2>
					<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
						<div>
							<div class="mb-2 flex items-center">
								<Package class="mr-2 h-4 w-4 text-[var(--text-dim)]" />
								<span class="text-sm font-medium text-[var(--text-muted)]">Items</span>
							</div>
							<p class="text-2xl font-bold text-[var(--text)]">{order.item_count}</p>
							<p class="text-sm text-[var(--text-muted)]">
								{isBoostingOrder ? 'boost quantity' : 'accounts ordered'}
							</p>
						</div>
						<div>
							<div class="mb-2 flex items-center">
								<CreditCard class="mr-2 h-4 w-4 text-[var(--text-dim)]" />
								<span class="text-sm font-medium text-[var(--text-muted)]">Net Sale</span>
							</div>
							<p class="text-2xl font-bold" style="color: var(--text);">
								{formatAdminAmount(Number(order.net_sale_amount || 0))}
							</p>
							<p class="text-sm text-[var(--text-muted)]">
								{#if Number(order.refunded_amount || 0) > 0}
									{formatAdminAmount(Number(order.refunded_amount))} refunded from
									{formatAdminAmount(Number(order.total_amount || 0))}
								{:else if order.payment_id}
									Payment ID: {order.payment_id}
								{:else}
									No payment ID
								{/if}
							</p>
						</div>
						<div>
							<div class="mb-2 flex items-center">
								<Calendar class="mr-2 h-4 w-4 text-[var(--text-dim)]" />
								<span class="text-sm font-medium text-[var(--text-muted)]">Order Date</span>
							</div>
							<p class="text-lg font-bold text-[var(--text)]">
								{new Date(order.created_at).toLocaleDateString()}
							</p>
							<p class="text-sm text-[var(--text-muted)]">
								{new Date(order.created_at).toLocaleTimeString()}
							</p>
						</div>
					</div>
				</div>

				<!-- Items Ordered (what was sold) — always shown, even with 0 accounts -->
				{#if orderedItems.length > 0}
					<div class="rounded-lg border border-[var(--border)] bg-[var(--bg-elev-1)] shadow-sm">
						<div class="border-b border-[var(--border)] px-6 py-4">
							<h2 class="text-lg font-semibold text-[var(--text)]">Items Ordered</h2>
						</div>
						<div class="divide-y divide-[var(--border)]">
							{#each orderedItems as ordered}
								<div class="flex items-center justify-between px-6 py-3">
									<div class="min-w-0">
										<div class="truncate text-sm font-semibold text-[var(--text)]">
											{ordered.tierName}
										</div>
										{#if ordered.platformName}
											<div class="truncate text-xs text-[var(--text-muted)]">
												{ordered.platformName}
											</div>
										{/if}
									</div>
									<div class="text-sm font-medium text-[var(--text-muted)]">
										×{ordered.quantity}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Allocated Accounts -->
				<div class="rounded-lg border border-[var(--border)] bg-[var(--bg-elev-1)] shadow-sm">
					<div class="border-b border-[var(--border)] px-6 py-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h2 class="text-lg font-semibold text-[var(--text)]">Allocated Accounts</h2>
							<div class="flex items-center gap-3">
								{#if items.length > 0}
									<button
										onclick={() => (showCredentials = !showCredentials)}
										class="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-elev-2)]"
									>
										{#if showCredentials}
											<EyeOff class="h-4 w-4" />
											Hide Credentials
										{:else}
											<Eye class="h-4 w-4" />
											Show Credentials
										{/if}
									</button>
								{/if}
								<span class="text-sm text-[var(--text-muted)]">
									{items.length} accounts
								</span>
							</div>
						</div>
					</div>

					{#if isBoostingOrder}
						<div class="p-12 text-center">
							<Package class="mx-auto mb-4 h-12 w-12 text-[var(--text-dim)]" />
							<h3 class="mb-2 text-lg font-medium text-[var(--text)]">This is a boosting order</h3>
							<p class="mb-4 text-[var(--text-muted)]">
								No accounts to allocate — manage the link and fulfillment status from the Boosting
								Orders queue.
							</p>
							<a
								href="/admin/boosting-orders"
								class="inline-flex items-center gap-2 rounded-full bg-[var(--bg-elev-2)] px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
							>
								Go to Boosting Orders
							</a>
						</div>
					{:else if items.length === 0}
						<div class="p-12 text-center">
							<Package class="mx-auto mb-4 h-12 w-12 text-[var(--text-dim)]" />
							<h3 class="mb-2 text-lg font-medium text-[var(--text)]">No accounts allocated</h3>
							<p class="text-[var(--text-muted)]">
								Accounts will be allocated when the order is processed.
							</p>
						</div>
					{:else}
						<div class="space-y-3 p-3 lg:hidden">
							{#each items as item}
								{@const accountStatus = getAccountStatus(item)}
								{@const credentialEntries = getCanonicalCredentialEntries({
									username: item.account_username,
									password: item.account_password,
									email: item.account_email,
									emailPassword: item.account_email_password,
									twoFa: item.account_two_fa,
									linkUrl: item.account_link_url,
									deliveryNotes: item.account_delivery_notes,
									credentialExtras: item.account_credential_extras || {}
								})}
								<div class="rounded-lg border border-[var(--border)] p-3">
									<div class="mb-2 flex items-start justify-between gap-2">
										<div class="min-w-0">
											<div class="truncate text-sm font-semibold text-[var(--text)]">
												@{item.account_username || 'N/A'}
											</div>
											<div class="truncate text-xs text-[var(--text-muted)]">
												{item.account_email || 'No email'}
											</div>
										</div>
										<span
											class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium {getAccountStatusColor(
												accountStatus
											)}"
										>
											{formatStatusLabel(accountStatus)}
										</span>
									</div>
									<div
										class="mb-3 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]"
									>
										<span>{item.platform_name} · {item.tier_name}</span>
										{#if getAccountStatus(item) === 'faulty'}
											<span class="text-[11px] font-medium text-amber-500">Refunded (faulty)</span>
										{:else}
											<button
												onclick={() => refundFaultyAccount(item.id, item.account_username)}
												disabled={refundingAccountId === item.id}
												class="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
											>
												{refundingAccountId === item.id ? 'Refunding…' : 'Mark faulty & refund'}
											</button>
										{/if}
									</div>

									{#if showCredentials}
										<div
											class="mb-3 space-y-1 rounded border border-[var(--border)] bg-[var(--bg-elev-2)] p-2 font-mono text-xs"
										>
											{#if credentialEntries.length === 0}
												<div class="text-[11px] text-[var(--text-muted)]">
													No credential fields found.
												</div>
											{:else}
												{#each credentialEntries as entry}
													<div>
														<span class="font-semibold">{entry.label}:</span>
														{#if entry.isUrl && entry.href}
															<a
																href={entry.href}
																target="_blank"
																rel="noopener noreferrer"
																class="ml-1 inline-flex items-center gap-1 underline"
																style="color: var(--link);"
															>
																{entry.value}
																<ExternalLink class="h-3 w-3" />
															</a>
														{:else}
															<span>{entry.value}</span>
														{/if}
													</div>
												{/each}
											{/if}
											<div>
												<span class="font-semibold">Added:</span>
												{formatDateTime(item.account_created_at)}
											</div>
											{#if item.account_delivered_at}
												<div>
													<span class="font-semibold">Delivered:</span>
													{formatDateTime(item.account_delivered_at)}
												</div>
											{/if}
										</div>
									{:else}
										<div
											class="mb-3 rounded border border-[var(--border)] bg-[var(--bg-elev-2)] p-2"
										>
											<div class="text-[11px] text-[var(--text-muted)]">Password</div>
											<div class="font-mono text-xs break-all text-[var(--text)]">
												{item.account_password || 'No password'}
											</div>
										</div>
									{/if}

									<button
										onclick={() => copyToClipboard(buildAccountLogText(item))}
										class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-1 text-xs font-semibold text-[var(--link)]"
										title="Copy account details"
									>
										<Copy class="h-3.5 w-3.5" />
										Copy
									</button>
								</div>
							{/each}
						</div>

						<div class="hidden overflow-x-auto lg:block">
							<table class="min-w-full divide-y divide-[var(--border)]">
								<thead class="bg-[var(--bg-elev-2)]">
									<tr>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase"
										>
											Account
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase"
										>
											Platform/Tier
										</th>
										{#if showCredentials}
											<th
												class="px-6 py-3 text-left text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase"
											>
												Credentials Log
											</th>
										{/if}
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase"
										>
											Status
										</th>
										{#if showCredentials}
											<th
												class="px-6 py-3 text-left text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase"
											>
												Timeline
											</th>
										{/if}
										<th
											class="px-6 py-3 text-right text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase"
										>
											Actions
										</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-[var(--border)] bg-[var(--bg-elev-1)]">
									{#each items as item}
										{@const accountStatus = getAccountStatus(item)}
										{@const credentialEntries = getCanonicalCredentialEntries({
											username: item.account_username,
											password: item.account_password,
											email: item.account_email,
											emailPassword: item.account_email_password,
											twoFa: item.account_two_fa,
											linkUrl: item.account_link_url,
											deliveryNotes: item.account_delivery_notes,
											credentialExtras: item.account_credential_extras || {}
										})}
										<tr class="hover:bg-[var(--bg-elev-2)]">
											<td class="px-6 py-4 whitespace-nowrap">
												<div>
													<div class="text-sm font-medium text-[var(--text)]">
														@{item.account_username || 'N/A'}
													</div>
													<div class="text-sm text-[var(--text-muted)]">
														{item.account_email || 'No email'}
													</div>
												</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<div>
													<div class="text-sm font-medium text-[var(--text)]">
														{item.platform_name}
													</div>
													<div class="text-sm text-[var(--text-muted)]">
														{item.tier_name}
													</div>
												</div>
											</td>
											{#if showCredentials}
												<td class="px-6 py-4 align-top">
													<div
														class="space-y-1 rounded border border-[var(--border)] bg-[var(--bg-elev-2)] p-2 font-mono text-xs"
													>
														{#if credentialEntries.length === 0}
															<div class="text-[11px] text-[var(--text-muted)]">
																No credential fields found.
															</div>
														{:else}
															{#each credentialEntries as entry}
																<div>
																	<span class="font-semibold">{entry.label}:</span>
																	{#if entry.isUrl && entry.href}
																		<a
																			href={entry.href}
																			target="_blank"
																			rel="noopener noreferrer"
																			class="inline-flex items-center gap-1 underline"
																			style="color: var(--link);"
																		>
																			{entry.value}
																			<ExternalLink class="h-3 w-3" />
																		</a>
																	{:else}
																		<span>{entry.value}</span>
																	{/if}
																</div>
															{/each}
														{/if}
													</div>
												</td>
											{/if}
											<td class="px-6 py-4 align-top whitespace-nowrap">
												<span
													class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getAccountStatusColor(
														accountStatus
													)}"
												>
													{formatStatusLabel(accountStatus)}
												</span>
											</td>
											{#if showCredentials}
												<td class="px-6 py-4 align-top text-xs text-[var(--text-muted)]">
													<div>Added: {formatDateTime(item.account_created_at)}</div>
													{#if item.account_delivered_at}
														<div class="mt-1">
															Delivered: {formatDateTime(item.account_delivered_at)}
														</div>
													{/if}
												</td>
											{/if}
											<td class="px-6 py-4 text-right text-sm font-medium whitespace-nowrap">
												<div class="inline-flex items-center gap-3">
													{#if accountStatus === 'faulty'}
														<span class="text-[11px] font-medium text-amber-500">Refunded</span>
													{:else}
														<button
															onclick={() => refundFaultyAccount(item.id, item.account_username)}
															disabled={refundingAccountId === item.id}
															class="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
															title="Mark faulty & refund to store credit"
														>
															{refundingAccountId === item.id ? '…' : 'Faulty & refund'}
														</button>
													{/if}
													<button
														onclick={() => copyToClipboard(buildAccountLogText(item))}
														class="text-[var(--link)] hover:text-[var(--link)]"
														title="Copy account details"
													>
														<Copy class="h-4 w-4" />
													</button>
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			</div>

			<!-- Sidebar -->
			<div class="space-y-6">
				<!-- Customer Information -->
				<div class="rounded-lg border border-[var(--border)] bg-[var(--bg-elev-1)] p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold text-[var(--text)]">Customer Information</h3>
					<div class="space-y-4">
						<div class="flex items-center">
							<User class="mr-3 h-4 w-4 text-[var(--text-dim)]" />
							<div>
								<p class="text-sm font-medium text-[var(--text)]">
									{order.customer_name || 'No name provided'}
								</p>
								<p class="text-xs text-[var(--text-muted)]">Customer Name</p>
							</div>
						</div>
						<div class="flex items-center">
							<Mail class="mr-3 h-4 w-4 text-[var(--text-dim)]" />
							<div>
								<p class="text-sm font-medium text-[var(--text)]">{order.customer_email}</p>
								<p class="text-xs text-[var(--text-muted)]">Email Address</p>
							</div>
						</div>
						{#if order.metadata?.customer_phone}
							<div class="flex items-center">
								<Phone class="mr-3 h-4 w-4 text-[var(--text-dim)]" />
								<div>
									<p class="text-sm font-medium text-[var(--text)]">
										{order.metadata.customer_phone}
									</p>
									<p class="text-xs text-[var(--text-muted)]">Phone Number</p>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Affiliate Information -->
				{#if order.affiliateCode}
					<div class="rounded-lg border border-[var(--border)] bg-[var(--bg-elev-1)] p-6 shadow-sm">
						<h3 class="mb-4 text-lg font-semibold text-[var(--text)]">Affiliate Information</h3>
						<div class="space-y-4">
							<div class="flex items-center justify-between rounded-lg bg-[var(--bg-elev-2)] p-3">
								<span class="text-sm font-medium text-[var(--text-muted)]"
									>Affiliate Promo Code</span
								>
								<a
									href="/admin/affiliates?code={order.affiliateCode}"
									class="font-mono text-sm font-semibold text-[var(--link)] transition-colors hover:text-[var(--link)]"
								>
									{order.affiliateCode}
								</a>
							</div>
							{#if order.affiliateUserId}
								<div class="flex items-center justify-between rounded-lg bg-[var(--bg-elev-2)] p-3">
									<span class="text-sm font-medium text-[var(--text-muted)]">Referred By</span>
									<a
										href="/admin/affiliates/{order.affiliateUserId}"
										class="text-sm font-medium text-[var(--link)] transition-colors hover:text-[var(--link)]"
									>
										View Affiliate
									</a>
								</div>
							{/if}
							<div class="flex items-center justify-between rounded-lg bg-green-50 p-3">
								<span class="text-sm font-medium text-[var(--text-muted)]">Store Credit Award</span>
								<span class="text-sm font-bold text-green-600"> Tracked in affiliate ledger </span>
							</div>
						</div>
					</div>
				{/if}

				<!-- Delivery Management -->
				<div class="rounded-lg border border-[var(--border)] bg-[var(--bg-elev-1)] p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold text-[var(--text)]">Delivery Management</h3>

					<div class="space-y-4">
						<div>
							<label
								for="delivery-method"
								class="mb-2 block text-sm font-medium text-[var(--text-muted)]"
							>
								Delivery Method
							</label>
							<select
								id="delivery-method"
								bind:value={selectedDeliveryMethod}
								class="w-full rounded-lg border border-[var(--border)] px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
							>
								<option value="email">Email</option>
								<option value="whatsapp">WhatsApp</option>
								<option value="telegram">Telegram</option>
							</select>
						</div>

						<button
							onclick={processDelivery}
							disabled={isProcessing || order.status === 'completed'}
							class="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if isProcessing}
								<RefreshCw class="h-4 w-4 animate-spin" />
								Processing...
							{:else}
								<Send class="h-4 w-4" />
								Send via {formatDeliveryMethod(selectedDeliveryMethod)}
							{/if}
						</button>
					</div>
				</div>

				<!-- Order Status Management -->
				<div class="rounded-lg border border-[var(--border)] bg-[var(--bg-elev-1)] p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold text-[var(--text)]">Status Management</h3>

					<div class="space-y-3">
						{#if order.status === 'pending' || order.status === 'pending_payment'}
							<button
								onclick={() => updateStatus('processing')}
								disabled={isProcessing}
								class="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
							>
								<Clock class="h-4 w-4" />
								Start Processing
							</button>
						{/if}

						{#if order.status !== 'completed' && order.status !== 'cancelled'}
							<button
								onclick={() => updateStatus('completed')}
								disabled={isProcessing}
								class="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
							>
								<CheckCircle class="h-4 w-4" />
								Mark as Completed
							</button>
						{/if}

						{#if order.status !== 'cancelled' && order.status !== 'completed'}
							<button
								onclick={() => updateStatus('cancelled')}
								disabled={isProcessing}
								class="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
							>
								<X class="h-4 w-4" />
								Cancel Order
							</button>
						{/if}
					</div>
				</div>

				<!-- Order Notes -->
				<div class="rounded-lg border border-[var(--border)] bg-[var(--bg-elev-1)] p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold text-[var(--text)]">Order Notes</h3>

					<!-- Add Note -->
					<div class="mb-4">
						<textarea
							bind:value={newNote}
							placeholder="Add a note about this order..."
							class="w-full resize-none rounded-lg border border-[var(--border)] px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
							rows="3"
						></textarea>
						<button
							onclick={addNote}
							disabled={!newNote.trim() || isProcessing}
							class="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--bg-elev-2)] px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
						>
							Add Note
						</button>
					</div>

					<!-- Notes List -->
					<div class="max-h-60 space-y-3 overflow-y-auto">
						{#if order.metadata?.notes && order.metadata.notes.length > 0}
							{#each order.metadata.notes as note}
								<div class="rounded-lg bg-[var(--bg-elev-2)] p-3">
									<p class="text-sm text-[var(--text)]">
										{typeof note === 'string' ? note : note.note}
									</p>
									<div
										class="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]"
									>
										<span>{typeof note === 'string' ? 'Admin' : note.author || 'Admin'}</span>
										<span>
											{typeof note === 'string'
												? 'No date'
												: new Date(note.created_at).toLocaleDateString()}
										</span>
									</div>
								</div>
							{/each}
						{:else}
							<p class="py-4 text-center text-sm text-[var(--text-muted)]">No notes yet</p>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	:global(.admin-order-page) {
		background: var(--bg);
	}

	:global(.admin-order-page code) {
		background: var(--bg-elev-2) !important;
		color: var(--text) !important;
		border: 1px solid var(--border);
	}

	@media (max-width: 767px) {
		:global(.admin-order-page .p-12) {
			padding: 1rem !important;
		}
	}
</style>
