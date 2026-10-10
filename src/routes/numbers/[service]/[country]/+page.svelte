<script lang="ts">
	import { onMount } from 'svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import SeoFaq from '$lib/components/SeoFaq.svelte';
	import JsonLd from '$lib/components/JsonLd.svelte';
	import { codeToFlag } from '$lib/helpers/numbers-slugs';
	import { formatPrice } from '$lib/helpers/utils';
	import { buyNumber } from '$lib/services/numbers-buy';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let buying = $state(false);

	// Checkout's "continue shopping" returns here on an empty cart, like /numbers.
	onMount(() => {
		try {
			sessionStorage.setItem('shopReturn', window.location.pathname);
		} catch {
			/* ignore */
		}
	});

	async function buy(): Promise<void> {
		if (buying || !data.tier.available) return;
		buying = true;
		try {
			await buyNumber({
				tierId: data.tier.tierId,
				serviceId: data.service.serviceId,
				serviceName: data.service.serviceName,
				countryName: data.tier.countryName,
				priceNgn: data.tier.priceNgn
			});
		} finally {
			buying = false;
		}
	}

	const steps = $derived([
		`Pay ${formatPrice(data.tier.priceNgn)} in naira. One number, one code.`,
		`Your ${data.country} number appears on your order page. Enter it in ${data.service.serviceName}.`,
		'Request the code in the app. It shows up on your order page.'
	]);
</script>

<svelte:head>
	<title>{data.seo.title}</title>
	<meta name="description" content={data.seo.description} />
</svelte:head>

<JsonLd data={data.product} />

<Navigation />

<main class="min-h-screen py-8 sm:py-10" style="background: var(--bg); color: var(--text);">
	<div class="mx-auto max-w-3xl px-4">
		<nav class="mb-5 text-xs" style="color: var(--text-muted);" aria-label="Breadcrumb">
			<a href="/numbers" style="color: var(--brand-blue);">Verification numbers</a>
			<span class="px-1">/</span>
			<a
				href={`/numbers?service=${encodeURIComponent(data.service.serviceName)}`}
				style="color: var(--brand-blue);">{data.service.serviceName}</a
			>
			<span class="px-1">/</span>
			<span>{data.country}</span>
		</nav>

		<section
			class="rounded-2xl p-5 sm:p-7"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<div class="flex items-start gap-3">
				<span class="text-4xl leading-none" aria-hidden="true"
					>{codeToFlag(data.tier.countryCode)}</span
				>
				<div class="min-w-0">
					<h1 class="text-2xl font-bold sm:text-3xl" style="color: var(--text);">
						{data.country} number for {data.service.serviceName} verification
					</h1>
					<p class="mt-1 text-sm" style="color: var(--text-muted);">
						One number, one code. No code, no charge: refunded automatically to your store credit.
					</p>
				</div>
			</div>

			<div class="mt-5 flex flex-wrap items-center justify-between gap-3">
				<div>
					<p class="text-3xl font-bold tabular-nums" style="color: var(--text);">
						{formatPrice(data.tier.priceNgn)}
					</p>
					<p
						class="text-xs font-semibold"
						style={data.tier.available
							? 'color: var(--status-success);'
							: 'color: var(--text-dim);'}
					>
						{data.tier.available ? 'Available now' : 'Temporarily unavailable'}
					</p>
				</div>
				{#if data.tier.available}
					<button
						type="button"
						onclick={buy}
						disabled={buying}
						class="rounded-xl px-7 py-3 text-base font-semibold transition-transform hover:brightness-110 active:scale-95 disabled:opacity-60"
						style="background: #0ea5e9; color: #ffffff;"
					>
						{buying ? 'Starting checkout…' : `Buy ${data.country} number`}
					</button>
				{:else}
					<a
						href="#other-countries"
						class="rounded-xl px-5 py-3 text-sm font-semibold"
						style="border: 1px solid var(--border); color: var(--text);"
					>
						See other countries
					</a>
				{/if}
			</div>
		</section>

		<section class="mt-6">
			<h2 class="mb-3 text-lg font-bold" style="color: var(--text);">How it works</h2>
			<ol class="space-y-2">
				{#each steps as step, index (index)}
					<li
						class="flex gap-3 rounded-xl p-3 text-sm"
						style="background: var(--bg-elev-1); border: 1px solid var(--border); color: var(--text);"
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
							style="background: rgba(14,165,233,0.20); color: #38bdf8;">{index + 1}</span
						>
						<span>{step}</span>
					</li>
				{/each}
			</ol>
		</section>

		{#if data.otherCountries.length > 0}
			<section id="other-countries" class="mt-8">
				<h2 class="mb-3 text-lg font-bold" style="color: var(--text);">
					Other countries for {data.service.serviceName}
				</h2>
				<ul class="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{#each data.otherCountries as option (option.path)}
						<li>
							<a
								href={option.path}
								class="flex items-center justify-between rounded-xl px-4 py-3 text-sm"
								style="background: var(--bg-elev-1); border: 1px solid var(--border); color: var(--text); opacity: {option.available
									? 1
									: 0.55};"
							>
								<span class="flex items-center gap-2">
									<span aria-hidden="true">{codeToFlag(option.countryCode)}</span>
									{option.label}
								</span>
								<span class="font-semibold tabular-nums">{formatPrice(option.priceNgn)}</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if data.otherApps.length > 0}
			<section class="mt-8">
				<h2 class="mb-3 text-lg font-bold" style="color: var(--text);">
					Other apps with {data.country} numbers
				</h2>
				<div class="flex flex-wrap gap-2">
					{#each data.otherApps as app (app.path)}
						<a
							href={app.path}
							class="rounded-full px-3 py-1.5 text-xs font-semibold"
							style="border: 1px solid var(--border); color: var(--text);"
						>
							{app.label} · {formatPrice(app.priceNgn)}
						</a>
					{/each}
				</div>
			</section>
		{/if}
	</div>

	<div class="mt-10">
		<SeoFaq heading="Questions about verification numbers" items={data.faq} />
	</div>
</main>

<Footer />
