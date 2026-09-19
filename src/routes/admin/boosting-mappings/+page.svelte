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
		Zap
	} from '$lib/icons';
	import type {
		BoostMappingCandidate,
		BoostMappingOfferDraft,
		BoostMappingRouteDraft,
		BoostMappingWorkspace
	} from '$lib/helpers/boosting-mapping-types';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let selectedCategoryId = $state('');
	let selectedQualityTier = $state<'value' | 'stable' | 'premium'>('value');
	let workspace = $state<BoostMappingWorkspace | null>(null);
	let offerDraft = $state<BoostMappingOfferDraft | null>(null);
	let routeDrafts = $state<BoostMappingRouteDraft[]>([]);
	let search = $state('');
	let loading = $state(false);
	let saving = $state(false);
	let loadError = $state('');
	let workspacePanel = $state<HTMLElement | null>(null);
	let loadVersion = 0;

	const selectedListItem = $derived(data.offers.find((item) => item.id === selectedCategoryId));
	const routeByServiceId = $derived(
		new Map(routeDrafts.map((route) => [route.providerServiceId, route]))
	);
	const minimumCustomerPrice = $derived(
		workspace && offerDraft
			? Math.round(
					(workspace.category.minQuantity / workspace.category.stepQuantity) *
						offerDraft.pricePerStepNgn *
						100
				) / 100
			: 0
	);
	const routeEstimates = $derived.by(() => {
		const currentWorkspace = workspace;
		const currentOffer = offerDraft;
		if (!currentWorkspace || !currentOffer) return [];
		return routeDrafts
			.map((route) => {
				const service = currentWorkspace.candidates.find(
					(candidate) => candidate.id === route.providerServiceId
				);
				if (!service) return null;
				const supplierCost =
					((service.ratePerThousand *
						currentWorkspace.category.minQuantity *
						currentWorkspace.configuredFxNgnPerUsd) /
						1000) *
					(1 +
						currentWorkspace.configuredCurrencyBufferPercent / 100 +
						route.expectedRecoveryCostPercent / 100);
				const margin = minimumCustomerPrice - supplierCost;
				const marginPercent = minimumCustomerPrice > 0 ? (margin / minimumCustomerPrice) * 100 : 0;
				const eligible =
					route.equivalenceApproved &&
					route.state === 'enabled' &&
					currentWorkspace.category.minQuantity >= service.minQuantity &&
					currentWorkspace.category.minQuantity <= service.maxQuantity &&
					supplierCost <= currentOffer.maximumSupplierCostNgn &&
					marginPercent >= currentOffer.minimumMarginPercent;
				return { route, service, supplierCost, margin, marginPercent, eligible };
			})
			.filter((item): item is NonNullable<typeof item> => Boolean(item))
			.sort((left, right) => left.supplierCost - right.supplierCost);
	});
	const selectedEstimate = $derived.by(() => {
		if (!offerDraft) return null;
		const eligible = routeEstimates.filter((item) => item.eligible);
		if (offerDraft.routingPolicy === 'locked') {
			return (
				eligible.find((item) => item.service.id === offerDraft?.lockedProviderServiceId) ?? null
			);
		}
		if (offerDraft.routingPolicy === 'preferred') {
			return (
				eligible.find((item) => item.service.id === offerDraft?.preferredProviderServiceId) ??
				eligible[0] ??
				null
			);
		}
		return eligible[0] ?? null;
	});

	function defaultOffer(next: BoostMappingWorkspace): BoostMappingOfferDraft {
		const price = Math.max(
			1,
			(next.category.minQuantity / next.category.stepQuantity) * next.category.pricePerStepNgn
		);
		return {
			qualityTier: next.selectedQualityTier,
			customerName: next.category.name,
			shortPromise: 'Clear delivery with simple updates.',
			pricePerStepNgn: Math.max(50, next.category.pricePerStepNgn),
			minimumMarginPercent: 30,
			normalCostTargetNgn: Math.max(0, Math.floor(price * 0.45)),
			maximumSupplierCostNgn: Math.max(1, Math.floor(price * 0.65)),
			attemptCap: 1,
			status: 'hidden',
			routingPolicy: 'automatic',
			preferredProviderServiceId: null,
			lockedProviderServiceId: null
		};
	}

	async function loadWorkspace(options: { keepDrafts?: boolean } = {}): Promise<void> {
		const categoryId = selectedCategoryId;
		if (!categoryId) return;
		const requestVersion = ++loadVersion;
		loading = true;
		loadError = '';
		try {
			const params = new URLSearchParams();
			if (search.trim()) params.set('q', search.trim());
			params.set('tier', selectedQualityTier);
			const response = await fetch(
				`/api/admin/boosting-mappings/${categoryId}?${params.toString()}`
			);
			const payload = await response.json();
			if (requestVersion !== loadVersion) return;
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Supplier routes could not be loaded.');
			}
			workspace = payload.data as BoostMappingWorkspace;
			if (!options.keepDrafts) {
				offerDraft = workspace.offer ?? defaultOffer(workspace);
				routeDrafts = workspace.candidates
					.filter((candidate) => candidate.mappedRoute)
					.map((candidate) => ({ ...candidate.mappedRoute! }));
			}
		} catch (error) {
			if (requestVersion !== loadVersion) return;
			loadError = error instanceof Error ? error.message : 'Supplier routes could not be loaded.';
		} finally {
			if (requestVersion === loadVersion) loading = false;
		}
	}

	async function chooseCategory(categoryId: string): Promise<void> {
		if (categoryId === selectedCategoryId && workspace) {
			await revealWorkspace();
			return;
		}
		selectedCategoryId = categoryId;
		selectedQualityTier = 'value';
		workspace = null;
		offerDraft = null;
		routeDrafts = [];
		search = '';
		await loadWorkspace();
		if (selectedCategoryId === categoryId) await revealWorkspace();
	}

	async function revealWorkspace(): Promise<void> {
		await tick();
		if (!window.matchMedia('(max-width: 1279px)').matches) return;
		workspacePanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		workspacePanel?.focus({ preventScroll: true });
	}

	function toggleRoute(candidate: BoostMappingCandidate): void {
		const existing = routeByServiceId.get(candidate.id);
		if (existing) {
			routeDrafts = routeDrafts.filter((route) => route.providerServiceId !== candidate.id);
			if (offerDraft?.preferredProviderServiceId === candidate.id) {
				offerDraft.preferredProviderServiceId = null;
			}
			if (offerDraft?.lockedProviderServiceId === candidate.id) {
				offerDraft.lockedProviderServiceId = null;
			}
			return;
		}
		routeDrafts = [
			...routeDrafts,
			{
				providerServiceId: candidate.id,
				state: 'shadow',
				equivalenceApproved: false,
				verifiedSignals: [],
				audienceTags: [],
				verifiedRefillDays: null,
				maximumPilotQuantity: workspace?.category.minQuantity ?? null,
				expectedRecoveryCostPercent: 5
			}
		];
	}

	function updateRoute(providerServiceId: string, updates: Partial<BoostMappingRouteDraft>): void {
		routeDrafts = routeDrafts.map((route) =>
			route.providerServiceId === providerServiceId ? { ...route, ...updates } : route
		);
	}

	function markPromiseChecked(candidate: BoostMappingCandidate, checked: boolean): void {
		if (!offerDraft) return;
		const signals = [
			...(workspace?.category.refillDays ? ['refill_verified'] : []),
			...(offerDraft.qualityTier === 'stable' || offerDraft.qualityTier === 'premium'
				? ['stability_verified']
				: []),
			...(offerDraft.qualityTier === 'premium' ? ['premium_quality_verified'] : [])
		];
		updateRoute(candidate.id, {
			equivalenceApproved: checked,
			state: checked ? (routeByServiceId.get(candidate.id)?.state ?? 'shadow') : 'shadow',
			verifiedSignals: checked ? signals : [],
			verifiedRefillDays: checked ? (workspace?.category.refillDays ?? null) : null
		});
	}

	function choosePolicyService(candidateId: string): void {
		if (!offerDraft) return;
		if (offerDraft.routingPolicy === 'preferred') {
			offerDraft.preferredProviderServiceId = candidateId;
			offerDraft.lockedProviderServiceId = null;
		} else if (offerDraft.routingPolicy === 'locked') {
			offerDraft.lockedProviderServiceId = candidateId;
			offerDraft.preferredProviderServiceId = null;
		}
	}

	function changePolicy(policy: BoostMappingOfferDraft['routingPolicy']): void {
		if (!offerDraft) return;
		offerDraft.routingPolicy = policy;
		if (policy !== 'preferred') offerDraft.preferredProviderServiceId = null;
		if (policy !== 'locked') offerDraft.lockedProviderServiceId = null;
	}

	async function changeQualityTier(qualityTier: string): Promise<void> {
		if (!['value', 'stable', 'premium'].includes(qualityTier)) return;
		if (selectedQualityTier === qualityTier && workspace) return;
		selectedQualityTier = qualityTier as 'value' | 'stable' | 'premium';
		workspace = null;
		offerDraft = null;
		routeDrafts = [];
		await loadWorkspace();
	}

	async function saveMapping(): Promise<void> {
		if (!offerDraft || !workspace?.foundationReady || saving) return;
		saving = true;
		try {
			const response = await fetch(`/api/admin/boosting-mappings/${selectedCategoryId}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ offer: offerDraft, routes: routeDrafts })
			});
			const payload = await response.json();
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'The supplier mapping could not be saved.');
			}
			workspace = payload.data as BoostMappingWorkspace;
			offerDraft = workspace.offer ?? defaultOffer(workspace);
			routeDrafts = workspace.candidates
				.filter((candidate) => candidate.mappedRoute)
				.map((candidate) => ({ ...candidate.mappedRoute! }));
			showSuccess(
				'Mapping saved',
				'Only the internal route plan changed. No supplier order was submitted.'
			);
		} catch (error) {
			showError(
				'Could not save mapping',
				error instanceof Error ? error.message : 'Please try again.'
			);
		} finally {
			saving = false;
		}
	}

	function money(value: number): string {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN',
			maximumFractionDigits: 0
		}).format(value);
	}

	onMount(() => {
		selectedCategoryId = data.offers[0]?.id ?? '';
		void loadWorkspace();
	});
</script>

<svelte:head>
	<title>Boosting Route Map | Admin</title>
</svelte:head>

<div class="space-y-6">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-xs font-semibold tracking-[0.14em] uppercase" style="color: var(--primary);">
				Internal only
			</p>
			<h1 class="mt-1 flex items-center gap-2 text-2xl font-bold" style="color: var(--text);">
				<Zap size={24} /> Route customer offers
			</h1>
			<p class="mt-1 max-w-2xl text-sm" style="color: var(--text-muted);">
				Customers see one simple option. You quietly approve the safe supplier choices behind it.
			</p>
			<p class="mt-2 text-xs" style="color: var(--text-dim);">
				{data.mappingSummary.tiers} hidden choices prepared · {data.mappingSummary.reviewedTiers}
				reviewed · {data.mappingSummary.approvedRoutes} promise-checked routes
			</p>
		</div>
		<a
			href="/admin/boosting-preview"
			class="flex items-center gap-1 text-sm font-semibold"
			style="color: var(--link);"
		>
			Customer preview <ChevronRight size={15} />
		</a>
	</header>

	<div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
		<aside
			class="h-fit overflow-hidden rounded-2xl border"
			style="border-color: var(--border); background: var(--bg-elev-1);"
		>
			<div class="border-b p-4" style="border-color: var(--border);">
				<p class="font-semibold" style="color: var(--text);">Customer offers</p>
				<p class="mt-0.5 text-xs" style="color: var(--text-muted);">
					Pick a result, then review its 2–3 simple choices
				</p>
			</div>
			<div class="max-h-[45vh] overflow-y-auto p-2 xl:max-h-[68vh]">
				{#each data.offers as item (item.id)}
					{@const selected = selectedCategoryId === item.id}
					<button
						type="button"
						onclick={() => chooseCategory(item.id)}
						aria-pressed={selected}
						class="mb-1 w-full rounded-xl border p-3 text-left transition-colors"
						style={selected
							? 'border-color: var(--primary); background: rgba(16,185,129,.09);'
							: 'border-color: transparent; background: transparent;'}
					>
						<div class="flex items-start justify-between gap-2">
							<span class="text-sm font-semibold" style="color: var(--text);">{item.name}</span>
							<span class="flex shrink-0 items-center gap-1">
								{#if item.isGeneratedDraft}
									<span class="text-[10px]" style="color: #fbbf24;">Draft</span>
								{:else if !item.isActive}
									<span class="text-[10px]" style="color: var(--text-dim);">Inactive</span>
								{/if}
								{#if selected && loading}
									<RefreshCcw class="animate-spin" size={15} style="color: var(--primary);" />
								{:else if selected}
									<Check size={16} style="color: var(--primary);" />
								{:else}
									<ChevronRight size={16} style="color: var(--text-dim);" />
								{/if}
							</span>
						</div>
						<p class="mt-1 text-xs" style="color: var(--text-muted);">
							{item.platformLabel} · {item.outcomeLabel}
						</p>
						<p class="mt-1 text-[10px]" style="color: var(--text-dim);">
							{item.reviewedTierCount}/{item.tierCount} choices reviewed · {item.approvedRouteCount}
							routes checked
						</p>
					</button>
				{/each}
			</div>
		</aside>

		<main
			bind:this={workspacePanel}
			tabindex="-1"
			class="min-w-0 scroll-mt-4 space-y-5 outline-none"
		>
			{#if loading && !workspace}
				<div
					class="flex min-h-64 items-center justify-center rounded-2xl border"
					style="border-color: var(--border); color: var(--text-muted);"
				>
					<RefreshCcw class="mr-2 animate-spin" size={18} /> Loading routes…
				</div>
			{:else if loadError}
				<div class="rounded-2xl border p-5" style="border-color: #7f1d1d; color: #fca5a5;">
					<div class="flex items-start gap-2"><AlertTriangle size={18} /> {loadError}</div>
					<button class="mt-4 text-sm font-semibold underline" onclick={() => loadWorkspace()}
						>Try again</button
					>
				</div>
			{:else if workspace && !workspace.foundationReady}
				<div
					class="rounded-2xl border p-5"
					style="border-color: #854d0e; background: rgba(245,158,11,.07);"
				>
					<div class="flex items-start gap-3">
						<AlertTriangle class="mt-0.5 shrink-0" size={20} style="color: #fbbf24;" />
						<div>
							<h2 class="font-semibold" style="color: var(--text);">Database step still pending</h2>
							<p class="mt-1 text-sm" style="color: var(--text-muted);">
								{workspace.migrationMessage}
							</p>
							<p class="mt-2 text-xs" style="color: var(--text-dim);">
								This screen stays read-only until that deliberate deployment step is complete.
							</p>
						</div>
					</div>
				</div>
			{:else if workspace && offerDraft}
				<section
					class="rounded-2xl border p-4 sm:p-5"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<h2 class="text-lg font-bold" style="color: var(--text);">
								{selectedListItem?.name}
							</h2>
							<p class="mt-1 text-sm" style="color: var(--text-muted);">
								{workspace.category.minQuantity.toLocaleString()} minimum · {money(
									minimumCustomerPrice
								)} customer price
							</p>
						</div>
						<span
							class="rounded-full px-2.5 py-1 text-xs font-semibold"
							style="background: rgba(16,185,129,.1); color: var(--primary);"
						>
							{routeDrafts.length} route{routeDrafts.length === 1 ? '' : 's'} selected
						</span>
					</div>

					<div class="mt-5 grid gap-4 md:grid-cols-2">
						<label class="text-xs font-semibold" style="color: var(--text-muted);">
							Customer option name
							<input bind:value={offerDraft.customerName} class="field mt-1" maxlength="80" />
						</label>
						<label class="text-xs font-semibold" style="color: var(--text-muted);">
							Simple promise
							<input bind:value={offerDraft.shortPromise} class="field mt-1" maxlength="120" />
						</label>
						<label class="text-xs font-semibold" style="color: var(--text-muted);">
							Customer choice
							<select
								value={offerDraft.qualityTier}
								onchange={(event) => changeQualityTier(event.currentTarget.value)}
								class="field mt-1"
							>
								<option value="value">Affordable</option>
								<option value="stable">More stable</option>
								<option value="premium">Premium</option>
							</select>
						</label>
						<label class="text-xs font-semibold" style="color: var(--text-muted);">
							Routing
							<select
								value={offerDraft.routingPolicy}
								onchange={(event) =>
									changePolicy(
										event.currentTarget.value as BoostMappingOfferDraft['routingPolicy']
									)}
								class="field mt-1"
							>
								<option value="automatic">Automatic — cheapest safe route</option>
								<option value="preferred">Prefer one, then safe fallback</option>
								<option value="locked">Lock to one — never switch</option>
							</select>
						</label>
						<label class="text-xs font-semibold" style="color: var(--text-muted);">
							Internal status
							<select bind:value={offerDraft.status} class="field mt-1">
								<option value="hidden">Hidden draft</option>
								<option value="reviewed">Ready for customer-flow connection</option>
							</select>
						</label>
						<label class="text-xs font-semibold" style="color: var(--text-muted);">
							Price per {workspace.category.stepQuantity.toLocaleString()}
							<input
								bind:value={offerDraft.pricePerStepNgn}
								class="field mt-1"
								type="number"
								min="50"
								step="50"
							/>
						</label>
					</div>

					<details class="mt-4 rounded-xl border p-3" style="border-color: var(--border);">
						<summary class="cursor-pointer text-sm font-semibold" style="color: var(--text);">
							Cost safety
						</summary>
						<div class="mt-3 grid gap-3 sm:grid-cols-4">
							<label class="text-xs" style="color: var(--text-muted);"
								>Minimum margin %<input
									class="field mt-1"
									type="number"
									min="0"
									max="95"
									bind:value={offerDraft.minimumMarginPercent}
								/></label
							>
							<label class="text-xs" style="color: var(--text-muted);"
								>Normal cost ₦<input
									class="field mt-1"
									type="number"
									min="0"
									bind:value={offerDraft.normalCostTargetNgn}
								/></label
							>
							<label class="text-xs" style="color: var(--text-muted);"
								>Never spend over ₦<input
									class="field mt-1"
									type="number"
									min="1"
									bind:value={offerDraft.maximumSupplierCostNgn}
								/></label
							>
							<label class="text-xs" style="color: var(--text-muted);"
								>Maximum attempts<select class="field mt-1" bind:value={offerDraft.attemptCap}
									><option value={1}>1</option><option value={2}>2</option></select
								></label
							>
						</div>
					</details>
				</section>

				<section
					class="rounded-2xl border"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<div
						class="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5"
						style="border-color: var(--border);"
					>
						<div>
							<h2 class="font-bold" style="color: var(--text);">Safe supplier candidates</h2>
							<p class="mt-0.5 text-xs" style="color: var(--text-muted);">
								{workspace.candidateCount.toLocaleString()} compatible rows · showing up to 80
							</p>
						</div>
						<form
							class="flex min-w-0 gap-2"
							onsubmit={(event) => {
								event.preventDefault();
								void loadWorkspace({ keepDrafts: true });
							}}
						>
							<label class="relative min-w-0">
								<Search class="absolute top-2.5 left-3" size={16} style="color: var(--text-dim);" />
								<input
									bind:value={search}
									placeholder="Search supplier rows"
									class="field max-w-56 pl-9"
								/>
							</label>
							<button
								class="rounded-xl border px-3 text-sm font-semibold"
								style="border-color: var(--border); color: var(--text);">Find</button
							>
						</form>
					</div>

					<div class="grid gap-3 p-3 sm:p-4">
						{#each workspace.candidates as candidate (candidate.id)}
							{@const route = routeByServiceId.get(candidate.id)}
							<article
								class="rounded-xl border p-3 sm:p-4"
								style={route
									? 'border-color: rgba(16,185,129,.55); background: rgba(16,185,129,.045);'
									: 'border-color: var(--border); background: var(--bg);'}
							>
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-2">
											<span
												class="rounded-full px-2 py-0.5 text-[10px] font-bold"
												style="background: rgba(139,92,246,.13); color: #c4b5fd;"
												>{candidate.providerLabel}</span
											>
											<span class="text-xs" style="color: var(--text-dim);"
												>#{candidate.serviceId}</span
											>
										</div>
										<h3 class="mt-1 text-sm font-semibold break-words" style="color: var(--text);">
											{candidate.name}
										</h3>
										<p class="mt-1 text-xs" style="color: var(--text-muted);">
											${candidate.ratePerThousand.toFixed(4)} / 1,000 · {candidate.minQuantity.toLocaleString()}–{candidate.maxQuantity.toLocaleString()}
										</p>
									</div>
									<button
										type="button"
										onclick={() => toggleRoute(candidate)}
										class="rounded-full px-3 py-1.5 text-xs font-bold"
										style={route
											? 'background: rgba(239,68,68,.1); color: #fca5a5;'
											: 'background: var(--primary); color: #00150b;'}
									>
										{route ? 'Remove' : 'Use this route'}
									</button>
								</div>

								<div class="mt-2 flex flex-wrap gap-1.5">
									{#if candidate.refillAdvertised}<span class="tag">Refill advertised</span>{/if}
									{#if candidate.cancelAdvertised}<span class="tag">Cancel advertised</span>{/if}
									{#if candidate.dripfeedAdvertised}<span class="tag">Drip-feed</span>{/if}
									<span class="tag">{candidate.catalogueStatus.replaceAll('_', ' ')}</span>
								</div>

								{#if route}
									<div
										class="mt-4 grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-[1fr_160px_160px_150px] lg:items-end"
										style="border-color: var(--border);"
									>
										<label
											class="flex items-center gap-2 text-xs font-semibold"
											style="color: var(--text);"
										>
											<input
												type="checkbox"
												checked={route.equivalenceApproved}
												onchange={(event) =>
													markPromiseChecked(candidate, event.currentTarget.checked)}
											/>
											Promise checked
										</label>
										<label class="text-xs" style="color: var(--text-muted);"
											>Route mode<select
												class="field mt-1"
												value={route.state}
												onchange={(event) =>
													updateRoute(candidate.id, {
														state: event.currentTarget.value as BoostMappingRouteDraft['state']
													})}
											>
												<option value="shadow">Shadow only</option>
												<option value="enabled" disabled={!route.equivalenceApproved}
													>Pilot enabled</option
												>
											</select></label
										>
										<label class="text-xs" style="color: var(--text-muted);"
											>Pilot limit<input
												type="number"
												class="field mt-1"
												min="1"
												value={route.maximumPilotQuantity ?? ''}
												onchange={(event) =>
													updateRoute(candidate.id, {
														maximumPilotQuantity: event.currentTarget.value
															? Number(event.currentTarget.value)
															: null
													})}
											/></label
										>
										<label class="text-xs" style="color: var(--text-muted);"
											>Recovery buffer %<input
												type="number"
												class="field mt-1"
												min="0"
												max="100"
												value={route.expectedRecoveryCostPercent}
												onchange={(event) =>
													updateRoute(candidate.id, {
														expectedRecoveryCostPercent: Number(event.currentTarget.value)
													})}
											/></label
										>
									</div>
									{#if offerDraft.routingPolicy !== 'automatic'}
										<label
											class="mt-3 flex items-center gap-2 text-xs font-semibold"
											style="color: var(--text);"
										>
											<input
												type="radio"
												name="policy-route"
												checked={(offerDraft.routingPolicy === 'preferred'
													? offerDraft.preferredProviderServiceId
													: offerDraft.lockedProviderServiceId) === candidate.id}
												disabled={!route.equivalenceApproved || route.state !== 'enabled'}
												onchange={() => choosePolicyService(candidate.id)}
											/>
											{offerDraft.routingPolicy === 'locked'
												? 'Lock orders to this service'
												: 'Prefer this service'}
										</label>
									{/if}
								{/if}
							</article>
						{/each}
						{#if workspace.candidates.length === 0}
							<p class="py-8 text-center text-sm" style="color: var(--text-muted);">
								No compatible supplier rows found.
							</p>
						{/if}
					</div>
				</section>

				<section
					class="grid gap-4 rounded-2xl border p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<div>
						<div class="flex items-center gap-2">
							{#if selectedEstimate}<ShieldCheck
									size={19}
									style="color: var(--primary);"
								/>{:else}<AlertTriangle size={19} style="color: #fbbf24;" />{/if}
							<h2 class="font-bold" style="color: var(--text);">Route estimate</h2>
						</div>
						{#if selectedEstimate}
							<p class="mt-1 text-sm" style="color: var(--text-muted);">
								{selectedEstimate.service.providerLabel} #{selectedEstimate.service.serviceId} · about
								{money(selectedEstimate.supplierCost)} cost · {selectedEstimate.marginPercent.toFixed(
									0
								)}% projected margin
							</p>
						{:else}
							<p class="mt-1 text-sm" style="color: var(--text-muted);">
								No enabled route currently passes the promise, quantity, cost and margin checks.
							</p>
						{/if}
						<p class="mt-1 text-[11px]" style="color: var(--text-dim);">
							Estimate uses {money(workspace.configuredFxNgnPerUsd)} per USD plus a
							{workspace.configuredCurrencyBufferPercent}% currency buffer. The live router rechecks
							balance, freshness and reliability.
						</p>
						{#if offerDraft.routingPolicy === 'locked'}
							<p class="mt-2 flex items-center gap-1.5 text-xs" style="color: #fbbf24;">
								<Lock size={14} /> If this route is unavailable, orders wait for review. We never switch
								silently.
							</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={saveMapping}
						disabled={saving}
						class="flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-60"
						style="background: var(--primary); color: #00150b;"
					>
						<Save size={17} />
						{saving ? 'Saving…' : 'Save internal map'}
					</button>
				</section>
			{/if}
		</main>
	</div>
</div>

<style>
	.field {
		width: 100%;
		min-height: 2.65rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		background: var(--bg);
		padding: 0.55rem 0.75rem;
		font-size: 0.875rem;
		color: var(--text);
		outline: none;
	}
	.field:focus {
		border-color: var(--primary);
	}
	.tag {
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.2rem 0.5rem;
		font-size: 0.65rem;
		color: var(--text-muted);
	}
	input[type='checkbox'],
	input[type='radio'] {
		accent-color: var(--primary);
	}
</style>
