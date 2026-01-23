<script lang="ts">
	import {
		TrendingUp,
		DollarSign,
		ShoppingCart,
		Users,
		Package,
		Wallet,
		ArrowUp,
		ArrowDown
	} from '@lucide/svelte';
	import { formatPrice } from '$lib/helpers/utils';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let stats = $derived(data.stats || {});

	function calculatePercentageChange(current: number, previous: number): number {
		if (previous === 0) return 0;
		return ((current - previous) / previous) * 100;
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold" style="color: var(--text)">Analytics Dashboard</h1>
		<p class="mt-1" style="color: var(--text-muted)">Track your business performance and metrics</p>
	</div>

	<!-- Key Metrics -->
	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
		<!-- Total Revenue -->
		<div
			class="group rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-sm font-medium" style="color: var(--text-muted)">Total Revenue</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--text)">
						{formatPrice(stats.totalRevenue || 0)}
					</p>
					{#if stats.revenueChange !== undefined}
						<div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
							{#if stats.revenueChange >= 0}
								<div class="flex items-center gap-1">
									<ArrowUp class="h-4 w-4 text-green-600" />
									<span class="text-green-600">+{stats.revenueChange.toFixed(1)}%</span>
								</div>
							{:else}
								<div class="flex items-center gap-1">
									<ArrowDown class="h-4 w-4 text-red-600" />
									<span class="text-red-600">{stats.revenueChange.toFixed(1)}%</span>
								</div>
							{/if}
							<span style="color: var(--text-muted)">vs last month</span>
						</div>
					{/if}
				</div>
				<div class="rounded-full bg-green-100 p-3">
					<DollarSign class="h-6 w-6 text-green-600 group-hover:scale-80 group-hover:rotate-20" />
				</div>
			</div>
		</div>

		<!-- Total Orders -->
		<div
			class="group rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-sm font-medium" style="color: var(--text-muted)">Total Orders</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--text)">{stats.totalOrders || 0}</p>
					{#if stats.ordersChange !== undefined}
						<div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
							{#if stats.ordersChange >= 0}
								<div class="flex items-center gap-1">
									<ArrowUp class="h-4 w-4 text-green-600" />
									<span class="text-green-600">+{stats.ordersChange.toFixed(1)}%</span>
								</div>
							{:else}
								<div class="flex items-center gap-1">
									<ArrowDown class="h-4 w-4 text-red-600" />
									<span class="text-red-600">{stats.ordersChange.toFixed(1)}%</span>
								</div>
							{/if}
							<span style="color: var(--text-muted)">vs last month</span>
						</div>
					{/if}
				</div>
				<div class="rounded-full bg-blue-100 p-3">
					<ShoppingCart class="h-6 w-6 text-blue-600 group-hover:scale-80 group-hover:rotate-20" />
				</div>
			</div>
		</div>

		<!-- Total Customers -->
		<div
			class="group rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-sm font-medium" style="color: var(--text-muted)">Total Customers</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--text)">
						{stats.totalCustomers || 0}
					</p>
					{#if stats.customersChange !== undefined}
						<div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
							{#if stats.customersChange >= 0}
								<div class="flex items-center gap-1">
									<ArrowUp class="h-4 w-4 text-green-600" />
									<span class="text-green-600">+{stats.customersChange.toFixed(1)}%</span>
								</div>
							{:else}
								<div class="flex items-center gap-1">
									<ArrowDown class="h-4 w-4 text-red-600" />
									<span class="text-red-600">{stats.customersChange.toFixed(1)}%</span>
								</div>
							{/if}
							<span style="color: var(--text-muted)">vs last month</span>
						</div>
					{/if}
				</div>
				<div class="rounded-full bg-purple-100 p-3">
					<Users class="h-6 w-6 text-purple-600 group-hover:scale-80 group-hover:rotate-20" />
				</div>
			</div>
		</div>

		<!-- Accounts Sold -->
		<div
			class="group rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-sm font-medium" style="color: var(--text-muted)">Accounts Sold</p>
					<p class="mt-2 text-3xl font-bold" style="color: var(--text)">
						{stats.accountsSold || 0}
					</p>
					{#if stats.accountsChange !== undefined}
						<div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
							{#if stats.accountsChange >= 0}
								<div class="flex items-center gap-1">
									<ArrowUp class="h-4 w-4 text-green-600" />
									<span class="text-green-600">+{stats.accountsChange.toFixed(1)}%</span>
								</div>
							{:else}
								<div class="flex items-center gap-1">
									<ArrowDown class="h-4 w-4 text-red-600" />
									<span class="text-red-600">{stats.accountsChange.toFixed(1)}%</span>
								</div>
							{/if}
							<span style="color: var(--text-muted)">vs last month</span>
						</div>
					{/if}
				</div>
				<div class="rounded-full bg-orange-100 p-3">
					<Package class="h-6 w-6 text-orange-600 group-hover:scale-80 group-hover:rotate-20" />
				</div>
			</div>
		</div>
	</div>

	<!-- Secondary Metrics -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Wallet Stats -->
		<div
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<h2 class="mb-4 text-lg font-semibold" style="color: var(--text)">Wallet Statistics</h2>
			<div class="space-y-4">
				<div class="flex items-center justify-between">
					<span style="color: var(--text-muted)">Total Wallet Balance</span>
					<span class="font-semibold" style="color: var(--text)">
						{formatPrice(stats.totalWalletBalance || 0)}
					</span>
				</div>
				<div class="flex items-center justify-between">
					<span style="color: var(--text-muted)">Total Deposits</span>
					<span class="font-semibold text-green-600">
						{formatPrice(stats.totalDeposits || 0)}
					</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-gray-600">Total Debits</span>
					<span class="font-semibold text-red-600">
						{formatPrice(stats.totalDebits || 0)}
					</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-gray-600">Active Wallets</span>
					<span class="font-semibold text-gray-900">{stats.activeWallets || 0}</span>
				</div>
			</div>
		</div>

		<!-- Affiliate Stats -->
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Affiliate Performance</h2>
			<div class="space-y-4">
				<div class="flex items-center justify-between">
					<span class="text-gray-600">Active Affiliates</span>
					<span class="font-semibold text-gray-900">{stats.activeAffiliates || 0}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-gray-600">Total Referrals</span>
					<span class="font-semibold text-gray-900">{stats.totalReferrals || 0}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-gray-600">Affiliate Sales</span>
					<span class="font-semibold text-gray-900">
						{formatPrice(stats.affiliateSales || 0)}
					</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-gray-600">Total Commissions</span>
					<span class="font-semibold text-purple-600">
						{formatPrice(stats.totalCommissions || 0)}
					</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Inventory Stats -->
	<div class="rounded-lg border border-gray-200 bg-white p-6">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Inventory Overview</h2>
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-4">
			<div>
				<p class="text-sm text-gray-600">Total Accounts</p>
				<p class="mt-2 text-2xl font-bold text-gray-900">{stats.totalAccounts || 0}</p>
			</div>
			<div>
				<p class="text-sm text-gray-600">Available</p>
				<p class="mt-2 text-2xl font-bold text-green-600">{stats.availableAccounts || 0}</p>
			</div>
			<div>
				<p class="text-sm text-gray-600">Sold</p>
				<p class="mt-2 text-2xl font-bold text-blue-600">{stats.soldAccounts || 0}</p>
			</div>
			<div>
				<p class="text-sm text-gray-600">Pending</p>
				<p class="mt-2 text-2xl font-bold text-yellow-600">{stats.pendingAccounts || 0}</p>
			</div>
		</div>
	</div>

	<!-- Top Performing Categories -->
	{#if stats.topCategories && stats.topCategories.length > 0}
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Top Performing Categories</h2>
			<div class="space-y-3">
				{#each stats.topCategories as category}
					<div class="flex items-center justify-between rounded-lg bg-gray-50 p-4">
						<div>
							<p class="font-medium text-gray-900">{category.name}</p>
							<p class="text-sm text-gray-600">{category.orderCount} orders</p>
						</div>
						<div class="text-right">
							<p class="font-semibold text-gray-900">{formatPrice(category.revenue)}</p>
							<p class="text-sm text-gray-600">{category.unitsSold} accounts sold</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
