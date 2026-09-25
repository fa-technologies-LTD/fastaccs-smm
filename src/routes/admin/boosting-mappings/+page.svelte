<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		AlertTriangle,
		Check,
		ChevronRight,
		Lock,
		RefreshCcw,
		Save,
		Search,
		ShieldCheck,
		Trash2,
		Zap
	} from '$lib/icons';
	import type {
		BoostMappingCandidate,
		BoostMappingOfferDraft,
		BoostMappingRouteDraft,
		BoostMappingWorkspace,
		BoostServiceLookupResult
	} from '$lib/helpers/boosting-mapping-types';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	type QualityTier = 'value' | 'stable' | 'premium';
	type SetupMode = 'choice' | 'smart';
	type Provider = 'smm_raja' | 'bulk_follows';

	const TIER_COPY: Record<QualityTier, { name: string; promise: string; help: string }> = {
		value: {
			name: 'Affordable',
			promise: 'A simple lower-cost option for everyday growth.',
			help: 'Lowest price. No refill is promised unless you add one.'
		},
		stable: {
			name: 'More stable',
			promise: 'Less likely to drop.',
			help: 'Prioritises services with stronger retention or supplier refill support.'
		},
		premium: {
			name: 'Premium',
			promise: 'Higher-quality delivery with the clearest protection available.',
			help: 'Use your known best service or a carefully reviewed premium shortlist.'
		}
	};

	let { data }: { data: PageData } = $props();
	let selectedCategoryId = $state('');
	let selectedQualityTier = $state<QualityTier>('value');
	let workspace = $state<BoostMappingWorkspace | null>(null);
	let offerDraft = $state<BoostMappingOfferDraft | null>(null);
	let routeDrafts = $state<BoostMappingRouteDraft[]>([]);
	let knownCandidates = $state<BoostMappingCandidate[]>([]);
	let setupMode = $state<SetupMode>('choice');
	let provider = $state<Provider>('smm_raja');
	let serviceCode = $state('');
	let lookupResult = $state<BoostServiceLookupResult | null>(null);
	let loading = $state(false);
	let lookupLoading = $state(false);
	let smartLoading = $state(false);
	let saving = $state(false);
	let pricingSaving = $state(false);
	let loadError = $state('');
	let workspacePanel = $state<HTMLElement | null>(null);
	let loadVersion = 0;

	const selectedListItem = $derived(data.offers.find((item) => item.id === selectedCategoryId));
	const routeByServiceId = $derived(
		new Map(routeDrafts.map((route) => [route.providerServiceId, route]))
	);
	const candidateById = $derived(new Map(knownCandidates.map((candidate) => [candidate.id, candidate])));
	const included = $derived(Boolean(offerDraft && offerDraft.status !== 'hidden'));
	const minimumCustomerPrice = $derived(
		workspace && offerDraft
			? (workspace.category.minQuantity / workspace.category.stepQuantity) *
				offerDraft.pricePerStepNgn
			: 0
	);
	const primaryCandidate = $derived.by(() => {
		if (!offerDraft) return null;
		const requested =
			offerDraft.routingPolicy === 'locked'
				? offerDraft.lockedProviderServiceId
				: offerDraft.routingPolicy === 'preferred'
					? offerDraft.preferredProviderServiceId
					: routeDrafts[0]?.providerServiceId;
		return requested ? candidateById.get(requested) || null : null;
	});
	const estimatedSupplierCost = $derived.by(() => {
		if (!workspace || !primaryCandidate) return 0;
		return (
			(primaryCandidate.ratePerThousand * workspace.category.minQuantity * workspace.configuredFxNgnPerUsd) /
			1000 *
			(1 + workspace.configuredCurrencyBufferPercent / 100)
		);
	});
	const suggestedMinimumPrice = $derived.by(() => {
		if (!offerDraft || estimatedSupplierCost <= 0) return 0;
		const margin = Math.min(95, Math.max(1, Number(offerDraft.minimumMarginPercent)));
		return round50(estimatedSupplierCost / (1 - margin / 100));
	});
	const suggestedPricePerStep = $derived.by(() => {
		if (!workspace || suggestedMinimumPrice <= 0) return 0;
		return round50(
			(suggestedMinimumPrice * workspace.category.stepQuantity) / workspace.category.minQuantity
		);
	});
	const hardMaximumSpend = $derived(
		Math.max(
			1,
			Math.floor(minimumCustomerPrice * (1 - Number(offerDraft?.minimumMarginPercent || 0) / 100))
		)
	);
	const projectedMarginPercent = $derived(
		minimumCustomerPrice > 0 && estimatedSupplierCost > 0
			? ((minimumCustomerPrice - estimatedSupplierCost) / minimumCustomerPrice) * 100
			: 0
	);

	function round50(value: number): number {
		return Math.max(50, Math.ceil((Number(value) - 1e-9) / 50) * 50);
	}

	function money(value: number): string {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN',
			maximumFractionDigits: 0
		}).format(Number.isFinite(value) ? value : 0);
	}

	function defaultOffer(next: BoostMappingWorkspace): BoostMappingOfferDraft {
		const tier = next.selectedQualityTier;
		const minimumPrice = Math.max(
			50,
			(next.category.minQuantity / next.category.stepQuantity) * next.category.pricePerStepNgn
		);
		const margin = next.configuredDefaultMarginPercent;
		return {
			qualityTier: tier,
			customerName: TIER_COPY[tier].name,
			shortPromise: TIER_COPY[tier].promise,
			refillDays: tier === 'value' ? null : next.category.refillDays,
			pricePerStepNgn: Math.max(50, next.category.pricePerStepNgn),
			priceLocked: false,
			minimumMarginPercent: margin,
			normalCostTargetNgn: Math.max(1, Math.floor(minimumPrice * (1 - margin / 100))),
			maximumSupplierCostNgn: Math.max(1, Math.floor(minimumPrice * (1 - margin / 100))),
			attemptCap: 1,
			status: 'hidden',
			routingPolicy: 'locked',
			preferredProviderServiceId: null,
			lockedProviderServiceId: null
		};
	}

	function mergeCandidates(...groups: BoostMappingCandidate[][]): void {
		const byId = new Map(knownCandidates.map((candidate) => [candidate.id, candidate]));
		for (const candidate of groups.flat()) byId.set(candidate.id, candidate);
		knownCandidates = [...byId.values()];
	}

	async function loadWorkspace(): Promise<void> {
		const categoryId = selectedCategoryId;
		if (!categoryId) return;
		const requestVersion = ++loadVersion;
		loading = true;
		loadError = '';
		lookupResult = null;
		try {
			const response = await fetch(
				`/api/admin/boosting-mappings/${categoryId}?tier=${selectedQualityTier}`
			);
			const payload = await response.json();
			if (requestVersion !== loadVersion) return;
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'This result could not be loaded.');
			}
			workspace = payload.data as BoostMappingWorkspace;
			offerDraft = workspace.offer ?? defaultOffer(workspace);
			routeDrafts = workspace.candidates
				.filter((candidate) => candidate.mappedRoute)
				.map((candidate) => ({ ...candidate.mappedRoute! }));
			knownCandidates = [...workspace.candidates];
			setupMode = offerDraft.routingPolicy === 'automatic' ? 'smart' : 'choice';
		} catch (error) {
			if (requestVersion !== loadVersion) return;
			loadError = error instanceof Error ? error.message : 'This result could not be loaded.';
		} finally {
			if (requestVersion === loadVersion) loading = false;
		}
	}

	async function chooseCategory(categoryId: string): Promise<void> {
		selectedCategoryId = categoryId;
		selectedQualityTier = 'value';
		workspace = null;
		offerDraft = null;
		routeDrafts = [];
		knownCandidates = [];
		serviceCode = '';
		await loadWorkspace();
		await tick();
		if (window.matchMedia('(max-width: 1279px)').matches) {
			workspacePanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	async function changeQualityTier(tier: QualityTier): Promise<void> {
		if (selectedQualityTier === tier && workspace) return;
		selectedQualityTier = tier;
		workspace = null;
		offerDraft = null;
		routeDrafts = [];
		knownCandidates = [];
		serviceCode = '';
		await loadWorkspace();
	}

	function requiredSignals(): string[] {
		if (!offerDraft) return [];
		return [
			...(offerDraft.refillDays ? ['refill_verified'] : []),
			...(offerDraft.qualityTier === 'stable' || offerDraft.qualityTier === 'premium'
				? ['stability_verified']
				: []),
			...(offerDraft.qualityTier === 'premium' ? ['premium_quality_verified'] : [])
		];
	}

	function routeFor(candidate: BoostMappingCandidate): BoostMappingRouteDraft {
		return {
			providerServiceId: candidate.id,
			state: 'shadow',
			equivalenceApproved: true,
			verifiedSignals: requiredSignals(),
			audienceTags: [],
			verifiedRefillDays:
				offerDraft?.refillDays && candidate.refillAdvertised
					? offerDraft.refillDays
					: null,
			maximumPilotQuantity: workspace?.category.minQuantity ?? null,
			expectedRecoveryCostPercent: 0
		};
	}

	function useCandidate(candidate: BoostMappingCandidate): void {
		if (!offerDraft) return;
		mergeCandidates([candidate]);
		if (!routeByServiceId.has(candidate.id)) routeDrafts = [...routeDrafts, routeFor(candidate)];
		const previousPrimary =
			offerDraft.lockedProviderServiceId ||
			offerDraft.preferredProviderServiceId ||
			routeDrafts[0]?.providerServiceId ||
			candidate.id;
		if (routeDrafts.length > 1) {
			offerDraft.routingPolicy = 'preferred';
			offerDraft.preferredProviderServiceId = previousPrimary;
			offerDraft.lockedProviderServiceId = null;
		} else {
			offerDraft.routingPolicy = 'locked';
			offerDraft.lockedProviderServiceId = candidate.id;
			offerDraft.preferredProviderServiceId = null;
		}
		setupMode = 'choice';
		if (offerDraft.status === 'hidden') offerDraft.status = 'reviewed';
		if (!offerDraft.priceLocked) queueMicrotask(useSuggestedPrice);
	}

	function removeRoute(serviceId: string): void {
		if (!offerDraft) return;
		routeDrafts = routeDrafts.filter((route) => route.providerServiceId !== serviceId);
		const first = routeDrafts[0]?.providerServiceId ?? null;
		if (routeDrafts.length <= 1) {
			offerDraft.routingPolicy = 'locked';
			offerDraft.lockedProviderServiceId = first;
			offerDraft.preferredProviderServiceId = null;
		} else {
			offerDraft.routingPolicy = 'preferred';
			offerDraft.preferredProviderServiceId = first;
			offerDraft.lockedProviderServiceId = null;
		}
	}

	async function findService(): Promise<void> {
		if (!serviceCode.trim() || lookupLoading) return;
		lookupLoading = true;
		lookupResult = null;
		try {
			const params = new URLSearchParams({
				categoryId: selectedCategoryId,
				provider,
				code: serviceCode.trim()
			});
			const response = await fetch(`/api/admin/boosting-suppliers/service?${params}`);
			const payload = await response.json();
			if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Lookup failed.');
			lookupResult = payload.data as BoostServiceLookupResult;
			if (lookupResult.service) mergeCandidates([lookupResult.service]);
		} catch (error) {
			showError('Could not find service', error instanceof Error ? error.message : 'Please try again.');
		} finally {
			lookupLoading = false;
		}
	}

	async function useSmartAuto(): Promise<void> {
		if (!offerDraft || smartLoading) return;
		smartLoading = true;
		try {
			const params = new URLSearchParams({
				categoryId: selectedCategoryId,
				mode: 'smart',
				tier: selectedQualityTier
			});
			const response = await fetch(`/api/admin/boosting-suppliers/service?${params}`);
			const payload = await response.json();
			if (!response.ok || !payload?.success) throw new Error(payload?.error || 'No shortlist found.');
			const candidates = (payload.data || []) as BoostMappingCandidate[];
			if (!candidates.length) throw new Error('No compatible supplier services are available.');
			mergeCandidates(candidates);
			routeDrafts = candidates.map(routeFor);
			offerDraft.routingPolicy = 'automatic';
			offerDraft.preferredProviderServiceId = null;
			offerDraft.lockedProviderServiceId = null;
			offerDraft.status = 'reviewed';
			setupMode = 'smart';
			if (!offerDraft.priceLocked) queueMicrotask(useSuggestedPrice);
			showSuccess('Smart Auto prepared', `${candidates.length} compatible routes are ready for shadow testing.`);
		} catch (error) {
			showError('Could not prepare Smart Auto', error instanceof Error ? error.message : 'Please try again.');
		} finally {
			smartLoading = false;
		}
	}

	function useSuggestedPrice(): void {
		if (!offerDraft || !suggestedPricePerStep) return;
		offerDraft.pricePerStepNgn = suggestedPricePerStep;
		offerDraft.priceLocked = false;
	}

	function toggleIncluded(): void {
		if (!offerDraft) return;
		if (included) offerDraft.status = 'hidden';
		else offerDraft.status = routeDrafts.length ? 'reviewed' : 'hidden';
	}

	async function savePricing(): Promise<void> {
		if (!workspace || pricingSaving) return;
		pricingSaving = true;
		try {
			const response = await fetch('/api/admin/boosting-settings', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					usdNgnRate: workspace.configuredFxNgnPerUsd,
					currencyBufferPercent: workspace.configuredCurrencyBufferPercent,
					defaultMarginPercent: workspace.configuredDefaultMarginPercent
				})
			});
			const payload = await response.json();
			if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Settings were not saved.');
			showSuccess('Pricing settings saved', 'New suggestions will use these defaults.');
		} catch (error) {
			showError('Could not save pricing', error instanceof Error ? error.message : 'Please try again.');
		} finally {
			pricingSaving = false;
		}
	}

	async function saveMapping(): Promise<void> {
		if (!offerDraft || !workspace?.foundationReady || saving) return;
		if (offerDraft.status !== 'hidden' && routeDrafts.length === 0) {
			showError('Choose a supplier route', 'Use an exact service or prepare Smart Auto first.');
			return;
		}
		offerDraft.normalCostTargetNgn = Math.max(1, Math.ceil(estimatedSupplierCost || hardMaximumSpend));
		offerDraft.maximumSupplierCostNgn = hardMaximumSpend;
		offerDraft.attemptCap = Math.max(1, Math.min(4, routeDrafts.length));
		saving = true;
		try {
			const response = await fetch(`/api/admin/boosting-mappings/${selectedCategoryId}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ offer: offerDraft, routes: routeDrafts })
			});
			const payload = await response.json();
			if (!response.ok || !payload?.success) throw new Error(payload?.error || 'The setup could not be saved.');
			workspace = payload.data as BoostMappingWorkspace;
			offerDraft = workspace.offer ?? defaultOffer(workspace);
			routeDrafts = workspace.candidates
				.filter((candidate) => candidate.mappedRoute)
				.map((candidate) => ({ ...candidate.mappedRoute! }));
			knownCandidates = [...workspace.candidates];
			showSuccess('Customer choice saved', 'It is ready for private preview. No supplier order was placed.');
		} catch (error) {
			showError('Could not save setup', error instanceof Error ? error.message : 'Please try again.');
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		selectedCategoryId = data.firstReviewQueue?.[0]?.categoryId ?? data.offers[0]?.id ?? '';
		selectedQualityTier = (data.firstReviewQueue?.[0]?.qualityTier as QualityTier) || 'value';
		void loadWorkspace();
	});
</script>

<svelte:head><title>Boosting Setup | Admin</title></svelte:head>

<div class="space-y-6">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-xs font-semibold tracking-[0.14em] uppercase" style="color: var(--primary);">Internal only</p>
			<h1 class="mt-1 flex items-center gap-2 text-2xl font-bold" style="color: var(--text);"><Zap size={24} /> Set up Boosting</h1>
			<p class="mt-1 max-w-2xl text-sm" style="color: var(--text-muted);">Choose what customers see, then connect the supplier services quietly behind it.</p>
		</div>
		<a href="/admin/boosting-preview" class="flex items-center gap-1 text-sm font-semibold" style="color: var(--link);">Customer preview <ChevronRight size={15} /></a>
	</header>

	<div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
		<aside class="h-fit overflow-hidden rounded-2xl border" style="border-color: var(--border); background: var(--bg-elev-1);">
			<div class="border-b p-4" style="border-color: var(--border);">
				<p class="font-semibold" style="color: var(--text);">1. Choose a result</p>
				<p class="mt-0.5 text-xs" style="color: var(--text-muted);">For example, X Followers</p>
			</div>
			<div class="max-h-[65vh] overflow-y-auto p-2">
				{#each data.offers as item (item.id)}
					<button type="button" onclick={() => chooseCategory(item.id)} class="mb-1 w-full rounded-xl border p-3 text-left" style={selectedCategoryId === item.id ? 'border-color: var(--primary); background: rgba(16,185,129,.09);' : 'border-color: transparent;'}>
						<div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold" style="color: var(--text);">{item.name}</span>{#if selectedCategoryId === item.id}<Check size={15} style="color: var(--primary);" />{/if}</div>
						<p class="mt-1 text-xs" style="color: var(--text-muted);">{item.platformLabel} · {item.outcomeLabel}</p>
						<p class="mt-1 text-[10px]" style="color: var(--text-dim);">{item.reviewedTierCount} customer choice{item.reviewedTierCount === 1 ? '' : 's'} ready</p>
					</button>
				{/each}
			</div>
		</aside>

		<main bind:this={workspacePanel} tabindex="-1" class="min-w-0 scroll-mt-4 space-y-5 outline-none">
			{#if loading && !workspace}
				<div class="flex min-h-64 items-center justify-center rounded-2xl border" style="border-color: var(--border); color: var(--text-muted);"><RefreshCcw class="mr-2 animate-spin" size={18} /> Loading setup…</div>
			{:else if loadError}
				<div class="rounded-2xl border p-5" style="border-color: #7f1d1d; color: #fca5a5;"><AlertTriangle size={18} /> {loadError}</div>
			{:else if workspace && offerDraft}
				<section class="rounded-2xl border p-4 sm:p-5" style="border-color: var(--border); background: var(--bg-elev-1);">
					<h2 class="text-lg font-bold" style="color: var(--text);">{selectedListItem?.name}</h2>
					<p class="mt-1 text-sm" style="color: var(--text-muted);">2. Choose the customer option you want to configure.</p>
					<div class="mt-4 grid gap-2 sm:grid-cols-3">
						{#each (['value', 'stable', 'premium'] as QualityTier[]) as tier}
							<button type="button" onclick={() => changeQualityTier(tier)} class="rounded-xl border p-3 text-left" style={selectedQualityTier === tier ? 'border-color: var(--primary); background: rgba(16,185,129,.08);' : 'border-color: var(--border);'}>
								<p class="font-semibold" style="color: var(--text);">{TIER_COPY[tier].name}</p>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">{TIER_COPY[tier].help}</p>
							</button>
						{/each}
					</div>
				</section>

				<section class="rounded-2xl border p-4 sm:p-5" style="border-color: var(--border); background: var(--bg-elev-1);">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div><h2 class="font-bold" style="color: var(--text);">3. Choose how it routes</h2><p class="mt-1 text-xs" style="color: var(--text-muted);">No paid order can be placed from this setup screen.</p></div>
						<label class="flex items-center gap-2 text-sm font-semibold" style="color: var(--text);"><input type="checkbox" checked={included} onchange={toggleIncluded} /> Offer this customer choice</label>
					</div>
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						<button type="button" onclick={() => (setupMode = 'choice')} class="rounded-xl border p-4 text-left" style={setupMode === 'choice' ? 'border-color: var(--primary); background: rgba(16,185,129,.07);' : 'border-color: var(--border);'}><p class="font-semibold" style="color: var(--text);">My choice</p><p class="mt-1 text-xs" style="color: var(--text-muted);">Enter the exact supplier service code you trust.</p></button>
						<button type="button" onclick={() => (setupMode = 'smart')} class="rounded-xl border p-4 text-left" style={setupMode === 'smart' ? 'border-color: var(--primary); background: rgba(16,185,129,.07);' : 'border-color: var(--border);'}><p class="font-semibold" style="color: var(--text);">Smart Auto</p><p class="mt-1 text-xs" style="color: var(--text-muted);">Use a small compatible shortlist and choose the safest route at order time.</p></button>
					</div>

					{#if setupMode === 'choice'}
						<form class="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]" onsubmit={(event) => { event.preventDefault(); void findService(); }}>
							<label class="text-xs font-semibold" style="color: var(--text-muted);">Supplier<select bind:value={provider} class="field mt-1"><option value="smm_raja">SMM Raja</option><option value="bulk_follows">BulkFollows</option></select></label>
							<label class="text-xs font-semibold" style="color: var(--text-muted);">Service code<input bind:value={serviceCode} inputmode="numeric" placeholder="e.g. 3498" class="field mt-1" /></label>
							<button class="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold" style="border-color: var(--border); color: var(--text);"><Search size={16} /> {lookupLoading ? 'Finding…' : 'Find'}</button>
						</form>
						{#if lookupResult}
							<div class="mt-4 rounded-xl border p-4" style={lookupResult.compatible ? 'border-color: rgba(16,185,129,.45); background: rgba(16,185,129,.05);' : 'border-color: rgba(245,158,11,.45);'}>
								{#if lookupResult.service}
									<p class="text-xs font-bold" style="color: var(--primary);">{lookupResult.service.providerLabel} · #{lookupResult.service.serviceId}</p>
									<h3 class="mt-1 font-semibold" style="color: var(--text);">{lookupResult.service.name}</h3>
									<p class="mt-2 text-sm" style="color: var(--text-muted);">${lookupResult.service.ratePerThousand.toFixed(4)} per 1,000 · {lookupResult.service.minQuantity.toLocaleString()}–{lookupResult.service.maxQuantity.toLocaleString()} {lookupResult.service.refillAdvertised ? '· Refill advertised' : '· No refill advertised'}</p>
								{/if}
								{#if lookupResult.issues.length}<ul class="mt-2 list-disc pl-5 text-xs" style="color: #fbbf24;">{#each lookupResult.issues as issue}<li>{issue}</li>{/each}</ul>{/if}
								{#if lookupResult.compatible && lookupResult.service}<button type="button" onclick={() => useCandidate(lookupResult!.service!)} class="mt-3 rounded-lg px-4 py-2 text-sm font-bold" style="background: var(--primary); color: #00150b;">{routeDrafts.length ? `Add as fallback for ${TIER_COPY[selectedQualityTier].name}` : `Use for ${TIER_COPY[selectedQualityTier].name}`}</button>{/if}
							</div>
						{/if}
					{:else}
						<div class="mt-4 rounded-xl border p-4" style="border-color: var(--border);">
							<p class="text-sm" style="color: var(--text-muted);">Fast Accounts will prepare up to four compatible routes, keep both suppliers represented where possible, and prefer the best price only after every safety check passes.</p>
							<button type="button" onclick={useSmartAuto} disabled={smartLoading} class="mt-3 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-60" style="background: var(--primary); color: #00150b;">{smartLoading ? 'Preparing…' : 'Prepare Smart Auto'}</button>
						</div>
					{/if}
				</section>

				{#if routeDrafts.length}
					<section class="rounded-2xl border p-4 sm:p-5" style="border-color: var(--border); background: var(--bg-elev-1);">
						<h2 class="font-bold" style="color: var(--text);">Selected supplier {routeDrafts.length === 1 ? 'service' : 'services'}</h2>
						<div class="mt-3 grid gap-2">
							{#each routeDrafts as route, index (route.providerServiceId)}
								{@const candidate = candidateById.get(route.providerServiceId)}
								{#if candidate}<div class="flex items-start justify-between gap-3 rounded-xl border p-3" style="border-color: var(--border);"><div><p class="text-xs font-bold" style="color: var(--primary);">{index === 0 ? 'Primary' : `Fallback ${index}`} · {candidate.providerLabel} #{candidate.serviceId}</p><p class="mt-1 text-sm font-semibold" style="color: var(--text);">{candidate.name}</p><p class="mt-1 text-xs" style="color: var(--text-muted);">${candidate.ratePerThousand.toFixed(4)} / 1,000 · {candidate.refillAdvertised ? 'Refill advertised' : 'No refill advertised'}</p></div><button type="button" onclick={() => removeRoute(candidate.id)} aria-label="Remove supplier service" class="rounded-lg p-2" style="color: #fca5a5;"><Trash2 size={17} /></button></div>{/if}
							{/each}
						</div>
					</section>
				{/if}

				<section class="rounded-2xl border p-4 sm:p-5" style="border-color: var(--border); background: var(--bg-elev-1);">
					<h2 class="font-bold" style="color: var(--text);">4. Set margin and customer price</h2>
					<div class="mt-4 grid gap-4 md:grid-cols-2">
						<label class="text-xs font-semibold" style="color: var(--text-muted);">Target minimum margin %<input type="number" min="1" max="95" bind:value={offerDraft.minimumMarginPercent} class="field mt-1" /></label>
						<label class="text-xs font-semibold" style="color: var(--text-muted);">Customer price per {workspace.category.stepQuantity.toLocaleString()}<input type="number" min="50" step="50" bind:value={offerDraft.pricePerStepNgn} oninput={() => (offerDraft!.priceLocked = true)} class="field mt-1" /></label>
					</div>
					<div class="mt-4 grid gap-2 sm:grid-cols-4">
						<div class="metric"><span>Supplier estimate</span><strong>{money(estimatedSupplierCost)}</strong></div>
						<div class="metric"><span>Suggested price</span><strong>{money(suggestedMinimumPrice)}</strong></div>
						<div class="metric"><span>Projected margin</span><strong>{projectedMarginPercent.toFixed(0)}%</strong></div>
						<div class="metric"><span>Maximum spend</span><strong>{money(hardMaximumSpend)}</strong></div>
					</div>
					<div class="mt-3 flex flex-wrap items-center gap-3"><button type="button" onclick={useSuggestedPrice} disabled={!suggestedPricePerStep} class="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style="border-color: var(--border); color: var(--text);">Use suggested price</button><label class="flex items-center gap-2 text-xs" style="color: var(--text-muted);"><input type="checkbox" bind:checked={offerDraft.priceLocked} /> Keep my price when supplier costs change</label></div>
				</section>

				<details class="rounded-2xl border p-4 sm:p-5" style="border-color: var(--border); background: var(--bg-elev-1);">
					<summary class="cursor-pointer font-semibold" style="color: var(--text);">Advanced</summary>
					<div class="mt-4 grid gap-4 md:grid-cols-2">
						<label class="text-xs font-semibold" style="color: var(--text-muted);">Customer option name<input bind:value={offerDraft.customerName} maxlength="80" class="field mt-1" /></label>
						<label class="text-xs font-semibold" style="color: var(--text-muted);">Simple promise<input bind:value={offerDraft.shortPromise} maxlength="120" class="field mt-1" /></label>
						<label class="text-xs font-semibold" style="color: var(--text-muted);">Promised refill days<input type="number" min="1" max="365" placeholder="None" value={offerDraft.refillDays ?? ''} oninput={(event) => { const value = Number(event.currentTarget.value); offerDraft!.refillDays = event.currentTarget.value && Number.isFinite(value) ? Math.round(value) : null; }} class="field mt-1" /></label>
						<label class="text-xs font-semibold" style="color: var(--text-muted);">Visibility<select bind:value={offerDraft.status} class="field mt-1"><option value="hidden">Not offered</option><option value="reviewed">Private preview</option><option value="live">Live storefront</option></select></label>
						<label class="text-xs font-semibold" style="color: var(--text-muted);">Route behaviour<select bind:value={offerDraft.routingPolicy} class="field mt-1"><option value="automatic">Smart Auto</option><option value="preferred">Primary with fallback</option><option value="locked">Primary only</option></select></label>
					</div>
					<div class="mt-5 border-t pt-4" style="border-color: var(--border);"><p class="text-sm font-semibold" style="color: var(--text);">Global conversion defaults</p><div class="mt-3 grid gap-3 sm:grid-cols-3"><label class="text-xs" style="color: var(--text-muted);">USD → NGN<input type="number" min="1" bind:value={workspace.configuredFxNgnPerUsd} class="field mt-1" /></label><label class="text-xs" style="color: var(--text-muted);">Currency buffer %<input type="number" min="0" max="100" bind:value={workspace.configuredCurrencyBufferPercent} class="field mt-1" /></label><label class="text-xs" style="color: var(--text-muted);">Default margin %<input type="number" min="1" max="95" bind:value={workspace.configuredDefaultMarginPercent} class="field mt-1" /></label></div><button type="button" onclick={savePricing} disabled={pricingSaving} class="mt-3 rounded-lg border px-3 py-2 text-xs font-bold" style="border-color: var(--border); color: var(--text);">{pricingSaving ? 'Saving…' : 'Save global pricing'}</button></div>
					{#if routeDrafts.length}<div class="mt-5 border-t pt-4" style="border-color: var(--border);"><p class="text-sm font-semibold" style="color: var(--text);">Paid pilot controls</p><p class="mt-1 text-xs" style="color: var(--text-muted);">The environment kill switch must also be set to Pilot or Live before any paid supplier order can leave Fast Accounts.</p><div class="mt-3 grid gap-2">{#each routeDrafts as route (route.providerServiceId)}{@const candidate = candidateById.get(route.providerServiceId)}{#if candidate}<div class="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_220px] sm:items-center" style="border-color: var(--border);"><div><p class="text-xs font-semibold" style="color: var(--text);">{candidate.providerLabel} #{candidate.serviceId}</p><p class="text-[11px]" style="color: var(--text-dim);">Maximum pilot quantity: {route.maximumPilotQuantity?.toLocaleString() || 'not set'}</p></div><select bind:value={route.state} class="field"><option value="shadow">Shadow only — never spend</option><option value="enabled">Allow controlled pilot</option><option value="paused">Paused</option></select></div>{/if}{/each}</div></div>{/if}
					<div class="mt-4 rounded-xl border p-3 text-xs" style="border-color: rgba(245,158,11,.35); color: var(--text-muted);"><Lock size={14} class="mr-1 inline" />Routes remain Shadow only until a controlled pilot explicitly enables them. A supplier rejection may try an uncharged fallback; an accepted or uncertain order is never purchased twice automatically.</div>
					<a href="/admin/boosting-services" class="mt-4 inline-flex text-xs font-semibold" style="color: var(--link);">Manage customer results and availability →</a>
				</details>

				<section class="grid gap-4 rounded-2xl border p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5" style="border-color: var(--border); background: var(--bg-elev-1);">
					<div><div class="flex items-center gap-2">{#if routeDrafts.length}<ShieldCheck size={19} style="color: var(--primary);" />{:else}<AlertTriangle size={19} style="color: #fbbf24;" />{/if}<h2 class="font-bold" style="color: var(--text);">Ready to save</h2></div><p class="mt-1 text-sm" style="color: var(--text-muted);">{routeDrafts.length ? `${routeDrafts.length} route${routeDrafts.length === 1 ? '' : 's'} selected · ${money(minimumCustomerPrice)} starting price` : 'Choose a supplier service or prepare Smart Auto.'}</p></div>
					<button type="button" onclick={saveMapping} disabled={saving} class="flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-60" style="background: var(--primary); color: #00150b;"><Save size={17} />{saving ? 'Saving…' : 'Save customer choice'}</button>
				</section>
			{/if}
		</main>
	</div>
</div>

<style>
	.field { width: 100%; min-height: 2.65rem; border: 1px solid var(--border); border-radius: .75rem; background: var(--bg); padding: .55rem .75rem; font-size: .875rem; color: var(--text); outline: none; }
	.field:focus { border-color: var(--primary); }
	.metric { display: flex; flex-direction: column; gap: .2rem; border: 1px solid var(--border); border-radius: .75rem; padding: .75rem; color: var(--text-muted); font-size: .7rem; }
	.metric strong { color: var(--text); font-size: .9rem; }
	input[type='checkbox'] { accent-color: var(--primary); }
</style>
