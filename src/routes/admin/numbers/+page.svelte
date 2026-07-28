<script lang="ts">
	import { RefreshCw, Save, Phone, AlertTriangle, DollarSign } from '$lib/icons';
	import { showSuccess, showError } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Row {
		tierId: string;
		serviceName: string;
		countryName: string;
		liveCostCents: number | null;
		expectedCostCents: number;
		priceNgn: number;
		active: boolean;
	}

	let rows = $state<Row[]>(
		data.rows.map((r) => ({
			tierId: r.tierId,
			serviceName: r.serviceName,
			countryName: r.countryName,
			liveCostCents: r.liveCostCents,
			expectedCostCents: r.expectedCostCents,
			priceNgn: r.priceNgn,
			active: r.active
		}))
	);
	let usdNgnRate = $state(data.usdNgnRate);
	let marginPercent = $state(data.marginPercent);
	let saving = $state(false);
	let seeding = $state(false);

	const hubBalance = $derived(
		data.hubBalanceCents == null ? null : (data.hubBalanceCents / 100).toFixed(2)
	);
	const lowBalance = $derived(
		data.hubBalanceCents != null && data.hubBalanceCents < data.lowBalanceThresholdCents
	);
	const activeCount = $derived(rows.filter((r) => r.active && r.priceNgn > 0).length);

	// Round up to clean ₦100s, floor at ₦1,000 (matches the server pricing rule).
	const PRICE_FLOOR_NGN = 1000;
	function roundNgnUp(amount: number, step = 100): number {
		if (!Number.isFinite(amount) || amount <= 0) return PRICE_FLOOR_NGN;
		return Math.max(PRICE_FLOOR_NGN, Math.ceil(amount / step) * step);
	}
	function costCentsOf(r: Row): number {
		return r.liveCostCents ?? r.expectedCostCents ?? 0;
	}
	function computedPrice(r: Row): number {
		const cents = costCentsOf(r);
		if (!cents) return 0;
		return roundNgnUp((cents / 100) * usdNgnRate * (1 + marginPercent / 100));
	}
	function costLabel(r: Row): string {
		const cents = costCentsOf(r);
		if (!cents) return '—';
		return `$${(cents / 100).toFixed(2)}${r.liveCostCents == null ? ' *' : ''}`;
	}
	function applyToAll() {
		for (const r of rows) r.priceNgn = computedPrice(r);
		showSuccess('Prices calculated from your rate + margin. Review and Save all.');
	}

	async function post(payload: Record<string, unknown>) {
		const res = await fetch('/api/admin/numbers', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		return res.json();
	}
	async function saveAll() {
		saving = true;
		try {
			const cfg = await post({ action: 'config', usdNgnRate, marginPercent });
			if (!cfg.success) throw new Error(cfg.error || 'Failed to save settings');
			const updates = rows.map((r) => ({ tierId: r.tierId, priceNgn: r.priceNgn, active: r.active }));
			const out = await post({ action: 'save', updates });
			if (!out.success) throw new Error(out.error || 'Failed to save prices');
			showSuccess('Saved. Active, priced numbers are now live on the storefront.');
		} catch (e) {
			showError(e instanceof Error ? e.message : 'Save failed');
		} finally {
			saving = false;
		}
	}
	async function refreshCatalog() {
		seeding = true;
		try {
			const out = await post({ action: 'seed' });
			if (!out.success) throw new Error(out.error || 'Refresh failed');
			showSuccess(`Catalog refreshed (${out.created} new, ${out.refreshed} updated). Reloading…`);
			setTimeout(() => location.reload(), 800);
		} catch (e) {
			showError(e instanceof Error ? e.message : 'Refresh failed');
			seeding = false;
		}
	}
</script>

<div class="p-6 max-w-6xl mx-auto" style="color: var(--text);">
	<div class="flex items-center justify-between mb-6 flex-wrap gap-3">
		<div class="flex items-center gap-3">
			<Phone class="w-6 h-6" style="color: var(--fa-lime-400);" />
			<div>
				<h1 class="text-2xl font-bold" style="color: var(--text);">Numbers — Pricing</h1>
				<p class="text-sm" style="color: var(--text-muted);">
					Set your dollar rate + profit margin to auto-calculate prices. Override any row if needed.
				</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<a
				href="/admin/numbers/analytics"
				class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg"
				style="border: 1px solid var(--border); color: var(--text);"
			>
				Analytics
			</a>
			<button
				onclick={refreshCatalog}
				disabled={seeding}
				class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg disabled:opacity-50"
				style="border: 1px solid var(--border); color: var(--text);"
			>
				<RefreshCw class="w-4 h-4 {seeding ? 'animate-spin' : ''}" />
				Refresh costs
			</button>
			<button
				onclick={saveAll}
				disabled={saving}
				class="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50"
				style="background: var(--fa-lime-700); color: #0a0a0a;"
			>
				<Save class="w-4 h-4" />
				{saving ? 'Saving…' : 'Save all'}
			</button>
		</div>
	</div>

	{#if !data.hubmanConfigured}
		<div
			class="mb-4 p-3 rounded-lg text-sm flex items-center gap-2"
			style="background: rgba(245,158,11,0.12); color: #fbbf24;"
		>
			<AlertTriangle class="w-4 h-4" /> hub-man API token not configured — set HUBMAN_API_TOKEN.
		</div>
	{/if}

	<!-- Pricing rules -->
	<div class="mb-6 rounded-xl p-5" style="border: 1px solid var(--border); background: var(--surface);">
		<div class="flex items-center gap-2 mb-3">
			<DollarSign class="w-5 h-5" style="color: var(--fa-lime-400);" />
			<h2 class="font-semibold" style="color: var(--text);">Pricing rules</h2>
		</div>
		<p class="text-sm mb-4" style="color: var(--text-muted);">
			Customer price = <span class="font-mono">hub-man cost ($) × your rate × (1 + margin%)</span>,
			rounded up to the nearest ₦100 (minimum ₦1,000).
		</p>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
			<label class="block">
				<span class="text-xs font-medium" style="color: var(--text-muted);">Dollar rate (₦ per $1)</span>
				<input
					type="number"
					bind:value={usdNgnRate}
					min="1"
					class="mt-1 w-full rounded-lg px-3 py-2"
					style="background: var(--bg-elev-1); color: var(--text); border: 1px solid var(--border);"
				/>
			</label>
			<label class="block">
				<span class="text-xs font-medium" style="color: var(--text-muted);">Profit margin (%)</span>
				<input
					type="number"
					bind:value={marginPercent}
					min="0"
					class="mt-1 w-full rounded-lg px-3 py-2"
					style="background: var(--bg-elev-1); color: var(--text); border: 1px solid var(--border);"
				/>
			</label>
			<button
				type="button"
				onclick={applyToAll}
				class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium"
				style="background: var(--fa-lime-700); color: #0a0a0a;"
			>
				<DollarSign class="w-4 h-4" /> Calculate all prices
			</button>
		</div>
		<p class="text-xs mt-3" style="color: var(--text-dim);">
			“Calculate all prices” fills every row below. You can still edit any single price before saving.
		</p>
	</div>

	<!-- Balance -->
	<div class="mb-6">
		<div
			class="inline-flex items-center gap-3 px-4 py-3 rounded-lg"
			style="border: 1px solid {lowBalance ? '#dc2626' : 'var(--border)'}; background: {lowBalance
				? 'rgba(220,38,38,0.10)'
				: 'var(--surface)'};"
		>
			<span class="text-xs" style="color: var(--text-muted);">hub-man balance</span>
			<span class="text-lg font-bold" style="color: {lowBalance ? '#f87171' : 'var(--text)'};">
				{hubBalance == null ? '—' : `$${hubBalance}`}
			</span>
			{#if lowBalance}<span class="text-xs" style="color: #f87171;">Low — top up soon</span>{/if}
		</div>
	</div>

	<div class="text-sm mb-2" style="color: var(--text-muted);">
		{activeCount} numbers live · {rows.length} tiers
	</div>

	<div class="overflow-x-auto rounded-lg" style="border: 1px solid var(--border);">
		<table class="w-full text-sm">
			<thead style="background: var(--bg-elev-1);">
				<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
					<th class="px-4 py-3">Service</th>
					<th class="px-4 py-3">Country</th>
					<th class="px-4 py-3">Cost</th>
					<th class="px-4 py-3">Calculated ₦</th>
					<th class="px-4 py-3">Customer price ₦</th>
					<th class="px-4 py-3 text-center">Live</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.tierId)}
					<tr style="border-top: 1px solid var(--border); background: var(--surface);">
						<td class="px-4 py-2 font-medium" style="color: var(--text);">{row.serviceName}</td>
						<td class="px-4 py-2" style="color: var(--text-muted);">{row.countryName}</td>
						<td class="px-4 py-2 whitespace-nowrap" style="color: var(--text-muted);">{costLabel(row)}</td>
						<td class="px-4 py-2">
							<button
								type="button"
								onclick={() => (row.priceNgn = computedPrice(row))}
								class="hover:underline"
								style="color: var(--fa-lime-400);"
								title="Use this price"
							>
								₦{computedPrice(row).toLocaleString()}
							</button>
						</td>
						<td class="px-4 py-2">
							<input
								type="number"
								bind:value={row.priceNgn}
								min="0"
								class="w-28 rounded px-2 py-1"
								style="background: var(--bg-elev-1); color: var(--text); border: 1px solid var(--border);"
							/>
						</td>
						<td class="px-4 py-2 text-center">
							<input
								type="checkbox"
								bind:checked={row.active}
								disabled={row.priceNgn <= 0}
								title={row.priceNgn <= 0 ? 'Set a price first' : 'Show on storefront'}
							/>
						</td>
					</tr>
				{/each}
				{#if rows.length === 0}
					<tr style="background: var(--surface);">
						<td colspan="6" class="px-4 py-8 text-center" style="color: var(--text-dim);">
							No tiers yet. Click “Refresh costs” to load the catalog.
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
