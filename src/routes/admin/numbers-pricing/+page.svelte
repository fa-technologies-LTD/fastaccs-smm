<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { Save, Download, RefreshCcw, Search, Phone } from '$lib/icons';
	import { showSuccess, showError } from '$lib/stores/toasts';
	import {
		exportNumbersPricingCsv,
		numbersEconomics,
		numbersPricingWarnings,
		numbersRowChanged,
		numbersTargetPrice,
		type NumbersPricingRow,
		type NumbersPricingView
	} from '$lib/helpers/numbers-pricing-sheet';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let view = $state<NumbersPricingView>(
		untrack(() => structuredClone($state.snapshot(data.pricing)))
	);
	let saved = $state(untrack(() => JSON.stringify(data.pricing.sheet)));
	let search = $state(''),
		app = $state('all'),
		filter = $state('all'),
		pageNumber = $state(1);
	let busy = $state(false),
		error = $state(''),
		confirmPublish = $state(false);
	const dirty = $derived(JSON.stringify(view.sheet) !== saved);
	const changedCount = $derived(view.sheet.rows.filter(numbersRowChanged).length);
	const apps = $derived([...new Set(Object.values(view.quotes).map((q) => q.app))].sort());
	const visible = $derived(
		view.sheet.rows.filter((r) => {
			const q = view.quotes[r.id];
			return (
				(app === 'all' || q?.app === app) &&
				(filter !== 'enabled' || r.active) &&
				(filter !== 'changed' || numbersRowChanged(r)) &&
				(filter !== 'check' || numbersPricingWarnings(r, q, view.fx).length > 0) &&
				`${q?.app} ${q?.country} ${q?.provider}`.toLowerCase().includes(search.toLowerCase())
			);
		})
	);
	const pages = $derived(Math.max(1, Math.ceil(visible.length / 100)));
	const currentPage = $derived(Math.min(pageNumber, pages));
	const displayed = $derived(visible.slice((currentPage - 1) * 100, currentPage * 100));
	const money = (n: number | null) =>
		n === null ? '—' : `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
	const title = (row: NumbersPricingRow) =>
		`${view.quotes[row.id]?.app} · ${view.quotes[row.id]?.country}`;
	const economics = (row: NumbersPricingRow) => numbersEconomics(row, view.quotes[row.id], view.fx);
	const warnings = (row: NumbersPricingRow) =>
		numbersPricingWarnings(row, view.quotes[row.id], view.fx);
	onMount(() => {
		const guard = (e: BeforeUnloadEvent) => {
			if (dirty) {
				e.preventDefault();
				e.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', guard);
		return () => window.removeEventListener('beforeunload', guard);
	});
	async function action(payload: Record<string, unknown>) {
		busy = true;
		error = '';
		try {
			const response = await fetch('/api/admin/numbers-pricing', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const result = await response.json();
			if (!response.ok || !result.success) throw new Error(result.error || 'Could not save.');
			view = result.data;
			saved = JSON.stringify(view.sheet);
			confirmPublish = false;
			showSuccess(
				payload.action === 'publish'
					? 'Numbers prices published.'
					: 'Draft saved. Live prices unchanged.'
			);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not save.';
			showError(error);
		} finally {
			busy = false;
		}
	}
	async function refresh() {
		busy = true;
		error = '';
		try {
			const response = await fetch('/api/admin/numbers-pricing');
			const result = await response.json();
			if (!response.ok || !result.success) throw new Error(result.error || 'Could not refresh.');
			if (dirty) {
				view.quotes = result.data.quotes;
				view.fx = result.data.fx;
			} else {
				view = result.data;
				saved = JSON.stringify(view.sheet);
			}
			showSuccess('Latest catalogue loaded. Your edits are unchanged.');
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not refresh.';
			showError(error);
		} finally {
			busy = false;
		}
	}
	function useTarget(row: NumbersPricingRow) {
		const value = numbersTargetPrice(view.quotes[row.id]?.costCents, view.fx, row.targetMarkup);
		if (value !== null) {
			row.sale = value;
			row.mode = 'manual';
		}
	}
	function useLive(row: NumbersPricingRow) {
		const live = view.quotes[row.id]?.live;
		if (live)
			Object.assign(row, {
				active: live.active,
				mode: live.mode,
				sale: live.sale,
				baseline: structuredClone($state.snapshot(live))
			});
	}
	function download() {
		const blob = new Blob([exportNumbersPricingCsv($state.snapshot(view))], {
			type: 'text/csv;charset=utf-8'
		});
		const url = URL.createObjectURL(blob),
			anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'fastaccs-numbers-pricing.csv';
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
</script>

<svelte:head><title>Numbers Pricing · Admin · Fast Accounts</title></svelte:head>
<section class="pricing-page">
	<header>
		<div>
			<p class="eyebrow">PRICING</p>
			<h1><Phone size={24} /> Numbers Pricing</h1>
			<p class="intro">One sheet for your Numbers prices. Save first, publish when ready.</p>
		</div>
		<a href="/admin/numbers">Advanced settings →</a>
	</header>
	<div class="toolbar">
		<div class="status">
			{dirty
				? 'Unsaved changes'
				: view.history.length
					? `Saved draft · v${view.sheet.version}`
					: 'Live prices'}<span>{changedCount} live changes · $1 = {money(view.fx)}</span>
		</div>
		<div class="actions">
			<button onclick={download} disabled={busy}><Download size={16} /> Export</button>
			<button onclick={refresh} disabled={busy}><RefreshCcw size={16} /> Refresh</button>
			<button
				onclick={() => action({ action: 'save', sheet: $state.snapshot(view.sheet) })}
				disabled={busy}><Save size={16} /> Save draft</button
			>
			<button
				class="primary"
				onclick={() => (confirmPublish = true)}
				disabled={busy || dirty || !view.history.length || !changedCount}>Publish prices</button
			>
		</div>
	</div>
	{#if error}<p role="alert" class="error">{error}</p>{/if}
	{#if confirmPublish}
		<section class="confirm" aria-label="Confirm publication">
			<div>
				<h2>Publish {changedCount} changes?</h2>
				<p>Manual prices apply now. Auto prices update on the next catalogue sync.</p>
			</div>
			<div class="actions">
				<button onclick={() => (confirmPublish = false)} disabled={busy}>Not yet</button><button
					class="primary"
					onclick={() => action({ action: 'publish', version: view.sheet.version, confirm: true })}
					disabled={busy}>Yes, publish</button
				>
			</div>
		</section>
	{/if}
	<div class="filters">
		<label class="search"
			><Search size={16} /><input
				aria-label="Search Numbers"
				placeholder="Search app or country"
				bind:value={search}
				oninput={() => (pageNumber = 1)}
			/></label
		>
		<select aria-label="App filter" bind:value={app} onchange={() => (pageNumber = 1)}
			><option value="all">All apps</option>{#each apps as name}<option value={name}>{name}</option
				>{/each}</select
		>
		<select aria-label="Status filter" bind:value={filter} onchange={() => (pageNumber = 1)}
			><option value="all">All numbers</option><option value="enabled">Enabled</option><option
				value="changed">Changed</option
			><option value="check">Needs a look</option></select
		>
		<span>{visible.length} numbers</span>
	</div>
	<p class="note">
		Costs and profit are estimates, before payment fees. Auto uses your existing global settings;
		Profit % calculates a manual price.
	</p>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Focusable region enables keyboard scrolling of the sheet.) -->
	<div class="table-wrap" tabindex="0" role="region" aria-label="Numbers pricing sheet">
		<table>
			<thead
				><tr
					><th>Offer</th><th>Supplier</th><th>Cost</th><th>Profit %</th><th>Your price</th><th
						>Est. profit</th
					><th>Pricing</th><th>Enabled</th><th>Status</th></tr
				></thead
			>
			<tbody>
				{#each displayed as row (row.id)}
					{@const q = view.quotes[row.id]}
					{@const e = economics(row)}
					{@const flags = warnings(row)}
					<tr class:changed={numbersRowChanged(row)}>
						<td class="offer"
							><strong>{q?.app ?? 'Removed number'}</strong><span>{q?.country ?? row.id}</span></td
						>
						<td
							><strong
								>{q?.provider === 'pvapins'
									? 'PVAPins'
									: q?.provider === 'hubman'
										? 'Hubman'
										: q?.provider}</strong
							><span>App {q?.serviceId} · Country {q?.countryId}</span></td
						>
						<td
							><strong>{money(e.cost)}</strong><span
								>{q?.costCents > 0 ? `$${(q.costCents / 100).toFixed(4)}` : 'Not quoted'}</span
							></td
						>
						<td
							><input
								type="number"
								min="0"
								max="100000"
								step="1"
								aria-label={`Target profit for ${title(row)}`}
								bind:value={row.targetMarkup}
								disabled={busy}
							/><button
								class="text-button"
								onclick={() => useTarget(row)}
								disabled={busy || !q?.costCents}>Use target</button
							></td
						>
						<td
							><input
								type="number"
								min="1000"
								max="100000000"
								step="100"
								aria-label={`Selling price for ${title(row)}`}
								bind:value={row.sale}
								oninput={() => (row.mode = 'manual')}
								disabled={busy}
							/><span>₦100 steps</span></td
						>
						<td class="profit"
							><strong>{money(e.profit)}</strong><span
								>{e.markup === null ? '—' : `${Math.round(e.markup)}% on cost`}</span
							></td
						>
						<td
							><select
								aria-label={`Price mode for ${title(row)}`}
								bind:value={row.mode}
								onchange={(event) => {
									if (event.currentTarget.value === 'auto') row.sale = q?.live.sale ?? row.sale;
								}}
								disabled={busy}
								><option value="auto">Auto</option><option value="manual">My price</option></select
							></td
						>
						<td
							><input
								type="checkbox"
								aria-label={`Enable ${title(row)}`}
								bind:checked={row.active}
								disabled={busy}
							/></td
						>
						<td class="checks"
							>{#if flags.length}<span class="warning">{flags.join(' ')}</span>{:else}<span
									>{q?.available ?? 0} in stock</span
								>{/if}<span
								>Checked {q?.checkedAt
									? new Date(q.checkedAt).toLocaleString('en-NG', {
											dateStyle: 'short',
											timeStyle: 'short'
										})
									: 'not yet'}</span
							>{#if numbersRowChanged(row)}<button
									class="text-button"
									onclick={() => useLive(row)}
									disabled={busy}>Use live settings</button
								>{/if}</td
						>
					</tr>
				{:else}<tr><td colspan="9" class="empty">No matching numbers.</td></tr>{/each}
			</tbody>
		</table>
	</div>
	<div class="pagination">
		<span>Page {currentPage} of {pages}</span>
		<div class="actions">
			<button disabled={busy || currentPage <= 1} onclick={() => (pageNumber = currentPage - 1)}
				>Previous</button
			><button
				disabled={busy || currentPage >= pages}
				onclick={() => (pageNumber = currentPage + 1)}>Next</button
			>
		</div>
	</div>
	{#if view.history.length}<details>
			<summary>Saved versions</summary>{#each view.history as h}<p>
					v{h.version} · {h.action === 'numbers_pricing_published' ? 'Published' : 'Draft saved'} · {new Date(
						h.createdAt
					).toLocaleString('en-NG')}
				</p>{/each}
		</details>{/if}
</section>

<style>
	.pricing-page {
		--brand: var(--primary);
		min-width: 0;
		max-width: 100%;
		color: var(--text);
	}
	header,
	.toolbar,
	.confirm,
	.pagination {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
	}
	header {
		margin-bottom: 1.5rem;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.65rem;
		margin: 0;
	}
	h2 {
		font-size: 1rem;
		margin: 0;
	}
	.eyebrow {
		color: var(--brand);
		font-size: 0.7rem;
		letter-spacing: 0.16em;
		margin: 0 0 0.4rem;
		font-weight: 700;
	}
	.intro,
	.note,
	.status span,
	td span,
	.filters > span,
	.pagination > span,
	details p,
	.confirm p {
		color: var(--text-muted);
		font-size: 0.8rem;
	}
	.intro {
		margin: 0.5rem 0 0;
	}
	a {
		color: var(--brand);
		font-size: 0.85rem;
		text-decoration: none;
	}
	.toolbar {
		padding: 1rem;
		border: 1px solid var(--border);
		background: var(--surface);
		border-radius: 14px;
	}
	.status {
		font-size: 0.85rem;
	}
	.status span,
	td span {
		display: block;
		margin-top: 0.3rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.65rem 0.85rem;
		background: var(--bg-elev-1);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 9px;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.primary {
		background: var(--brand);
		color: var(--on-brand, #04130c);
		border-color: var(--brand);
		font-weight: 600;
	}
	.confirm {
		padding: 1rem;
		border: 1px solid var(--brand);
		border-radius: 12px;
		margin-top: 1rem;
	}
	.confirm p {
		margin-bottom: 0;
	}
	.filters {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
		margin: 1.2rem 0 0.7rem;
	}
	input:not([type='checkbox']),
	select {
		background: var(--bg);
		border: 1px solid var(--border);
		color: var(--text);
		padding: 0.55rem 0.7rem;
		border-radius: 8px;
		font: inherit;
		font-size: 0.8rem;
		min-width: 0;
	}
	input:focus-visible,
	select:focus-visible,
	button:focus-visible,
	a:focus-visible,
	.table-wrap:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 2px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
		color: var(--text-muted);
	}
	.search input {
		width: 100%;
	}
	.note {
		margin: 0.8rem 0;
		line-height: 1.5;
	}
	.table-wrap {
		width: 100%;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		max-height: 70vh;
	}
	table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 0.8rem;
		min-width: 1160px;
	}
	th {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--surface);
		font-weight: 500;
		color: var(--text-muted);
		text-align: left;
	}
	th,
	td {
		padding: 0.9rem 0.75rem;
		border-bottom: 1px solid var(--border);
		vertical-align: top;
	}
	td strong {
		font-weight: 550;
	}
	th:first-child,
	.offer {
		position: sticky;
		left: 0;
		background: var(--surface);
		min-width: 160px;
		max-width: 200px;
		border-right: 1px solid var(--border);
		z-index: 1;
	}
	th:first-child {
		z-index: 3;
	}
	td input:not([type='checkbox']) {
		width: 110px;
	}
	td input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--brand);
		margin: 0.5rem;
	}
	.text-button {
		background: transparent;
		padding: 0;
		border: 0;
		color: var(--brand);
		font-size: 0.72rem;
		margin-top: 0.4rem;
	}
	.checks {
		min-width: 210px;
		max-width: 270px;
	}
	.checks .warning {
		color: var(--warning, #f6c76a);
	}
	.changed .offer {
		border-left: 3px solid var(--brand);
	}
	.empty {
		padding: 3rem;
		text-align: center;
	}
	.error {
		color: var(--danger, #ff7272);
	}
	.pagination {
		margin: 1rem 0;
	}
	details {
		border-top: 1px solid var(--border);
		padding-top: 1rem;
		font-size: 0.85rem;
	}
	summary {
		cursor: pointer;
		color: var(--text-muted);
	}
	@media (max-width: 600px) {
		h1 {
			font-size: 1.35rem;
		}
		.toolbar .actions {
			width: 100%;
		}
		.toolbar .actions button {
			flex: 1;
		}
		.filters > select {
			flex: 1;
			max-width: 100%;
		}
		.search {
			flex-basis: 100%;
		}
		th:first-child,
		.offer {
			min-width: 130px;
			max-width: 155px;
		}
		.confirm .actions {
			width: 100%;
		}
	}
</style>
