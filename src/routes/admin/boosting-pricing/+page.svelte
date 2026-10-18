<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { adminDialog } from '$lib/helpers/admin-dialog';
	import { Save, Download, RefreshCcw, Lock, Unlock, Zap, X } from '$lib/icons';
	import BoostingSupplierDetails from '$lib/components/admin/BoostingSupplierDetails.svelte';
	import BoostingSupplierBalances from '$lib/components/admin/BoostingSupplierBalances.svelte';
	import BoostingSupplierPicker from '$lib/components/admin/BoostingSupplierPicker.svelte';
	import type { BoostSupplierChoice } from '$lib/helpers/boosting-supplier-choice';
	import type { BoostSupplierDetails } from '$lib/helpers/boosting-supplier-details';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import {
		BOOSTING_PLATFORM_LABELS,
		BOOSTING_ACTION_TYPES
	} from '$lib/helpers/boosting-service-config';
	import {
		pricingEconomics,
		pricingDisplayAmount,
		pricingStoredAmount,
		BOOST_PRICING_DISPLAY_QUANTITY,
		pricingStart,
		pricingStepPrice,
		validatePricingSheet,
		exportPricingCsv,
		type BoostPricingRow,
		type BoostPricingSheet
	} from '$lib/helpers/boosting-pricing-sheet';
	import { boostingPricingChanges } from '$lib/helpers/boosting-pricing-changes';
	import {
		boostAutoPrice,
		boostPricingAdvisory,
		boostRowWarnings,
		boostReadinessSummary,
		boostControlSignature,
		boostEffectiveRules,
		mergeBoostCostRefresh,
		type BoostControlsView
	} from '$lib/helpers/boosting-pricing-controls';
	import type { PageData } from './$types';

	// Only the dev-only, loopback-guarded review page passes previewOnly. Its Save is in memory.
	let {
		data,
		previewOnly = false,
		previewSupplierDetails = {}
	}: {
		data: Pick<PageData, 'pricing'>;
		previewOnly?: boolean;
		previewSupplierDetails?: Record<string, BoostSupplierDetails>;
	} = $props();
	let view = $state<BoostControlsView>(
		untrack(() => structuredClone($state.snapshot(data.pricing)))
	);
	let saved = $state(untrack(() => JSON.stringify(data.pricing.sheet)));
	let platform = $state('all');
	let filter = $state('all');
	let search = $state('');
	let tableWidth = $state(980);
	let busy = $state(false);
	let operation = $state<'save' | 'refresh' | 'expand' | 'reload' | ''>('');
	let saveUncertain = $state(false);
	let reloadConfirm = $state(false);
	let discardConfirm = $state(false);
	let error = $state('');
	let quantityInputs = $state<Record<string, string>>({});
	let quantityErrors = $state<Record<string, string>>({});
	let expanded = $state<string | null>(null);
	let blockedLiveRow = $state<string | null>(null);
	let supplier = $state<BoostPricingRow | null>(null);
	let picker = $state<BoostPricingRow | null>(null);
	let supplierDrafts = $state<Record<string, BoostSupplierChoice>>({});
	let expandConfirm = $state(false);
	let saveDraft = $state<BoostPricingSheet | null>(null);
	const savedSheet = $derived(JSON.parse(saved) as BoostPricingSheet);
	const draftReview = $derived(boostingPricingChanges(savedSheet, view.sheet));
	const review = $derived(saveDraft ? boostingPricingChanges(savedSheet, saveDraft) : draftReview);
	const changedRows = $derived(new Set(review.offers.map((offer) => offer.id)));
	const savedSelections = $derived(
		new Map((JSON.parse(saved) as BoostPricingSheet).rows.map((row) => [row.id, row.selected]))
	);
	const dirty = $derived(draftReview.count > 0 || Object.keys(quantityErrors).length > 0);
	beforeNavigate(({ cancel }) => {
		if (dirty && !confirm('Leave this page? Unsaved changes will be lost.')) cancel();
	});
	const label = (p: string) => (BOOSTING_PLATFORM_LABELS as Record<string, string>)[p] ?? p;
	const amountFormat = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });
	const money = (v: number | null) =>
		v == null || !Number.isFinite(v) ? '—' : `₦${amountFormat.format(v)}`;
	const quote = (r: BoostPricingRow) => supplierDrafts[r.id] ?? view.quotes[r.id] ?? null;
	const sourceProvider = (r: BoostPricingRow) => supplierDrafts[r.id]?.provider ?? r.provider;
	const sourceCode = (r: BoostPricingRow) => supplierDrafts[r.id]?.serviceId ?? r.serviceId;
	const preloadApproval = (r: BoostPricingRow) =>
		!savedSelections.get(r.id) &&
		!view.setup[r.id]?.reviewed &&
		Boolean(view.setup[r.id]?.approvalServices?.length);
	const approvingSupplier = (r: BoostPricingRow) =>
		Boolean(r.supplierChoiceId || preloadApproval(r));
	function useSupplier(row: BoostPricingRow, choice: BoostSupplierChoice) {
		row.supplierChoiceId = choice.providerServiceId;
		row.supplierChoiceRevision = choice.revision;
		supplierDrafts[row.id] = choice;
		if (row.priceMode === 'target') {
			const price = boostAutoPrice(row, view.sheet, choice);
			if (price != null) row.sale = price;
		}
		picker = null;
		expanded = row.id;
		blockedLiveRow = null;
		error = '';
	}
	function chooseSupplier(row: BoostPricingRow) {
		if (busy || saveUncertain) return;
		supplier = null;
		picker = row;
	}
	function undoSupplier(row: BoostPricingRow) {
		delete row.supplierChoiceId;
		delete row.supplierChoiceRevision;
		delete supplierDrafts[row.id];
		if (row.priceMode === 'target') {
			const price = boostAutoPrice(row, view.sheet, quote(row));
			if (price != null) row.sale = price;
		}
	}
	function approvalNames(row: BoostPricingRow) {
		const draft = supplierDrafts[row.id];
		return draft
			? [
					`${draft.provider === 'smm_raja' ? 'SMM Raja' : 'BulkFollows'} #${draft.serviceId} · ${draft.name}`
				]
			: (view.setup[row.id]?.approvalServices ?? []).map(
					(s) =>
						`${s.provider === 'smm_raja' ? 'SMM Raja' : 'BulkFollows'} #${s.serviceId} · ${s.name}`
				);
	}
	const economics = (r: BoostPricingRow) => pricingEconomics(r, view.sheet, quote(r));
	const displayAmount = (r: BoostPricingRow, amount: number | null | undefined) =>
		pricingDisplayAmount(r, amount);
	function updateDisplayPrice(row: BoostPricingRow, input: HTMLInputElement) {
		row.sale = pricingStoredAmount(row, input.value === '' ? NaN : Number(input.value));
		row.priceMode = 'manual';
		recheckIncrement(row);
	}
	function updateDisplayOverride(
		row: BoostPricingRow,
		field: 'profitTargetNgn' | 'hardProfitNgn',
		input: HTMLInputElement
	) {
		row[field] = input.value === '' ? undefined : pricingStoredAmount(row, Number(input.value));
		previewPrices();
	}
	const savedQuantities = $derived(
		new Map((JSON.parse(saved) as BoostPricingSheet).rows.map((r) => [r.id, r.startingQuantity]))
	);
	const costLimit = (r: BoostPricingRow) => {
		if (approvingSupplier(r) && quote(r)?.rateUsd != null)
			return (
				Math.ceil(
					((quote(r)!.rateUsd! * view.sheet.settings.fx * r.startingQuantity) / 1000) * 100 - 1e-7
				) / 100
			);
		const limit = view.setup[r.id]?.maximumCostNgn;
		return limit == null
			? null
			: Math.floor(
					((limit * r.startingQuantity) / (savedQuantities.get(r.id) ?? r.startingQuantity)) * 100 +
						1e-7
				) / 100;
	};
	const warnings = (r: BoostPricingRow) => {
		const issues = [
			...rowQuantityErrors(r),
			...boostRowWarnings(r, view.sheet, quote(r)).filter(
				(reason) =>
					!(r.supplierChoiceId && view.setup[r.id]?.categoryId && reason === 'Set up this offer.')
			)
		];
		// Price/quantity-dependent checks are repeated with the actual draft on Save.
		issues.push(
			...(r.supplierChoiceId
				? (supplierDrafts[r.id]?.publicationIssues ?? [])
				: (view.availability?.[r.id]?.reasons ?? [])
			).filter(
				(reason) =>
					!/quantity|profit safety|spending limit/i.test(reason) &&
					!(approvingSupplier(r) && /mapping is not approved|No supplier is mapped/.test(reason))
			)
		);
		if (!BOOSTING_ACTION_TYPES.includes(r.outcome as never)) issues.push('Needs checkout support.');
		if (r.sourceOfferId && !view.setup[r.id]?.reviewed && !approvingSupplier(r))
			issues.push('Review supplier setup.');
		const q = quote(r);
		if (q && Date.now() - Date.parse(q.checkedAt) > (view.catalogMaxAgeMinutes ?? 390) * 60000)
			issues.push(
				r.supplierChoiceId
					? 'Reopen Choose supplier to review refreshed costs.'
					: 'Refresh supplier costs.'
			);
		if (
			q?.rateUsd != null &&
			view.setup[r.id] &&
			(q.rateUsd * view.sheet.settings.fx * r.startingQuantity) / 1000 > (costLimit(r) ?? 0) + 0.005
		)
			issues.push('Supplier cost exceeds reviewed limit.');
		return [...new Set(issues)];
	};
	const liveBlockers = (r: BoostPricingRow) =>
		warnings(r).filter(
			(warning) =>
				// A smaller draft minimum can change the required balance; the server rechecks it.
				!(approvingSupplier(r) && /mapping is not approved|Review supplier setup/.test(warning)) &&
				!(
					/balance is insufficient/i.test(warning) &&
					r.startingQuantity < (savedQuantities.get(r.id) ?? r.startingQuantity)
				) &&
				!boostPricingAdvisory(warning)
		);
	function toggleLive(row: BoostPricingRow, input: HTMLInputElement) {
		if (input.checked && !row.selected) {
			const blockers = liveBlockers(row);
			if (blockers.length) {
				input.checked = false;
				expanded = row.id;
				blockedLiveRow = row.id;
				error = '';
				return;
			}
		}
		row.selected = input.checked;
		blockedLiveRow = null;
		error = '';
	}
	function closeDetails(row: BoostPricingRow) {
		expanded = null;
		blockedLiveRow = null;
		document.getElementById(`boost-offer-${row.id}`)?.focus();
	}
	function updateQuantity(
		row: BoostPricingRow,
		field: 'startingQuantity' | 'increment' | 'maximumQuantity',
		input: HTMLInputElement
	) {
		const raw = input.value.trim();
		const key = `${row.id}:${field}`;
		quantityInputs[key] = input.value;
		if (field === 'maximumQuantity' && raw === '') {
			row.maximumQuantity = null;
			delete quantityErrors[key];
			return;
		}
		const value = Number(raw);
		try {
			const limit = field === 'maximumQuantity' ? 2147483647 : 100000000;
			if (!raw || !Number.isSafeInteger(value) || value < 1 || value > limit)
				throw new Error(`Use a positive whole quantity, up to ${limit.toLocaleString('en-NG')}.`);
			if (field === 'increment') {
				try {
					pricingStepPrice({ ...row, increment: value });
				} catch {
					throw new Error(
						'That increment cannot keep your exact price in whole kobo. Choose another increment or edit the price first.'
					);
				}
			}
			row[field] = value;
			delete quantityErrors[key];
			error = '';
		} catch (cause) {
			quantityErrors[key] = cause instanceof Error ? cause.message : 'Check this quantity.';
		}
	}
	function quantityValue(
		row: BoostPricingRow,
		field: 'startingQuantity' | 'increment' | 'maximumQuantity'
	) {
		return quantityInputs[`${row.id}:${field}`] ?? row[field] ?? '';
	}
	function rowQuantityErrors(row: BoostPricingRow) {
		return Object.entries(quantityErrors)
			.filter(([key]) => key.startsWith(`${row.id}:`))
			.map(([, message]) => message);
	}
	const platforms = $derived([...new Set(view.sheet.rows.map((r) => r.platform))]);
	const flagged = $derived(view.sheet.rows.filter((r) => liveBlockers(r).length > 0).length);
	const advisoryCount = $derived(
		view.sheet.rows.filter(
			(r) => liveBlockers(r).length === 0 && warnings(r).some(boostPricingAdvisory)
		).length
	);
	const live = $derived(view.sheet.rows.filter((r) => view.liveStatuses[r.id] === 'live').length);
	const visible = $derived(
		view.sheet.rows.filter(
			(r) =>
				(platform === 'all' || r.platform === platform) &&
				(filter !== 'live' || view.liveStatuses[r.id] === 'live') &&
				(filter !== 'ready' || (!r.selected && liveBlockers(r).length === 0)) &&
				(filter !== 'edited' || changedRows.has(r.id)) &&
				(filter !== 'review' || liveBlockers(r).length > 0) &&
				(filter !== 'advisory' ||
					(liveBlockers(r).length === 0 && warnings(r).some(boostPricingAdvisory))) &&
				`${r.title} ${r.option} ${sourceCode(r)} ${sourceProvider(r) === 'smm_raja' ? 'SMM Raja' : 'BulkFollows'}`
					.toLowerCase()
					.includes(search.trim().replace(/^#/, '').toLowerCase())
		)
	);
	onMount(() => {
		const before = (event: BeforeUnloadEvent) => {
			if (dirty) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', before);
		const shortcut = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
			event.preventDefault();
			if (!supplier && !picker && !saveDraft && !expandConfirm && !reloadConfirm && !discardConfirm)
				void save();
		};
		window.addEventListener('keydown', shortcut);
		return () => {
			window.removeEventListener('beforeunload', before);
			window.removeEventListener('keydown', shortcut);
		};
	});
	class PricingRequestError extends Error {
		status: number | undefined;
		constructor(message: string, status?: number) {
			super(message);
			this.status = status;
		}
	}
	function acceptSavedView(next: BoostControlsView) {
		if (
			!next?.sheet ||
			!Array.isArray(next.sheet.rows) ||
			!next.quotes ||
			!next.setup ||
			!next.liveStatuses
		)
			throw new Error('Saved settings could not be confirmed. Your draft is kept.');
		view = next;
		supplierDrafts = {};
		picker = null;
		saved = JSON.stringify(next.sheet);
		quantityInputs = {};
		quantityErrors = {};
		expanded = null;
		blockedLiveRow = null;
		supplier = null;
		error = '';
		saveUncertain = false;
	}
	function discardDraft() {
		if (busy || saveUncertain) return;
		view.sheet = JSON.parse(saved);
		supplierDrafts = {};
		quantityInputs = {};
		quantityErrors = {};
		expanded = null;
		error = '';
		blockedLiveRow = null;
		discardConfirm = false;
	}
	async function reloadSaved() {
		if (busy || previewOnly) return;
		busy = true;
		operation = 'reload';
		reloadConfirm = false;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15000);
		try {
			const response = await fetch('/api/admin/boosting-pricing', {
				cache: 'no-store',
				signal: controller.signal
			});
			const result = await response.json();
			if (!response.ok || !result.success)
				throw new Error('Saved settings could not load. Your draft is kept. Try again.');
			acceptSavedView(result.data);
			showSuccess('Saved settings loaded. Nothing was changed on the storefront.');
		} catch {
			error = 'Saved settings could not load. Your draft is kept. Try again.';
			showError(error);
		} finally {
			clearTimeout(timeout);
			busy = false;
			operation = '';
		}
	}
	function previewPrices() {
		for (const row of view.sheet.rows) {
			if (row.priceMode === 'target') {
				const price = boostAutoPrice(row, view.sheet, quote(row));
				if (price != null) row.sale = price;
			}
			recheckIncrement(row);
		}
	}
	function toggleLock(row: BoostPricingRow) {
		row.priceMode = row.priceMode === 'manual' ? 'target' : 'manual';
		if (row.priceMode === 'target') {
			const price = boostAutoPrice(row, view.sheet, quote(row));
			if (price != null) row.sale = price;
		}
		recheckIncrement(row);
	}
	function recheckIncrement(row: BoostPricingRow) {
		const key = `${row.id}:increment`;
		if (quantityInputs[key] === undefined) return;
		const value = Number(quantityInputs[key]);
		if (!Number.isSafeInteger(value) || value < 1 || value > 100000000) return;
		try {
			pricingStepPrice({ ...row, increment: value });
			row.increment = value;
			delete quantityErrors[key];
		} catch {
			quantityErrors[key] =
				'That increment cannot keep your exact price in whole kobo. Choose another increment or edit the price first.';
		}
	}
	async function request(payload: Record<string, unknown>) {
		if (previewOnly) {
			if (payload.action !== 'save' || payload.confirmSave !== true)
				throw new Error('Only the Save flow is available in this local UI preview.');
			const sheet = structuredClone(payload.sheet) as BoostPricingSheet;
			const quotes = structuredClone($state.snapshot(view.quotes));
			const setup = structuredClone($state.snapshot(view.setup));
			const availability = structuredClone($state.snapshot(view.availability ?? {}));
			for (const row of sheet.rows) {
				if (row.selected && quote(row)?.rateUsd != null) {
					setup[row.id].maximumCostNgn = Math.max(
						setup[row.id].maximumCostNgn,
						Math.ceil(
							((quote(row)!.rateUsd! * sheet.settings.fx * row.startingQuantity) / 1000) * 100 -
								1e-7
						) / 100
					);
					if (availability[row.id])
						availability[row.id].reasons = availability[row.id].reasons.filter(
							(reason) =>
								![
									'A customer-facing service claim has not been verified.',
									'Supplier cost exceeds the approved spending limit.'
								].includes(reason)
						);
				}
				if (supplierDrafts[row.id]) {
					const choice = supplierDrafts[row.id];
					quotes[row.id] = structuredClone($state.snapshot(choice));
					row.provider = choice.provider;
					row.serviceId = choice.serviceId;
					setup[row.id] = {
						...setup[row.id],
						routingPolicy: 'locked',
						reviewed: true,
						maximumCostNgn: costLimit(row) ?? 0
					};
					row.sourceOfferId ||= `demo-${row.id}`;
				}
				delete row.supplierChoiceId;
				delete row.supplierChoiceRevision;
				delete row.reviewRequested;
			}
			sheet.version++;
			return {
				success: true,
				data: {
					...$state.snapshot(view),
					quotes,
					availability,
					setup,
					sheet,
					liveStatuses: Object.fromEntries(
						sheet.rows.map((row) => [row.id, row.selected ? 'live' : 'hidden'])
					)
				}
			};
		}
		const response = await fetch('/api/admin/boosting-pricing', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const result = await response.json();
		if (!response.ok || !result.success)
			throw new PricingRequestError(
				result.error || 'Could not save settings.',
				response.ok ? 400 : response.status
			);
		return result;
	}
	async function save(confirmed = false) {
		if (busy || !dirty || saveUncertain) return;
		if (Object.keys(quantityErrors).length) {
			const row = view.sheet.rows.find((r) => rowQuantityErrors(r).length)!;
			error = `${row.title}: fix the highlighted quantity fields before saving. Your other edits are kept.`;
			expanded = row.id;
			platform = 'all';
			filter = 'all';
			search = '';
			showError(error);
			return;
		}
		try {
			validatePricingSheet($state.snapshot(view.sheet));
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Check the highlighted settings.';
			showError(error);
			return;
		}
		if (!confirmed) {
			const baseline = JSON.parse(saved) as BoostPricingSheet;
			const blocked = view.sheet.rows.find((r) => {
				const original = baseline.rows.find((old) => old.id === r.id)!;
				return (
					r.selected &&
					(boostControlSignature(r) !== boostControlSignature(original) ||
						boostEffectiveRules(r, view.sheet) !== boostEffectiveRules(original, baseline)) &&
					liveBlockers(r).length > 0
				);
			});
			if (blocked) {
				error = `${blocked.title}: ${liveBlockers(blocked)[0]} Your edits are kept.`;
				expanded = blocked.id;
				platform = 'all';
				filter = 'all';
				search = '';
				showError(error);
				return;
			}
			saveDraft = structuredClone($state.snapshot(view.sheet));
			return;
		}
		if (!saveDraft) return;
		const submitted = structuredClone($state.snapshot(saveDraft));
		saveDraft = null;
		busy = true;
		operation = 'save';
		error = '';
		blockedLiveRow = null;
		try {
			const result = await request({
				action: 'save',
				sheet: submitted,
				confirmSave: true
			});
			acceptSavedView(result.data);
			showSuccess(
				previewOnly
					? 'Preview updated only. Nothing was published or saved to a database.'
					: 'Changes saved. Your Live selections are applied.'
			);
		} catch (cause) {
			saveUncertain = !(
				cause instanceof PricingRequestError &&
				cause.status != null &&
				cause.status < 500
			);
			error = cause instanceof Error ? cause.message : 'Save failed.';
			showError(error);
		} finally {
			busy = false;
			operation = '';
		}
	}
	async function refreshCosts() {
		if (busy) return;
		busy = true;
		operation = 'refresh';
		error = '';
		try {
			const response = await fetch('/api/admin/boosting-suppliers/sync', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ refreshPrices: false })
			});
			const result = await response.json();
			if (!response.ok || !result.success)
				throw new Error(result.error || 'Costs could not refresh.');
			const freshResponse = await fetch('/api/admin/boosting-pricing');
			const freshResult = await freshResponse.json();
			if (!freshResponse.ok || !freshResult.success)
				throw new Error(freshResult.error || 'Could not reload costs.');
			const fresh = freshResult.data as BoostControlsView;
			view = mergeBoostCostRefresh(JSON.parse(saved), $state.snapshot(view.sheet), fresh);
			saved = JSON.stringify(fresh.sheet);
			saveUncertain = false;
			previewPrices();
			showSuccess('Costs refreshed. Your edits are kept. Save when ready.');
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Refresh failed.';
			showError(error);
		} finally {
			busy = false;
			operation = '';
		}
	}
	async function expandCatalog() {
		if (busy || dirty || saveUncertain) return;
		busy = true;
		operation = 'expand';
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
			operation = '';
		}
	}
	function openSupplier(row: BoostPricingRow) {
		supplier = row;
	}
	function closeSupplier() {
		supplier = null;
	}
	function download() {
		const draftSheet = structuredClone($state.snapshot(view.sheet));
		const draftQuotes = { ...$state.snapshot(view.quotes) };
		for (const row of draftSheet.rows) {
			const choice = supplierDrafts[row.id];
			if (choice) {
				row.provider = choice.provider;
				row.serviceId = choice.serviceId;
				draftQuotes[row.id] = $state.snapshot(choice);
			}
		}
		const url = URL.createObjectURL(
			new Blob([exportPricingCsv(draftSheet, draftQuotes)], { type: 'text/csv;charset=utf-8' })
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
	{#if previewOnly}<aside class="preview-notice" aria-label="Local preview notice">
			<b>Local UI preview · Sample data</b>
			<p>
				Try prices, locks, Live ticks and Save. This changes only this preview; reload resets it. No
				database, supplier or customer actions. Click a supplier to inspect its sample details
				without saving.
			</p>
		</aside>{/if}
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
			<button
				disabled={previewOnly || busy}
				onclick={() => (dirty || saveUncertain ? (reloadConfirm = true) : void reloadSaved())}
				><RefreshCcw size={16} /> Reload saved</button
			>
			<button
				disabled={previewOnly || busy || dirty || saveUncertain}
				title={dirty
					? 'Save or discard your draft before expanding the catalogue.'
					: 'Add missing offers as hidden drafts.'}
				onclick={() => (expandConfirm = true)}>+ Expand catalogue</button
			>
			<button class="primary" disabled={busy || !dirty || saveUncertain} onclick={() => save()}
				><Save size={16} /> {operation === 'save' ? 'Saving…' : 'Save'}</button
			>
		</div>
	</header>
	<div class="draft-status" role="status">
		<span
			>{operation
				? (
						{
							save: 'Saving reviewed changes…',
							refresh: 'Refreshing supplier costs…',
							expand: 'Expanding catalogue…',
							reload: 'Loading saved settings…'
						} as Record<string, string>
					)[operation]
				: dirty
					? `${review.offers.length} ${review.offers.length === 1 ? 'offer' : 'offers'} edited · ${review.rules.length} ${review.rules.length === 1 ? 'rule' : 'rules'} changed${Object.keys(quantityErrors).length ? ' · Check quantities' : ''}`
					: `Showing saved version ${view.sheet.version}`}</span
		>
		{#if dirty}<button disabled={busy || saveUncertain} onclick={() => (discardConfirm = true)}
				>Discard draft</button
			>{/if}
	</div>
	{#if saveUncertain}<div class="save-warning" role="alert">
			<p>
				{error ? `${error} ` : ''}
				We couldn’t confirm whether Save finished. Your draft is kept. Export it if needed, then reload
				saved settings before saving again.
			</p>
			<button disabled={busy} onclick={() => (reloadConfirm = true)}>Check saved settings</button>
		</div>{/if}
	<fieldset disabled={busy}>
		{#if error && !saveUncertain}<p class="error" role="alert">{error}</p>{/if}
		{#if view.archivedDraft}<p class="hint">
				Showing current offer settings. Earlier sheet revisions remain in history.
			</p>{/if}
		<p class="hint">
			Edit prices, set locks and tick Live. Nothing changes until you Save and confirm the full
			review.
		</p>
		<section class="panel">
			<h2>Pricing rules</h2>
			<p>
				Compare supplier cost, selling price and estimated profit per 1,000. Existing pricing rules,
				customer minimums and increments stay unchanged.
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
					/><small
						>0 means percentage-only pricing. Saved rule quantities are unchanged; each offer's
						Advanced pricing shows its equivalent per 1,000.</small
					></label
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
				<p>
					Used by automatic pricing. Your confirmed manual price may be lower, but must still cover
					supplier cost and fees. Separate from the ₦500 checkout minimum.
				</p>
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
				Unlocked prices follow your rules; locked prices stay put. Review every change before
				saving.
			</p>
		</section>
		<div class="catalog-toolbar">
			<BoostingSupplierBalances {previewOnly} />
			<button disabled={previewOnly || busy} onclick={refreshCosts}
				><RefreshCcw size={15} /> Refresh costs</button
			>
		</div>
		<div class="filters">
			<p>
				{live} offers live · <span>{flagged} blocked</span> ·
				<span>{advisoryCount} with advisories</span>
			</p>
			<div>
				<label class="sr-only" for="platform">Platform</label><select
					id="platform"
					bind:value={platform}
					><option value="all">All platforms</option>{#each platforms as p}<option value={p}
							>{label(p)}</option
						>{/each}</select
				>
				<label class="sr-only" for="status">Status</label><select id="status" bind:value={filter}
					><option value="all">All offers</option><option value="live">Live now</option><option
						value="ready">Ready to publish</option
					><option value="edited">Unsaved edits</option><option value="review"
						>Blocked offers</option
					><option value="advisory">Advisories only</option></select
				>
				<input aria-label="Search offers" placeholder="Search offers" bind:value={search} />
				{#if platform !== 'all' || filter !== 'all' || search}<button
						onclick={() => {
							platform = 'all';
							filter = 'all';
							search = '';
						}}>Clear filters</button
					>{/if}
			</div>
			<p class="hint">
				Showing {visible.length} of {view.sheet.rows.length} offers. Live ticks are drafts until Save.
				Prices, costs and estimated profit are all per 1,000.
			</p>
		</div>
		<div
			class="table-scroll"
			bind:clientWidth={tableWidth}
			style={`--boost-table-width: ${tableWidth}px;`}
		>
			<table>
				<thead
					><tr
						><th>Service</th><th>Option</th><th>Price per</th><th>Source</th><th>Cost ₦</th><th
							>Price ₦</th
						><th
							title="Estimated from supplier quotes and the fee settings above; not recorded order profit."
							>Est. profit ₦</th
						><th>Status</th><th>Live</th></tr
					></thead
				><tbody>
					{#each visible as row (row.id)}
						<tr
							><td
								><button
									class="service"
									id={`boost-offer-${row.id}`}
									aria-expanded={expanded === row.id}
									aria-controls={`boost-details-${row.id}`}
									onclick={() => {
										if (expanded === row.id) closeDetails(row);
										else {
											expanded = row.id;
											blockedLiveRow = null;
										}
									}}>{row.title}</button
								>{#if changedRows.has(row.id)}<small class="draft-marker">Unsaved</small>{/if}</td
							>
							<td
								>{view.sheet.rows.filter(
									(r) => r.platform === row.platform && r.outcome === row.outcome
								).length > 1
									? (row.option.trim().toLowerCase() !== row.title.trim().toLowerCase()
											? row.option
											: '') ||
										(
											{ value: 'Affordable', stable: 'More stable', premium: 'Premium' } as Record<
												string,
												string
											>
										)[row.tier] ||
										row.tier
									: '—'}</td
							>
							<td>{BOOST_PRICING_DISPLAY_QUANTITY.toLocaleString()}</td><td
								><button
									class="source"
									onclick={() => chooseSupplier(row)}
									title={row.supplierChoiceId
										? 'Draft exact supplier choice. Click to change it.'
										: view.setup[row.id]?.routingPolicy === 'automatic'
											? 'Pricing cost reference: the highest configured cost, not a fixed primary supplier. Click to choose a specific service.'
											: 'Choose or change the supplier service.'}
									>{quote(row)
										? sourceProvider(row) === 'smm_raja'
											? 'SMM Raja'
											: 'BulkFollows'
										: 'Choose supplier'}<small
										>{sourceCode(row) ? `#${sourceCode(row)}` : ''}{!row.supplierChoiceId &&
										view.setup[row.id]?.routingPolicy === 'automatic'
											? ' · Cost reference'
											: ''}</small
									></button
								></td
							>
							<td>{money(displayAmount(row, economics(row).cost))}</td><td
								><div class="price">
									<input
										aria-label={`Price for ${row.title} ${row.tier}`}
										type="number"
										min="0"
										step="0.01"
										value={displayAmount(row, row.sale)}
										oninput={(event) => updateDisplayPrice(row, event.currentTarget)}
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
								>{money(displayAmount(row, economics(row).profit))}</td
							>
							<td
								><span
									class="badge"
									class:warning={warnings(row).length > 0}
									title={warnings(row).join(' ')}
									>{boostReadinessSummary(
										liveBlockers(row),
										warnings(row),
										view.liveStatuses[row.id] === 'live'
									)}</span
								></td
							>
							<td
								><input
									aria-label={`Live ${row.title} ${row.tier}`}
									type="checkbox"
									checked={row.selected}
									onchange={(event) => toggleLive(row, event.currentTarget)}
									disabled={busy}
									title={!row.selected && liveBlockers(row).length
										? 'Click to see what needs fixing.'
										: 'Apply with Save.'}
								/>{#if row.selected !== savedSelections.get(row.id)}<small class="draft-marker"
										>{row.selected ? 'On after Save' : 'Off after Save'}</small
									>{/if}</td
							>
						</tr>
						{#if expanded === row.id}<tr class="expanded"
								><td colspan="9" id={`boost-details-${row.id}`}
									><div class="row-details">
										<div>
											<h3>{row.title}</h3>
											<p>{quote(row)?.name ?? 'No supplier chosen'}</p>
											<div role={blockedLiveRow === row.id ? 'alert' : undefined}>
												{#if blockedLiveRow === row.id}<p class="warning-copy">
														Not live yet. Review the items below.
													</p>{/if}
												{#each warnings(row) as warning}<p class="warning-copy">{warning}</p>{/each}
												{#if warnings(row).some(boostPricingAdvisory)}
													<p class="hint">
														These preferences do not block your confirmed manual Save. Unverified
														quality labels are not customer guarantees.
													</p>
													<button
														disabled={busy || saveUncertain || row.reviewRequested}
														onclick={() => {
															row.reviewRequested = true;
															row.priceMode = 'manual';
														}}
														>{row.reviewRequested
															? 'Queued for final Save'
															: 'Review current price and cost'}</button
													>
												{/if}
											</div>
											<p>
												Customers start at {pricingStart(
													row,
													quote(row)?.max ?? null
												).toLocaleString()} · +/− {row.increment.toLocaleString()}
											</p>
											<p>
												Reviewed supplier limit: {money(
													costLimit(row) == null
														? null
														: (costLimit(row)! * 1000) / row.startingQuantity
												)} per 1,000.
											</p>
											<button disabled={busy} onclick={() => openSupplier(row)}
												>Supplier details</button
											>
											<button onclick={() => chooseSupplier(row)} disabled={busy || saveUncertain}
												>{quote(row) ? 'Change supplier' : 'Choose supplier'}</button
											>
											{#if row.supplierChoiceId}<p class="hint">
													Supplier choice is a draft. Final Save approves and keeps this exact
													service for new orders.
												</p>
												<button onclick={() => undoSupplier(row)} disabled={busy}
													>Undo supplier change</button
												>
											{:else if preloadApproval(row)}<p class="hint">
													Final Save will approve the displayed supplier setup when you tick Live.
												</p>{/if}
										</div>
										<div class="offer-controls">
											<section
												class="offer-settings"
												aria-label={`Offer settings for ${row.title} ${row.tier}`}
											>
												<h3>Offer settings</h3>
												<p>
													Draft only. Save reviews these changes with your prices and Live ticks.
												</p>
												<div class="offer-fields">
													<label
														>Customer minimum<input
															aria-label={`Customer minimum for ${row.title} ${row.tier}`}
															aria-invalid={Boolean(quantityErrors[`${row.id}:startingQuantity`])}
															type="number"
															min="1"
															step="1"
															value={quantityValue(row, 'startingQuantity')}
															oninput={(event) =>
																updateQuantity(row, 'startingQuantity', event.currentTarget)}
														/></label
													>
													<label
														>Quantity +/− increment<input
															aria-label={`Quantity increment for ${row.title} ${row.tier}`}
															aria-invalid={Boolean(quantityErrors[`${row.id}:increment`])}
															type="number"
															min="1"
															step="1"
															value={quantityValue(row, 'increment')}
															oninput={(event) =>
																updateQuantity(row, 'increment', event.currentTarget)}
														/></label
													>
													<label
														>Customer maximum (optional)<input
															aria-label={`Customer maximum for ${row.title} ${row.tier}`}
															aria-invalid={Boolean(quantityErrors[`${row.id}:maximumQuantity`])}
															type="number"
															min="1"
															step="1"
															placeholder="Use supplier limit"
															value={quantityValue(row, 'maximumQuantity')}
															oninput={(event) =>
																updateQuantity(row, 'maximumQuantity', event.currentTarget)}
														/></label
													>
													<label
														>Customer option name<input
															aria-label={`Customer option name for ${row.title} ${row.tier}`}
															maxlength="80"
															placeholder="Use service name"
															bind:value={row.option}
														/></label
													>
													<label class="wide"
														>Customer description<input
															aria-label={`Customer description for ${row.title} ${row.tier}`}
															maxlength="120"
															bind:value={row.shortPromise}
														/></label
													>
												</div>
												{#each rowQuantityErrors(row) as message}<p role="alert" class="error">
														{message}
													</p>{/each}
												<p>
													Prices and costs are per 1,000. Changing the increment keeps the same
													per-item price.
												</p>
												<p>
													Cheap offers may start higher to meet the ₦500 checkout minimum. Supplier
													limits still apply.
												</p>
											</section>
											<details>
												<summary>Advanced pricing</summary>
												<p class="hint">
													Amounts below are per 1,000. Inherited profit target: {money(
														displayAmount(row, view.sheet.settings.profitTargetNgn ?? 0)
													)}; minimum retained profit: {money(
														displayAmount(row, view.sheet.settings.hardProfitNgn ?? 0)
													)}. Existing rule calculations are preserved.
												</p>
												<div class="fields">
													<label class="check"
														><input
															type="checkbox"
															checked={row.useDefaultMarkup ?? false}
															onchange={(event) => {
																row.useDefaultMarkup = event.currentTarget.checked;
																queueMicrotask(previewPrices);
															}}
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
														>Profit target override per 1,000 (₦)<input
															type="number"
															min="0"
															placeholder="Global"
															value={displayAmount(row, row.profitTargetNgn)}
															oninput={(event) =>
																updateDisplayOverride(row, 'profitTargetNgn', event.currentTarget)}
														/></label
													>
													<label
														>Minimum retained profit override per 1,000 (₦)<input
															type="number"
															min="0"
															placeholder="Global"
															value={displayAmount(row, row.hardProfitNgn)}
															oninput={(event) =>
																updateDisplayOverride(row, 'hardProfitNgn', event.currentTarget)}
														/></label
													>
												</div>
											</details>
										</div>
									</div>
									<div class="row-actions">
										<p>
											{dirty
												? 'Save reviews all pending changes. Closing keeps your edits.'
												: 'No changes to save.'}
										</p>
										<div class="actions">
											<button disabled={busy} onclick={() => closeDetails(row)}>Close</button>
											<button
												class="primary"
												disabled={busy || !dirty || saveUncertain}
												onclick={() => save()}
												><Save size={16} />
												{operation === 'save' ? 'Saving…' : 'Save all changes'}</button
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
	{#if dirty && !expanded && !supplier}
		<div class="save-bar">
			<p>Unsaved changes</p>
			<button class="primary" disabled={busy || !dirty || saveUncertain} onclick={() => save()}
				><Save size={16} /> {operation === 'save' ? 'Saving…' : 'Save all changes'}</button
			>
		</div>
	{/if}
</div>

{#if reloadConfirm || discardConfirm}<div class="overlay">
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="draft-action-title"
			tabindex="-1"
			class="confirm panel"
			use:adminDialog={() => {
				reloadConfirm = false;
				discardConfirm = false;
			}}
		>
			<h2 id="draft-action-title">
				{reloadConfirm ? 'Reload saved settings?' : 'Discard unsaved changes?'}
			</h2>
			<p>
				{reloadConfirm
					? 'This replaces this tab’s draft with the latest saved settings. Export your draft first if you want a copy. It does not save changes or publish anything.'
					: 'This removes only this tab’s unsaved edits. Your saved prices and storefront stay unchanged.'}
			</p>
			<div class="actions">
				<button
					onclick={() => {
						reloadConfirm = false;
						discardConfirm = false;
					}}>Keep editing</button
				>
				<button
					class="primary"
					onclick={() => (reloadConfirm ? void reloadSaved() : discardDraft())}
					>{reloadConfirm ? 'Reload saved settings' : 'Discard draft'}</button
				>
			</div>
		</div>
	</div>{/if}
{#if saveDraft}<div class="overlay">
		<div
			class="confirm panel"
			role="dialog"
			aria-modal="true"
			aria-labelledby="save-title"
			tabindex="-1"
			use:adminDialog={() => (saveDraft = null)}
		>
			<h2 id="save-title">Save these changes?</h2>
			<p>
				{previewOnly
					? 'Preview only. Confirm updates this sample page; nothing is published or saved to a database.'
					: 'Nothing has changed yet. Confirm to save supplier choices, prices, locks, rules and Live selections together.'}
			</p>
			<p class="review-summary">
				{review.offers.length}
				{review.offers.length === 1 ? 'offer' : 'offers'} changed · {review.goingLive} going live · {review.goingOffline}
				going offline
			</p>
			<p class="hint">
				For the selected Live offers below, confirming accepts your manual prices even below profit
				preferences and reviews the displayed supplier costs. Availability, compatibility,
				positive-profit and refill checks still apply. Custom quantity grids may include a one-kobo
				rounding allowance at the minimum.
			</p>
			<div class="change-review">
				{#if review.rules.length}<section aria-label="Pricing rule changes">
						<h3>Pricing rules</h3>
						<ul>
							{#each review.rules as change}<li>
									<span>{change.label}</span><span>{change.before} → <b>{change.after}</b></span>
								</li>{/each}
						</ul>
					</section>{/if}
				{#each review.offers as offer (offer.id)}{@const row = saveDraft.rows.find(
						(r) => r.id === offer.id
					)!}
					<section
						aria-label={`Changes for ${offer.title}${offer.option ? ` ${offer.option}` : ''}`}
					>
						<h3>{offer.title}{offer.option ? ` · ${offer.option}` : ''}</h3>
						{#if offer.goingLive}<p class="review-live">
								Will become available to customers.
							</p>{:else if offer.goingOffline}<p class="warning-copy">
								Will be taken offline.
							</p>{/if}
						<ul>
							{#each offer.changes as change}<li>
									<span>{change.label}</span><span>{change.before} → <b>{change.after}</b></span>
								</li>{/each}
						</ul>
						{#if row.selected}
							<p class="hint">
								Supplier cost reviewed with this Save: {money(
									displayAmount(row, economics(row).cost)
								)} per 1,000.
							</p>
							{#if warnings(row).includes('A customer-facing service claim has not been verified.')}
								<p class="warning-copy">
									Unverified quality requirements will be removed for future purchases, not marked
									as verified. Existing orders and refill promises are unchanged; customers will see
									neutral quality wording.
								</p>
							{/if}
						{/if}
						{#if row.supplierChoiceId || (offer.goingLive && preloadApproval(row))}
							<div class="supplier-review">
								<h4>Supplier approval</h4>
								{#each approvalNames(row) as name}<p>{name}</p>{/each}
								<p>
									Reviewed supplier cost: {money(displayAmount(row, economics(row).cost))} per 1,000.
								</p>
								<p>
									{row.supplierChoiceId
										? 'This exact service will stay selected until you change it.'
										: 'This approves the saved setup shown above; it does not select different services.'}
									{row.selected
										? 'Your Live tick will make this offer available.'
										: 'This offer will stay offline.'}
								</p>
								<p>
									Supplier approval is permission to fulfil orders—not a new quality or refill
									guarantee.
								</p>
							</div>
						{/if}
					</section>{/each}
			</div>
			<div class="actions">
				<button onclick={() => (saveDraft = null)}>Keep editing</button><button
					class="primary"
					disabled={busy}
					onclick={() => save(true)}>Confirm & save</button
				>
			</div>
		</div>
	</div>{/if}
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
				<h2 id="supplier-title">{supplier.title} · Supplier details</h2>
				<button aria-label="Close supplier details" onclick={closeSupplier}><X size={20} /></button>
			</header>
			{#key supplier.id}<BoostingSupplierDetails
					offerId={supplier.sourceOfferId}
					quantity={BOOST_PRICING_DISPLAY_QUANTITY}
					fx={view.sheet.settings.fx}
					rowProvider={supplier.provider}
					rowServiceId={supplier.serviceId}
					costReferenceOnly={view.setup[supplier.id]?.routingPolicy === 'automatic' ||
						view.setup[supplier.id]?.routingPolicy === 'preferred'}
					{previewOnly}
					initialData={previewSupplierDetails[supplier.id] ?? null}
				/>{/key}
			<div class="supplier-footer">
				<button onclick={closeSupplier}>Close details</button><button
					class="primary"
					disabled={busy || saveUncertain}
					onclick={() => chooseSupplier(supplier!)}>Choose / change supplier</button
				>
			</div>
		</div>
	</div>{/if}
{#if picker}<div class="overlay">
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="picker-title"
			tabindex="-1"
			class="supplier-panel"
			use:adminDialog={() => (picker = null)}
		>
			<header>
				<div>
					<h2 id="picker-title">{picker.title} · Choose supplier</h2>
					<p class="hint">
						Your price: {money(displayAmount(picker, picker.sale))} per 1,000
					</p>
				</div>
				<button aria-label="Close supplier picker" onclick={() => (picker = null)}
					><X size={20} /></button
				>
			</header>
			{#key picker.id}<BoostingSupplierPicker
					rowId={picker.id}
					offerId={picker.sourceOfferId}
					quantity={BOOST_PRICING_DISPLAY_QUANTITY}
					fx={view.sheet.settings.fx}
					currentId={picker.supplierChoiceId ?? quote(picker)?.providerServiceId}
					onChoose={(choice) => useSupplier(picker!, choice)}
					previewChoices={previewOnly
						? [
								{
									providerServiceId: '11111111-1111-4111-8111-111111111111',
									provider: 'smm_raja',
									serviceId: 'DEMO-101',
									name: `Sample ${picker.title} service`,
									rateUsd: 0.2,
									min: 10,
									max: 100000,
									checkedAt: new Date().toISOString(),
									issues: [],
									publicationIssues: [],
									revision: 'a'.repeat(64),
									refillAdvertised: false,
									refillDaysClaimed: null
								},
								{
									providerServiceId: '22222222-2222-4222-8222-222222222222',
									provider: 'bulk_follows',
									serviceId: 'DEMO-202',
									name: `Alternative sample ${picker.title} service`,
									rateUsd: 0.25,
									min: 100,
									max: 50000,
									checkedAt: new Date().toISOString(),
									issues: [],
									publicationIssues: [],
									revision: 'b'.repeat(64),
									refillAdvertised: true,
									refillDaysClaimed: 30
								}
							]
						: undefined}
				/>{/key}
			<div class="supplier-footer">
				<span class="hint">No changes are saved here.</span><button onclick={() => (picker = null)}
					>Close</button
				>
			</div>
		</div>
	</div>{/if}

<style>
	.supplier-review {
		margin-top: 16px;
		border: 1px solid var(--primary);
		border-radius: 10px;
		padding: 12px;
		background: color-mix(in srgb, var(--primary) 5%, transparent);
	}
	.supplier-review h4 {
		margin: 0 0 10px;
		font-size: 13px;
	}
	.supplier-review p {
		font-size: 12px;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.boosting-page {
		max-width: 1200px;
		margin: auto;
		padding: 24px;
		color: var(--text);
	}
	.draft-status,
	.save-warning {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin: 12px 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.save-warning {
		padding: 12px;
		border: 1px solid #b68a20;
		border-radius: 10px;
	}
	.save-warning p {
		margin: 0;
		flex: 1 1 240px;
	}
	.draft-marker {
		display: block;
		color: var(--primary);
		font-size: 11px;
		margin-top: 5px;
	}
	.preview-notice {
		padding: 14px 16px;
		margin-bottom: 22px;
		border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
		border-radius: 10px;
		background: color-mix(in srgb, var(--primary) 6%, transparent);
		font-size: 13px;
	}
	.preview-notice p {
		margin-top: 5px;
		line-height: 1.6;
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
	.offer-controls {
		min-width: 0;
	}
	.offer-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
		margin: 16px 0;
	}
	.offer-fields .wide {
		grid-column: 1 / -1;
	}
	.offer-fields input {
		display: block;
		width: 100%;
		margin-top: 7px;
	}
	.row-actions,
	.save-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		padding: 12px 8px;
		border-top: 1px solid var(--border);
	}
	.row-actions {
		position: sticky;
		left: 0;
		width: min(100%, calc(var(--boost-table-width) - 28px));
		margin-top: 12px;
	}
	.save-bar {
		position: sticky;
		bottom: 12px;
		z-index: 5;
		padding: 12px 16px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
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
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}
	.confirm {
		width: 600px;
		max-width: 100%;
		max-height: 90dvh;
		background: var(--bg-elev-1);
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.change-review {
		overflow: auto;
		min-height: 0;
		margin-bottom: 20px;
	}
	.change-review section {
		border-top: 1px solid var(--border);
		padding: 14px 0;
	}
	.change-review h3 {
		font-size: 13px;
	}
	.change-review ul {
		list-style: none;
		padding: 0;
		margin: 10px 0 0;
	}
	.change-review li {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 5px 14px;
		margin-top: 8px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.change-review b {
		color: var(--text);
		font-weight: 600;
	}
	.change-review .review-live {
		color: var(--primary);
	}
	.confirm > .actions {
		justify-content: flex-end;
		flex-shrink: 0;
	}
	.confirm > .review-summary {
		margin: 0 0 16px;
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
	.supplier-footer {
		position: sticky;
		bottom: -24px;
		margin: 20px -24px -24px;
		padding: 14px 24px;
		background: var(--bg);
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
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
			position: sticky;
			left: 0;
			width: min(100%, calc(var(--boost-table-width) - 28px));
		}
		.row-details .fields {
			grid-template-columns: 1fr;
		}
		.offer-fields {
			grid-template-columns: 1fr;
		}
		.overlay {
			padding: 10px;
		}
		.supplier-panel {
			padding: 14px;
		}
		.supplier-footer {
			bottom: -14px;
			margin: 16px -14px -14px;
			padding: 12px 14px;
		}
	}
</style>
