<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { ArrowLeft, Eye, Heart, Minus, MessageCircle, Plus, Repeat, UserPlus } from '$lib/icons';
	import { cart } from '$lib/stores/cart.svelte';
	import { showError, showSuccess, showWarning } from '$lib/stores/toasts';
	import { formatPrice } from '$lib/helpers/utils';
	import {
		getBoostingServiceConfig,
		computeBoostingPrice,
		isValidBoostingQuantity,
		getQuantityChips,
		BOOSTING_ACTION_LABELS,
		BOOSTING_TURNAROUND_MESSAGE
	} from '$lib/helpers/boosting-service-config';
	import { validateLinkForAction, getRequiredLinkType } from '$lib/helpers/social-link-validator';
	import type { BoostingPlatform, BoostingActionType } from '$lib/helpers/social-link-validator';
	import { getPlatformIcon } from '$lib/helpers/platformColors';
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
		data.services.map((service) => ({
			id: service.id,
			name: service.name,
			description: service.description || '',
			config: getBoostingServiceConfig(service.metadata)
		}))
	);

	const ACTION_ICONS: Record<BoostingActionType, typeof Heart> = {
		followers: UserPlus,
		subscribers: UserPlus,
		likes: Heart,
		views: Eye,
		comments: MessageCircle,
		reposts: Repeat
	};

	function getProfileLinkLabel(platform: BoostingPlatform): string {
		return platform === 'youtube' ? 'channel link' : 'profile link';
	}

	let expandedServiceId = $state<string | null>(null);
	let quantityByServiceId = $state<Record<string, number>>({});
	let linkByServiceId = $state<Record<string, string>>({});
	let linkErrorByServiceId = $state<Record<string, string | null>>({});
	let addingServiceId = $state<string | null>(null);
	let platformIconFailed = $state(false);
	let waitlistLoadingByServiceId = $state<Record<string, boolean>>({});
	let waitlistSubscribedByServiceId = $state<Record<string, boolean>>({});

	const currentUser = $derived((page.data as { user?: { id: string } | null }).user || null);

	function toggleExpanded(serviceId: string) {
		expandedServiceId = expandedServiceId === serviceId ? null : serviceId;
	}

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
			expandedServiceId = null;
		} finally {
			addingServiceId = null;
		}
	}

	function isServiceWaitlisted(serviceId: string): boolean {
		return Boolean(waitlistSubscribedByServiceId[serviceId]);
	}

	function isServiceWaitlistLoading(serviceId: string): boolean {
		return Boolean(waitlistLoadingByServiceId[serviceId]);
	}

	async function loadWaitlistStatusForComingSoonServices(): Promise<void> {
		if (!currentUser) return;
		const comingSoonServices = services.filter((service) => service.config.pricePerStep <= 0);
		if (comingSoonServices.length === 0) return;

		await Promise.all(
			comingSoonServices.map(async (service) => {
				try {
					const response = await fetch(
						`/api/boosting-service-waitlist?serviceId=${encodeURIComponent(service.id)}`
					);
					if (!response.ok) return;
					const result = await response.json();
					waitlistSubscribedByServiceId = {
						...waitlistSubscribedByServiceId,
						[service.id]: Boolean(result?.data?.subscribed)
					};
				} catch (error) {
					console.error('Failed to load waitlist status:', error);
				}
			})
		);
	}

	async function subscribeToWaitlist(service: (typeof services)[number]): Promise<void> {
		if (isServiceWaitlistLoading(service.id) || isServiceWaitlisted(service.id)) return;

		if (!currentUser) {
			const returnUrl = encodeURIComponent(page.url.pathname + page.url.search);
			goto(`/auth/login?returnUrl=${returnUrl}`);
			return;
		}

		waitlistLoadingByServiceId = { ...waitlistLoadingByServiceId, [service.id]: true };
		try {
			const response = await fetch('/api/boosting-service-waitlist', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ serviceId: service.id })
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				showError('Subscription failed', result.error || 'Unable to subscribe right now.');
				return;
			}

			waitlistSubscribedByServiceId = { ...waitlistSubscribedByServiceId, [service.id]: true };
			showSuccess('Subscribed', result.message || "You'll be notified when this service is live.");
		} catch (error) {
			console.error('Failed to subscribe to waitlist:', error);
			showError('Subscription failed', 'Unable to subscribe right now. Please try again.');
		} finally {
			waitlistLoadingByServiceId = { ...waitlistLoadingByServiceId, [service.id]: false };
		}
	}

	onMount(() => {
		void loadWaitlistStatusForComingSoonServices();
	});
</script>

<svelte:head>
	<title>{data.label} Boosting Services | FastAccs</title>
	<meta
		name="description"
		content={`Order followers, likes, and views for ${data.label}. Paste your link and pay securely.`}
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background-color: var(--bg);">
	<section class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
		<button
			type="button"
			onclick={() => goto('/services')}
			class="mb-6 flex items-center gap-1.5 text-sm font-medium"
			style="color: var(--text-muted);"
		>
			<ArrowLeft size={16} />
			All platforms
		</button>

		<div class="mb-8 flex items-center gap-3">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full"
				style={`background: ${
					{
						instagram: 'var(--gradient-instagram)',
						tiktok: 'var(--gradient-tiktok)',
						youtube: 'var(--gradient-youtube)',
						facebook: 'var(--gradient-facebook)',
						x: 'var(--gradient-twitter)'
					}[data.platform]
				};`}
			>
				{#if data.iconUrl && !platformIconFailed}
					<img
						src={data.iconUrl}
						alt={data.label}
						class="h-7 w-7 rounded-full object-cover"
						onerror={() => (platformIconFailed = true)}
					/>
				{:else}
					{@const PlatformIcon = getPlatformIcon(data.platform)}
					<PlatformIcon class="h-6 w-6 text-white" />
				{/if}
			</div>
			<h1 class="text-2xl font-bold sm:text-3xl" style="color: var(--text); font-family: var(--font-head);">
				{data.label}
			</h1>
		</div>

		<p class="mb-6 text-xs" style="color: var(--text-dim);">{BOOSTING_TURNAROUND_MESSAGE}</p>

		{#if services.length === 0}
			<div
				class="rounded-[var(--r-md)] border p-10 text-center"
				style="border-color: var(--border); background: var(--bg-elev-1);"
			>
				<p style="color: var(--text-muted);">No services available for {data.label} right now.</p>
			</div>
		{/if}

		<div class="space-y-3">
			{#each services as service (service.id)}
				{@const ActionIcon = ACTION_ICONS[service.config.actionType]}
				{@const isComingSoon = service.config.pricePerStep <= 0}
				{@const isExpanded = !isComingSoon && expandedServiceId === service.id}
				{@const quantity = getQuantity(service.id, service.config.minQuantity)}
				{@const price = computeBoostingPrice(service.config, quantity)}
				{@const requiredLinkType = getRequiredLinkType(service.config.actionType)}
				{@const startingPrice = computeBoostingPrice(service.config, service.config.minQuantity)}
				<div
					class="rounded-[var(--r-md)] border"
					style="border-color: var(--border); background: var(--bg-elev-1);"
				>
					<button
						type="button"
						onclick={() => !isComingSoon && toggleExpanded(service.id)}
						disabled={isComingSoon}
						class="flex w-full items-center gap-3 p-4 text-left disabled:cursor-default"
					>
						<div
							class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
							style="background: rgba(105,109,250,0.14);"
						>
							<ActionIcon size={18} style="color: var(--fa-blue-300);" />
						</div>
						<div class="flex-1">
							<p class="font-semibold" style="color: var(--text);">{service.name}</p>
							{#if isComingSoon}
								<p class="text-xs font-medium" style="color: var(--status-pending);">Coming soon</p>
							{:else}
								<p class="text-xs" style="color: var(--text-dim);">
									From {formatPrice(startingPrice)}
									{#if service.config.refillAvailable}
										· {service.config.refillDays}-day guarantee
									{/if}
								</p>
							{/if}
						</div>
						{#if !isComingSoon}
							<span class="text-lg" style="color: var(--text-dim);">{isExpanded ? '−' : '+'}</span>
						{/if}
					</button>

					{#if isComingSoon}
						<div class="border-t px-4 pb-4 pt-3" style="border-color: var(--border);">
							<button
								type="button"
								onclick={() => subscribeToWaitlist(service)}
								disabled={isServiceWaitlistLoading(service.id) || isServiceWaitlisted(service.id)}
								class="flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-70"
								style={isServiceWaitlisted(service.id)
									? 'background: var(--surface); color: var(--text-muted); border: 1px solid var(--border);'
									: 'background: var(--btn-secondary-gradient); color: var(--link); border: 1px solid rgba(170,173,255,0.26);'}
							>
								{isServiceWaitlisted(service.id)
									? "You'll be notified"
									: isServiceWaitlistLoading(service.id)
										? 'Subscribing...'
										: 'Notify me'}
							</button>
						</div>
					{/if}

					{#if isExpanded}
						<div class="border-t px-4 pb-4 pt-4" style="border-color: var(--border);">
							{#if service.description}
								<p class="mb-3 text-sm" style="color: var(--text-muted);">{service.description}</p>
							{/if}

							<label
								for={`link-${service.id}`}
								class="mb-1 block text-xs font-medium"
								style="color: var(--text);"
							>
								Your {requiredLinkType === 'profile'
									? getProfileLinkLabel(service.config.platform)
									: 'post/video link'}
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
							<p class="mb-1 text-xs" style="color: var(--text-dim);">
								{requiredLinkType === 'profile'
									? 'Copy this from your browser’s address bar while on your profile.'
									: 'Copy this from your browser’s address bar or the Share button on the post.'}
							</p>
							{#if linkErrorByServiceId[service.id]}
								<p class="mb-2 text-xs text-red-500">{linkErrorByServiceId[service.id]}</p>
							{:else}
								<div class="mb-2"></div>
							{/if}

							<div class="mb-3 flex flex-wrap gap-1.5">
								{#each getQuantityChips(service.config) as chip}
									<button
										type="button"
										onclick={() => (quantityByServiceId[service.id] = chip)}
										class="rounded-full px-2.5 py-1 text-xs font-semibold"
										style={quantity === chip
											? 'background: var(--fa-blue-500); color: #ffffff;'
											: 'background: var(--surface); color: var(--text-muted); border: 1px solid var(--border);'}
									>
										{chip.toLocaleString()}
									</button>
								{/each}
							</div>

							<div class="mb-4 flex items-center justify-between">
								<span class="text-xs font-medium" style="color: var(--text);">
									{BOOSTING_ACTION_LABELS[service.config.actionType]} quantity
								</span>
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
								class="flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
								style="background: var(--fa-blue-500); color: #ffffff;"
							>
								{addingServiceId === service.id
									? 'Adding...'
									: `Add to Cart — ${formatPrice(price)}`}
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>
</main>

<Footer />
