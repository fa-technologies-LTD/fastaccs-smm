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
		Phone
	} from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { addToast } from '$lib/stores/toasts';
	import type { PageData } from './$types';

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
				return 'text-green-600 bg-green-100';
			case 'pending':
				return 'text-yellow-600 bg-yellow-100';
			case 'processing':
				return 'text-blue-600 bg-blue-100';
			case 'failed':
				return 'text-red-600 bg-red-100';
			case 'partial':
				return 'text-orange-600 bg-orange-100';
			default:
				return 'text-gray-600 bg-gray-100';
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

	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN'
		}).format(price);
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getDeliveryIcon(method: string) {
		switch (method) {
			case 'email':
				return Mail;
			case 'whatsapp':
				return MessageSquare;
			case 'telegram':
				return MessageSquare;
			default:
				return Mail;
		}
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		addToast({
			type: 'success',
			title: 'Copied to clipboard!',
			duration: 2000
		});
	}
</script>

<svelte:head>
	<title>Order #{data.order.id.slice(-8)} - FastAccs</title>
	<meta name="description" content="View your order status and account details" />
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50 py-8">
	<div class="mx-auto max-w-4xl px-4">
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center gap-4">
				<button
					onclick={() => goto('/')}
					class="rounded-lg bg-white px-4 py-2 text-purple-600 shadow-sm hover:bg-gray-50"
				>
					← Back to Home
				</button>
			</div>
			<h1 class="mt-4 text-3xl font-bold text-gray-900">
				Order #{data.order.id.slice(-8)}
			</h1>
			<p class="text-gray-600">Placed on {formatDate(data.order.created_at)}</p>
		</div>

		<div class="grid gap-8 lg:grid-cols-3">
			<!-- Order Details -->
			<div class="lg:col-span-2">
				<!-- Status Card -->
				<div class="mb-6 rounded-lg bg-white p-6 shadow-sm">
					<div class="flex items-center gap-4">
						<div class={`rounded-full p-2 ${getStatusColor(data.order.status)}`}>
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
							<h2 class="text-xl font-semibold">{getStatusText(data.order.status)}</h2>
							<p class="text-gray-600">
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
				<div class="rounded-lg bg-white p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold">Order Items</h3>
					<div class="space-y-6">
						{#each data.order.order_items as item}
							<div class="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0">
								<div class="flex items-start justify-between">
									<div class="flex-1">
										<h4 class="font-medium text-gray-900">{item.products.title}</h4>
										<p class="text-sm text-gray-600">
											{item.products.platform} • {item.products.tier_name}
										</p>
										<p class="text-sm text-gray-600">
											Quantity: {item.quantity} • {formatPrice(item.price)} each
										</p>
										<div class="mt-2">
											<span
												class={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
													item.allocation_status === 'allocated'
														? 'bg-green-100 text-green-800'
														: item.allocation_status === 'partial'
															? 'bg-yellow-100 text-yellow-800'
															: item.allocation_status === 'failed'
																? 'bg-red-100 text-red-800'
																: 'bg-gray-100 text-gray-800'
												}`}
											>
												{item.allocated_count} of {item.quantity} allocated
											</span>
										</div>
									</div>
									<div class="text-right">
										<p class="font-semibold">{formatPrice(item.price * item.quantity)}</p>
									</div>
								</div>

								<!-- Account Details -->
								{#if item.accounts && item.accounts.length > 0}
									<div class="mt-4">
										<h5 class="mb-2 text-sm font-medium text-gray-900">Your Accounts:</h5>
										<div class="space-y-2">
											{#each item.accounts as account}
												<div class="rounded-lg bg-gray-50 p-3">
													<div class="grid gap-2 text-sm">
														<div class="flex justify-between">
															<span class="font-medium">Username:</span>
															<span class="font-mono">{account.username}</span>
															<button
																onclick={() => copyToClipboard(account.username)}
																class="text-purple-600 hover:text-purple-700"
															>
																Copy
															</button>
														</div>
														<div class="flex justify-between">
															<span class="font-medium">Password:</span>
															<span class="font-mono">{account.password}</span>
															<button
																onclick={() => copyToClipboard(account.password)}
																class="text-purple-600 hover:text-purple-700"
															>
																Copy
															</button>
														</div>
														{#if account.email}
															<div class="flex justify-between">
																<span class="font-medium">Email:</span>
																<span class="font-mono">{account.email}</span>
																<button
																	onclick={() => copyToClipboard(account.email)}
																	class="text-purple-600 hover:text-purple-700"
																>
																	Copy
																</button>
															</div>
														{/if}
														{#if account.additional_info}
															<div class="mt-2">
																<span class="font-medium">Additional Info:</span>
																<pre
																	class="mt-1 text-xs whitespace-pre-wrap text-gray-600">{JSON.stringify(
																		account.additional_info,
																		null,
																		2
																	)}</pre>
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
				<div class="rounded-lg bg-white p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold">Order Summary</h3>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span>Total Amount:</span>
							<span class="font-semibold">{formatPrice(data.order.total)}</span>
						</div>
						<div class="flex justify-between">
							<span>Order ID:</span>
							<span class="font-mono text-xs">{data.order.id}</span>
						</div>
						<div class="flex justify-between">
							<span>Order Date:</span>
							<span>{formatDate(data.order.created_at)}</span>
						</div>
					</div>
				</div>

				<!-- Delivery Info -->
				<div class="rounded-lg bg-white p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold">Delivery Information</h3>
					<div class="flex items-center gap-3">
						{#if data.order.delivery_method === 'email'}
							<Mail class="h-5 w-5 text-purple-600" />
						{:else if data.order.delivery_method === 'whatsapp'}
							<MessageSquare class="h-5 w-5 text-purple-600" />
						{:else if data.order.delivery_method === 'telegram'}
							<MessageSquare class="h-5 w-5 text-purple-600" />
						{:else}
							<Mail class="h-5 w-5 text-purple-600" />
						{/if}
						<div>
							<p class="font-medium capitalize">{data.order.delivery_method}</p>
							<p class="text-sm text-gray-600">
								{#if data.order.delivery_method === 'email'}
									{data.order.guest_email || 'Account email'}
								{:else if data.order.delivery_method === 'whatsapp'}
									{data.order.whatsapp_number || 'WhatsApp number'}
								{:else if data.order.delivery_method === 'telegram'}
									{data.order.telegram_username || 'Telegram username'}
								{:else}
									<!-- fallback info -->
								{/if}
							</p>
						</div>
					</div>
				</div>

				<!-- Support -->
				<div class="rounded-lg bg-purple-50 p-6">
					<h3 class="mb-2 text-lg font-semibold text-purple-900">Need Help?</h3>
					<p class="mb-4 text-sm text-purple-700">
						If you have any questions about your order, please contact our support team.
					</p>
					<a
						href="/support"
						class="inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
					>
						Contact Support
					</a>
				</div>
			</div>
		</div>
	</div>
</main>

<Footer />
