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
		BellRing
	} from '@lucide/svelte';
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
	const currentUser = $derived((page.data as { user?: { id: string } | null }).user || null);
	const tierSampleScreenshots = $derived(getTierSampleScreenshotUrls(data.tier?.metadata));
	const tierSampleScreenshotsGallery = $derived(
		tierSampleScreenshots.map((url) => buildCloudinaryOptimizedImageUrl(url, { width: 720 }))
	);
	const tierSampleScreenshotsModal = $derived(
		tierSampleScreenshots.map((url) => buildCloudinaryOptimizedImageUrl(url, { width: 1280 }))
	);
	const tierDeliveryConfig = $derived(getTierDeliveryConfig(data.tier?.metadata));
	const tierLoginGuideUrl = $derived(tierDeliveryConfig.loginGuideUrl || DEFAULT_LOGIN_GUIDE_URL);
	const tierLoginGuideLabel = $derived(
		tierDeliveryConfig.loginGuideLabel || DEFAULT_LOGIN_GUIDE_LABEL
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

	// Get tier status
	function getTierStatus(available: number): { status: string; color: string; bgColor: string } {
		if (available === 0) {
			return { status: 'Sold Out', color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' };
		} else if (available <= 10) {
			return {
				status: 'Low Stock',
				color: 'text-yellow-600',
				bgColor: 'bg-yellow-50 border-yellow-200'
			};
		} else {
			return {
				status: 'In Stock',
				color: 'text-green-600',
				bgColor: 'bg-green-50 border-green-200'
			};
		}
	}

	function openSamplePreview(index: number): void {
		samplePreviewIndex = index;
		samplePreviewOpen = true;
	}

	onMount(async () => {
		await loadNotifySubscriptionStatus();

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

		<!-- Enhanced Breadcrumb & Progress -->
		<section class="bg-[var(--color-card)] py-4 shadow sm:py-6">
			<div class="mx-auto max-w-6xl px-4">
				<Breadcrumb
					items={[
						{ label: 'Platforms', href: '/platforms' },
						{ label: data.platform.name, href: `/platforms/${data.platform.slug}` },
						{ label: data.tier.tier_name, active: true }
					]}
				/>
			</div>
		</section>

		<!-- Tier Header -->
		<section
			class={`bg-gradient-to-r ${getPlatformColor(data.platform.slug)} relative pt-8 pb-4 text-white  sm:py-8`}
		>
			<!-- Stock Status Badge - Small Corner Position -->
			<div class="absolute top-4 right-4">
				<span
					class={`rounded-full px-2 py-1 text-xs font-medium ${tierStatus.status === 'In Stock' ? 'border border-green-300/30 bg-green-500/20 text-green-100' : tierStatus.status === 'Low Stock' ? 'border border-yellow-300/30 bg-yellow-500/20 text-yellow-100' : 'border border-red-300/30 bg-red-500/20 text-red-100'}`}
				>
					{tierStatus.status}
				</span>
			</div>

			<div class="mx-auto max-w-6xl px-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-6">
						<div class="rounded-full bg-white/20 p-4">
							<PlatformIcon class="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12" />
						</div>
						<div>
							<div class="mb-2">
								<h1 class="text-4xl font-bold">{data.tier.tier_name}</h1>
							</div>
							{#if data.tier.is_pinned || data.tier.is_featured}
								<div class="mb-2 flex flex-wrap gap-1.5">
									{#if data.tier.is_pinned}
										<span
											class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
											style="background: rgba(251, 191, 36, 0.22); color: rgb(251, 191, 36); border: 1px solid rgba(251, 191, 36, 0.4);"
										>
											Pinned{data.tier.pin_priority ? ` #${data.tier.pin_priority}` : ''}
										</span>
									{/if}
									{#if data.tier.is_featured}
										<span
											class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
											style="background: rgba(34, 197, 94, 0.24); color: rgb(187, 247, 208); border: 1px solid rgba(34, 197, 94, 0.35);"
										>
											{getFeaturedBadgeLabel()}
										</span>
									{/if}
								</div>
							{/if}
							<p class="text-base opacity-90">
								{data.platform.name} accounts with
								{#if data.tier.metadata?.follower_range}
									{@const range = data.tier.metadata.follower_range}
									{range.display ||
										`${formatFollowers(range.min || 0)} - ${formatFollowers(range.max || 0)}`} followers
								{:else}
									{formatFollowers((data.tier.metadata?.follower_count as number) || 0)} followers
								{/if}
							</p>
							<p class="mt-2 text-base opacity-75">
								{data.tier.visible_available} accounts available
								{#if data.tier.reservations_active > 0}
									• {data.tier.reservations_active} reserved
								{/if}
							</p>
						</div>
					</div>

					<div class="text-right">
						<div class="text-4xl font-bold">{formatPrice(data.tier.price)}</div>
						<div class="text-base opacity-75">per account</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Main Content -->
		<section class="py-8 sm:py-16">
			<div class="mx-auto max-w-6xl px-4">
				<div class="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">
					<!-- Left Column - Details -->
					<div class="lg:col-span-2">
						{#if tierSampleScreenshots.length > 0}
							<div class="mb-8 rounded-xl bg-[var(--color-card)] p-6 shadow sm:p-8">
								<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
									<h2 class="text-xl font-bold text-[var(--color-text-primary)] sm:text-2xl">
										Sample Screenshots
									</h2>
									<span
										class="rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase"
										style="background: rgba(59, 130, 246, 0.14); color: rgb(37, 99, 235); border: 1px solid rgba(59, 130, 246, 0.28);"
									>
										Sample Only
									</span>
								</div>
								<p class="mb-4 text-sm text-[var(--color-text-muted)] sm:text-base">
									These are sample previews to help your decision before checkout. Delivered
									accounts can vary in exact appearance.
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
											<span class="sample-screenshot-tag">Sample Screenshot</span>
										</button>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Tier Description -->
						<div class="mb-8 rounded-xl bg-[var(--color-card)] p-6 shadow sm:p-8">
							<h2 class="mb-4 text-xl font-bold text-[var(--color-text-primary)] sm:text-2xl">
								Account Details
							</h2>
							<!-- Tier-specific description -->
							{#if data.tier.description}
								<p
									class="mb-4 text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg"
								>
									{data.tier.description}
								</p>
							{/if}

							<!-- Default description -->
							<p class="mb-6 text-base text-[var(--color-text-secondary)] sm:text-lg">
								{#if data.tier.metadata?.follower_range}
									{@const range = data.tier.metadata.follower_range}
									Premium {data.platform.name} accounts with {range.display ||
										`${formatFollowers(range.min || 0)} - ${formatFollowers(range.max || 0)}`} followers.
									{!data.tier.description ? 'High-quality accounts ready for immediate use.' : ''}
								{:else}
									{!data.tier.description
										? `Premium ${data.platform.name} accounts with ${formatFollowers((data.tier.metadata?.follower_count as number) || 0)} followers.`
										: ''}
								{/if}
							</p>

							<!-- Features -->
							{#if getTierFeatures(data.tier.metadata).length > 0}
								{@const features = getTierFeatures(data.tier.metadata)}
								<div class="mb-6">
									<h3 class="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">
										What's Included:
									</h3>
									<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
										{#each features as feature}
											<div class="flex items-center gap-3">
												<CheckCircle class="h-5 w-5 text-green-500" />
												<span class="text-[var(--color-text-secondary)]">{feature}</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}
							<!-- Account Age Info -->
							{#if data.tier.metadata?.age_hint}
								<div class="rounded-lg bg-[var(--color-surface)] p-4">
									<div class="flex items-center gap-3">
										<Users class="h-5 w-5 text-[var(--color-accent)]" />
										<span class="font-medium text-[var(--color-text-primary)]">Account Age:</span>
										<span class="text-[var(--color-text-secondary)]"
											>{data.tier.metadata.age_hint}</span
										>
									</div>
								</div>
							{/if}
						</div>
					</div>

					<!-- Right Column - Purchase -->
					<div class="lg:col-span-1">
						<div class="sticky top-6 rounded-xl bg-[var(--color-card)] p-8 shadow">
							<h3 class="mb-6 text-xl font-bold text-[var(--color-text-primary)]">
								Select Quantity
							</h3>
							<div class="mb-6">
								<label
									class="mb-3 block text-sm font-medium text-[var(--color-text-secondary)]"
									for="quantity-selector"
								>
									How many accounts do you need?
								</label>
								<div
									class="flex items-center gap-4"
									role="group"
									aria-labelledby="quantity-selector"
								>
									<button
										onclick={decreaseQuantity}
										disabled={selectedQuantity <= 1}
										class="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
									>
										<Minus class="h-4 w-4" />
									</button>
									<div class="flex-1 text-center">
										<div class="text-2xl font-bold text-[var(--color-text-primary)]">
											{selectedQuantity}
										</div>
										<div class="text-sm text-[var(--color-text-muted)]">
											{selectedQuantity === 1 ? 'account' : 'accounts'}
										</div>
									</div>
									<button
										onclick={increaseQuantity}
										disabled={selectedQuantity >= data.tier.visible_available}
										class="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
									>
										<Plus class="h-4 w-4" />
									</button>
								</div>
								<div class="mt-2 text-center text-sm text-[var(--color-text-muted)]">
									Maximum: {data.tier.visible_available} available
								</div>
							</div>

							<!-- Price Summary -->
							<div class="mb-6 rounded-lg bg-[var(--color-surface)] p-4">
								<div
									class="flex items-center justify-between text-sm text-[var(--color-text-secondary)]"
								>
									<span>Price per account:</span>
									<span>{formatPrice(data.tier.price)}</span>
								</div>
								<div
									class="flex items-center justify-between text-sm text-[var(--color-text-secondary)]"
								>
									<span>Quantity:</span>
									<span>×{selectedQuantity}</span>
								</div>
								<hr class="my-3" />
								<div
									class="flex items-center justify-between text-lg font-bold text-[var(--color-text-primary)]"
								>
									<span>Total:</span>
									<span class="text-[var(--color-accent)]">{formatPrice(totalPrice)}</span>
								</div>
							</div>

							<div
								class="mb-6 rounded-lg border p-4"
								style="border-color: var(--color-border); background: var(--color-surface);"
							>
								<div class="mb-2 flex items-center justify-between">
									<span class="text-sm font-semibold text-[var(--color-text-primary)]">
										Delivery Mode
									</span>
									<span
										class="rounded-full px-2 py-0.5 text-xs font-semibold"
										style={tierDeliveryConfig.mode === 'manual_handover'
											? 'background: rgba(59, 130, 246, 0.18); color: rgb(147, 197, 253); border: 1px solid rgba(147, 197, 253, 0.28);'
											: 'background: rgba(5, 212, 113, 0.15); color: rgb(5, 212, 113); border: 1px solid rgba(5, 212, 113, 0.25);'}
										>
											{getTierDeliveryModeLabel(tierDeliveryConfig.mode)}
										</span>
								</div>
								{#if tierDeliveryConfig.mode === 'manual_handover' && tierDeliveryConfig.manualHandoverPromise}
									<p class="text-xs text-[var(--color-text-muted)]">
										{tierDeliveryConfig.manualHandoverPromise}
									</p>
								{/if}
							</div>

							<div class="mb-6 rounded-lg bg-[var(--color-surface)] p-4">
								<div class="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">
									{tierLoginGuideLabel}
								</div>
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
									Open Guide
								</a>
							</div>

							{#if data.tier.visible_available === 0}
								<button
									onclick={subscribeForRestock}
									disabled={notifyLoading || notifySubscribed}
									class="w-full rounded-full py-4 font-semibold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
									style="background: var(--btn-primary-gradient);"
								>
									{#if notifyLoading}
										<div class="flex items-center justify-center gap-2">
											<div
												class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
											></div>
											Saving...
										</div>
									{:else if notifySubscribed}
										<div class="flex items-center justify-center gap-2">
											<CheckCircle class="h-5 w-5" />
											You'll be notified
										</div>
									{:else}
										<div class="flex items-center justify-center gap-2">
											<BellRing class="h-5 w-5" />
											Notify me when back in stock
										</div>
									{/if}
								</button>
							{:else}
								<!-- Add to Cart Button -->
								<button
									onclick={addToCart}
									disabled={addingToCart}
									class="w-full rounded-full py-4 font-semibold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
									style="background: var(--btn-primary-gradient);"
								>
									{#if addingToCart}
										<div class="flex items-center justify-center gap-2">
											<div
												class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
											></div>
											Adding to Cart...
										</div>
									{:else}
										<div class="flex items-center justify-center gap-2">
											<ShoppingCart class="h-5 w-5" />
											Add to Cart - {formatPrice(totalPrice)}
										</div>
									{/if}
								</button>
							{/if}

							<!-- Stock Warning -->
							{#if data.tier.visible_available <= 10 && data.tier.visible_available > 0}
								<div
									class="mt-4 rounded-lg border border-yellow-500/30 bg-[var(--color-surface)] p-3"
								>
									<div class="text-sm text-yellow-500">
										⚠️ Only {data.tier.visible_available} accounts left in stock!
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</section>
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
		scroll-snap-type: x mandatory;
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
	}

	.sample-screenshot-item:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.sample-screenshot-tag {
		position: absolute;
		left: 0.5rem;
		bottom: 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(148, 163, 184, 0.4);
		background: rgba(2, 6, 23, 0.7);
		padding: 0.2rem 0.4rem;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #f8fafc;
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
