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
		costCents: number;
		priceNgn: number;
		profitNgn: number;
		available: number;
		autoHidden: boolean;
		hideReason: string | null;
		active: boolean;
		primarySource: string;
		priceLocked: boolean;
		minFulfillmentProfitNgn: number; // effective hard floor for this tier (override ?? global)
		floorOverridden: boolean; // carries its own floor (not the global default)
		thin: boolean; // headroom < ~2× — a candidate for a lower per-tier floor
	}

	let rows = $state<Row[]>(data.rows.map((r) => ({ ...r })));
	let usdNgnRate = $state(data.usdNgnRate);
	let marginPercent = $state(data.marginPercent);
	let minProfitNgn = $state(data.minProfitNgn);
	// Fulfilment SAFETY floor — the hard ₦ profit we never intentionally go below. Distinct from the
	// pricing profit target above (which the sticker AIMS for). §48/§49.
	let minFulfillmentProfitNgn = $state(data.minFulfillmentProfitNgn);
	let maxPriceMultiple = $state(data.maxPriceMultiple);
	let otpReplacementWaitSeconds = $state(data.otpReplacementWaitSeconds);
	let pvapinsRateLimitPerMin = $state(data.pvapinsRateLimitPerMin);
	let showAdvanced = $state(false);
	let saving = $state(false);
	let expanding = $state(false);
	let appFilter = $state<'all' | number>('all');

	const hubBalance = $derived(
		data.hubBalanceCents == null ? null : (data.hubBalanceCents / 100).toFixed(2)
	);
	const pvapinsBalance = $derived(
		data.pvapinsBalanceCents == null ? null : (data.pvapinsBalanceCents / 100).toFixed(2)
	);
	const lowBalance = $derived(
		data.hubBalanceCents != null && data.hubBalanceCents < data.lowBalanceThresholdCents
	);
	// Live = admin-active AND priced AND not auto-hidden (no stock / failing).
	const liveCount = $derived(
		rows.filter((r) => r.active && r.priceNgn > 0 && !r.autoHidden).length
	);
	const flaggedCount = $derived(rows.filter((r) => r.autoHidden || profitOf(r) < minProfitNgn).length);

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
	// Live profit — recomputes as the admin types/locks a price (price − cost at the current rate).
	function profitOf(r: Row): number {
		return Math.round(r.priceNgn - (r.costCents / 100) * usdNgnRate);
	}
	// The most we'll ever spend on a supplier for this tier while keeping its hard floor (§50).
	function maxSpendNgn(r: Row): number {
		return Math.max(0, Math.round(r.priceNgn - r.minFulfillmentProfitNgn));
	}
	// Economic health at the current price + live cost (§51). Green normal / amber compressed /
	// red at-risk (cost above the procurement ceiling → often refunds rather than a loss).
	function health(r: Row): { text: string; color: string } {
		const costNgn = (r.costCents / 100) * usdNgnRate;
		if (r.priceNgn <= r.minFulfillmentProfitNgn) return { text: 'Unfulfillable', color: '#dc2626' };
		if (costNgn > maxSpendNgn(r)) return { text: 'At risk', color: '#dc2626' };
		if (profitOf(r) < minProfitNgn) return { text: 'Compressed', color: '#f59e0b' };
		return { text: 'Healthy', color: '#34d399' };
	}
	// Toggle a per-tier fulfilment-floor override on/off (off = fall back to the global).
	function toggleFloorOverride(r: Row) {
		r.floorOverridden = !r.floorOverridden;
		if (!r.floorOverridden) r.minFulfillmentProfitNgn = minFulfillmentProfitNgn;
	}
	function flag(r: Row): { text: string; color: string } | null {
		if (r.autoHidden && r.hideReason === 'low_success')
			return { text: 'Hidden · low success', color: '#f59e0b' };
		if (r.autoHidden) return { text: 'Hidden · no stock', color: '#94a3b8' };
		if (profitOf(r) < minProfitNgn)
			return { text: `Low profit · ₦${profitOf(r).toLocaleString()}`, color: '#dc2626' };
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
				lockPrice: r.priceLocked,
				// A per-tier fulfilment-floor override (null clears it → back to the global default).
				minFulfillmentProfitNgn: r.floorOverridden ? r.minFulfillmentProfitNgn : null
			}));
			const out = await post({ action: 'save', updates });
			if (!out.success) throw new Error(out.error || 'Failed to save');

			// Only re-sync from the rate/margin when they actually changed (a full re-price is slow).
			// The sync respects locks, so locked prices stay put through a rate/margin change.
			const rateMarginChanged =
				usdNgnRate !== data.usdNgnRate ||
				marginPercent !== data.marginPercent ||
				minProfitNgn !== data.minProfitNgn ||
				minFulfillmentProfitNgn !== data.minFulfillmentProfitNgn ||
				maxPriceMultiple !== data.maxPriceMultiple ||
				otpReplacementWaitSeconds !== data.otpReplacementWaitSeconds ||
				pvapinsRateLimitPerMin !== data.pvapinsRateLimitPerMin;
			if (rateMarginChanged) {
				const cfg = await post({
					action: 'config',
					usdNgnRate,
					marginPercent,
					minProfitNgn,
					minFulfillmentProfitNgn,
					maxPriceMultiple,
					otpReplacementWaitSeconds,
					pvapinsRateLimitPerMin
				});
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
			<label class="block">
				<span class="text-xs font-medium" style="color: var(--text-muted);">Pricing profit target (₦)</span>
				<input
					type="number"
					bind:value={minProfitNgn}
					min="0"
					step="100"
					class="mt-1 w-full rounded-lg px-3 py-2"
					style="background: var(--bg-elev-1); color: var(--text); border: 1px solid var(--border);"
				/>
				<span class="text-[11px]" style="color: var(--text-dim);">Profit the sticker AIMS for.</span>
			</label>
		</div>

		<!-- Fulfilment SAFETY floor — deliberately separate + strongly labelled (not a "loss cap"). §48/§49/§88 -->
		<div
			class="mt-4 rounded-lg p-4"
			style="border: 1px solid rgba(52,211,153,0.35); background: rgba(52,211,153,0.06);"
		>
			<div class="flex flex-wrap items-end gap-4">
				<label class="block">
					<span class="text-xs font-semibold" style="color: #34d399;"
						>Hard minimum profit per successful number (₦)</span
					>
					<input
						type="number"
						bind:value={minFulfillmentProfitNgn}
						min="0"
						step="100"
						class="mt-1 w-40 rounded-lg px-3 py-2"
						style="background: var(--bg-elev-1); color: var(--text); border: 1px solid rgba(52,211,153,0.4);"
					/>
				</label>
				<p class="text-xs flex-1 min-w-[220px]" style="color: var(--text-muted);">
					FastAccs may use more expensive stock to <em>save</em> an order, but will never
					intentionally procure past the point where less than this profit remains. It is
					<strong>not</strong> a loss cap — losses are never allowed. This is separate from the pricing
					target above.
				</p>
			</div>
		</div>

		<!-- Advanced dials — kept out of the way; defaults are sensible. -->
		<div class="mt-3">
			<button
				type="button"
				onclick={() => (showAdvanced = !showAdvanced)}
				class="text-xs font-medium"
				style="color: var(--text-muted);"
			>
				{showAdvanced ? '▾' : '▸'} Advanced pricing & supplier dials
			</button>
			{#if showAdvanced}
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end mt-3">
					<label class="block">
						<span class="text-xs font-medium" style="color: var(--text-muted);">Max price multiple (×cost)</span>
						<input
							type="number"
							bind:value={maxPriceMultiple}
							min="1"
							step="0.1"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg-elev-1); color: var(--text); border: 1px solid var(--border);"
						/>
						<span class="text-[11px]" style="color: var(--text-dim);">Competitive cap (floor still wins).</span>
					</label>
					<label class="block">
						<span class="text-xs font-medium" style="color: var(--text-muted);">Replacement wait (sec)</span>
						<input
							type="number"
							bind:value={otpReplacementWaitSeconds}
							min="30"
							step="10"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg-elev-1); color: var(--text); border: 1px solid var(--border);"
						/>
						<span class="text-[11px]" style="color: var(--text-dim);">After "I've requested the code".</span>
					</label>
					<label class="block">
						<span class="text-xs font-medium" style="color: var(--text-muted);">pvapins calls / min</span>
						<input
							type="number"
							bind:value={pvapinsRateLimitPerMin}
							min="1"
							step="1"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg-elev-1); color: var(--text); border: 1px solid var(--border);"
						/>
						<span class="text-[11px]" style="color: var(--text-dim);">Global get_number rate cap.</span>
					</label>
				</div>
			{/if}
		</div>
		<p class="text-xs mt-3" style="color: var(--text-dim);">
			Hit <strong>Save</strong> to apply — unlocked prices recalculate instantly; locked prices stay put.
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
	<div class="mb-6 flex flex-wrap items-center gap-3">
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
		{#if pvapinsBalance != null}
			<div
				class="inline-flex items-center gap-3 px-4 py-3 rounded-lg"
				style="border: 1px solid rgba(167,139,250,0.3); background: rgba(167,139,250,0.08);"
			>
				<span class="text-xs" style="color: var(--text-muted);">pvapins balance</span>
				<span class="text-lg font-bold" style="color: #a78bfa;">${pvapinsBalance}</span>
			</div>
		{/if}
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
					<th class="px-4 py-3" title="Most we'll spend on a supplier for this tier while keeping its hard floor">Max spend</th>
					<th class="px-4 py-3" title="Hard minimum profit for this tier — overrides the global when set">Fulfil. floor</th>
					<th class="px-4 py-3">Stock</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3 text-center">Live</th>
				</tr>
			</thead>
			<tbody>
				{#each visibleRows as row (row.tierId)}
					{@const f = flag(row)}
					{@const h = health(row)}
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
							class="px-4 py-2 whitespace-nowrap font-medium"
							style="color: {profitOf(row) < minProfitNgn ? '#f87171' : '#34d399'};"
						>
							₦{profitOf(row).toLocaleString()}
						</td>
						<td class="px-4 py-2 whitespace-nowrap" style="color: var(--text-muted);">
							₦{maxSpendNgn(row).toLocaleString()}
						</td>
						<td class="px-4 py-2 whitespace-nowrap">
							<div class="flex items-center gap-1.5">
								<span style="color: var(--text-dim);">₦</span>
								<input
									type="number"
									min="0"
									step="50"
									disabled={!row.floorOverridden}
									bind:value={row.minFulfillmentProfitNgn}
									class="w-20 rounded-md px-2 py-1 text-right disabled:opacity-50"
									style="background: var(--bg-elev-1); border: 1px solid {row.floorOverridden
										? '#a78bfa'
										: 'var(--border)'}; color: var(--text);"
									title={row.floorOverridden
										? 'Per-tier hard floor (override). Click the badge to revert to the global.'
										: 'Using the global hard floor. Click the badge to set a per-tier value.'}
								/>
								<button
									onclick={() => toggleFloorOverride(row)}
									class="text-[10px] px-1.5 py-0.5 rounded font-semibold"
									style="background: {row.floorOverridden
										? 'rgba(167,139,250,0.15)'
										: 'var(--bg-elev-1)'}; border: 1px solid {row.floorOverridden
										? '#a78bfa'
										: 'var(--border)'}; color: {row.floorOverridden ? '#a78bfa' : 'var(--text-dim)'};"
									title={row.floorOverridden ? 'Revert to the global floor' : 'Override for this tier'}
								>
									{row.floorOverridden ? 'tier' : 'global'}
								</button>
							</div>
						</td>
						<td class="px-4 py-2" style="color: {row.available <= 0 ? '#f87171' : 'var(--text-muted)'};">
							{row.available.toLocaleString()}
						</td>
						<td class="px-4 py-2">
							<div class="flex flex-wrap items-center gap-1">
								{#if f}
									<span
										class="inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
										style="background: {f.color}20; color: {f.color};"
									>
										⚑ {f.text}
									</span>
								{:else}
									<span
										class="inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
										style="background: {h.color}20; color: {h.color};"
									>
										{h.text}
									</span>
								{/if}
								{#if row.thin}
									<span
										class="inline-block px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
										style="background: rgba(56,189,248,0.12); color: #38bdf8;"
										title="Thin headroom — a lower per-tier fulfilment floor would let it deliver more often"
									>
										Thin
									</span>
								{/if}
							</div>
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
						<td colspan="11" class="px-4 py-8 text-center" style="color: var(--text-dim);">
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
