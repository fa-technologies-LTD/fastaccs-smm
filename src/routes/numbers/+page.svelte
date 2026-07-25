<script lang="ts">
	import { cart } from '$lib/stores/cart.svelte';
	import { showSuccess } from '$lib/stores/toasts';
	import { Phone, Zap, ShieldCheck, RefreshCw } from '$lib/icons';
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

<div class="max-w-5xl mx-auto px-4 py-8">
	<div class="text-center mb-8">
		<div class="inline-flex items-center gap-2 text-sky-600 mb-2">
			<Phone class="w-6 h-6" />
			<h1 class="text-3xl font-bold">Verification Numbers</h1>
		</div>
		<p class="text-gray-500 max-w-xl mx-auto">
			Get a phone number and receive your one-time code in seconds. No account to manage —
			buy, receive your OTP, done.
		</p>
		<div class="flex items-center justify-center gap-6 mt-4 text-sm text-gray-500">
			<span class="inline-flex items-center gap-1"><Zap class="w-4 h-4 text-amber-500" /> Instant</span>
			<span class="inline-flex items-center gap-1"><ShieldCheck class="w-4 h-4 text-emerald-500" /> No-code refund</span>
			<span class="inline-flex items-center gap-1"><RefreshCw class="w-4 h-4 text-sky-500" /> One OTP per number</span>
		</div>
	</div>

	{#if data.services.length === 0}
		<div class="text-center py-16 text-gray-400">
			<Phone class="w-10 h-10 mx-auto mb-3 opacity-40" />
			<p>Numbers are coming soon. Check back shortly.</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			{#each data.services as service (service.serviceId)}
				<div class="rounded-2xl border border-gray-200 bg-white overflow-hidden">
					<div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
						<span class="text-2xl">{SERVICE_EMOJI[service.serviceName] ?? '📱'}</span>
						<h2 class="font-semibold text-lg">{service.serviceName}</h2>
					</div>
					<ul class="divide-y divide-gray-100">
						{#each service.tiers as tier (tier.tierId)}
							<li class="flex items-center justify-between px-5 py-3">
								<span class="flex items-center gap-2">
									<span class="text-xl">{COUNTRY_FLAGS[tier.countryName] ?? '🌍'}</span>
									<span class="text-gray-700">{tier.countryName}</span>
								</span>
								<span class="flex items-center gap-3">
									<span class="font-semibold">₦{tier.priceNgn.toLocaleString()}</span>
									<button
										onclick={() => buy(tier.tierId, `${service.serviceName} — ${tier.countryName}`)}
										class="px-4 py-1.5 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700"
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
