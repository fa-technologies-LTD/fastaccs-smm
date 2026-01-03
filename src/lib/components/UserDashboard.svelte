<script lang="ts">
	import { Package, CheckCircle, RefreshCw } from '@lucide/svelte';
	import OrderTab from './OrderTab.svelte';
	import PurchaseTab from './PurchaseTab.svelte';
	import AffiliateTab from './AffiliateTab.svelte';
	import WalletTab from './WalletTab.svelte';
	// import ProfileTab from './ProfileTab.svelte';

	let {
		name,
		orders,
		joinDate,
		affiliateData: initialAffiliateData = null,
		walletBalance: initialWalletBalance = 0,
		walletTransactions: initialWalletTransactions = [],
		purchases: initialPurchases = [],
		// user
	} = $props();

	let activeTab = $state('orders');

	// Calculate stats from orders
	let totalOrders = $derived(orders.length);
	let completedOrders = $derived(
		orders.filter((o: any) => o.status === 'delivered' || o.status === 'completed').length
	);
	let processingOrders = $derived(orders.filter((o: any) => o.status === 'processing').length);
	let totalSpent = $derived(
		orders.reduce((sum: number, order: any) => sum + (Number(order.totalAmount) || 0), 0)
	);
</script>

<div class="mx-auto max-w-6xl px-4 py-8">
	<!-- Header -->
	<div class="mb-8 rounded-lg border border-gray-200 bg-white p-6">
		<div class="flex items-center justify-between">
			<div class="flex items-center">
				<div
					class="mr-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-xl font-bold text-white"
				>
					{name
						.split(' ')
						.map((n: string) => n[0])
						.join('')}
				</div>
				<div>
					<h1 class="text-2xl text-gray-900">Welcome back, {name}!</h1>
					<p class="text-gray-600">Member since {new Date(joinDate).toDateString()}</p>
				</div>
			</div>
			<div class="text-right">
				<div class="text-sm text-gray-600">Total Spent</div>
				<div class="text-2xl font-bold text-blue-600">₦{totalSpent.toLocaleString()}</div>
			</div>
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<Package class="mr-3 h-8 w-8 text-blue-600" />
				<div>
					<div class="text-2xl font-bold text-gray-900">{totalOrders}</div>
					<div class="text-gray-600">Total Orders</div>
				</div>
			</div>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<CheckCircle class="mr-3 h-8 w-8 text-green-600" />
				<div>
					<div class="text-2xl font-bold text-gray-900">{completedOrders}</div>
					<div class="text-gray-600">Completed Orders</div>
				</div>
			</div>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<div class="flex items-center">
				<RefreshCw class="mr-3 h-8 w-8 text-blue-600" />
				<div>
					<div class="text-2xl font-bold text-gray-900">{processingOrders}</div>
					<div class="text-gray-600">In Progress</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Navigation Tabs -->
	<div class="mb-6">
		<nav class="flex space-x-8">
			<button
				onclick={() => (activeTab = 'orders')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'orders'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Order History
			</button>
			<button
				onclick={() => (activeTab = 'purchases')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'purchases'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Purchases
			</button>
			<button
				onclick={() => (activeTab = 'affiliate')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'affiliate'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Affiliate
			</button>
			<button
				onclick={() => (activeTab = 'wallet')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'wallet'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Wallet
			</button>
			<!-- Profile Settings tab commented out
			<button
				onclick={() => (activeTab = 'profile')}
				class="border-b-2 px-1 py-2 text-sm font-medium transition-colors
					{activeTab === 'profile'
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				Profile Settings
			</button>
			-->
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'orders'}
		<OrderTab initialOrders={orders} />
	{:else if activeTab === 'purchases'}
		<PurchaseTab {initialPurchases} />
	{:else if activeTab === 'affiliate'}
		<AffiliateTab {initialAffiliateData} />
	{:else if activeTab === 'wallet'}
		<WalletTab {initialWalletBalance} {initialWalletTransactions} />
		<!-- Profile Settings tab commented out
	{:else if activeTab === 'profile'}
		<ProfileTab {user} />
	-->
	{/if}
</div>
