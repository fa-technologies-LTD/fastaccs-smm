<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';
	import { hasAnalyticsConsent } from '$lib/helpers/privacyConsent';

	onMount(() => {
		if (hasAnalyticsConsent()) {
			window.gtag?.('event', 'page_view', { page_path: '/refund-policy' });
		}
	});
</script>

<svelte:head>
	<title>Refund Policy - FastAccs</title>
	<meta name="description" content="Refund policy for FastAccs orders and issue resolution." />
</svelte:head>

<Navigation />

<main style="background: var(--bg);">
	<div class="mx-auto max-w-4xl px-6 py-16 md:py-24">
		<div class="mb-10 border-b pb-6" style="border-color: var(--border);">
			<h1 class="mb-3 text-4xl font-bold md:text-5xl" style="color: var(--text); font-family: var(--font-head);">
				Refund Policy
			</h1>
			<p style="color: var(--text-muted);">
				Effective date: April 8, 2026
			</p>
		</div>

		<div class="space-y-7" style="color: var(--text-muted);">
			<section>
				<p>
					We keep dispute handling practical and fair. If an issue occurs, contact support quickly so we can
					verify records and resolve it fast.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Issue Reporting Window</h2>
				<p>
					For the fastest review, report login or delivery issues as soon as possible after delivery, ideally
					within 2 hours of purchase.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Typical Cases We Review for Refund or Replacement</h2>
				<ul class="ml-6 list-disc space-y-1">
					<li>Material mismatch between purchased item description and delivered item.</li>
					<li>Delivery or access failure traceable to our fulfillment process.</li>
					<li>Order integrity problems confirmed by our records and evidence review.</li>
				</ul>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Cases Typically Not Eligible</h2>
				<ul class="ml-6 list-disc space-y-1">
					<li>Issues caused by policy violations, abuse, or prohibited usage.</li>
					<li>Device, network, VPN, or third-party actions outside our operational control.</li>
					<li>Claims submitted too late to reasonably validate order-state evidence.</li>
				</ul>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Evidence Requirements</h2>
				<p>
					We may request screenshots, screen recordings, timestamps, and related order details to evaluate claims
					accurately. Incomplete records can delay or limit resolution options.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Resolution Format</h2>
				<p>
					Where a claim is approved, resolution may be provided as replacement, order adjustment, or refund,
					depending on verified facts and available inventory.
				</p>
			</section>

			<section>
				<h2 class="mb-2 text-2xl font-semibold" style="color: var(--text); font-family: var(--font-head);">Support Channels</h2>
				<p>
					WhatsApp:
					<a href="https://wa.link/fast_accounts" target="_blank" rel="noopener noreferrer" class="hover:underline" style="color: var(--link);">wa.link/fast_accounts</a>
					<br />
					Email:
					<a href="mailto:verystronethan@gmail.com" class="hover:underline" style="color: var(--link);">verystronethan@gmail.com</a>
				</p>
			</section>
		</div>
	</div>
</main>

<Footer />
