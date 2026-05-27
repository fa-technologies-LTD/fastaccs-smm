<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import {
		ShoppingCart,
		Users,
		Package,
		Plus,
		Minus,
		Shield,
		CheckCircle,
		ChevronRight,
		BellRing,
		AlertTriangle,
		ExternalLink
	} from '$lib/icons';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import ImagePreviewModal from '$lib/components/ImagePreviewModal.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { showError, showWarning, showSuccess } from '$lib/stores/toasts';
	import type { PageData } from './$types';
	import { getPlatformColor, getPlatformIcon } from '$lib/helpers/platformColors';
	import { formatPrice } from '$lib/helpers/utils';
	import { getTierSampleScreenshotUrls } from '$lib/helpers/tierSampleScreenshots';
	import { buildCloudinaryOptimizedImageUrl } from '$lib/helpers/cloudinary';
	import {
		DEFAULT_LOGIN_GUIDE_LABEL,
		DEFAULT_LOGIN_GUIDE_URL,
		getTierDeliveryConfig,
		getTierDeliveryModeLabel,
		type TierDeliveryMode
	} from '$lib/helpers/tier-delivery-config';
	import { trackSnapEvent } from '$lib/services/snap-pixel';
	import { getTierExactPreviewConfig } from '$lib/helpers/tier-exact-preview';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Reactive state for quantity selection
	let selectedQuantity = $state(1);
	let addingToCart = $state(false);
	let notifyLoading = $state(false);
	let notifySubscribed = $state(false);
	let autoSubscribeHandled = $state(false);
	let samplePreviewOpen = $state(false);
	let samplePreviewIndex = $state(0);
	let isCompactViewport = $state(false);
	let exactPreviewLoading = $state(false);
	let exactPreviewReserving = $state<string | null>(null);
	let exactPreviewError = $state<string | null>(null);
	let exactPreviewAccounts = $state<
		Array<{
			accountId: string;
			displayLabel: string;
			profileUrl: string;
			screenshotUrl: string | null;
			tags: string[];
			reservedUntil: string | null;
			isReservedByCurrentUser: boolean;
		}>
	>([]);
	let activeExactReservation = $state<{
		accountId: string;
		displayLabel: string;
		profileUrl: string;
		screenshotUrl: string | null;
		tags: string[];
		reservedUntil: string | null;
		isReservedByCurrentUser: boolean;
	} | null>(null);
	const currentUser = $derived((page.data as { user?: { id: string } | null }).user || null);
	const tierSampleScreenshots = $derived(getTierSampleScreenshotUrls(data.tier?.metadata));
	const tierSampleScreenshotsGallery = $derived(
		tierSampleScreenshots.map((url) => buildCloudinaryOptimizedImageUrl(url, { width: 720 }))
	);
	const tierSampleScreenshotsModal = $derived(
		tierSampleScreenshots.map((url) => buildCloudinaryOptimizedImageUrl(url, { width: 1280 }))
	);
	const tierDeliveryConfig = $derived(getTierDeliveryConfig(data.tier?.metadata));
	const exactPreviewConfig = $derived(getTierExactPreviewConfig(data.tier?.metadata));
	const tierLoginGuideUrl = $derived(tierDeliveryConfig.loginGuideUrl || DEFAULT_LOGIN_GUIDE_URL);
	const tierLoginGuideLabel = $derived(
		tierDeliveryConfig.loginGuideLabel || DEFAULT_LOGIN_GUIDE_LABEL
	);
	const lowStockThreshold = $derived(Math.max(1, Number(data.lowStockThreshold || 10)));
	const compactTierLabel = $derived(
		isCompactViewport
			? getCompactTierLabel(data.tier?.tier_name || '')
			: (data.tier?.tier_name ?? 'Tier')
	);

	// Format follower count
	function formatFollowers(count: number): string {
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(1)}M`;
		} else if (count >= 1000) {
			return `${(count / 1000).toFixed(1)}K`;
		}
		return count.toString();
	}

	function getCompactTierLabel(label: string): string {
		const normalized = String(label || '')
			.trim()
			.replace(/\bfollowers?\b/gi, 'F')
			.replace(/\baccounts?\b/gi, '')
			.replace(/\s+/g, ' ')
			.trim()
			.replace(/(\d)\s+F\b/g, '$1F');

		if (!normalized) return 'Tier';
		return normalized.length > 20 ? `${normalized.slice(0, 19)}…` : normalized;
	}

	// Navigation functions
	function goBackToPlatform() {
		goto(`/platforms/${data.platform?.slug}`);
	}

	function goBackToPlatforms() {
		goto('/platforms');
	}

	// Quantity controls
	function decreaseQuantity() {
		if (selectedQuantity > 1) {
			selectedQuantity--;
		}
	}

	function increaseQuantity() {
		if (!data.tierCategory || !data.tier) return;

		// Check existing quantity in cart for this tier
		const existingCartItem = cart.items.find((item) => item.tierId === data.tierCategory.id);
		const currentCartQuantity = existingCartItem ? existingCartItem.quantity : 0;
		const maxAllowedSelection = data.tier.visible_available - currentCartQuantity;

		if (selectedQuantity < maxAllowedSelection) {
			selectedQuantity++;
		}
	}

	// Calculate total price
	const totalPrice = $derived((data.tier?.price || 0) * selectedQuantity);

	// Format feature names from snake_case to Title Case
	function formatFeatureName(feature: string): string {
		return feature
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join(' ');
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
		return features;
	}

	function getFeaturedBadgeLabel(): string {
		if (
			typeof data.tier?.featured_badge === 'string' &&
			data.tier.featured_badge.trim().length > 0
		) {
			return data.tier.featured_badge.trim();
		}
		return 'Featured';
	}

	function getSnapTierPayload(quantity = selectedQuantity) {
		return {
			item_ids: data.tierCategory?.id ? [data.tierCategory.id] : [],
			item_category: data.platform?.name || 'FastAccs SMM',
			description: data.tier?.tier_name || 'FastAccs tier',
			price: (data.tier?.price || 0) * quantity,
			currency: 'NGN',
			number_items: quantity
		};
	}

	// Add to cart functionality
	async function addToCart() {
		if (!data.tierCategory || !data.tier || addingToCart) return;

		addingToCart = true;
		try {
			let compatibility: { compatible: boolean; existingMode: TierDeliveryMode | null };
			try {
				compatibility = await cart.ensureDeliveryModeCompatibility(
					data.tierCategory.id,
					tierDeliveryConfig.mode
				);
			} catch (error) {
				console.error('Failed to validate cart delivery mode compatibility:', error);
				showError('Could not update cart', 'Please try again.');
				return;
			}

			if (!compatibility.compatible) {
				const incomingLabel = getTierDeliveryModeLabel(tierDeliveryConfig.mode);
				const existingLabel = compatibility.existingMode
					? getTierDeliveryModeLabel(compatibility.existingMode)
					: getTierDeliveryModeLabel('instant_auto');
				const shouldReplace = window.confirm(
					`You already have ${existingLabel} item(s) in your cart.\n\n${incomingLabel} items must be checked out separately.\n\nPress OK to clear your cart and add this item, or Cancel to keep your current cart.`
				);

				if (!shouldReplace) {
					return;
				}

				cart.clear();
				showWarning('Cart cleared', `Previous ${existingLabel} items were removed.`);
			}

			// Check existing quantity in cart for this tier
			const existingCartItem = cart.items.find((item) => item.tierId === data.tierCategory.id);
			if (existingCartItem?.exactAccount) {
				showWarning(
					'Exact account already selected',
					`${existingCartItem.exactAccount.displayLabel} is already reserved in your cart. Continue to checkout or remove it before adding this tier normally.`
				);
				return;
			}
			const currentCartQuantity = existingCartItem ? existingCartItem.quantity : 0;
			const totalQuantityAfterAdd = currentCartQuantity + selectedQuantity;

			// Validate total quantity doesn't exceed available stock
			if (totalQuantityAfterAdd > data.tier.visible_available) {
				const remainingStock = data.tier.visible_available - currentCartQuantity;
				if (remainingStock <= 0) {
					showWarning(
						'Maximum quantity reached',
						`You already have the maximum available quantity (${data.tier.visible_available}) for this tier in your cart.`
					);
				} else {
					showWarning(
						'Quantity limit exceeded',
						`Only ${remainingStock} more accounts can be added to your cart for this tier. You already have ${currentCartQuantity} in your cart.`
					);
				}
				return;
			}

			// Add to cart using new system
			cart.addTier(data.tierCategory.id, selectedQuantity);
			trackSnapEvent('ADD_CART', getSnapTierPayload(selectedQuantity));

			// Success - show proper notification
			showSuccess(
				'Added to cart!',
				`${selectedQuantity} ${data.tier.tier_name} ${selectedQuantity === 1 ? 'account' : 'accounts'} added successfully. Click to view cart.`,
				6000,
				'/checkout'
			);

			// Reset quantity to 1 after adding
			selectedQuantity = 1;
		} catch (error) {
			console.error('Error adding to cart:', error);
			showError(
				'Failed to add to cart',
				'Please try again or contact support if the problem persists.'
			);
		} finally {
			addingToCart = false;
		}
	}

	async function loadNotifySubscriptionStatus(): Promise<void> {
		if (!currentUser || !data.tierCategory || data.tier.visible_available > 0) return;

		try {
			const response = await fetch(
				`/api/restock-subscriptions?tierId=${encodeURIComponent(data.tierCategory.id)}`
			);
			if (!response.ok) return;
			const result = await response.json();
			notifySubscribed = Boolean(result?.data?.subscribed);
		} catch (error) {
			console.error('Failed to load restock subscription status:', error);
		}
	}

	async function subscribeForRestock(): Promise<void> {
		if (!data.tierCategory || notifyLoading || notifySubscribed) return;

		if (!currentUser) {
			const nextUrl = new URL(page.url);
			nextUrl.searchParams.set('notifyRestock', '1');
			const returnUrl = encodeURIComponent(nextUrl.pathname + nextUrl.search);
			goto(`/auth/login?returnUrl=${returnUrl}`);
			return;
		}

		notifyLoading = true;
		try {
			const response = await fetch('/api/restock-subscriptions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tierId: data.tierCategory.id })
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				showError('Subscription failed', result.error || 'Unable to subscribe right now.');
				return;
			}

			notifySubscribed = true;
			showSuccess('Subscribed', result.message || "You'll be notified when this tier is back.");
		} catch (error) {
			console.error('Failed to subscribe for restock:', error);
			showError('Subscription failed', 'Unable to subscribe right now. Please try again.');
		} finally {
			notifyLoading = false;
		}
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

	function openSamplePreview(index: number): void {
		samplePreviewIndex = index;
		samplePreviewOpen = true;
	}

	async function loadExactPreviewAccounts(): Promise<void> {
		if (!exactPreviewConfig.enabled || !currentUser || !data.tierCategory) return;
		exactPreviewLoading = true;
		exactPreviewError = null;
		try {
			const response = await fetch(
				`/api/exact-preview/tiers/${encodeURIComponent(data.tierCategory.id)}`
			);
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Could not load exact accounts.');
			}

			exactPreviewAccounts = Array.isArray(result.data?.accounts) ? result.data.accounts : [];
			activeExactReservation = result.data?.activeReservation || null;
		} catch (error) {
			console.error('Failed to load exact preview accounts:', error);
			exactPreviewError =
				error instanceof Error ? error.message : 'Could not load exact accounts right now.';
		} finally {
			exactPreviewLoading = false;
		}
	}

	async function chooseExactAccount(account: {
		accountId: string;
		displayLabel: string;
		profileUrl: string;
		screenshotUrl?: string | null;
		tags?: string[];
	}): Promise<void> {
		if (!data.tierCategory || exactPreviewReserving) return;
		if (!currentUser) {
			const returnUrl = encodeURIComponent(page.url.pathname + page.url.search);
			goto(`/auth/login?returnUrl=${returnUrl}`);
			return;
		}

		exactPreviewReserving = account.accountId;
		try {
			const compatibility = await cart.ensureDeliveryModeCompatibility(
				data.tierCategory.id,
				tierDeliveryConfig.mode
			);
			if (!compatibility.compatible) {
				const incomingLabel = getTierDeliveryModeLabel(tierDeliveryConfig.mode);
				const existingLabel = compatibility.existingMode
					? getTierDeliveryModeLabel(compatibility.existingMode)
					: getTierDeliveryModeLabel('instant_auto');
				const shouldReplace = window.confirm(
					`You already have ${existingLabel} item(s) in your cart.\n\n${incomingLabel} items must be checked out separately.\n\nPress OK to clear your cart and reserve this exact account, or Cancel to keep your current cart.`
				);
				if (!shouldReplace) return;
				cart.clear();
				showWarning('Cart cleared', `Previous ${existingLabel} items were removed.`);
			}

			const response = await fetch('/api/exact-preview/reserve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tierId: data.tierCategory.id,
					accountId: account.accountId
				})
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Could not reserve this account.');
			}

			cart.addExactTier(data.tierCategory.id, {
				accountId: result.data.accountId,
				displayLabel: result.data.displayLabel,
				profileUrl: result.data.profileUrl,
				screenshotUrl: result.data.screenshotUrl || null,
				reservedUntil: result.data.reservedUntil
			});

			activeExactReservation = {
				accountId: result.data.accountId,
				displayLabel: result.data.displayLabel,
				profileUrl: result.data.profileUrl,
				screenshotUrl: result.data.screenshotUrl || null,
				tags: Array.isArray(result.data.tags) ? result.data.tags : [],
				reservedUntil: result.data.reservedUntil,
				isReservedByCurrentUser: true
			};
			selectedQuantity = 1;
			showSuccess(
				`${result.data.displayLabel} reserved`,
				'This exact account is in your cart for checkout.',
				6000,
				'/checkout'
			);
			await loadExactPreviewAccounts();
		} catch (error) {
			console.error('Failed to reserve exact account:', error);
			showError(
				'Could not reserve account',
				error instanceof Error ? error.message : 'Please choose another account.'
			);
		} finally {
			exactPreviewReserving = null;
		}
	}

	onMount(() => {
		if (data.tier && data.tierCategory) {
			trackSnapEvent('VIEW_CONTENT', getSnapTierPayload(1));
		}

		const updateViewportMode = () => {
			isCompactViewport = window.innerWidth < 520;
		};

		updateViewportMode();
		window.addEventListener('resize', updateViewportMode);

		void (async () => {
			await loadNotifySubscriptionStatus();
			await loadExactPreviewAccounts();

			const shouldAutoSubscribe =
				Boolean(currentUser) &&
				!notifySubscribed &&
				!autoSubscribeHandled &&
				data.tier.visible_available === 0 &&
				page.url.searchParams.get('notifyRestock') === '1';

			if (shouldAutoSubscribe) {
				autoSubscribeHandled = true;
				await subscribeForRestock();

				const cleaned = new URL(window.location.href);
				cleaned.searchParams.delete('notifyRestock');
				window.history.replaceState({}, '', cleaned.pathname + cleaned.search);
			}
		})();

		return () => {
			window.removeEventListener('resize', updateViewportMode);
		};
	});
</script>

<svelte:head>
	<title>{data.platform?.name} {data.tier?.tier_name} - FastAccs</title>
	<meta
		name="description"
		content="Buy {data.platform?.name} accounts with {data.tier?.metadata?.follower_range
			?.display ||
			`${formatFollowers(data.tier?.metadata?.follower_range?.min || 0)} - ${formatFollowers(data.tier?.metadata?.follower_range?.max || 0)}` ||
			data.tier?.metadata?.follower_count ||
			0} followers. Premium quality accounts with instant delivery and full access."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-[var(--color-background)]">
	{#if !data.platform || !data.tier}
		<!-- Not found -->
		<section class="py-16">
			<div class="mx-auto max-w-4xl px-4 text-center">
				<Package class="mx-auto mb-4 h-16 w-16 text-[var(--color-text-muted)]" />
				<h1 class="mb-4 text-3xl font-bold text-[var(--color-text-primary)]">Tier Not Found</h1>
				<p class="mb-8 text-lg text-[var(--color-text-secondary)]">
					The tier you're looking for doesn't exist or isn't available right now.
				</p>
				<div class="flex justify-center gap-4">
					<button
						onclick={goBackToPlatforms}
						class="rounded-full bg-[var(--color-surface)] px-6 py-3 font-semibold text-[var(--color-text-primary)] transition-all hover:bg-[var(--color-surface-hover)] active:scale-95"
					>
						All Platforms
					</button>
				</div>
			</div>
		</section>
	{:else}
		{@const PlatformIcon = getPlatformIcon(data.platform.slug)}
		{@const tierStatus = getTierStatus(data.tier.visible_available)}

		<section class="bg-[var(--color-card)] py-2 shadow-sm sm:py-3">
			<div class="mx-auto max-w-6xl px-4">
				<Breadcrumb
					items={[
						{ label: 'Platforms', href: '/platforms' },
						{ label: data.platform.name, href: `/platforms/${data.platform.slug}` },
						{ label: compactTierLabel, active: true }
					]}
				/>
			</div>
		</section>

		<section
			class={`bg-gradient-to-r ${getPlatformColor(data.platform.slug)} py-4 text-white sm:py-5`}
		>
			<div class="mx-auto max-w-6xl px-4">
				<div class="rounded-xl border border-white/15 bg-black/15 p-4 sm:p-5">
					<div class="flex items-start gap-3">
						<div class="rounded-full bg-white/20 p-2.5">
							<PlatformIcon class="h-7 w-7 sm:h-9 sm:w-9" />
						</div>
						<div class="min-w-0 flex-1">
							<h1 class="text-xl leading-tight font-bold sm:text-2xl">{data.tier.tier_name}</h1>
							{#if data.tier.is_pinned || data.tier.is_featured}
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#if data.tier.is_pinned}
										<span
											class="tag-chip inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
											style="background: rgba(251, 191, 36, 0.22); color: rgb(251, 191, 36); border: 1px solid rgba(251, 191, 36, 0.4);"
										>
											Pinned{data.tier.pin_priority ? ` #${data.tier.pin_priority}` : ''}
										</span>
									{/if}
									{#if data.tier.is_featured}
										<span
											class="tag-chip inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
											style="background: rgba(34, 197, 94, 0.24); color: rgb(187, 247, 208); border: 1px solid rgba(34, 197, 94, 0.35);"
										>
											{getFeaturedBadgeLabel()}
										</span>
									{/if}
								</div>
							{/if}
							<p class="mt-2 text-sm leading-relaxed opacity-90 sm:text-base">
								{#if data.tier.metadata?.follower_range}
									{@const range = data.tier.metadata.follower_range}
									{data.platform.name} accounts with {range.display ||
										`${formatFollowers(range.min || 0)} - ${formatFollowers(range.max || 0)}`} followers
								{:else}
									{data.platform.name} accounts with {formatFollowers(
										(data.tier.metadata?.follower_count as number) || 0
									)}
									followers
								{/if}
							</p>
							<div class="mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
								<span
									class="rounded-full border border-white/20 bg-black/20 px-2.5 py-1 font-semibold"
								>
									{formatPrice(data.tier.price)} / account
								</span>
								<span>{data.tier.visible_available} available</span>
								<span
									class="rounded-full border px-2 py-0.5 font-semibold"
									style={tierDeliveryConfig.mode === 'manual_handover'
										? 'background: rgba(59, 130, 246, 0.18); color: rgb(147, 197, 253); border-color: rgba(147, 197, 253, 0.28);'
										: 'background: rgba(5, 212, 113, 0.15); color: rgb(5, 212, 113); border-color: rgba(5, 212, 113, 0.25);'}
								>
									{getTierDeliveryModeLabel(tierDeliveryConfig.mode)}
								</span>
								{#if tierStatus}
									<span
										class="rounded-full border border-yellow-300/30 bg-yellow-500/20 px-2 py-0.5 font-semibold text-yellow-100"
									>
										{tierStatus.status}
									</span>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section class="pt-4 pb-28 sm:pt-6 lg:pb-12">
			<div class="mx-auto max-w-6xl px-4">
				<div class="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-7">
					<div class="order-1 space-y-5 lg:col-span-2">
						{#if tierSampleScreenshots.length > 0}
							<div class="rounded-xl bg-[var(--color-card)] p-4 shadow sm:p-5">
								<div class="mb-2 flex items-center justify-between gap-2">
									<h2 class="text-lg font-bold text-[var(--color-text-primary)] sm:text-xl">
										Sample Screenshots
									</h2>
									<span class="text-xs text-[var(--color-text-muted)]">
										{tierSampleScreenshots.length} sample{tierSampleScreenshots.length === 1
											? ''
											: 's'}
									</span>
								</div>
								<p class="mb-3 text-sm text-[var(--color-text-muted)]">
									Preview examples before checkout. Delivered accounts may vary slightly.
								</p>
								<div class="sample-screenshot-scroll">
									{#each tierSampleScreenshotsGallery as screenshotUrl, screenshotIndex (screenshotUrl)}
										<button
											type="button"
											class="sample-screenshot-item"
											onclick={() => openSamplePreview(screenshotIndex)}
											aria-label={`View sample screenshot ${screenshotIndex + 1}`}
										>
											<img
												src={screenshotUrl}
												alt={`${data.tier.tier_name} sample screenshot ${screenshotIndex + 1}`}
												class="h-full w-full object-cover"
												loading="lazy"
												decoding="async"
											/>
										</button>
									{/each}
								</div>
							</div>
						{/if}

						{#if exactPreviewConfig.enabled}
							<div class="rounded-xl bg-[var(--color-card)] p-4 shadow sm:p-5">
								<div class="mb-3 flex items-start justify-between gap-3">
									<div>
										<h2 class="text-lg font-bold text-[var(--color-text-primary)] sm:text-xl">
											Exact Accounts Available
										</h2>
										<p class="mt-1 text-sm text-[var(--color-text-muted)]">
											Open a live profile link, then choose the exact account you want.
										</p>
									</div>
									<span
										class="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
										style="border-color: rgba(5, 212, 113, 0.24); background: rgba(5, 212, 113, 0.1); color: var(--color-accent);"
									>
										Logged-in only
									</span>
								</div>

								{#if !currentUser}
									<div
										class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
									>
										<p class="text-sm text-[var(--color-text-secondary)]">
											Log in to view exact available profile links for this tier.
										</p>
										<button
											type="button"
											class="mt-3 rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-95"
											style="background: var(--btn-primary-gradient); color: #04140C;"
											onclick={() => {
												const returnUrl = encodeURIComponent(page.url.pathname + page.url.search);
												goto(`/auth/login?returnUrl=${returnUrl}`);
											}}
										>
											Log in to view accounts
										</button>
									</div>
								{:else if exactPreviewLoading}
									<div
										class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]"
									>
										Loading exact accounts...
									</div>
								{:else if exactPreviewError}
									<div
										class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
									>
										{exactPreviewError}
									</div>
								{:else if exactPreviewAccounts.length === 0}
									<div
										class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]"
									>
										No exact preview links are available right now. You can still use the sample
										previews or check back later.
									</div>
								{:else}
									<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
										{#each exactPreviewAccounts as account (account.accountId)}
											<div
												class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
											>
												{#if account.screenshotUrl}
													<a
														href={account.profileUrl}
														target="_blank"
														rel="noopener noreferrer"
														class="mb-3 block overflow-hidden rounded-lg border border-[var(--color-border)] bg-black/20"
													>
														<img
															src={account.screenshotUrl}
															alt={`${account.displayLabel} public preview`}
															class="aspect-[16/10] w-full object-cover"
															loading="lazy"
															decoding="async"
														/>
													</a>
												{/if}
												<div class="mb-3 flex items-center justify-between gap-2">
													<div>
														<p class="font-semibold text-[var(--color-text-primary)]">
															{account.displayLabel}
														</p>
														{#if account.isReservedByCurrentUser || activeExactReservation?.accountId === account.accountId}
															<p class="text-xs text-[var(--color-accent)]">Reserved for you</p>
														{:else}
															<p class="text-xs text-[var(--color-text-muted)]">Available</p>
														{/if}
													</div>
													{#if account.reservedUntil}
														<span class="text-[11px] text-[var(--color-text-muted)]">
															Held briefly
														</span>
													{/if}
												</div>
												{#if account.tags?.length}
													<div class="mb-3 flex flex-wrap gap-1.5">
														{#each account.tags as tag (tag)}
															<span
																class="rounded-full border px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)]"
																style="border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.045);"
															>
																{tag}
															</span>
														{/each}
													</div>
												{/if}

												<div class="flex flex-col gap-2 sm:flex-row">
													<a
														href={account.profileUrl}
														target="_blank"
														rel="noopener noreferrer"
														class="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition-all hover:bg-[var(--color-surface-hover)] active:scale-95"
													>
														<ExternalLink class="h-4 w-4" />
														View live profile
													</a>
													<button
														type="button"
														onclick={() => chooseExactAccount(account)}
														disabled={exactPreviewReserving === account.accountId ||
															account.isReservedByCurrentUser}
														class="inline-flex flex-1 items-center justify-center rounded-full px-3 py-2 text-sm font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
														style="background: var(--btn-primary-gradient); color: #04140C;"
													>
														{#if exactPreviewReserving === account.accountId}
															Reserving...
														{:else if account.isReservedByCurrentUser}
															Chosen
														{:else}
															Choose this
														{/if}
													</button>
												</div>
											</div>
										{/each}
									</div>
									<p class="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
										Only the public profile link is shown before payment. Login details are delivered
										after successful checkout.
									</p>
								{/if}
							</div>
						{/if}

						<div class="rounded-xl bg-[var(--color-card)] p-4 shadow sm:p-5">
							<h2 class="mb-3 text-lg font-bold text-[var(--color-text-primary)] sm:text-xl">
								Included
							</h2>
							{#if getTierFeatures(data.tier.metadata).length > 0 || data.tier.metadata?.age_hint}
								<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
									{#each getTierFeatures(data.tier.metadata) as feature}
										<div
											class="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)]"
										>
											<CheckCircle class="h-4 w-4 text-green-500" />
											<span>{feature}</span>
										</div>
									{/each}
									{#if data.tier.metadata?.age_hint}
										<div
											class="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)]"
										>
											<Users class="h-4 w-4 text-[var(--color-accent)]" />
											<span>{data.tier.metadata.age_hint}</span>
										</div>
									{/if}
								</div>
							{:else}
								<p class="text-sm text-[var(--color-text-muted)]">
									No additional feature tags available for this tier yet.
								</p>
							{/if}
						</div>
					</div>

					<div class="order-2 lg:col-span-1">
						<div class="rounded-xl bg-[var(--color-card)] p-4 shadow sm:p-5 lg:sticky lg:top-24">
							<h3 class="text-lg font-bold text-[var(--color-text-primary)] sm:text-xl">
								Buy This Tier
							</h3>
							<p class="mt-1 text-sm text-[var(--color-text-muted)]">
								How many accounts do you need?
							</p>

							<div
								class="mt-4 flex items-center gap-3"
								role="group"
								aria-labelledby="quantity-selector"
							>
								<button
									onclick={decreaseQuantity}
									disabled={selectedQuantity <= 1 || data.tier.visible_available === 0}
									class="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
									aria-label="Decrease quantity"
								>
									<Minus class="h-4 w-4" />
								</button>
								<div class="flex-1 text-center">
									<div class="text-2xl font-bold text-[var(--color-text-primary)]">
										{selectedQuantity}
									</div>
									<div class="text-xs text-[var(--color-text-muted)]">
										{selectedQuantity === 1 ? 'account' : 'accounts'}
									</div>
								</div>
								<button
									onclick={increaseQuantity}
									disabled={selectedQuantity >= data.tier.visible_available ||
										data.tier.visible_available === 0}
									class="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
									aria-label="Increase quantity"
								>
									<Plus class="h-4 w-4" />
								</button>
							</div>
							<div class="mt-2 text-xs text-[var(--color-text-muted)]">
								Max: {data.tier.visible_available} available
							</div>

							<div class="mt-4 rounded-lg bg-[var(--color-surface)] p-3">
								<div
									class="flex items-center justify-between text-sm text-[var(--color-text-secondary)]"
								>
									<span>Price per account</span>
									<span>{formatPrice(data.tier.price)}</span>
								</div>
								<div
									class="mt-1 flex items-center justify-between text-sm text-[var(--color-text-secondary)]"
								>
									<span>Quantity</span>
									<span>×{selectedQuantity}</span>
								</div>
								<div
									class="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-base font-semibold text-[var(--color-text-primary)]"
								>
									<span>Total</span>
									<span class="text-[var(--color-accent)]">{formatPrice(totalPrice)}</span>
								</div>
							</div>

							{#if data.tier.visible_available === 0}
								<button
									onclick={subscribeForRestock}
									disabled={notifyLoading || notifySubscribed}
									class="mt-4 hidden w-full rounded-full py-3.5 text-sm font-semibold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 lg:block"
									style="background: var(--btn-primary-gradient);"
								>
									{#if notifyLoading}
										Saving...
									{:else if notifySubscribed}
										You'll be notified
									{:else}
										Notify me when back in stock
									{/if}
								</button>
							{:else}
								<button
									onclick={addToCart}
									disabled={addingToCart}
									class="mt-4 hidden w-full rounded-full py-3.5 text-sm font-semibold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 lg:block"
									style="background: var(--btn-primary-gradient);"
								>
									{#if addingToCart}
										Adding to Cart...
									{:else}
										Add to Cart - {formatPrice(totalPrice)}
									{/if}
								</button>
							{/if}

							{#if data.tier.visible_available <= lowStockThreshold && data.tier.visible_available > 0}
								<div
									class="mt-3 rounded-lg border border-yellow-500/30 bg-[var(--color-surface)] p-2.5"
								>
									<div class="flex items-center gap-2 text-xs text-yellow-500">
										<AlertTriangle class="h-4 w-4" />
										<span>Only {data.tier.visible_available} accounts left in stock.</span>
									</div>
								</div>
							{/if}

							<details
								class="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
							>
								<summary
									class="cursor-pointer text-sm font-semibold text-[var(--color-text-primary)]"
								>
									Need help after purchase?
								</summary>
								<div class="mt-2">
									<p class="mb-2 text-xs text-[var(--color-text-muted)]">
										Quick setup steps for this tier are available here.
									</p>
									<a
										href={tierLoginGuideUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="text-sm font-medium underline"
										style="color: var(--color-accent);"
									>
										{tierLoginGuideLabel}
									</a>
								</div>
							</details>
						</div>
					</div>
				</div>
			</div>
		</section>

		<div
			class="fixed right-0 bottom-0 left-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-card)]/95 px-4 py-3 backdrop-blur lg:hidden"
			style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));"
		>
			<div class="mx-auto flex max-w-6xl items-center gap-3">
				<div class="min-w-0 flex-1">
					<div class="text-xs text-[var(--color-text-muted)]">Total</div>
					<div class="truncate text-base font-semibold text-[var(--color-text-primary)]">
						{formatPrice(totalPrice)}
					</div>
				</div>
				{#if data.tier.visible_available === 0}
					<button
						onclick={subscribeForRestock}
						disabled={notifyLoading || notifySubscribed}
						class="rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
						style="background: var(--btn-primary-gradient);"
					>
						{#if notifyLoading}
							Saving...
						{:else if notifySubscribed}
							Subscribed
						{:else}
							Notify me
						{/if}
					</button>
				{:else}
					<button
						onclick={addToCart}
						disabled={addingToCart}
						class="rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
						style="background: var(--btn-primary-gradient);"
					>
						{#if addingToCart}
							Adding...
						{:else}
							Add to Cart
						{/if}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</main>

{#if tierSampleScreenshots.length > 0}
	<ImagePreviewModal
		images={tierSampleScreenshotsModal}
		isOpen={samplePreviewOpen}
		onClose={() => (samplePreviewOpen = false)}
		initialIndex={samplePreviewIndex}
	/>
{/if}

<Footer />

<style>
	.sample-screenshot-scroll {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(220px, 78%);
		gap: 0.75rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
		scroll-behavior: smooth;
		scroll-snap-type: x mandatory;
		scrollbar-width: thin;
		overscroll-behavior-x: contain;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-x;
	}

	.sample-screenshot-item {
		position: relative;
		aspect-ratio: 9 / 16;
		min-height: 220px;
		overflow: hidden;
		border-radius: 0.75rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		scroll-snap-align: start;
		scroll-snap-stop: always;
		touch-action: pan-x;
		-webkit-user-select: none;
		user-select: none;
	}

	.sample-screenshot-item:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	@media (min-width: 768px) {
		.sample-screenshot-scroll {
			grid-auto-flow: row;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			overflow: visible;
		}

		.sample-screenshot-item {
			min-height: 0;
		}
	}
</style>
