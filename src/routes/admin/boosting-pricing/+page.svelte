<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { adminDialog } from '$lib/helpers/admin-dialog';
	import { Save, Download, RefreshCcw, Lock, Unlock, Zap, X } from '$lib/icons';
	import BoostingSupplierSetup from '$lib/components/admin/BoostingSupplierSetup.svelte';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import {
		BOOSTING_PLATFORM_LABELS,
		BOOSTING_ACTION_LABELS
	} from '$lib/helpers/boosting-service-config';
	import {
		pricingEconomics,
		pricingStart,
		exportPricingCsv,
		type BoostPricingRow
	} from '$lib/helpers/boosting-pricing-sheet';
	import {
		boostAutoPrice,
		boostRowWarnings,
		type BoostControlsView,
		type BoostingSetupData
	} from '$lib/helpers/boosting-pricing-controls';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let view = $state<BoostControlsView>(
		untrack(() => structuredClone($state.snapshot(data.pricing)))
	);
	let saved = $state(untrack(() => JSON.stringify(data.pricing.sheet)));
	let platform = $state('all');
	let filter = $state('all');
	let search = $state('');
	let busy = $state(false);
	let error = $state('');
	let expanded = $state<string | null>(null);
	let supplier = $state<BoostPricingRow | null>(null);
	let expandConfirm = $state(false);
	let balances = $state<
		Array<{ id: string; label: string; balance: number | null; currency: string | null }>
	>([]);
	const dirty = $derived(JSON.stringify(view.sheet) !== saved);
	beforeNavigate(({ cancel }) => {
		if ((dirty || supplier) && !confirm('Leave this page? Unsaved changes will be lost.')) cancel();
	});
	const label = (p: string) => (BOOSTING_PLATFORM_LABELS as Record<string, string>)[p] ?? p;
	const money = (v: number | null) =>
		v == null ? '—' : `₦${v.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
	const quote = (r: BoostPricingRow) => view.quotes[r.id] ?? null;
	const economics = (r: BoostPricingRow) => pricingEconomics(r, view.sheet, quote(r));
	const warnings = (r: BoostPricingRow) => {
		const issues = boostRowWarnings(r, view.sheet, quote(r));
		if (r.sourceOfferId && !view.setup[r.id]?.reviewed) issues.push('Review supplier setup.');
		const q = quote(r);
		if (q && Date.now() - Date.parse(q.checkedAt) > (view.catalogMaxAgeMinutes ?? 390) * 60000)
			issues.push('Refresh supplier costs.');
		if (
			q?.rateUsd != null &&
			view.setup[r.id] &&
			(q.rateUsd * view.sheet.settings.fx * r.startingQuantity) / 1000 >
				view.setup[r.id].maximumCostNgn + 0.005
		)
			issues.push('Supplier cost exceeds reviewed limit.');
		return issues;
	};
	const platforms = $derived([...new Set(view.sheet.rows.map((r) => r.platform))]);
	const flagged = $derived(view.sheet.rows.filter((r) => warnings(r).length > 0).length);
	const live = $derived(view.sheet.rows.filter((r) => view.liveStatuses[r.id] === 'live').length);
	const visible = $derived(
		view.sheet.rows.filter(
			(r) =>
				(platform === 'all' || r.platform === platform) &&
				(filter !== 'live' || r.selected) &&
				(filter !== 'review' || warnings(r).length > 0) &&
				`${r.title} ${r.option} ${r.serviceId}`.toLowerCase().includes(search.toLowerCase())
		)
	);
	const setupData = $derived.by((): BoostingSetupData => {
		const r = supplier;
		const categoryId = r ? view.setup[r.id]?.categoryId : undefined;
		return {
			offers:
				r && categoryId
					? [
							{
								id: categoryId,
								name: r.title,
								isActive: r.selected,
								platform: r.platform,
								platformLabel: label(r.platform),
								outcome: r.outcome,
								outcomeLabel:
									(BOOSTING_ACTION_LABELS as Record<string, string>)[r.outcome] ?? r.outcome,
								pricePerStepNgn: (r.sale * r.increment) / r.units
							}
						]
					: [],
			mappingSummary: { categories: 1, tiers: 1, reviewedTiers: 0, approvedRoutes: 0 }
		};
	});

	onMount(() => {
		const before = (event: BeforeUnloadEvent) => {
			if (dirty || supplier) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', before);
		void fetch('/api/admin/boosting-suppliers/discovery')
			.then((r) => r.json())
			.then((result) => {
				if (result.success) balances = result.data.providers;
			})
			.catch(() => {});
		return () => window.removeEventListener('beforeunload', before);
	});
	function previewPrices() {
		for (const row of view.sheet.rows)
			if (row.priceMode === 'target') {
				const price = boostAutoPrice(row, view.sheet, quote(row));
				if (price != null) row.sale = price;
			}
	}
	function toggleLock(row: BoostPricingRow) {
		row.priceMode = row.priceMode === 'manual' ? 'target' : 'manual';
		if (row.priceMode === 'target') {
			const price = boostAutoPrice(row, view.sheet, quote(row));
			if (price != null) row.sale = price;
		}
	}
	async function request(payload: Record<string, unknown>) {
		const response = await fetch('/api/admin/boosting-pricing', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const result = await response.json();
		if (!response.ok || !result.success)
			throw new Error(result.error || 'Could not save settings.');
		return result;
	}
	async function reload() {
		const response = await fetch('/api/admin/boosting-pricing');
		const result = await response.json();
		if (!response.ok || !result.success)
			throw new Error(result.error || 'Could not reload settings.');
		view = result.data;
		saved = JSON.stringify(view.sheet);
	}
	async function save() {
		busy = true;
		error = '';
		try {
			const result = await request({ action: 'save', sheet: view.sheet });
			view = result.data;
			saved = JSON.stringify(view.sheet);
			showSuccess('Boosting settings saved.');
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Save failed.';
			showError(error);
		} finally {
			busy = false;
		}
	}
	async function refreshCosts() {
		if (dirty) {
			showError('Save your changes before refreshing costs.');
			return;
		}
		busy = true;
		error = '';
		try {
			const response = await fetch('/api/admin/boosting-suppliers/sync', { method: 'POST' });
			const result = await response.json();
			if (!response.ok || !result.success)
				throw new Error(result.error || 'Costs could not refresh.');
			await reload();
			showSuccess('Costs refreshed. Locked prices kept.');
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Refresh failed.';
			showError(error);
		} finally {
			busy = false;
		}
	}
	async function expandCatalog() {
		busy = true;
		error = '';
		expandConfirm = false;
		try {
			const result = await request({ action: 'expand' });
			view = result.data;
			saved = JSON.stringify(view.sheet);
			showSuccess(`${result.summary.offersCreated} new offers added. Nothing published.`);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Expansion failed.';
			showError(error);
		} finally {
			busy = false;
		}
	}
	function openSupplier(row: BoostPricingRow) {
		if (dirty) {
			showError('Save your pricing changes before opening supplier setup.');
			return;
		}
		if (!view.setup[row.id]) {
			showError('Expand catalogue to set up this result.');
			return;
		}
		supplier = row;
	}
	function closeSupplier() {
		if (confirm('Close supplier setup? Any unsaved supplier edits will be lost.')) supplier = null;
	}
	async function supplierSaved() {
		await reload();
		supplier = null;
		showSuccess('Supplier setup saved. Enable Live when ready.');
	}
	function download() {
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

<svelte:head><title>Boosting · FastAccs Admin</title></svelte:head>
<div class="boosting-page">
	<header>
		<div class="heading">
			<Zap size={25} style="color: var(--primary);" />
			<div>
				<h1>Boosting — Pricing</h1>
				<p>Set your rules. Keep prices automatic, or lock your own.</p>
			</div>
		</div>
		<div class="actions">
			<button onclick={download}><Download size={16} /> Export</button>
			<button disabled={busy || dirty} onclick={() => (expandConfirm = true)}
				>+ Expand catalogue</button
			>
			<button class="primary" disabled={busy || !dirty} onclick={save}
				><Save size={16} /> {busy ? 'Working…' : 'Save'}</button
			>
		</div>
	</header>
	<fieldset disabled={busy}>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#if view.archivedDraft}<p class="hint">
				Showing current offer settings. Earlier sheet revisions remain in history.
			</p>{/if}
		<section class="panel">
			<h2>Pricing rules</h2>
			<p>
				Supplier cost × your dollar rate + profit, rounded up to ₦50. Overrides apply to the
				quantity shown in each row.
			</p>
			<div class="fields">
				<label
					>Dollar rate (₦ per $1)<input
						type="number"
						min="1"
						bind:value={view.sheet.settings.fx}
						oninput={() => queueMicrotask(previewPrices)}
					/></label
				>
				<label
					>Default profit on cost (%)<input
						type="number"
						min="0"
						max="500"
						bind:value={view.sheet.settings.defaultMarkup}
						oninput={() => queueMicrotask(previewPrices)}
					/><small>Rows with an override keep their own percentage.</small></label
				>
				<label
					>Profit target per pricing quantity (₦)<input
						type="number"
						min="0"
						bind:value={view.sheet.settings.profitTargetNgn}
						oninput={() => queueMicrotask(previewPrices)}
					/><small>0 means percentage-only pricing.</small></label
				>
			</div>
			<div class="floor">
				<label
					>Minimum retained profit per pricing quantity (₦)<input
						type="number"
						min="0"
						bind:value={view.sheet.settings.hardProfitNgn}
						oninput={() => queueMicrotask(previewPrices)}
					/></label
				>
				<p>A safety limit, not a selling-price target. Separate from the ₦500 minimum checkout.</p>
			</div>
			<details>
				<summary>Advanced pricing & fees</summary>
				<div class="fields">
					<label
						>Maximum price multiple<input
							type="number"
							min="0"
							step="0.1"
							bind:value={view.sheet.settings.maxPriceMultiple}
							oninput={() => queueMicrotask(previewPrices)}
						/><small>0 = off. Profit protection takes priority.</small></label
					>
					<label
						>Estimated payment fee (%)<input
							type="number"
							min="0"
							max="99"
							step="0.01"
							bind:value={view.sheet.settings.feePercent}
							oninput={() => queueMicrotask(previewPrices)}
						/></label
					>
					<label
						>Fee allocation per pricing quantity (₦)<input
							type="number"
							min="0"
							bind:value={view.sheet.settings.feeFixed}
							oninput={() => queueMicrotask(previewPrices)}
						/><small>Planning estimate; not an extra customer charge.</small></label
					>
				</div>
				<label class="check"
					><input
						type="checkbox"
						bind:checked={view.sheet.settings.feeConfirmed}
						onchange={() => queueMicrotask(previewPrices)}
					/> Include these verified fee estimates</label
				>
			</details>
			<p class="hint">
				Save applies changes. Unlocked prices follow your rules; locked prices stay put.
			</p>
		</section>
		<div class="catalog-toolbar">
			<div class="balances">
				{#each balances as balance (balance.id)}<span
						>{balance.label}
						<strong
							>{balance.balance == null
								? '—'
								: `${balance.currency ?? 'USD'} ${balance.balance.toFixed(2)}`}</strong
						></span
					>{/each}
			</div>
			<button disabled={busy || dirty} onclick={refreshCosts}
				><RefreshCcw size={15} /> Refresh costs</button
			>
		</div>
		<div class="filters">
			<p>{live} offers live · <span>{flagged} need review</span></p>
			<div>
				<label class="sr-only" for="platform">Platform</label><select
					id="platform"
					bind:value={platform}
					><option value="all">All platforms</option>{#each platforms as p}<option value={p}
							>{label(p)}</option
						>{/each}</select
				>
				<label class="sr-only" for="status">Status</label><select id="status" bind:value={filter}
					><option value="all">All offers</option><option value="live">Live</option><option
						value="review">Needs review</option
					></select
				>
				<input aria-label="Search offers" placeholder="Search offers" bind:value={search} />
			</div>
		</div>
		<div class="table-scroll">
			<table>
				<thead
					><tr
						><th>Service</th><th>Option</th><th>Quantity</th><th>Source</th><th>Cost ₦</th><th
							>Price ₦</th
						><th>Profit ₦</th><th>Status</th><th>Live</th></tr
					></thead
				><tbody>
					{#each visible as row (row.id)}
						<tr
							><td
								><button
									class="service"
									aria-expanded={expanded === row.id}
									onclick={() => (expanded = expanded === row.id ? null : row.id)}
									>{row.title}</button
								></td
							>
							<td
								>{view.sheet.rows.filter(
									(r) => r.platform === row.platform && r.outcome === row.outcome
								).length > 1
									? row.option ||
										(
											{ value: 'Affordable', stable: 'More stable', premium: 'Premium' } as Record<
												string,
												string
											>
										)[row.tier] ||
										row.tier
									: '—'}</td
							>
							<td>{row.units.toLocaleString()}</td><td
								><button class="source" onclick={() => openSupplier(row)}
									>{quote(row)
										? row.provider === 'smm_raja'
											? 'SMM Raja'
											: 'BulkFollows'
										: 'Set up'}<small
										>{row.serviceId ? `#${row.serviceId}` : ''}{view.setup[row.id]
											?.routingPolicy === 'automatic'
											? ' · Auto'
											: ''}</small
									></button
								></td
							>
							<td>{money(economics(row).cost)}</td><td
								><div class="price">
									<input
										aria-label={`Price for ${row.title} ${row.tier}`}
										type="number"
										min="0"
										step="0.01"
										bind:value={row.sale}
										oninput={() => (row.priceMode = 'manual')}
									/><button
										class:locked={row.priceMode === 'manual'}
										aria-label={`${row.priceMode === 'manual' ? 'Unlock' : 'Lock'} ${row.title} ${row.tier} price`}
										onclick={() => toggleLock(row)}
										>{#if row.priceMode === 'manual'}<Lock size={15} />{:else}<Unlock
												size={15}
											/>{/if}</button
									>
								</div></td
							>
							<td class:negative={(economics(row).profit ?? 0) <= 0} class="profit"
								>{money(economics(row).profit)}</td
							>
							<td
								><span
									class="badge"
									class:warning={warnings(row).length > 0}
									title={warnings(row).join(' ')}
									>{warnings(row).length
										? 'Needs review'
										: view.liveStatuses[row.id] === 'live'
											? 'Healthy'
											: 'Hidden'}</span
								></td
							>
							<td
								><input
									aria-label={`Live ${row.title} ${row.tier}`}
									type="checkbox"
									bind:checked={row.selected}
									disabled={busy ||
										(!row.selected &&
											(!view.setup[row.id]?.reviewed ||
												warnings(row).some(
													(w) =>
														![
															'Below profit target.',
															'Check option price order.',
															'Costs more per item than followers.'
														].includes(w)
												)))}
								/></td
							>
						</tr>
						{#if expanded === row.id}<tr class="expanded"
								><td colspan="9"
									><div class="row-details">
										<div>
											<h3>{row.title}</h3>
											<p>{quote(row)?.name ?? 'No supplier chosen'}</p>
											{#each warnings(row) as warning}<p class="warning-copy">{warning}</p>{/each}
											<p>
												Customers start at {pricingStart(
													row,
													quote(row)?.max ?? null
												).toLocaleString()} · +/− {row.increment.toLocaleString()}
											</p>
											<p>
												Reviewed supplier limit: {money(view.setup[row.id]?.maximumCostNgn ?? null)}
												per {row.startingQuantity.toLocaleString()}.
											</p>
											<button disabled={busy || dirty} onclick={() => openSupplier(row)}
												>Supplier setup</button
											>
										</div>
										<div class="fields">
											<label class="check"
												><input
													type="checkbox"
													bind:checked={row.useDefaultMarkup}
													onchange={() => queueMicrotask(previewPrices)}
												/> Use default profit percentage</label
											>
											<label
												>Profit on supplier cost (%)<input
													type="number"
													min="0"
													max="10000"
													disabled={row.useDefaultMarkup}
													bind:value={row.targetMarkup}
													oninput={() => queueMicrotask(previewPrices)}
												/></label
											>
											<label
												>Profit target override (₦)<input
													type="number"
													min="0"
													placeholder="Global"
													bind:value={row.profitTargetNgn}
													oninput={() => queueMicrotask(previewPrices)}
												/></label
											>
											<label
												>Minimum retained profit override (₦)<input
													type="number"
													min="0"
													placeholder="Global"
													bind:value={row.hardProfitNgn}
													oninput={() => queueMicrotask(previewPrices)}
												/></label
											>
										</div>
									</div></td
								></tr
							>{/if}
					{:else}<tr><td colspan="9" class="empty">No offers match these filters.</td></tr>{/each}
				</tbody>
			</table>
		</div>
		<details class="history">
			<summary>Change history</summary>{#each view.history as item}<p>
					{new Date(item.createdAt).toLocaleString('en-NG')} · {item.action.replaceAll('_', ' ')} · v{item.version}
				</p>{/each}
		</details>
	</fieldset>
</div>

{#if expandConfirm}<div class="overlay">
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="expand-title"
			tabindex="-1"
			class="confirm panel"
			use:adminDialog={() => (expandConfirm = false)}
		>
			<h2 id="expand-title">Expand catalogue?</h2>
			<p>
				Add missing services from the latest supplier catalogue. Existing offers stay untouched. New
				offers stay hidden until reviewed.
			</p>
			<div class="actions">
				<button onclick={() => (expandConfirm = false)}>Cancel</button><button
					class="primary"
					onclick={expandCatalog}>Expand catalogue</button
				>
			</div>
		</div>
	</div>{/if}
{#if supplier}<div class="overlay">
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="supplier-title"
			tabindex="-1"
			class="supplier-panel"
			use:adminDialog={closeSupplier}
		>
			<header>
				<h2 id="supplier-title">{supplier.title} · Supplier setup</h2>
				<button aria-label="Close supplier setup" onclick={closeSupplier}><X size={20} /></button>
			</header>
			<BoostingSupplierSetup
				data={setupData}
				categoryId={view.setup[supplier.id].categoryId}
				qualityTier={supplier.tier as 'value' | 'stable' | 'premium'}
				embedded
				onSaved={supplierSaved}
			/>
		</div>
	</div>{/if}

<style>
	.boosting-page {
		max-width: 1200px;
		margin: auto;
		padding: 24px;
		color: var(--text);
	}
	header,
	.actions,
	.heading,
	.catalog-toolbar,
	.filters,
	.filters > div,
	.price {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	header,
	.catalog-toolbar,
	.filters {
		justify-content: space-between;
		flex-wrap: wrap;
	}
	fieldset {
		border: 0;
		padding: 0;
		min-width: 0;
	}
	h1 {
		font-size: 24px;
		font-weight: 700;
	}
	h2,
	h3 {
		font-weight: 650;
	}
	p,
	small {
		color: var(--text-muted);
		font-size: 13px;
	}
	header p {
		margin-top: 3px;
	}
	button,
	select,
	input {
		border: 1px solid var(--border);
		background: var(--bg-elev-1);
		border-radius: 9px;
		color: var(--text);
		padding: 9px 12px;
		font-size: 13px;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.primary {
		background: var(--primary);
		color: var(--primary-foreground, #00150b);
		font-weight: 650;
	}
	.panel {
		margin: 20px 0;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		padding: 20px;
	}
	.panel > p {
		margin: 10px 0 18px;
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
		margin-top: 15px;
	}
	label {
		font-size: 12px;
		color: var(--text-muted);
	}
	label > input:not([type='checkbox']) {
		display: block;
		width: 100%;
		margin-top: 7px;
	}
	small {
		display: block;
		font-size: 11px;
		margin-top: 5px;
	}
	.floor {
		display: flex;
		align-items: center;
		gap: 20px;
		border: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
		background: color-mix(in srgb, var(--primary) 7%, transparent);
		padding: 15px;
		border-radius: 10px;
		margin-top: 16px;
	}
	.floor label {
		flex: 1;
		color: var(--primary);
	}
	.floor p {
		flex: 1;
		font-size: 12px;
	}
	details {
		margin-top: 16px;
		font-size: 12px;
	}
	summary {
		cursor: pointer;
		color: var(--text-muted);
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
	}
	.hint {
		font-size: 12px;
		margin: 12px 0;
	}
	.balances {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.balances > span {
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		padding: 13px;
		font-size: 12px;
		color: var(--text-muted);
	}
	strong {
		margin-left: 8px;
		color: var(--text);
	}
	.filters {
		margin: 20px 0 12px;
	}
	.filters p span,
	.warning-copy {
		color: #fbbf24;
	}
	.filters > div {
		flex-wrap: wrap;
		gap: 8px;
	}
	.table-scroll {
		max-width: 100%;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: 12px;
	}
	table {
		width: 100%;
		min-width: 980px;
		border-collapse: collapse;
		text-align: left;
		font-size: 13px;
	}
	th {
		font-size: 11px;
		text-transform: uppercase;
		color: var(--text-muted);
		padding: 15px;
		background: var(--bg-elev-1);
	}
	td {
		padding: 13px;
		border-top: 1px solid var(--border);
		background: var(--surface);
		vertical-align: middle;
	}
	.service,
	.source {
		border: 0;
		padding: 0;
		background: none;
		text-align: left;
		justify-content: flex-start;
	}
	.service {
		font-weight: 650;
	}
	.source {
		display: block;
		font-size: 12px;
	}
	.source small {
		font-size: 10px;
	}
	.price {
		gap: 5px;
	}
	.price input {
		width: 95px;
		text-align: center;
		font-weight: 600;
		padding: 7px;
	}
	.price button {
		padding: 7px;
	}
	.locked {
		color: #fbbf24;
		border-color: #fbbf24;
	}
	.profit {
		color: var(--primary);
		font-weight: 600;
	}
	.negative,
	.error {
		color: #f87171;
	}
	.badge {
		display: inline-block;
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		color: var(--primary);
		padding: 3px 6px;
		border-radius: 4px;
		font-size: 11px;
	}
	.badge.warning {
		color: #fbbf24;
		background: rgba(245, 158, 11, 0.1);
	}
	input[type='checkbox'] {
		accent-color: var(--primary);
		width: 15px;
		height: 15px;
	}
	.row-details {
		display: grid;
		grid-template-columns: 1fr 1.5fr;
		gap: 24px;
		padding: 8px;
	}
	.row-details p {
		margin: 6px 0;
	}
	.row-details .fields {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin: 0;
	}
	.empty {
		padding: 30px;
		text-align: center;
	}
	.history p {
		margin-top: 8px;
	}
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 80;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}
	.confirm {
		width: 480px;
		max-width: 100%;
	}
	.supplier-panel {
		width: 1050px;
		max-width: 100%;
		max-height: 92dvh;
		overflow: auto;
		background: var(--bg);
		padding: 24px;
		border: 1px solid var(--border);
		border-radius: 16px;
	}
	.supplier-panel > header {
		margin-bottom: 20px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}
	@media (max-width: 700px) {
		.boosting-page {
			padding: 16px;
		}
		.fields {
			grid-template-columns: 1fr;
		}
		.floor {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}
		.actions {
			flex-wrap: wrap;
			gap: 8px;
		}
		.heading h1 {
			font-size: 21px;
		}
		.filters > div {
			width: 100%;
		}
		.filters input {
			width: 100%;
		}
		.row-details {
			grid-template-columns: 1fr;
		}
		.row-details .fields {
			grid-template-columns: 1fr;
		}
		.overlay {
			padding: 10px;
		}
		.supplier-panel {
			padding: 14px;
		}
	}
</style>
