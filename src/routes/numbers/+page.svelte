<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { cart } from '$lib/stores/cart.svelte';
	import { recordAnalyticsEvent } from '$lib/services/analytics-events';
	import { showWarning, showSuccess, showError } from '$lib/stores/toasts';
	import { RefreshCw, ChevronDown, Phone, BellRing, Check, Search } from '$lib/icons';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import BrandIcon from '$lib/components/BrandIcon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// 2-letter ISO country code → flag emoji (regional indicator letters).
	function codeToFlag(code: string): string {
		const cc = (code || '').trim().toUpperCase().slice(0, 2);
		if (!/^[A-Z]{2}$/.test(cc)) return '🌍';
		return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
	}

	// Remember this section so checkout returns here (not the accounts page) on empty cart.
	onMount(() => {
		try {
			sessionStorage.setItem('shopReturn', '/numbers');
		} catch {
			/* ignore */
		}
		void openRequestedService();
	});

	// Start neutral: the buyer chooses a service rather than the page assuming WhatsApp.
	let openId = $state<number | null>(null);
	let buyingTierId = $state<string | null>(null);
	let serviceQuery = $state('');
	let notifyingTierId = $state<string | null>(null);
	const notifiedTiers = new SvelteSet<string>();
	const measuredServiceOpens = new Set<number>();
	const visibleServices = $derived(
		data.services.filter((service) =>
			service.serviceName.toLowerCase().includes(serviceQuery.trim().toLowerCase())
		)
	);

	function normaliseServiceKey(value: string): string {
		return value.toLowerCase().replace(/[^a-z0-9]/g, '');
	}

	async function openRequestedService(): Promise<void> {
		const requestedService = new URLSearchParams(window.location.search).get('service');
		if (!requestedService) return;

		const requestedKey = normaliseServiceKey(requestedService);
		const service = data.services.find(
			(item) =>
				normaliseServiceKey(item.serviceName) === requestedKey ||
				String(item.serviceId) === requestedService
		);
		if (!service) return;

		openId = service.serviceId;
		if (!measuredServiceOpens.has(service.serviceId)) {
			measuredServiceOpens.add(service.serviceId);
			recordAnalyticsEvent('numbers_service_open', `/numbers/service/${service.serviceId}`);
		}
		await tick();
		document
			.getElementById(`numbers-service-${service.serviceId}`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// "Notify me" for an out-of-stock number — records a restock subscription (fires once).
	async function notifyMe(tierId: string, label: string) {
		notifyingTierId = tierId;
		try {
			const res = await fetch('/api/restock-subscriptions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tierId })
			});
			if (res.status === 401) {
				showWarning('Log in first', 'Sign in and we’ll alert you the moment this number is back.');
				return;
			}
			const j = await res.json();
			if (j.success) {
				notifiedTiers.add(tierId);
				showSuccess('You’re on the list', `We’ll alert you when ${label} is back in stock.`);
			} else {
				showError('Could not set the alert', j.error || 'Please try again.');
			}
		} catch {
			showError('Could not set the alert', 'Please try again.');
		} finally {
			notifyingTierId = null;
		}
	}

	function toggle(id: number) {
		const opening = openId !== id;
		openId = opening ? id : null;
		if (opening && !measuredServiceOpens.has(id)) {
			measuredServiceOpens.add(id);
			recordAnalyticsEvent('numbers_service_open', `/numbers/service/${id}`);
		}
	}

	// Expectation-setting FAQ — factual and calm, kept below the buy flow (see markup).
	const faqs = [
		{
			q: 'What exactly do I get?',
			a: 'One phone number that receives a single verification code, once. When the code arrives (or the short window passes) the order is complete — grab a fresh number anytime you need another.'
		},
		{
			q: 'What if no code arrives?',
			a: "You're refunded automatically to your store credit. No code, no charge — so it's safe to try."
		},
		{
			q: 'Will WhatsApp (or another app) keep my account long-term?',
			a: 'These are shared, disposable numbers — perfect for receiving a one-time code, not for anchoring an account you plan to keep. Because the SIM has been used before, some platforms (WhatsApp especially) may later restrict an account registered on it. For a permanent account, register with a SIM you personally own.'
		},
		{
			q: 'Can I reuse the number?',
			a: 'No — one code per number by design. It’s single-use; buy another whenever you need a fresh verification.'
		}
	];

	function availableTiers(tiers: PageData['services'][number]['tiers']) {
		return tiers.filter((t) => t.available);
	}
	function cheapest(tiers: PageData['services'][number]['tiers']): number {
		const live = availableTiers(tiers);
		return live.length ? Math.min(...live.map((t) => t.priceNgn)) : 0;
	}

	async function buy(tierId: string, label: string) {
		buyingTierId = tierId;
		try {
			const compat = await cart.ensureDeliveryModeCompatibility(tierId, 'auto_sms');
			if (!compat.compatible) {
				showWarning(
					'Numbers check out on their own',
					'Your cart has other item types. Finish that order (or empty your cart) first, then grab your number.'
				);
				return;
			}
			// One number per order, by construction: reset the cart to exactly this number
			// (clears any leftover), then go straight to checkout — no accumulation possible.
			cart.clear();
			cart.addTier(tierId, 1);
			void label;
			goto('/checkout');
		} finally {
			buyingTierId = null;
		}
	}
</script>

<svelte:head>
	<title>Verification Numbers | FastAccs</title>
	<meta
		name="description"
		content="Choose a verification service and country, then receive your code on FastAccs."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen py-10" style="background: var(--bg); color: var(--text);">
	<div class="mx-auto max-w-3xl px-4">
		<!-- Hero -->
		<div class="mb-8 text-center">
			<div
				class="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
				style="background: rgba(14,165,233,0.20); color: #38bdf8;"
			>
				One number · one code
			</div>
			<h1 class="text-3xl font-bold sm:text-4xl" style="color: var(--text);">
				Verification Numbers
			</h1>
			<p class="mx-auto mt-2 max-w-md" style="color: var(--text-muted);">
				Choose an app and country. Your code appears here.
			</p>
		</div>

		{#if data.catalogueUnavailable}
			<div class="py-16 text-center" style="color: var(--text-dim);">
				<RefreshCw class="mx-auto mb-3 h-10 w-10 opacity-40" />
				<p>Numbers are temporarily unavailable.</p>
				<button type="button" onclick={() => location.reload()} class="btn-fa btn-fa--numbers mt-4">
					Try again
				</button>
			</div>
		{:else if data.services.length === 0}
			<div class="py-16 text-center" style="color: var(--text-dim);">
				<Phone class="mx-auto mb-3 h-10 w-10 opacity-40" />
				<p>Numbers are coming soon. Check back shortly.</p>
			</div>
		{:else}
			<label
				class="mb-4 flex items-center gap-2 rounded-xl px-4 py-3"
				style="border: 1px solid var(--border); background: var(--surface);"
			>
				<Search class="h-4 w-4 shrink-0" style="color: var(--text-dim);" />
				<input
					bind:value={serviceQuery}
					type="search"
					aria-label="Search services"
					class="w-full bg-transparent text-sm outline-none"
					style="color: var(--text);"
				/>
			</label>
			<div class="space-y-3">
				{#each visibleServices as service (service.serviceId)}
					{@const isOpen = openId === service.serviceId}
					<div
						id={`numbers-service-${service.serviceId}`}
						class="overflow-hidden rounded-2xl transition-shadow"
						style="border: 1px solid {isOpen
							? '#0ea5e9'
							: 'var(--border)'}; background: var(--surface);"
					>
						<!-- Service header (accordion trigger) -->
						<button
							type="button"
							onclick={() => toggle(service.serviceId)}
							class="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors sm:px-5"
							style="background: {isOpen ? 'var(--bg-elev-1)' : 'transparent'};"
						>
							<span
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
								style="background: var(--bg-elev-2);"
							>
								<BrandIcon service={service.serviceName} size={26} />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block font-semibold" style="color: var(--text);">
									{service.serviceName}
								</span>
								<span class="block text-xs" style="color: var(--text-muted);">
									{#if availableTiers(service.tiers).length > 0}
										{availableTiers(service.tiers).length}
										{availableTiers(service.tiers).length === 1 ? 'country' : 'countries'} · from ₦{cheapest(
											service.tiers
										).toLocaleString()}
									{:else}
										Currently unavailable · back soon
									{/if}
								</span>
							</span>
							<ChevronDown
								class="h-5 w-5 shrink-0 transition-transform duration-200 {isOpen
									? 'rotate-180'
									: ''}"
								style="color: var(--text-muted);"
							/>
						</button>

						<!-- Countries -->
						{#if isOpen}
							<ul transition:slide={{ duration: 220 }}>
								{#each service.tiers as tier (tier.tierId)}
									<li
										class="flex items-center justify-between px-4 py-3 sm:px-5"
										style="border-top: 1px solid var(--border); opacity: {tier.available
											? 1
											: 0.55};"
									>
										<span class="flex min-w-0 items-center gap-2.5">
											<span class="shrink-0 text-xl">{codeToFlag(tier.countryCode)}</span>
											<span class="truncate" style="color: var(--text);">{tier.countryName}</span>
										</span>
										{#if tier.available}
											<span class="flex shrink-0 items-center gap-3 pl-3">
												<span class="font-semibold tabular-nums" style="color: var(--text);">
													₦{tier.priceNgn.toLocaleString()}
												</span>
												<button
													onclick={() =>
														buy(tier.tierId, `${service.serviceName} — ${tier.countryName}`)}
													disabled={buyingTierId === tier.tierId}
													class="rounded-lg px-4 py-1.5 text-sm font-semibold transition-transform hover:brightness-110 active:scale-95 disabled:opacity-60"
													style="background: #0ea5e9; color: #ffffff;"
												>
													{buyingTierId === tier.tierId ? '…' : 'Buy'}
												</button>
											</span>
										{:else}
											<span class="flex shrink-0 items-center gap-2 pl-3">
												<span
													class="text-xs font-medium whitespace-nowrap"
													style="color: var(--text-dim);"
												>
													Unavailable
												</span>
												{#if notifiedTiers.has(tier.tierId)}
													<span
														class="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap"
														style="background: rgba(52,211,153,0.14); color: #34d399;"
													>
														<Check class="h-3.5 w-3.5" /> We’ll alert you
													</span>
												{:else}
													<button
														onclick={() =>
															notifyMe(tier.tierId, `${service.serviceName} — ${tier.countryName}`)}
														disabled={notifyingTierId === tier.tierId}
														class="notify-glow inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-transform hover:brightness-110 active:scale-95 disabled:opacity-60"
														style="border: 1px solid #38bdf8; color: #7dd3fc; background: rgba(14,165,233,0.18);"
													>
														<BellRing class="h-3.5 w-3.5" />
														{notifyingTierId === tier.tierId ? '…' : 'Notify me'}
													</button>
												{/if}
											</span>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/each}
				{#if visibleServices.length === 0}
					<div
						class="rounded-xl p-8 text-center text-sm"
						style="border: 1px solid var(--border); color: var(--text-muted);"
					>
						No matching service is available right now.
					</div>
				{/if}
			</div>

			<p class="mt-6 text-center text-xs" style="color: var(--text-dim);">
				Numbers are single-use for one verification. Prices in Naira, all-inclusive.
			</p>
		{/if}

		<!-- Below-the-fold FAQ: sets expectations (incl. reused-SIM / later-ban risk) calmly, out of
		     the buy flow. Native <details> so it's quiet until a curious buyer opens it. -->
		<section class="mt-14 border-t pt-8" style="border-color: var(--border);">
			<h2 class="mb-4 text-lg font-semibold" style="color: var(--text);">Good to know</h2>
			<div class="space-y-2">
				{#each faqs as faq (faq.q)}
					<details
						class="group rounded-xl px-4 py-3"
						style="background: var(--surface, rgba(255,255,255,0.03));"
					>
						<summary
							class="flex cursor-pointer list-none items-center justify-between text-sm font-medium select-none"
							style="color: var(--text);"
						>
							{faq.q}
							<ChevronDown
								class="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
								style="color: var(--text-dim);"
							/>
						</summary>
						<p class="mt-2.5 text-sm leading-relaxed" style="color: var(--text-muted);">{faq.a}</p>
					</details>
				{/each}
			</div>
			<p class="mt-4 text-xs" style="color: var(--text-dim);">
				Full details in our <a href="/terms" class="hover:underline" style="color: var(--link);"
					>Terms</a
				>.
			</p>
		</section>
	</div>
</main>

<Footer />

<style>
	/* Soft pulsing glow so the "Notify me" restock button reads as live, not muted. */
	.notify-glow {
		box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.5);
		animation: notify-pulse 2.4s ease-in-out infinite;
	}
	.notify-glow:hover {
		animation-play-state: paused;
		box-shadow: 0 0 14px 2px rgba(56, 189, 248, 0.55);
	}
	@keyframes notify-pulse {
		0%,
		100% {
			box-shadow: 0 0 6px 0 rgba(56, 189, 248, 0.35);
		}
		50% {
			box-shadow: 0 0 14px 3px rgba(56, 189, 248, 0.6);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.notify-glow {
			animation: none;
			box-shadow: 0 0 10px 1px rgba(56, 189, 248, 0.45);
		}
	}
</style>
