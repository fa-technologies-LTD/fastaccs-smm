<script lang="ts">
	import { goto } from '$app/navigation';
	import { CheckCircle, Clock, XCircle, Copy, ExternalLink } from '$lib/icons';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import NumbersOtpCard from '$lib/components/NumbersOtpCard.svelte';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import {
		formatDate,
		formatPrice,
		formatOrderRef,
		copyToClipboard,
		copyAllAccounts
	} from '$lib/helpers/utils';
	import { getCanonicalCredentialEntries } from '$lib/helpers/credential-contract';
	import {
		DEFAULT_LOGIN_GUIDE_LABEL,
		DEFAULT_LOGIN_GUIDE_URL,
		getTierDeliveryConfig
	} from '$lib/helpers/tier-delivery-config';
	import { buildWhatsAppSupportLink } from '$lib/helpers/whatsapp';
	import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';
	import { BOOSTING_TURNAROUND_MESSAGE } from '$lib/helpers/boosting-service-config';

	let { data }: { data: PageData } = $props();
	let boostLinkDraftByItemId = $state<Record<string, string>>({});
	let boostLinkOverrideByItemId = $state<Record<string, string>>({});
	let boostStatusOverrideByItemId = $state<Record<string, string>>({});
	let savingBoostLinkItemId = $state<string | null>(null);

	function normalizeLower(value: string | null | undefined): string {
		return String(value || '')
			.trim()
			.toLowerCase();
	}

	function getPaymentState(
		status: string,
		paymentStatus: string
	): {
		label: string;
		tone: 'success' | 'pending' | 'failure';
	} {
		const orderStatus = normalizeLower(status);
		const payment = normalizeLower(paymentStatus);

		if (isOrderPaymentConfirmed({ status: orderStatus, paymentStatus: payment })) {
			return { label: 'Payment Confirmed', tone: 'success' };
		}

		if (
			['failed'].includes(orderStatus) ||
			['failed', 'rejected', 'rejected_payment', 'reversed'].includes(payment)
		) {
			return { label: 'Payment Failed', tone: 'failure' };
		}

		if (orderStatus === 'refunded' || payment === 'refunded') {
			return { label: 'Refunded', tone: 'failure' };
		}

		if (
			['cancelled', 'abandoned', 'expired'].includes(orderStatus) ||
			['cancelled', 'canceled', 'abandoned', 'expired', 'user_cancelled'].includes(payment)
		) {
			return { label: 'Payment Cancelled', tone: 'failure' };
		}

		if (orderStatus === 'pending_payment') {
			if (payment === 'processing') return { label: 'Confirming with Monnify', tone: 'pending' };
			return { label: 'Awaiting Payment', tone: 'pending' };
		}

		return { label: 'Awaiting Payment', tone: 'pending' };
	}

	function getFulfillmentState(
		status: string,
		deliveryStatus: string,
		paymentTone: 'success' | 'pending' | 'failure'
	): string {
		const orderStatus = normalizeLower(status);
		const delivery = normalizeLower(deliveryStatus);

		if (orderStatus === 'refunded' || delivery === 'refunded') return 'Refunded';

		if (paymentTone !== 'success') {
			return 'Not Started';
		}

		if (delivery === 'delivered' || orderStatus === 'completed') return 'Completed';
		if (delivery === 'processing' || orderStatus === 'processing') return 'Processing';
		if (delivery === 'failed') return 'Failed';
		return 'Processing';
	}

	function getStatusColorFromTone(tone: 'success' | 'pending' | 'failure') {
		switch (tone) {
			case 'success':
				return 'status-success';
			case 'pending':
				return 'status-warning';
			case 'failure':
				return 'status-error';
		}
	}

	// Show guidance only when it's actually relevant, so refunded/failed orders aren't cluttered
	// with account-care tips for a product that was never delivered.
	const paymentState = $derived(getPaymentState(data.order.status, data.order.paymentStatus));
	const fulfillmentLabel = $derived(
		getFulfillmentState(data.order.status, data.order.deliveryStatus, paymentState.tone)
	);
	const orderDelivered = $derived(fulfillmentLabel === 'Completed');
	const isPhoneOrder = $derived(data.order.orderType === 'phone');
	const displayOrderNumber = $derived(formatOrderRef(data.order.orderNumber, data.order.id));

	function isManualHandoverItem(item: (typeof data.order.orderItems)[number]): boolean {
		return getTierDeliveryConfig(item.category?.metadata).mode === 'manual_handover';
	}

	function isManualHandoverOrder(): boolean {
		return data.order.orderItems.some(isManualHandoverItem);
	}

	function isBoostingItem(item: (typeof data.order.orderItems)[number]): boolean {
		return Boolean(item.boostTargetUrl);
	}

	function isBoostingOrder(): boolean {
		return data.order.orderItems.some(isBoostingItem);
	}

	function getBoostingStatus(item: (typeof data.order.orderItems)[number]): string {
		return boostStatusOverrideByItemId[item.id] || item.boostFulfillmentStatus || 'pending';
	}

	function getBoostingTargetUrl(item: (typeof data.order.orderItems)[number]): string {
		return boostLinkOverrideByItemId[item.id] || item.boostTargetUrl || '';
	}

	function getBoostingStatusLabel(item: (typeof data.order.orderItems)[number]): string {
		const status = getBoostingStatus(item);
		if (status === 'completed') return 'Completed';
		if (status === 'in_progress') return 'In Progress';
		if (status === 'needs_link') return 'Update Link';
		if (status === 'rejected') return 'Needs Support';
		return 'Pending';
	}

	async function saveBoostingLink(item: (typeof data.order.orderItems)[number]) {
		if (savingBoostLinkItemId) return;
		const targetUrl = (boostLinkDraftByItemId[item.id] || getBoostingTargetUrl(item)).trim();
		if (!targetUrl) {
			addToast({ type: 'error', title: 'Enter the new link', message: '', duration: 3000 });
			return;
		}

		savingBoostLinkItemId = item.id;
		try {
			const response = await fetch(
				`/api/orders/${encodeURIComponent(data.order.id)}/boosting-link/${encodeURIComponent(item.id)}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ targetUrl })
				}
			);
			const result = await response.json();
			if (!response.ok || !result.success) throw new Error(result.error || 'Could not update link');
			boostLinkOverrideByItemId = {
				...boostLinkOverrideByItemId,
				[item.id]: result.data.targetUrl
			};
			boostStatusOverrideByItemId = { ...boostStatusOverrideByItemId, [item.id]: 'pending' };
			addToast({
				type: 'success',
				title: 'Link updated',
				message: 'Your boost is back in the queue.',
				duration: 3500
			});
		} catch (error) {
			addToast({
				type: 'error',
				title: 'Could not update link',
				message: error instanceof Error ? error.message : 'Please try again.',
				duration: 4000
			});
		} finally {
			savingBoostLinkItemId = null;
		}
	}

	function getItemLoginGuide(item: (typeof data.order.orderItems)[number]): {
		url: string;
		label: string;
	} {
		const config = getTierDeliveryConfig(item.category?.metadata);
		return {
			url: config.loginGuideUrl || data.support?.loginGuideFallbackUrl || DEFAULT_LOGIN_GUIDE_URL,
			label: config.loginGuideLabel || DEFAULT_LOGIN_GUIDE_LABEL
		};
	}

	function getManualHandoverLink(): string | null {
		if (!isManualHandoverOrder()) return null;

		const orderLabel = data.order.orderNumber || `ORD-${data.order.id.slice(0, 8).toUpperCase()}`;
		const message = `Hi, I'm sending my payment receipt for order ${orderLabel}.`;
		return buildWhatsAppSupportLink(data.support?.whatsappNumber, message);
	}
</script>

<svelte:head>
	<title>{displayOrderNumber} - FastAccs</title>
	<meta name="description" content="View your order status and account details" />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<Navigation />

<main class="min-h-screen py-8" style="background: var(--bg);">
	<div class="mx-auto max-w-4xl px-4">
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center gap-4">
				<button
					onclick={() =>
						goto(`/dashboard?tab=${data.fromTab || 'orders'}&orderId=${data.order.id}`)}
					style="background: var(--surface); border: 1px solid var(--border); color: var(--link);"
					class="cursor-pointer rounded-lg px-4 py-2 transition-transform hover:scale-101 active:scale-95"
				>
					← Back to Dashboard
				</button>
			</div>
			<h1
				class="mt-4 text-3xl font-bold"
				style="font-family: var(--font-head); color: var(--text);"
			>
				{displayOrderNumber}
			</h1>
			<p style="color: var(--text-muted);">Placed on {formatDate(data.order.createdAt)}</p>
		</div>

		{#if data.phone}
			<NumbersOtpCard phone={data.phone} />
		{/if}

		<div class="grid gap-8 lg:grid-cols-3">
			<!-- Order Details -->
			<div class="lg:col-span-2">
				<!-- The live Numbers card owns the active status once a rental exists. -->
				{#if !data.phone}
					<div
						class="mb-6 rounded-lg p-6"
						style="background: var(--surface); border: 1px solid var(--border);"
					>
						<div class="flex items-center gap-4">
							<div
								class={`status-badge ${getStatusColorFromTone(
									getPaymentState(data.order.status, data.order.paymentStatus).tone
								)}`}
							>
								{#if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'success'}
									<CheckCircle class="h-6 w-6" />
								{:else if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'failure'}
									<XCircle class="h-6 w-6" />
								{:else}
									<Clock class="h-6 w-6" />
								{/if}
							</div>
							<div>
								<h2 class="text-xl font-semibold" style="color: var(--text);">
									{getPaymentState(data.order.status, data.order.paymentStatus).label}
								</h2>
								<p style="color: var(--text-muted);">
									{#if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'success' && isBoostingOrder()}
										{data.order.orderItems.some((item) => getBoostingStatus(item) === 'needs_link')
											? 'Update the link below so we can continue.'
											: data.order.orderItems.some((item) => getBoostingStatus(item) === 'rejected')
												? 'Support is reviewing an issue with this boost.'
												: data.order.orderItems.every(
															(item) => getBoostingStatus(item) === 'completed'
													  )
													? 'Your boost has been completed.'
													: `Payment confirmed. Your boost is being processed. ${BOOSTING_TURNAROUND_MESSAGE}`}
									{:else if isPhoneOrder}
										Your payment is safe. We’re preparing your verification number now.
									{:else if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'success' && data.order.status === 'completed'}
										Your accounts have been successfully allocated and delivered.
									{:else if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'success' && data.order.deliveryMethod === 'whatsapp' && data.order.deliveryStatus === 'processing'}
										Payment confirmed. Manual handover is in progress on WhatsApp.
									{:else if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'pending'}
										Payment not confirmed yet. Credentials are locked.
									{:else if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'failure'}
										Payment did not complete for this order. No account allocation was made.
									{:else}
										Payment is confirmed. We are finalizing your account delivery.
									{/if}
								</p>
								{#if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'success'}
									<div class="mt-2 text-xs sm:text-sm">
										<span style="color: var(--text-dim);">
											Fulfillment: {getFulfillmentState(
												data.order.status,
												data.order.deliveryStatus,
												getPaymentState(data.order.status, data.order.paymentStatus).tone
											)}
										</span>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}

				{#if orderDelivered && !isPhoneOrder && !isManualHandoverOrder() && !isBoostingOrder()}
					<p class="mb-4 text-xs" style="color: var(--text-dim);">
						Test your login soon — issues reported within 2 hours get the fastest support. <a
							href="/support#faq"
							class="hover:underline"
							style="color: var(--link);">Support FAQ</a
						>.
					</p>
				{/if}

				{#if getManualHandoverLink()}
					<a
						href={getManualHandoverLink()}
						target="_blank"
						rel="noopener noreferrer"
						class="mb-6 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-bold transition-all hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]"
						style="background: linear-gradient(180deg, rgba(5, 212, 113, 0.98), rgba(13, 145, 82, 0.98)); border: 1px solid rgba(5, 212, 113, 0.5); color: #04140c;"
					>
						Send receipt on WhatsApp
					</a>
				{/if}

				<!-- Order Items -->
				<div
					class="rounded-lg p-6"
					style="background: var(--surface); border: 1px solid var(--border);"
				>
					<h3 class="mb-4 text-lg font-semibold" style="color: var(--text);">Order Items</h3>
					<div class="space-y-6">
						{#each data.order.orderItems as item}
							<div class="pb-6 last:pb-0" style="border-bottom: 1px solid var(--border);">
								<div class="flex items-start justify-between">
									<div class="flex-1">
										<h4 class="font-medium" style="color: var(--text);">{item.category.name}</h4>
										<p class="text-sm" style="color: var(--text-muted);">
											Quantity: {item.quantity} • {formatPrice(item.unitPrice)} each
										</p>
										<div class="mt-2">
											{#if isBoostingItem(item)}
												<span
													class={`status-badge ${
														getBoostingStatus(item) === 'completed'
															? 'status-success'
															: getBoostingStatus(item) === 'rejected'
																? 'status-error'
																: ['in_progress', 'needs_link'].includes(getBoostingStatus(item))
																	? 'status-warning'
																	: 'status-inactive'
													}`}
												>
													{getBoostingStatusLabel(item)}
												</span>
											{:else if isPhoneOrder}
												<span class="status-badge status-success">Verification number</span>
											{:else if !isManualHandoverItem(item)}
												<span
													class={`status-badge ${
														item.allocationStatus === 'allocated'
															? 'status-success'
															: item.allocationStatus === 'partial'
																? 'status-warning'
																: item.allocationStatus === 'failed'
																	? 'status-error'
																	: 'status-inactive'
													}`}
												>
													{item.allocatedCount} of {item.quantity} allocated
												</span>
											{/if}
										</div>
										{#if isBoostingItem(item)}
											<div
												class="mt-3 rounded-lg border p-3"
												style="border-color: rgba(170, 173, 255, 0.25); background: rgba(170, 173, 255, 0.08);"
											>
												<p class="mb-2 text-xs font-medium" style="color: var(--text);">
													Boost details
												</p>
												{#if getBoostingStatus(item) === 'needs_link'}
													<div
														class="mb-3 rounded-lg border p-3"
														style="border-color: rgba(234,179,8,0.35); background: rgba(234,179,8,0.08);"
													>
														<p class="text-xs font-semibold" style="color: #facc15;">
															Please update this link
														</p>
														{#if item.boostIssueReason}
															<p class="mt-1 text-xs" style="color: var(--text-muted);">
																{item.boostIssueReason}
															</p>
														{/if}
														<div class="mt-2 flex flex-col gap-2 sm:flex-row">
															<input
																type="url"
																value={boostLinkDraftByItemId[item.id] ||
																	getBoostingTargetUrl(item)}
																oninput={(event) =>
																	(boostLinkDraftByItemId[item.id] = event.currentTarget.value)}
																class="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
																style="background: var(--bg); border-color: var(--border); color: var(--text);"
															/>
															<button
																type="button"
																onclick={() => saveBoostingLink(item)}
																disabled={savingBoostLinkItemId === item.id}
																class="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
																style="background: var(--primary); color: #00150b;"
															>
																{savingBoostLinkItemId === item.id ? 'Saving…' : 'Update link'}
															</button>
														</div>
													</div>
												{:else if getBoostingStatus(item) === 'rejected' && item.boostIssueReason}
													<p
														class="mb-3 rounded-lg border p-3 text-xs"
														style="border-color: rgba(248,113,113,0.35); background: rgba(248,113,113,0.08); color: var(--text-muted);"
													>
														{item.boostIssueReason}
													</p>
												{/if}
												<p class="text-xs" style="color: var(--text-muted);">
													{item.boostQuantity?.toLocaleString() ?? '?'}
													{item.category.name} for:
												</p>
												<a
													href={getBoostingTargetUrl(item)}
													target="_blank"
													rel="noopener noreferrer"
													class="mt-1 inline-block text-xs break-all underline"
													style="color: var(--link);"
												>
													{getBoostingTargetUrl(item)}
												</a>
											</div>
										{:else if !isManualHandoverItem(item) && !isPhoneOrder && orderDelivered}
											<div
												class="mt-3 rounded-lg border p-3"
												style="border-color: rgba(170, 173, 255, 0.25); background: rgba(170, 173, 255, 0.08);"
											>
												<p class="mb-2 text-xs font-medium" style="color: var(--text);">
													Login & Support Guide
												</p>
												<div class="flex flex-wrap items-center gap-2">
													<a
														href={getItemLoginGuide(item).url}
														target="_blank"
														rel="noopener noreferrer"
														class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all hover:-translate-y-0.5"
														style="background: rgba(5, 212, 113, 0.18); border: 1px solid rgba(5, 212, 113, 0.35); color: var(--text);"
													>
														{getItemLoginGuide(item).label}
														<ExternalLink class="h-3.5 w-3.5" />
													</a>
												</div>
											</div>
										{/if}
									</div>
									<div class="text-right">
										<p class="font-semibold">{formatPrice(item.totalPrice)}</p>
									</div>
								</div>

								<!-- Account Details -->
								{#if isOrderPaymentConfirmed(data.order) && !isManualHandoverItem(item) && item.accounts && item.accounts.length > 0}
									<div class="mt-4">
										<div class="mb-2 flex items-center justify-between">
											<h5 class="text-sm font-medium" style="color: var(--text);">
												Your Accounts:
											</h5>
											<button
												onclick={() => {
													copyAllAccounts(item.accounts, {
														showToast: (toast: any) => addToast(toast as any)
													});
												}}
												style="background: var(--surface-2); color: var(--text);"
												class="rounded-lg px-3 py-1.5 text-xs font-medium hover:brightness-110"
												title="Copy all accounts"
											>
												<Copy class="mr-1 inline h-3 w-3" />
												Copy All
											</button>
										</div>
										<div class="space-y-2">
											{#each item.accounts as account}
												{@const credentialEntries = getCanonicalCredentialEntries(account as any)}
												<div
													class="rounded-lg p-3"
													style="background: var(--bg-elev-1); border: 1px solid var(--border);"
												>
													<div class="space-y-3">
														{#if credentialEntries.length === 0}
															<p class="text-xs" style="color: var(--text-muted);">
																No credentials available for this account.
															</p>
														{:else}
															{#each credentialEntries as entry}
																<div class="flex items-start justify-between gap-3">
																	<div class="flex-1">
																		<span
																			class="text-xs font-medium uppercase"
																			style="color: var(--text-dim);">{entry.label}</span
																		>
																		{#if entry.isUrl && entry.href}
																			<a
																				href={entry.href}
																				target="_blank"
																				rel="noopener noreferrer"
																				class="credential-value font-mono text-sm break-all hover:underline"
																				style="color: var(--link);"
																			>
																				{entry.value}
																			</a>
																		{:else}
																			<div
																				class="credential-value font-mono text-sm break-all"
																				style="color: var(--text);"
																			>
																				{entry.value}
																			</div>
																		{/if}
																	</div>
																	<button
																		onclick={() =>
																			copyToClipboard(entry.value, {
																				label: entry.label,
																				showToast: (toast: any) => addToast(toast as any)
																			})}
																		style="color: var(--text-dim);"
																		class="ml-2 rounded p-2 hover:brightness-125"
																	>
																		<Copy class="h-4 w-4" />
																	</button>
																</div>
															{/each}
														{/if}
													</div>
												</div>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Sidebar -->
			<div class="space-y-6">
				<!-- Order Summary -->
				<div
					class="rounded-lg p-6"
					style="background: var(--surface); border: 1px solid var(--border);"
				>
					<h3 class="mb-4 text-lg font-semibold" style="color: var(--text);">Order Summary</h3>
					<div class="space-y-3 text-sm">
						<div class="flex justify-between">
							<span style="color: var(--text-muted);">Total Amount:</span>
							<span class="font-semibold" style="color: var(--text);"
								>{formatPrice(data.order.totalAmount)}</span
							>
						</div>
						<div>
							<div class="mb-1" style="color: var(--text-muted);">Order ID:</div>
							<div class="font-mono text-xs break-all" style="color: var(--text);">
								{data.order.id}
							</div>
						</div>
						<div class="flex justify-between">
							<span style="color: var(--text-muted);">Order Date:</span>
							<span style="color: var(--text);">{formatDate(data.order.createdAt)}</span>
						</div>
					</div>
				</div>

				<!-- Support -->
				<div
					class="rounded-lg p-6"
					style="background: linear-gradient(180deg, rgba(170,173,255,0.08), rgba(105,109,250,0.06)); border: 1px solid rgba(170,173,255,0.20);"
				>
					<h3 class="mb-2 text-lg font-semibold" style="color: var(--text);">Need Help?</h3>
					<p class="mb-4 text-sm" style="color: var(--text-muted);">
						If you have any questions about your order, please contact our support team.
					</p>
					<a
						href="/support"
						style="background: linear-gradient(180deg, rgba(105,109,250,0.95), rgba(46,49,146,0.95)); border: 1px solid rgba(170,173,255,0.30); color: var(--text);"
						class="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-all hover:brightness-110 active:scale-95"
					>
						Contact Support
					</a>
				</div>
			</div>
		</div>
	</div>
</main>

<Footer />

<style>
	:root {
		--status-success: #05d471;
		--status-error: #ff5050;
		--status-warning: #cadb2e;
		--status-info: #aaadff;
		--status-pending: #ffb800;
		--status-inactive: rgba(255, 255, 255, 0.35);
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 600;
		border: 1px solid;
	}

	.status-success {
		background: rgba(5, 212, 113, 0.12);
		border-color: rgba(5, 212, 113, 0.3);
		color: var(--status-success);
	}

	.status-error {
		background: rgba(255, 80, 80, 0.12);
		border-color: rgba(255, 80, 80, 0.3);
		color: var(--status-error);
	}

	.status-warning {
		background: rgba(202, 219, 46, 0.12);
		border-color: rgba(202, 219, 46, 0.3);
		color: var(--status-warning);
	}

	.status-info {
		background: rgba(170, 173, 255, 0.12);
		border-color: rgba(170, 173, 255, 0.25);
		color: var(--status-info);
	}

	.status-pending {
		background: rgba(255, 184, 0, 0.12);
		border-color: rgba(255, 184, 0, 0.3);
		color: var(--status-pending);
	}

	.status-inactive {
		background: rgba(255, 255, 255, 0.04);
		border-color: rgba(255, 255, 255, 0.1);
		color: var(--status-inactive);
	}

	.credential-value {
		min-width: 0;
		overflow-wrap: anywhere;
		word-break: break-word;
	}
</style>
