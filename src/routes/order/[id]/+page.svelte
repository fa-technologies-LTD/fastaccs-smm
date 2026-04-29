<script lang="ts">
	import { goto } from '$app/navigation';
	import { CheckCircle, Clock, XCircle, Mail, MessageSquare, Copy } from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { formatDate, formatPrice, copyToClipboard, copyAllAccounts } from '$lib/helpers/utils';
	import { resolveCredentialField } from '$lib/helpers/credential-links';
	import { getCredentialExtraEntries } from '$lib/helpers/account-credentials';
	import {
		DEFAULT_LOGIN_GUIDE_LABEL,
		DEFAULT_LOGIN_GUIDE_URL,
		getTierDeliveryConfig
	} from '$lib/helpers/tier-delivery-config';
	import { buildWhatsAppSupportLink } from '$lib/helpers/whatsapp';

	let { data }: { data: PageData } = $props();

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

		if (['paid', 'completed'].includes(orderStatus) || ['paid', 'success'].includes(payment)) {
			return { label: 'Payment Confirmed', tone: 'success' };
		}

		if (
			['failed'].includes(orderStatus) ||
			['failed', 'rejected', 'rejected_payment', 'reversed'].includes(payment)
		) {
			return { label: 'Payment Failed', tone: 'failure' };
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
		if (paymentTone !== 'success') {
			return 'Not Started';
		}

		const orderStatus = normalizeLower(status);
		const delivery = normalizeLower(deliveryStatus);

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

	function isManualHandoverItem(item: (typeof data.order.orderItems)[number]): boolean {
		return getTierDeliveryConfig(item.category?.metadata).mode === 'manual_handover';
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
		const paymentState = getPaymentState(data.order.status, data.order.paymentStatus);
		if (paymentState.tone !== 'success') return null;
		if (data.order.deliveryMethod !== 'whatsapp') return null;

		const orderLabel = data.order.orderNumber || `ORD-${data.order.id.slice(0, 8).toUpperCase()}`;
		const message = `Hi, I just paid for order ${orderLabel}. Manual handover in progress.`;
		return buildWhatsAppSupportLink(data.support?.whatsappNumber, message);
	}
</script>

<svelte:head>
	<title>Order #{data.order.id.slice(-8)} - FastAccs</title>
	<meta name="description" content="View your order status and account details" />
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
				Order #{data.order.id.slice(-8)}
			</h1>
			<p style="color: var(--text-muted);">Placed on {formatDate(data.order.createdAt)}</p>
		</div>

		<div class="grid gap-8 lg:grid-cols-3">
			<!-- Order Details -->
			<div class="lg:col-span-2">
				<!-- Status Card -->
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
								{#if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'success' && data.order.status === 'completed'}
									Your accounts have been successfully allocated and delivered.
								{:else if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'success' && data.order.deliveryMethod === 'whatsapp' && data.order.deliveryStatus === 'processing'}
									Payment confirmed. Manual handover is in progress on WhatsApp.
								{:else if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'pending'}
									Payment not confirmed yet. No account allocation has started.
								{:else if getPaymentState(data.order.status, data.order.paymentStatus).tone === 'failure'}
									Payment did not complete for this order. No account allocation was made.
								{:else}
									Payment is confirmed. We are finalizing your account delivery.
								{/if}
							</p>
							<div class="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
								<span style="color: var(--text-dim);">
									Payment: {getPaymentState(data.order.status, data.order.paymentStatus).label}
								</span>
								<span style="color: var(--text-dim);">•</span>
								<span style="color: var(--text-dim);">
									Fulfillment: {getFulfillmentState(
										data.order.status,
										data.order.deliveryStatus,
										getPaymentState(data.order.status, data.order.paymentStatus).tone
									)}
								</span>
							</div>
						</div>
					</div>
				</div>

				<div
					class="mb-6 rounded-lg p-4"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<p class="text-sm" style="color: var(--text-muted);">
						For smooth access, test your login soon after delivery and report issues quickly. For
						the fastest support response, message us within 2 hours of purchase. See the <a
							href="/support#faq"
							class="font-medium hover:underline"
							style="color: var(--link);">Support FAQ</a
						> for account-care tips.
					</p>
				</div>

				{#if getManualHandoverLink()}
					<div
						class="mb-6 rounded-lg p-4"
						style="background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(147, 197, 253, 0.3);"
					>
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p class="text-sm font-semibold" style="color: #bfdbfe;">Manual handover in progress</p>
								<p class="text-xs" style="color: #dbeafe;">
									Secure WhatsApp handover by our team, usually within 15–60 minutes.
								</p>
							</div>
							<a
								href={getManualHandoverLink()}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold"
								style="background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(16, 185, 129, 0.35); color: rgb(52, 211, 153);"
							>
								Continue on WhatsApp
							</a>
						</div>
					</div>
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
											{#if isManualHandoverItem(item)}
												<span class="status-badge status-info">Manual handover via WhatsApp</span>
											{:else}
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
										<div class="mt-2">
											<a
												href={getItemLoginGuide(item).url}
												target="_blank"
												rel="noopener noreferrer"
												class="text-xs font-medium hover:underline"
												style="color: var(--link);"
											>
												{getItemLoginGuide(item).label}
											</a>
											<span class="ml-2 text-xs" style="color: var(--text-dim);"
												>For more help: {data.support?.loginGuideFallbackUrl ||
													'https://smm.fastaccs.com/support#after-purchase-guide'}</span
											>
										</div>
									</div>
									<div class="text-right">
										<p class="font-semibold">{formatPrice(item.totalPrice)}</p>
									</div>
								</div>

								<!-- Account Details -->
								{#if item.accounts && item.accounts.length > 0}
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
													{@const extraFields = getCredentialExtraEntries(
														(account as any).credentialExtras || (account as any).credential_extras || {}
													)}
													<div
														class="rounded-lg p-3"
														style="background: var(--bg-elev-1); border: 1px solid var(--border);"
												>
													<div class="space-y-3">
														<div class="flex items-center justify-between">
															<div class="flex-1">
																<span
																	class="text-xs font-medium uppercase"
																	style="color: var(--text-dim);">Username</span
																>
																<div class="font-mono text-sm" style="color: var(--text);">
																	{account.username}
																</div>
															</div>
															<button
																onclick={() =>
																	copyToClipboard(account.username || '', {
																		label: 'Username',
																		showToast: (toast: any) => addToast(toast as any)
																	})}
																class="ml-2 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
															>
																<Copy class="h-4 w-4" />
															</button>
														</div>
														<div class="flex items-center justify-between">
															<div class="flex-1">
																<span class="text-xs font-medium text-gray-500 uppercase"
																	>Password</span
																>
																<div class="font-mono text-sm">{account.password}</div>
															</div>
															<button
																onclick={() =>
																	copyToClipboard(account.password || '', {
																		label: 'Password',
																		showToast: (toast: any) => addToast(toast as any)
																	})}
																class="ml-2 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
															>
																<Copy class="h-4 w-4" />
															</button>
														</div>
														{#if account.email}
															<div class="flex items-center justify-between">
																<div class="flex-1">
																	<span class="text-xs font-medium text-gray-500 uppercase"
																		>Email</span
																	>
																	<div class="font-mono text-sm">{account.email}</div>
																</div>
																<button
																	onclick={() =>
																		copyToClipboard(account.email || '', {
																			label: 'Email',
																			showToast: (toast: any) => addToast(toast as any)
																		})}
																	style="color: var(--text-dim);"
																	class="ml-2 rounded p-2 hover:brightness-125"
																>
																	<Copy class="h-4 w-4" />
																</button>
															</div>
														{/if}
														{#if account.emailPassword}
															<div class="flex items-center justify-between">
																<div class="flex-1">
																	<span
																		class="text-xs font-medium uppercase"
																		style="color: var(--text-dim);">Email Pass</span
																	>
																	<div
																		class="credential-value font-mono text-sm"
																		style="color: var(--text);"
																	>
																		{account.emailPassword}
																	</div>
																</div>
																<button
																	onclick={() =>
																		copyToClipboard(account.emailPassword || '', {
																			label: 'Email Password',
																			showToast: (toast: any) => addToast(toast as any)
																		})}
																	style="color: var(--text-dim);"
																	class="ml-2 rounded p-2 hover:brightness-125"
																>
																	<Copy class="h-4 w-4" />
																</button>
															</div>
														{/if}
														{#if account.twoFa}
															{@const twoFaField = resolveCredentialField(account.twoFa)}
															{#if twoFaField.display}
																<div class="flex items-start justify-between gap-3">
																	<div class="flex-1">
																		<span
																			class="text-xs font-medium uppercase"
																			style="color: var(--text-dim);">2FA</span
																		>
																		{#if twoFaField.isUrl && twoFaField.href}
																			<a
																				href={twoFaField.href}
																				target="_blank"
																				rel="noopener noreferrer"
																				class="credential-value font-mono text-sm break-all hover:underline"
																				style="color: var(--link);"
																			>
																				{twoFaField.display}
																			</a>
																		{:else}
																			<div
																				class="credential-value font-mono text-sm break-all"
																				style="color: var(--text);"
																			>
																				{twoFaField.display}
																			</div>
																		{/if}
																	</div>
																	<button
																		onclick={() =>
																			copyToClipboard(twoFaField.display || '', {
																				label: '2FA',
																				showToast: (toast: any) => addToast(toast as any)
																			})}
																		style="color: var(--text-dim);"
																		class="ml-2 rounded p-2 hover:brightness-125"
																	>
																		<Copy class="h-4 w-4" />
																	</button>
																</div>
															{/if}
														{/if}
															{#if account.linkUrl}
																{@const linkField = resolveCredentialField(account.linkUrl)}
															{#if linkField.display}
																<div class="flex items-start justify-between gap-3">
																	<div class="flex-1">
																		<span
																			class="text-xs font-medium uppercase"
																			style="color: var(--text-dim);">Link</span
																		>
																		{#if linkField.isUrl && linkField.href}
																			<a
																				href={linkField.href}
																				target="_blank"
																				rel="noopener noreferrer"
																				class="credential-value font-mono text-sm break-all hover:underline"
																				style="color: var(--link);"
																			>
																				{linkField.display}
																			</a>
																		{:else}
																			<div
																				class="credential-value font-mono text-sm break-all"
																				style="color: var(--text);"
																			>
																				{linkField.display}
																			</div>
																		{/if}
																	</div>
																	<button
																		onclick={() =>
																			copyToClipboard(linkField.display || '', {
																				label: 'Link',
																				showToast: (toast: any) => addToast(toast as any)
																			})}
																		style="color: var(--text-dim);"
																		class="ml-2 rounded p-2 hover:brightness-125"
																	>
																		<Copy class="h-4 w-4" />
																	</button>
																</div>
																{/if}
															{/if}
															{#if extraFields.length > 0}
																{#each extraFields as field}
																	<div class="flex items-center justify-between">
																		<div class="flex-1">
																			<span
																				class="text-xs font-medium uppercase"
																				style="color: var(--text-dim);">{field.label}</span
																			>
																			<div
																				class="credential-value font-mono text-sm break-all"
																				style="color: var(--text);"
																			>
																				{field.value}
																			</div>
																		</div>
																	</div>
																{/each}
															{/if}
															{#if account.deliveryNotes}
																<div class="mt-2">
																<span
																	class="text-xs font-medium uppercase"
																	style="color: var(--text-dim);">Notes:</span
																>
																<p class="mt-1 text-sm" style="color: var(--text-muted);">
																	{account.deliveryNotes}
																</p>
															</div>
														{/if}
													</div>
												</div>
											{/each}
										</div>
									</div>
								{:else if isManualHandoverItem(item)}
									<div
										class="mt-4 rounded-lg p-3 text-sm"
										style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(147, 197, 253, 0.25); color: #dbeafe;"
									>
										Payment is confirmed. Our team will hand over this listing manually on WhatsApp.
										Use the button above to continue the handover chat.
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
						<div class="flex justify-between">
							<span style="color: var(--text-muted);">Payment:</span>
							<span style="color: var(--text);"
								>{getPaymentState(data.order.status, data.order.paymentStatus).label}</span
							>
						</div>
						<div class="flex justify-between">
							<span style="color: var(--text-muted);">Fulfillment:</span>
							<span style="color: var(--text);"
								>{getFulfillmentState(
									data.order.status,
									data.order.deliveryStatus,
									getPaymentState(data.order.status, data.order.paymentStatus).tone
								)}</span
							>
						</div>
					</div>
				</div>

				<!-- Delivery Info -->
				<div
					class="rounded-lg p-6"
					style="background: var(--surface); border: 1px solid var(--border);"
				>
					<h3 class="mb-4 text-lg font-semibold" style="color: var(--text);">
						Delivery Information
					</h3>
					<div class="flex items-center gap-3">
						{#if data.order.deliveryMethod === 'email'}
							<Mail class="h-5 w-5" style="color: var(--fa-blue-300);" />
						{:else if data.order.deliveryMethod === 'whatsapp'}
							<MessageSquare class="h-5 w-5" style="color: var(--fa-blue-300);" />
						{:else if data.order.deliveryMethod === 'telegram'}
							<MessageSquare class="h-5 w-5" style="color: var(--fa-blue-300);" />
						{:else}
							<Mail class="h-5 w-5" style="color: var(--fa-blue-300);" />
						{/if}
						<div>
							<p class="font-medium capitalize" style="color: var(--text);">
								{data.order.deliveryMethod}
							</p>
							<p class="text-sm" style="color: var(--text-muted);">
								{#if data.order.deliveryMethod === 'email'}
									{data.order.guestEmail || data.order.deliveryContact}
								{:else if data.order.deliveryMethod === 'whatsapp'}
									{data.order.deliveryContact}
								{:else if data.order.deliveryMethod === 'telegram'}
									{data.order.deliveryContact}
								{:else}
									<!-- fallback info -->
								{/if}
							</p>
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
