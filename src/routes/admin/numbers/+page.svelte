<script lang="ts">
	import { Save, Phone, AlertTriangle, DollarSign, Lock, Unlock } from '$lib/icons';
	import { showSuccess, showError } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Row {
		tierId: string;
		serviceId: number;
		serviceName: string;
		countryName: string;
		liveCostCents: number | null;
		priceNgn: number;
		profitNgn: number;
		available: number;
		autoHidden: boolean;
		hideReason: string | null;
		active: boolean;
		primarySource: string;
		priceLocked: boolean;
	}

	let rows = $state<Row[]>(data.rows.map((r) => ({ ...r })));
	let usdNgnRate = $state(data.usdNgnRate);
	let marginPercent = $state(data.marginPercent);
	let saving = $state(false);
	let expanding = $state(false);
	let appFilter = $state<'all' | number>('all');

	const hubBalance = $derived(
		data.hubBalanceCents == null ? null : (data.hubBalanceCents / 100).toFixed(2)
	);
	const lowBalance = $derived(
		data.hubBalanceCents != null && data.hubBalanceCents < data.lowBalanceThresholdCents
	);
	// Live = admin-active AND priced AND not auto-hidden (no stock / failing).
	const liveCount = $derived(
		rows.filter((r) => r.active && r.priceNgn > 0 && !r.autoHidden).length
	);
	const flaggedCount = $derived(rows.filter((r) => r.autoHidden || r.profitNgn < 1000).length);

	// Distinct apps for the sort/filter dropdown, in the order they appear.
	const apps = $derived.by(() => {
		const seen = new Map<number, string>();
		for (const r of rows) if (!seen.has(r.serviceId)) seen.set(r.serviceId, r.serviceName);
		return [...seen.entries()].map(([id, name]) => ({ id, name }));
	});
	const visibleRows = $derived(
		appFilter === 'all' ? rows : rows.filter((r) => r.serviceId === appFilter)
	);

	function costLabel(r: Row): string {
		if (r.liveCostCents == null) return '—';
		return `$${(r.liveCostCents / 100).toFixed(2)}`;
	}
	function flag(r: Row): { text: string; color: string } | null {
		if (r.autoHidden && r.hideReason === 'low_success')
			return { text: 'Hidden · low success', color: '#f59e0b' };
		if (r.autoHidden) return { text: 'Hidden · no stock', color: '#94a3b8' };
		if (r.profitNgn < 1000) return { text: `Low profit · ₦${r.profitNgn.toLocaleString()}`, color: '#dc2626' };
		return null;
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
			// Apply per-tier changes first (prices, locks, active). A locked price persists; an
			// unlocked one reverts to automatic pricing on the next sync.
			const updates = rows.map((r) => ({
				tierId: r.tierId,
				active: r.active,
				priceNgn: r.priceLocked ? r.priceNgn : undefined,
				lockPrice: r.priceLocked
			}));
			const out = await post({ action: 'save', updates });
			if (!out.success) throw new Error(out.error || 'Failed to save');

			// Only re-sync from the rate/margin when they actually changed (a full re-price is slow).
			// The sync respects locks, so locked prices stay put through a rate/margin change.
			const rateMarginChanged =
				usdNgnRate !== data.usdNgnRate || marginPercent !== data.marginPercent;
			if (rateMarginChanged) {
				const cfg = await post({ action: 'config', usdNgnRate, marginPercent });
				if (!cfg.success) throw new Error(cfg.error || 'Failed to save settings');
			}
			showSuccess(
				rateMarginChanged
					? 'Saved. Unlocked prices recalculated; locked prices protected. Reloading…'
					: 'Saved. Locked prices protected. Reloading…'
			);
			setTimeout(() => location.reload(), 900);
		} catch (e) {
			showError(e instanceof Error ? e.message : 'Save failed');
			saving = false;
		}
	}
	async function expandCatalog() {
		if (
			!confirm(
				'Add any newly-available countries/apps to the catalog?\n\nThis expands your set — it never removes anything. New tiers arrive active and auto-priced.'
			)
		)
			return;
		expanding = true;
		try {
			const out = await post({ action: 'expand' });
			if (!out.success) throw new Error(out.error || 'Expand failed');
			showSuccess(`Catalog expanded (${out.created} new, ${out.refreshed} refreshed). Reloading…`);
			setTimeout(() => location.reload(), 900);
		} catch (e) {
			showError(e instanceof Error ? e.message : 'Expand failed');
			expanding = false;
		}
	}

	// --- Launch campaign (announce + retire manual tiers). Fires ONLY on click. ---
	let campaignBusy = $state(false);
	async function launchCampaign() {
		if (
			!confirm(
				'Launch the Numbers announcement?\n\nThis will:\n• email + push every customer (touch 1 of 3)\n• put the announcement banner up\n• RETIRE the manual phone tiers from the store\n\nDo this only after merging to production.'
			)
		)
			return;
		campaignBusy = true;
		try {
			const out = await post({ action: 'launch-campaign' });
			if (!out.success) throw new Error(out.error || 'Launch failed');
			showSuccess(
				`Campaign launched — ${out.manualTiersRetired} manual tiers retired, ${out.emailSent} emails sent, ${out.pushed} push notified. Reloading…`
			);
			setTimeout(() => location.reload(), 1200);
		} catch (e) {
			showError(e instanceof Error ? e.message : 'Launch failed');
			campaignBusy = false;
		}
	}
	async function stopCampaign() {
		if (!confirm('Stop the campaign and take the banner down? (Reminders stop; manual tiers stay retired.)'))
			return;
		campaignBusy = true;
		try {
			const out = await post({ action: 'stop-campaign' });
			if (!out.success) throw new Error(out.error || 'Stop failed');
			showSuccess('Campaign stopped. Reloading…');
			setTimeout(() => location.reload(), 900);
		} catch (e) {
			showError(e instanceof Error ? e.message : 'Stop failed');
			campaignBusy = false;
		}
	}
</script>

<div class="p-6 max-w-6xl mx-auto" style="color: var(--text);">
	<div class="flex items-center justify-between mb-6 flex-wrap gap-3">
		<div class="flex items-center gap-3">
			<Phone class="w-6 h-6" style="color: #38bdf8;" />
			<div>
				<h1 class="text-2xl font-bold" style="color: var(--text);">Numbers — Pricing</h1>
				<p class="text-sm" style="color: var(--text-muted);">
					Prices are fully automatic. Set your dollar rate + margin; every price recalculates itself.
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
				onclick={expandCatalog}
				disabled={expanding}
				class="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg disabled:opacity-50"
				style="border: 1px solid var(--border); color: var(--text);"
				title="Add any newly-available countries/apps (never removes)"
			>
				{expanding ? 'Expanding…' : '+ Expand catalog'}
			</button>
			<button
				onclick={saveAll}
				disabled={saving}
				class="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50"
				style="background: #0ea5e9; color: #ffffff;"
			>
				<Save class="w-4 h-4" />
				{saving ? 'Saving…' : 'Save'}
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
			<DollarSign class="w-5 h-5" style="color: #38bdf8;" />
			<h2 class="font-semibold" style="color: var(--text);">Pricing rules</h2>
		</div>
		<p class="text-sm mb-4" style="color: var(--text-muted);">
			Customer price = <span class="font-mono">hub-man cost ($) × your rate × (1 + margin%)</span>,
			rounded up to the nearest ₦100, and never less than <span class="font-mono">cost + ₦1,000</span>.
			Prices update themselves on every refresh — you never set one by hand.
		</p>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
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
		</div>
		<p class="text-xs mt-3" style="color: var(--text-dim);">
			Hit <strong>Save</strong> to apply a new rate or margin — every price recalculates instantly.
		</p>
	</div>

	<!-- Launch announcement campaign -->
	{#if data.canManageCampaign}
		<div class="mb-6 rounded-xl p-5" style="border: 1px solid var(--border); background: var(--surface);">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="font-semibold" style="color: var(--text);">Launch announcement</h2>
					<p class="text-sm mt-1" style="color: var(--text-muted);">
						{#if data.campaign?.enabled && data.campaign?.launchedAt}
							🟢 Live since {new Date(data.campaign.launchedAt).toLocaleString()} — 3 reminders
							over ~7 days (email · popup · banner · push), auto-suppressed for number-buyers.
						{:else}
							Announces Numbers across email, in-app popup, banner + push (3 tapered reminders),
							and <strong>retires the manual phone tiers</strong>. Do this only after merging to
							production.
						{/if}
					</p>
				</div>
				{#if data.campaign?.enabled}
					<button
						onclick={stopCampaign}
						disabled={campaignBusy}
						class="px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50"
						style="border: 1px solid var(--border); color: var(--text);"
					>
						{campaignBusy ? 'Working…' : 'Stop campaign'}
					</button>
				{:else}
					<button
						onclick={launchCampaign}
						disabled={campaignBusy}
						class="px-4 py-2 text-sm rounded-lg font-semibold disabled:opacity-50"
						style="background: #0ea5e9; color: #ffffff;"
					>
						{campaignBusy ? 'Launching…' : '🚀 Launch announcement'}
					</button>
				{/if}
			</div>
		</div>
	{/if}

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

	<div class="flex items-center justify-between flex-wrap gap-3 mb-2">
		<div class="text-sm" style="color: var(--text-muted);">
			{liveCount} numbers live · {rows.length} tiers
			{#if flaggedCount > 0}
				· <span style="color: #f59e0b;">{flaggedCount} flagged for review</span>
			{/if}
		</div>
		<label class="flex items-center gap-2 text-sm" style="color: var(--text-muted);">
			Sort by app
			<select
				bind:value={appFilter}
				class="rounded-lg px-3 py-1.5"
				style="background: var(--bg-elev-1); color: var(--text); border: 1px solid var(--border);"
			>
				<option value="all">All apps</option>
				{#each apps as app (app.id)}
					<option value={app.id}>{app.name}</option>
				{/each}
			</select>
		</label>
	</div>

	<div class="overflow-x-auto rounded-lg" style="border: 1px solid var(--border);">
		<table class="w-full text-sm">
			<thead style="background: var(--bg-elev-1);">
				<tr class="text-left text-xs uppercase" style="color: var(--text-muted);">
					<th class="px-4 py-3">Service</th>
					<th class="px-4 py-3">Country</th>
					<th class="px-4 py-3">Source</th>
					<th class="px-4 py-3">Cost</th>
					<th class="px-4 py-3">Price ₦</th>
					<th class="px-4 py-3">Profit ₦</th>
					<th class="px-4 py-3">Stock</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3 text-center">Live</th>
				</tr>
			</thead>
			<tbody>
				{#each visibleRows as row (row.tierId)}
					{@const f = flag(row)}
					<tr style="border-top: 1px solid var(--border); background: var(--surface);">
						<td class="px-4 py-2 font-medium" style="color: var(--text);">{row.serviceName}</td>
						<td class="px-4 py-2" style="color: var(--text-muted);">{row.countryName}</td>
						<td class="px-4 py-2">
							{#if row.primarySource === 'pvapins'}
								<span
									class="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
									style="background: rgba(167,139,250,0.14); color: #a78bfa; border: 1px solid rgba(167,139,250,0.3);"
									>pvapins</span
								>
							{:else}
								<span
									class="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
									style="background: rgba(56,189,248,0.12); color: #38bdf8; border: 1px solid rgba(56,189,248,0.28);"
									>hub-man</span
								>
							{/if}
						</td>
						<td class="px-4 py-2 whitespace-nowrap" style="color: var(--text-muted);">{costLabel(row)}</td>
						<td class="px-4 py-2 whitespace-nowrap">
							<div class="flex items-center gap-1.5">
								<span style="color: var(--text-muted);">₦</span>
								<input
									type="number"
									min="0"
									step="50"
									bind:value={row.priceNgn}
									class="w-24 rounded-md px-2 py-1 text-right font-semibold"
									style="background: var(--bg-elev-1); border: 1px solid {row.priceLocked
										? '#fbbf24'
										: 'var(--border)'}; color: var(--text);"
								/>
								<button
									onclick={() => (row.priceLocked = !row.priceLocked)}
									class="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
									style="background: {row.priceLocked
										? 'rgba(251,191,36,0.15)'
										: 'var(--bg-elev-1)'}; border: 1px solid {row.priceLocked
										? '#fbbf24'
										: 'var(--border)'};"
									title={row.priceLocked
										? 'Locked — this price is protected from auto-repricing (rate/margin/refresh). Click to unlock.'
										: 'Unlocked — follows automatic pricing. Set a price and click to lock it in place.'}
									aria-label={row.priceLocked ? 'Unlock price' : 'Lock price'}
								>
									{#if row.priceLocked}
										<Lock class="w-3.5 h-3.5" style="color: #fbbf24;" />
									{:else}
										<Unlock class="w-3.5 h-3.5" style="color: var(--text-dim);" />
									{/if}
								</button>
							</div>
						</td>
						<td
							class="px-4 py-2 whitespace-nowrap"
							style="color: {row.profitNgn < 1000 ? '#f87171' : '#34d399'};"
						>
							₦{row.profitNgn.toLocaleString()}
						</td>
						<td class="px-4 py-2" style="color: {row.available <= 0 ? '#f87171' : 'var(--text-muted)'};">
							{row.available.toLocaleString()}
						</td>
						<td class="px-4 py-2">
							{#if f}
								<span
									class="inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
									style="background: {f.color}20; color: {f.color};"
								>
									⚑ {f.text}
								</span>
							{:else}
								<span class="text-xs" style="color: var(--text-dim);">OK</span>
							{/if}
						</td>
						<td class="px-4 py-2 text-center">
							<input
								type="checkbox"
								bind:checked={row.active}
								title="Show on storefront (auto-hidden tiers stay hidden until stock/quality recovers)"
							/>
						</td>
					</tr>
				{/each}
				{#if visibleRows.length === 0}
					<tr style="background: var(--surface);">
						<td colspan="9" class="px-4 py-8 text-center" style="color: var(--text-dim);">
							{rows.length === 0
								? 'No tiers yet. Click “Expand catalog” to load the catalog.'
								: 'No tiers for this app.'}
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
