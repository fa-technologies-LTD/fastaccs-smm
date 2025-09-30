<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		Package,
		AlertTriangle,
		TrendingUp,
		Eye,
		Search,
		Filter,
		RefreshCw,
		BarChart3,
		ShoppingCart,
		Database,
		Clock,
		CheckCircle,
		XCircle
	} from '@lucide/svelte';

	interface Props {
		data: {
			stats: {
				total_tiers: number;
				total_available: number;
				total_reserved: number;
				out_of_stock: number;
				low_stock: number;
				platforms: number;
			};
			alerts: Array<{
				tier_name: string;
				platform_name: string;
				available: number;
				threshold: number;
				severity: 'out_of_stock' | 'critical' | 'low';
			}>;
			inventory: Array<{
				product_id: string;
				tier_name: string;
				platform_name: string;
				accounts_available: number;
				reservations_active: number;
				visible_available: number;
				last_updated: string;
			}>;
			filters: {
				platform: string;
				status: string;
			};
			error?: string;
		};
	}

	let { data }: Props = $props();
	let searchTerm = $state('');
	let showFilters = $state(false);

	// Filtered inventory based on search
	let filteredInventory = $derived.by(() => {
		if (!searchTerm) return data.inventory;
		const term = searchTerm.toLowerCase();
		return data.inventory.filter(
			(item) =>
				item.tier_name?.toLowerCase().includes(term) ||
				item.platform_name?.toLowerCase().includes(term)
		);
	});

	function getSeverityColor(severity: string) {
		switch (severity) {
			case 'out_of_stock':
				return 'text-red-600 bg-red-50 border-red-200';
			case 'critical':
				return 'text-orange-600 bg-orange-50 border-orange-200';
			case 'low':
				return 'text-yellow-600 bg-yellow-50 border-yellow-200';
			default:
				return 'text-gray-600 bg-gray-50 border-gray-200';
		}
	}

	function getStockStatusColor(available: number) {
		if (available === 0) return 'text-red-600 bg-red-100';
		if (available < 5) return 'text-orange-600 bg-orange-100';
		if (available < 10) return 'text-yellow-600 bg-yellow-100';
		return 'text-green-600 bg-green-100';
	}

	function updateFilters(key: string, value: string) {
		const url = new URL($page.url);
		if (value === 'all') {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, value);
		}
		goto(url.toString(), { replaceState: true });
	}

	function refreshData() {
		goto($page.url.toString(), { invalidateAll: true });
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleString();
	}
</script>

<svelte:head>
	<title>Inventory Management - FastAccs</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 py-8">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="flex items-center gap-3 text-3xl font-bold text-gray-900">
						<Package class="h-8 w-8 text-blue-600" />
						Inventory Management
					</h1>
					<p class="mt-2 text-gray-600">
						Monitor stock levels, track availability, and manage inventory across all platforms
					</p>
				</div>
				<button
					onclick={refreshData}
					class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
				>
					<RefreshCw class="h-4 w-4" />
					Refresh
				</button>
			</div>
		</div>

		{#if data.error}
			<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
				<div class="flex items-center gap-2 text-red-800">
					<AlertTriangle class="h-5 w-5" />
					<span class="font-medium">Error loading inventory data</span>
				</div>
				<p class="mt-1 text-red-700">{data.error}</p>
			</div>
		{/if}

		<!-- Stats Cards -->
		<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-blue-100 p-2">
						<Database class="h-6 w-6 text-blue-600" />
					</div>
					<div>
						<p class="text-sm text-gray-600">Total Tiers</p>
						<p class="text-2xl font-bold text-gray-900">{data.stats.total_tiers}</p>
					</div>
				</div>
			</div>

			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-green-100 p-2">
						<CheckCircle class="h-6 w-6 text-green-600" />
					</div>
					<div>
						<p class="text-sm text-gray-600">Available</p>
						<p class="text-2xl font-bold text-gray-900">{data.stats.total_available}</p>
					</div>
				</div>
			</div>

			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-yellow-100 p-2">
						<Clock class="h-6 w-6 text-yellow-600" />
					</div>
					<div>
						<p class="text-sm text-gray-600">Reserved</p>
						<p class="text-2xl font-bold text-gray-900">{data.stats.total_reserved}</p>
					</div>
				</div>
			</div>

			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-red-100 p-2">
						<XCircle class="h-6 w-6 text-red-600" />
					</div>
					<div>
						<p class="text-sm text-gray-600">Out of Stock</p>
						<p class="text-2xl font-bold text-gray-900">{data.stats.out_of_stock}</p>
					</div>
				</div>
			</div>

			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-orange-100 p-2">
						<AlertTriangle class="h-6 w-6 text-orange-600" />
					</div>
					<div>
						<p class="text-sm text-gray-600">Low Stock</p>
						<p class="text-2xl font-bold text-gray-900">{data.stats.low_stock}</p>
					</div>
				</div>
			</div>

			<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-purple-100 p-2">
						<BarChart3 class="h-6 w-6 text-purple-600" />
					</div>
					<div>
						<p class="text-sm text-gray-600">Platforms</p>
						<p class="text-2xl font-bold text-gray-900">{data.stats.platforms}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Stock Alerts -->
		{#if data.alerts.length > 0}
			<div class="mb-8">
				<h2 class="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-900">
					<AlertTriangle class="h-5 w-5 text-orange-500" />
					Stock Alerts
				</h2>
				<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
					<div class="divide-y divide-gray-200">
						{#each data.alerts as alert}
							<div class="flex items-center justify-between p-4">
								<div class="flex items-center gap-3">
									<div class="rounded-lg p-2 {getSeverityColor(alert.severity)}">
										<Package class="h-4 w-4" />
									</div>
									<div>
										<p class="font-medium text-gray-900">
											{alert.platform_name} - {alert.tier_name}
										</p>
										<p class="text-sm text-gray-600">
											{alert.available} items remaining (threshold: {alert.threshold})
										</p>
									</div>
								</div>
								<span
									class="rounded-full px-3 py-1 text-xs font-medium {getSeverityColor(
										alert.severity
									)}"
								>
									{alert.severity.replace('_', ' ').toUpperCase()}
								</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Filters and Search -->
		<div class="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
				<div class="max-w-md flex-1">
					<div class="relative">
						<Search
							class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400"
						/>
						<input
							bind:value={searchTerm}
							type="text"
							placeholder="Search tiers or platforms..."
							class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>

				<div class="flex gap-3">
					<select
						onchange={(e) => updateFilters('platform', e.currentTarget.value)}
						value={data.filters.platform}
						class="rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
					>
						<option value="all">All Platforms</option>
					</select>

					<select
						onchange={(e) => updateFilters('status', e.currentTarget.value)}
						value={data.filters.status}
						class="rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
					>
						<option value="all">All Status</option>
						<option value="in_stock">In Stock</option>
						<option value="low_stock">Low Stock</option>
						<option value="out_of_stock">Out of Stock</option>
					</select>
				</div>
			</div>
		</div>

		<!-- Inventory Table -->
		<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 class="text-lg font-medium text-gray-900">
					Tier Inventory ({filteredInventory.length} items)
				</h2>
			</div>

			{#if filteredInventory.length === 0}
				<div class="p-12 text-center">
					<Package class="mx-auto h-12 w-12 text-gray-400" />
					<h3 class="mt-2 text-sm font-medium text-gray-900">No inventory items</h3>
					<p class="mt-1 text-sm text-gray-500">
						{searchTerm ? 'No items match your search criteria.' : 'No inventory data available.'}
					</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Platform & Tier
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Available
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Reserved
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Visible
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Status
								</th>
								<th
									class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
								>
									Last Updated
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each filteredInventory as item}
								<tr class="hover:bg-gray-50">
									<td class="px-6 py-4 whitespace-nowrap">
										<div>
											<div class="text-sm font-medium text-gray-900">{item.tier_name}</div>
											<div class="text-sm text-gray-500">{item.platform_name}</div>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="text-sm font-medium text-gray-900">{item.accounts_available}</span>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="text-sm text-gray-900">{item.reservations_active}</span>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="text-sm font-medium text-gray-900">{item.visible_available}</span>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span
											class="inline-flex rounded-full px-2 py-1 text-xs font-medium {getStockStatusColor(
												item.visible_available
											)}"
										>
											{item.visible_available === 0
												? 'Out of Stock'
												: item.visible_available < 5
													? 'Critical'
													: item.visible_available < 10
														? 'Low Stock'
														: 'In Stock'}
										</span>
									</td>
									<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
										{formatDate(item.last_updated)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</div>
