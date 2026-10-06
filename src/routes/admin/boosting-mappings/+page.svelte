<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		AlertTriangle,
		Check,
		ChevronRight,
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
	import { roundCatalogPriceNgn } from '$lib/helpers/catalog-pricing';
	import { showError, showSuccess } from '$lib/stores/toasts';
	import type { PageData } from './$types';

	type QualityTier = 'value' | 'stable' | 'premium';
	type SetupMode = 'choice' | 'smart';
	type FallbackMode = 'none' | 'automatic' | 'manual';
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
	let selectedPlatform = $state('');
	let selectedCategoryId = $state('');
	let selectedQualityTier = $state<QualityTier>('value');
	let workspace = $state<BoostMappingWorkspace | null>(null);
	let offerDraft = $state<BoostMappingOfferDraft | null>(null);
	let routeDrafts = $state<BoostMappingRouteDraft[]>([]);
	let knownCandidates = $state<BoostMappingCandidate[]>([]);
	let setupMode = $state<SetupMode>('choice');
	let fallbackMode = $state<FallbackMode>('none');
	let provider = $state<Provider>('smm_raja');
	let serviceCode = $state('');
	let lookupResult = $state<BoostServiceLookupResult | null>(null);
	let loading = $state(false);
	let lookupLoading = $state(false);
	let smartLoading = $state(false);
	let smartSelectionOffset = $state(0);
	let saving = $state(false);
	let pricingSaving = $state(false);
	let loadError = $state('');
	let workspacePanel = $state<HTMLElement | null>(null);
	let loadVersion = 0;

	const selectedListItem = $derived(data.offers.find((item) => item.id === selectedCategoryId));
	const platformOptions = $derived.by(() => {
		const labels: Record<string, string> = {};
		for (const offer of data.offers) labels[offer.platform] = offer.platformLabel;
		return Object.entries(labels).map(([value, label]) => ({ value, label }));
	});
	const platformOffers = $derived(
		data.offers.filter((offer) => offer.platform === selectedPlatform)
	);
	const routeByServiceId = $derived(
		new Map(routeDrafts.map((route) => [route.providerServiceId, route]))
	);
	const candidateById = $derived(
		new Map(knownCandidates.map((candidate) => [candidate.id, candidate]))
	);
	const included = $derived(Boolean(offerDraft && offerDraft.status !== 'hidden'));
	const smartAutoPrepared = $derived(
		Boolean(offerDraft?.routingPolicy === 'automatic' && routeDrafts.length > 0)
	);
	const minimumCustomerPrice = $derived(
		offerDraft
			? roundCatalogPriceNgn(
					(offerDraft.minQuantity / offerDraft.stepQuantity) * offerDraft.pricePerStepNgn
				)
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
	const pricingCandidate = $derived.by(() => {
		if (offerDraft?.routingPolicy !== 'automatic') return primaryCandidate;
		return routeDrafts
			.map((route) => candidateById.get(route.providerServiceId))
			.filter((candidate): candidate is BoostMappingCandidate => Boolean(candidate))
			.reduce<BoostMappingCandidate | null>(
				(highest, candidate) =>
					!highest || candidate.ratePerThousand > highest.ratePerThousand ? candidate : highest,
				null
			);
	});
	const estimatedSupplierCost = $derived.by(() => {
		if (!workspace || !offerDraft || !pricingCandidate) return 0;
		return (
			(pricingCandidate.ratePerThousand *
				offerDraft.minQuantity *
				workspace.configuredFxNgnPerUsd) /
			1000
		);
	});
	const estimatedSupplierCostUsd = $derived(
		offerDraft && pricingCandidate
			? (pricingCandidate.ratePerThousand * offerDraft.minQuantity) / 1000
			: 0
	);
	const rawTargetMinimumPrice = $derived.by(() => {
		if (!offerDraft || estimatedSupplierCost <= 0) return 0;
		const profitOnCost = Math.min(500, Math.max(0, Number(offerDraft.minimumMarginPercent)));
		return estimatedSupplierCost * (1 + profitOnCost / 100);
	});
	const roundedTargetMinimumPrice = $derived(
		rawTargetMinimumPrice > 0 ? round50(rawTargetMinimumPrice) : 0
	);
	const suggestedPricePerStep = $derived.by(() => {
		if (!offerDraft || roundedTargetMinimumPrice <= 0) return 0;
		return round50((roundedTargetMinimumPrice * offerDraft.stepQuantity) / offerDraft.minQuantity);
	});
	const suggestedMinimumPrice = $derived(
		offerDraft && suggestedPricePerStep > 0
			? roundCatalogPriceNgn(
					(offerDraft.minQuantity / offerDraft.stepQuantity) * suggestedPricePerStep
				)
			: 0
	);
	const hardMaximumSpend = $derived(
		Math.max(
			1,
			Math.floor(
				minimumCustomerPrice /
					(1 + Math.max(0, Number(offerDraft?.minimumMarginPercent || 0)) / 100)
			)
		)
	);
	const projectedMarginPercent = $derived(
		minimumCustomerPrice > 0 && estimatedSupplierCost > 0
			? ((minimumCustomerPrice - estimatedSupplierCost) / estimatedSupplierCost) * 100
			: 0
	);
	const targetMarginPercent = $derived(Math.max(0, Number(offerDraft?.minimumMarginPercent || 0)));
	const currentPriceMeetsTarget = $derived(
		estimatedSupplierCost <= 0 || projectedMarginPercent + 0.01 >= targetMarginPercent
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

	function refillLabel(candidate: BoostMappingCandidate): string {
		if (candidate.refillDaysClaimed)
			return `${candidate.refillDaysClaimed}-day refill named by supplier`;
		return candidate.refillAdvertised ? 'Refill advertised' : 'No refill advertised';
	}

	function missingRouteSignals(route: BoostMappingRouteDraft): string[] {
		if (!offerDraft) return [];
		const required = [
			...(offerDraft.refillDays ? ['refill_verified'] : []),
			...(selectedQualityTier === 'stable' || selectedQualityTier === 'premium'
				? ['stability_verified']
				: []),
			...(selectedQualityTier === 'premium' ? ['premium_quality_verified'] : [])
		];
		return required.filter((signal) => !route.verifiedSignals.includes(signal));
	}

	function signalLabel(signal: string): string {
		if (signal === 'refill_verified') return 'the promised refill period';
		if (signal === 'premium_quality_verified') return 'premium-quality evidence';
		return 'stability evidence';
	}

	function defaultOffer(next: BoostMappingWorkspace): BoostMappingOfferDraft {
		const tier = next.selectedQualityTier;
		const minimumPrice = Math.max(
			50,
			(next.category.minQuantity / next.category.stepQuantity) * next.category.pricePerStepNgn
		);
		const margin = next.configuredDefaultMarginPercent;
		const maximumSupplierCost = Math.max(
			1,
			Math.floor(minimumPrice / (1 + Math.max(0, margin) / 100))
		);
		return {
			qualityTier: tier,
			customerName: TIER_COPY[tier].name,
			shortPromise: TIER_COPY[tier].promise,
			// A refill period becomes a customer promise only after the selected route(s) prove it.
			refillDays: null,
			minQuantity: next.category.minQuantity,
			maxQuantity: null,
			stepQuantity: next.category.stepQuantity,
			pricePerStepNgn: Math.max(50, next.category.pricePerStepNgn),
			priceLocked: false,
			minimumMarginPercent: margin,
			normalCostTargetNgn: maximumSupplierCost,
			maximumSupplierCostNgn: maximumSupplierCost,
			attemptCap: 1,
			fallbackMode: 'none',
			status: 'hidden',
			routingPolicy: 'locked',
			preferredProviderServiceId: null,
			lockedProviderServiceId: null
		};
	}

	function mergeCandidates(...groups: BoostMappingCandidate[][]): void {
		const byId: Record<string, BoostMappingCandidate> = Object.fromEntries(
			knownCandidates.map((candidate) => [candidate.id, candidate])
		);
		for (const candidate of groups.flat()) byId[candidate.id] = candidate;
		knownCandidates = Object.values(byId);
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
			fallbackMode = offerDraft.fallbackMode;
		} catch (error) {
			if (requestVersion !== loadVersion) return;
			loadError = error instanceof Error ? error.message : 'This result could not be loaded.';
		} finally {
			if (requestVersion === loadVersion) loading = false;
		}
	}

	async function chooseCategory(categoryId: string): Promise<void> {
		const nextCategory = data.offers.find((item) => item.id === categoryId);
		if (nextCategory) selectedPlatform = nextCategory.platform;
		selectedCategoryId = categoryId;
		selectedQualityTier = 'value';
		workspace = null;
		offerDraft = null;
		routeDrafts = [];
		fallbackMode = 'none';
		knownCandidates = [];
		smartSelectionOffset = 0;
		serviceCode = '';
		await loadWorkspace();
		await tick();
		if (window.matchMedia('(max-width: 1279px)').matches) {
			workspacePanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	async function changePlatform(platform: string): Promise<void> {
		selectedPlatform = platform;
		const firstOffer = data.offers.find((offer) => offer.platform === platform);
		if (firstOffer) await chooseCategory(firstOffer.id);
	}

	async function changeQualityTier(tier: QualityTier): Promise<void> {
		if (selectedQualityTier === tier && workspace) return;
		selectedQualityTier = tier;
		workspace = null;
		offerDraft = null;
		routeDrafts = [];
		fallbackMode = 'none';
		knownCandidates = [];
		smartSelectionOffset = 0;
		serviceCode = '';
		await loadWorkspace();
	}

	function routeFor(candidate: BoostMappingCandidate, ownerTested = false): BoostMappingRouteDraft {
		const candidateSignals = new Set(candidate.qualitySignals);
		const verifiedSignals = new Set([
			...(offerDraft?.refillDays &&
			(ownerTested ||
				(candidate.refillDaysClaimed !== null &&
					candidate.refillDaysClaimed >= offerDraft.refillDays))
				? ['refill_verified']
				: []),
			...((ownerTested &&
				(selectedQualityTier === 'stable' || selectedQualityTier === 'premium')) ||
			candidate.refillAdvertised ||
			candidateSignals.has('stability_claim') ||
			candidateSignals.has('refill_claim')
				? ['stability_verified']
				: []),
			...((ownerTested && selectedQualityTier === 'premium') ||
			candidateSignals.has('quality_claim')
				? ['premium_quality_verified']
				: [])
		]);
		return {
			providerServiceId: candidate.id,
			state: 'shadow',
			equivalenceApproved: true,
			verifiedSignals: [...verifiedSignals],
			audienceTags: [],
			verifiedRefillDays:
				offerDraft?.refillDays &&
				(ownerTested ||
					(candidate.refillDaysClaimed !== null &&
						candidate.refillDaysClaimed >= offerDraft.refillDays))
					? offerDraft.refillDays
					: null,
			maximumPilotQuantity: offerDraft?.minQuantity ?? workspace?.category.minQuantity ?? null,
			expectedRecoveryCostPercent: 0
		};
	}

	function useCandidate(candidate: BoostMappingCandidate, purpose: 'primary' | 'fallback'): void {
		if (!offerDraft) return;
		const nextRefillDays =
			purpose === 'primary'
				? selectedQualityTier === 'value'
					? null
					: candidate.refillDaysClaimed
				: offerDraft.refillDays;
		mergeCandidates([candidate]);
		if (purpose === 'primary') {
			// Supplier catalogues expose minimum and maximum quantities, but no separate increment.
			// Start with the supplier minimum as both values; the owner can then choose a smaller
			// customer-facing increment without weakening the supplier minimum guard.
			offerDraft.minQuantity = candidate.minQuantity;
			offerDraft.stepQuantity = candidate.minQuantity;
			// Never promise a refill period that the selected supplier service does not state.
			offerDraft.refillDays = nextRefillDays;
			routeDrafts = [routeFor(candidate, true)];
			offerDraft.routingPolicy = 'locked';
			offerDraft.lockedProviderServiceId = candidate.id;
			offerDraft.preferredProviderServiceId = null;
			offerDraft.fallbackMode = 'none';
			fallbackMode = 'none';
		} else {
			if (!primaryCandidate) return;
			if (candidate.ratePerThousand > primaryCandidate.ratePerThousand) {
				showError(
					'Fallback costs too much',
					'A fallback must cost the same as the primary service or less.'
				);
				return;
			}
			const primaryRoute = routeByServiceId.get(primaryCandidate.id) ?? routeFor(primaryCandidate);
			routeDrafts = [primaryRoute, routeFor(candidate, true)];
			offerDraft.routingPolicy = 'preferred';
			offerDraft.preferredProviderServiceId = primaryCandidate.id;
			offerDraft.lockedProviderServiceId = null;
			fallbackMode = 'manual';
			offerDraft.fallbackMode = 'manual';
		}
		setupMode = 'choice';
		if (offerDraft.status === 'hidden') offerDraft.status = 'reviewed';
		if (!offerDraft.priceLocked) queueMicrotask(useSuggestedPrice);
	}

	async function changeFallbackMode(mode: FallbackMode): Promise<void> {
		if (!offerDraft || !primaryCandidate) return;
		const primary = primaryCandidate;
		const primaryRoute = routeByServiceId.get(primary.id) ?? routeFor(primary);
		fallbackMode = mode;
		offerDraft.fallbackMode = mode;
		routeDrafts = [primaryRoute];
		offerDraft.routingPolicy = 'locked';
		offerDraft.lockedProviderServiceId = primary.id;
		offerDraft.preferredProviderServiceId = null;
		lookupResult = null;
		serviceCode = '';
		if (mode !== 'automatic') return;

		smartLoading = true;
		try {
			const params = new URLSearchParams({
				categoryId: selectedCategoryId,
				mode: 'smart',
				tier: selectedQualityTier,
				maximumRatePerThousand: String(primary.ratePerThousand)
			});
			const response = await fetch(`/api/admin/boosting-suppliers/service?${params}`);
			const payload = await response.json();
			if (!response.ok || !payload?.success)
				throw new Error(payload?.error || 'No fallback found.');
			const fallbacks = ((payload.data || []) as BoostMappingCandidate[])
				.filter((candidate) => candidate.id !== primary.id)
				.filter(
					(candidate) =>
						!offerDraft?.refillDays ||
						(candidate.refillDaysClaimed !== null &&
							candidate.refillDaysClaimed >= offerDraft.refillDays)
				)
				.slice(0, 3);
			if (!fallbacks.length) {
				fallbackMode = 'none';
				offerDraft.fallbackMode = 'none';
				throw new Error('No compatible fallback at the same supplier price or less is available.');
			}
			mergeCandidates(fallbacks);
			routeDrafts = [primaryRoute, ...fallbacks.map((candidate) => routeFor(candidate))];
			offerDraft.routingPolicy = 'preferred';
			offerDraft.preferredProviderServiceId = primary.id;
			offerDraft.lockedProviderServiceId = null;
			offerDraft.fallbackMode = 'automatic';
			showSuccess(
				'Automatic fallback ready',
				`${fallbacks.length} safe lower-cost route${fallbacks.length === 1 ? '' : 's'} added.`
			);
		} catch (error) {
			showError(
				'Could not prepare fallback',
				error instanceof Error ? error.message : 'Please try again.'
			);
		} finally {
			smartLoading = false;
		}
	}

	function removeRoute(serviceId: string): void {
		if (!offerDraft) return;
		routeDrafts = routeDrafts.filter((route) => route.providerServiceId !== serviceId);
		const first = routeDrafts[0]?.providerServiceId ?? null;
		if (routeDrafts.length <= 1) {
			fallbackMode = 'none';
			offerDraft.fallbackMode = 'none';
			offerDraft.routingPolicy = 'locked';
			offerDraft.lockedProviderServiceId = first;
			offerDraft.preferredProviderServiceId = null;
			offerDraft.fallbackMode = 'none';
		} else {
			offerDraft.routingPolicy = 'preferred';
			offerDraft.preferredProviderServiceId = first;
			offerDraft.lockedProviderServiceId = null;
			offerDraft.fallbackMode = fallbackMode;
		}
	}

	function clearSelectedRoutes(): void {
		if (!offerDraft) return;
		routeDrafts = [];
		fallbackMode = 'none';
		offerDraft.routingPolicy = 'locked';
		offerDraft.lockedProviderServiceId = null;
		offerDraft.preferredProviderServiceId = null;
		offerDraft.fallbackMode = 'none';
		lookupResult = null;
		serviceCode = '';
	}

	async function findService(): Promise<void> {
		if (!serviceCode.trim() || lookupLoading) return;
		lookupLoading = true;
		lookupResult = null;
		try {
			const params = new URLSearchParams({
				categoryId: selectedCategoryId,
				provider,
				code: serviceCode.trim(),
				tier: selectedQualityTier
			});
			const response = await fetch(`/api/admin/boosting-suppliers/service?${params}`);
			const payload = await response.json();
			if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Lookup failed.');
			lookupResult = payload.data as BoostServiceLookupResult;
			if (lookupResult.service) mergeCandidates([lookupResult.service]);
		} catch (error) {
			showError(
				'Could not find service',
				error instanceof Error ? error.message : 'Please try again.'
			);
		} finally {
			lookupLoading = false;
		}
	}

	async function useSmartAuto(refresh = false): Promise<void> {
		if (!offerDraft || smartLoading) return;
		smartLoading = true;
		try {
			const nextSelectionOffset = refresh ? smartSelectionOffset + 1 : 0;
			const params = new URLSearchParams({
				categoryId: selectedCategoryId,
				mode: 'smart',
				tier: selectedQualityTier,
				selectionOffset: String(nextSelectionOffset)
			});
			const response = await fetch(`/api/admin/boosting-suppliers/service?${params}`);
			const payload = await response.json();
			if (!response.ok || !payload?.success)
				throw new Error(payload?.error || 'No shortlist found.');
			const candidates = (payload.data || []) as BoostMappingCandidate[];
			if (!candidates.length) throw new Error('No compatible supplier services are available.');
			mergeCandidates(candidates);
			offerDraft.minQuantity = candidates[0].minQuantity;
			offerDraft.stepQuantity = candidates[0].minQuantity;
			const claimedRefillDays = candidates.map((candidate) => candidate.refillDaysClaimed);
			offerDraft.refillDays =
				selectedQualityTier !== 'value' && claimedRefillDays.every((days) => days !== null)
					? Math.min(...(claimedRefillDays as number[]))
					: null;
			routeDrafts = candidates.map((candidate) => routeFor(candidate));
			offerDraft.routingPolicy = 'automatic';
			offerDraft.preferredProviderServiceId = null;
			offerDraft.lockedProviderServiceId = null;
			offerDraft.status = 'reviewed';
			setupMode = 'smart';
			fallbackMode = 'none';
			offerDraft.fallbackMode = 'none';
			smartSelectionOffset = nextSelectionOffset;
			if (!offerDraft.priceLocked) queueMicrotask(useSuggestedPrice);
			showSuccess(
				refresh ? 'Supplier choices refreshed' : 'Smart Auto prepared',
				`${candidates.length} compatible routes are ready for shadow testing.`
			);
		} catch (error) {
			showError(
				'Could not prepare Smart Auto',
				error instanceof Error ? error.message : 'Please try again.'
			);
		} finally {
			smartLoading = false;
		}
	}

	function useSuggestedPrice(): void {
		if (!offerDraft || !suggestedPricePerStep) return;
		offerDraft.pricePerStepNgn = suggestedPricePerStep;
		offerDraft.priceLocked = false;
	}

	function updateProfitTarget(value: string): void {
		if (!offerDraft) return;
		const parsed = Number(value);
		offerDraft.minimumMarginPercent = Number.isFinite(parsed) ? parsed : 0;
		if (!offerDraft.priceLocked) queueMicrotask(useSuggestedPrice);
	}

	function updateQuantityRule(field: 'minQuantity' | 'stepQuantity', value: string): void {
		if (!offerDraft) return;
		const parsed = Math.max(1, Math.round(Number(value) || 1));
		offerDraft[field] = parsed;
		if (!offerDraft.priceLocked) queueMicrotask(useSuggestedPrice);
	}

	function updateCustomerPrice(value: string): void {
		if (!offerDraft) return;
		const parsed = Number(value);
		offerDraft.pricePerStepNgn = Number.isFinite(parsed) ? parsed : 0;
		offerDraft.priceLocked = true;
	}

	function updateFxRate(value: string): void {
		if (!workspace) return;
		const parsed = Number(value);
		workspace.configuredFxNgnPerUsd = Number.isFinite(parsed) ? parsed : 0;
		if (!offerDraft?.priceLocked) queueMicrotask(useSuggestedPrice);
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
					currencyBufferPercent: 0,
					defaultMarginPercent: workspace.configuredDefaultMarginPercent
				})
			});
			const payload = await response.json();
			if (!response.ok || !payload?.success)
				throw new Error(payload?.error || 'Settings were not saved.');
			showSuccess('Pricing settings saved', 'New suggestions will use these defaults.');
		} catch (error) {
			showError(
				'Could not save pricing',
				error instanceof Error ? error.message : 'Please try again.'
			);
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
		const mismatchedRoute = routeDrafts.find(
			(route) => route.equivalenceApproved && missingRouteSignals(route).length > 0
		);
		if (mismatchedRoute) {
			const candidate = candidateById.get(mismatchedRoute.providerServiceId);
			const missing = missingRouteSignals(mismatchedRoute).map(signalLabel);
			showError(
				'One supplier does not match this customer choice',
				`${candidate ? `${candidate.providerLabel} #${candidate.serviceId}` : 'The selected supplier'} is missing ${missing.join(' and ')}. Remove it or choose a compatible service before saving.`
			);
			return;
		}
		if (estimatedSupplierCost > hardMaximumSpend) {
			showError(
				'Customer price is too low',
				`This price adds ${Math.max(0, projectedMarginPercent).toFixed(0)}% profit to cost. Use ${money(suggestedMinimumPrice)} for ${Number(offerDraft.minimumMarginPercent).toFixed(0)}%, or lower the profit percentage.`
			);
			return;
		}
		offerDraft.normalCostTargetNgn = Math.max(
			1,
			Math.ceil(estimatedSupplierCost || hardMaximumSpend)
		);
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
			if (!response.ok || !payload?.success)
				throw new Error(payload?.error || 'The setup could not be saved.');
			workspace = payload.data as BoostMappingWorkspace;
			offerDraft = workspace.offer ?? defaultOffer(workspace);
			routeDrafts = workspace.candidates
				.filter((candidate) => candidate.mappedRoute)
				.map((candidate) => ({ ...candidate.mappedRoute! }));
			knownCandidates = [...workspace.candidates];
			showSuccess(
				'Customer choice saved',
				'It is ready for private preview. No supplier order was placed.'
			);
		} catch (error) {
			showError(
				'Could not save setup',
				error instanceof Error ? error.message : 'Please try again.'
			);
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		selectedCategoryId = data.firstReviewQueue?.[0]?.categoryId ?? data.offers[0]?.id ?? '';
		selectedPlatform =
			data.offers.find((offer) => offer.id === selectedCategoryId)?.platform ??
			data.offers[0]?.platform ??
			'';
		selectedQualityTier = (data.firstReviewQueue?.[0]?.qualityTier as QualityTier) || 'value';
		void loadWorkspace();
	});
</script>

<svelte:head><title>Boosting Setup | Admin</title></svelte:head>

<div class="space-y-4 pb-24 sm:space-y-6 xl:pb-0">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-xs font-semibold tracking-[0.14em] uppercase" style="color: var(--primary);">
				Internal only
			</p>
			<h1 class="mt-1 flex items-center gap-2 text-2xl font-bold" style="color: var(--text);">
				<Zap size={24} /> Set up Boosting
			</h1>
			<p class="mt-1 max-w-2xl text-sm" style="color: var(--text-muted);">
				Choose what customers see, then connect the supplier services quietly behind it.
			</p>
		</div>
		<a
			href="/admin/boosting-preview"
			class="flex items-center gap-1 text-sm font-semibold"
			style="color: var(--link);">Customer preview <ChevronRight size={15} /></a
		>
	</header>

	<div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
		<aside
			class="h-fit rounded-2xl border"
			style="border-color: var(--border); background: var(--bg-elev-1);"
		>
			<div class="border-b p-4" style="border-color: var(--border);">
				<p class="font-semibold" style="color: var(--text);">1. Choose a result</p>
				<p class="mt-0.5 text-xs" style="color: var(--text-muted);">For example, X Followers</p>
			</div>
			<div class="grid grid-cols-2 gap-3 p-4">
				<label class="block text-xs font-semibold" style="color: var(--text-muted);"
					>Platform
					<select
						value={selectedPlatform}
						onchange={(event) => void changePlatform(event.currentTarget.value)}
						class="field mt-1"
					>
						{#each platformOptions as platform (platform.value)}
							<option value={platform.value}>{platform.label}</option>
						{/each}
					</select>
				</label>
				<label class="block text-xs font-semibold" style="color: var(--text-muted);"
					>Result
					<select
						value={selectedCategoryId}
						onchange={(event) => void chooseCategory(event.currentTarget.value)}
						class="field mt-1"
					>
						{#each platformOffers as item (item.id)}
							<option value={item.id}>{item.name}</option>
						{/each}
					</select>
				</label>
				{#if selectedListItem}
					<div
						class="col-span-2 rounded-xl border p-3"
						style="border-color: rgba(16,185,129,.35); background: rgba(16,185,129,.07);"
					>
						<div class="flex items-start justify-between gap-2">
							<div>
								<p class="text-sm font-semibold" style="color: var(--text);">
									{selectedListItem.name}
								</p>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									{selectedListItem.platformLabel} · {selectedListItem.outcomeLabel}
								</p>
							</div>
							<Check size={16} style="color: var(--primary);" />
						</div>
						<p class="mt-2 text-[10px]" style="color: var(--text-dim);">
							{selectedListItem.reviewedTierCount} customer choice{selectedListItem.reviewedTierCount ===
							1
								? ''
								: 's'} ready
						</p>
					</div>
				{/if}
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
					<RefreshCcw class="mr-2 animate-spin" size={18} /> Loading setup…
				</div>
			{:else if loadError}
				<div class="rounded-2xl border p-5" style="border-color: #7f1d1d; color: #fca5a5;">
					<AlertTriangle size={18} />
					{loadError}
				</div>
			{:else if workspace && offerDraft}
				<nav
					class="mobile-step-nav sticky top-2 z-20 -mx-1 flex gap-2 overflow-x-auto rounded-xl border p-2 xl:hidden"
					style="border-color: var(--border); background: color-mix(in srgb, var(--bg-elev-1) 94%, transparent); backdrop-filter: blur(14px);"
					aria-label="Boosting setup steps"
				>
					<a href="#boost-options">Option</a>
					<a href="#boost-routing">Supplier</a>
					<a href="#boost-pricing">Price</a>
					<a href="#boost-review">Review</a>
				</nav>
				<section
					id="boost-options"
					class="scroll-mt-20 rounded-2xl border p-4 sm:p-5"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<h2 class="text-lg font-bold" style="color: var(--text);">{selectedListItem?.name}</h2>
					<p class="mt-1 text-sm" style="color: var(--text-muted);">
						2. Choose the customer option you want to configure.
					</p>
					<div class="mt-4 grid grid-cols-3 gap-2">
						{#each ['value', 'stable', 'premium'] as QualityTier[] as tier (tier)}
							<button
								type="button"
								onclick={() => changeQualityTier(tier)}
								class="min-h-16 rounded-xl border p-2 text-center sm:min-h-0 sm:p-3 sm:text-left"
								style={selectedQualityTier === tier
									? 'border-color: var(--primary); background: rgba(16,185,129,.08);'
									: 'border-color: var(--border);'}
							>
								<p class="text-xs font-semibold sm:text-base" style="color: var(--text);">
									{TIER_COPY[tier].name}
								</p>
								<p class="mt-1 hidden text-xs sm:block" style="color: var(--text-muted);">
									{TIER_COPY[tier].help}
								</p>
							</button>
						{/each}
					</div>
				</section>

				<details
					class="rounded-2xl border p-4 sm:p-5"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<summary class="cursor-pointer font-bold" style="color: var(--text);">
						Global pricing defaults
						<span class="ml-2 text-xs font-normal" style="color: var(--text-dim);"
							>Default target profit % for new options</span
						>
					</summary>
					<div class="mt-4 flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="mt-1 text-xs" style="color: var(--text-muted);">
								The USD → NGN rate prices supplier costs. The default profit only prefills brand-new
								customer options.
							</p>
						</div>
						<button
							type="button"
							onclick={savePricing}
							disabled={pricingSaving}
							class="rounded-lg border px-3 py-2 text-xs font-bold"
							style="border-color: var(--border); color: var(--text);"
							>{pricingSaving ? 'Saving…' : 'Save global defaults'}</button
						>
					</div>
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						<label class="text-xs" style="color: var(--text-muted);"
							>Protected USD → NGN rate<input
								type="number"
								min="1"
								value={workspace.configuredFxNgnPerUsd}
								oninput={(event) => updateFxRate(event.currentTarget.value)}
								class="field mt-1"
							/></label
						><label class="text-xs" style="color: var(--text-muted);"
							>Starting profit %<input
								type="number"
								min="0"
								max="500"
								bind:value={workspace.configuredDefaultMarginPercent}
								class="field mt-1"
							/><span class="mt-1 block" style="color: var(--text-dim);"
								>Starting value only. It does not override an existing Affordable, More stable or
								Premium option.</span
							></label
						>
					</div>
				</details>

				<section
					id="boost-routing"
					class="scroll-mt-20 rounded-2xl border p-4 sm:p-5"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 class="font-bold" style="color: var(--text);">3. Choose how it routes</h2>
							<p class="mt-1 text-xs" style="color: var(--text-muted);">
								No paid order can be placed from this setup screen.
							</p>
						</div>
						<label class="flex items-center gap-2 text-sm font-semibold" style="color: var(--text);"
							><input type="checkbox" checked={included} onchange={toggleIncluded} /> Offer this customer
							choice</label
						>
					</div>
					<div class="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
						<button
							type="button"
							onclick={() => (setupMode = 'choice')}
							class="min-h-20 rounded-xl border p-3 text-left sm:p-4"
							style={setupMode === 'choice'
								? 'border-color: var(--primary); background: rgba(16,185,129,.07);'
								: 'border-color: var(--border);'}
							><p class="font-semibold" style="color: var(--text);">My choice</p>
							<p class="mt-1 hidden text-xs sm:block" style="color: var(--text-muted);">
								Enter the exact supplier service code you trust.
							</p></button
						>
						<button
							type="button"
							onclick={() => (setupMode = 'smart')}
							class="min-h-20 rounded-xl border p-3 text-left sm:p-4"
							style={setupMode === 'smart'
								? 'border-color: var(--primary); background: rgba(16,185,129,.07);'
								: 'border-color: var(--border);'}
							><p class="font-semibold" style="color: var(--text);">Smart Auto</p>
							<p class="mt-1 hidden text-xs sm:block" style="color: var(--text-muted);">
								Use a small compatible shortlist and choose the safest route at order time.
							</p></button
						>
					</div>

					{#if setupMode === 'choice'}
						{#if primaryCandidate}
							<div
								class="mt-4 rounded-xl border p-4"
								style="border-color: rgba(16,185,129,.4); background: rgba(16,185,129,.05);"
							>
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div>
										<p class="text-xs font-bold" style="color: var(--primary);">
											Primary · {primaryCandidate.providerLabel} #{primaryCandidate.serviceId}
										</p>
										<p class="mt-1 text-sm font-semibold" style="color: var(--text);">
											{primaryCandidate.name}
										</p>
										<p class="mt-1 text-xs" style="color: var(--text-muted);">
											${primaryCandidate.ratePerThousand.toFixed(4)} per 1,000 · {refillLabel(
												primaryCandidate
											)}
										</p>
									</div>
									<button
										type="button"
										onclick={clearSelectedRoutes}
										class="rounded-lg border px-3 py-2 text-xs font-bold"
										style="border-color: var(--border); color: var(--text);">Change primary</button
									>
								</div>
								<label class="mt-4 block text-xs font-semibold" style="color: var(--text-muted);"
									>If the primary service rejects the order
									<select
										value={fallbackMode}
										onchange={(event) =>
											void changeFallbackMode(event.currentTarget.value as FallbackMode)}
										class="field mt-1"
									>
										<option value="none">No fallback</option>
										<option value="automatic">Choose a safe fallback automatically</option>
										<option value="manual">I will choose the fallback</option>
									</select>
								</label>
								<p class="mt-2 text-xs" style="color: var(--text-dim);">
									A fallback is tried only after a definite uncharged rejection. Automatic fallbacks
									must be compatible and cost no more than the primary.
								</p>
							</div>
						{/if}
						{#if !primaryCandidate || fallbackMode === 'manual'}
							<form
								class="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]"
								onsubmit={(event) => {
									event.preventDefault();
									void findService();
								}}
							>
								<label class="text-xs font-semibold" style="color: var(--text-muted);"
									>Supplier<select bind:value={provider} class="field mt-1"
										><option value="smm_raja">SMM Raja</option><option value="bulk_follows"
											>BulkFollows</option
										></select
									></label
								>
								<label class="text-xs font-semibold" style="color: var(--text-muted);"
									>{primaryCandidate ? 'Fallback service code' : 'Primary service code'}<input
										bind:value={serviceCode}
										inputmode="numeric"
										placeholder="e.g. 3498"
										class="field mt-1"
									/></label
								>
								<button
									class="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold"
									style="border-color: var(--border); color: var(--text);"
									><Search size={16} /> {lookupLoading ? 'Finding…' : 'Find'}</button
								>
							</form>
							{#if lookupResult}
								<div
									class="mt-4 rounded-xl border p-4"
									style={lookupResult.compatible && lookupResult.issues.length === 0
										? 'border-color: rgba(16,185,129,.45); background: rgba(16,185,129,.05);'
										: 'border-color: rgba(245,158,11,.45);'}
								>
									{#if lookupResult.service}
										<p class="text-xs font-bold" style="color: var(--primary);">
											{lookupResult.service.providerLabel} · #{lookupResult.service.serviceId}
										</p>
										<h3 class="mt-1 font-semibold" style="color: var(--text);">
											{lookupResult.service.name}
										</h3>
										<p class="mt-2 text-sm" style="color: var(--text-muted);">
											${lookupResult.service.ratePerThousand.toFixed(4)} per 1,000 · {lookupResult.service.minQuantity.toLocaleString()}–{lookupResult.service.maxQuantity.toLocaleString()}
											· {refillLabel(lookupResult.service)}
										</p>
									{/if}
									{#if lookupResult.issues.length}<p
											class="mt-2 text-xs font-semibold"
											style="color: #fbbf24;"
										>
											{lookupResult.compatible
												? 'Supplier catalogue note — My choice can still use this based on your own testing.'
												: 'This service cannot be used for this customer result.'}
										</p>
										<ul class="mt-2 list-disc pl-5 text-xs" style="color: #fbbf24;">
											{#each lookupResult.issues as issue, index (index)}<li>{issue}</li>{/each}
										</ul>{/if}
									{#if lookupResult.compatible && lookupResult.service}<button
											type="button"
											onclick={() =>
												useCandidate(
													lookupResult!.service!,
													primaryCandidate ? 'fallback' : 'primary'
												)}
											class="mt-3 rounded-lg px-4 py-2 text-sm font-bold"
											style="background: var(--primary); color: #00150b;"
											>{primaryCandidate
												? 'Use as fallback'
												: lookupResult.issues.length
													? `Use for ${TIER_COPY[selectedQualityTier].name} based on my test`
													: `Use for ${TIER_COPY[selectedQualityTier].name}`}</button
										>{/if}
								</div>
							{/if}
						{/if}
					{:else}
						<div class="mt-4 rounded-xl border p-4" style="border-color: var(--border);">
							<p class="text-sm" style="color: var(--text-muted);">
								Fast Accounts will prepare up to four compatible routes, keep both suppliers
								represented where possible, and prefer the best price only after every safety check
								passes.
							</p>
							<button
								type="button"
								onclick={() => useSmartAuto(smartAutoPrepared)}
								disabled={smartLoading}
								class="mt-3 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-60"
								style="background: var(--primary); color: #00150b;"
								>{#if smartAutoPrepared}<RefreshCcw
										size={15}
										class="mr-1 inline"
									/>{/if}{smartLoading
									? 'Preparing…'
									: smartAutoPrepared
										? 'Refresh choices'
										: 'Prepare Smart Auto'}</button
							>
						</div>
					{/if}
				</section>

				{#if routeDrafts.length}
					<section
						class="rounded-2xl border p-4 sm:p-5"
						style="border-color: var(--border); background: var(--bg-elev-1);"
					>
						<h2 class="font-bold" style="color: var(--text);">
							Selected supplier {routeDrafts.length === 1 ? 'service' : 'services'}
						</h2>
						<div class="mt-3 grid gap-2">
							{#each routeDrafts as route, index (route.providerServiceId)}
								{@const candidate = candidateById.get(route.providerServiceId)}
								{#if candidate}<div
										class="flex items-start justify-between gap-3 rounded-xl border p-3"
										style="border-color: var(--border);"
									>
										<div>
											<p class="text-xs font-bold" style="color: var(--primary);">
												{index === 0 ? 'Primary' : `Fallback ${index}`} · {candidate.providerLabel} #{candidate.serviceId}
											</p>
											<p class="mt-1 text-sm font-semibold" style="color: var(--text);">
												{candidate.name}
											</p>
											<p class="mt-1 text-xs" style="color: var(--text-muted);">
												${candidate.ratePerThousand.toFixed(4)} / 1,000 · {refillLabel(candidate)}
											</p>
										</div>
										<button
											type="button"
											onclick={() => removeRoute(candidate.id)}
											aria-label="Remove supplier service"
											class="rounded-lg p-2"
											style="color: #fca5a5;"><Trash2 size={17} /></button
										>
									</div>{/if}
							{/each}
						</div>
					</section>
				{/if}

				<section
					id="boost-pricing"
					class="scroll-mt-20 rounded-2xl border p-4 sm:p-5"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<h2 class="font-bold" style="color: var(--text);">4. Set profit and customer price</h2>
					<p class="mt-1 text-xs" style="color: var(--text-muted);">
						The supplier minimum is copied in when you choose a primary service. You can adjust what
						customers start with and the amount each +/− click changes.
					</p>
					<div class="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
						<label class="text-xs font-semibold" style="color: var(--text-muted);"
							>Customer starting quantity<input
								type="number"
								min="1"
								value={offerDraft.minQuantity}
								oninput={(event) => updateQuantityRule('minQuantity', event.currentTarget.value)}
								class="field mt-1"
							/><span class="mt-1 hidden font-normal sm:block" style="color: var(--text-dim);"
								>Cannot be below a selected supplier's minimum.</span
							></label
						>
						<label class="text-xs font-semibold" style="color: var(--text-muted);"
							>Quantity +/− increment<input
								type="number"
								min="1"
								value={offerDraft.stepQuantity}
								oninput={(event) => updateQuantityRule('stepQuantity', event.currentTarget.value)}
								class="field mt-1"
							/><span class="mt-1 hidden font-normal sm:block" style="color: var(--text-dim);"
								>Customers can also type a large quantity directly.</span
							></label
						>
						<label class="text-xs font-semibold" style="color: var(--text-muted);"
							>Target profit on supplier cost %<input
								type="number"
								min="0"
								max="500"
								value={offerDraft.minimumMarginPercent}
								oninput={(event) => updateProfitTarget(event.currentTarget.value)}
								class="field mt-1"
							/><span class="mt-1 hidden font-normal sm:block" style="color: var(--text-dim);"
								>Used for this customer option only.</span
							></label
						>
						<label class="text-xs font-semibold" style="color: var(--text-muted);"
							>Customer price per {offerDraft.stepQuantity.toLocaleString()}<input
								type="number"
								min="50"
								step="50"
								value={offerDraft.pricePerStepNgn}
								oninput={(event) => updateCustomerPrice(event.currentTarget.value)}
								class="field mt-1"
							/></label
						>
					</div>
					<div
						class="metric-scroll -mx-1 mt-4 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0"
					>
						<div class="metric">
							<span
								>{offerDraft.routingPolicy === 'automatic'
									? 'Highest selected supplier cost'
									: 'Supplier cost'} for {offerDraft.minQuantity.toLocaleString()}</span
							><strong>{money(estimatedSupplierCost)}</strong><small
								>${estimatedSupplierCostUsd.toFixed(2)} × ₦{workspace.configuredFxNgnPerUsd.toLocaleString()}</small
							>
						</div>
						<div class="metric">
							<span>Price at your {targetMarginPercent.toFixed(0)}% target</span><strong
								>{money(suggestedMinimumPrice)}</strong
							><small>Supplier cost + target profit, rounded up to ₦50</small>
						</div>
						<div class="metric" class:metric-warning={!currentPriceMeetsTarget}>
							<span>Profit at current customer price</span><strong
								>{projectedMarginPercent.toFixed(0)}%</strong
							><small
								>{money(Math.max(0, minimumCustomerPrice - estimatedSupplierCost))} profit on {offerDraft.minQuantity.toLocaleString()}</small
							>
						</div>
					</div>
					{#if !currentPriceMeetsTarget}<div
							class="mt-3 rounded-xl border px-3 py-2 text-xs"
							style="border-color: rgba(245,158,11,.5); color: #fbbf24;"
						>
							<AlertTriangle size={14} class="mr-1 inline" />Your current price gives {projectedMarginPercent.toFixed(
								0
							)}%, below the {targetMarginPercent.toFixed(0)}% target. Use the target price or lower
							the target before saving.
						</div>{/if}
					<div class="mt-3 flex flex-wrap items-center gap-3">
						<button
							type="button"
							onclick={useSuggestedPrice}
							disabled={!suggestedPricePerStep}
							class="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"
							style="border-color: var(--border); color: var(--text);">Use target price</button
						><label class="flex items-center gap-2 text-xs" style="color: var(--text-muted);"
							><input type="checkbox" bind:checked={offerDraft.priceLocked} /> Keep my typed price when
							supplier costs or target change</label
						>
					</div>
				</section>

				<details
					class="rounded-2xl border p-4 sm:p-5"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<summary class="cursor-pointer font-semibold" style="color: var(--text);"
						>Advanced</summary
					>
					<div class="mt-4 grid gap-4 md:grid-cols-2">
						<label class="text-xs font-semibold" style="color: var(--text-muted);"
							>Customer option name<input
								bind:value={offerDraft.customerName}
								maxlength="80"
								class="field mt-1"
							/></label
						>
						<label class="text-xs font-semibold" style="color: var(--text-muted);"
							>Simple promise<input
								bind:value={offerDraft.shortPromise}
								maxlength="120"
								class="field mt-1"
							/></label
						>
						<label class="text-xs font-semibold" style="color: var(--text-muted);"
							>Promised refill days<input
								type="number"
								min="1"
								max="365"
								placeholder="None"
								value={offerDraft.refillDays ?? ''}
								oninput={(event) => {
									const value = Number(event.currentTarget.value);
									offerDraft!.refillDays =
										event.currentTarget.value && Number.isFinite(value) ? Math.round(value) : null;
								}}
								class="field mt-1"
							/></label
						>
						<label class="text-xs font-semibold" style="color: var(--text-muted);"
							>Visibility<select bind:value={offerDraft.status} class="field mt-1"
								><option value="hidden">Not offered</option><option value="reviewed"
									>Private preview</option
								><option value="live">Live storefront</option></select
							></label
						>
					</div>
					<div
						class="mt-4 rounded-xl border p-3 text-xs"
						style="border-color: rgba(16,185,129,.3); color: var(--text-muted);"
					>
						<ShieldCheck size={14} class="mr-1 inline" />Setup saves safely for private testing.
						Paid rollout controls are kept out of this everyday form.
					</div>
					<a
						href="/admin/boosting-services"
						class="mt-4 inline-flex text-xs font-semibold"
						style="color: var(--link);">Manage customer results and availability →</a
					>
				</details>

				<section
					id="boost-review"
					class="grid scroll-mt-20 gap-4 rounded-2xl border p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<div>
						<div class="flex items-center gap-2">
							{#if routeDrafts.length}<ShieldCheck
									size={19}
									style="color: var(--primary);"
								/>{:else}<AlertTriangle size={19} style="color: #fbbf24;" />{/if}
							<h2 class="font-bold" style="color: var(--text);">Ready to save</h2>
						</div>
						<p class="mt-1 text-sm" style="color: var(--text-muted);">
							{routeDrafts.length
								? `${routeDrafts.length} route${routeDrafts.length === 1 ? '' : 's'} selected · ${money(minimumCustomerPrice)} starting price`
								: 'Choose a supplier service or prepare Smart Auto.'}
						</p>
					</div>
					<button
						type="button"
						onclick={saveMapping}
						disabled={saving}
						class="flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-60"
						style="background: var(--primary); color: #00150b;"
						><Save size={17} />{saving ? 'Saving…' : 'Save customer choice'}</button
					>
				</section>
			{/if}
		</main>
	</div>
</div>

{#if workspace && offerDraft}
	<div
		class="mobile-save-bar fixed right-0 left-0 z-40 border-t p-3 xl:hidden"
		style="border-color: var(--border); background: color-mix(in srgb, var(--bg-elev-1) 94%, transparent); backdrop-filter: blur(16px);"
	>
		<div class="mx-auto flex max-w-3xl items-center gap-3">
			<div class="min-w-0 flex-1">
				<p class="truncate text-[11px]" style="color: var(--text-muted);">
					{selectedListItem?.name} · {TIER_COPY[selectedQualityTier].name}
				</p>
				<p class="text-sm font-bold" style="color: var(--text);">
					{routeDrafts.length} route{routeDrafts.length === 1 ? '' : 's'} · {money(
						minimumCustomerPrice
					)}
				</p>
			</div>
			<button
				type="button"
				onclick={saveMapping}
				disabled={saving}
				class="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-60"
				style="background: var(--primary); color: #00150b;"
			>
				<Save size={17} />{saving ? 'Saving…' : 'Save'}
			</button>
		</div>
	</div>
{/if}

<style>
	.field {
		width: 100%;
		min-height: 3rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		background: var(--bg);
		padding: 0.55rem 0.75rem;
		font-size: 1rem;
		color: var(--text);
		outline: none;
	}
	.field:focus {
		border-color: var(--primary);
	}
	.metric {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		padding: 0.75rem;
		color: var(--text-muted);
		font-size: 0.7rem;
		min-width: 72%;
		scroll-snap-align: start;
	}
	.metric strong {
		color: var(--text);
		font-size: 0.9rem;
	}
	.metric-warning {
		border-color: rgba(245, 158, 11, 0.5);
	}
	input[type='checkbox'] {
		accent-color: var(--primary);
		min-height: 1.1rem;
		min-width: 1.1rem;
	}
	.mobile-step-nav,
	.metric-scroll {
		scrollbar-width: none;
	}
	.mobile-step-nav::-webkit-scrollbar,
	.metric-scroll::-webkit-scrollbar {
		display: none;
	}
	.mobile-step-nav a {
		min-height: 2.5rem;
		flex: 1 0 auto;
		border-radius: 0.65rem;
		padding: 0.7rem 0.9rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-muted);
		text-align: center;
	}
	.mobile-step-nav a:focus,
	.mobile-step-nav a:hover {
		background: var(--surface);
		color: var(--text);
	}
	.mobile-save-bar {
		bottom: var(--cookie-notice-mobile-offset, 0px);
		padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
		transition: bottom 160ms ease;
	}
	@media (min-width: 640px) {
		.field {
			min-height: 2.65rem;
			font-size: 0.875rem;
		}
		.metric {
			min-width: 0;
		}
	}
</style>
