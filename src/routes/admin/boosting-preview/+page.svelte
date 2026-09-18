<script lang="ts">
	import { Check, Eye, Heart, Music, Share2, UserPlus, Users } from '$lib/icons';
	import BrandIcon from '$lib/components/BrandIcon.svelte';
	import { formatPrice } from '$lib/helpers/utils';
	import {
		BOOSTING_OFFER_FIXTURES,
		getPreviewQuantityPresets,
		type BoostingOfferFixture
	} from '$lib/helpers/boosting-offer-fixtures';
	import type { BoostingActionType, BoostingPlatform } from '$lib/helpers/social-link-validator';

	const ACTION_ICONS: Partial<Record<BoostingActionType, typeof Heart>> = {
		followers: UserPlus,
		subscribers: UserPlus,
		members: Users,
		likes: Heart,
		views: Eye,
		comments: Share2,
		reposts: Share2,
		streams: Music,
		monthly_listeners: Music,
		reactions: Heart,
		shares: Share2,
		saves: Heart,
		watch_time: Eye
	};

	let selectedPlatform = $state<BoostingPlatform>('instagram');
	let selectedAction = $state<BoostingActionType>('followers');
	let selectedOfferId = $state('instagram-followers-value');
	let selectedQuantity = $state(BOOSTING_OFFER_FIXTURES[0].outcomes[0].offers[0].unitQuantity);
	let targetLink = $state('');
	let previewMessage = $state('');

	const platformData = $derived(
		BOOSTING_OFFER_FIXTURES.find((item) => item.platform === selectedPlatform) ??
			BOOSTING_OFFER_FIXTURES[0]
	);
	const outcomeData = $derived(
		platformData.outcomes.find((item) => item.action === selectedAction) ?? platformData.outcomes[0]
	);
	const selectedOffer = $derived(
		outcomeData.offers.find((item) => item.id === selectedOfferId) ?? outcomeData.offers[0]
	);
	const quantityPresets = $derived(getPreviewQuantityPresets(selectedOffer.unitQuantity));
	const totalPrice = $derived(
		Math.round((selectedOffer.priceNgn * selectedQuantity) / selectedOffer.unitQuantity)
	);

	function choosePlatform(platform: BoostingPlatform): void {
		selectedPlatform = platform;
		const next = BOOSTING_OFFER_FIXTURES.find((item) => item.platform === platform)!;
		selectedAction = next.outcomes[0].action;
		selectedOfferId = next.outcomes[0].offers[0].id;
		selectedQuantity = next.outcomes[0].offers[0].unitQuantity;
		previewMessage = '';
	}

	function chooseOutcome(action: BoostingActionType): void {
		selectedAction = action;
		const next = platformData.outcomes.find((item) => item.action === action)!;
		selectedOfferId = next.offers[0].id;
		selectedQuantity = next.offers[0].unitQuantity;
		previewMessage = '';
	}

	function chooseOffer(offer: BoostingOfferFixture): void {
		selectedOfferId = offer.id;
		selectedQuantity = offer.unitQuantity;
		previewMessage = '';
	}

	function previewAdd(): void {
		previewMessage = targetLink.trim()
			? 'Looks good. In the live flow, this would be added to the cart now.'
			: 'Paste a link first. Nothing is submitted from this preview.';
	}
</script>

<svelte:head>
	<title>Boosting Customer Flow Preview | FastAccs</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
	<header class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="text-xs font-semibold tracking-[0.16em] uppercase" style="color: var(--primary);">
				Private preview
			</p>
			<h1 class="mt-1 text-2xl font-bold" style="color: var(--text);">Simple Boosting flow</h1>
			<p class="mt-1 max-w-xl text-sm" style="color: var(--text-muted);">
				Illustrative offers only. This page cannot add to cart or contact a supplier.
			</p>
		</div>
		<a href="/admin/boosting-services" class="text-sm font-semibold" style="color: var(--link);">
			Open catalogue admin →
		</a>
	</header>

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
		<section
			class="order-2 rounded-2xl border p-4 sm:p-6 lg:order-1"
			style="border-color: var(--border); background: var(--bg-elev-1);"
		>
			<p class="text-sm font-semibold" style="color: var(--text);">What this preview is testing</p>
			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				{#each [['One easy decision at a time', 'Platform, result, option, then link.'], ['Only two clear options', 'Supplier services stay hidden.'], ['Short, calm expectations', 'No technical supplier wording.'], ['Immediate price changes', 'Quantity and total stay visible.']] as item}
					<div
						class="rounded-xl border p-3"
						style="border-color: var(--border); background: var(--bg);"
					>
						<p class="text-sm font-semibold" style="color: var(--text);">{item[0]}</p>
						<p class="mt-1 text-xs" style="color: var(--text-muted);">{item[1]}</p>
					</div>
				{/each}
			</div>

			<div
				class="mt-6 rounded-xl border p-4"
				style="border-color: var(--border); background: var(--bg);"
			>
				<p class="text-xs font-semibold tracking-wide uppercase" style="color: var(--text-dim);">
					Hidden flexibility
				</p>
				<p class="mt-2 text-sm leading-6" style="color: var(--text-muted);">
					The selected customer option can map to several approved services across both suppliers.
					The buyer keeps one price and one promise while the safe router chooses behind the scenes.
				</p>
			</div>
		</section>

		<section
			class="order-1 overflow-hidden rounded-[1.75rem] border shadow-2xl lg:order-2"
			style="border-color: var(--border); background: var(--bg);"
			aria-label="Mobile customer flow preview"
		>
			<div
				class="border-b px-5 py-4"
				style="border-color: var(--border); background: var(--bg-elev-1);"
			>
				<p class="text-xs font-semibold tracking-[0.14em] uppercase" style="color: var(--primary);">
					Boosting Services
				</p>
				<h2 class="mt-1 text-xl font-bold" style="color: var(--text);">
					What would you like to grow?
				</h2>
			</div>

			<div class="platform-scroll flex gap-2 overflow-x-auto px-5 py-4">
				{#each BOOSTING_OFFER_FIXTURES as item (item.platform)}
					<button
						type="button"
						onclick={(event) => {
							choosePlatform(item.platform);
							(event.currentTarget as HTMLButtonElement).scrollIntoView({
								behavior: 'smooth',
								block: 'nearest',
								inline: 'center'
							});
						}}
						class="flex min-h-[74px] w-[78px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-2.5 text-center text-[11px] font-semibold"
						style={selectedPlatform === item.platform
							? 'border-color: var(--primary); background: rgba(16, 185, 129, 0.12); color: var(--text);'
							: 'border-color: var(--border); background: var(--bg-elev-1); color: var(--text-muted);'}
					>
						<span
							class="flex h-9 w-9 items-center justify-center rounded-xl"
							style="background: #f8fafc; box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);"
						>
							<BrandIcon service={item.label} size={22} />
						</span>
						<span class="leading-none">{item.label}</span>
					</button>
				{/each}
			</div>

			<div class="px-5 pb-6">
				<p class="mb-2 text-xs font-semibold" style="color: var(--text-dim);">Choose a result</p>
				<div class="grid grid-cols-2 gap-2">
					{#each platformData.outcomes as result (result.action)}
						{@const ActionIcon = ACTION_ICONS[result.action] ?? Heart}
						<button
							type="button"
							onclick={() => chooseOutcome(result.action)}
							class="flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold"
							style={selectedAction === result.action
								? 'border-color: var(--primary); background: rgba(16, 185, 129, 0.09); color: var(--text);'
								: 'border-color: var(--border); background: var(--bg-elev-1); color: var(--text-muted);'}
						>
							<ActionIcon size={17} />
							{result.label}
						</button>
					{/each}
				</div>

				<p class="mt-5 mb-2 text-xs font-semibold" style="color: var(--text-dim);">
					Pick what suits you
				</p>
				<div class="space-y-2">
					{#each outcomeData.offers as offer (offer.id)}
						<button
							type="button"
							onclick={() => chooseOffer(offer)}
							class="relative w-full rounded-xl border p-3 text-left"
							style={selectedOffer.id === offer.id
								? 'border-color: var(--primary); background: rgba(16, 185, 129, 0.08);'
								: 'border-color: var(--border); background: var(--bg-elev-1);'}
						>
							<div class="flex items-start justify-between gap-3">
								<div>
									<div class="flex flex-wrap items-center gap-2">
										<span class="text-sm font-bold" style="color: var(--text);">{offer.label}</span>
										{#if offer.badge}
											<span
												class="rounded-full px-2 py-0.5 text-[10px] font-bold"
												style="background: var(--primary); color: #04120c;"
											>
												{offer.badge}
											</span>
										{/if}
									</div>
									<p class="mt-1 text-xs" style="color: var(--text-muted);">{offer.shortPromise}</p>
								</div>
								<p class="shrink-0 text-sm font-bold" style="color: var(--text);">
									{formatPrice(offer.priceNgn)}
								</p>
							</div>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each offer.highlights as highlight}
									<span class="flex items-center gap-1 text-[11px]" style="color: var(--text-dim);">
										<Check size={12} style="color: var(--primary);" />
										{highlight}
									</span>
								{/each}
							</div>
						</button>
					{/each}
				</div>

				<label
					for="preview-link"
					class="mt-5 mb-1 block text-xs font-semibold"
					style="color: var(--text);"
				>
					Paste your link
				</label>
				<input
					id="preview-link"
					type="url"
					bind:value={targetLink}
					placeholder="Paste the profile or post link here"
					class="w-full rounded-xl border px-3 py-3 text-sm outline-none"
					style="border-color: var(--border); background: var(--bg-elev-1); color: var(--text);"
				/>

				<div class="mt-4">
					<p class="mb-2 text-xs font-semibold" style="color: var(--text-dim);">Choose quantity</p>
					<div class="quantity-scroll flex gap-1.5 overflow-x-auto pb-1">
						{#each quantityPresets as quantity}
							<button
								type="button"
								onclick={() => (selectedQuantity = quantity)}
								aria-label={`${quantity.toLocaleString()} ${outcomeData.label}`}
								class="min-w-16 shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold"
								style={selectedQuantity === quantity
									? 'border-color: var(--primary); background: var(--primary); color: #04120c;'
									: 'border-color: var(--border); background: var(--bg-elev-1); color: var(--text-muted);'}
							>
								{quantity.toLocaleString()}
							</button>
						{/each}
					</div>
				</div>

				<button
					type="button"
					onclick={previewAdd}
					class="mt-5 w-full rounded-xl px-4 py-3 text-sm font-bold"
					style="background: var(--primary); color: #04120c;"
				>
					Add to Cart — {formatPrice(totalPrice)}
				</button>
				{#if previewMessage}
					<p
						class="mt-3 rounded-lg px-3 py-2 text-center text-xs"
						style="background: var(--bg-elev-1); color: var(--text-muted);"
					>
						{previewMessage}
					</p>
				{/if}
			</div>
		</section>
	</div>
</div>

<style>
	.platform-scroll {
		scrollbar-width: none;
	}
	.platform-scroll::-webkit-scrollbar {
		display: none;
	}
	.quantity-scroll {
		scrollbar-width: none;
	}
	.quantity-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
