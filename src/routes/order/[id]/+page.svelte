<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		CheckCircle,
		Clock,
		XCircle,
		AlertCircle,
		Download,
		Mail,
		MessageSquare,
		Phone,
		Copy
	} from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { formatDate, formatPrice, copyToClipboard, copyAllAccounts } from '$lib/helpers/utils';

	let { data }: { data: PageData } = $props();

	function getStatusIcon(status: string) {
		switch (status) {
			case 'completed':
				return CheckCircle;
			case 'pending':
			case 'processing':
				return Clock;
			case 'failed':
				return XCircle;
			case 'partial':
				return AlertCircle;
			default:
				return Clock;
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'completed':
				return 'status-success';
			case 'pending':
				return 'status-pending';
			case 'processing':
				return 'status-info';
			case 'failed':
				return 'status-error';
			case 'partial':
				return 'status-warning';
			case 'cancelled':
				return 'status-inactive';
			default:
				return 'status-inactive';
		}
	}

	function getStatusText(status: string) {
		switch (status) {
			case 'completed':
				return 'Completed';
			case 'pending':
				return 'Pending';
			case 'processing':
				return 'Processing';
			case 'failed':
				return 'Failed';
			case 'partial':
				return 'Partially Completed';
			default:
				return status;
		}
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
					onclick={() => goto('/dashboard')}
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
						<div class={`status-badge ${getStatusColor(data.order.status)}`}>
							<!-- Use getStatusIcon inline instead of StatusIcon constant -->
							{#if data.order.status === 'completed'}
								<CheckCircle class="h-6 w-6" />
							{:else if data.order.status === 'pending' || data.order.status === 'processing'}
								<Clock class="h-6 w-6" />
							{:else if data.order.status === 'failed'}
								<XCircle class="h-6 w-6" />
							{:else if data.order.status === 'partial'}
								<AlertCircle class="h-6 w-6" />
							{:else}
								<Clock class="h-6 w-6" />
							{/if}
						</div>
						<div>
							<h2 class="text-xl font-semibold" style="color: var(--text);">
								{getStatusText(data.order.status)}
							</h2>
							<p style="color: var(--text-muted);">
								{#if data.order.status === 'completed'}
									Your accounts have been successfully allocated and delivered.
								{:else if data.order.status === 'pending'}
									Your order is being processed. Please wait while we allocate your accounts.
								{:else if data.order.status === 'processing'}
									We're currently allocating your accounts. This should be completed shortly.
								{:else if data.order.status === 'failed'}
									We couldn't allocate accounts for your order. Please contact support.
								{:else if data.order.status === 'partial'}
									Some accounts were allocated successfully. Check the details below.
								{/if}
							</p>
						</div>
					</div>
				</div>

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
																		style="color: var(--text-dim);">Password</span
																	>
																	<div class="font-mono text-sm" style="color: var(--text);">
																		{account.password}
																	</div>
																</div>
																<button
																	onclick={() =>
																		copyToClipboard(account.password || '', {
																			label: 'Password',
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
															<div class="flex items-center justify-between">
																<div class="flex-1">
																	<span
																		class="text-xs font-medium uppercase"
																		style="color: var(--text-dim);">2FA</span
																	>
																	<div class="font-mono text-sm" style="color: var(--text);">
																		{account.twoFa}
																	</div>
																</div>
																<button
																	onclick={() =>
																		copyToClipboard(account.twoFa || '', {
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
														{#if account.linkUrl}
															<div class="flex items-center justify-between">
																<div class="flex-1">
																	<span
																		class="text-xs font-medium uppercase"
																		style="color: var(--text-dim);">Link</span
																	>
																	<div
																		class="font-mono text-sm break-all"
																		style="color: var(--text);"
																	>
																		{account.linkUrl}
																	</div>
																</div>
																<button
																	onclick={() =>
																		copyToClipboard(account.linkUrl || '', {
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
</style>
