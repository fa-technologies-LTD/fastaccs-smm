<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { goto } from '$app/navigation';
	import {
		ShoppingCart,
		Package,
		User,
		LogOut,
		Eye,
		RefreshCw,
		Calendar,
		Clock,
		CheckCircle,
		AlertCircle,
		Lock
	} from '@lucide/svelte';
	import type { PageData } from './$types';
	import type { Order, OrderItem, Account } from '@prisma/client';

	// Define proper types for our data
	interface OrderWithDetails extends Order {
		orderItems: (OrderItem & {
			accounts: Account[];
		})[];
	}

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Reactive state
	let activeTab = $state('orders');
	let selectedOrder = $state<OrderWithDetails | null>(null);
	let showAccountDetails = $state(false);

	// Derived state
	const user = $derived(data.user);
	const orders = $derived(data.orders || []);
	const recentOrders = $derived(orders.slice(0, 5));
	const totalOrders = $derived(orders.length);
	const completedOrders = $derived(
		orders.filter((order: OrderWithDetails) => order.status === 'completed').length
	);
	const totalSpent = $derived(
		orders.reduce((sum: number, order: OrderWithDetails) => sum + Number(order.totalAmount), 0)
	);

	async function handleLogout() {
		try {
			const response = await fetch('/auth/logout', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				goto('/');
			} else {
				console.error('Logout failed');
			}
		} catch (error) {
			console.error('Logout error:', error);
			// Fallback - redirect anyway
			goto('/');
		}
	}

	async function viewOrderDetails(orderId: string) {
		try {
			const response = await fetch(`/api/orders/${orderId}`);
			if (response.ok) {
				const result = await response.json();
				selectedOrder = result.data;
			} else {
				console.error('Failed to fetch order details');
			}
		} catch (error) {
			console.error('Error fetching order details:', error);
		}
	}

	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN'
		}).format(price);
	}

	function formatDate(date: string | Date): string {
		const dateObj = typeof date === 'string' ? new Date(date) : date;
		return dateObj.toLocaleDateString('en-NG', {
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

<main class="min-h-screen bg-gray-50 py-4 sm:py-8">
	<div class="mx-auto max-w-6xl px-4 sm:px-6">
		<!-- Header -->
		<div class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0 flex-1">
				<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Dashboard</h1>
				{#if user}
					<p class="mt-1 truncate text-sm text-gray-600 sm:text-base">
						Welcome back, {user.fullName || user.email}
					</p>
				{/if}
			</div>
			<button
				onclick={handleLogout}
				class="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 px-4 py-3 text-red-600 transition-colors hover:bg-red-50 sm:w-auto sm:py-2"
			>
				<LogOut size={16} />
				Logout
			</button>
		</div>

		<!-- Stats Overview -->
		<div class="mb-6 grid grid-cols-1 gap-4 sm:mb-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
			<div class="rounded-lg bg-white p-4 shadow-sm sm:p-6">
				<div class="flex items-center">
					<div
						class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-100 sm:h-12 sm:w-12"
					>
						<Package class="h-5 w-5 text-purple-600 sm:h-6 sm:w-6" />
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium text-gray-600 sm:text-sm">Total Orders</p>
						<p class="text-xl font-semibold text-gray-900 sm:text-2xl">{totalOrders}</p>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-white p-4 shadow-sm sm:p-6">
				<div class="flex items-center">
					<div
						class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-100 sm:h-12 sm:w-12"
					>
						<CheckCircle class="h-5 w-5 text-green-600 sm:h-6 sm:w-6" />
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium text-gray-600 sm:text-sm">Completed Orders</p>
						<p class="text-xl font-semibold text-gray-900 sm:text-2xl">{completedOrders}</p>
					</div>
				</div>
			</div>

			<div class="col-span-1 rounded-lg bg-white p-4 shadow-sm sm:col-span-2 sm:p-6 lg:col-span-1">
				<div class="flex items-center">
					<div
						class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 sm:h-12 sm:w-12"
					>
						<ShoppingCart class="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
					</div>
					<div class="ml-3 min-w-0 flex-1 sm:ml-4">
						<p class="text-xs font-medium text-gray-600 sm:text-sm">Total Spent</p>
						<p class="text-xl font-semibold text-gray-900 sm:text-2xl">{formatPrice(totalSpent)}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Tab Navigation -->
		<div class="mb-6 border-b border-gray-200 sm:mb-8">
			<nav class="scrollbar-hide flex space-x-4 overflow-x-auto sm:space-x-8">
				<button
					onclick={() => (activeTab = 'orders')}
					class="flex items-center gap-2 pb-3 text-sm font-medium whitespace-nowrap sm:pb-4 {activeTab ===
					'orders'
						? 'border-b-2 border-purple-500 text-purple-600'
						: 'text-gray-500 hover:text-gray-700'}"
				>
					<Package size={16} />
					<span class="hidden sm:inline">My Orders</span>
					<span class="sm:hidden">Orders</span>
				</button>
				<button
					onclick={() => (activeTab = 'accounts')}
					class="flex items-center gap-2 pb-3 text-sm font-medium whitespace-nowrap sm:pb-4 {activeTab ===
					'accounts'
						? 'border-b-2 border-purple-500 text-purple-600'
						: 'text-gray-500 hover:text-gray-700'}"
				>
					<Lock size={16} />
					<span class="hidden sm:inline">My Accounts</span>
					<span class="sm:hidden">Accounts</span>
				</button>
				<button
					onclick={() => (activeTab = 'profile')}
					class="flex items-center gap-2 pb-3 text-sm font-medium whitespace-nowrap sm:pb-4 {activeTab ===
					'profile'
						? 'border-b-2 border-purple-500 text-purple-600'
						: 'text-gray-500 hover:text-gray-700'}"
				>
					<User size={16} />
					<span class="hidden sm:inline">Profile</span>
					<span class="sm:hidden">Profile</span>
				</button>
			</nav>
		</div>

		<!-- Content -->
		{#if activeTab === 'orders'}
			<div class="rounded-lg bg-white p-4 shadow-sm sm:p-6">
				<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<h2 class="text-lg font-semibold sm:text-xl">Order History</h2>
					<button
						onclick={() => goto('/platforms')}
						class="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-white transition-colors hover:bg-purple-700 sm:w-auto sm:py-2"
					>
						<ShoppingCart size={16} />
						Shop More
					</button>
				</div>

				{#if orders.length === 0}
					<div class="px-4 py-12 text-center">
						<Package size={48} class="mx-auto mb-4 text-gray-300" />
						<h3 class="mb-2 text-lg font-medium text-gray-900">No orders yet</h3>
						<p class="mx-auto mb-6 max-w-md text-gray-600">
							Start shopping to see your orders here
						</p>
						<button
							onclick={() => goto('/platforms')}
							class="w-full rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-purple-700 sm:w-auto"
						>
							Browse Accounts
						</button>
					</div>
				{:else}
					<div class="space-y-4">
						{#each orders as order}
							<div class="rounded-lg border p-4 sm:p-6">
								<div
									class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
								>
									<div class="min-w-0 flex-1">
										<h3 class="truncate font-semibold text-gray-900">Order #{order.orderNumber}</h3>
										<div
											class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600 sm:gap-4"
										>
											<span class="flex items-center gap-1 whitespace-nowrap">
												<Calendar size={14} />
												{formatDate(order.createdAt)}
											</span>
											<span
												class="rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap {getStatusColor(
													order.status
												)}"
											>
												{order.status.charAt(0).toUpperCase() + order.status.slice(1)}
											</span>
											{#if order.deliveryStatus}
												<span class="text-xs whitespace-nowrap text-gray-500">
													Delivery: {order.deliveryStatus}
												</span>
											{/if}
										</div>
									</div>
									<div class="flex-shrink-0 text-left sm:text-right">
										<div class="text-lg font-bold text-purple-600">
											{formatPrice(Number(order.totalAmount))}
										</div>
										<div class="text-sm text-gray-600">{order.deliveryMethod || 'Email'}</div>
									</div>
								</div>

								{#if order.orderItems && order.orderItems.length > 0}
									<div class="space-y-3">
										{#each order.orderItems as item}
											<div class="flex items-center gap-4 rounded-lg bg-gray-50 p-3">
												<div
													class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-purple-500 to-purple-600"
												>
													<div class="flex h-full w-full items-center justify-center">
														<Package size={16} class="text-white" />
													</div>
												</div>
												<div class="flex-1">
													<h4 class="font-medium text-gray-900">{item.productName}</h4>
													<p class="text-sm text-gray-600">
														Qty: {item.quantity} •
														{item.accounts?.length || 0} accounts delivered
													</p>
												</div>
												<div class="text-right">
													<div class="font-semibold text-gray-900">
														{formatPrice(Number(item.totalPrice))}
													</div>
													{#if order.status === 'completed' && item.accounts?.length > 0}
														<button
															onclick={() => viewOrderDetails(order.id)}
															class="mt-1 text-xs text-purple-600 hover:text-purple-700"
														>
															View Accounts
														</button>
													{/if}
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
		{:else if activeTab === 'accounts'}
			<div class="rounded-lg bg-white p-6 shadow-sm">
				<h2 class="mb-6 text-xl font-semibold">My Purchased Accounts</h2>

				{#if selectedOrder}
					<div class="mb-6 rounded-lg border p-4">
						<div class="mb-4 flex items-center justify-between">
							<h3 class="font-semibold">Order #{selectedOrder.orderNumber}</h3>
							<button
								onclick={() => (selectedOrder = null)}
								class="text-sm text-gray-500 hover:text-gray-700"
							>
								← Back to orders
							</button>
						</div>

						{#if selectedOrder.orderItems}
							{#each selectedOrder.orderItems as item}
								{#if item.accounts && item.accounts.length > 0}
									<div class="mb-6">
										<h4 class="mb-3 font-medium text-gray-900">{item.productName}</h4>
										<div class="space-y-3">
											{#each item.accounts as account, index}
												<div class="rounded-lg border bg-gray-50 p-4">
													<div class="mb-2 flex items-center justify-between">
														<span class="font-medium">Account {index + 1}</span>
														<span class="text-xs text-gray-500">
															Status: {account.status}
														</span>
													</div>
													<div class="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
														{#if account.username}
															<div>
																<span class="font-medium">Username:</span>
																<span class="font-mono">{account.username}</span>
															</div>
														{/if}
														{#if account.email}
															<div>
																<span class="font-medium">Email:</span>
																<span class="font-mono">{account.email}</span>
															</div>
														{/if}
														{#if account.password}
															<div>
																<span class="font-medium">Password:</span>
																<span class="font-mono">{account.password}</span>
															</div>
														{/if}
														{#if account.emailPassword}
															<div>
																<span class="font-medium">Email Password:</span>
																<span class="font-mono">{account.emailPassword}</span>
															</div>
														{/if}
														{#if account.followers}
															<div>
																<span class="font-medium">Followers:</span>
																{account.followers.toLocaleString()}
															</div>
														{/if}
														{#if account.ageMonths}
															<div>
																<span class="font-medium">Account Age:</span>
																{account.ageMonths} months
															</div>
														{/if}
													</div>
													{#if account.linkUrl}
														<div class="mt-2 border-t pt-2">
															<a
																href={account.linkUrl}
																target="_blank"
																rel="noopener noreferrer"
																class="text-sm text-purple-600 hover:text-purple-700"
															>
																Direct Login Link →
															</a>
														</div>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								{/if}
							{/each}
						{/if}
					</div>
				{:else}
					<div class="py-12 text-center">
						<Lock size={48} class="mx-auto mb-4 text-gray-300" />
						<h3 class="mb-2 text-lg font-medium text-gray-900">Account Details</h3>
						<p class="mb-6 text-gray-600">
							Select an order from the Orders tab to view your account details
						</p>
						<button
							onclick={() => (activeTab = 'orders')}
							class="rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white hover:bg-purple-700"
						>
							View Orders
						</button>
					</div>
				{/if}
			</div>
		{:else if activeTab === 'profile'}
			<div class="rounded-lg bg-white p-6 shadow-sm">
				<h2 class="mb-6 text-xl font-semibold">Profile Information</h2>

				{#if user}
					<div class="space-y-6">
						<div class="flex items-center gap-4">
							{#if user.avatarUrl}
								<img src={user.avatarUrl} alt="Profile" class="h-16 w-16 rounded-full" />
							{:else}
								<div class="flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
									<User class="h-8 w-8 text-purple-600" />
								</div>
							{/if}
							<div>
								<h3 class="text-lg font-semibold text-gray-900">
									{user.fullName || user.email}
								</h3>
								<p class="text-gray-600">{user.email}</p>
							</div>
						</div>

						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div>
								<div class="block text-sm font-medium text-gray-700">Full Name</div>
								<div class="mt-1 text-sm text-gray-900">
									{user.fullName || 'Not provided'}
								</div>
							</div>

							<div>
								<div class="block text-sm font-medium text-gray-700">Email</div>
								<div class="mt-1 text-sm text-gray-900">{user.email}</div>
							</div>

							<div>
								<div class="block text-sm font-medium text-gray-700">Phone</div>
								<div class="mt-1 text-sm text-gray-900">
									{user.phone || 'Not provided'}
								</div>
							</div>

							<div>
								<div class="block text-sm font-medium text-gray-700">Account Type</div>
								<div class="mt-1 text-sm text-gray-900">
									{user.userType || 'Customer'}
								</div>
							</div>

							<div>
								<div class="block text-sm font-medium text-gray-700">Member Since</div>
								<div class="mt-1 text-sm text-gray-900">
									{formatDate(user.createdAt)}
								</div>
							</div>

							<div>
								<div class="block text-sm font-medium text-gray-700">Email Verified</div>
								<div class="mt-1">
									{#if user.emailVerified}
										<span class="inline-flex items-center gap-1 text-sm text-green-600">
											<CheckCircle size={14} />
											Verified
										</span>
									{:else}
										<span class="inline-flex items-center gap-1 text-sm text-yellow-600">
											<AlertCircle size={14} />
											Not verified
										</span>
									{/if}
								</div>
							</div>
						</div>

						<div class="border-t pt-6">
							<button
								class="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
								onclick={() => goto('/profile/edit')}
							>
								Edit Profile
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</main>

<Footer />
