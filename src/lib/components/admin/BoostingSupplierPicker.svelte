<script lang="ts">
	import { untrack } from 'svelte';
	import { Search, RefreshCcw, Check, AlertTriangle } from '$lib/icons';
	import { boostPricingAdvisory } from '$lib/helpers/boosting-pricing-controls';
	import type {
		BoostSupplierChoice,
		BoostSupplierChoices
	} from '$lib/helpers/boosting-supplier-choice';
	let {
		rowId,
		offerId,
		quantity,
		fx,
		currentId,
		onChoose,
		previewChoices
	}: {
		rowId: string;
		offerId?: string | null;
		quantity: number;
		fx: number;
		currentId?: string;
		onChoose: (choice: BoostSupplierChoice) => void;
		previewChoices?: BoostSupplierChoice[];
	} = $props();
	let provider = $state('all');
	let search = $state('');
	let retry = $state(0);
	let pending = $state(true);
	let error = $state('');
	let result = $state<BoostSupplierChoices>({ services: [], hasMore: false });
	const format = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });
	const money = (value: number | null) => (value == null ? 'Unknown' : `₦${format.format(value)}`);
	$effect(() => {
		const params = new URLSearchParams({ row: rowId, provider, search: search.trim() });
		if (offerId) params.set('offerId', offerId);
		retry;
		const sample = previewChoices;
		const controller = new AbortController();
		let active = true;
		pending = true;
		error = '';
		const timeout = setTimeout(() => controller.abort(), 15000);
		const debounce = setTimeout(async () => {
			try {
				let data: BoostSupplierChoices;
				if (sample) {
					data = {
						services: sample.filter(
							(s) =>
								(provider === 'all' || s.provider === provider) &&
								`${s.name} ${s.serviceId}`
									.toLowerCase()
									.includes(search.trim().replace(/^#/, '').toLowerCase())
						),
						hasMore: false
					};
				} else {
					const response = await fetch(`/api/admin/boosting-pricing/supplier-choices?${params}`, {
						cache: 'no-store',
						signal: controller.signal
					});
					const body = await response.json();
					if (!response.ok || !body.success || !Array.isArray(body.data?.services))
						throw new Error(body.error || 'Supplier choices could not load. Try again.');
					data = body.data;
				}
				if (active) result = data;
			} catch {
				if (active) error = 'Supplier choices could not load. Your draft is kept. Try again.';
			} finally {
				clearTimeout(timeout);
				if (active) pending = false;
			}
		}, 250);
		return () => {
			active = false;
			clearTimeout(debounce);
			clearTimeout(timeout);
			controller.abort();
		};
	});
</script>

<div class="picker">
	<p class="intro">
		Choose the exact service you want. This changes your draft only—your price, lock and quantity
		settings stay in place.
	</p>
	<div class="search-tools">
		<label
			>Provider<select aria-label="Supplier provider" bind:value={provider}
				><option value="all">Both providers</option><option value="smm_raja">SMM Raja</option
				><option value="bulk_follows">BulkFollows</option></select
			></label
		>
		<label class="search"
			>Service name or code<span
				><Search size={16} /><input
					aria-label="Search supplier services"
					placeholder="Search a name, or select a provider and paste its code"
					bind:value={search}
				/></span
			></label
		>
		<button
			class="refresh"
			aria-label="Reload supplier choices"
			onclick={() => retry++}
			disabled={pending}><RefreshCcw size={17} /></button
		>
	</div>
	<p class="hint">
		Stored catalogue only. No purchases or settings changes. Refill labels are supplier
		advertisements, not delivery guarantees.
	</p>
	<div class="results" aria-busy={pending} aria-label="Supplier choices">
		{#if pending}<div class="state" role="status">
				<span class="spinner"></span>Loading supplier choices…
			</div>
		{:else if error}<div class="state" role="alert">
				<AlertTriangle size={22} />
				<p>{error}</p>
				<button onclick={() => retry++}>Try again</button>
			</div>
		{:else if !result.services.length}<div class="state">
				<Search size={24} />
				<h3>No matching services</h3>
				<p>Try another name. For an exact code, choose its provider first.</p>
				<p>Nothing has been selected or changed.</p>
			</div>
		{:else}
			<p class="count">
				{result.services.length}{result.hasMore ? '+' : ''}
				{result.services.length === 1 ? 'service' : 'services'} · alphabetical order{result.hasMore
					? ' · refine your search to see more'
					: ''}
			</p>
			{#each result.services as service (service.providerServiceId)}
				<article class:selected={service.providerServiceId === currentId}>
					<div class="service-heading">
						<span class="provider"
							>{service.provider === 'smm_raja' ? 'SMM Raja' : 'BulkFollows'} · #{service.serviceId}</span
						>{#if service.providerServiceId === currentId}<span class="current"
								><Check size={13} /> Current choice</span
							>{/if}
					</div>
					<h3>{service.name}</h3>
					<div class="facts">
						<div>
							<span>Cost per {quantity.toLocaleString()}</span><strong
								>{money(
									service.rateUsd == null ? null : (service.rateUsd * fx * quantity) / 1000
								)}</strong
							>
						</div>
						<div>
							<span>Quantity limits</span><strong
								>{service.min?.toLocaleString() ?? '—'} – {service.max?.toLocaleString() ??
									'—'}</strong
							>
						</div>
						<div>
							<span>Refill listing</span><strong
								>{service.refillAdvertised
									? service.refillDaysClaimed
										? `${service.refillDaysClaimed} days advertised`
										: 'Advertised; no duration confirmed'
									: 'Not advertised'}</strong
							>
						</div>
					</div>
					{#if service.issues.length}<ul class="issues">
							{#each service.issues as issue}<li>{issue}</li>{/each}
						</ul>{:else if service.publicationIssues?.length}<ul class="issues">
							{#each service.publicationIssues as issue}<li>
									{boostPricingAdvisory(issue) ? 'Advisory' : 'Before publishing'}: {issue}
								</li>{/each}
						</ul>{/if}
					<div class="service-footer">
						<small
							>${service.rateUsd ?? '—'} / 1,000 · checked {new Date(
								service.checkedAt
							).toLocaleString('en-NG')}</small
						><button
							class="use"
							disabled={service.issues.length > 0}
							aria-label={`Use ${service.provider === 'smm_raja' ? 'SMM Raja' : 'BulkFollows'} ${service.serviceId}`}
							onclick={() => onChoose(untrack(() => structuredClone($state.snapshot(service))))}
							>Use this service</button
						>
					</div>
				</article>
			{/each}
		{/if}
	</div>
</div>

<style>
	.picker {
		color: var(--text);
		font-size: 14px;
	}
	.intro {
		margin: 0 0 20px;
		color: var(--text-muted);
		line-height: 1.6;
	}
	.search-tools {
		display: flex;
		gap: 12px;
		align-items: end;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 7px;
		font-size: 12px;
		font-weight: 600;
	}
	.search {
		flex: 1;
		min-width: 0;
	}
	.search span {
		display: flex;
		align-items: center;
		gap: 8px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		padding: 0 12px;
	}
	input,
	select,
	button {
		font: inherit;
		color: var(--text);
	}
	input,
	select {
		min-height: 44px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 9px 12px;
	}
	input {
		min-width: 0;
		width: 100%;
		padding-left: 0;
		border: none;
	}
	.search span:focus-within {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	.search input:focus {
		outline: none;
	}
	button {
		min-height: 44px;
		border: 1px solid var(--border);
		background: var(--bg);
		border-radius: 10px;
		padding: 10px 14px;
		cursor: pointer;
	}
	button:focus-visible,
	select:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 3px;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.hint,
	.count,
	small {
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.5;
	}
	.hint {
		margin: 12px 0 20px;
	}
	.count {
		margin: 0 0 12px;
	}
	.results {
		min-height: 160px;
	}
	article {
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 18px;
		margin-bottom: 12px;
		background: var(--bg);
	}
	article.selected {
		border-color: var(--primary);
	}
	.service-heading,
	.service-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.provider {
		color: var(--primary);
		font-size: 12px;
		font-weight: 600;
	}
	.current {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--primary);
		font-size: 11px;
	}
	h3 {
		font-size: 14px;
		margin: 10px 0 16px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 14px;
		padding-bottom: 18px;
	}
	.facts div {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.facts span {
		color: var(--text-muted);
		font-size: 11px;
	}
	.facts strong {
		font-size: 13px;
		line-height: 1.5;
	}
	.service-footer {
		border-top: 1px solid var(--border);
		padding-top: 14px;
	}
	.use {
		background: var(--primary);
		color: #00150b;
		border-color: transparent;
		font-weight: 700;
	}
	.issues {
		color: #fbbf24;
		font-size: 12px;
		line-height: 1.6;
		padding-left: 18px;
		margin: 0 0 16px;
	}
	.state {
		min-height: 180px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 10px;
		text-align: center;
		color: var(--text-muted);
	}
	.state p,
	.state h3 {
		margin: 0;
		max-width: 360px;
	}
	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border);
		border-top-color: var(--primary);
		border-radius: 50%;
		animation: rotate 0.7s linear infinite;
	}
	@keyframes rotate {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
	@media (max-width: 600px) {
		.search-tools {
			flex-wrap: wrap;
		}
		.search {
			flex-basis: calc(100% - 60px);
			order: 2;
		}
		.refresh {
			order: 3;
		}
		.search-tools > label:first-child {
			width: 100%;
		}
		.facts {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.facts div {
			flex-direction: row;
			justify-content: space-between;
			gap: 12px;
		}
		.facts strong {
			text-align: right;
		}
		.use {
			width: 100%;
		}
		article {
			padding: 14px;
		}
	}
</style>
