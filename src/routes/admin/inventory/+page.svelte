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
		last_restocked_at?: string | Date | null;
	};
	type StockFilter = 'all' | 'out' | 'low' | 'healthy' | 'manual';

	let { data }: { data: PageData } = $props();

	let searchTerm = $state('');
	let stockFilter = $state<StockFilter>('all');
	let sortMode = $state<'attention' | 'platform' | 'stock_asc' | 'stock_desc' | 'restocked'>(
		'attention'
	);
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
		const searchMatches = query
			? inventoryRows.filter(
					(item) =>
						item.platform_name?.toLowerCase().includes(query) ||
						item.tier_name?.toLowerCase().includes(query)
				)
			: inventoryRows;
		const matches = searchMatches.filter((item) => {
			if (stockFilter === 'all') return true;
			if (stockFilter === 'manual') return Boolean(item.is_manual);
			if (item.is_manual) return false;
			const available = item.available_accounts || 0;
			if (stockFilter === 'out') return available === 0;
			if (stockFilter === 'low') return available > 0 && available <= lowStockThreshold;
			return available > lowStockThreshold;
		});

		return [...matches].sort((a, b) => {
			const aAvailable = a.available_accounts || 0;
			const bAvailable = b.available_accounts || 0;
			const alphabetical = `${a.platform_name || ''}:${a.tier_name || ''}`.localeCompare(
				`${b.platform_name || ''}:${b.tier_name || ''}`
			);

			if (sortMode === 'platform') return alphabetical;
			if (sortMode === 'stock_desc') return bAvailable - aAvailable || alphabetical;
			if (sortMode === 'stock_asc') return aAvailable - bAvailable || alphabetical;
			if (sortMode === 'restocked') {
				const aDate = a.last_restocked_at ? new Date(a.last_restocked_at).getTime() : 0;
				const bDate = b.last_restocked_at ? new Date(b.last_restocked_at).getTime() : 0;
				return bDate - aDate || alphabetical;
			}

			// Manual-handover tiers aren't stock-based, so they never "need attention"
			// on account count — rank them with the healthy tiers (2), not the top.
			const aAttention = a.is_manual
				? 2
				: aAvailable === 0
					? 0
					: aAvailable <= lowStockThreshold
						? 1
						: 2;
			const bAttention = b.is_manual
				? 2
				: bAvailable === 0
					? 0
					: bAvailable <= lowStockThreshold
						? 1
						: 2;
			return aAttention - bAttention || aAvailable - bAvailable || alphabetical;
		});
	});

	// --- Platform grouping (collapsible dropdowns) ---
	const searchActive = $derived(searchTerm.trim().length > 0);
	const focusedView = $derived(searchActive || stockFilter !== 'all');
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
		const out = items.filter((i) => !i.is_manual && (i.available_accounts || 0) === 0).length;
		const low = items.filter(
			(i) =>
				!i.is_manual &&
				(i.available_accounts || 0) > 0 &&
				(i.available_accounts || 0) <= lowStockThreshold
		).length;
		return { tiers: items.length, available, out, low, attention: out + low > 0 };
	}

	let expandedPlatforms = $state<string[]>([]);
	let seededExpansion = false;
	$effect(() => {
		if (seededExpansion || inventoryRows.length === 0) return;
		// Start with attention platforms open so low/zero-stock tiers are visible.
		const open: string[] = [];
		for (const item of inventoryRows) {
			if (!item.is_manual && (item.available_accounts || 0) <= lowStockThreshold) {
				const key = item.platform_name || 'Other';
				if (!open.includes(key)) open.push(key);
			}
		}
		expandedPlatforms = open;
		seededExpansion = true;
	});
	function isPlatformExpanded(platform: string): boolean {
		return focusedView || expandedPlatforms.includes(platform);
	}
	function togglePlatform(platform: string) {
		expandedPlatforms = expandedPlatforms.includes(platform)
			? expandedPlatforms.filter((p) => p !== platform)
			: [...expandedPlatforms, platform];
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
				addToast({
					type: 'info',
					title: `No ${format} — this tier has no available accounts`,
					duration: 3000
				});
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
		const accountTiers = inventoryRows.filter((item) => !item.is_manual);
		return {
			total_accounts: inventoryRows.reduce(
				(sum, item) => sum + (item.lifetime_total_accounts || item.total_accounts || 0),
				0
			),
			available_accounts: inventoryRows.reduce(
				(sum, item) => sum + (item.available_accounts || 0),
				0
			),
			delivered_accounts: inventoryRows.reduce(
				(sum, item) =>
					sum + (item.delivered_accounts || item.sold_accounts || item.allocated_accounts || 0),
				0
			),
			platforms: new Set(inventoryRows.map((item) => item.platform_name)).size,
			out_of_stock: accountTiers.filter((item) => (item.available_accounts || 0) === 0).length,
			low_stock: accountTiers.filter(
				(item) =>
					(item.available_accounts || 0) > 0 && (item.available_accounts || 0) <= lowStockThreshold
			).length,
			healthy: accountTiers.filter((item) => (item.available_accounts || 0) > lowStockThreshold)
				.length,
			manual: inventoryRows.filter((item) => item.is_manual).length
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
				window.dispatchEvent(new CustomEvent('fastaccs:admin-attention-refresh'));
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

	<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0 flex-1">
			<h1 class="text-xl font-bold sm:text-2xl" style="color: var(--text)">Inventory</h1>
			<p class="mt-1 text-sm" style="color: var(--text-muted)">
				See what needs restocking and copy ready account details.
			</p>
		</div>
		<a
			href="/admin/batches"
			class="inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold"
			style="background: var(--primary); color: #00150b;">Import inventory</a
		>
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

	<!-- Daily inventory health -->
	<div class="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div
			class="rounded-lg border p-3 sm:p-4"
			style="background: var(--bg-elev-1); border-color: var(--border);"
		>
			<p class="text-xs font-medium" style="color: var(--text-muted);">Available accounts</p>
			<p class="mt-1 text-xl font-bold sm:text-2xl" style="color: var(--status-success);">
				{summaryStats.available_accounts.toLocaleString()}
			</p>
			<p class="mt-1 text-[11px]" style="color: var(--text-dim);">
				Across {summaryStats.platforms} platforms
			</p>
		</div>
		<button
			type="button"
			onclick={() => (stockFilter = 'out')}
			class="rounded-lg border p-3 text-left sm:p-4"
			style="background: var(--status-error-bg); border-color: var(--status-error-border);"
		>
			<p class="text-xs font-medium" style="color: var(--text-muted);">Out of stock tiers</p>
			<p class="mt-1 text-xl font-bold sm:text-2xl" style="color: var(--status-error);">
				{summaryStats.out_of_stock}
			</p>
			<p class="mt-1 text-[11px]" style="color: var(--text-dim);">Open urgent list</p>
		</button>
		<button
			type="button"
			onclick={() => (stockFilter = 'low')}
			class="rounded-lg border p-3 text-left sm:p-4"
			style="background: var(--status-warning-bg); border-color: var(--status-warning-border);"
		>
			<p class="text-xs font-medium" style="color: var(--text-muted);">Low stock tiers</p>
			<p class="mt-1 text-xl font-bold sm:text-2xl" style="color: var(--status-warning);">
				{summaryStats.low_stock}
			</p>
			<p class="mt-1 text-[11px]" style="color: var(--text-dim);">
				{lowStockThreshold} or fewer available
			</p>
		</button>
		<div
			class="rounded-lg border p-3 sm:p-4"
			style="background: var(--bg-elev-1); border-color: var(--border);"
		>
			<p class="text-xs font-medium" style="color: var(--text-muted);">Delivered</p>
			<p class="mt-1 text-xl font-bold sm:text-2xl" style="color: var(--link);">
				{summaryStats.delivered_accounts.toLocaleString()}
			</p>
			<p class="mt-1 text-[11px]" style="color: var(--text-dim);">
				{summaryStats.total_accounts.toLocaleString()} lifetime stock
			</p>
		</div>
	</div>

	<!-- Filters and sorting -->
	<div
		class="mb-3 rounded-lg border p-3"
		style="background: var(--bg-elev-1); border-color: var(--border);"
	>
		<div class="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Filter inventory by stock health">
			{#each [{ value: 'all', label: 'All', count: inventoryRows.length }, { value: 'out', label: 'Out', count: summaryStats.out_of_stock }, { value: 'low', label: 'Low', count: summaryStats.low_stock }, { value: 'healthy', label: 'Healthy', count: summaryStats.healthy }, { value: 'manual', label: 'Manual', count: summaryStats.manual }] as option}
				<button
					type="button"
					onclick={() => (stockFilter = option.value as StockFilter)}
					aria-pressed={stockFilter === option.value}
					class="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold"
					style={stockFilter === option.value
						? 'background: var(--primary); border-color: var(--primary); color: #00150b;'
						: 'background: var(--bg-elev-2); border-color: var(--border); color: var(--text-muted);'}
					>{option.label} <span class="ml-1 opacity-75">{option.count}</span></button
				>
			{/each}
		</div>
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
			<div class="relative min-w-0 flex-1">
				<input
					type="text"
					placeholder="Search platform or tier"
					bind:value={searchTerm}
					class="min-h-10 w-full rounded-lg px-3 py-2 pr-8 text-sm focus:ring-1 focus:outline-none"
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
				class="min-h-10 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:outline-none"
				style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
				aria-label="Sort inventory"
			>
				<option value="attention">Urgent first</option>
				<option value="platform">Platform A–Z</option>
				<option value="stock_asc">Stock: low to high</option>
				<option value="stock_desc">Stock: high to low</option>
				<option value="restocked">Recently restocked</option>
			</select>
		</div>
	</div>
	<p class="mb-3 text-xs" style="color: var(--text-muted);">
		Showing {filteredInventory.length} of {inventoryRows.length} tiers
	</p>

	<details
		class="mb-4 rounded-lg border"
		style="background: var(--bg-elev-1); border-color: var(--border);"
	>
		<summary class="cursor-pointer px-4 py-3 text-sm font-semibold" style="color: var(--text);"
			>Maintenance & alerts</summary
		>
		<div
			class="grid gap-4 border-t p-4 lg:grid-cols-[1fr_auto]"
			style="border-color: var(--border);"
		>
			<div class="space-y-1 text-xs" style="color: var(--text-muted);">
				<p>
					Low-stock alert threshold: <strong style="color: var(--text);">{lowStockThreshold}</strong
					>
					· Sent today:
					<strong style="color: var(--text);">{lowStockPolicy?.alerts_sent_today ?? 0}</strong>
					· Suppressed:
					<strong style="color: var(--text);">{lowStockPolicy?.suppressed_today ?? 0}</strong>
				</p>
				<p>
					Last alert: {formatPolicyTimestamp(lowStockPolicy?.last_alert_at)} · Last digest: {formatPolicyTimestamp(
						lowStockPolicy?.last_digest_at
					)}
				</p>
				<p>
					Profile thumbnails: {exactPreviewStats.thumbnails.toLocaleString()} of {exactPreviewStats.previewable.toLocaleString()}
					ready{exactPreviewStats.missingLinks > 0
						? ` · ${exactPreviewStats.missingLinks.toLocaleString()} missing links`
						: ''}
				</p>
			</div>
			<div class="flex flex-col gap-2 sm:flex-row lg:flex-col">
				<button
					type="button"
					onclick={generateMissingThumbnails}
					disabled={thumbnailLoading}
					class="min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
					style="border-color: var(--border); color: var(--text); background: var(--bg-elev-2);"
					>{thumbnailLoading ? 'Generating…' : 'Generate thumbnails'}</button
				>
				<button
					type="button"
					onclick={() => (showConfirmModal = true)}
					disabled={cleanupLoading}
					class="min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
					style="border-color: var(--status-warning-border); color: var(--status-warning); background: var(--status-warning-bg);"
					>{cleanupLoading ? 'Checking…' : 'Fix stuck accounts'}</button
				>
			</div>
		</div>
	</details>

	<!-- Inventory Table -->
	<div
		class="hidden overflow-hidden rounded-lg md:block"
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
								<button
									type="button"
									onclick={() => togglePlatform(platform)}
									class="flex w-full items-center gap-2 px-6 py-2.5 text-left"
								>
									<span class="text-xs" style="color: var(--text-muted);"
										>{isPlatformExpanded(platform) ? '▾' : '▸'}</span
									>
									<span class="text-sm font-semibold" style="color: var(--text);">{platform}</span>
									<span class="text-xs" style="color: var(--text-muted);"
										>· {summary.tiers} tier{summary.tiers === 1 ? '' : 's'} · {summary.available.toLocaleString()}
										available</span
									>
									{#if summary.out > 0}
										<span
											class="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
											style="background: var(--status-error-bg); color: var(--status-error);"
											>{summary.out} out</span
										>
									{/if}
									{#if summary.low > 0}
										<span
											class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
											style="background: var(--status-warning-bg); color: var(--status-warning);"
											>{summary.low} low</span
										>
									{/if}
								</button>
							</td>
						</tr>
						{#if isPlatformExpanded(platform)}
							{#each items as item (getInventoryKey(item))}
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
											{item.tier_price && item.tier_price > 0
												? formatPrice(item.tier_price)
												: 'N/A'}
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span
											class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
											style={getStatusStyle(item, lowStockThreshold)}
											>{getStatusText(item, lowStockThreshold)}</span
										>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm" style="color: var(--text-muted);">
											{item.last_restocked_at
												? formatDate(new Date(item.last_restocked_at))
												: 'Never'}
										</div>
									</td>
									<td class="px-6 py-4 text-right whitespace-nowrap">
										{#if (item.available_accounts || 0) > 0}
											<div class="inline-flex gap-1.5">
												<button
													type="button"
													onclick={() => copyTierAccounts(item, 'links')}
													disabled={copyingKey !== null}
													class="rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50"
													style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
													title="Copy profile links of available accounts"
													>{copyingKey === `${item.id}:links` ? '…' : 'Links'}</button
												>
												<button
													type="button"
													onclick={() => copyTierAccounts(item, 'logs')}
													disabled={copyingKey !== null}
													class="rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50"
													style="background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);"
													title="Copy full logs of available accounts"
													>{copyingKey === `${item.id}:logs` ? '…' : 'Logs'}</button
												>
											</div>
										{:else}
											<span class="text-xs" style="color: var(--text-muted);">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						{/if}
					{:else}
						<tr>
							<td colspan="8" class="px-6 py-8 text-center" style="color: var(--text-muted);"
								>No inventory found</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Mobile inventory cards: the same information without an eight-column horizontal scroll. -->
	<div class="space-y-3 md:hidden">
		{#each groupedInventory as [platform, items] (platform)}
			{@const summary = groupSummary(items)}
			<section
				class="overflow-hidden rounded-lg border"
				style="border-color: var(--border); background: var(--bg-elev-1);"
			>
				<button
					type="button"
					onclick={() => togglePlatform(platform)}
					class="flex w-full items-center gap-2 px-3 py-3 text-left"
				>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-sm font-semibold" style="color: var(--text);"
							>{platform}</span
						>
						<span class="block text-xs" style="color: var(--text-muted);"
							>{summary.tiers} tier{summary.tiers === 1 ? '' : 's'} · {summary.available.toLocaleString()}
							available</span
						>
					</span>
					{#if summary.out > 0}<span
							class="rounded-md px-2 py-1 text-[10px] font-bold"
							style="background: var(--status-error-bg); color: var(--status-error);"
							>{summary.out} out</span
						>{/if}
					{#if summary.low > 0}<span
							class="rounded-md px-2 py-1 text-[10px] font-bold"
							style="background: var(--status-warning-bg); color: var(--status-warning);"
							>{summary.low} low</span
						>{/if}
					<span class="text-xs" style="color: var(--text-dim);"
						>{isPlatformExpanded(platform) ? '▾' : '▸'}</span
					>
				</button>
				{#if isPlatformExpanded(platform)}
					<div class="divide-y border-t" style="border-color: var(--border);">
						{#each items as item (getInventoryKey(item))}
							<article class="p-3" style="border-color: var(--border);">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="text-sm font-semibold" style="color: var(--text);">
											{item.tier_name || 'Unknown tier'}
										</p>
										<p class="mt-0.5 text-xs" style="color: var(--text-muted);">
											{item.tier_price && item.tier_price > 0
												? formatPrice(item.tier_price)
												: 'No price'}
										</p>
									</div>
									<span
										class="shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold"
										style={getStatusStyle(item, lowStockThreshold)}
										>{getStatusText(item, lowStockThreshold)}</span
									>
								</div>
								<div
									class="mt-3 grid grid-cols-3 gap-2 rounded-lg p-2.5"
									style="background: var(--bg-elev-2);"
								>
									<div>
										<p class="text-[10px] uppercase" style="color: var(--text-dim);">Available</p>
										<p class="text-sm font-bold" style="color: var(--status-success);">
											{item.available_accounts || 0}
										</p>
									</div>
									<div>
										<p class="text-[10px] uppercase" style="color: var(--text-dim);">Delivered</p>
										<p class="text-sm font-bold" style="color: var(--link);">
											{item.delivered_accounts ??
												item.sold_accounts ??
												item.allocated_accounts ??
												0}
										</p>
									</div>
									<div>
										<p class="text-[10px] uppercase" style="color: var(--text-dim);">Restocked</p>
										<p class="text-xs font-semibold" style="color: var(--text);">
											{item.last_restocked_at
												? formatDate(new Date(item.last_restocked_at))
												: 'Never'}
										</p>
									</div>
								</div>
								{#if (item.available_accounts || 0) > 0}
									<div class="mt-3 grid grid-cols-2 gap-2">
										<button
											type="button"
											onclick={() => copyTierAccounts(item, 'links')}
											disabled={copyingKey !== null}
											class="min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
											style="border-color: var(--border); color: var(--text); background: var(--surface);"
											>{copyingKey === `${item.id}:links` ? 'Copying…' : 'Copy links'}</button
										>
										<button
											type="button"
											onclick={() => copyTierAccounts(item, 'logs')}
											disabled={copyingKey !== null}
											class="min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
											style="border-color: var(--border); color: var(--text); background: var(--surface);"
											>{copyingKey === `${item.id}:logs` ? 'Copying…' : 'Copy logs'}</button
										>
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{:else}
			<div
				class="rounded-lg border px-4 py-10 text-center text-sm"
				style="border-color: var(--border); color: var(--text-muted);"
			>
				No inventory matches this view.
			</div>
		{/each}
	</div>
</div>
