<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ShoppingCart,
		Star,
		Users,
		Package,
		ChevronRight,
		X,
		Minus,
		Plus,
		BellRing,
		CheckCircle,
		AlertTriangle,
		Zap,
		Wallet,
		Filter,
		Compass
	} from '$lib/icons';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { showError, showSuccess, showWarning } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import {
		getPlatformColor,
		getPlatformIcon,
		isPlatformImageUrl
	} from '$lib/helpers/platformColors';
	import { formatPrice } from '$lib/helpers/utils';
	import {
		getTierDeliveryModeLabel as getDeliveryModeLabel,
		getTierDeliveryConfig,
		type TierDeliveryMode
	} from '$lib/helpers/tier-delivery-config';

	interface Props {
		data: PageData;
	}

	interface PlatformMetadata {
		icon?: unknown;
		color?: unknown;
	}

	type TierCard = PageData['tiers'][number];
	type MobileQuickFilter = 'popular' | 'budget' | 'organic';
	type MobileSortKey = 'default' | 'price_asc' | 'price_desc' | 'stock_desc';

	interface MobileSortOption {
		key: MobileSortKey;
		label: string;
		shortLabel: string;
	}

	interface TierBadgeDisplay {
		label: string;
		tone: 'warning' | 'featured' | 'hot';
	}

	let { data }: Props = $props();
	let platformHeaderIconFailed = $state(false);
	let quickAddOpen = $state(false);
	let quickAddTier = $state<TierCard | null>(null);
	let quickAddQuantity = $state(1);
	let quickAddSubmitting = $state(false);
	let restockLoadingByTier = $state<Record<string, boolean>>({});
	let restockSubscribedByTier = $state<Record<string, boolean>>({});
	let autoNotifyHandled = $state(false);
	const lowStockThreshold = $derived(Math.max(1, Number(data.lowStockThreshold || 10)));
	const currentUser = $derived((page.data as { user?: { id: string } | null }).user || null);

	let quickAddDialog = $state<HTMLDivElement | null>(null);
	let quickAddCloseButton = $state<HTMLButtonElement | null>(null);
	let previousBodyOverflow = '';
	let previousActiveElement: HTMLElement | null = null;
	let mobileQuickFilter = $state<MobileQuickFilter | null>('popular');
	let mobileSortKey = $state<MobileSortKey>('default');
	let expandedTierDetailsById = $state<Record<string, boolean>>({});
	let isMobileViewport = $state(false);

	// Format follower count
	function formatFollowers(count: number): string {
		if (count >= 1000000) {
			const millions = count / 1000000;
			return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
		} else if (count >= 1000) {
			const thousands = count / 1000;
			return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
		}
		return count.toString();
	}

	function getTierRoute(tierSlug: string): string {
		return `/platforms/${data.platform?.slug}/tiers/${tierSlug}`;
	}

	function isOrganicTier(tier: TierCard): boolean {
		const metadataFeatures = getTierFeatures(tier.metadata);
		const searchable = [
			tier.tier_name || '',
			tier.description || '',
			tier.featured_badge || '',
			...metadataFeatures
		]
			.join(' ')
			.toLowerCase();
		return /\borganic\b/.test(searchable);
	}

	function hasPopularSignal(tier: TierCard): boolean {
		if (tier.is_pinned || tier.is_featured) return true;
		const featuredLabel = (tier.featured_badge || '').toLowerCase();
		return /(hot|best|popular|top|pinned)/.test(featuredLabel);
	}

	function getTierPopularityScore(tier: TierCard): number {
		let score = 0;
		if (tier.is_pinned) {
			score += 1000;
			if (typeof tier.pin_priority === 'number') {
				score += Math.max(0, 80 - tier.pin_priority);
			}
		}
		if (tier.is_featured) score += 220;
		const featuredLabel = (tier.featured_badge || '').toLowerCase();
		if (/hot/.test(featuredLabel)) score += 120;
		if (/best/.test(featuredLabel)) score += 90;
		if (/popular|top/.test(featuredLabel)) score += 75;
		if (tier.visible_available > 0) score += 40;
		score += Math.min(tier.visible_available || 0, 25);
		return score;
	}

	function compareTierByPriceAsc(a: TierCard, b: TierCard): number {
		const priceDiff = a.price - b.price;
		if (priceDiff !== 0) return priceDiff;
		return a.tier_name.localeCompare(b.tier_name);
	}

	function compareTierByPriceDesc(a: TierCard, b: TierCard): number {
		const priceDiff = b.price - a.price;
		if (priceDiff !== 0) return priceDiff;
		return a.tier_name.localeCompare(b.tier_name);
	}

	function compareTierByStockDesc(a: TierCard, b: TierCard): number {
		const stockDiff = b.visible_available - a.visible_available;
		if (stockDiff !== 0) return stockDiff;
		return compareTierByPriceAsc(a, b);
	}

	function compareTierByPopularity(a: TierCard, b: TierCard): number {
		const scoreDiff = getTierPopularityScore(b) - getTierPopularityScore(a);
		if (scoreDiff !== 0) return scoreDiff;
		return compareTierByPriceAsc(a, b);
	}

	function isTierCardActionTarget(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return false;
		return Boolean(
			target.closest(
				'a, button, input, select, textarea, [data-card-action], [role="button"], [role="link"]'
			)
		);
	}

	function openTierSamples(tier: TierCard): void {
		void goto(getTierRoute(tier.tier_slug));
	}

	function handleTierCardClick(event: MouseEvent, tier: TierCard): void {
		if (isTierCardActionTarget(event.target)) return;
		openTierSamples(tier);
	}

	function handleTierCardKeydown(event: KeyboardEvent, tier: TierCard): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		if (isTierCardActionTarget(event.target)) return;
		event.preventDefault();
		openTierSamples(tier);
	}

	function goBack() {
		goto('/platforms');
	}

	function getPlatformHeaderStyle(metadata: PlatformMetadata | undefined): string | undefined {
		const color = typeof metadata?.color === 'string' ? metadata.color.trim() : '';
		if (!color) return undefined;

		return `background: linear-gradient(135deg, ${color} 0%, rgba(15, 22, 47, 0.88) 100%);`;
	}

	function getPlatformMetadata(metadata: Record<string, unknown> | undefined): PlatformMetadata {
		return (metadata as PlatformMetadata | undefined) || {};
	}

	function shouldRenderPlatformHeaderImage(metadata: PlatformMetadata): boolean {
		return isPlatformImageUrl(metadata.icon) && !platformHeaderIconFailed;
	}

	// Show stock badge only when inventory is low (no "In stock" chip).
	function getTierStatus(available: number): { status: 'Few Left' } | null {
		if (available > 0 && available <= lowStockThreshold) {
			return {
				status: 'Few Left'
			};
		}
		return null;
	}

	// Format feature names (e.g., "viral_ready" -> "Viral Ready")
	function formatFeatureName(feature: string): string {
		return feature
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join(' ');
	}

	function getTierAudienceLabel(metadata: unknown): string {
		if (!metadata || typeof metadata !== 'object') {
			return 'Tier details available on selection';
		}

		const tierMetadata = metadata as Record<string, unknown>;
		const followerRange = tierMetadata.follower_range;

		if (followerRange && typeof followerRange === 'object') {
			const range = followerRange as Record<string, unknown>;
			const display =
				typeof range.display === 'string' && range.display.trim().length > 0
					? range.display.trim()
					: '';

			if (display) {
				return /follower/i.test(display) ? display : `${display} followers`;
			}

			const min = typeof range.min === 'number' ? range.min : undefined;
			const max = typeof range.max === 'number' ? range.max : undefined;

			if (min !== undefined && max !== undefined) {
				return `${formatFollowers(min)} - ${formatFollowers(max)} followers`;
			}
		}

		const followerCount =
			typeof tierMetadata.follower_count === 'number' ? tierMetadata.follower_count : undefined;
		if (followerCount !== undefined && followerCount > 0) {
			return `${formatFollowers(followerCount)} followers`;
		}

		return 'Tier details available on selection';
	}

	// Get tier features based on metadata
	function getTierFeatures(metadata: any): string[] {
		// First check for admin-defined features
		if (metadata?.features && Array.isArray(metadata.features)) {
			return metadata.features
				.filter((feature: string) => feature && feature.trim() !== '')
				.map(formatFeatureName);
		}

		// Fallback to legacy features
		const features: string[] = [];
		if (metadata?.typical_features) {
			features.push(...metadata.typical_features.map(formatFeatureName));
		}
		if (metadata?.age_hint) {
			features.push(formatFeatureName(metadata.age_hint));
		}
		return features;
	}

	function getFeaturedBadgeLabel(tier: TierCard): string {
		if (typeof tier.featured_badge === 'string' && tier.featured_badge.trim().length > 0) {
			return tier.featured_badge.trim();
		}
		return 'Featured';
	}

	function getPrimaryTierBadge(tier: TierCard): TierBadgeDisplay | null {
		if (tier.is_pinned) {
			return {
				label: `Pinned${tier.pin_priority ? ` #${tier.pin_priority}` : ''}`,
				tone: 'warning'
			};
		}

		if (!tier.is_featured) {
			return null;
		}

		const label = getFeaturedBadgeLabel(tier);
		const normalized = label.toLowerCase();
		const tone: TierBadgeDisplay['tone'] = /hot/.test(normalized)
			? 'hot'
			: /best|price|deal|pick/.test(normalized)
				? 'featured'
				: 'featured';

		return { label, tone };
	}

	function getTopTierFeatures(tierFeatures: string[]): string[] {
		return tierFeatures.slice(0, 3);
	}

	function getAdditionalTierFeatures(tierFeatures: string[]): string[] {
		return tierFeatures.slice(3);
	}

	function isTierDetailsExpanded(tierId: string): boolean {
		return Boolean(expandedTierDetailsById[tierId]);
	}

	function toggleTierDetails(tierId: string): void {
		expandedTierDetailsById = {
			...expandedTierDetailsById,
			[tierId]: !expandedTierDetailsById[tierId]
		};
	}

	const tierPrices = $derived(
		data.tiers
			.map((tier) => Number(tier.price))
			.filter((value) => Number.isFinite(value))
			.sort((a, b) => a - b)
	);
	const tierStocks = $derived(
		data.tiers
			.map((tier) => Number(tier.visible_available))
			.filter((value) => Number.isFinite(value))
			.sort((a, b) => a - b)
	);
	const hasPriceVariance = $derived(
		tierPrices.length > 1 && tierPrices[0] !== tierPrices[tierPrices.length - 1]
	);
	const hasStockVariance = $derived(
		tierStocks.length > 1 && tierStocks[0] !== tierStocks[tierStocks.length - 1]
	);
	const hasPopularTiers = $derived(data.tiers.some(hasPopularSignal));
	const hasOrganicTiers = $derived(data.tiers.some(isOrganicTier));
	const showPopularControl = $derived(hasPopularTiers);
	const showBudgetControl = $derived(hasPriceVariance);
	const showOrganicControl = $derived(hasOrganicTiers);

	const mobileSortOptions = $derived.by(() => {
		const options: MobileSortOption[] = [
			{ key: 'default', label: 'Recommended', shortLabel: 'Auto' }
		];
		if (hasPriceVariance) {
			options.push({ key: 'price_asc', label: 'Price: Low to High', shortLabel: 'Price ↑' });
			options.push({ key: 'price_desc', label: 'Price: High to Low', shortLabel: 'Price ↓' });
		}
		if (hasStockVariance) {
			options.push({ key: 'stock_desc', label: 'Most in stock first', shortLabel: 'Stock' });
		}
		return options;
	});

	const showSortControl = $derived(mobileSortOptions.length > 1);
	const showMobileTierControls = $derived(
		data.tiers.length >= 10 &&
			(Boolean(showPopularControl) ||
				Boolean(showBudgetControl) ||
				Boolean(showOrganicControl) ||
				Boolean(showSortControl))
	);
	const shouldUseMobileTierControls = $derived(showMobileTierControls && isMobileViewport);

	const activeMobileSortOption = $derived.by(
		() =>
			mobileSortOptions.find((option) => option.key === mobileSortKey) || {
				key: 'default',
				label: 'Recommended',
				shortLabel: 'Auto'
			}
	);

	const displayedTiers = $derived.by(() => {
		if (!shouldUseMobileTierControls) {
			return [...data.tiers];
		}

		let tiers = [...data.tiers];

		if (mobileQuickFilter === 'organic') {
			tiers = tiers.filter(isOrganicTier);
		} else if (mobileQuickFilter === 'popular') {
			tiers.sort(compareTierByPopularity);
		} else if (mobileQuickFilter === 'budget') {
			tiers.sort(compareTierByPriceAsc);
		}

		const effectiveSort =
			mobileSortKey === 'default'
				? mobileQuickFilter === 'budget'
					? 'price_asc'
					: mobileQuickFilter === 'popular'
						? 'default'
						: 'default'
				: mobileSortKey;

		if (effectiveSort === 'price_asc') {
			tiers.sort(compareTierByPriceAsc);
		} else if (effectiveSort === 'price_desc') {
			tiers.sort(compareTierByPriceDesc);
		} else if (effectiveSort === 'stock_desc') {
			tiers.sort(compareTierByStockDesc);
		}

		return tiers;
	});

	function setMobileQuickFilter(filter: MobileQuickFilter): void {
		mobileQuickFilter = mobileQuickFilter === filter ? null : filter;
	}

	function cycleMobileSort(): void {
		if (mobileSortOptions.length <= 1) return;
		const optionKeys = mobileSortOptions.map((option) => option.key);
		const currentIndex = optionKeys.indexOf(mobileSortKey);
		const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % optionKeys.length : 0;
		mobileSortKey = optionKeys[nextIndex] as MobileSortKey;
	}

	function resetMobileTierControls(): void {
		mobileQuickFilter = shouldUseMobileTierControls && showPopularControl ? 'popular' : null;
		mobileSortKey = 'default';
	}

	function syncViewportFlag(): void {
		isMobileViewport = window.innerWidth < 640;
	}

	$effect(() => {
		if (!shouldUseMobileTierControls) {
			if (mobileQuickFilter !== null) mobileQuickFilter = null;
			if (mobileSortKey !== 'default') mobileSortKey = 'default';
			return;
		}

		if (showPopularControl && mobileQuickFilter === null) {
			mobileQuickFilter = 'popular';
		}
	});

	function getTierDeliveryModeLabel(tier: TierCard): string {
		const config = getTierDeliveryConfig(tier.metadata);
		return getDeliveryModeLabel(config.mode);
	}

	function getTierManualHandoverPromise(tier: TierCard): string | null {
		const config = getTierDeliveryConfig(tier.metadata);
		return config.mode === 'manual_handover' ? config.manualHandoverPromise : null;
	}

	async function ensureAddModeCompatibility(tier: TierCard): Promise<boolean> {
		const mode = getTierDeliveryConfig(tier.metadata).mode;
		let compatibility: { compatible: boolean; existingMode: TierDeliveryMode | null };

		try {
			compatibility = await cart.ensureDeliveryModeCompatibility(tier.category_id, mode);
		} catch (error) {
			console.error('Failed to validate cart delivery mode compatibility:', error);
			showError('Could not update cart', 'Please try again.');
			return false;
		}

		if (compatibility.compatible) {
			return true;
		}

		const incomingLabel = getDeliveryModeLabel(mode);
		const existingLabel = compatibility.existingMode
			? getDeliveryModeLabel(compatibility.existingMode)
			: getDeliveryModeLabel('instant_auto');
		const shouldReplace = window.confirm(
			`You already have ${existingLabel} item(s) in your cart.\n\n${incomingLabel} items must be checked out separately.\n\nPress OK to clear your cart and add this item, or Cancel to keep your current cart.`
		);

		if (!shouldReplace) {
			return false;
		}

		cart.clear();
		showWarning('Cart cleared', `Previous ${existingLabel} items were removed.`);
		return true;
	}

	function getCurrentCartQuantity(tier: TierCard): number {
		const existingCartItem = cart.items.find((item) => item.tierId === tier.category_id);
		return existingCartItem ? existingCartItem.quantity : 0;
	}

	function getRemainingSelectableQuantity(tier: TierCard): number {
		return Math.max(tier.visible_available - getCurrentCartQuantity(tier), 0);
	}

	function getQuickAddRemainingQuantity(): number {
		if (!quickAddTier) return 0;
		return getRemainingSelectableQuantity(quickAddTier);
	}

	function getQuickAddTotalPrice(): number {
		if (!quickAddTier) return 0;
		return quickAddTier.price * quickAddQuantity;
	}

	async function openQuickAddModal(tier: TierCard): Promise<void> {
		if (tier.visible_available <= 0) return;
		if (!(await ensureAddModeCompatibility(tier))) return;

		const currentCartQuantity = getCurrentCartQuantity(tier);
		const remainingStock = tier.visible_available - currentCartQuantity;
		if (remainingStock <= 0) {
			showWarning(
				'Maximum quantity reached',
				`You already have the maximum available quantity (${tier.visible_available}) for this tier in your cart.`
			);
			return;
		}

		quickAddTier = tier;
		quickAddQuantity = 1;
		quickAddSubmitting = false;
		quickAddOpen = true;

		previousActiveElement =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		previousBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		await tick();
		quickAddCloseButton?.focus();
	}

	function closeQuickAddModal(): void {
		quickAddOpen = false;
		quickAddSubmitting = false;
		quickAddQuantity = 1;
		quickAddTier = null;
		document.body.style.overflow = previousBodyOverflow;

		if (previousActiveElement) {
			previousActiveElement.focus();
			previousActiveElement = null;
		}
	}

	function decreaseQuickAddQuantity(): void {
		if (quickAddQuantity > 1) {
			quickAddQuantity -= 1;
		}
	}

	function increaseQuickAddQuantity(): void {
		const maxAllowedSelection = getQuickAddRemainingQuantity();
		if (quickAddQuantity < maxAllowedSelection) {
			quickAddQuantity += 1;
		}
	}

	function trapQuickAddFocus(event: KeyboardEvent): void {
		if (!quickAddDialog) return;
		const focusableElements = Array.from(
			quickAddDialog.querySelectorAll<HTMLElement>(
				'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		);

		if (focusableElements.length === 0) return;

		const first = focusableElements[0];
		const last = focusableElements[focusableElements.length - 1];
		const activeElement = document.activeElement as HTMLElement | null;
		const activeInsideDialog = activeElement ? quickAddDialog.contains(activeElement) : false;

		if (event.shiftKey) {
			if (!activeInsideDialog || activeElement === first) {
				event.preventDefault();
				last.focus();
			}
			return;
		}

		if (!activeInsideDialog || activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function handleQuickAddWindowKeydown(event: KeyboardEvent): void {
		if (!quickAddOpen) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			closeQuickAddModal();
			return;
		}

		if (event.key === 'Tab') {
			trapQuickAddFocus(event);
		}
	}

	async function addQuickAddToCart(): Promise<void> {
		const tier = quickAddTier;
		if (!tier || quickAddSubmitting) return;
		if (!(await ensureAddModeCompatibility(tier))) return;

		quickAddSubmitting = true;
		try {
			const existingCartItem = cart.items.find((item) => item.tierId === tier.category_id);
			const currentCartQuantity = existingCartItem ? existingCartItem.quantity : 0;
			const totalQuantityAfterAdd = currentCartQuantity + quickAddQuantity;

			if (totalQuantityAfterAdd > tier.visible_available) {
				const remainingStock = tier.visible_available - currentCartQuantity;
				if (remainingStock <= 0) {
					showWarning(
						'Maximum quantity reached',
						`You already have the maximum available quantity (${tier.visible_available}) for this tier in your cart.`
					);
				} else {
					showWarning(
						'Quantity limit exceeded',
						`Only ${remainingStock} more accounts can be added to your cart for this tier. You already have ${currentCartQuantity} in your cart.`
					);
				}
				return;
			}

			cart.addTier(tier.category_id, quickAddQuantity);
			showSuccess(
				'Added to cart!',
				`${quickAddQuantity} ${tier.tier_name} ${quickAddQuantity === 1 ? 'account' : 'accounts'} added successfully. Click to view cart.`,
				6000,
				'/checkout'
			);
			closeQuickAddModal();
		} catch (error) {
			console.error('Error adding to cart:', error);
			showError(
				'Failed to add to cart',
				'Please try again or contact support if the problem persists.'
			);
		} finally {
			quickAddSubmitting = false;
		}
	}

	function isTierRestockSubscribed(tierId: string): boolean {
		return Boolean(restockSubscribedByTier[tierId]);
	}

	function isTierRestockLoading(tierId: string): boolean {
		return Boolean(restockLoadingByTier[tierId]);
	}

	function setTierRestockLoading(tierId: string, value: boolean): void {
		restockLoadingByTier = {
			...restockLoadingByTier,
			[tierId]: value
		};
	}

	function setTierRestockSubscribed(tierId: string, value: boolean): void {
		restockSubscribedByTier = {
			...restockSubscribedByTier,
			[tierId]: value
		};
	}

	async function loadRestockStatusForSoldOutTiers(): Promise<void> {
		if (!currentUser) return;
		const soldOutTiers = data.tiers.filter((tier) => tier.visible_available === 0);
		if (soldOutTiers.length === 0) return;

		await Promise.all(
			soldOutTiers.map(async (tier) => {
				try {
					const response = await fetch(
						`/api/restock-subscriptions?tierId=${encodeURIComponent(tier.category_id)}`
					);
					if (!response.ok) return;
					const result = await response.json();
					setTierRestockSubscribed(tier.category_id, Boolean(result?.data?.subscribed));
				} catch (error) {
					console.error('Failed to load restock status:', error);
				}
			})
		);
	}

	async function subscribeToRestock(tier: TierCard): Promise<void> {
		if (tier.visible_available > 0) return;
		if (isTierRestockLoading(tier.category_id) || isTierRestockSubscribed(tier.category_id)) return;

		if (!currentUser) {
			const nextUrl = new URL(page.url);
			nextUrl.searchParams.set('notifyTier', tier.category_id);
			const returnUrl = encodeURIComponent(nextUrl.pathname + nextUrl.search);
			goto(`/auth/login?returnUrl=${returnUrl}`);
			return;
		}

		setTierRestockLoading(tier.category_id, true);
		try {
			const response = await fetch('/api/restock-subscriptions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tierId: tier.category_id })
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				showError('Subscription failed', result.error || 'Unable to subscribe right now.');
				return;
			}

			setTierRestockSubscribed(tier.category_id, true);
			showSuccess('Subscribed', result.message || "You'll be notified when this tier is back.");
		} catch (error) {
			console.error('Failed to subscribe for restock:', error);
			showError('Subscription failed', 'Unable to subscribe right now. Please try again.');
		} finally {
			setTierRestockLoading(tier.category_id, false);
		}
	}

	onMount(() => {
		syncViewportFlag();
		resetMobileTierControls();
		window.addEventListener('resize', syncViewportFlag);

		void loadRestockStatusForSoldOutTiers().then(async () => {
			const notifyTierId = page.url.searchParams.get('notifyTier');
			if (
				!autoNotifyHandled &&
				currentUser &&
				notifyTierId &&
				data.tiers.some((tier) => tier.category_id === notifyTierId && tier.visible_available === 0)
			) {
				autoNotifyHandled = true;
				const targetTier = data.tiers.find((tier) => tier.category_id === notifyTierId);
				if (targetTier) {
					await subscribeToRestock(targetTier);
				}

				const cleaned = new URL(window.location.href);
				cleaned.searchParams.delete('notifyTier');
				window.history.replaceState({}, '', cleaned.pathname + cleaned.search);
			}
		});

		return () => {
			window.removeEventListener('resize', syncViewportFlag);
			document.body.style.overflow = previousBodyOverflow;
		};
	});
</script>

<svelte:window onkeydown={handleQuickAddWindowKeydown} />

<svelte:head>
	<title>{data.platform?.name} Accounts - FastAccs</title>
	<meta
		name="description"
		content="Browse available {data.platform
			?.name} account tiers and complete checkout securely on FastAccs."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background: var(--bg-elev-1);">
	{#if !data.platform}
		<!-- Platform not found -->
		<section class="py-16">
			<div class="mx-auto max-w-4xl px-4 text-center">
				<Package class="mx-auto mb-4 h-16 w-16" style="color: var(--text-muted);" />
				<h1 class="mb-4 text-3xl font-bold" style="color: var(--text);">Platform Not Found</h1>
				<p class="mb-8 text-lg" style="color: var(--text-muted);">
					The platform you're looking for doesn't exist or isn't available right now.
				</p>
				<button
					onclick={goBack}
					class="rounded-lg px-6 py-3 font-semibold transition-all active:scale-95"
					style="background: var(--btn-primary-gradient); color: white;"
				>
					Back to Platforms
				</button>
			</div>
		</section>
	{:else}
		{@const PlatformIcon = getPlatformIcon(data.platform.slug)}
		{@const platformMeta = getPlatformMetadata(data.platform.metadata)}

		<!-- Platform Header -->
		<section
			class={`py-4 text-white sm:py-12 ${platformMeta?.color ? '' : `bg-gradient-to-r ${getPlatformColor(data.platform.slug)}`}`}
			style={getPlatformHeaderStyle(platformMeta)}
		>
			<div class="mx-auto max-w-6xl px-4">
				<Breadcrumb
					items={[
						{ label: 'Platforms', href: '/platforms' },
						{ label: data.platform.name, active: true }
					]}
				/>

				<div class="mt-3 sm:hidden">
					<div class="flex items-center gap-3">
						<div class="rounded-full bg-white/18 p-2.5">
							{#if shouldRenderPlatformHeaderImage(platformMeta)}
								<img
									src={platformMeta.icon as string}
									alt={data.platform.name}
									class="h-8 w-8"
									onerror={() => (platformHeaderIconFailed = true)}
								/>
							{:else}
								<PlatformIcon class="h-8 w-8" />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<h1 class="text-[2rem] leading-tight font-bold">{data.platform.name} Accounts</h1>
							<p class="mt-1 text-sm opacity-90">{data.platform.description}</p>
						</div>
						<div
							class="rounded-[14px] border px-3 py-2 text-center"
							style="border-color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.06);"
						>
							<div class="text-[1.55rem] leading-none font-bold">{data.tiers.length}</div>
							<div class="mt-1 text-[0.68rem] tracking-wide uppercase opacity-85">tiers</div>
						</div>
					</div>
				</div>

				<div class="hidden items-start gap-4 sm:flex sm:gap-6">
					<div class="flex flex-col items-center gap-3">
						<div class="rounded-full bg-white/20 p-3 sm:p-4">
							{#if shouldRenderPlatformHeaderImage(platformMeta)}
								<img
									src={platformMeta.icon as string}
									alt={data.platform.name}
									class="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12"
									onerror={() => (platformHeaderIconFailed = true)}
								/>
							{:else}
								<PlatformIcon class="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12" />
							{/if}
						</div>
						<div class="text-center">
							<div class="text-2xl font-bold sm:text-3xl">{data.tiers.length}</div>
							<div class="text-xs opacity-75 sm:text-sm">Available Tiers</div>
						</div>
					</div>
					<div class="flex-1">
						<h1 class="mb-1 text-2xl font-bold sm:text-3xl md:text-4xl">
							{data.platform.name} Accounts
						</h1>
						<p class="text-sm opacity-90 sm:text-base md:text-lg">{data.platform.description}</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Tier Selection -->
		<section class="py-5 sm:py-16">
			<div class="mx-auto max-w-6xl px-4">
				<div class="mb-5 text-left sm:mb-8 sm:text-center">
					<h2 class="mb-2 text-xl font-bold sm:mb-4 sm:text-3xl" style="color: var(--text);">
						Available Tiers
					</h2>
					<p class="text-sm sm:text-lg" style="color: var(--text-muted);">
						Select the tier that matches your needs. Each tier shows current stock and pricing.
					</p>
				</div>

				{#if showMobileTierControls}
					<div class="mobile-tier-control-sticky sm:hidden">
						<div class="mobile-tier-control-row">
							{#if showPopularControl}
								<button
									type="button"
									onclick={() => setMobileQuickFilter('popular')}
									class={`mobile-tier-chip ${mobileQuickFilter === 'popular' ? 'active' : ''}`}
									aria-pressed={mobileQuickFilter === 'popular'}
								>
									<Zap class="h-4 w-4" />
									<span>Popular</span>
								</button>
							{/if}

							{#if showBudgetControl}
								<button
									type="button"
									onclick={() => setMobileQuickFilter('budget')}
									class={`mobile-tier-chip ${mobileQuickFilter === 'budget' ? 'active' : ''}`}
									aria-pressed={mobileQuickFilter === 'budget'}
								>
									<Wallet class="h-4 w-4" />
									<span>Budget</span>
								</button>
							{/if}

							{#if showOrganicControl}
								<button
									type="button"
									onclick={() => setMobileQuickFilter('organic')}
									class={`mobile-tier-chip ${mobileQuickFilter === 'organic' ? 'active' : ''}`}
									aria-pressed={mobileQuickFilter === 'organic'}
								>
									<Compass class="h-4 w-4" />
									<span>Organic</span>
								</button>
							{/if}

							{#if showSortControl}
								<button
									type="button"
									onclick={cycleMobileSort}
									class={`mobile-tier-chip ${mobileSortKey !== 'default' ? 'active' : ''}`}
									aria-label={`Sort tiers. Current mode: ${activeMobileSortOption.label}`}
								>
									<Filter class="h-4 w-4" />
									<span>Sort</span>
								</button>
							{/if}
						</div>
						{#if mobileSortKey !== 'default'}
							<p class="mt-2 text-[11px]" style="color: var(--text-muted);">
								Sorting by: {activeMobileSortOption.shortLabel}
							</p>
						{/if}
					</div>
				{/if}

				{#if data.tiers.length === 0}
					<div class="rounded-lg p-8 text-center" style="background: var(--bg-elev-2);">
						<Package class="mx-auto mb-4 h-12 w-12" style="color: var(--text-muted);" />
						<h3 class="mb-2 text-lg font-semibold" style="color: var(--text);">
							No Tiers Available
						</h3>
						<p style="color: var(--text-muted);">
							We're currently restocking {data.platform.name} accounts. Please check back soon!
						</p>
						<button
							onclick={goBack}
							class="mt-4 rounded-lg px-6 py-2 transition-all active:scale-95"
							style="background: var(--btn-primary-gradient); color: white;"
						>
							Browse Other Platforms
						</button>
					</div>
				{:else if displayedTiers.length === 0}
					<div
						class="rounded-xl border p-6 text-left sm:text-center"
						style="background: var(--bg-elev-2); border-color: var(--border);"
					>
						<h3 class="text-base font-semibold sm:text-lg" style="color: var(--text);">
							No tiers match this filter
						</h3>
						<p class="mt-2 text-sm" style="color: var(--text-muted);">
							Try another view to see all available options.
						</p>
						<button
							type="button"
							onclick={resetMobileTierControls}
							class="mt-4 rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-95"
							style="background: rgba(105,109,250,0.14); border: 1px solid rgba(105,109,250,0.34); color: var(--text);"
						>
							Reset filters
						</button>
					</div>
				{:else}
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
						{#each displayedTiers as tier (tier.category_id)}
							{@const tierStatus = getTierStatus(tier.visible_available)}
							{@const tierFeatures = getTierFeatures(tier.metadata)}
							{@const primaryBadge = getPrimaryTierBadge(tier)}
							{@const topFeatures = getTopTierFeatures(tierFeatures)}
							{@const additionalFeatures = getAdditionalTierFeatures(tierFeatures)}
							{@const hasExpandableDetails = Boolean(
								additionalFeatures.length > 0 ||
									tier.description ||
									tier.metadata?.age_hint ||
									getTierManualHandoverPromise(tier)
							)}
							{@const isExpanded = isTierDetailsExpanded(tier.category_id)}
							<div
								class={`tier-card group relative flex cursor-pointer flex-col overflow-visible rounded-xl shadow transition-all duration-300 ${
									primaryBadge ? 'tier-card--with-badge' : ''
								} ${tier.visible_available > 0 ? 'hover:-translate-y-1 hover:shadow-md' : 'opacity-75'}`}
								style="background: var(--bg-elev-2); border: 1px solid var(--border);"
								role="link"
								tabindex="0"
								aria-label={`View samples for ${tier.tier_name}`}
								onclick={(event) => handleTierCardClick(event, tier)}
								onkeydown={(event) => handleTierCardKeydown(event, tier)}
							>
								{#if primaryBadge}
									<div class="card-merch-tags">
										<span
											class={`card-border-chip card-border-chip--gloss ${
												primaryBadge.tone === 'warning'
													? 'card-border-chip--warning'
													: primaryBadge.tone === 'hot'
														? 'card-border-chip--hot'
														: 'card-border-chip--featured'
											}`}
										>
											{primaryBadge.label}
										</span>
									</div>
								{/if}

								<div
									class={`tier-card-body flex flex-1 flex-col p-4 sm:p-6 ${
										primaryBadge ? 'pt-10 sm:pt-11' : ''
									}`}
								>
									<div
										class="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
									>
										<div class="min-w-0">
											<h3 class="text-lg font-bold sm:text-xl" style="color: var(--text);">
												{tier.tier_name}
											</h3>
											<p
												class="mt-1 text-sm leading-snug sm:leading-relaxed"
												style="color: var(--text-muted);"
											>
												{getTierAudienceLabel(tier.metadata)}
											</p>
										</div>
										<div class="mobile-price-block text-left sm:text-right">
											<div
												class="text-[2.18rem] leading-none font-bold sm:text-2xl"
												style="background: var(--btn-primary-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
											>
												{formatPrice(tier.price)}
											</div>
											<div class="text-xs sm:text-sm" style="color: var(--text-muted);">
												per account
											</div>
										</div>
									</div>

									<div
										class="mb-3 flex flex-wrap items-center gap-2 text-sm"
										style="color: var(--text-muted);"
									>
										<span>
											<span class="font-medium">{tier.visible_available}</span> accounts available
										</span>
										<span aria-hidden="true" class="opacity-60">•</span>
										<span>{getTierDeliveryModeLabel(tier)}</span>
										{#if tierStatus}
											<span class="tier-status-chip tier-status-chip--warning">
												{tierStatus.status}
											</span>
										{/if}
										{#if tier.reservations_active > 0}
											<span class="tier-status-chip tier-status-chip--soft">
												{tier.reservations_active} reserved
											</span>
										{/if}
									</div>

									{#if tierFeatures.length > 0}
										<div class="mb-3 sm:hidden">
											<div class="flex flex-wrap gap-2">
												{#each topFeatures as feature, featureIndex (featureIndex)}
													<span class="mobile-feature-pill">
														<Star class="h-3.5 w-3.5" />
														{feature}
													</span>
												{/each}
											</div>
										</div>
										<div class="mb-6 hidden sm:block">
											<h4 class="mb-3 text-sm font-semibold" style="color: var(--text);">
												Tier Features:
											</h4>
											<div class="space-y-2">
												{#each tierFeatures as feature, featureIndex (featureIndex)}
													<div
														class="flex items-start gap-2 text-sm"
														style="color: var(--text-muted);"
													>
														<Star class="mt-0.5 h-3 w-3 flex-shrink-0 text-green-500" />
														<span>{feature}</span>
													</div>
												{/each}
											</div>
										</div>
									{/if}

									{#if hasExpandableDetails}
										<button
											type="button"
											data-card-action
											onclick={() => toggleTierDetails(tier.category_id)}
											class="mb-4 inline-flex items-center gap-1 text-xs font-semibold sm:hidden"
											style="color: var(--link);"
										>
											{isExpanded ? 'Less details' : 'More details'}
											<ChevronRight
												class={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
											/>
										</button>
									{/if}

									{#if isExpanded}
										<div
											class="mb-4 space-y-2 rounded-lg p-3 sm:hidden"
											style="background: var(--bg-elev-1); border: 1px solid var(--border);"
										>
											{#if additionalFeatures.length > 0}
												<div class="space-y-1.5">
													{#each additionalFeatures as feature, featureIndex (featureIndex)}
														<div
															class="flex items-start gap-2 text-sm"
															style="color: var(--text-muted);"
														>
															<Star class="mt-0.5 h-3 w-3 flex-shrink-0 text-green-500" />
															<span>{feature}</span>
														</div>
													{/each}
												</div>
											{/if}
											{#if tier.description}
												<p class="text-sm leading-relaxed" style="color: var(--text-muted);">
													{tier.description}
												</p>
											{/if}
											{#if tier.metadata?.age_hint}
												<div
													class="flex items-center gap-2 text-sm"
													style="color: var(--text-muted);"
												>
													<Users class="h-4 w-4" />
													<span class="font-medium">Account Age:</span>
													<span>{tier.metadata.age_hint}</span>
												</div>
											{/if}
											{#if getTierManualHandoverPromise(tier)}
												<p class="text-xs" style="color: var(--text-muted);">
													{getTierManualHandoverPromise(tier)}
												</p>
											{/if}
										</div>
									{/if}

									{#if tier.metadata?.age_hint}
										<div
											class="mb-4 hidden rounded-lg p-3 sm:block"
											style="background: var(--bg-elev-1); border: 1px solid var(--border);"
										>
											<div
												class="flex items-center gap-2 text-sm"
												style="color: var(--text-muted);"
											>
												<Users class="h-4 w-4" />
												<span class="font-medium">Account Age:</span>
												<span>{tier.metadata.age_hint}</span>
											</div>
										</div>
									{/if}

									{#if getTierManualHandoverPromise(tier)}
										<p class="mt-1 mb-4 hidden text-xs sm:block" style="color: var(--text-muted);">
											{getTierManualHandoverPromise(tier)}
										</p>
									{/if}
								</div>

								<div class="mx-4 mt-1 mb-4 space-y-2 sm:mx-6 sm:mt-6 sm:mb-6">
									{#if tier.visible_available === 0}
										<button
											type="button"
											onclick={() => subscribeToRestock(tier)}
											disabled={isTierRestockLoading(tier.category_id) ||
												isTierRestockSubscribed(tier.category_id)}
											data-card-action
											aria-label={`Notify me for ${tier.tier_name}`}
											class="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-center font-semibold transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:active:scale-100"
											style="background: var(--btn-primary-gradient); color: #04140C;"
										>
											{#if isTierRestockLoading(tier.category_id)}
												<span>Saving...</span>
											{:else if isTierRestockSubscribed(tier.category_id)}
												<CheckCircle class="h-4 w-4" />
												<span>You'll be notified</span>
											{:else}
												<BellRing class="h-4 w-4" />
												<span>Notify me</span>
											{/if}
										</button>
									{:else}
										<button
											type="button"
											onclick={() => openQuickAddModal(tier)}
											data-card-action
											aria-label={`Quick add ${tier.tier_name}`}
											class="flex w-full items-center justify-center gap-2 rounded-lg border border-transparent py-3 text-center font-semibold transition-all focus-visible:ring-2 focus-visible:ring-[#7CFFC0] focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.99] active:border-[#7CFFC0] active:shadow-[0_0_0_2px_rgba(52,211,153,0.45)]"
											style="background: var(--btn-primary-gradient); color: #04140C;"
										>
											<ShoppingCart class="h-4 w-4" />
											<span>Add to Cart</span>
										</button>
									{/if}

									<a
										href={getTierRoute(tier.tier_slug)}
										data-card-action
										class="hidden w-full items-center justify-center gap-1 rounded-lg py-3 text-center text-sm font-semibold transition-colors hover:opacity-90 sm:inline-flex"
										style="border: 1px solid var(--border); background: var(--bg-elev-1); color: var(--text);"
										aria-label={`View samples for ${tier.tier_name}`}
									>
										View Samples
										<ChevronRight class="h-4 w-4" />
									</a>
									<a
										href={getTierRoute(tier.tier_slug)}
										data-card-action
										class="inline-flex w-full items-center justify-center gap-1 py-1 text-center text-sm font-semibold sm:hidden"
										style="color: var(--text-muted);"
										aria-label={`View samples for ${tier.tier_name}`}
									>
										View Samples
										<ChevronRight class="h-4 w-4" />
									</a>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		{#if quickAddOpen && quickAddTier}
			{@const quickAddRemaining = getQuickAddRemainingQuantity()}
			<div
				class="fixed inset-0 z-40 bg-black/70 backdrop-blur-[1px]"
				role="button"
				tabindex={0}
				aria-label="Close quick add"
				onclick={closeQuickAddModal}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						closeQuickAddModal();
					}
				}}
			></div>

			<div class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
				<div
					bind:this={quickAddDialog}
					role="dialog"
					aria-modal="true"
					aria-labelledby="quick-add-title"
					tabindex="-1"
					class="w-full max-w-md rounded-2xl p-5 shadow-xl sm:p-6"
					style="background: var(--bg-elev-2); border: 1px solid var(--border);"
				>
					<div class="mb-5 flex items-start justify-between">
						<div>
							<h3 id="quick-add-title" class="text-lg font-semibold" style="color: var(--text);">
								Select Quantity
							</h3>
							<p class="mt-1 text-sm" style="color: var(--text-muted);">
								Choose how many accounts you want to add now.
							</p>
						</div>
						<button
							bind:this={quickAddCloseButton}
							type="button"
							onclick={closeQuickAddModal}
							class="rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							style="color: var(--text-muted);"
							aria-label="Close quick add"
						>
							<X class="h-5 w-5" />
						</button>
					</div>

					<div
						class="mb-5 rounded-xl p-4"
						style="background: var(--bg-elev-1); border: 1px solid var(--border);"
					>
						<div class="flex items-start justify-between gap-4">
							<div>
								<p class="text-sm font-medium" style="color: var(--text);">
									{quickAddTier.tier_name}
								</p>
								<p class="mt-1 text-xs" style="color: var(--text-muted);">
									{getTierAudienceLabel(quickAddTier.metadata)}
								</p>
							</div>
							<p class="text-base font-semibold" style="color: var(--primary);">
								{formatPrice(quickAddTier.price)}
							</p>
						</div>
					</div>

					<div class="mb-5">
						<div
							class="mb-2 flex items-center justify-between text-sm"
							style="color: var(--text-muted);"
						>
							<span>Quantity</span>
							<span>Maximum: {quickAddRemaining} available</span>
						</div>
						<div
							class="flex items-center justify-between rounded-lg px-3 py-2"
							style="border: 1px solid var(--border);"
						>
							<button
								type="button"
								onclick={decreaseQuickAddQuantity}
								disabled={quickAddQuantity <= 1 || quickAddSubmitting}
								class="flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
								style="background: var(--bg-elev-1); color: var(--text);"
								aria-label="Decrease quantity"
							>
								<Minus class="h-4 w-4" />
							</button>
							<div class="text-center">
								<div class="text-xl font-bold" style="color: var(--text);">{quickAddQuantity}</div>
								<div class="text-xs" style="color: var(--text-muted);">
									{quickAddQuantity === 1 ? 'account' : 'accounts'}
								</div>
							</div>
							<button
								type="button"
								onclick={increaseQuickAddQuantity}
								disabled={quickAddQuantity >= quickAddRemaining || quickAddSubmitting}
								class="flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
								style="background: var(--bg-elev-1); color: var(--text);"
								aria-label="Increase quantity"
							>
								<Plus class="h-4 w-4" />
							</button>
						</div>
					</div>

					<div
						class="mb-5 rounded-xl p-4"
						style="background: var(--bg-elev-1); border: 1px solid var(--border);"
					>
						<div
							class="flex items-center justify-between text-sm"
							style="color: var(--text-muted);"
						>
							<span>Price per account:</span>
							<span>{formatPrice(quickAddTier.price)}</span>
						</div>
						<div
							class="mt-1 flex items-center justify-between text-sm"
							style="color: var(--text-muted);"
						>
							<span>Quantity:</span>
							<span>x{quickAddQuantity}</span>
						</div>
						<div class="my-3 h-px" style="background: var(--border);"></div>
						<div
							class="flex items-center justify-between text-base font-semibold"
							style="color: var(--text);"
						>
							<span>Total:</span>
							<span style="color: var(--primary);">{formatPrice(getQuickAddTotalPrice())}</span>
						</div>
					</div>

					{#if quickAddRemaining <= lowStockThreshold && quickAddRemaining > 0}
						<div
							class="mb-4 rounded-lg border border-yellow-500/30 px-3 py-2 text-sm text-yellow-500"
							style="background: var(--bg-elev-1);"
						>
							<div class="flex items-center gap-2">
								<AlertTriangle class="h-4 w-4" />
								<span>Only {quickAddRemaining} accounts left in stock!</span>
							</div>
						</div>
					{/if}

					<div class="space-y-3">
						<button
							type="button"
							onclick={addQuickAddToCart}
							disabled={quickAddSubmitting || quickAddRemaining === 0}
							class="w-full rounded-full py-3 font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
							style="background: var(--btn-primary-gradient); color: #04140C;"
						>
							{#if quickAddSubmitting}
								<div class="flex items-center justify-center gap-2">
									<div
										class="h-4 w-4 animate-spin rounded-full border-2 border-[#04140C] border-t-transparent"
									></div>
									Adding to Cart...
								</div>
							{:else}
								<div class="flex items-center justify-center gap-2">
									<ShoppingCart class="h-4 w-4" />
									Add to Cart - {formatPrice(getQuickAddTotalPrice())}
								</div>
							{/if}
						</button>
						<a
							href={getTierRoute(quickAddTier.tier_slug)}
							class="inline-flex w-full items-center justify-center gap-1 text-sm underline-offset-2 transition-colors hover:underline"
							style="color: var(--link);"
						>
							View full details
							<ChevronRight class="h-4 w-4" />
						</a>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</main>

<Footer />

<style>
	.mobile-tier-control-sticky {
		position: sticky;
		top: 4.2rem;
		z-index: 25;
		margin: 0 -0.25rem 0.9rem;
		padding: 0.35rem 0.25rem 0.45rem;
		background: linear-gradient(180deg, rgba(3, 10, 22, 0.95), rgba(3, 10, 22, 0.85));
		border-radius: 14px;
		backdrop-filter: blur(5px);
	}

	.mobile-tier-control-row {
		display: flex;
		gap: 0.55rem;
		overflow-x: auto;
		padding: 0.1rem;
		scrollbar-width: none;
	}

	.mobile-tier-control-row::-webkit-scrollbar {
		display: none;
	}

	.mobile-tier-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		white-space: nowrap;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.03);
		color: var(--text);
		padding: 0.46rem 0.82rem;
		font-size: 0.79rem;
		font-weight: 600;
		transition:
			border-color 180ms ease,
			background-color 180ms ease,
			color 180ms ease;
	}

	.mobile-tier-chip.active {
		border-color: rgba(5, 212, 113, 0.5);
		background: rgba(5, 212, 113, 0.16);
		color: rgb(167, 243, 208);
	}

	.mobile-feature-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border-radius: 999px;
		border: 1px solid rgba(5, 212, 113, 0.32);
		background: rgba(5, 212, 113, 0.08);
		color: rgb(209, 250, 229);
		padding: 0.32rem 0.62rem;
		font-size: 0.74rem;
		font-weight: 600;
		line-height: 1.1;
	}

	.tier-status-chip {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.24);
		padding: 0.18rem 0.56rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		line-height: 1.15;
	}

	.tier-status-chip--warning {
		border-color: rgba(251, 191, 36, 0.35);
		background: rgba(251, 191, 36, 0.16);
		color: rgb(251, 191, 36);
	}

	.tier-status-chip--soft {
		border-color: rgba(250, 204, 21, 0.22);
		background: rgba(250, 204, 21, 0.1);
		color: rgb(250, 204, 21);
	}

	.card-merch-tags {
		position: absolute;
		top: 0;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		pointer-events: none;
		max-width: calc(100% - 2rem);
	}

	.card-merch-tags {
		left: 0.95rem;
		transform: translateY(-52%);
	}

	.card-border-chip {
		position: relative;
		display: inline-flex;
		align-items: center;
		overflow: hidden;
		white-space: nowrap;
		max-width: 100%;
		text-overflow: ellipsis;
		border-radius: 9999px;
		border: 1px solid rgba(251, 191, 36, 0.35);
		background: rgba(251, 191, 36, 0.18);
		color: rgb(251, 191, 36);
		padding: 0.3rem 0.7rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	.card-border-chip--featured {
		border-color: rgba(34, 197, 94, 0.35);
		background: rgba(34, 197, 94, 0.18);
		color: rgb(134, 239, 172);
	}

	.card-border-chip--warning {
		border-color: rgba(251, 191, 36, 0.35);
		background: rgba(251, 191, 36, 0.18);
		color: rgb(251, 191, 36);
	}

	.card-border-chip--hot {
		border-color: rgba(248, 113, 113, 0.45);
		background: rgba(248, 113, 113, 0.14);
		color: rgb(254, 202, 202);
	}

	.card-border-chip--gloss::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			120deg,
			rgba(255, 255, 255, 0) 20%,
			rgba(255, 255, 255, 0.35) 45%,
			rgba(255, 255, 255, 0) 70%
		);
		transform: translateX(-130%);
		animation: chipGlossSweep 4.2s ease-in-out infinite;
	}

	@keyframes chipGlossSweep {
		0%,
		18% {
			transform: translateX(-130%);
		}
		45% {
			transform: translateX(130%);
		}
		100% {
			transform: translateX(130%);
		}
	}

	@media (min-width: 640px) {
		.mobile-price-block > div:first-child {
			font-size: 1.5rem;
			line-height: 1.15;
		}
	}
</style>
