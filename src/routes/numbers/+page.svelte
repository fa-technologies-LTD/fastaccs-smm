<script lang="ts">
	import { cart } from '$lib/stores/cart.svelte';
	import { showSuccess } from '$lib/stores/toasts';
	import { Phone, Zap, ShieldCheck, RefreshCw } from '$lib/icons';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const COUNTRY_FLAGS: Record<string, string> = {
		USA: '🇺🇸',
		'United Kingdom': '🇬🇧',
		Canada: '🇨🇦',
		Poland: '🇵🇱',
		Indonesia: '🇮🇩',
		Malaysia: '🇲🇾'
	};
	const SERVICE_EMOJI: Record<string, string> = {
		WhatsApp: '💬',
		Telegram: '✈️',
		'Google / Gmail': '📧',
		Instagram: '📸',
		Facebook: '👍'
	};

	function buy(tierId: string, label: string) {
		cart.addTier(tierId, 1);
		showSuccess('Added to cart', `${label} — click to checkout.`, 6000, '/checkout');
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
	<div class="max-w-5xl mx-auto px-4">
		<div class="text-center mb-8">
			<div class="inline-flex items-center gap-2 mb-2" style="color: var(--fa-lime-400);">
				<Phone class="w-6 h-6" />
				<h1 class="text-3xl font-bold" style="color: var(--text);">Verification Numbers</h1>
			</div>
			<p class="max-w-xl mx-auto" style="color: var(--text-muted);">
				Get a phone number and receive your one-time code in seconds. No account to manage —
				buy, receive your OTP, done.
			</p>
			<div class="flex items-center justify-center gap-6 mt-4 text-sm" style="color: var(--text-muted);">
				<span class="inline-flex items-center gap-1"><Zap class="w-4 h-4" style="color:#fbbf24;" /> Instant</span>
				<span class="inline-flex items-center gap-1"><ShieldCheck class="w-4 h-4" style="color:#34d399;" /> No-code refund</span>
				<span class="inline-flex items-center gap-1"><RefreshCw class="w-4 h-4" style="color: var(--fa-lime-400);" /> One OTP per number</span>
			</div>
		</div>

		{#if data.services.length === 0}
			<div class="text-center py-16" style="color: var(--text-dim);">
				<Phone class="w-10 h-10 mx-auto mb-3 opacity-40" />
				<p>Numbers are coming soon. Check back shortly.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				{#each data.services as service (service.serviceId)}
					<div class="rounded-2xl overflow-hidden" style="border: 1px solid var(--border); background: var(--surface);">
						<div
							class="flex items-center gap-3 px-5 py-4"
							style="border-bottom: 1px solid var(--border); background: var(--bg-elev-1);"
						>
							<span class="text-2xl">{SERVICE_EMOJI[service.serviceName] ?? '📱'}</span>
							<h2 class="font-semibold text-lg" style="color: var(--text);">{service.serviceName}</h2>
						</div>
						<ul>
							{#each service.tiers as tier (tier.tierId)}
								<li
									class="flex items-center justify-between px-5 py-3"
									style="border-top: 1px solid var(--border);"
								>
									<span class="flex items-center gap-2">
										<span class="text-xl">{COUNTRY_FLAGS[tier.countryName] ?? '🌍'}</span>
										<span style="color: var(--text);">{tier.countryName}</span>
									</span>
									<span class="flex items-center gap-3">
										<span class="font-semibold" style="color: var(--text);">₦{tier.priceNgn.toLocaleString()}</span>
										<button
											onclick={() => buy(tier.tierId, `${service.serviceName} — ${tier.countryName}`)}
											class="px-4 py-1.5 text-sm rounded-lg font-medium"
											style="background: var(--fa-lime-700); color: #0a0a0a;"
										>
											Buy
										</button>
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</main>

<Footer />
