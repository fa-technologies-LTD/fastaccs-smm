<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { formatDate, formatPrice } from '$lib/helpers/utils';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import { addToast } from '$lib/stores/toasts';
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
		exact_preview_enabled?: boolean | null;
		previewable_accounts?: number | null;
		missing_profile_link_accounts?: number | null;
		exact_preview_screenshot_accounts?: number | null;
		is_manual?: boolean | null;
		manual_available?: boolean | null;
	};

	let { data }: { data: PageData } = $props();

	let searchTerm = $state('');
	let sortMode = $state<'attention' | 'platform' | 'stock_asc' | 'stock_desc'>('attention');
	let showConfirmModal = $state(false);
	let cleanupLoading = $state(false);
	let cleanupMessage = $state<string | null>(null);
	let thumbnailLoading = $state(false);
	let thumbnailMessage = $state<string | null>(null);
	const lowStockThreshold = $derived.by(() =>
		Math.max(1, Number(data.lowStockThreshold || data?.stats?.low_stock_threshold || 10))
	);
	const lowStockPolicy = $derived.by(() => data.lowStockPolicy || null);
	const inventoryRows = $derived.by(() => (data.inventory || []) as InventoryRow[]);

	const filteredInventory = $derived.by((): InventoryRow[] => {
		const query = searchTerm.trim().toLowerCase();
		const matches = query
			? inventoryRows.filter(
					(item) =>
						item.platform_name?.toLowerCase().includes(query) ||
						item.tier_name?.toLowerCase().includes(query)
				)
			: inventoryRows;

		return [...matches].sort((a, b) => {
			const aAvailable = a.available_accounts || 0;
			const bAvailable = b.available_accounts || 0;
			const alphabetical = `${a.platform_name || ''}:${a.tier_name || ''}`.localeCompare(
				`${b.platform_name || ''}:${b.tier_name || ''}`
			);

			if (sortMode === 'platform') return alphabetical;
			if (sortMode === 'stock_desc') return bAvailable - aAvailable || alphabetical;
			if (sortMode === 'stock_asc') return aAvailable - bAvailable || alphabetical;

			// Manual-handover tiers aren't stock-based, so they never "need attention"
			// on account count — rank them with the healthy tiers (2), not the top.
			const aAttention = a.is_manual ? 2 : aAvailable === 0 ? 0 : aAvailable <= lowStockThreshold ? 1 : 2;
			const bAttention = b.is_manual ? 2 : bAvailable === 0 ? 0 : bAvailable <= lowStockThreshold ? 1 : 2;
			return aAttention - bAttention || aAvailable - bAvailable || alphabetical;
		});
	});

	// --- Platform grouping (collapsible dropdowns) ---
	const searchActive = $derived(searchTerm.trim().length > 0);
	const groupedInventory = $derived.by((): Array<[string, InventoryRow[]]> => {
		const order: string[] = [];
		const byPlatform: Record<string, InventoryRow[]> = {};
		for (const item of filteredInventory) {
			const key = item.platform_name || 'Other';
			if (!byPlatform[key]) {
				byPlatform[key] = [];
				order.push(key);
			}
			byPlatform[key].push(item);
		}
		return order.map((key) => [key, byPlatform[key]]);
	});

	function groupSummary(items: InventoryRow[]) {
		const available = items.reduce((sum, i) => sum + (i.available_accounts || 0), 0);
		const attention = items.some(
			(i) => !i.is_manual && (i.available_accounts || 0) <= lowStockThreshold
		);
		return { tiers: items.length, available, attention };
	}


	// --- Copy links / logs of a tier's available accounts (read-only, never deletes) ---
	let copyingKey = $state<string | null>(null);
	async function copyTierAccounts(item: InventoryRow, format: 'links' | 'logs') {
		if (!item.id) {
			addToast({ type: 'error', title: 'Tier id missing', duration: 2500 });
			return;
		}
		if (copyingKey) return;
		copyingKey = `${item.id}:${format}`;
		try {
			const res = await fetch(`/api/admin/tier-accounts/${item.id}?format=${format}`);
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || 'Request failed');
			if (!payload.text) {
				addToast({ type: 'info', title: `No ${format} — this tier has no available accounts`, duration: 3000 });
				return;
			}
			await navigator.clipboard.writeText(payload.text);
			addToast({
				type: 'success',
				title: `Copied ${payload.count} ${format === 'links' ? 'link(s)' : 'account log(s)'}`,
				duration: 2500
			});
		} catch {
			addToast({ type: 'error', title: `Could not copy ${format}`, duration: 3000 });
		} finally {
			copyingKey = null;
		}
	}

	const attentionRows = $derived.by(() =>
		inventoryRows
			.filter((item) => !item.is_manual && (item.available_accounts || 0) <= lowStockThreshold)
			.sort((a, b) => (a.available_accounts || 0) - (b.available_accounts || 0))
	);

	const exactPreviewStats = $derived.by(() => ({
		previewable: inventoryRows.reduce((sum, item) => sum + (item.previewable_accounts || 0), 0),
		thumbnails: inventoryRows.reduce(
			(sum, item) => sum + (item.exact_preview_screenshot_accounts || 0),
			0
		),
		missingLinks: inventoryRows.reduce(
			(sum, item) => sum + (item.missing_profile_link_accounts || 0),
			0
		)
	}));

	const summaryStats = $derived.by(() => {
		return {
			total_accounts: filteredInventory.reduce(
				(sum, item) => sum + (item.lifetime_total_accounts || item.total_accounts || 0),
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

	async function generateMissingThumbnails() {
		thumbnailLoading = true;
		thumbnailMessage = null;
		try {
			const response = await fetch('/api/admin/exact-preview/thumbnails', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ limit: 6 })
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				thumbnailMessage = `Error: ${result.error || 'Thumbnail worker failed'}`;
				return;
			}

			if (result.data?.reason === 'cloudinary_not_configured') {
				thumbnailMessage = 'Error: Cloudinary is not configured for exact-profile thumbnails.';
				return;
			}

			thumbnailMessage = `Thumbnail run complete: ${result.data?.generated || 0} generated, ${result.data?.failed || 0} failed, ${result.data?.skipped || 0} skipped.`;
			await invalidateAll();
		} catch {
			thumbnailMessage = 'Error: Failed to run thumbnail worker.';
		} finally {
			thumbnailLoading = false;
			setTimeout(() => (thumbnailMessage = null), 8000);
		}
	}

	const STATUS_SUCCESS =
		'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border)';
	const STATUS_WARNING =
		'background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border)';
	const STATUS_ERROR =
		'background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border)';

	function getStatusStyle(item: InventoryRow, threshold: number): string {
		// Manual-handover tiers use their availability toggle, not account stock.
		if (item.is_manual) return item.manual_available ? STATUS_SUCCESS : STATUS_WARNING;
		const available = item.available_accounts || 0;
		if (available === 0) return STATUS_ERROR;
		if (available <= threshold) return STATUS_WARNING;
		return STATUS_SUCCESS;
	}

	function getStatusText(item: InventoryRow, threshold: number): string {
		if (item.is_manual) return item.manual_available ? 'available' : 'unavailable';
		const available = item.available_accounts || 0;
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
				onclick={generateMissingThumbnails}
				disabled={thumbnailLoading}
				class="cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all hover:scale-[.98] active:scale-95 disabled:opacity-50 disabled:active:scale-100 sm:text-sm"
				style="background: var(--btn-primary-gradient); color: #04140c;"
			>
				{thumbnailLoading ? 'Generating...' : 'Generate Missing Thumbnails'}
			</button>
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

	{#if thumbnailMessage}
		<div
			class="mb-6 rounded-lg p-4"
			style={thumbnailMessage.startsWith('Error')
				? 'border: 1px solid var(--status-error-border); background: var(--status-error-bg); color: var(--status-error)'
				: 'border: 1px solid var(--status-success-border); background: var(--status-success-bg); color: var(--status-success)'}
		>
			<p class="font-medium">{thumbnailMessage}</p>
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
		{#if attentionRows.length > 0}
			<div class="mt-3 border-t pt-3" style="border-color: var(--border);">
				<p class="text-xs font-semibold tracking-wide uppercase" style="color: var(--text-muted);">
					Stock attention needed
				</p>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each attentionRows as item (getInventoryKey(item))}
						<span
							class="rounded-full px-2.5 py-1 text-xs font-semibold"
							style={getStatusStyle(item, lowStockThreshold)}
						>
							{item.platform_name || 'Unknown'} · {item.tier_name || 'Unknown'}:
							{item.available_accounts || 0}
						</span>
					{/each}
				</div>
			</div>
		{/if}
		<div
			class="mt-3 border-t pt-3 text-xs"
			style="border-color: var(--border); color: var(--text-dim);"
		>
			Exact-profile thumbnails: {exactPreviewStats.thumbnails.toLocaleString()} of
			{exactPreviewStats.previewable.toLocaleString()} prepared
			{#if exactPreviewStats.missingLinks > 0}
				• {exactPreviewStats.missingLinks.toLocaleString()} missing live-profile links
			{/if}
		</div>
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
	<div class="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center">
		<div class="relative min-w-0 flex-1">
			<input
				type="text"
				placeholder="Search platforms or tiers..."
				bind:value={searchTerm}
				class="w-full rounded-lg px-3 py-1.5 pr-8 text-sm focus:ring-1 focus:outline-none"
				style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
			/>
			{#if searchTerm}
				<button
					type="button"
					onclick={() => (searchTerm = '')}
					class="absolute top-1/2 right-2 -translate-y-1/2 rounded px-1 text-sm leading-none"
					style="color: var(--text-muted);"
					aria-label="Clear search"
				>
					✕
				</button>
			{/if}
		</div>
		<select
			bind:value={sortMode}
			class="rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
			style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
			aria-label="Sort inventory"
		>
			<option value="attention">Needs attention first</option>
			<option value="platform">Platform and tier</option>
			<option value="stock_asc">Lowest stock first</option>
			<option value="stock_desc">Highest stock first</option>
		</select>
	</div>
	{#if searchActive}
		<p class="mb-3 text-xs" style="color: var(--text-muted);">
			{filteredInventory.length} tier{filteredInventory.length === 1 ? '' : 's'} match "{searchTerm}"
		</p>
	{:else}
		<div class="mb-3"></div>
	{/if}

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
						<th
							class="px-6 py-3 text-right text-xs font-medium tracking-wider uppercase"
							style="color: var(--text-muted);"
						>
							Copy
						</th>
					</tr>
				</thead>
				<tbody class="divide-y" style="border-color: var(--border); background: var(--bg-elev-1);">
					{#each groupedInventory as [platform, items] (platform)}
						{@const summary = groupSummary(items)}
						<tr style="background: var(--bg-elev-2);">
							<td colspan="8" class="p-0">
								<div class="flex w-full items-center gap-2 px-6 py-2.5 text-left">
									<span class="text-sm font-semibold" style="color: var(--text);">{platform}</span>
									<span class="text-xs" style="color: var(--text-muted);"
										>· {summary.tiers} tier{summary.tiers === 1 ? '' : 's'} · {summary.available.toLocaleString()} available</span
									>
									{#if summary.attention}
										<span
											class="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
											style="background: rgba(226,75,74,0.12); color: #ffb5b1;">needs attention</span
										>
									{/if}
								</div>
							</td>
						</tr>
						{#each items as item (getInventoryKey(item))}
								<tr
									class="transition-colors"
									style="--hover-bg: var(--bg-elev-2);"
									onmouseenter={(e) => (e.currentTarget.style.background = 'var(--bg-elev-2)')}
									onmouseleave={(e) => (e.currentTarget.style.background = 'transparent')}
								>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm font-medium" style="color: var(--text);">{item.platform_name || 'Unknown'}</div>
										<div class="text-sm" style="color: var(--text-muted);">{item.tier_name || 'Unknown'}</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm" style="color: var(--text);">{(item.lifetime_total_accounts ?? item.total_accounts ?? 0).toLocaleString()}</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm" style="color: var(--status-success);">{item.available_accounts?.toLocaleString() || 0}</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm" style="color: var(--link);">{(item.delivered_accounts ?? item.sold_accounts ?? item.allocated_accounts ?? item.assigned_accounts ?? 0).toLocaleString()}</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm" style="color: var(--text);">{item.tier_price && item.tier_price > 0 ? formatPrice(item.tier_price) : 'N/A'}</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={getStatusStyle(item, lowStockThreshold)}>{getStatusText(item, lowStockThreshold)}</span>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm" style="color: var(--text-muted);">{item.created_at ? formatDate(new Date(item.created_at)) : 'N/A'}</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-right">
										{#if (item.available_accounts || 0) > 0}
											<div class="inline-flex gap-1.5">
												<button
													type="button"
													onclick={() => copyTierAccounts(item, 'links')}
													disabled={copyingKey !== null}
													class="rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50"
													style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
													title="Copy profile links of available accounts"
												>{copyingKey === `${item.id}:links` ? '…' : 'Links'}</button>
												<button
													type="button"
													onclick={() => copyTierAccounts(item, 'logs')}
													disabled={copyingKey !== null}
													class="rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50"
													style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
													title="Copy full logs of available accounts"
												>{copyingKey === `${item.id}:logs` ? '…' : 'Logs'}</button>
											</div>
										{:else}
											<span class="text-xs" style="color: var(--text-muted);">—</span>
										{/if}
									</td>
								</tr>
							{/each}
					{:else}
						<tr>
							<td colspan="8" class="px-6 py-8 text-center" style="color: var(--text-muted);">No inventory found</td>
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
