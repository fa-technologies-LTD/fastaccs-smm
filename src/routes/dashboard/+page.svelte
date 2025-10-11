<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ShoppingCart, Package, User, LogOut, Eye, RefreshCw, Calendar } from '@lucide/svelte';

	// Svelte 5 reactive state
	let currentUser = $state<any>(null);
	let orders = $state<any[]>([]);
	let loading = $state(true);
	let activeTab = $state('orders');

	onMount(async () => {
		// Mock user for testing - replace with proper auth later
		currentUser = { id: 'test-user', email: 'test@example.com' };
		await loadUserOrders();
	});

	async function loadUserOrders() {
		if (!currentUser) return;

		loading = true;
		try {
			// Mock orders for testing - replace with API call later
			orders = [];
		} catch (error) {
			console.error('Error loading orders:', error);
		} finally {
			loading = false;
		}
	}

	async function handleLogout() {
		// Mock logout - replace with proper auth later
		goto('/');
	}

	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN'
		}).format(price);
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-NG', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'completed':
				return 'bg-green-100 text-green-800';
			case 'processing':
				return 'bg-blue-100 text-blue-800';
			case 'pending':
				return 'bg-yellow-100 text-yellow-800';
			case 'cancelled':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}
</script>

<svelte:head>
	<title>My Dashboard | FastAccs</title>
	<meta
		name="description"
		content="Manage your orders, view purchase history, and track deliveries from your personal dashboard."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50 py-8">
	<div class="mx-auto max-w-6xl px-4">
		<!-- Header -->
		<div class="mb-8 flex items-center justify-between">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Dashboard</h1>
				{#if currentUser}
					<p class="text-gray-600">Welcome back, {currentUser.email}</p>
				{/if}
			</div>
			<button
				onclick={handleLogout}
				class="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-red-600 hover:bg-red-50"
			>
				<LogOut size={16} />
				Logout
			</button>
		</div>

		<!-- Tab Navigation -->
		<div class="mb-8 border-b border-gray-200">
			<nav class="flex space-x-8">
				<button
					onclick={() => (activeTab = 'orders')}
					class="pb-4 text-sm font-medium {activeTab === 'orders'
						? 'border-b-2 border-purple-500 text-purple-600'
						: 'text-gray-500 hover:text-gray-700'}"
				>
					<Package size={16} class="mr-2 inline" />
					My Orders
				</button>
				<button
					onclick={() => (activeTab = 'profile')}
					class="pb-4 text-sm font-medium {activeTab === 'profile'
						? 'border-b-2 border-purple-500 text-purple-600'
						: 'text-gray-500 hover:text-gray-700'}"
				>
					<User size={16} class="mr-2 inline" />
					Profile
				</button>
			</nav>
		</div>

		<!-- Content -->
		{#if activeTab === 'orders'}
			<div class="rounded-lg bg-white p-6 shadow-sm">
				<div class="mb-6 flex items-center justify-between">
					<h2 class="text-xl font-semibold">Order History</h2>
					<button
						onclick={loadUserOrders}
						class="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
					>
						<RefreshCw size={16} />
						Refresh
					</button>
				</div>

				{#if loading}
					<div class="flex items-center justify-center py-12">
						<div
							class="h-8 w-8 animate-spin rounded-full border-2 border-purple-600 border-t-transparent"
						></div>
					</div>
				{:else if orders.length === 0}
					<div class="py-12 text-center">
						<Package size={48} class="mx-auto mb-4 text-gray-300" />
						<h3 class="mb-2 text-lg font-medium text-gray-900">No orders yet</h3>
						<p class="mb-6 text-gray-600">Start shopping to see your orders here</p>
						<button
							onclick={() => goto('/products')}
							class="rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white hover:bg-purple-700"
						>
							Browse Products
						</button>
					</div>
				{:else}
					<div class="space-y-4">
						{#each orders as order}
							<div class="rounded-lg border p-6">
								<div class="mb-4 flex items-center justify-between">
									<div>
										<h3 class="font-semibold text-gray-900">Order #{order.order_number}</h3>
										<div class="flex items-center gap-4 text-sm text-gray-600">
											<span class="flex items-center gap-1">
												<Calendar size={14} />
												{formatDate(order.created_at)}
											</span>
											<span
												class="rounded-full px-2 py-1 text-xs font-medium {getStatusColor(
													order.status
												)}"
											>
												{order.status.charAt(0).toUpperCase() + order.status.slice(1)}
											</span>
										</div>
									</div>
									<div class="text-right">
										<div class="text-lg font-bold text-purple-600">
											{formatPrice(order.total_amount)}
										</div>
										<div class="text-sm text-gray-600">{order.delivery_method}</div>
									</div>
								</div>

								{#if order.order_items && order.order_items.length > 0}
									<div class="space-y-3">
										{#each order.order_items as item}
											<div class="flex items-center gap-4 rounded-lg bg-gray-50 p-3">
												<div class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
													{#if item.products?.thumbnail_url}
														<img
															src={item.products.thumbnail_url}
															alt={item.products.title}
															class="h-full w-full object-cover"
														/>
													{:else}
														<div class="flex h-full w-full items-center justify-center">
															<Package size={16} class="text-gray-400" />
														</div>
													{/if}
												</div>
												<div class="flex-1">
													<h4 class="font-medium text-gray-900">{item.products?.title}</h4>
													<p class="text-sm text-gray-600">
														{item.products?.platform} • Qty: {item.quantity}
													</p>
												</div>
												<div class="text-right">
													<div class="font-semibold text-gray-900">
														{formatPrice(item.unit_price * item.quantity)}
													</div>
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else if activeTab === 'profile'}
			<div class="rounded-lg bg-white p-6 shadow-sm">
				<h2 class="mb-6 text-xl font-semibold">Profile Information</h2>

				{#if currentUser}
					<div class="space-y-4">
						<div>
							<div class="block text-sm font-medium text-gray-700">Email</div>
							<div class="mt-1 text-sm text-gray-900">{currentUser.email}</div>
						</div>

						<div>
							<div class="block text-sm font-medium text-gray-700">Account Type</div>
							<div class="mt-1 text-sm text-gray-900">
								{currentUser.user_metadata?.provider || 'Email'} Account
							</div>
						</div>

						<div>
							<div class="block text-sm font-medium text-gray-700">Member Since</div>
							<div class="mt-1 text-sm text-gray-900">
								{formatDate(currentUser.created_at)}
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</main>

<Footer />
