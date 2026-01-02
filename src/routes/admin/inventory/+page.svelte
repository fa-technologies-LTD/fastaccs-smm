<script lang="ts">
	import { formatDate } from '$lib/helpers/utils';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';

	let { data } = $props();

	let searchTerm = $state('');
	let showConfirmModal = $state(false);
	let cleanupLoading = $state(false);
	let cleanupMessage = $state<string | null>(null);

	const filteredInventory = $derived.by(() => {
		if (!searchTerm) return data.inventory || [];
		return (data.inventory || []).filter(
			(item: any) =>
				item.platform_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
				item.tier_name?.toLowerCase().includes(searchTerm.toLowerCase())
		);
	});

	const summaryStats = $derived.by(() => {
		return {
			total_accounts: filteredInventory.reduce(
				(sum: number, item: any) => sum + (item.total_accounts || 0),
				0
			),
			available_accounts: filteredInventory.reduce(
				(sum: number, item: any) => sum + (item.available_accounts || 0),
				0
			),
			assigned_accounts: filteredInventory.reduce(
				(sum: number, item: any) => sum + (item.assigned_accounts || 0),
				0
			),
			delivered_accounts: filteredInventory.reduce(
				(sum: number, item: any) => sum + (item.delivered_accounts || 0),
				0
			),
			platforms: new Set(filteredInventory.map((item: any) => item.platform_name)).size
		};
	});

	async function cleanupOrphanedAccounts() {
		cleanupLoading = true;
		cleanupMessage = null;
		showConfirmModal = false;
		try {
			const response = await fetch('/api/admin/cleanup/allocated-accounts', { method: 'POST' });
			const result = await response.json();
			if (response.ok) {
				cleanupMessage = result.message;
				location.reload();
			} else {
				cleanupMessage = `Error: ${result.error}`;
			}
		} catch (error) {
			cleanupMessage = 'Failed to cleanup accounts';
		} finally {
			cleanupLoading = false;
			setTimeout(() => (cleanupMessage = null), 5000);
		}
	}

	function getStatusColor(available: number): string {
		if (available === 0) return 'text-red-600 bg-red-100';
		if (available < 10) return 'text-yellow-600 bg-yellow-100';
		return 'text-green-600 bg-green-100';
	}

	function getStatusText(available: number): string {
		if (available === 0) return 'out of stock';
		if (available < 10) return 'low stock';
		return 'in stock';
	}
</script>

<div class="min-h-screen bg-gray-50 p-4 sm:p-6">
	<!-- Confirm Modal -->
	<ConfirmModal
		isOpen={showConfirmModal}
		onClose={() => (showConfirmModal = false)}
		onConfirm={cleanupOrphanedAccounts}
		title="Fix Stuck Accounts"
		message="This will reset orphaned allocated accounts back to available status. This action cannot be undone. Are you sure you want to continue?"
		confirmText="Yes, Fix Accounts"
		cancelText="Cancel"
		isDestructive={true}
		isLoading={cleanupLoading}
	/>

	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0 flex-1">
			<h1 class="text-xl font-bold text-gray-900 sm:text-2xl">Account Inventory</h1>
			<p class="mt-1 text-sm text-gray-500 sm:text-base">
				Manage your social media account inventory by Platform & Tier
			</p>
		</div>
		<div class="flex flex-col gap-2 sm:flex-row sm:space-x-3">
			<button
				onclick={() => (showConfirmModal = true)}
				disabled={cleanupLoading}
				class="w-full rounded-lg bg-orange-600 px-4 py-3 text-white transition-all hover:scale-95 hover:bg-orange-700 active:scale-90 disabled:opacity-50 disabled:active:scale-100 sm:w-auto sm:py-2"
			>
				{cleanupLoading ? 'Cleaning...' : 'Fix Stuck Accounts'}
			</button>
		</div>
	</div>

	<!-- Error Message -->
	{#if data.error}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
			<p class="font-medium">Error loading inventory</p>
			<p class="mt-1 text-sm">{data.error}</p>
		</div>
	{/if}

	<!-- Cleanup Message -->
	{#if cleanupMessage}
		<div
			class="mb-6 rounded-lg border {cleanupMessage.startsWith('')
				? 'border-green-200 bg-green-50 text-green-800'
				: 'border-red-200 bg-red-50 text-red-800'} p-4"
		>
			<p class="font-medium">{cleanupMessage}</p>
		</div>
	{/if}

	<!-- Stats Cards -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
		<div class="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
			<h3 class="text-xs font-medium text-gray-500 sm:text-sm">Total Accounts</h3>
			<p class="text-lg font-bold text-gray-900 sm:text-2xl">
				{summaryStats.total_accounts.toLocaleString()}
			</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
			<h3 class="text-xs font-medium text-gray-500 sm:text-sm">Available</h3>
			<p class="text-lg font-bold text-green-600 sm:text-2xl">
				{summaryStats.available_accounts.toLocaleString()}
			</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
			<h3 class="text-xs font-medium text-gray-500 sm:text-sm">Assigned</h3>
			<p class="text-lg font-bold text-yellow-600 sm:text-2xl">
				{summaryStats.assigned_accounts.toLocaleString()}
			</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h3 class="text-sm font-medium text-gray-500">Delivered</h3>
			<p class="text-2xl font-bold text-blue-600">
				{summaryStats.delivered_accounts.toLocaleString()}
			</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-6">
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
	<div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
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
					{#each filteredInventory as item}
						<tr class="hover:bg-gray-50">
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm font-medium text-gray-900">
									{item.platform_name || 'Unknown'}
								</div>
								<div class="text-sm text-gray-500">{item.tier_name || 'Unknown'}</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-900">
									{item.total_accounts?.toLocaleString() || 0}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-green-600">
									{item.available_accounts?.toLocaleString() || 0}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-yellow-600">
									{item.assigned_accounts?.toLocaleString() || 0}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-blue-600">
									{item.delivered_accounts?.toLocaleString() || 0}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-900">-</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(
										item.available_accounts || 0
									)}"
								>
									{getStatusText(item.available_accounts || 0)}
								</span>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-500">
									{item.created_at ? formatDate(new Date(item.created_at)) : 'N/A'}
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="8" class="px-6 py-8 text-center text-gray-500"> No inventory found </td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if filteredInventory.length > 0}
		<div class="mt-4 text-sm text-gray-500">
			Showing {filteredInventory.length} of {data.inventory?.length || 0} inventory items
		</div>
	{/if}
</div>
