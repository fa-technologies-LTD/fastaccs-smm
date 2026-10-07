<script lang="ts">
	import BrandIcon from '$lib/components/BrandIcon.svelte';
	import { boostingStartingQuantity } from '$lib/helpers/boosting-checkout';
	import BoostingQuantitySelector from '$lib/components/BoostingQuantitySelector.svelte';
	import {
		ArrowLeft,
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
	import { formatPrice } from '$lib/helpers/utils';
	import { roundCatalogPriceNgn } from '$lib/helpers/catalog-pricing';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let selectedPlatform = $state(data.groups[0]?.platform ?? '');
	let selectedCategoryId = $state(data.groups[0]?.categoryId ?? '');
	let selectedOfferByCategory = $state<Record<string, string>>({});
	let quantityByCategory = $state<Record<string, number>>({});

	const platforms = $derived([
		...new Map(data.groups.map((group) => [group.platform, group.platformLabel])).entries()
	]);
	const visibleGroups = $derived(
		data.groups.filter((group) => group.platform === selectedPlatform)
	);
	const selectedGroup = $derived(
		visibleGroups.find((group) => group.categoryId === selectedCategoryId) ??
			visibleGroups[0] ??
			null
	);
	const selectedOffer = $derived.by(() => {
		if (!selectedGroup) return null;
		const id = selectedOfferByCategory[selectedGroup.categoryId];
		return selectedGroup.offers.find((offer) => offer.id === id) ?? selectedGroup.offers[0] ?? null;
	});
	const quantity = $derived(
		selectedGroup && selectedOffer
			? (quantityByCategory[selectedGroup.categoryId] ?? boostingStartingQuantity(selectedOffer))
			: 0
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

	function choosePlatform(platform: string): void {
		selectedPlatform = platform;
		selectedCategoryId = data.groups.find((group) => group.platform === platform)?.categoryId ?? '';
	}

	function chooseGroup(categoryId: string): void {
		selectedCategoryId = categoryId;
	}

	function chooseOffer(categoryId: string, offerId: string, minimum: number): void {
		selectedOfferByCategory = { ...selectedOfferByCategory, [categoryId]: offerId };
		const offer = data.groups
			.find((group) => group.categoryId === categoryId)
			?.offers.find((item) => item.id === offerId);
		quantityByCategory = {
			...quantityByCategory,
			[categoryId]: offer ? boostingStartingQuantity(offer) : minimum
		};
	}

	function chooseQuantity(categoryId: string, value: number): void {
		quantityByCategory = { ...quantityByCategory, [categoryId]: value };
	}
</script>

<svelte:head><title>Boosting Customer Preview | Admin</title></svelte:head>

<div class="mx-auto max-w-6xl space-y-4 pb-6 sm:space-y-5">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-xs font-semibold tracking-[.14em] uppercase" style="color: var(--primary);">
				Private preview
			</p>
			<h1 class="mt-1 text-2xl font-bold" style="color: var(--text);">Customer Boosting flow</h1>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				This includes generated drafts so you can review the complete customer flow. It cannot add
				to cart or contact a supplier.
			</p>
		</div>
		<a
			href="/admin/boosting-mappings"
			class="flex items-center gap-2 text-sm font-semibold"
			style="color: var(--link);"><ArrowLeft size={15} /> Back to setup</a
		>
	</header>

	{#if !data.groups.length}
		<section
			class="rounded-2xl border p-8 text-center"
			style="border-color: var(--border); background: var(--bg-elev-1);"
		>
			<h2 class="text-lg font-bold" style="color: var(--text);">
				No customer choices are ready yet
			</h2>
			<p class="mt-2 text-sm" style="color: var(--text-muted);">
				Save an Affordable, More stable or Premium choice as Private preview first.
			</p>
		</section>
	{:else}
		<section
			class="overflow-hidden rounded-2xl border"
			style="border-color: var(--border); background: var(--bg-elev-1);"
		>
			<div class="border-b p-4 sm:p-5" style="border-color: var(--border);">
				<p class="text-xs font-semibold tracking-[.16em] uppercase" style="color: var(--primary);">
					Boosting services
				</p>
				<h2 class="mt-1 text-2xl font-bold" style="color: var(--text);">
					What would you like to grow?
				</h2>
			</div>

			<div class="space-y-5 p-4 sm:space-y-6 sm:p-5">
				<div class="preview-scroll -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 sm:gap-3">
					{#each platforms as [platform, label] (platform)}
						<button
							type="button"
							onclick={() => choosePlatform(platform)}
							class="min-w-24 snap-start rounded-2xl border p-3 text-center sm:min-w-28"
							style={platform === selectedPlatform
								? 'border-color: var(--primary); background: rgba(16,185,129,.08);'
								: 'border-color: var(--border);'}
						>
							<span class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white"
								><BrandIcon service={platform} size={29} /></span
							>
							<span class="mt-2 block text-sm font-semibold" style="color: var(--text);"
								>{label}</span
							>
						</button>
					{/each}
				</div>

				<div>
					<p class="mb-3 text-sm font-semibold" style="color: var(--text-muted);">
						Choose a result
					</p>
					<div
						class="preview-scroll -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0"
					>
						{#each visibleGroups as group (group.categoryId)}
							{@const OutcomeIcon = ICONS[group.outcome] ?? Eye}
							<button
								type="button"
								onclick={() => chooseGroup(group.categoryId)}
								class="flex min-h-20 min-w-[78%] shrink-0 snap-start items-center gap-3 rounded-xl border p-4 text-left sm:min-w-0"
								style={selectedGroup?.categoryId === group.categoryId
									? 'border-color: var(--primary); background: rgba(16,185,129,.07);'
									: 'border-color: var(--border);'}
							>
								<OutcomeIcon size={23} />
								<span
									><strong class="block" style="color: var(--text);">{group.outcomeLabel}</strong
									>{#if !group.categoryActive}<small style="color: #fbbf24;"
											>Category currently hidden</small
										>{/if}</span
								>
							</button>
						{/each}
					</div>
				</div>

				{#if selectedGroup}
					<div>
						<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm font-semibold" style="color: var(--text-muted);">
								Pick what suits you
							</p>
							{#if selectedGroup.offers.some((offer) => offer.status !== 'live')}
								<span
									class="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
									style="border-color: var(--border); color: var(--text-muted);"
								>
									Private draft preview
								</span>
							{/if}
						</div>
						<div class="grid gap-3">
							{#each selectedGroup.offers as offer, index (offer.id)}
								<button
									type="button"
									onclick={() =>
										chooseOffer(selectedGroup!.categoryId, offer.id, offer.minQuantity)}
									class="min-h-24 rounded-xl border p-3 text-left sm:p-4"
									style={selectedOffer?.id === offer.id
										? 'border-color: var(--primary); background: rgba(16,185,129,.07);'
										: 'border-color: var(--border);'}
								>
									<div class="flex items-start justify-between gap-4">
										<div>
											<div class="flex flex-wrap items-center gap-2">
												<strong style="color: var(--text);">{offer.customerName}</strong
												>{#if index === 0}<span
														class="rounded-full px-2 py-0.5 text-[10px] font-bold"
														style="background: var(--primary); color: #00150b;">Recommended</span
													>{/if}
											</div>
											<p class="mt-1 text-sm" style="color: var(--text-muted);">
												{offer.shortPromise}
											</p>
										</div>
										<strong class="whitespace-nowrap" style="color: var(--text);"
											>{formatPrice(
												roundCatalogPriceNgn(
													(boostingStartingQuantity(offer) / offer.stepQuantity) *
														offer.pricePerStepNgn
												)
											)}</strong
										>
									</div>
									{#if offer.expectationChips.length}<div
											class="mt-3 flex flex-wrap gap-x-4 gap-y-2"
										>
											{#each offer.expectationChips as chip, index (index)}<span
													class="flex items-center gap-1.5 text-xs"
													style="color: var(--text-muted);"
													><Check size={14} style="color: var(--primary);" /> {chip}</span
												>{/each}
										</div>{/if}
								</button>
							{/each}
						</div>
					</div>

					{#if selectedOffer}
						<div class="rounded-xl border p-4" style="border-color: var(--border);">
							<BoostingQuantitySelector
								value={quantity}
								minQuantity={selectedOffer.minQuantity}
								maxQuantity={selectedOffer.maxQuantity}
								stepQuantity={selectedOffer.stepQuantity}
								presets={selectedOffer.quantityPresets}
								onchange={(next) => chooseQuantity(selectedGroup!.categoryId, next)}
							/>
							<button
								type="button"
								disabled
								class="mt-4 min-h-12 w-full rounded-xl px-4 py-3 text-base font-bold opacity-80"
								style="background: var(--primary); color: #00150b;"
								>Add to Cart — {formatPrice(total)}</button
							>
						</div>
					{/if}
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	.preview-scroll {
		scrollbar-width: none;
	}

	.preview-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
