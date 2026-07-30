<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { cart } from '$lib/stores/cart.svelte';
	import { showSuccess, showWarning } from '$lib/stores/toasts';
	import { Zap, ShieldCheck, RefreshCw, ChevronDown, Phone } from '$lib/icons';
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

	function toggle(id: number) {
		openId = openId === id ? null : id;
	}

	function cheapest(tiers: PageData['services'][number]['tiers']): number {
		return Math.min(...tiers.map((t) => t.priceNgn));
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
			cart.addTier(tierId, 1);
			showSuccess('Added to cart', `${label} — tap to check out.`, 6000, '/checkout');
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
				style="background: color-mix(in srgb, var(--fa-lime-700) 22%, transparent); color: var(--fa-lime-400);"
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
				<span class="inline-flex items-center gap-1.5"><RefreshCw class="w-4 h-4" style="color: var(--fa-lime-400);" /> Auto-delivered</span>
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
						style="border: 1px solid {isOpen ? 'var(--fa-lime-700)' : 'var(--border)'}; background: var(--surface);"
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
									{service.tiers.length}
									{service.tiers.length === 1 ? 'country' : 'countries'} · from ₦{cheapest(service.tiers).toLocaleString()}
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
										style="border-top: 1px solid var(--border);"
									>
										<span class="flex items-center gap-2.5">
											<span class="text-xl">{codeToFlag(tier.countryCode)}</span>
											<span style="color: var(--text);">{tier.countryName}</span>
										</span>
										<span class="flex items-center gap-3">
											<span class="font-semibold tabular-nums" style="color: var(--text);">
												₦{tier.priceNgn.toLocaleString()}
											</span>
											<button
												onclick={() => buy(tier.tierId, `${service.serviceName} — ${tier.countryName}`)}
												disabled={buyingTierId === tier.tierId}
												class="px-4 py-1.5 text-sm rounded-lg font-semibold transition-transform active:scale-95 hover:brightness-110 disabled:opacity-60"
												style="background: var(--fa-lime-700); color: #0a0a0a;"
											>
												{buyingTierId === tier.tierId ? '…' : 'Buy'}
											</button>
										</span>
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
