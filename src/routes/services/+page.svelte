<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { Minus, Plus, Zap } from '$lib/icons';
	import { cart } from '$lib/stores/cart.svelte';
	import { showError, showSuccess, showWarning } from '$lib/stores/toasts';
	import { formatPrice } from '$lib/helpers/utils';
	import {
		getBoostingServiceConfig,
		computeBoostingPrice,
		isValidBoostingQuantity,
		BOOSTING_PLATFORM_LABELS,
		BOOSTING_ACTION_LABELS
	} from '$lib/helpers/boosting-service-config';
	import { validateLinkForAction, getRequiredLinkType } from '$lib/helpers/social-link-validator';
	import type { BoostingPlatform, BoostingActionType } from '$lib/helpers/social-link-validator';
	import { getTierDeliveryModeLabel, type TierDeliveryMode } from '$lib/helpers/tier-delivery-config';
	import type { BoostingServiceConfig } from '$lib/helpers/boosting-service-config';
	import type { PageData } from './$types';

	interface BoostingServiceDisplay {
		id: string;
		name: string;
		description: string;
		config: BoostingServiceConfig;
	}

	let { data }: { data: PageData } = $props();

	if (data.error) {
		showError('Failed to load boosting services', data.error);
	}

	const services = $derived<BoostingServiceDisplay[]>(
		(data.services as Array<{ id: string; name: string; description?: string | null; metadata: unknown }>).map(
			(service) => ({
				id: service.id,
				name: service.name,
				description: service.description || '',
				config: getBoostingServiceConfig(service.metadata)
			})
		)
	);

	const groupedServices = $derived.by(() => {
		const groups = new Map<string, BoostingServiceDisplay[]>();
		for (const service of services) {
			const label = BOOSTING_PLATFORM_LABELS[service.config.platform];
			const existing = groups.get(label) || [];
			existing.push(service);
			groups.set(label, existing);
		}
		return Array.from(groups.entries());
	});

	let quantityByServiceId = $state<Record<string, number>>({});
	let linkByServiceId = $state<Record<string, string>>({});
	let linkErrorByServiceId = $state<Record<string, string | null>>({});
	let addingServiceId = $state<string | null>(null);

	function getQuantity(serviceId: string, minQuantity: number): number {
		return quantityByServiceId[serviceId] ?? minQuantity;
	}

	function adjustQuantity(serviceId: string, minQuantity: number, stepQuantity: number, delta: number) {
		const current = getQuantity(serviceId, minQuantity);
		const next = current + delta * stepQuantity;
		quantityByServiceId[serviceId] = Math.max(minQuantity, next);
	}

	function getLink(serviceId: string): string {
		return linkByServiceId[serviceId] || '';
	}

	function handleLinkInput(
		serviceId: string,
		platform: BoostingPlatform,
		actionType: BoostingActionType,
		value: string
	) {
		linkByServiceId[serviceId] = value;
		if (!value.trim()) {
			linkErrorByServiceId[serviceId] = null;
			return;
		}
		const result = validateLinkForAction(platform, actionType, value);
		linkErrorByServiceId[serviceId] = result.valid ? null : result.reason || 'Invalid link';
	}

	async function addServiceToCart(service: (typeof services)[number]) {
		const quantity = getQuantity(service.id, service.config.minQuantity);
		const targetUrl = getLink(service.id).trim();

		if (!targetUrl) {
			linkErrorByServiceId[service.id] = 'Please enter a link.';
			return;
		}

		const linkCheck = validateLinkForAction(service.config.platform, service.config.actionType, targetUrl);
		if (!linkCheck.valid) {
			linkErrorByServiceId[service.id] = linkCheck.reason || 'Invalid link';
			return;
		}

		if (!isValidBoostingQuantity(service.config, quantity)) {
			showError('Invalid quantity', 'Please choose a valid quantity for this service.');
			return;
		}

		addingServiceId = service.id;
		try {
			let compatibility: { compatible: boolean; existingMode: TierDeliveryMode | null };
			try {
				compatibility = await cart.ensureDeliveryModeCompatibility(service.id, 'boosting_manual');
			} catch (error) {
				console.error('Failed to validate cart delivery mode compatibility:', error);
				showError('Could not update cart', 'Please try again.');
				return;
			}

			if (!compatibility.compatible) {
				const existingLabel = compatibility.existingMode
					? getTierDeliveryModeLabel(compatibility.existingMode)
					: getTierDeliveryModeLabel('instant_auto');
				const shouldReplace = window.confirm(
					`You already have ${existingLabel} item(s) in your cart.\n\nBoosting orders must be checked out separately.\n\nPress OK to clear your cart and add this service, or Cancel to keep your current cart.`
				);
				if (!shouldReplace) return;
				cart.clear();
				showWarning('Cart cleared', `Previous ${existingLabel} items were removed.`);
			}

			cart.addBoostingService(service.id, targetUrl, quantity);
			showSuccess(
				'Added to cart!',
				`${quantity.toLocaleString()} ${service.name} added successfully. Click to view cart.`,
				6000,
				'/checkout'
			);
			linkByServiceId[service.id] = '';
			linkErrorByServiceId[service.id] = null;
			quantityByServiceId[service.id] = service.config.minQuantity;
		} finally {
			addingServiceId = null;
		}
	}
</script>

<svelte:head>
	<title>Boosting Services | FastAccs</title>
	<meta
		name="description"
		content="Order followers, likes, views, and comments for your Instagram, TikTok, YouTube, Facebook, or X content. Pay securely, paste your link, and we'll handle the rest."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background-color: var(--bg);">
	<section class="mx-auto max-w-6xl px-4 py-12 sm:py-16">
		<div class="mb-10 text-center">
			<p class="text-xs font-semibold tracking-[0.18em] uppercase" style="color: var(--primary);">
				Boosting Services
			</p>
			<h1
				class="mx-auto mt-3 max-w-2xl text-3xl font-bold sm:text-4xl"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Followers, likes, and views — for a link you already own
			</h1>
			<p class="mx-auto mt-4 max-w-2xl text-sm leading-6 sm:text-base" style="color: var(--text-muted);">
				Pick a service, paste your profile or post link, and pay securely. We handle delivery from
				there.
			</p>
		</div>

		{#if groupedServices.length === 0}
			<div
				class="mx-auto max-w-xl rounded-[var(--r-md)] border p-10 text-center"
				style="border-color: var(--border); background: var(--bg-elev-1);"
			>
				<p style="color: var(--text-muted);">No boosting services are available right now. Check back soon.</p>
			</div>
		{/if}

		{#each groupedServices as [platformLabel, platformServices] (platformLabel)}
			<div class="mb-10">
				<h2
					class="mb-4 text-lg font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					{platformLabel}
				</h2>
				<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{#each platformServices as service (service.id)}
						{@const quantity = getQuantity(service.id, service.config.minQuantity)}
						{@const price = computeBoostingPrice(service.config, quantity)}
						{@const requiredLinkType = getRequiredLinkType(service.config.actionType)}
						<div
							class="flex flex-col rounded-[var(--r-md)] border p-5"
							style="border-color: var(--border); background: var(--bg-elev-1);"
						>
							<div class="mb-3 flex items-center gap-2">
								<Zap size={16} style="color: var(--primary);" />
								<h3 class="font-semibold" style="color: var(--text);">{service.name}</h3>
							</div>
							{#if service.description}
								<p class="mb-3 text-sm" style="color: var(--text-muted);">{service.description}</p>
							{/if}
							<p class="mb-4 text-xs" style="color: var(--text-dim);">
								{BOOSTING_ACTION_LABELS[service.config.actionType]} · Min
								{service.config.minQuantity.toLocaleString()}, steps of
								{service.config.stepQuantity.toLocaleString()}
								{#if service.config.refillAvailable}
									· {service.config.refillDays}-day refill
								{/if}
							</p>

							<label
								for={`link-${service.id}`}
								class="mb-1 block text-xs font-medium"
								style="color: var(--text);"
							>
								Your {requiredLinkType === 'profile' ? 'profile/channel' : 'post/video'} link
							</label>
							<input
								id={`link-${service.id}`}
								type="url"
								value={getLink(service.id)}
								oninput={(e) =>
									handleLinkInput(
										service.id,
										service.config.platform,
										service.config.actionType,
										(e.target as HTMLInputElement).value
									)}
								placeholder={requiredLinkType === 'profile'
									? `https://${service.config.platform}.com/yourusername`
									: `https://${service.config.platform}.com/.../post`}
								class="mb-1 block w-full rounded-md px-3 py-2 text-sm"
								style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
							/>
							{#if linkErrorByServiceId[service.id]}
								<p class="mb-2 text-xs text-red-500">{linkErrorByServiceId[service.id]}</p>
							{:else}
								<div class="mb-2"></div>
							{/if}

							<div class="mb-4 flex items-center justify-between">
								<span class="text-xs font-medium" style="color: var(--text);">Quantity</span>
								<div class="flex items-center gap-2">
									<button
										type="button"
										onclick={() =>
											adjustQuantity(service.id, service.config.minQuantity, service.config.stepQuantity, -1)}
										disabled={quantity <= service.config.minQuantity}
										class="flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-40"
										style="background: var(--surface); color: var(--text); border: 1px solid var(--border);"
										aria-label="Decrease quantity"
									>
										<Minus size={14} />
									</button>
									<span class="min-w-[4.5rem] text-center text-sm font-semibold" style="color: var(--text);">
										{quantity.toLocaleString()}
									</span>
									<button
										type="button"
										onclick={() =>
											adjustQuantity(service.id, service.config.minQuantity, service.config.stepQuantity, 1)}
										class="flex h-7 w-7 items-center justify-center rounded-full"
										style="background: var(--surface); color: var(--text); border: 1px solid var(--border);"
										aria-label="Increase quantity"
									>
										<Plus size={14} />
									</button>
								</div>
							</div>

							<button
								type="button"
								onclick={() => addServiceToCart(service)}
								disabled={addingServiceId === service.id || Number.isNaN(price)}
								class="mt-auto flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
								style="background: var(--btn-primary-gradient); color: #04140C;"
							>
								{addingServiceId === service.id
									? 'Adding...'
									: `Add to Cart — ${formatPrice(price)}`}
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</section>
</main>

<Footer />
