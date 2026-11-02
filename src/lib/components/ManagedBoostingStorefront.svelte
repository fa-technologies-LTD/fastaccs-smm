<script lang="ts">
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import BrandIcon from '$lib/components/BrandIcon.svelte';
	import { boostCustomerCopy, boostCustomerShortName } from '$lib/helpers/boosting-customer-copy';
	import { boostBenefitLabel, boostQuantityText } from '$lib/helpers/boosting-customer-facts';
	import { boostingStartingQuantity } from '$lib/helpers/boosting-checkout';
	import {
		parseBoostComments,
		MAX_BOOST_COMMENT_TEXT_LENGTH
	} from '$lib/helpers/boosting-service-input';
	import BoostingQuantitySelector from '$lib/components/BoostingQuantitySelector.svelte';
	import { Eye, Heart, MessageCircle, Music, Repeat, Share2, UserPlus, Users } from '$lib/icons';
	import { roundUpCatalogPriceNgn as roundCatalogPriceNgn } from '$lib/helpers/catalog-pricing';
	import {
		getRequiredLinkType,
		validateLinkForAction,
		type BoostingActionType,
		type BoostingPlatform
	} from '$lib/helpers/social-link-validator';
	import { formatPrice } from '$lib/helpers/utils';
	import { recordAnalyticsEvent } from '$lib/services/analytics-events';
	import { cart } from '$lib/stores/cart.svelte';
	import { confirmSeparateCheckout } from '$lib/helpers/separate-checkout';
	import { showError, showSuccess, showWarning } from '$lib/stores/toasts';

	interface Offer {
		id: string;
		categoryId: string;
		platform: BoostingPlatform;
		outcome: string;
		customerName: string;
		benefitLabel?: string | null;
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

	let { groups, previewOnly = false }: { groups: Group[]; previewOnly?: boolean } = $props();
	let selectedPlatform = $state<BoostingPlatform | ''>('');
	let selectedCategoryId = $state('');
	let selectedOfferId = $state('');
	let platformRow = $state<HTMLDivElement | null>(null);
	let resultRow = $state<HTMLDivElement | null>(null);
	let optionsBlock = $state<HTMLDivElement | null>(null);
	let quantity = $state(0);
	let targetUrl = $state('');
	let linkError = $state<string | null>(null);
	let adding = $state(false);
	let commentText = $state('');
	let commentError = $state<string | null>(null);

	// A returning customer lands on the platform and result they last looked at.
	const SAVED_CHOICE_KEY = 'fastaccs.boosting.choice';
	function savedGroup(): Group | undefined {
		try {
			const saved = JSON.parse(localStorage.getItem(SAVED_CHOICE_KEY) ?? 'null');
			return groups.find((group) => group.categoryId === saved?.categoryId);
		} catch {
			return undefined;
		}
	}
	function saveChoice(): void {
		if (previewOnly) return;
		try {
			localStorage.setItem(SAVED_CHOICE_KEY, JSON.stringify({ categoryId: selectedCategoryId }));
		} catch {
			// Storage can be off (private mode); the page works the same without it.
		}
	}

	$effect(() => {
		if (selectedPlatform || !groups[0]) return;
		const group = (previewOnly ? undefined : savedGroup()) ?? groups[0];
		selectedPlatform = group.platform;
		selectedCategoryId = group.categoryId;
		selectedOfferId = group.offers[0]?.id ?? '';
		quantity = group.offers[0] ? boostingStartingQuantity(group.offers[0]) : 0;
		if (group !== groups[0]) {
			void showChosen(platformRow, false);
			void showChosen(resultRow, false);
		}
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
	const selectedCopy = $derived(selectedOffer ? boostCustomerCopy(selectedOffer) : null);
	// The offers API already names each option (Quick / Stable / Most stable, or the owner's own name) and
	// gives its line, so the service pages and this one read the same. A refill is a small note, not the name.
	const offerCards = $derived(
		(selectedGroup?.offers ?? []).map((offer, _index, offers) => {
			const benefit = offer.benefitLabel ?? boostBenefitLabel(offer);
			const single = offers.length === 1;
			const specificName = single ? boostCustomerShortName(offer) : offer.customerName;
			return {
				offer,
				quantityAsName: single && !specificName,
				name: specificName ?? boostQuantityText(boostingStartingQuantity(offer), offer.outcome),
				benefit: benefit && benefit !== specificName ? benefit : null,
				description: offer.shortPromise.replace(/\s+/g, ' ').trim()
			};
		})
	);
	const sharedDescriptions = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const { description } of offerCards)
			if (description) counts.set(description, (counts.get(description) ?? 0) + 1);
		return [...counts]
			.filter(([, count]) => count > 1 && count === offerCards.length)
			.map(([description]) => description);
	});
	const total = $derived(
		selectedOffer
			? roundCatalogPriceNgn(
					(quantity / selectedOffer.stepQuantity) * selectedOffer.pricePerStepNgn
				)
			: 0
	);
	const isCustomComments = $derived(selectedGroup?.outcome === 'custom_comments');
	const parsedComments = $derived(parseBoostComments(commentText));
	$effect(() => {
		if (isCustomComments) quantity = parsedComments.quantity;
	});

	const ICONS: Record<string, typeof Heart> = {
		followers: UserPlus,
		subscribers: UserPlus,
		members: Users,
		likes: Heart,
		views: Eye,
		comments: MessageCircle,
		custom_comments: MessageCircle,
		live_likes: Heart,
		impressions: Eye,
		reach: Eye,
		story_shares: Share2,
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
		commentText = '';
		commentError = null;
	}

	const reducedMotion = () =>
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
	const fadeIn = () => ({ duration: reducedMotion() ? 0 : 180 });

	/** On a phone these rows scroll sideways; glide the chosen chip into view instead of leaving it off-screen. */
	async function showChosen(row: HTMLDivElement | null, animate = true): Promise<void> {
		await tick();
		const chosen = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
		if (!row || !chosen) return;
		const gap = 4;
		const left = chosen.getBoundingClientRect().left - row.getBoundingClientRect().left;
		const right = left + chosen.offsetWidth - row.clientWidth;
		const by = left < gap ? left - gap : right > -gap ? right + gap : 0;
		if (!by) return;
		row.scrollTo({
			left: row.scrollLeft + by,
			behavior: animate && !reducedMotion() ? 'smooth' : 'auto'
		});
	}

	/** After a result is picked, bring its options up when they sit below the screen, moving only as far as needed. */
	async function showOptions(): Promise<void> {
		await tick();
		if (!optionsBlock) return;
		const { top, bottom } = optionsBlock.getBoundingClientRect();
		if (top >= 0 && bottom <= window.innerHeight) return;
		optionsBlock.scrollIntoView({
			block: 'nearest',
			behavior: reducedMotion() ? 'auto' : 'smooth'
		});
	}

	function choosePlatform(platform: BoostingPlatform): void {
		selectedPlatform = platform;
		const group = groups.find((candidate) => candidate.platform === platform);
		if (group) selectDefaults(group);
		saveChoice();
		void showChosen(platformRow);
		void showChosen(resultRow);
	}

	function chooseGroup(group: Group): void {
		selectDefaults(group);
		saveChoice();
		void showChosen(resultRow);
		void showOptions();
	}

	function chooseOffer(offer: Offer): void {
		selectedOfferId = offer.id;
		quantity = isCustomComments ? parsedComments.quantity : boostingStartingQuantity(offer);
		linkError = null;
		if (!previewOnly)
			recordAnalyticsEvent('view_content', `/services/${offer.platform}/${offer.outcome}`);
	}

	function linkLabel(platform: BoostingPlatform, outcome: BoostingActionType): string {
		if (outcome === 'live_likes') return 'LIVE link';
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
		if (outcome === 'live_likes') return 'https://www.tiktok.com/@yourusername/live';
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
		if (previewOnly || !selectedGroup || !selectedOffer || adding) return;
		if (
			isCustomComments &&
			(parsedComments.error ||
				quantity < selectedOffer.minQuantity ||
				quantity > Math.min(selectedOffer.maxQuantity ?? 500, 500) ||
				(quantity - selectedOffer.minQuantity) % selectedOffer.stepQuantity !== 0)
		) {
			commentError =
				parsedComments.error ||
				(quantity > Math.min(selectedOffer.maxQuantity ?? 500, 500)
					? `Use up to ${Math.min(selectedOffer.maxQuantity ?? 500, 500)} comments.`
					: `Use at least ${selectedOffer.minQuantity} comments, in steps of ${selectedOffer.stepQuantity}.`);
			return;
		}
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
				if (!(await confirmSeparateCheckout(compatibility.existingMode, 'boosting_manual'))) {
					return;
				}
				cart.clear();
				showWarning('Cart emptied', 'Your earlier items were removed.');
			}

			cart.addBoostingService(
				selectedGroup.categoryId,
				checked.normalizedUrl || targetUrl.trim(),
				quantity,
				selectedOffer.id,
				isCustomComments ? parsedComments.text : undefined
			);
			recordAnalyticsEvent(
				'add_cart',
				`/services/${selectedOffer.platform}/${selectedOffer.outcome}`
			);
			showSuccess(
				'Added to cart!',
				`${quantity.toLocaleString()} ${selectedGroup.outcomeLabel.toLowerCase()} added successfully.`,
				6000
			);
			// All checkout navigation goes through the cart's combined minimum check.
			cart.open();
			targetUrl = '';
			commentText = '';
			commentError = null;
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
		<div
			bind:this={platformRow}
			class="storefront-scroll -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 sm:gap-3"
		>
			{#each platforms as [platform, label] (platform)}
				<button
					type="button"
					onclick={() => choosePlatform(platform)}
					aria-pressed={platform === selectedPlatform}
					class="min-w-24 snap-start rounded-2xl border p-3 text-center sm:min-w-28"
					style={platform === selectedPlatform
						? 'border-color: var(--primary); background: rgba(16,185,129,.08);'
						: 'border-color: var(--border);'}
				>
					<span
						aria-hidden="true"
						class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white"
					>
						<BrandIcon service={platform} size={29} />
					</span>
					<span class="mt-2 block text-sm font-semibold" style="color: var(--text);">{label}</span>
				</button>
			{/each}
		</div>

		<div>
			<p class="mb-3 text-sm font-semibold" style="color: var(--text-muted);">Choose a result</p>
			<div
				bind:this={resultRow}
				class="storefront-scroll -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0"
			>
				{#each visibleGroups as group (group.categoryId)}
					{@const OutcomeIcon = ICONS[group.outcome] ?? Eye}
					<button
						type="button"
						onclick={() => chooseGroup(group)}
						aria-pressed={selectedGroup?.categoryId === group.categoryId}
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
			{#key selectedGroup.categoryId}<div
					bind:this={optionsBlock}
					in:fade={fadeIn()}
					style="scroll-margin-top: 80px; scroll-margin-bottom: 16px;"
				>
					{#if selectedGroup.offers.length > 1}<p
							class="mb-3 text-sm font-semibold"
							style="color: var(--text-muted);"
						>
							{selectedGroup.platformLabel}
							{selectedGroup.outcomeLabel}
						</p>{/if}
					<div
						class="grid gap-3"
						role="group"
						aria-label={`${selectedGroup.platformLabel} ${selectedGroup.outcomeLabel} options`}
					>
						{#each offerCards as { offer, name, benefit, description, quantityAsName } (offer.id)}
							<button
								type="button"
								onclick={() => chooseOffer(offer)}
								aria-pressed={selectedOffer?.id === offer.id}
								class="min-h-24 rounded-xl border p-4 text-left"
								style={selectedOffer?.id === offer.id
									? 'border-color: var(--primary); background: rgba(16,185,129,.07);'
									: 'border-color: var(--border);'}
							>
								<div class="flex items-start justify-between gap-4">
									<div>
										<div class="flex flex-wrap items-center gap-2">
											<strong class="text-lg" style="color: var(--text);">{name}</strong>
										</div>
										{#if description && !sharedDescriptions.includes(description)}
											<p class="mt-1 text-sm" style="color: var(--text-muted);">{description}</p>
										{/if}
										{#if benefit}
											<p class="mt-1 text-xs" style="color: var(--text-muted);">
												{benefit}
											</p>
										{/if}
									</div>
									<strong class="text-right whitespace-nowrap" style="color: var(--text);">
										{formatPrice(
											roundCatalogPriceNgn(
												(boostingStartingQuantity(offer) / offer.stepQuantity) *
													offer.pricePerStepNgn
											)
										)}
										{#if !quantityAsName}<span
												class="mt-1 block text-xs font-normal"
												style="color: var(--text-muted);"
												>{boostingStartingQuantity(offer).toLocaleString()}
												{selectedGroup.outcomeLabel.toLowerCase()}</span
											>{/if}
									</strong>
								</div>
							</button>
						{/each}
					</div>
					{#each sharedDescriptions as description (description)}
						<p class="mt-3 text-sm" style="color: var(--text-muted);">{description}</p>
					{/each}
					{#if selectedOffer && (selectedOffer.refillDays || selectedCopy?.expectationChips.length)}
						{#key selectedOffer.id}
							<details class="mt-3 text-sm" style="color: var(--text-muted);">
								<summary class="min-h-11 cursor-pointer py-3 font-medium">
									{selectedOffer.refillDays
										? 'Refill terms (eligibility applies)'
										: 'Option details'}
								</summary>
								{#if selectedOffer.refillDays}<p class="pb-2">
										{selectedOffer.refillDays}-day refill requests are included, not a guarantee
										against drops. The window normally starts when your order is sent to the
										supplier. Check your order for the exact window and eligibility.
									</p>{/if}
								{#each selectedCopy?.expectationChips ?? [] as chip}
									<p class="pb-2">{chip}</p>
								{/each}
							</details>
						{/key}
					{/if}
				</div>{/key}

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

					{#if isCustomComments}
						<label for="boosting-comments" class="mb-2 block text-sm font-semibold"
							>Your comments</label
						>
						<textarea
							id="boosting-comments"
							bind:value={commentText}
							oninput={() => (commentError = null)}
							rows="5"
							maxlength={MAX_BOOST_COMMENT_TEXT_LENGTH}
							placeholder="One comment per line"
							aria-invalid={Boolean(commentError)}
							aria-describedby="boosting-comment-help"
							class="min-h-32 w-full rounded-xl border p-3 text-base"
							style="border-color: var(--border); background: var(--bg); color: var(--text);"
						></textarea>
						<p id="boosting-comment-help" class="mt-1 text-xs" style="color: var(--text-muted);">
							{quantity} comments · One per line
						</p>
						{#if commentError}<p role="status" class="mt-2 text-xs text-red-500">
								{commentError}
							</p>{/if}
					{:else}
						<BoostingQuantitySelector
							value={quantity}
							minQuantity={selectedOffer.minQuantity}
							maxQuantity={selectedOffer.maxQuantity}
							stepQuantity={selectedOffer.stepQuantity}
							presets={selectedOffer.quantityPresets}
							label={`${selectedGroup.outcomeLabel} quantity`}
							onchange={(next) => (quantity = next)}
						/>
					{/if}
					<button
						type="button"
						onclick={addToCart}
						disabled={previewOnly || adding || !Number.isFinite(total)}
						class="mt-4 min-h-12 w-full rounded-xl px-4 py-3 text-base font-bold disabled:opacity-60"
						style="background: var(--primary); color: #00150b;"
					>
						{previewOnly
							? 'Preview only — checkout disabled'
							: adding
								? 'Adding…'
								: total > 0
									? `Add to Cart — ${formatPrice(total)}`
									: 'Add to Cart'}
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
