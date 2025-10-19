<script lang="ts">
	import {
		getInventoryByPlatforms,
		getInventoryStats,
		type InventoryByPlatform,
		type InventoryStats
	} from '$lib/services/inventory';
	import { onMount } from 'svelte';

	// Props from page data
	let { data } = $props<{ data: { inventory?: InventoryByPlatform[]; stats?: InventoryStats } }>();

	// State
	let searchTerm = $state('');
	let loading = $state(false);
	let inventory = $state<InventoryByPlatform[]>([]);
	let stats = $state<InventoryStats | null>(null);

	// Filter inventory based on search
	const filteredInventory = $derived.by(() => {
		if (!inventory || !Array.isArray(inventory)) return [];

		if (!searchTerm) return inventory;

		return inventory.filter(
			(item: InventoryByPlatform) =>
				item.platform.toLowerCase().includes(searchTerm.toLowerCase()) ||
				item.tier.toLowerCase().includes(searchTerm.toLowerCase())
		);
	});

	// Calculate summary stats from filtered inventory
	const summaryStats = $derived.by(() => {
		const totalAccounts = filteredInventory.reduce(
			(sum: number, item: InventoryByPlatform) => sum + (item.total_accounts || 0),
			0
		);
		const availableAccounts = filteredInventory.reduce(
			(sum: number, item: InventoryByPlatform) => sum + (item.available_accounts || 0),
			0
		);
		const assignedAccounts = filteredInventory.reduce(
			(sum: number, item: InventoryByPlatform) => sum + (item.assigned_accounts || 0),
			0
		);
		const deliveredAccounts = filteredInventory.reduce(
			(sum: number, item: InventoryByPlatform) => sum + (item.delivered_accounts || 0),
			0
		);
		const platforms = new Set(filteredInventory.map((item: InventoryByPlatform) => item.platform))
			.size;

		return {
			total_accounts: totalAccounts,
			available_accounts: availableAccounts,
			assigned_accounts: assignedAccounts,
			delivered_accounts: deliveredAccounts,
			platforms
		};
	});

	// Load inventory data
	async function loadInventory() {
		loading = true;
		try {
			const [inventoryResult, statsResult] = await Promise.all([
				getInventoryByPlatforms(),
				getInventoryStats()
			]);

			if (inventoryResult.data) {
				inventory = inventoryResult.data;
			}
			if (statsResult.data) {
				stats = statsResult.data;
			}
		} catch (error) {
			console.error('Failed to load inventory:', error);
		} finally {
			loading = false;
		}
	}

	// Cleanup orphaned allocated accounts
	let cleanupLoading = $state(false);
	let cleanupMessage = $state<string | null>(null);

	async function cleanupOrphanedAccounts() {
		if (!confirm('This will reset orphaned allocated accounts back to available. Are you sure?')) {
			return;
		}

		cleanupLoading = true;
		cleanupMessage = null;

		try {
			const response = await fetch('/api/admin/cleanup/allocated-accounts', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();

			if (response.ok) {
				cleanupMessage = `✅ ${result.message}`;
				// Reload inventory to see updated counts
				await loadInventory();
			} else {
				cleanupMessage = `❌ Error: ${result.error}`;
			}
		} catch (error) {
			console.error('Cleanup failed:', error);
			cleanupMessage = '❌ Failed to cleanup accounts';
		} finally {
			cleanupLoading = false;
			// Clear message after 5 seconds
			setTimeout(() => {
				cleanupMessage = null;
			}, 5000);
		}
	}

	// Initialize with page data or load fresh data
	onMount(() => {
		if (data.inventory && data.stats) {
			inventory = data.inventory;
			stats = data.stats;
		} else {
			loadInventory();
		}
	});

	// Get status color
	function getStatusColor(status: string): string {
		switch (status) {
			case 'in_stock':
				return 'text-green-600 bg-green-100';
			case 'low_stock':
				return 'text-yellow-600 bg-yellow-100';
			case 'out_of_stock':
				return 'text-red-600 bg-red-100';
			default:
				return 'text-gray-600 bg-gray-100';
		}
	}

	// Format currency
	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(price);
	}

	// Format date
	function formatDate(date?: Date): string {
		if (!date) return 'N/A';
		return new Intl.RelativeTimeFormat('en-US').format(
			Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
			'day'
		);
	}
</script>

<div class="min-h-screen bg-gray-50 p-4 sm:p-6">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0 flex-1">
			<h1 class="text-xl font-bold text-gray-900 sm:text-2xl">Account Inventory</h1>
			<p class="mt-1 text-sm text-gray-500 sm:text-base">
				Manage your social media account inventory by Platform & Tier
			</p>
		</div>
		<div class="flex flex-col gap-2 sm:flex-row sm:space-x-3">
			<button
				onclick={cleanupOrphanedAccounts}
				disabled={cleanupLoading}
				class="w-full rounded-lg bg-orange-600 px-4 py-3 text-white transition-colors hover:bg-orange-700 disabled:opacity-50 sm:w-auto sm:py-2"
			>
				{cleanupLoading ? 'Cleaning...' : 'Fix Stuck Accounts'}
			</button>
			<button
				onclick={loadInventory}
				disabled={loading}
				class="w-full rounded-lg bg-blue-600 px-4 py-3 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
			>
				{loading ? 'Refreshing...' : 'Refresh'}
			</button>
		</div>
	</div>

	<!-- Cleanup Message -->
	{#if cleanupMessage}
		<div
			class="mb-6 rounded-lg border {cleanupMessage.startsWith('✅')
				? 'border-green-200 bg-green-50 text-green-800'
				: 'border-red-200 bg-red-50 text-red-800'} p-4"
		>
			<p class="font-medium">{cleanupMessage}</p>
		</div>
	{/if}

	<!-- Stats Cards -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
		<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
			<h3 class="text-xs font-medium text-gray-500 sm:text-sm">Total Accounts</h3>
			<p class="text-lg font-bold text-gray-900 sm:text-2xl">
				{summaryStats.total_accounts.toLocaleString()}
			</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
			<h3 class="text-xs font-medium text-gray-500 sm:text-sm">Available</h3>
			<p class="text-lg font-bold text-green-600 sm:text-2xl">
				{summaryStats.available_accounts.toLocaleString()}
			</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
			<h3 class="text-xs font-medium text-gray-500 sm:text-sm">Assigned</h3>
			<p class="text-lg font-bold text-yellow-600 sm:text-2xl">
				{summaryStats.assigned_accounts.toLocaleString()}
			</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-500">Delivered</h3>
			<p class="text-2xl font-bold text-blue-600">
				{summaryStats.delivered_accounts.toLocaleString()}
			</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-500">Platforms</h3>
			<p class="text-2xl font-bold text-purple-600">{summaryStats.platforms}</p>
		</div>
	</div>

	<!-- Search -->
	<div class="mb-6">
		<input
			type="text"
			placeholder="Search platforms or tiers..."
			bind:value={searchTerm}
			class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
		/>
	</div>

	<!-- Inventory Table -->
	<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full">
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
							Total Stock
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Available
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Assigned
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Delivered
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Price
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
						>
							Last Restocked
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each filteredInventory as item (item.categoryId || `${item.platform}-${item.tier}`)}
						<tr class="hover:bg-gray-50">
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="flex items-center">
									<div>
										<div class="text-sm font-medium text-gray-900">{item.platform}</div>
										<div class="text-sm text-gray-500">{item.tier}</div>
									</div>
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-900">{item.total_accounts.toLocaleString()}</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-green-600">{item.available_accounts.toLocaleString()}</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-yellow-600">{item.assigned_accounts.toLocaleString()}</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-blue-600">{item.delivered_accounts.toLocaleString()}</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-900">{formatPrice(item.price)}</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(
										item.status
									)}"
								>
									{item.status.replace('_', ' ')}
								</span>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-500">{formatDate(item.last_restocked)}</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="8" class="px-6 py-8 text-center text-gray-500">
								{loading ? 'Loading inventory...' : 'No inventory items found'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if filteredInventory.length > 0}
		<div class="mt-4 text-sm text-gray-500">
			Showing {filteredInventory.length} of {inventory.length} inventory items
		</div>
	{/if}
</div>
