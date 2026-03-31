<script lang="ts">
	import { Package, CheckCircle, RefreshCw } from '@lucide/svelte';
	import OrderTab from './OrderTab.svelte';
	import PurchaseTab from './PurchaseTab.svelte';
	import AffiliateTab from './AffiliateTab.svelte';
	// import WalletTab from './WalletTab.svelte';
	// import ProfileTab from './ProfileTab.svelte';

	let {
		name,
		orders,
		joinDate,
		affiliateData: initialAffiliateData = null,
		// walletBalance: initialWalletBalance = 0,
		// walletTransactions: initialWalletTransactions = [],
		purchases: initialPurchases = []
		// user
	} = $props();

	let activeTab = $state('purchases');

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
	<div
		class="mb-8 rounded-[var(--r-md)] border border-[var(--border-2)] p-6"
		style="background: var(--surface-2);"
	>
		<div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
			<div class="flex items-center">
				<div
					class="mr-4 flex h-16 w-16 items-center justify-center rounded-full text-sm font-semibold"
					style="background: linear-gradient(180deg, rgba(5,212,113,0.18), rgba(105,109,250,0.12)); border: 1px solid var(--border-2); color: var(--text);"
				>
					{name
						.split(' ')
						.map((n: string) => n[0])
						.join('')}
				</div>
				<div class="space-y-2">
					<h1
						class="text-base font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Welcome back, {name}!
					</h1>
					<p class="text-sm" style="color: var(--text-muted);">
						Member since {new Date(joinDate).toDateString()}
					</p>
				</div>
			</div>
			<!-- Wallet Balance commented out
			<div class="mt-2 self-start text-left sm:mt-0">
				<div class="text-xs" style="color: var(--text-dim);">Wallet Balance</div>
				<div class="text-base font-semibold" style="color: var(--primary);">
					₦{Number(initialWalletBalance).toLocaleString('en-US', {
						minimumFractionDigits: 2,
						maximumFractionDigits: 2
					})}
				</div>
			</div>
			-->
		</div>
	</div>

	<!-- Stats Cards -->
	<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
		<div
			class="rounded-[var(--r-md)] border border-[var(--border)] p-6"
			style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
		>
			<div class="flex items-center">
				<Package class="mr-3 h-8 w-8" style="color: var(--link);" />
				<div>
					<div
						class="text-sm font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						{totalOrders}
					</div>
					<div style="color: var(--text-muted);">Total Orders</div>
				</div>
			</div>
		</div>
		<div
			class="rounded-[var(--r-md)] border border-[var(--border)] p-6"
			style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
		>
			<div class="flex items-center">
				<CheckCircle class="mr-3 h-8 w-8" style="color: var(--primary);" />
				<div>
					<div
						class="text-sm font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						{completedOrders}
					</div>
					<div style="color: var(--text-muted);">Completed Orders</div>
				</div>
			</div>
		</div>
		<div
			class="rounded-[var(--r-md)] border border-[var(--border)] p-6"
			style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
		>
			<div class="flex items-center">
				<RefreshCw class="mr-3 h-8 w-8" style="color: var(--primary-strong);" />
				<div>
					<div
						class="text-sm font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						₦{totalSpent.toLocaleString()}
					</div>
					<div style="color: var(--text-muted);">Total Spent</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Quick Actions -->
	<div
		class="mb-8 rounded-[var(--r-md)] border border-[var(--border-2)] p-6"
		style="background: var(--surface-2);"
	>
		<h3
			class="mb-4 text-sm font-semibold"
			style="color: var(--text); font-family: var(--font-head);"
		>
			Quick Actions
		</h3>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<a
				href="/platforms"
				class="flex items-center justify-center rounded-full px-6 py-3 font-semibold transition-all hover:-translate-y-0.5"
				style="background: linear-gradient(180deg, rgba(105,109,250,0.18), rgba(170,173,255,0.10)); border: 1px solid rgba(170,173,255,0.25); color: var(--text);"
			>
				Browse Accounts
			</a>
			<!-- Add Funds button commented out
			<button
				onclick={() => (activeTab = 'wallet')}
				class="flex items-center justify-center rounded-full px-6 py-3 font-semibold transition-all hover:-translate-y-0.5"
				style="background: linear-gradient(180deg, rgba(5,212,113,0.95), rgba(13,145,82,0.95)); border: 1px solid rgba(5,212,113,0.40); color: #04140C; box-shadow: var(--glow-primary);"
			>
				Add Funds
			</button>
			-->
			<a
				href="/support"
				class="flex items-center justify-center rounded-full px-6 py-3 font-semibold transition-all hover:-translate-y-0.5"
				style="background: linear-gradient(180deg, rgba(105,109,250,0.18), rgba(170,173,255,0.10)); border: 1px solid rgba(170,173,255,0.25); color: var(--text);"
			>
				Contact Support
			</a>
		</div>
	</div>

	<!-- Navigation Tabs -->
	<div class="mb-6 overflow-x-auto border-b border-[var(--border)]">
		<nav class="flex flex-nowrap gap-6 pb-2 whitespace-nowrap">
			<button
				onclick={() => (activeTab = 'orders')}
				class="border-b-2 px-1 py-2 text-sm font-semibold transition-all"
				style="border-color: {activeTab === 'orders'
					? 'var(--primary)'
					: 'transparent'}; color: {activeTab === 'orders'
					? 'var(--primary)'
					: 'var(--text-dim)'}; font-family: var(--font-head);"
			>
				Order
			</button>
			<button
				onclick={() => (activeTab = 'purchases')}
				class="border-b-2 px-1 py-2 text-sm font-semibold transition-all"
				style="border-color: {activeTab === 'purchases'
					? 'var(--primary)'
					: 'transparent'}; color: {activeTab === 'purchases'
					? 'var(--primary)'
					: 'var(--text-dim)'}; font-family: var(--font-head);"
			>
				Purchases
			</button>
			<button
				onclick={() => (activeTab = 'affiliate')}
				class="border-b-2 px-1 py-2 text-sm font-semibold transition-all"
				style="border-color: {activeTab === 'affiliate'
					? 'var(--primary)'
					: 'transparent'}; color: {activeTab === 'affiliate'
					? 'var(--primary)'
					: 'var(--text-dim)'}; font-family: var(--font-head);"
			>
				Affiliate
			</button>
			<!-- Wallet tab commented out
			<button
				onclick={() => (activeTab = 'wallet')}
				class="border-b-2 px-1 py-2 text-sm font-semibold transition-all"
				style="border-color: {activeTab === 'wallet'
					? 'var(--primary)'
					: 'transparent'}; color: {activeTab === 'wallet'
					? 'var(--primary)'
					: 'var(--text-dim)'}; font-family: var(--font-head);"
			>
				Wallet
			</button>
			-->
			<!-- Profile Settings tab commented out
			<button
				onclick={() => (activeTab = 'profile')}
				class="border-b-2 px-1 py-2 text-sm font-semibold transition-all"
				style="border-color: {activeTab === 'profile' ? 'var(--primary)' : 'transparent'}; color: {activeTab === 'profile' ? 'var(--primary)' : 'var(--text-dim)'}; font-family: var(--font-head);"
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
		<!-- Wallet tab commented out
	{:else if activeTab === 'wallet'}
		<WalletTab {initialWalletBalance} {initialWalletTransactions} />
		-->
		<!-- Profile Settings tab commented out
	{:else if activeTab === 'profile'}
		<ProfileTab {user} />
	-->
	{/if}
</div>
