<script lang="ts">
	import { onMount } from 'svelte';
	import {
		supplierPackCost,
		type BoostSupplierDetails
	} from '$lib/helpers/boosting-supplier-details';
	let {
		offerId,
		quantity,
		fx,
		rowProvider,
		rowServiceId,
		costReferenceOnly = false,
		previewOnly = false,
		initialData = null
	}: {
		offerId: string | null;
		quantity: number;
		fx: number;
		rowProvider?: string;
		rowServiceId?: string;
		costReferenceOnly?: boolean;
		previewOnly?: boolean;
		initialData?: BoostSupplierDetails | null;
	} = $props();
	let details = $state<BoostSupplierDetails | null>(null);
	let loading = $state(false);
	let error = $state('');
	let controller: AbortController | null = null;
	let disposed = false;
	const number = (value: number) => value.toLocaleString('en-NG', { maximumFractionDigits: 6 });
	const money = (value: number | null) =>
		value == null
			? 'Not recorded'
			: `₦${value.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
	function date(value: string | null) {
		if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
		return new Date(value).toLocaleString('en-NG', {
			timeZone: 'Africa/Lagos',
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
	async function load() {
		if (previewOnly) {
			details = initialData;
			return;
		}
		if (!offerId) return;
		controller?.abort();
		const request = new AbortController();
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			request.abort();
		}, 15000);
		controller = request;
		loading = true;
		error = '';
		try {
			const response = await fetch(
				`/api/admin/boosting-pricing/supplier-details?offerId=${encodeURIComponent(offerId)}`,
				{ cache: 'no-store', signal: request.signal }
			);
			const result = await response.json();
			if (disposed || request.signal.aborted) return;
			if (
				!response.ok ||
				!result.success ||
				!result.data ||
				result.data.offerId !== offerId ||
				!Array.isArray(result.data.providers)
			)
				throw new Error(
					response.status >= 500
						? 'Supplier details could not load. Your pricing edits are kept.'
						: result.error || 'Supplier details could not load. Your pricing edits are kept.'
				);
			details = result.data;
		} catch (cause) {
			if (!disposed && (!request.signal.aborted || timedOut))
				error =
					cause instanceof Error && cause.name === 'Error'
						? cause.message
						: 'Supplier details could not load. Your pricing edits are kept.';
		} finally {
			clearTimeout(timeout);
			if (!disposed && controller === request) loading = false;
		}
	}
	onMount(() => {
		void load();
		return () => {
			disposed = true;
			controller?.abort();
		};
	});
</script>

<div class="supplier-details">
	<p class="notice">
		View only. Your unsaved prices, locks and Live ticks are kept. Nothing here changes a supplier
		or saves settings.
	</p>
	{#if !previewOnly && offerId}<button
			disabled={loading}
			onclick={load}
			title="Reload stored supplier details only. This does not refresh the catalogue or change settings."
			>{loading ? 'Loading saved details…' : 'Refresh saved details'}</button
		>{/if}
	{#if costReferenceOnly}<p class="notice">
			Several supplier services may be configured. The pricing row shows the highest configured cost
			for budgeting—not a fixed primary supplier. Saved services are listed below.
		</p>{/if}
	{#if previewOnly}<p class="sample">
			Illustrative supplier records only—not real services or balances.
		</p>{/if}
	{#if loading}<p role="status">Loading saved supplier details…</p>
	{:else if error}<div role="alert">
			<p>{error}</p>
			<button onclick={load}>Try loading again</button>
		</div>
	{:else if !details}<p>
			No saved supplier details are available for this offer yet. Your price draft is unchanged.
		</p>
	{:else}
		<p>
			Costs below use your draft dollar rate of {money(fx)} and pricing quantity of {number(
				quantity
			)}. This does not save either value.
		</p>
		<div class="providers">
			{#each details.providers as provider (provider.id)}<section
					class="provider"
					aria-label={`${provider.label} supplier records`}
				>
					<header>
						<h3>{provider.label}</h3>
						<span
							>{provider.enabled === false
								? 'Provider paused'
								: provider.healthPaused
									? 'Provider on hold'
									: provider.enabled === true
										? 'Provider enabled'
										: 'Status not recorded'}</span
						>
					</header>
					<p>
						Recorded balance: <b
							>{provider.balance == null
								? 'Not recorded'
								: `${provider.currency ?? 'Currency not recorded'} ${number(provider.balance)}`}</b
						>
					</p>
					<p class="muted">Balance last checked: {date(provider.balanceCheckedAt)} · Lagos time</p>
					{#each provider.services as service (service.id)}<article
							aria-label={`${provider.label} service ${service.serviceId}`}
						>
							{#if provider.id === rowProvider && service.serviceId === rowServiceId}<p
									class="sample"
								>
									Shown in the pricing row
								</p>{/if}
							<div class="service-title">
								<b>#{service.serviceId}</b><span
									>{service.unavailable
										? 'Supplier unavailable'
										: service.state === 'paused'
											? 'Mapping paused'
											: service.approved && service.state === 'enabled'
												? 'Approved mapping'
												: service.state === 'shadow'
													? 'Saved for review—not live'
													: 'Not approved for live orders'}</span
								>
							</div>
							<p class="service-name">{service.name}</p>
							<dl>
								<div>
									<dt>Rate per 1,000</dt>
									<dd>
										{service.rateUsd == null ? 'Not recorded' : `USD ${number(service.rateUsd)}`}
									</dd>
								</div>
								<div>
									<dt>Cost per {number(quantity)}</dt>
									<dd>{money(supplierPackCost(service.rateUsd, fx, quantity))}</dd>
								</div>
								<div>
									<dt>Supplier minimum</dt>
									<dd>{service.min == null ? 'Not recorded' : number(service.min)}</dd>
								</div>
								<div>
									<dt>Supplier maximum</dt>
									<dd>{service.max == null ? 'Not recorded' : number(service.max)}</dd>
								</div>
								<div>
									<dt>Advertised refill</dt>
									<dd>
										{service.refillDaysClaimed
											? `${service.refillDaysClaimed} days—supplier claim`
											: service.refillAdvertised
												? 'Advertised—period not recorded'
												: 'Not advertised'}
									</dd>
								</div>
								<div>
									<dt>Refill verification on file</dt>
									<dd>
										{service.recordedVerifiedRefillDays
											? `${service.recordedVerifiedRefillDays} days recorded`
											: 'Not verified'}
									</dd>
								</div>
								<div>
									<dt>Recorded delivery observations</dt>
									<dd>
										{service.recordedObservations
											? number(service.recordedObservations)
											: 'No history recorded'}
									</dd>
								</div>
								<div>
									<dt>Consecutive failures recorded</dt>
									<dd>{number(service.consecutiveFailures)}</dd>
								</div>
							</dl>
							<p class="muted">Catalogue last seen: {date(service.lastSeenAt)} · Lagos time</p>
						</article>{:else}<p class="empty">
							No saved supplier mapping for this provider.
						</p>{/each}
				</section>{/each}
		</div>
		<p class="muted">
			These are saved records, not a live balance check or proof of delivery. Advertised refill is
			not the same as verified cover.
		</p>
	{/if}
</div>

<style>
	.supplier-details {
		color: var(--text);
		font-size: 13px;
	}
	p {
		color: var(--text-muted);
		line-height: 1.6;
		margin: 8px 0;
	}
	b {
		color: var(--text);
		font-weight: 600;
	}
	.notice {
		border: 1px solid var(--border);
		border-radius: 9px;
		padding: 12px;
		background: var(--bg-elev-1);
	}
	.sample {
		color: var(--primary);
	}
	.providers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		margin: 20px 0;
	}
	.provider {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 16px;
	}
	header,
	.service-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px;
	}
	h3 {
		font-weight: 650;
		font-size: 15px;
	}
	header span,
	.service-title span {
		font-size: 11px;
		color: var(--text-muted);
	}
	article {
		border-top: 1px solid var(--border);
		padding-top: 16px;
		margin-top: 16px;
	}
	.service-name {
		overflow-wrap: anywhere;
		color: var(--text);
	}
	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
		margin: 16px 0;
	}
	dt,
	.muted {
		color: var(--text-muted);
		font-size: 11px;
	}
	dd {
		margin: 4px 0 0;
		overflow-wrap: anywhere;
		line-height: 1.5;
	}
	.empty {
		padding: 16px 0 0;
		border-top: 1px solid var(--border);
	}
	button {
		border: 1px solid var(--border);
		background: var(--bg-elev-1);
		color: var(--text);
		padding: 9px 12px;
		border-radius: 8px;
		cursor: pointer;
	}
	[role='alert'] p {
		color: #f87171;
	}
	@media (max-width: 700px) {
		.providers {
			grid-template-columns: 1fr;
		}
		.provider {
			padding: 12px;
		}
	}
</style>
