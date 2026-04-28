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
		CheckCircle
	} from '@lucide/svelte';
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

	let { data }: Props = $props();
	let platformHeaderIconFailed = $state(false);
	let quickAddOpen = $state(false);
	let quickAddTier = $state<TierCard | null>(null);
	let quickAddQuantity = $state(1);
	let quickAddSubmitting = $state(false);
	let restockLoadingByTier = $state<Record<string, boolean>>({});
	let restockSubscribedByTier = $state<Record<string, boolean>>({});
	let autoNotifyHandled = $state(false);
	const currentUser = $derived((page.data as { user?: { id: string } | null }).user || null);

	let quickAddDialog = $state<HTMLDivElement | null>(null);
	let quickAddCloseButton = $state<HTMLButtonElement | null>(null);
	let previousBodyOverflow = '';
	let previousActiveElement: HTMLElement | null = null;

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

	// Get tier status based on availability
	function getTierStatus(available: number): { status: string; color: string; bgColor: string } {
		if (available === 0) {
			return { status: 'Sold Out', color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' };
		} else if (available <= 10) {
			return {
				status: 'Few Left',
				color: 'text-yellow-600',
				bgColor: 'bg-yellow-50 border-yellow-200'
			};
		}
		return {
			status: 'In Stock',
			color: 'text-green-600',
			bgColor: 'bg-green-50 border-green-200'
		};
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

	function getTierDeliveryModeLabel(tier: TierCard): string {
		const config = getTierDeliveryConfig(tier.metadata);
		return config.mode === 'manual_handover' ? 'Manual Handover' : 'Instant Auto';
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

		const incomingLabel = mode === 'manual_handover' ? 'Manual Handover' : 'Instant Auto';
		const existingLabel =
			compatibility.existingMode === 'manual_handover' ? 'Manual Handover' : 'Instant Auto';
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
				<!-- Enhanced Breadcrumb Navigation -->
				<Breadcrumb
					items={[
						{ label: 'Platforms', href: '/platforms' },
						{ label: data.platform.name, active: true }
					]}
				/>

				<!-- Step Indicator - Commented Out -->
				<!-- <StepIndicator currentStep={2} /> -->

				<div class="flex items-start gap-4 sm:gap-6">
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
		<section class="py-8 sm:py-16">
			<div class="mx-auto max-w-6xl px-4">
				<div class="mb-8 text-center">
					<h2 class="mb-4 text-2xl font-bold sm:text-3xl" style="color: var(--text);">
						Available Tiers
					</h2>
					<p class="text-base sm:text-lg" style="color: var(--text-muted);">
						Select the tier that matches your needs. Each tier shows current stock and pricing.
					</p>
				</div>

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
				{:else}
					<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
						{#each data.tiers as tier (tier.category_id)}
							{@const tierStatus = getTierStatus(tier.visible_available)}
							{@const tierFeatures = getTierFeatures(tier.metadata)}
							<div
								class="group relative flex flex-col overflow-hidden rounded-xl shadow transition-all duration-300 {tier.visible_available >
								0
									? 'hover:-translate-y-1 hover:shadow-md'
									: 'opacity-75'}"
								style="background: var(--bg-elev-2); border: 1px solid var(--border);"
							>
								<!-- Stock Status Badge -->
								<div class="absolute top-32 right-3 z-10">
									<span
										class="rounded-full px-2 py-1 text-xs font-medium"
										style={tierStatus.status === 'In Stock'
											? 'background: rgba(34, 197, 94, 0.2); color: rgb(34, 197, 94); border: 1px solid rgba(34, 197, 94, 0.3);'
											: tierStatus.status === 'Few Left'
												? 'background: rgba(234, 179, 8, 0.2); color: rgb(234, 179, 8); border: 1px solid rgba(234, 179, 8, 0.3);'
												: 'background: rgba(239, 68, 68, 0.2); color: rgb(239, 68, 68); border: 1px solid rgba(239, 68, 68, 0.3);'}
									>
										{tierStatus.status}
									</span>
								</div>

								<!-- Tier Header -->
								<div class="flex flex-1 flex-col p-6">
									{#if tier.is_pinned || tier.is_featured}
										<div class="mb-3 flex flex-wrap gap-1.5">
											{#if tier.is_pinned}
												<span
													class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
													style="background: rgba(251, 191, 36, 0.16); color: rgb(217, 119, 6); border: 1px solid rgba(251, 191, 36, 0.28);"
												>
													Pinned{tier.pin_priority ? ` #${tier.pin_priority}` : ''}
												</span>
											{/if}
											{#if tier.is_featured}
												<span
													class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
													style="background: rgba(34, 197, 94, 0.14); color: rgb(22, 163, 74); border: 1px solid rgba(34, 197, 94, 0.3);"
												>
													{getFeaturedBadgeLabel(tier)}
												</span>
											{/if}
										</div>
									{/if}

									<div class="mb-4 flex items-center justify-between">
										<div>
											<h3 class="text-xl font-bold" style="color: var(--text);">
												{tier.tier_name}
											</h3>
											<p class="text-sm" style="color: var(--text-muted);">
												{getTierAudienceLabel(tier.metadata)}
											</p>
										</div>
										<div class="text-right">
											<div
												class="text-2xl font-bold"
												style="background: var(--btn-primary-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
											>
												{formatPrice(tier.price)}
											</div>
											<div class="text-sm" style="color: var(--text-muted);">per account</div>
										</div>
									</div>

									<!-- Tier Description -->
									{#if tier.description}
										<div class="mb-4">
											<p class="text-sm leading-relaxed" style="color: var(--text-muted);">
												{tier.description}
											</p>
										</div>
									{/if}

									<!-- Availability -->
									<div class="mb-4 text-sm" style="color: var(--text-muted);">
										<span class="font-medium">{tier.visible_available}</span> accounts available
										{#if tier.reservations_active > 0}
											<span class="text-yellow-600">
												• {tier.reservations_active} reserved
											</span>
										{/if}
									</div>

									<div class="mb-4">
										<span
											class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold"
											style="background: rgba(59, 130, 246, 0.15); color: rgb(147, 197, 253); border: 1px solid rgba(147, 197, 253, 0.25);"
										>
											{getTierDeliveryModeLabel(tier)}
										</span>
										{#if getTierManualHandoverPromise(tier)}
											<p class="mt-2 text-xs" style="color: var(--text-muted);">
												{getTierManualHandoverPromise(tier)}
											</p>
										{/if}
									</div>

									<!-- Tier Features -->
									{#if tierFeatures.length > 0}
										<div class="mb-6">
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
														<span>{formatFeatureName(feature)}</span>
													</div>
												{/each}
											</div>
										</div>
									{/if}

									<!-- Age Hint -->
									{#if tier.metadata?.age_hint}
										<div
											class="mb-4 rounded-lg p-3"
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
								</div>

								<!-- Actions -->
								<div class="mx-6 mt-6 mb-6 space-y-2">
									{#if tier.visible_available === 0}
										<button
											type="button"
											onclick={() => subscribeToRestock(tier)}
											disabled={isTierRestockLoading(tier.category_id) ||
												isTierRestockSubscribed(tier.category_id)}
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
											aria-label={`Quick add ${tier.tier_name}`}
											class="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-center font-semibold transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
											style="background: var(--btn-primary-gradient); color: #04140C;"
										>
											<ShoppingCart class="h-4 w-4" />
											<span>Add to Cart</span>
										</button>
									{/if}

									<a
										href={getTierRoute(tier.tier_slug)}
										class="inline-flex w-full items-center justify-center gap-1 rounded-lg py-3 text-center text-sm font-semibold transition-colors hover:opacity-90"
										style="border: 1px solid var(--border); background: var(--bg-elev-1); color: var(--text);"
										aria-label={`See details for ${tier.tier_name}`}
									>
										See Details
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

					{#if quickAddRemaining <= 10 && quickAddRemaining > 0}
						<div
							class="mb-4 rounded-lg border border-yellow-500/30 px-3 py-2 text-sm text-yellow-500"
							style="background: var(--bg-elev-1);"
						>
							⚠️ Only {quickAddRemaining} accounts left in stock!
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
