<script lang="ts">
	import { untrack } from 'svelte';
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { Save, Download, RefreshCcw, Search, ChevronRight, Zap } from '$lib/icons';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import { BOOSTING_PLATFORM_LABELS } from '$lib/helpers/boosting-service-config';
	import {
		exportPricingCsv,
		pricingEconomics,
		pricingWarnings,
		pricingStart,
		pricingTarget,
		type BoostPricingRow,
		type BoostPricingView
	} from '$lib/helpers/boosting-pricing-sheet';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let view = $state<BoostPricingView>(
		untrack(() => structuredClone($state.snapshot(data.pricing)))
	);
	let saved = $state(untrack(() => JSON.stringify(data.pricing.sheet)));
	let platform = $state('all');
	let search = $state('');
	let filter = $state('menu');
	let busy = $state(false);
	let expanded = $state<string | null>(null);
	let error = $state('');
	let showPublish = $state(false);
	let showHistory = $state(false);
	const lookupSerial = new SvelteMap<string, number>();
	let nextLookupSerial = 0;
	const dirty = $derived(JSON.stringify(view.sheet) !== saved);
	const platforms = $derived([...new Set(view.sheet.rows.map((r) => r.platform))]);
	const selectedCount = $derived(view.sheet.rows.filter((r) => r.selected).length);
	const flaggedCount = $derived(
		view.sheet.rows.filter((r) => r.selected && warnings(r).length).length
	);
	const visible = $derived(
		view.sheet.rows.filter(
			(r) =>
				(platform === 'all' || r.platform === platform) &&
				(filter !== 'menu' || r.selected) &&
				(filter !== 'check' || warnings(r).length > 0) &&
				`${r.title} ${r.option} ${r.serviceId}`.toLowerCase().includes(search.toLowerCase())
		)
	);
	const label = (p: string) => (BOOSTING_PLATFORM_LABELS as Record<string, string>)[p] ?? p;
	const money = (n: number | null) =>
		n === null ? '—' : `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
	const quote = (r: BoostPricingRow) => view.quotes[r.id] ?? null;
	const economics = (r: BoostPricingRow) => pricingEconomics(r, view.sheet, quote(r));
	const warnings = (r: BoostPricingRow) => pricingWarnings(r, view.sheet, quote(r));

	onMount(() => {
		const before = (e: BeforeUnloadEvent) => {
			if (dirty) {
				e.preventDefault();
				e.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', before);
		return () => window.removeEventListener('beforeunload', before);
	});
	function updateTargets() {
		for (const row of view.sheet.rows)
			if (row.priceMode === 'target') {
				const target = pricingTarget(row, view.sheet, quote(row));
				if (target !== null) row.sale = target;
			}
	}
	async function action(payload: Record<string, unknown>) {
		lookupSerial.clear();
		busy = true;
		error = '';
		try {
			const response = await fetch('/api/admin/boosting-pricing', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const result = await response.json();
			if (!response.ok || !result.success) throw new Error(result.error || 'Could not save.');
			view = result.data;
			lookupSerial.clear();
			saved = JSON.stringify(view.sheet);
			showPublish = false;
			showHistory = false;
			showSuccess(
				payload.action === 'publish'
					? 'Menu published.'
					: payload.action === 'restore'
						? 'Restored as a draft. Nothing published.'
						: 'Draft saved.'
			);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not save.';
			showError(error);
		} finally {
			busy = false;
		}
	}
	async function refresh() {
		lookupSerial.clear();
		busy = true;
		error = '';
		try {
			const sync = await fetch('/api/admin/boosting-suppliers/sync', { method: 'POST' });
			const result = await sync.json();
			if (!sync.ok || !result.success) throw new Error(result.error || 'Costs could not refresh.');
			const response = await fetch('/api/admin/boosting-pricing');
			const fresh = await response.json();
			if (!response.ok || !fresh.success) throw new Error('Could not load updated costs.');
			for (const row of view.sheet.rows) {
				const stored = fresh.data.sheet.rows.find((r: BoostPricingRow) => r.id === row.id);
				if (stored?.provider === row.provider && stored?.serviceId === row.serviceId)
					view.quotes[row.id] = fresh.data.quotes[row.id];
			}
			view.liveStatuses = fresh.data.liveStatuses;
			view.changedRows = fresh.data.changedRows;
			// Refreshing quotes deliberately does not overwrite ANY draft price, even target mode.
			showSuccess('Costs refreshed. Your prices are unchanged.');
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Refresh failed.';
			showError(error);
		} finally {
			busy = false;
		}
	}
	async function lookup(row: BoostPricingRow) {
		const serial = ++nextLookupSerial;
		lookupSerial.set(row.id, serial);
		const provider = row.provider,
			code = row.serviceId;
		view.quotes[row.id] = null;
		if (!row.sourceOfferId) return;
		try {
			const response = await fetch(
				`/api/admin/boosting-pricing/lookup?row=${encodeURIComponent(row.id)}&provider=${encodeURIComponent(provider)}&code=${encodeURIComponent(code)}`
			);
			const result = await response.json();
			if (
				serial !== lookupSerial.get(row.id) ||
				row.provider !== provider ||
				row.serviceId !== code
			)
				return;
			if (!response.ok || !result.success)
				throw new Error(result.error || 'Service lookup failed.');
			view.quotes[row.id] = result.data;
			if (row.priceMode === 'target') {
				const target = pricingTarget(row, view.sheet, result.data);
				if (target !== null) row.sale = target;
			}
		} catch (cause) {
			showError(cause instanceof Error ? cause.message : 'Service lookup failed.');
		}
	}
	function exportSheet() {
		const url = URL.createObjectURL(
			new Blob([exportPricingCsv(view.sheet, view.quotes)], { type: 'text/csv;charset=utf-8' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'fastaccs-boosting-pricing.csv';
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
</script>

<svelte:head><title>Boosting Pricing · FastAccs Admin</title></svelte:head>
<div class="pricing-page">
	<header class="pricing-header">
		<div>
			<p class="eyebrow">BOOSTING</p>
			<h1><Zap size={24} /> Boosting Pricing</h1>
			<p class="subtitle">One sheet. Your services, prices and profit.</p>
		</div>
		<div class="toolbar">
			<button class="quiet" onclick={exportSheet}><Download size={16} /> Export</button>
			<button class="quiet" disabled={busy} onclick={refresh}
				><RefreshCcw size={16} /> Refresh costs</button
			>
			<button class="quiet" disabled={busy} onclick={() => (showHistory = !showHistory)}
				>History</button
			>
			<button
				class="save"
				disabled={busy || (!dirty && view.sheet.version > 0)}
				onclick={() => action({ action: 'save', sheet: view.sheet })}
				><Save size={16} /> Save draft</button
			>
			<button
				class="publish"
				disabled={busy || dirty || view.sheet.version === 0}
				onclick={() => (showPublish = true)}>Publish menu</button
			>
		</div>
	</header>
	<div class="status-bar">
		<span>{selectedCount} in menu</span><span>{flaggedCount} to check</span><span
			>{dirty
				? 'Unsaved changes'
				: view.sheet.version === 0
					? 'Approved review · save draft'
					: view.history[0]?.action === 'boosting_pricing_published'
						? `Published · v${view.sheet.version}`
						: `Saved draft · v${view.sheet.version}`}</span
		><a href="/admin/boosting-mappings">Advanced setup <ChevronRight size={14} /></a>
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if view.changedRows?.length}
		<section class="confirm-panel" aria-label="Review setup changes">
			<div>
				<h2>Advanced setup has changed</h2>
				<p>
					Review the current costs and service limits, then accept. Your sheet prices stay
					unchanged.
				</p>
			</div>
			<a class="quiet" href="/admin/boosting-mappings">Review setup</a>
			<button
				class="quiet"
				disabled={busy || dirty}
				onclick={() => action({ action: 'reconcile', version: view.sheet.version, confirm: true })}
				>Accept as draft</button
			>
		</section>
	{/if}
	{#if showPublish}
		<section class="confirm-panel" aria-label="Confirm publication">
			<div>
				<h2>Publish {selectedCount} offers?</h2>
				<p>
					This replaces the menu with your saved selection. Unselected offers go offline. Existing
					orders stay unchanged.
				</p>
			</div>
			<button class="quiet" disabled={busy} onclick={() => (showPublish = false)}>Not yet</button>
			<button
				class="publish"
				disabled={busy}
				onclick={() => action({ action: 'publish', version: view.sheet.version, confirm: true })}
				>Yes, publish</button
			>
		</section>
	{/if}
	{#if showHistory}
		<section class="history" aria-label="Saved versions">
			<h2>Saved versions</h2>
			<p>Restore creates a draft. It does not publish.</p>
			{#each view.history as h (h.id)}<div>
					<span
						>v{h.version} · {h.action === 'boosting_pricing_published' ? 'Published' : 'Draft'} · {new Date(
							h.createdAt
						).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</span
					><button
						class="quiet"
						disabled={busy || dirty}
						onclick={() =>
							action({ action: 'restore', historyId: h.id, version: view.sheet.version })}
						>Restore draft</button
					>
				</div>{/each}
			{#if !view.history.length}<p>No saved versions yet.</p>{/if}
		</section>
	{/if}
	<div class="filters">
		<label class="search"
			><Search size={17} /><input
				aria-label="Search services"
				placeholder="Search services or code"
				bind:value={search}
			/></label
		>
		<select aria-label="Platform" bind:value={platform}
			><option value="all">All platforms</option>{#each platforms as p (p)}<option value={p}
					>{label(p)}</option
				>{/each}</select
		>
		<select aria-label="Rows" bind:value={filter}
			><option value="menu">In menu</option><option value="all">All offers</option><option
				value="check">Needs a check</option
			></select
		>
		<details class="settings">
			<summary>Pricing settings</summary>
			<div>
				<label
					>USD → NGN<input
						type="number"
						min="1"
						bind:value={view.sheet.settings.fx}
						onchange={updateTargets}
					/></label
				>
				<label
					><input
						type="checkbox"
						bind:checked={view.sheet.settings.feeConfirmed}
						onchange={updateTargets}
					/> Include estimated fees</label
				>
				{#if view.sheet.settings.feeConfirmed}<label
						>Fee %<input
							type="number"
							min="0"
							max="99"
							step="0.01"
							bind:value={view.sheet.settings.feePercent}
							onchange={updateTargets}
						/></label
					><label
						>Fixed fee ₦<input
							type="number"
							min="0"
							step="0.01"
							bind:value={view.sheet.settings.feeFixed}
							onchange={updateTargets}
						/></label
					>{/if}
				<p>Supplier rate is protected. Manual selling prices stay fixed.</p>
			</div>
		</details>
	</div>
	<div class="sheet-wrap" role="region" aria-label="Boosting pricing sheet">
		<table>
			<thead
				><tr
					><th>Service</th><th>Menu</th><th>Supplier / code</th><th>Pack quantity</th><th
						>Supplier cost</th
					><th>Target profit %</th><th>Selling price</th><th>Profit</th><th
						><span class="sr-only">Options</span></th
					></tr
				></thead
			>
			<tbody
				>{#each visible as row (row.id)}
					{@const e = economics(row)}{@const issues = warnings(row)}{@const q = quote(row)}
					<tr class:flagged={issues.length > 0}>
						<td class="service"
							><span class="platform">{label(row.platform)}</span><strong
								>{row.title.replace(new RegExp(`^${row.platform}\\s*`, 'i'), '')}</strong
							>{#if row.option}<span class="option">{row.option}</span>{/if}<span class="live-state"
								>{view.liveStatuses[row.id] === 'live' ? 'Live' : 'Offline'}{#if issues.length}
									· <span class="warning">{issues.length} to check</span>{/if}</span
							></td
						>
						<td data-label="Menu"
							><input
								type="checkbox"
								aria-label={`Include ${row.title} ${row.option}`}
								bind:checked={row.selected}
								disabled={busy}
							/></td
						>
						<td data-label="Supplier / code" class="supplier"
							><select
								aria-label={`Supplier for ${row.title}`}
								bind:value={row.provider}
								disabled={busy}
								onchange={() => lookup(row)}
								><option value="bulk_follows">BulkFollows</option><option value="smm_raja"
									>SMM Raja</option
								></select
							><input
								aria-label={`Code for ${row.title}`}
								bind:value={row.serviceId}
								disabled={busy}
								onchange={() => lookup(row)}
							/><span title={q?.name}>{q?.name ?? 'Needs lookup'}</span></td
						>
						<td data-label="Pack quantity"
							><input
								type="number"
								aria-label={`Pack quantity for ${row.title}`}
								min="1"
								step="1"
								bind:value={row.units}
								disabled={busy}
								onchange={updateTargets}
							/></td
						>
						<td data-label="Supplier cost" class="cost"
							>{money(e.cost)}<small>{q ? `$${q.rateUsd ?? '—'} / 1,000` : 'No quote'}</small></td
						>
						<td data-label="Target profit %"
							><input
								type="number"
								aria-label={`Target profit for ${row.title}`}
								min="0"
								max="10000"
								step="0.01"
								bind:value={row.targetMarkup}
								disabled={busy}
								onchange={updateTargets}
							/></td
						>
						<td data-label="Selling price"
							><input
								type="number"
								aria-label={`Selling price for ${row.title}`}
								min="0"
								step="50"
								bind:value={row.sale}
								disabled={busy}
								oninput={() => (row.priceMode = 'manual')}
							/><select
								class="mode"
								aria-label={`Price mode for ${row.title}`}
								bind:value={row.priceMode}
								disabled={busy}
								onchange={updateTargets}
								><option value="manual">My price</option><option value="target">Use target</option
								></select
							></td
						>
						<td data-label="Profit" class="profit" class:loss={e.profit !== null && e.profit <= 0}
							>{money(e.profit)}<small
								>{e.markup === null
									? '—'
									: `${Math.round(e.markup).toLocaleString()}% on cost`}</small
							></td
						>
						<td class="details-cell"
							><button
								class="quiet"
								aria-label={`Details for ${row.title}`}
								aria-expanded={expanded === row.id}
								onclick={() => (expanded = expanded === row.id ? null : row.id)}
								>{expanded === row.id ? 'Close' : 'Details'}</button
							></td
						>
					</tr>
					{#if expanded === row.id}<tr class="detail-row"
							><td colspan="9"
								><div class="row-details">
									<div class="detail-fields">
										<label
											>Option name<input
												bind:value={row.option}
												disabled={busy}
												placeholder="Leave blank for a single option"
											/></label
										><label
											>Starting quantity<input
												type="number"
												min="1"
												step="1"
												bind:value={row.startingQuantity}
												disabled={busy}
											/></label
										><label
											>Quantity increment<input
												type="number"
												min="1"
												step="1"
												bind:value={row.increment}
												disabled={busy}
											/></label
										><label
											>Retry<select bind:value={row.recoveryMode} disabled={busy}
												><option value="off">Off</option><option value="definitive"
													>Confirmed failure only</option
												><option value="fallback">Advanced fallback</option></select
											></label
										><label
											>Total attempts<input
												type="number"
												min="1"
												max="4"
												bind:value={row.attempts}
												disabled={busy}
											/></label
										><label
											>Profit budget %<input
												type="number"
												min="0"
												max="100"
												bind:value={row.profitBudgetPercent}
												disabled={busy}
											/></label
										><label class="note"
											>Private note<input bind:value={row.note} disabled={busy} /></label
										>
									</div>
									<p>
										Customer starts at {pricingStart(row, q?.max ?? null).toLocaleString()} · Supplier
										range {q?.min?.toLocaleString() ?? '—'}–{q?.max?.toLocaleString() ?? '—'} · Recovery
										estimate {money(e.recoveryBudget)}
									</p>
									<p>
										Retries cover confirmed, uncharged failures only. Paid replacements are not
										enabled. {view.sheet.settings.feeConfirmed
											? 'Estimated fees included.'
											: 'Profit estimates exclude payment fees.'}
									</p>
									{#if issues.length}<ul class="issues">
											{#each issues as issue (issue)}<li>{issue}</li>{/each}
										</ul>{/if}
								</div></td
							></tr
						>{/if}
				{/each}</tbody
			>
		</table>
		{#if !visible.length}<p class="empty">No matching services.</p>{/if}
	</div>
	<p class="footnote">
		Prices and costs are for the pack quantity. Save keeps changes private; Publish updates the
		storefront.
	</p>
</div>

<style>
	.pricing-page {
		--brand: var(--primary);
		min-width: 0;
		color: var(--text);
		max-width: 1600px;
		margin: 0 auto;
	}
	.pricing-header,
	.toolbar,
	.status-bar,
	.filters {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.pricing-header {
		justify-content: space-between;
		margin-bottom: 1.5rem;
		align-items: flex-start;
	}
	.eyebrow {
		color: var(--brand);
		font-size: 0.7rem;
		letter-spacing: 0.16em;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.6rem;
		font-weight: 700;
		margin: 0;
	}
	.subtitle,
	.footnote {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin: 0.5rem 0 0;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		border-radius: 0.65rem;
		padding: 0.65rem 0.8rem;
		cursor: pointer;
		border: 1px solid var(--border);
		white-space: nowrap;
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.quiet {
		background: var(--surface);
		color: var(--text);
	}
	.save {
		background: var(--surface);
		border-color: var(--brand);
		color: var(--brand);
	}
	.publish {
		background: var(--brand);
		color: #03110c;
		border-color: var(--brand);
	}
	.status-bar {
		padding: 0.7rem 1rem;
		border: 1px solid var(--border);
		border-radius: 0.8rem;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.8rem;
	}
	.status-bar > span + span::before {
		content: '·';
		margin-right: 0.75rem;
	}
	.status-bar a {
		margin-left: auto;
		color: var(--brand);
		display: flex;
		align-items: center;
	}
	.filters {
		padding: 1rem 0;
	}
	input:not([type='checkbox']),
	select {
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.5rem 0.6rem;
		min-height: 38px;
		font-size: 0.8rem;
		width: 100%;
	}
	input:focus,
	select:focus,
	button:focus-visible,
	summary:focus-visible,
	.sheet-wrap:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 2px;
	}
	input[type='checkbox'] {
		width: 17px;
		height: 17px;
		accent-color: var(--brand);
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 200px;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding-left: 0.7rem;
	}
	.search input {
		border: 0;
		background: transparent;
	}
	.filters > select {
		width: auto;
	}
	.settings {
		margin-left: auto;
		position: relative;
		font-size: 0.8rem;
	}
	.settings summary {
		cursor: pointer;
		color: var(--text-muted);
	}
	.settings > div {
		position: absolute;
		z-index: 5;
		top: 2rem;
		right: 0;
		width: 280px;
		padding: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0.8rem;
		box-shadow: 0 12px 30px #0004;
	}
	.settings label,
	.detail-fields label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.settings label + label {
		margin-top: 0.7rem;
	}
	.settings p {
		margin-top: 0.8rem;
		color: var(--text-muted);
		font-size: 0.75rem;
	}
	.sheet-wrap {
		border: 1px solid var(--border);
		border-radius: 0.9rem;
		overflow: auto;
		background: var(--surface);
	}
	table {
		border-collapse: separate;
		border-spacing: 0;
		width: 100%;
		min-width: 1160px;
		font-size: 0.8rem;
	}
	th {
		position: sticky;
		top: 0;
		background: var(--surface);
		color: var(--text-muted);
		text-align: left;
		font-weight: 600;
		font-size: 0.7rem;
		padding: 0.9rem 0.7rem;
		border-bottom: 1px solid var(--border);
		z-index: 2;
		white-space: nowrap;
	}
	td {
		padding: 0.9rem 0.7rem;
		vertical-align: top;
		border-bottom: 1px solid var(--border);
	}
	td input[type='number'] {
		min-width: 80px;
		width: 100px;
	}
	.service {
		min-width: 190px;
		position: sticky;
		left: 0;
		background: var(--bg-elev-1);
		z-index: 1;
	}
	.service strong {
		display: block;
		font-size: 0.9rem;
		margin: 0.2rem 0;
	}
	.platform {
		color: var(--text-muted);
		font-size: 0.7rem;
	}
	.option {
		display: block;
		color: var(--text-muted);
		font-size: 0.75rem;
		margin-bottom: 0.2rem;
	}
	.live-state {
		color: var(--text-muted);
		font-size: 0.7rem;
	}
	.warning {
		color: #eab308;
	}
	.supplier {
		min-width: 190px;
		max-width: 230px;
	}
	.supplier input {
		margin-top: 0.35rem;
	}
	.supplier > span {
		display: block;
		color: var(--text-muted);
		font-size: 0.65rem;
		margin-top: 0.3rem;
		max-width: 190px;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
	}
	.cost,
	.profit {
		min-width: 125px;
		font-weight: 600;
	}
	.cost small,
	.profit small {
		display: block;
		color: var(--text-muted);
		font-size: 0.65rem;
		font-weight: 400;
		margin-top: 0.4rem;
		white-space: nowrap;
	}
	.profit {
		color: var(--brand);
	}
	.loss,
	.error {
		color: #f87171;
	}
	.mode {
		font-size: 0.65rem;
		padding: 0.2rem 0.4rem;
		min-height: 28px;
		margin-top: 0.3rem;
	}
	.detail-row td {
		padding: 0;
	}
	.row-details {
		padding: 1rem;
		background: var(--bg);
	}
	.detail-fields {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}
	.detail-fields input {
		width: 100%;
	}
	.detail-fields .note {
		grid-column: 1/-1;
	}
	.row-details p,
	.history p {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 0.8rem 0 0;
	}
	.issues {
		margin: 0.7rem 0 0;
		padding-left: 1rem;
		color: #eab308;
		font-size: 0.75rem;
	}
	.issues li + li {
		margin-top: 0.3rem;
	}
	.empty {
		padding: 2rem;
		text-align: center;
		color: var(--text-muted);
	}
	.confirm-panel,
	.history {
		padding: 1rem;
		margin-top: 1rem;
		border: 1px solid var(--border);
		border-radius: 0.8rem;
		background: var(--surface);
	}
	.confirm-panel {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.confirm-panel > div {
		flex: 1;
		min-width: 200px;
	}
	.confirm-panel p {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-top: 0.4rem;
	}
	h2 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}
	.history > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 0;
		font-size: 0.8rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}
	@media (max-width: 700px) {
		h1 {
			font-size: 1.4rem;
		}
		.toolbar {
			width: 100%;
			gap: 0.5rem;
		}
		.toolbar button {
			flex: 1;
			padding: 0.6rem;
		}
		.status-bar {
			gap: 0.5rem;
		}
		.status-bar a {
			width: 100%;
			margin: 0;
		}
		.filters > select {
			flex: 1;
		}
		.search {
			flex-basis: 100%;
		}
		.settings {
			width: 100%;
			margin: 0;
		}
		.settings > div {
			position: static;
			width: 100%;
			margin-top: 0.5rem;
		}
		.sheet-wrap {
			overflow: visible;
			border: 0;
			background: transparent;
		}
		table,
		tbody {
			display: block;
			min-width: 0;
		}
		thead {
			display: none;
		}
		tbody > tr:not(.detail-row) {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0.8rem;
			padding: 1rem;
			border: 1px solid var(--border);
			border-radius: 0.85rem;
			background: var(--surface);
			margin-bottom: 0.8rem;
		}
		td {
			display: block;
			padding: 0;
			border: 0;
			min-width: 0 !important;
			max-width: none !important;
		}
		.service {
			position: static;
			grid-column: 1;
			background: transparent;
		}
		td[data-label]::before {
			content: attr(data-label);
			display: block;
			font-size: 0.65rem;
			color: var(--text-muted);
			font-weight: 400;
			margin-bottom: 0.3rem;
		}
		td:nth-child(2) {
			text-align: right;
		}
		.supplier {
			grid-column: 1/-1;
		}
		.supplier > span {
			max-width: 100%;
		}
		td input[type='number'] {
			width: 100%;
		}
		.cost,
		.profit {
			padding: 0.3rem 0;
		}
		.details-cell {
			grid-column: 1/-1;
		}
		.details-cell button {
			width: 100%;
		}
		.detail-row {
			display: block;
			margin: -0.8rem 0 0.8rem;
		}
		.row-details {
			border: 1px solid var(--border);
			border-radius: 0.8rem;
		}
		.detail-fields {
			grid-template-columns: 1fr 1fr;
		}
		.history > div {
			align-items: flex-start;
		}
		.history > div span {
			font-size: 0.7rem;
		}
	}
</style>
