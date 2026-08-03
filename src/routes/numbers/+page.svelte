<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { cart } from '$lib/stores/cart.svelte';
	import { showWarning, showSuccess, showError } from '$lib/stores/toasts';
	import { Zap, ShieldCheck, RefreshCw, ChevronDown, Phone, BellRing, Check } from '$lib/icons';
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
	});

	// Accordion: first service open by default; the rest collapsed.
	let openId = $state<number | null>(data.services[0]?.serviceId ?? null);
	let buyingTierId = $state<string | null>(null);
	let notifyingTierId = $state<string | null>(null);
	let notifiedTiers = $state<Set<string>>(new Set());

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
				notifiedTiers = new Set(notifiedTiers).add(tierId);
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
		openId = openId === id ? null : id;
	}

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
	<title>Verification Numbers — Instant OTP | FastAccs</title>
	<meta
		name="description"
		content="Buy an instant phone number and receive your one-time verification code in seconds."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen py-10" style="background: var(--bg); color: var(--text);">
	<div class="max-w-3xl mx-auto px-4">
		<!-- Hero -->
		<div class="text-center mb-8">
			<div
				class="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs font-semibold"
				style="background: rgba(14,165,233,0.20); color: #38bdf8;"
			>
				<Zap class="w-3.5 h-3.5" /> Instant OTP · one code per number
			</div>
			<h1 class="text-3xl sm:text-4xl font-bold" style="color: var(--text);">Verification Numbers</h1>
			<p class="max-w-md mx-auto mt-2" style="color: var(--text-muted);">
				Pick a service, grab a number, get your code in seconds. No code arrives? Instant refund.
			</p>
			<div class="flex items-center justify-center gap-5 mt-4 text-sm" style="color: var(--text-muted);">
				<span class="inline-flex items-center gap-1.5"><Zap class="w-4 h-4" style="color:#fbbf24;" /> Instant</span>
				<span class="inline-flex items-center gap-1.5"><ShieldCheck class="w-4 h-4" style="color:#34d399;" /> No-code refund</span>
				<span class="inline-flex items-center gap-1.5"><RefreshCw class="w-4 h-4" style="color: #38bdf8;" /> Auto-delivered</span>
			</div>
		</div>

		{#if data.services.length === 0}
			<div class="text-center py-16" style="color: var(--text-dim);">
				<Phone class="w-10 h-10 mx-auto mb-3 opacity-40" />
				<p>Numbers are coming soon. Check back shortly.</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each data.services as service (service.serviceId)}
					{@const isOpen = openId === service.serviceId}
					<div
						class="rounded-2xl overflow-hidden transition-shadow"
						style="border: 1px solid {isOpen ? '#0ea5e9' : 'var(--border)'}; background: var(--surface);"
					>
						<!-- Service header (accordion trigger) -->
						<button
							type="button"
							onclick={() => toggle(service.serviceId)}
							class="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left transition-colors"
							style="background: {isOpen ? 'var(--bg-elev-1)' : 'transparent'};"
						>
							<span
								class="flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
								style="background: var(--bg-elev-2);"
							>
								<BrandIcon service={service.serviceName} size={26} />
							</span>
							<span class="flex-1 min-w-0">
								<span class="block font-semibold" style="color: var(--text);">{service.serviceName}</span>
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
								class="w-5 h-5 shrink-0 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
								style="color: var(--text-muted);"
							/>
						</button>

						<!-- Countries -->
						{#if isOpen}
							<ul transition:slide={{ duration: 220 }}>
								{#each service.tiers as tier (tier.tierId)}
									<li
										class="flex items-center justify-between px-4 sm:px-5 py-3"
										style="border-top: 1px solid var(--border); opacity: {tier.available ? 1 : 0.55};"
									>
										<span class="flex items-center gap-2.5 min-w-0">
											<span class="text-xl shrink-0">{codeToFlag(tier.countryCode)}</span>
											<span class="truncate" style="color: var(--text);">{tier.countryName}</span>
										</span>
										{#if tier.available}
											<span class="flex items-center gap-3 shrink-0 pl-3">
												<span class="font-semibold tabular-nums" style="color: var(--text);">
													₦{tier.priceNgn.toLocaleString()}
												</span>
												<button
													onclick={() => buy(tier.tierId, `${service.serviceName} — ${tier.countryName}`)}
													disabled={buyingTierId === tier.tierId}
													class="px-4 py-1.5 text-sm rounded-lg font-semibold transition-transform active:scale-95 hover:brightness-110 disabled:opacity-60"
													style="background: #0ea5e9; color: #ffffff;"
												>
													{buyingTierId === tier.tierId ? '…' : 'Buy'}
												</button>
											</span>
										{:else}
											<span class="flex items-center gap-2 shrink-0 pl-3">
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
														<Check class="w-3.5 h-3.5" /> We’ll alert you
													</span>
												{:else}
													<button
														onclick={() =>
															notifyMe(tier.tierId, `${service.serviceName} — ${tier.countryName}`)}
														disabled={notifyingTierId === tier.tierId}
														class="notify-glow inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-transform active:scale-95 hover:brightness-110 disabled:opacity-60"
														style="border: 1px solid #38bdf8; color: #7dd3fc; background: rgba(14,165,233,0.18);"
													>
														<BellRing class="w-3.5 h-3.5" />
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
			</div>

			<p class="text-center text-xs mt-6" style="color: var(--text-dim);">
				Numbers are single-use for one verification. Prices in Naira, all-inclusive.
			</p>
		{/if}
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
