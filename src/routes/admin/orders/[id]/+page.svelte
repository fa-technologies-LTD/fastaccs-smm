<script lang="ts">
	import { goto } from '$app/navigation';
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
		EyeOff
	} from '@lucide/svelte';
	import { updateOrderStatus, processOrderDelivery, addOrderNote } from '$lib/services/orders';
	import { addToast } from '$lib/stores/toasts';
	import type { OrderMetadata, OrderItemWithDetails } from '$lib/services/orders';

	// Props from load function
	interface Props {
		data: {
			order: OrderMetadata;
			items: OrderItemWithDetails[];
			error: string | null;
		};
	}

	let { data }: Props = $props();

	let order = $state(data.order);
	let items = $state<OrderItemWithDetails[]>(data.items);
	let isProcessing = $state(false);
	let showCredentials = $state(false);
	let newNote = $state('');
	let selectedDeliveryMethod = $state<'email' | 'whatsapp' | 'telegram'>('email');

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
				return 'text-green-600 bg-green-100';
			case 'processing':
				return 'text-blue-600 bg-blue-100';
			case 'failed':
				return 'text-red-600 bg-red-100';
			case 'cancelled':
				return 'text-gray-600 bg-gray-100';
			default:
				return 'text-yellow-600 bg-yellow-100';
		}
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

	// Actions
	async function updateStatus(
		newStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
	) {
		if (isProcessing) return;

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
				order = { ...order, status: 'processing' };
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

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mx-auto max-w-7xl">
		<!-- Header -->
		<div class="mb-8">
			<div class="mb-6 flex items-center gap-4">
				<button
					onclick={goBack}
					class="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 transition-colors hover:bg-gray-50"
				>
					<ArrowLeft class="h-5 w-5" />
				</button>
				<div class="flex-1">
					<div class="mb-2 flex items-center gap-3">
						{#if order}
							{@const StatusIcon = getStatusIcon(order.status)}
							<StatusIcon class="h-6 w-6 {getStatusColor(order.status).split(' ')[0]}" />
							<h1 class="text-2xl font-bold text-gray-900">Order #{order.id}</h1>
							<span
								class="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium {getStatusColor(
									order.status
								)}"
							>
								{order.status.charAt(0).toUpperCase() + order.status.slice(1)}
							</span>
						{/if}
					</div>
					<p class="text-gray-600">
						Placed on {new Date(order.created_at).toLocaleDateString()} at {new Date(
							order.created_at
						).toLocaleTimeString()}
					</p>
				</div>

				<!-- Quick Actions -->
				<div class="flex items-center gap-3">
					{#if order.status === 'pending'}
						<button
							onclick={() => updateStatus('processing')}
							disabled={isProcessing}
							class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
						>
							<Clock class="h-4 w-4" />
							Start Processing
						</button>
					{/if}

					{#if order.status === 'processing'}
						<button
							onclick={processDelivery}
							disabled={isProcessing}
							class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
						>
							<Send class="h-4 w-4" />
							Deliver Now
						</button>
					{/if}

					{#if order.status !== 'completed' && order.status !== 'cancelled'}
						<button
							onclick={() => updateStatus('completed')}
							disabled={isProcessing}
							class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
						>
							<CheckCircle class="h-4 w-4" />
							Mark Complete
						</button>
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
				<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h2 class="mb-4 text-lg font-semibold text-gray-900">Order Summary</h2>
					<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
						<div>
							<div class="mb-2 flex items-center">
								<Package class="mr-2 h-4 w-4 text-gray-400" />
								<span class="text-sm font-medium text-gray-500">Items</span>
							</div>
							<p class="text-2xl font-bold text-gray-900">{order.item_count}</p>
							<p class="text-sm text-gray-500">accounts ordered</p>
						</div>
						<div>
							<div class="mb-2 flex items-center">
								<CreditCard class="mr-2 h-4 w-4 text-gray-400" />
								<span class="text-sm font-medium text-gray-500">Total Amount</span>
							</div>
							<p class="text-2xl font-bold text-gray-900">${order.total_amount.toFixed(2)}</p>
							<p class="text-sm text-gray-500">
								{#if order.payment_id}
									Payment ID: {order.payment_id}
								{:else}
									No payment ID
								{/if}
							</p>
						</div>
						<div>
							<div class="mb-2 flex items-center">
								<Calendar class="mr-2 h-4 w-4 text-gray-400" />
								<span class="text-sm font-medium text-gray-500">Order Date</span>
							</div>
							<p class="text-lg font-bold text-gray-900">
								{new Date(order.created_at).toLocaleDateString()}
							</p>
							<p class="text-sm text-gray-500">
								{new Date(order.created_at).toLocaleTimeString()}
							</p>
						</div>
					</div>
				</div>

				<!-- Allocated Accounts -->
				<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
					<div class="border-b border-gray-200 px-6 py-4">
						<div class="flex items-center justify-between">
							<h2 class="text-lg font-semibold text-gray-900">Allocated Accounts</h2>
							<div class="flex items-center gap-3">
								<button
									onclick={() => (showCredentials = !showCredentials)}
									class="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
								>
									{#if showCredentials}
										<EyeOff class="h-4 w-4" />
										Hide Credentials
									{:else}
										<Eye class="h-4 w-4" />
										Show Credentials
									{/if}
								</button>
								<span class="text-sm text-gray-500">
									{items.length} accounts
								</span>
							</div>
						</div>
					</div>

					{#if items.length === 0}
						<div class="p-12 text-center">
							<Package class="mx-auto mb-4 h-12 w-12 text-gray-300" />
							<h3 class="mb-2 text-lg font-medium text-gray-900">No accounts allocated</h3>
							<p class="text-gray-500">Accounts will be allocated when the order is processed.</p>
						</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
										>
											Account
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
										>
											Platform/Tier
										</th>
										{#if showCredentials}
											<th
												class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>
												Credentials
											</th>
										{/if}
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
										>
											Status
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
										>
											Actions
										</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#each items as item}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap">
												<div>
													<div class="text-sm font-medium text-gray-900">
														@{item.account_username}
													</div>
													<div class="text-sm text-gray-500">
														{item.account_email || 'No email'}
													</div>
												</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<div>
													<div class="text-sm font-medium text-gray-900">
														{item.platform_name}
													</div>
													<div class="text-sm text-gray-500">
														{item.tier_name}
													</div>
												</div>
											</td>
											{#if showCredentials}
												<td class="px-6 py-4 whitespace-nowrap">
													<div class="flex items-center space-x-2">
														<code class="rounded bg-gray-100 px-2 py-1 font-mono text-sm">
															{item.account_password || 'No password'}
														</code>
														<button
															onclick={() =>
																copyToClipboard(
																	`${item.account_username}:${item.account_password}`
																)}
															class="text-gray-400 hover:text-gray-600"
															title="Copy credentials"
														>
															<Copy class="h-4 w-4" />
														</button>
													</div>
												</td>
											{/if}
											<td class="px-6 py-4 whitespace-nowrap">
												<span
													class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800"
												>
													Allocated
												</span>
											</td>
											<td class="px-6 py-4 text-right text-sm font-medium whitespace-nowrap">
												<button
													onclick={() =>
														copyToClipboard(
															`Username: ${item.account_username}\nPassword: ${item.account_password}`
														)}
													class="text-blue-600 hover:text-blue-900"
													title="Copy account details"
												>
													<Copy class="h-4 w-4" />
												</button>
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
				<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold text-gray-900">Customer Information</h3>
					<div class="space-y-4">
						<div class="flex items-center">
							<User class="mr-3 h-4 w-4 text-gray-400" />
							<div>
								<p class="text-sm font-medium text-gray-900">
									{order.customer_name || 'No name provided'}
								</p>
								<p class="text-xs text-gray-500">Customer Name</p>
							</div>
						</div>
						<div class="flex items-center">
							<Mail class="mr-3 h-4 w-4 text-gray-400" />
							<div>
								<p class="text-sm font-medium text-gray-900">{order.customer_email}</p>
								<p class="text-xs text-gray-500">Email Address</p>
							</div>
						</div>
						{#if order.metadata?.customer_phone}
							<div class="flex items-center">
								<Phone class="mr-3 h-4 w-4 text-gray-400" />
								<div>
									<p class="text-sm font-medium text-gray-900">{order.metadata.customer_phone}</p>
									<p class="text-xs text-gray-500">Phone Number</p>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Affiliate Information -->
				{#if order.affiliateCode}
					<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
						<h3 class="mb-4 text-lg font-semibold text-gray-900">Affiliate Information</h3>
						<div class="space-y-4">
							<div class="flex items-center justify-between rounded-lg bg-blue-50 p-3">
								<span class="text-sm font-medium text-gray-700">Affiliate Code</span>
								<a
									href="/admin/affiliates?code={order.affiliateCode}"
									class="font-mono text-sm font-semibold text-blue-600 transition-colors hover:text-blue-900"
								>
									{order.affiliateCode}
								</a>
							</div>
							{#if order.affiliateUserId}
								<div class="flex items-center justify-between rounded-lg bg-gray-50 p-3">
									<span class="text-sm font-medium text-gray-700">Referred By</span>
									<a
										href="/admin/affiliates/{order.affiliateUserId}"
										class="text-sm font-medium text-blue-600 transition-colors hover:text-blue-900"
									>
										View Affiliate
									</a>
								</div>
							{/if}
							<div class="flex items-center justify-between rounded-lg bg-green-50 p-3">
								<span class="text-sm font-medium text-gray-700">Commission Earned</span>
								<span class="text-sm font-bold text-green-600">
									{#if order.total_amount && order.metadata?.commissionRate}
										${((Number(order.total_amount) * Number(order.metadata.commissionRate)) / 100).toFixed(2)}
									{:else}
										Pending calculation
									{/if}
								</span>
							</div>
						</div>
					</div>
				{/if}

				<!-- Delivery Management -->
				<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold text-gray-900">Delivery Management</h3>

					<div class="space-y-4">
						<div>
							<label for="delivery-method" class="mb-2 block text-sm font-medium text-gray-700">
								Delivery Method
							</label>
							<select
								id="delivery-method"
								bind:value={selectedDeliveryMethod}
								class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
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
				<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold text-gray-900">Status Management</h3>

					<div class="space-y-3">
						{#if order.status === 'pending'}
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
				<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold text-gray-900">Order Notes</h3>

					<!-- Add Note -->
					<div class="mb-4">
						<textarea
							bind:value={newNote}
							placeholder="Add a note about this order..."
							class="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
							rows="3"
						></textarea>
						<button
							onclick={addNote}
							disabled={!newNote.trim() || isProcessing}
							class="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
						>
							Add Note
						</button>
					</div>

					<!-- Notes List -->
					<div class="max-h-60 space-y-3 overflow-y-auto">
						{#if order.metadata?.notes && order.metadata.notes.length > 0}
							{#each order.metadata.notes as note}
								<div class="rounded-lg bg-gray-50 p-3">
									<p class="text-sm text-gray-900">
										{typeof note === 'string' ? note : note.note}
									</p>
									<div class="mt-2 flex items-center justify-between text-xs text-gray-500">
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
							<p class="py-4 text-center text-sm text-gray-500">No notes yet</p>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
