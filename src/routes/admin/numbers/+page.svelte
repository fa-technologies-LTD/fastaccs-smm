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

	// Round UP to the nearest ₦50 for clean customer-facing prices.
	function roundNgnUp(amount: number, step = 50): number {
		if (!Number.isFinite(amount) || amount <= 0) return 0;
		return Math.ceil(amount / step) * step;
	}

	function costCentsOf(r: Row): number {
		return r.liveCostCents ?? r.expectedCostCents ?? 0;
	}

	// The auto-calculated naira price = cost($) × rate × (1 + margin%).
	function computedPrice(r: Row): number {
		const cents = costCentsOf(r);
		if (!cents) return 0;
		return roundNgnUp((cents / 100) * usdNgnRate * (1 + marginPercent / 100));
	}

	function costLabel(r: Row): string {
		const cents = costCentsOf(r);
		if (!cents) return '—';
		const usd = (cents / 100).toFixed(2);
		return `$${usd}${r.liveCostCents == null ? ' (last known)' : ''}`;
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

<div class="p-6 max-w-6xl mx-auto">
	<div class="flex items-center justify-between mb-6 flex-wrap gap-3">
		<div class="flex items-center gap-3">
			<Phone class="w-6 h-6 text-sky-500" />
			<div>
				<h1 class="text-2xl font-bold">Numbers — Pricing</h1>
				<p class="text-sm text-gray-500">
					Set your dollar rate + profit margin to auto-calculate prices. Override any row if needed.
				</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<a
				href="/admin/numbers/analytics"
				class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
			>
				Analytics
			</a>
			<button
				onclick={refreshCatalog}
				disabled={seeding}
				class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
			>
				<RefreshCw class="w-4 h-4 {seeding ? 'animate-spin' : ''}" />
				Refresh costs
			</button>
			<button
				onclick={saveAll}
				disabled={saving}
				class="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
			>
				<Save class="w-4 h-4" />
				{saving ? 'Saving…' : 'Save all'}
			</button>
		</div>
	</div>

	{#if !data.hubmanConfigured}
		<div class="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm flex items-center gap-2">
			<AlertTriangle class="w-4 h-4" /> hub-man API token not configured — set HUBMAN_API_TOKEN.
		</div>
	{/if}

	<!-- Pricing rules: the two numbers that drive every price -->
	<div class="mb-6 rounded-xl border border-sky-200 bg-sky-50/50 p-5">
		<div class="flex items-center gap-2 mb-3">
			<DollarSign class="w-5 h-5 text-sky-600" />
			<h2 class="font-semibold text-sky-900">Pricing rules</h2>
		</div>
		<p class="text-sm text-gray-600 mb-4">
			Customer price = <span class="font-mono">hub-man cost ($) × your rate × (1 + margin%)</span>,
			rounded up to the nearest ₦50.
		</p>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
			<label class="block">
				<span class="text-xs font-medium text-gray-600">Dollar rate (₦ per $1)</span>
				<input
					type="number"
					bind:value={usdNgnRate}
					min="1"
					class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
				/>
			</label>
			<label class="block">
				<span class="text-xs font-medium text-gray-600">Profit margin (%)</span>
				<input
					type="number"
					bind:value={marginPercent}
					min="0"
					class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
				/>
			</label>
			<button
				type="button"
				onclick={applyToAll}
				class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700"
			>
				<DollarSign class="w-4 h-4" /> Calculate all prices
			</button>
		</div>
		<p class="text-xs text-gray-500 mt-3">
			“Calculate all prices” fills every row below. You can still edit any single price before saving.
		</p>
	</div>

	<!-- Balance -->
	<div class="mb-6">
		<div
			class="inline-flex items-center gap-3 px-4 py-3 rounded-lg border {lowBalance
				? 'border-red-300 bg-red-50'
				: 'border-gray-200'}"
		>
			<span class="text-xs text-gray-500">hub-man balance</span>
			<span class="text-lg font-bold {lowBalance ? 'text-red-600' : ''}">
				{hubBalance == null ? '—' : `$${hubBalance}`}
			</span>
			{#if lowBalance}<span class="text-xs text-red-600">Low — top up soon</span>{/if}
		</div>
	</div>

	<div class="text-sm text-gray-500 mb-2">{activeCount} numbers live · {rows.length} tiers</div>

	<div class="overflow-x-auto rounded-lg border border-gray-200">
		<table class="w-full text-sm">
			<thead class="bg-gray-50 text-left text-xs uppercase text-gray-500">
				<tr>
					<th class="px-4 py-3">Service</th>
					<th class="px-4 py-3">Country</th>
					<th class="px-4 py-3">Cost</th>
					<th class="px-4 py-3">Calculated ₦</th>
					<th class="px-4 py-3">Customer price ₦</th>
					<th class="px-4 py-3 text-center">Live</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100">
				{#each rows as row (row.tierId)}
					<tr class={row.active && row.priceNgn > 0 ? 'bg-white' : 'bg-gray-50/50'}>
						<td class="px-4 py-2 font-medium">{row.serviceName}</td>
						<td class="px-4 py-2">{row.countryName}</td>
						<td class="px-4 py-2 text-gray-600 whitespace-nowrap">{costLabel(row)}</td>
						<td class="px-4 py-2">
							<button
								type="button"
								onclick={() => (row.priceNgn = computedPrice(row))}
								class="text-sky-600 hover:underline"
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
								class="w-28 border rounded px-2 py-1"
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
					<tr
						><td colspan="6" class="px-4 py-8 text-center text-gray-400">
							No tiers yet. Click “Refresh costs” to load the catalog.
						</td></tr
					>
				{/if}
			</tbody>
		</table>
	</div>
</div>
