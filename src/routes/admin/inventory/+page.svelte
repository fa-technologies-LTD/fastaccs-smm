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
				allocated_accounts: filteredInventory.reduce(
					(sum: number, item: any) => sum + (item.allocated_accounts || item.assigned_accounts || 0),
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

	function getStatusStyle(available: number): string {
		if (available === 0)
			return 'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border)';
		if (available < 10)
			return 'background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border)';
		return 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border)';
	}

	function getStatusText(available: number): string {
		if (available === 0) return 'out of stock';
		if (available < 10) return 'low stock';
		return 'in stock';
	}
</script>

<div class="min-h-screen p-3 sm:p-6">
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
			<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text)">Account Inventory</h1>
			<p class="mt-1 text-sm sm:text-base" style="color: var(--text-muted)">
				Manage your social media account inventory by Platform & Tier
			</p>
		</div>
		<div class="flex flex-col gap-2 sm:flex-row sm:space-x-3">
			<button
				onclick={() => (showConfirmModal = true)}
				disabled={cleanupLoading}
				class="w-full cursor-pointer rounded-full px-4 py-3 text-white transition-all hover:scale-95 active:scale-90 disabled:opacity-50 disabled:active:scale-100 sm:w-auto sm:py-2"
				style="background: #f97316;"
			>
				{cleanupLoading ? 'Cleaning...' : 'Fix Stuck Accounts'}
			</button>
		</div>
	</div>

	<!-- Error Message -->
	{#if data.error}
		<div
			class="mb-6 rounded-lg p-4"
			style="border: 1px solid var(--status-error-border); background: var(--status-error-bg);"
		>
			<p class="font-medium" style="color: var(--status-error);">Error loading inventory</p>
			<p class="mt-1 text-sm" style="color: var(--status-error);">{data.error}</p>
		</div>
	{/if}

	<!-- Cleanup Message -->
	{#if cleanupMessage}
		<div
			class="mb-6 rounded-lg p-4"
			style={cleanupMessage.startsWith('Error')
				? 'border: 1px solid var(--status-error-border); background: var(--status-error-bg); color: var(--status-error)'
				: 'border: 1px solid var(--status-success-border); background: var(--status-success-bg); color: var(--status-success)'}
		>
			<p class="font-medium">{cleanupMessage}</p>
		</div>
	{/if}

	<!-- Stats Cards -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
		<div
			class="rounded-lg p-4 sm:p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<h3 class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
				Total Accounts
			</h3>
			<p class="text-lg font-bold sm:text-2xl" style="color: var(--text)">
				{summaryStats.total_accounts.toLocaleString()}
			</p>
		</div>
		<div
			class="rounded-lg p-4 sm:p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<h3 class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">Available</h3>
			<p class="text-lg font-bold sm:text-2xl" style="color: var(--status-success);">
				{summaryStats.available_accounts.toLocaleString()}
			</p>
		</div>
			<div
				class="rounded-lg p-4 sm:p-6"
				style="background: var(--bg-elev-1); border: 1px solid var(--border)"
			>
				<h3 class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">Allocated</h3>
				<p class="text-lg font-bold sm:text-2xl" style="color: var(--status-warning);">
					{summaryStats.allocated_accounts.toLocaleString()}
				</p>
			</div>
		<div
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<h3 class="text-sm font-medium" style="color: var(--text-muted)">Delivered</h3>
			<p class="text-2xl font-bold" style="color: var(--link);">
				{summaryStats.delivered_accounts.toLocaleString()}
			</p>
		</div>
		<div
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<h3 class="text-sm font-medium" style="color: var(--text-muted)">Platforms</h3>
			<p class="text-2xl font-bold" style="color: #a855f7;">{summaryStats.platforms}</p>
		</div>
	</div>

	<!-- Search -->
	<div class="mb-6">
		<input
			type="text"
			placeholder="Search platforms or tiers..."
			bind:value={searchTerm}
			class="w-full rounded-lg px-4 py-2 focus:ring-1 focus:outline-none"
			style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
		/>
	</div>

	<!-- Inventory Table -->
	<div
		class="overflow-hidden rounded-lg"
		style="border: 1px solid var(--border); background: var(--bg-elev-1);"
	>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead style="background: var(--bg-elev-2);">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Platform & Tier
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Total Stock
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Available
						</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
								style="color: var(--text-muted);"
							>
								Allocated
							</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Delivered
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Price
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Last Restocked
						</th>
					</tr>
				</thead>
				<tbody class="divide-y" style="border-color: var(--border); background: var(--bg-elev-1);">
					{#each filteredInventory as item}
						<tr
							class="transition-colors"
							style="--hover-bg: var(--bg-elev-2);"
							onmouseenter={(e) => (e.currentTarget.style.background = 'var(--bg-elev-2)')}
							onmouseleave={(e) => (e.currentTarget.style.background = 'transparent')}
						>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm font-medium" style="color: var(--text);">
									{item.platform_name || 'Unknown'}
								</div>
								<div class="text-sm" style="color: var(--text-muted);">
									{item.tier_name || 'Unknown'}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm" style="color: var(--text);">
									{item.total_accounts?.toLocaleString() || 0}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm" style="color: var(--status-success);">
									{item.available_accounts?.toLocaleString() || 0}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm" style="color: var(--status-warning);">
									{(item.allocated_accounts ?? item.assigned_accounts ?? 0).toLocaleString()}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm" style="color: var(--link);">
									{item.delivered_accounts?.toLocaleString() || 0}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm" style="color: var(--text);">-</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
									style={getStatusStyle(item.available_accounts || 0)}
								>
									{getStatusText(item.available_accounts || 0)}
								</span>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm" style="color: var(--text-muted);">
									{item.created_at ? formatDate(new Date(item.created_at)) : 'N/A'}
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="8" class="px-6 py-8 text-center" style="color: var(--text-muted);">
								No inventory found
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if filteredInventory.length > 0}
		<div class="mt-4 text-sm" style="color: var(--text-muted);">
			Showing {filteredInventory.length} of {data.inventory?.length || 0} inventory items
		</div>
	{/if}
</div>
