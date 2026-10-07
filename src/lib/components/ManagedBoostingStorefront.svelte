<script lang="ts">
	import BrandIcon from '$lib/components/BrandIcon.svelte';
	import { boostingStartingQuantity } from '$lib/helpers/boosting-checkout';
	import BoostingQuantitySelector from '$lib/components/BoostingQuantitySelector.svelte';
	import {
		Check,
		Eye,
		Heart,
		MessageCircle,
		Music,
		Repeat,
		Share2,
		UserPlus,
		Users
	} from '$lib/icons';
	import { roundCatalogPriceNgn } from '$lib/helpers/catalog-pricing';
	import {
		getRequiredLinkType,
		validateLinkForAction,
		type BoostingActionType,
		type BoostingPlatform
	} from '$lib/helpers/social-link-validator';
	import { formatPrice } from '$lib/helpers/utils';
	import { recordAnalyticsEvent } from '$lib/services/analytics-events';
	import { trackSnapEvent } from '$lib/services/snap-pixel';
	import { cart } from '$lib/stores/cart.svelte';
	import { showError, showSuccess, showWarning } from '$lib/stores/toasts';
	import { getTierDeliveryModeLabel } from '$lib/helpers/tier-delivery-config';

	interface Offer {
		id: string;
		categoryId: string;
		platform: BoostingPlatform;
		outcome: string;
		customerName: string;
		shortPromise: string;
		expectationChips: string[];
		qualityTier: string;
		minQuantity: number;
		maxQuantity: number | null;
		stepQuantity: number;
		quantityPresets: number[];
		pricePerStepNgn: number;
		refillDays: number | null;
		displayOrder: number;
	}

	interface Group {
		categoryId: string;
		platform: BoostingPlatform;
		platformLabel: string;
		outcome: string;
		outcomeLabel: string;
		offers: Offer[];
	}

	let { groups }: { groups: Group[] } = $props();
	let selectedPlatform = $state<BoostingPlatform | ''>('');
	let selectedCategoryId = $state('');
	let selectedOfferId = $state('');
	let quantity = $state(0);
	let targetUrl = $state('');
	let linkError = $state<string | null>(null);
	let adding = $state(false);

	$effect(() => {
		if (selectedPlatform || !groups[0]) return;
		selectedPlatform = groups[0].platform;
		selectedCategoryId = groups[0].categoryId;
		selectedOfferId = groups[0].offers[0]?.id ?? '';
		quantity = groups[0].offers[0] ? boostingStartingQuantity(groups[0].offers[0]) : 0;
	});

	const platforms = $derived([
		...new Map(groups.map((group) => [group.platform, group.platformLabel])).entries()
	]);
	const visibleGroups = $derived(groups.filter((group) => group.platform === selectedPlatform));
	const selectedGroup = $derived(
		visibleGroups.find((group) => group.categoryId === selectedCategoryId) ??
			visibleGroups[0] ??
			null
	);
	const selectedOffer = $derived(
		selectedGroup?.offers.find((offer) => offer.id === selectedOfferId) ??
			selectedGroup?.offers[0] ??
			null
	);
	const total = $derived(
		selectedOffer
			? roundCatalogPriceNgn(
					(quantity / selectedOffer.stepQuantity) * selectedOffer.pricePerStepNgn
				)
			: 0
	);

	const ICONS: Record<string, typeof Heart> = {
		followers: UserPlus,
		subscribers: UserPlus,
		members: Users,
		likes: Heart,
		views: Eye,
		comments: MessageCircle,
		reposts: Repeat,
		streams: Music,
		monthly_listeners: Music,
		reactions: Heart,
		shares: Share2,
		saves: Heart,
		watch_time: Eye
	};

	function selectDefaults(group: Group): void {
		selectedCategoryId = group.categoryId;
		selectedOfferId = group.offers[0]?.id ?? '';
		quantity = group.offers[0] ? boostingStartingQuantity(group.offers[0]) : 0;
		targetUrl = '';
		linkError = null;
	}

	function choosePlatform(platform: BoostingPlatform): void {
		selectedPlatform = platform;
		const group = groups.find((candidate) => candidate.platform === platform);
		if (group) selectDefaults(group);
	}

	function chooseGroup(group: Group): void {
		selectDefaults(group);
	}

	function chooseOffer(offer: Offer): void {
		selectedOfferId = offer.id;
		quantity = boostingStartingQuantity(offer);
		linkError = null;
		trackSnapEvent('VIEW_CONTENT', {
			item_ids: [offer.id],
			item_category: 'Boosting services',
			description: `${selectedGroup?.platformLabel ?? offer.platform} ${selectedGroup?.outcomeLabel ?? offer.outcome}`,
			price: roundCatalogPriceNgn(offer.pricePerStepNgn),
			currency: 'NGN',
			number_items: offer.minQuantity
		});
		recordAnalyticsEvent('view_content', `/services?offer=${encodeURIComponent(offer.id)}`);
	}

	function linkLabel(platform: BoostingPlatform, outcome: BoostingActionType): string {
		const type = getRequiredLinkType(outcome);
		if (type === 'channel') return 'channel or group link';
		if (type === 'content') {
			return platform === 'spotify' ? 'song, album, or playlist link' : 'post or video link';
		}
		if (platform === 'youtube') return 'channel link';
		if (platform === 'spotify') return 'artist link';
		return 'profile link';
	}

	function linkPlaceholder(platform: BoostingPlatform, outcome: BoostingActionType): string {
		const type = getRequiredLinkType(outcome);
		if (platform === 'spotify') {
			return type === 'profile'
				? 'https://open.spotify.com/artist/...'
				: 'https://open.spotify.com/track/...';
		}
		if (platform === 'telegram') return 'https://t.me/yourchannel';
		if (platform === 'threads') {
			return type === 'profile'
				? 'https://www.threads.com/@yourusername'
				: 'https://www.threads.com/@username/post/...';
		}
		if (platform === 'youtube') {
			return type === 'profile'
				? 'https://youtube.com/@yourchannel'
				: 'https://youtube.com/watch?v=...';
		}
		if (platform === 'x') {
			return type === 'profile'
				? 'https://x.com/yourusername'
				: 'https://x.com/username/status/...';
		}
		return type === 'profile'
			? `https://${platform}.com/yourusername`
			: `https://${platform}.com/.../post`;
	}

	function handleLinkInput(value: string): void {
		targetUrl = value;
		if (!selectedGroup || !value.trim()) {
			linkError = null;
			return;
		}
		const result = validateLinkForAction(
			selectedGroup.platform,
			selectedGroup.outcome as BoostingActionType,
			value
		);
		linkError = result.valid ? null : result.reason || 'Please check this link.';
	}

	async function addToCart(): Promise<void> {
		if (!selectedGroup || !selectedOffer || adding) return;
		const checked = validateLinkForAction(
			selectedGroup.platform,
			selectedGroup.outcome as BoostingActionType,
			targetUrl
		);
		if (!targetUrl.trim()) {
			linkError = 'Please paste the link you want to grow.';
			return;
		}
		if (!checked.valid) {
			linkError = checked.reason || 'Please check this link.';
			return;
		}

		adding = true;
		try {
			let compatibility: Awaited<ReturnType<typeof cart.ensureDeliveryModeCompatibility>>;
			try {
				compatibility = await cart.ensureDeliveryModeCompatibility(
					selectedGroup.categoryId,
					'boosting_manual'
				);
			} catch (error) {
				console.error('Failed to validate cart delivery mode compatibility:', error);
				showError('Could not update cart', 'Please try again.');
				return;
			}
			if (!compatibility.compatible) {
				const existingLabel = compatibility.existingMode
					? getTierDeliveryModeLabel(compatibility.existingMode)
					: getTierDeliveryModeLabel('instant_auto');
				if (
					!window.confirm(
						`You already have ${existingLabel} item(s) in your cart.\n\nBoosting orders must be checked out separately.\n\nPress OK to clear your cart and continue.`
					)
				) {
					return;
				}
				cart.clear();
				showWarning('Cart cleared', `Previous ${existingLabel} items were removed.`);
			}

			cart.addBoostingService(
				selectedGroup.categoryId,
				checked.normalizedUrl || targetUrl.trim(),
				quantity,
				selectedOffer.id
			);
			trackSnapEvent('ADD_CART', {
				item_ids: [selectedOffer.id],
				item_category: 'Boosting services',
				description: `${selectedGroup.platformLabel} ${selectedGroup.outcomeLabel}`,
				price: total,
				currency: 'NGN',
				number_items: quantity
			});
			recordAnalyticsEvent('add_cart', `/services?offer=${encodeURIComponent(selectedOffer.id)}`);
			showSuccess(
				'Added to cart!',
				`${quantity.toLocaleString()} ${selectedGroup.outcomeLabel.toLowerCase()} added successfully.`,
				6000,
				'/checkout'
			);
			targetUrl = '';
			linkError = null;
		} finally {
			adding = false;
		}
	}
</script>

{#if groups.length === 0}
	<div class="rounded-2xl border p-10 text-center" style="border-color: var(--border);">
		<p class="font-semibold" style="color: var(--text);">Boosting is getting better</p>
		<p class="mt-2 text-sm" style="color: var(--text-muted);">
			We’re improving speed, pricing and service quality. Check back soon.
		</p>
	</div>
{:else}
	<div class="space-y-6">
		<div class="storefront-scroll -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 sm:gap-3">
			{#each platforms as [platform, label] (platform)}
				<button
					type="button"
					onclick={() => choosePlatform(platform)}
					class="min-w-24 snap-start rounded-2xl border p-3 text-center sm:min-w-28"
					style={platform === selectedPlatform
						? 'border-color: var(--primary); background: rgba(16,185,129,.08);'
						: 'border-color: var(--border);'}
				>
					<span class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white">
						<BrandIcon service={platform} size={29} />
					</span>
					<span class="mt-2 block text-sm font-semibold" style="color: var(--text);">{label}</span>
				</button>
			{/each}
		</div>

		<div>
			<p class="mb-3 text-sm font-semibold" style="color: var(--text-muted);">Choose a result</p>
			<div
				class="storefront-scroll -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0"
			>
				{#each visibleGroups as group (group.categoryId)}
					{@const OutcomeIcon = ICONS[group.outcome] ?? Eye}
					<button
						type="button"
						onclick={() => chooseGroup(group)}
						class="flex min-h-20 min-w-[78%] shrink-0 snap-start items-center gap-3 rounded-xl border p-4 text-left sm:min-w-0"
						style={selectedGroup?.categoryId === group.categoryId
							? 'border-color: var(--primary); background: rgba(16,185,129,.07);'
							: 'border-color: var(--border);'}
					>
						<OutcomeIcon size={23} />
						<strong style="color: var(--text);">{group.outcomeLabel}</strong>
					</button>
				{/each}
			</div>
		</div>

		{#if selectedGroup}
			<div>
				<p class="mb-3 text-sm font-semibold" style="color: var(--text-muted);">
					Pick what suits you
				</p>
				<div class="grid gap-3">
					{#each selectedGroup.offers as offer, index (offer.id)}
						<button
							type="button"
							onclick={() => chooseOffer(offer)}
							class="min-h-24 rounded-xl border p-4 text-left"
							style={selectedOffer?.id === offer.id
								? 'border-color: var(--primary); background: rgba(16,185,129,.07);'
								: 'border-color: var(--border);'}
						>
							<div class="flex items-start justify-between gap-4">
								<div>
									<div class="flex flex-wrap items-center gap-2">
										<strong class="text-lg" style="color: var(--text);">{offer.customerName}</strong
										>
										{#if index === 0}
											<span
												class="rounded-full px-2 py-0.5 text-[10px] font-bold"
												style="background: var(--primary); color: #00150b;">Recommended</span
											>
										{/if}
									</div>
									<p class="mt-1 text-sm" style="color: var(--text-muted);">{offer.shortPromise}</p>
								</div>
								<strong class="whitespace-nowrap" style="color: var(--text);">
									{formatPrice(
										roundCatalogPriceNgn(
											(boostingStartingQuantity(offer) / offer.stepQuantity) * offer.pricePerStepNgn
										)
									)}
								</strong>
							</div>
							{#if offer.expectationChips.length}
								<div class="mt-3 flex flex-wrap gap-x-4 gap-y-2">
									{#each offer.expectationChips as chip (chip)}
										<span
											class="flex items-center gap-1.5 text-xs"
											style="color: var(--text-muted);"
											><Check size={14} style="color: var(--primary);" /> {chip}</span
										>
									{/each}
								</div>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			{#if selectedOffer}
				<div class="rounded-xl border p-4" style="border-color: var(--border);">
					<label
						for="boosting-target"
						class="mb-2 block text-sm font-semibold"
						style="color: var(--text);"
					>
						Paste your {linkLabel(
							selectedGroup.platform,
							selectedGroup.outcome as BoostingActionType
						)}
					</label>
					<input
						id="boosting-target"
						type="url"
						value={targetUrl}
						oninput={(event) => handleLinkInput((event.target as HTMLInputElement).value)}
						placeholder={linkPlaceholder(
							selectedGroup.platform,
							selectedGroup.outcome as BoostingActionType
						)}
						autocapitalize="none"
						autocomplete="off"
						spellcheck="false"
						class="mb-1 min-h-12 w-full rounded-xl px-3 py-2.5 text-base sm:text-sm"
						style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
					/>
					{#if linkError}
						<p class="mb-3 text-xs text-red-500">{linkError}</p>
					{:else}
						<p class="mb-3 text-xs" style="color: var(--text-dim);">
							Use the link from the app’s Share button.
						</p>
					{/if}

					<BoostingQuantitySelector
						value={quantity}
						minQuantity={selectedOffer.minQuantity}
						maxQuantity={selectedOffer.maxQuantity}
						stepQuantity={selectedOffer.stepQuantity}
						presets={selectedOffer.quantityPresets}
						label={`${selectedGroup.outcomeLabel} quantity`}
						onchange={(next) => (quantity = next)}
					/>
					<button
						type="button"
						onclick={addToCart}
						disabled={adding || !Number.isFinite(total)}
						class="mt-4 min-h-12 w-full rounded-xl px-4 py-3 text-base font-bold disabled:opacity-60"
						style="background: var(--primary); color: #00150b;"
					>
						{adding ? 'Adding…' : `Add to Cart — ${formatPrice(total)}`}
					</button>
				</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.storefront-scroll {
		scrollbar-width: none;
	}

	.storefront-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
