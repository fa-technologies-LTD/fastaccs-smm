<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { formatDate, formatPrice } from '$lib/helpers/utils';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import type { PageData } from './$types';

	type InventoryRow = {
		id?: string;
		tier_name?: string | null;
		platform_name?: string | null;
		lifetime_total_accounts?: number | null;
		total_accounts?: number | null;
		available_accounts?: number | null;
		delivered_accounts?: number | null;
		sold_accounts?: number | null;
		allocated_accounts?: number | null;
		assigned_accounts?: number | null;
		tier_price?: number | null;
		created_at?: string | Date | null;
	};

	let { data }: { data: PageData } = $props();

	let searchTerm = $state('');
	let showConfirmModal = $state(false);
	let cleanupLoading = $state(false);
	let cleanupMessage = $state<string | null>(null);
	const lowStockThreshold = $derived.by(() =>
		Math.max(1, Number(data.lowStockThreshold || data?.stats?.low_stock_threshold || 10))
	);
	const lowStockPolicy = $derived.by(() => data.lowStockPolicy || null);
	const inventoryRows = $derived.by(() => (data.inventory || []) as InventoryRow[]);

	const filteredInventory = $derived.by((): InventoryRow[] => {
		const query = searchTerm.trim().toLowerCase();
		if (!query) return inventoryRows;
		return inventoryRows.filter(
			(item) =>
				item.platform_name?.toLowerCase().includes(query) ||
				item.tier_name?.toLowerCase().includes(query)
		);
	});

	const summaryStats = $derived.by(() => {
		return {
			total_accounts: filteredInventory.reduce(
				(sum, item) =>
					sum + (item.lifetime_total_accounts || item.total_accounts || 0),
				0
			),
			available_accounts: filteredInventory.reduce(
				(sum, item) => sum + (item.available_accounts || 0),
				0
			),
			delivered_accounts: filteredInventory.reduce(
				(sum, item) =>
					sum + (item.delivered_accounts || item.sold_accounts || item.allocated_accounts || 0),
				0
			),
			platforms: new Set(filteredInventory.map((item) => item.platform_name)).size
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
				await invalidateAll();
			} else {
				cleanupMessage = `Error: ${result.error}`;
			}
		} catch {
			cleanupMessage = 'Failed to cleanup accounts';
		} finally {
			cleanupLoading = false;
			setTimeout(() => (cleanupMessage = null), 5000);
		}
	}

	function getStatusStyle(available: number, threshold: number): string {
		if (available === 0)
			return 'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border)';
		if (available <= threshold)
			return 'background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border)';
		return 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border)';
	}

	function getStatusText(available: number, threshold: number): string {
		if (available === 0) return 'out of stock';
		if (available <= threshold) return 'low stock';
		return 'in stock';
	}

	function formatPolicyTimestamp(value: string | null | undefined): string {
		if (!value) return 'N/A';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return 'N/A';
		return parsed.toLocaleString();
	}

	function getInventoryKey(item: InventoryRow): string {
		return item.id || `${item.platform_name || 'platform'}:${item.tier_name || 'tier'}`;
	}
</script>

<div class="p-2 sm:p-4">
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

	<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0 flex-1">
			<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text)">Account Inventory</h1>
			<p class="mt-1 text-sm sm:text-base" style="color: var(--text-muted)">
				Manage your social media account inventory by Platform & Tier
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				onclick={() => (showConfirmModal = true)}
				disabled={cleanupLoading}
				class="cursor-pointer rounded-full px-3 py-1.5 text-xs text-white transition-all hover:scale-[.98] active:scale-95 disabled:opacity-50 disabled:active:scale-100 sm:text-sm"
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

	<div
		class="mb-4 rounded-lg p-3 sm:p-4"
		style="background: var(--bg-elev-1); border: 1px solid var(--border);"
	>
		<p class="text-xs sm:text-sm" style="color: var(--text-muted);">
			Low-stock threshold:
			<span class="font-semibold" style="color: var(--text);">{lowStockThreshold}</span>
			• Alerts sent today:
			<span class="font-semibold" style="color: var(--text);"
				>{lowStockPolicy?.alerts_sent_today ?? 0}</span
			>
			• Suppressed today:
			<span class="font-semibold" style="color: var(--text);"
				>{lowStockPolicy?.suppressed_today ?? 0}</span
			>
			• Unresolved zero-stock tiers:
			<span class="font-semibold" style="color: var(--text);"
				>{lowStockPolicy?.unresolved_zero_tiers ?? 0}</span
			>
		</p>
		<p class="mt-1 text-xs" style="color: var(--text-dim);">
			Last alert: {formatPolicyTimestamp(lowStockPolicy?.last_alert_at)} • Last digest:
			{formatPolicyTimestamp(lowStockPolicy?.last_digest_at)}
		</p>
	</div>

	<!-- Stats Cards -->
	<div class="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
		<div
			class="rounded-lg p-3 sm:p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<h3 class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">
				Lifetime Stock
			</h3>
			<p class="text-lg font-bold sm:text-2xl" style="color: var(--text)">
				{summaryStats.total_accounts.toLocaleString()}
			</p>
		</div>
		<div
			class="rounded-lg p-3 sm:p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<h3 class="text-xs font-medium sm:text-sm" style="color: var(--text-muted)">Available</h3>
			<p class="text-lg font-bold sm:text-2xl" style="color: var(--status-success);">
				{summaryStats.available_accounts.toLocaleString()}
			</p>
		</div>
		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<h3 class="text-sm font-medium" style="color: var(--text-muted)">Delivered</h3>
			<p class="text-2xl font-bold" style="color: var(--link);">
				{summaryStats.delivered_accounts.toLocaleString()}
			</p>
		</div>
		<div
			class="rounded-lg p-4"
			style="background: var(--bg-elev-1); border: 1px solid var(--border)"
		>
			<h3 class="text-sm font-medium" style="color: var(--text-muted)">Platforms</h3>
			<p class="text-2xl font-bold" style="color: #a855f7;">{summaryStats.platforms}</p>
		</div>
	</div>

	<!-- Search -->
	<div class="mb-4">
		<input
			type="text"
			placeholder="Search platforms or tiers..."
			bind:value={searchTerm}
			class="w-full rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
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
							Lifetime Stock
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
					{#each filteredInventory as item (getInventoryKey(item))}
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
									{(item.lifetime_total_accounts ?? item.total_accounts ?? 0).toLocaleString()}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm" style="color: var(--status-success);">
									{item.available_accounts?.toLocaleString() || 0}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm" style="color: var(--link);">
									{(
										item.delivered_accounts ??
										item.sold_accounts ??
										item.allocated_accounts ??
										item.assigned_accounts ??
										0
									).toLocaleString()}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm" style="color: var(--text);">
									{item.tier_price && item.tier_price > 0 ? formatPrice(item.tier_price) : 'N/A'}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
									style={getStatusStyle(item.available_accounts || 0, lowStockThreshold)}
								>
									{getStatusText(item.available_accounts || 0, lowStockThreshold)}
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
								<td colspan="7" class="px-6 py-8 text-center" style="color: var(--text-muted);">
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
